import sqlite3 from 'sqlite3';
import path from 'path';
import fs from 'fs';
import bcrypt from 'bcryptjs';

import { resolveDbEngine, type DbEngine, type ResolvedDbEngine } from './db/engine.js';
import { closePgPool, getPgPool, sanitizePgError } from './db/pg_pool.js';
import type { Pool } from 'pg';
import {
  attachPgPool,
  attachPgSystemPool,
  pgExecQuery,
  pgRunQuery,
  pgGetQuery,
  pgAllQuery,
  pgWithTransaction,
} from './db/postgres.js';
import { runPostgresMigrations } from './db/postgres_migrations.js';

// ---------------------------------------------------------------------------
// Engine selection — resolved ONCE per process (see db/engine.ts):
//   PRODUCTION / STAGING : DATABASE_URL (PostgreSQL) is mandatory; startup
//                          fails without it — no silent SQLite fallback.
//   DEVELOPMENT / DEMO / TEST : SQLite, exactly as before this refactor.
//   DB_ENGINE=postgres   : explicit opt-in to run dev against PostgreSQL.
// Every exported helper below keeps its original signature; the driver
// beneath dispatches on `engine`, so all 39 importing files are unchanged.
// ---------------------------------------------------------------------------
// Test runs are SQLite-by-design: the suite writes SQLite-specific fixtures
// (INSERT OR REPLACE etc.) into an isolated file. Detect the test entry point
// FIRST and PIN the engine to SQLite before anything dispatches on it —
// ambient DB_ENGINE/DATABASE_URL are ignored for test entry points. This
// matters because the runtime .env now opts every non-test launch into
// PostgreSQL (DB_ENGINE=postgres): all app storage is PostgreSQL, while
// `npm test` keeps using finpocket.test.sqlite and can never touch PG.
const entryPoint = process.argv[1] ?? '';
const isTestRun = entryPoint.includes(`${path.sep}tests${path.sep}`);

export const resolvedEngine: ResolvedDbEngine = isTestRun
  ? { engine: 'sqlite', reason: 'test entry point: isolated SQLite fixture DB (finpocket.test.sqlite)' }
  : resolveDbEngine();
export const engine: DbEngine = resolvedEngine.engine;

// Tests must never share the development database. Every `npm test` run used to
// `initDatabase()` against data/finpocket.sqlite and leave behind fixture users,
// bank accounts and transactions — which the running app then displayed as real
// balances (the dev database had grown to 491 users / 695 accounts / 968 txns,
// and `GET /accounts` returned ₹20.8L for a wallet seeded with ₹57,980).
const dbName =
  process.env.FINPOCKET_DB_NAME ??
  (isTestRun ? 'finpocket.test.sqlite' : 'finpocket.sqlite');

const dbPath = path.join(path.resolve(process.cwd(), 'data'), dbName);

// Belt-and-braces: the engine above is pinned to SQLite for test entry
// points; this assertion fails the run loudly if that invariant is ever
// broken by a future refactor.
if (isTestRun && engine !== 'sqlite') {
  throw new Error(
    "[FATAL] The test suite must run on SQLite (finpocket.test.sqlite); " +
    'DB_ENGINE=postgres is not supported for tests.'
  );
}

if (engine === 'sqlite' && !fs.existsSync(path.dirname(dbPath))) {
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
}

if (isTestRun) {
  console.log(`[Database] Test run -> ${dbPath} (development data untouched)`);
}

// In PostgreSQL mode there is no SQLite handle; tests never run in that mode,
// so the exported `db` is only ever dereferenced with a live handle.
export const db = (engine === 'sqlite' ? new sqlite3.Database(dbPath) : null) as unknown as sqlite3.Database;

export function execQuery(sql: string): Promise<void> {
  if (engine === 'postgres') return pgExecQuery(sql);
  return new Promise((resolve, reject) => {
    db.exec(sql, function (err) {
      if (err) reject(err);
      else resolve();
    });
  });
}

export function runQuery(sql: string, params: any[] = []): Promise<sqlite3.RunResult> {
  if (engine === 'postgres') {
    // Parity mapping: changes = rowCount; lastID stays undefined (no caller in
    // src reads lastID — verified during the Phase A audit).
    return pgRunQuery(sql, params) as unknown as Promise<sqlite3.RunResult>;
  }
  return new Promise((resolve, reject) => {
    db.run(sql, params, function (err) {
      if (err) reject(err);
      else resolve(this);
    });
  });
}

export function getQuery<T = any>(sql: string, params: any[] = []): Promise<T | undefined> {
  if (engine === 'postgres') return pgGetQuery<T>(sql, params);
  return new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => {
      if (err) reject(err);
      else resolve(row as T);
    });
  });
}

export function allQuery<T = any>(sql: string, params: any[] = []): Promise<T[]> {
  if (engine === 'postgres') return pgAllQuery<T>(sql, params);
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) reject(err);
      else resolve(rows as T[]);
    });
  });
}

// Mutex to serialize SQLite transactions on single connection
class AsyncMutex {
  private queue: (() => void)[] = [];
  private locked = false;

  async acquire(): Promise<() => void> {
    if (this.locked) {
      await new Promise<void>(resolve => this.queue.push(resolve));
    }
    this.locked = true;
    let released = false;
    return () => {
      if (released) return;
      released = true;
      if (this.queue.length > 0) {
        const next = this.queue.shift()!;
        next();
      } else {
        this.locked = false;
      }
    };
  }
}

const txMutex = new AsyncMutex();

// Reusable Database Transaction Helper with Immediate Locking & Serialized Mutex
export async function withTransaction<T>(operation: () => Promise<T>): Promise<T> {
  if (engine === 'postgres') {
    // Pins ONE client via AsyncLocalStorage so every query issued inside
    // `operation` participates in the same BEGIN/COMMIT (nested calls become
    // SAVEPOINTs). See db/postgres.ts.
    return pgWithTransaction(operation);
  }
  const release = await txMutex.acquire();
  try {
    await runQuery('BEGIN IMMEDIATE TRANSACTION');
    try {
      const result = await operation();
      await runQuery('COMMIT');
      return result;
    } catch (error) {
      try {
        await runQuery('ROLLBACK');
      } catch (rollbackErr) {
        console.error('[Database] Rollback failed:', rollbackErr);
      }
      throw error;
    }
  } finally {
    release();
  }
}

export async function initDatabase() {
  if (engine === 'postgres') {
    await initPostgresDatabase();
    return;
  }

  // 1. Enforce Foreign Keys
  await execQuery('PRAGMA foreign_keys = ON;');

  // 2. Initialize Core Relational Tables
  await execQuery(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      email TEXT UNIQUE NOT NULL,
      phone TEXT,
      password_hash TEXT NOT NULL,
      preferred_currency TEXT DEFAULT 'INR',
      preferred_language TEXT DEFAULT 'en',
      monthly_income REAL DEFAULT 0.00, -- never a fabricated salary; profile income is 0 until the user/bank says otherwise
      savings_target_percentage REAL DEFAULT 20.00,
      emergency_reserve_target REAL DEFAULT 100000.00,
      daily_payment_limit REAL DEFAULT 50000.00,
      per_txn_payment_limit REAL DEFAULT 25000.00,
      monthly_payment_limit REAL DEFAULT 200000.00,
      biometrics_enabled INTEGER DEFAULT 1,
      app_pin_hash TEXT,
      password_reset_token TEXT,
      password_reset_expires TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS devices (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      device_name TEXT NOT NULL,
      device_model TEXT,
      os_version TEXT,
      ip_address TEXT,
      is_trusted INTEGER DEFAULT 1,
      last_active TEXT DEFAULT CURRENT_TIMESTAMP,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      device_id TEXT,
      refresh_token_hash TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      is_revoked INTEGER DEFAULT 0,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS user_identities (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      provider TEXT NOT NULL,
      provider_subject TEXT NOT NULL,
      email_at_link_time TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      last_login_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE,
      UNIQUE(provider, provider_subject)
    );

    CREATE TABLE IF NOT EXISTS bank_accounts (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      institution_name TEXT NOT NULL,
      institution_code TEXT,
      masked_account_number TEXT NOT NULL,
      account_type TEXT NOT NULL,
      current_balance REAL NOT NULL DEFAULT 0.00,
      available_balance REAL NOT NULL DEFAULT 0.00,
      currency TEXT DEFAULT 'INR',
      is_primary INTEGER DEFAULT 0,
      connection_status TEXT DEFAULT 'CONNECTED',
      provider_type TEXT DEFAULT 'MOCK',
      last_synced_at TEXT DEFAULT CURRENT_TIMESTAMP,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS account_consents (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      bank_account_id TEXT NOT NULL,
      consent_handle TEXT NOT NULL,
      consent_status TEXT DEFAULT 'ACTIVE',
      data_access_types TEXT NOT NULL,
      valid_from TEXT NOT NULL,
      valid_to TEXT NOT NULL,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY(bank_account_id) REFERENCES bank_accounts(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS categories (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      icon TEXT,
      color TEXT,
      type TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS transactions (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      account_id TEXT,
      category_id TEXT,
      type TEXT NOT NULL,
      amount REAL NOT NULL,
      currency TEXT DEFAULT 'INR',
      merchant TEXT,
      sender TEXT,
      receiver TEXT,
      description TEXT,
      payment_method TEXT DEFAULT 'UPI',
      reference_id TEXT UNIQUE,
      status TEXT NOT NULL DEFAULT 'SUCCESSFUL',
      transaction_date TEXT NOT NULL,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS budgets (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      category_id TEXT NOT NULL,
      amount REAL NOT NULL,
      period TEXT DEFAULT 'MONTHLY',
      start_date TEXT NOT NULL,
      end_date TEXT NOT NULL,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS savings_goals (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      name TEXT NOT NULL,
      target_amount REAL NOT NULL,
      current_amount REAL NOT NULL DEFAULT 0.00,
      target_date TEXT NOT NULL,
      monthly_contribution REAL DEFAULT 0.00,
      category TEXT,
      status TEXT DEFAULT 'IN_PROGRESS',
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS emergency_funds (
      id TEXT PRIMARY KEY,
      user_id TEXT UNIQUE NOT NULL,
      target_amount REAL NOT NULL DEFAULT 100000.00,
      current_amount REAL NOT NULL DEFAULT 0.00,
      is_locked INTEGER DEFAULT 1,
      locked_at TEXT,
      monthly_contribution REAL DEFAULT 0.00, -- no invented ₹5,000/month commitment; users opt in explicitly
      auto_save_enabled INTEGER DEFAULT 1,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS emergency_fund_audits (
      id TEXT PRIMARY KEY,
      emergency_fund_id TEXT NOT NULL,
      action TEXT NOT NULL,
      amount REAL,
      reason TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(emergency_fund_id) REFERENCES emergency_funds(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS bills (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      name TEXT NOT NULL,
      amount REAL NOT NULL,
      due_date TEXT NOT NULL,
      category TEXT,
      recurrence TEXT DEFAULT 'MONTHLY',
      is_paid_this_cycle INTEGER DEFAULT 0,
      last_paid_date TEXT,
      is_active INTEGER DEFAULT 1,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS emis (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      loan_name TEXT NOT NULL,
      total_amount REAL NOT NULL,
      monthly_emi REAL NOT NULL,
      total_tenure_months INTEGER NOT NULL,
      paid_months INTEGER NOT NULL DEFAULT 0,
      remaining_amount REAL NOT NULL,
      interest_rate REAL NOT NULL,
      next_due_date TEXT NOT NULL,
      is_paid_this_cycle INTEGER DEFAULT 0,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS payment_requests (
      id TEXT PRIMARY KEY,
      idempotency_key TEXT UNIQUE NOT NULL,
      user_id TEXT NOT NULL,
      source_account_id TEXT,
      recipient_identifier TEXT NOT NULL,
      amount REAL NOT NULL,
      category_id TEXT,
      note TEXT,
      state TEXT NOT NULL DEFAULT 'INITIATED',
      failure_reason TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS insights (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      type TEXT NOT NULL,
      title TEXT NOT NULL,
      description TEXT NOT NULL,
      explanation TEXT NOT NULL,
      action_type TEXT,
      severity TEXT DEFAULT 'INFO',
      is_read INTEGER DEFAULT 0,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS notifications (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      title TEXT NOT NULL,
      body TEXT NOT NULL,
      type TEXT NOT NULL,
      is_read INTEGER DEFAULT 0,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS audit_logs (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      action TEXT NOT NULL,
      ip_address TEXT,
      device_info TEXT,
      metadata TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    -- 3. Composite Performance and Integrity Indexes
    CREATE INDEX IF NOT EXISTS idx_transactions_user_date ON transactions(user_id, transaction_date);
    CREATE INDEX IF NOT EXISTS idx_audit_logs_user_date ON audit_logs(user_id, created_at);
    CREATE INDEX IF NOT EXISTS idx_payment_requests_user_idempotency ON payment_requests(user_id, idempotency_key);
    CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);
    CREATE INDEX IF NOT EXISTS idx_devices_user ON devices(user_id);
    CREATE INDEX IF NOT EXISTS idx_bills_user ON bills(user_id);
  `);

  try { await runQuery('ALTER TABLE users ADD COLUMN phone_verified INTEGER DEFAULT 0'); } catch (_) {}
  try { await runQuery('ALTER TABLE users ADD COLUMN email_verified INTEGER DEFAULT 0'); } catch (_) {}
  try { await runQuery('ALTER TABLE users ADD COLUMN sso_provider TEXT'); } catch (_) {}

  // The user's REAL UPI ID (from their own PhonePe/GPay/Paytm), captured once
  // and used to build Receive QRs. FinPocket is not a PSP, so it cannot issue a
  // VPA of its own — every earlier QR encoded a fabricated handle such as
  // `name@upi` (not a real PSP domain) or `<phone>@okhdfcbank` (HDFC's handle
  // with someone else's number), which no UPI app would accept.
  try { await runQuery('ALTER TABLE users ADD COLUMN upi_id TEXT'); } catch (_) {}

  // One account per bank per user. Connecting HDFC twice — or an institution
  // reporting the same masked account twice — must not silently produce two
  // cards whose balances are added together into an inflated total.
  try {
    await runQuery(`CREATE UNIQUE INDEX IF NOT EXISTS uq_bank_accounts_user_bank_acct
      ON bank_accounts(user_id, institution_name, masked_account_number)`);
  } catch (_) {}

  // Dedicated OTP verifications table for email and mobile codes
  await execQuery(`
    CREATE TABLE IF NOT EXISTS otp_verifications (
      id TEXT PRIMARY KEY,
      user_id TEXT,
      destination TEXT NOT NULL,
      destination_type TEXT NOT NULL,
      purpose TEXT NOT NULL,
      otp_hash TEXT NOT NULL,
      salt TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      consumed_at TEXT,
      attempts INTEGER DEFAULT 0,
      max_attempts INTEGER DEFAULT 5,
      resend_after TEXT NOT NULL,
      ip_address TEXT,
      user_agent TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_otp_dest_purpose ON otp_verifications(destination, purpose, consumed_at);
    CREATE INDEX IF NOT EXISTS idx_otp_expires_at ON otp_verifications(expires_at);
    CREATE INDEX IF NOT EXISTS idx_otp_user_id ON otp_verifications(user_id);
  `);

  await seedDefaultData();
}

/**
 * PostgreSQL boot path. No demo seed, no silent fallback: if the database is
 * unreachable or a migration fails, startup fails with a sanitized error
 * (the connection string never appears in it).
 *
 * Connection roles (Phase D least privilege):
 *   DATABASE_URL             finpocket_app    — runtime queries, RLS-enforced
 *   DATABASE_SYSTEM_URL      finpocket_system — webhook/callback routes
 *   MIGRATIONS_DATABASE_URL  owner/admin      — DDL only. Optional at boot:
 *                            when set, migrations run as the owner; when
 *                            unset, the schema must already exist (apply
 *                            migrations out of band with `npm run db:migrate`).
 */
async function initPostgresDatabase(): Promise<void> {
  const adminUrl = (process.env.MIGRATIONS_DATABASE_URL || '').trim();
  const systemUrl = (process.env.DATABASE_SYSTEM_URL || '').trim();

  if (!systemUrl) {
    throw new Error(
      '[FATAL] DATABASE_SYSTEM_URL is required in PostgreSQL mode (system-role pool for provider callbacks). ' +
      'Run `npm run db:provision` then `npm run db:migrate` as the database owner, then set ' +
      'DATABASE_URL (finpocket_app), DATABASE_SYSTEM_URL (finpocket_system) and MIGRATIONS_DATABASE_URL (owner).'
    );
  }

  // 1. Migrations as the OWNER role when provided — app roles cannot DDL.
  if (adminUrl) {
    const adminPool = getPgPool(adminUrl, 'migrations');
    try {
      await adminPool.query('SELECT 1');
    } catch (err) {
      throw new Error(`[FATAL] MIGRATIONS_DATABASE_URL is unreachable — startup aborted: ${sanitizePgError(err)}`);
    }
    try {
      const result = await runPostgresMigrations(adminPool);
      console.log(
        `[Database] Engine: PostgreSQL — migrations applied=${result.applied}, schemaVersion=${result.currentVersion}`
      );
    } catch (err) {
      throw new Error(
        `${err instanceof Error ? err.message : '[FATAL] Migration failed.'} ` +
        '(hint: MIGRATIONS_DATABASE_URL must be the database OWNER user; the RLS roles are created by `npm run db:provision`.)'
      );
    }
  }

  // 2. Runtime app pool — assert the least-privilege role BEFORE serving.
  const pool = getPgPool(resolvedEngine.connectionString!, 'app');
  await assertRuntimeRole(pool, 'finpocket_app', 'DATABASE_URL');
  attachPgPool(pool);

  // 3. Schema presence (applied just now, or previously out of band).
  try {
    await pool.query('SELECT version FROM schema_migrations ORDER BY version DESC LIMIT 1');
  } catch (err) {
    throw new Error(
      `[FATAL] PostgreSQL schema missing/unreadable for the runtime role: ${sanitizePgError(err)}. ` +
      'Run `npm run db:provision` then `npm run db:migrate` (owner credentials) before booting.'
    );
  }

  // 4. System pool for unauthenticated provider callbacks — assert its role.
  const sysPool = getPgPool(systemUrl, 'system');
  await assertRuntimeRole(sysPool, 'finpocket_system', 'DATABASE_SYSTEM_URL');
  attachPgSystemPool(sysPool);

  console.log('[Database] Engine: PostgreSQL — roles verified (finpocket_app RLS-enforced, finpocket_system for callbacks).');
  console.log('[Database] No seed data is written in PostgreSQL mode (demo fixtures are SQLite-only).');
}

/**
 * The runtime database role must be exactly the provisioned least-privilege
 * role: NOT a superuser and NOT BYPASSRLS — either attribute would silently
 * bypass every Row-Level Security policy, which is precisely what Phase D
 * exists to guarantee.
 */
async function assertRuntimeRole(pool: Pool, expected: string, envName: string): Promise<void> {
  let roleRow: { role: string; rolsuper: boolean; rolbypassrls: boolean } | undefined;
  try {
    const res = await pool.query<{ role: string; rolsuper: boolean; rolbypassrls: boolean }>(
      'SELECT current_user AS role, rolsuper, rolbypassrls FROM pg_roles WHERE rolname = current_user'
    );
    roleRow = res.rows[0];
  } catch (err) {
    throw new Error(`[FATAL] ${envName} is unreachable — startup aborted: ${sanitizePgError(err)}`);
  }
  const bad =
    !roleRow ||
    roleRow.role !== expected ||
    roleRow.rolsuper ||
    roleRow.rolbypassrls;
  if (bad) {
    const detail = !roleRow
      ? 'no role information returned'
      : `expected '${expected}' (non-superuser, no BYPASSRLS), got '${roleRow.role}'` +
        `${roleRow.rolsuper ? ' [SUPERUSER]' : ''}${roleRow.rolbypassrls ? ' [BYPASSRLS]' : ''}`;
    throw new Error(
      `[FATAL] ${envName} role check failed: ${detail}. ` +
      `Provision the roles with \`npm run db:provision\` and point ${envName} at the ${expected} login.`
    );
  }
}

/** True when this process serves from PostgreSQL (enables RLS scope middlewares). */
export function isPostgresEngine(): boolean {
  return engine === 'postgres';
}

/** Graceful shutdown hook — closes the active engine's resources. */
export async function closeDatabase(): Promise<void> {
  if (engine === 'postgres') {
    await closePgPool();
    return;
  }
  await new Promise<void>((resolve) => db.close(() => resolve()));
}

async function seedDefaultData() {
  const existingUser = await getQuery('SELECT id FROM users WHERE email = ?', ['jithendra@finpocket.com']);
  if (!existingUser) {
    const defaultUserId = 'usr_fp_882910';
    const passwordHash = await bcrypt.hash('Demo@1234', 10);
    const pinHash = await bcrypt.hash('1234', 10);

    await runQuery(`
      INSERT INTO users (id, name, email, phone, password_hash, monthly_income, savings_target_percentage, emergency_reserve_target, app_pin_hash)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [defaultUserId, 'Jithendra Sureddy', 'jithendra@finpocket.com', '+91 98765 43210', passwordHash, 55000.0, 20.0, 100000.0, pinHash]);

    // Seed Bank Accounts
    await runQuery(`
      INSERT INTO bank_accounts (id, user_id, institution_name, institution_code, masked_account_number, account_type, current_balance, available_balance, is_primary)
      VALUES 
      ('bnk_01', ?, 'HDFC Bank', 'HDFC0001', '•••• 4829', 'SALARY', 42580.0, 42580.0, 1),
      ('bnk_02', ?, 'State Bank of India', 'SBIN0002', '•••• 9102', 'SAVINGS', 15400.0, 15400.0, 0)
    `, [defaultUserId, defaultUserId]);

    // Seed Consents
    await runQuery(`
      INSERT INTO account_consents (id, user_id, bank_account_id, consent_handle, consent_status, data_access_types, valid_from, valid_to)
      VALUES 
      ('cns_01', ?, 'bnk_01', 'AA_HDFC_CONSENT_984', 'ACTIVE', 'PROFILE,TRANSACTIONS,BALANCES', '2026-01-01', '2027-01-01'),
      ('cns_02', ?, 'bnk_02', 'AA_SBI_CONSENT_192', 'ACTIVE', 'PROFILE,TRANSACTIONS,BALANCES', '2026-01-01', '2027-01-01')
    `, [defaultUserId, defaultUserId]);

    // Seed Categories
    const categories = [
      ['cat_food', 'Food', 'restaurant', '#F59E0B', 'EXPENSE'],
      ['cat_shop', 'Shopping', 'shopping_bag', '#EC4899', 'EXPENSE'],
      ['cat_travel', 'Travel', 'directions_car', '#3B82F6', 'EXPENSE'],
      ['cat_bills', 'Bills', 'receipt_long', '#8B5CF6', 'EXPENSE'],
      ['cat_rent', 'Rent', 'home', '#EF4444', 'EXPENSE'],
      ['cat_salary', 'Salary', 'payments', '#10B981', 'INCOME'],
      ['cat_emi', 'EMI', 'account_balance', '#6366F1', 'EXPENSE'],
      ['cat_health', 'Health', 'favorite', '#14B8A6', 'EXPENSE'],
      ['cat_other', 'Other', 'category', '#64748B', 'EXPENSE']
    ];
    for (const c of categories) {
      await runQuery('INSERT OR IGNORE INTO categories (id, name, icon, color, type) VALUES (?, ?, ?, ?, ?)', c);
    }

    // Seed Transactions
    const now = new Date();
    await runQuery(`
      INSERT INTO transactions (id, user_id, account_id, category_id, type, amount, merchant, sender, receiver, description, payment_method, reference_id, status, transaction_date)
      VALUES 
      ('FP98231011', ?, 'bnk_01', 'cat_food', 'EXPENSE', 420.0, 'Swiggy', 'Jithendra Sureddy', 'Swiggy Food Delivery', 'Dinner delivery order', 'UPI', 'UPI/291039102391', 'SUCCESSFUL', ?),
      ('FP98231010', ?, 'bnk_01', 'cat_travel', 'EXPENSE', 350.0, 'Uber', 'Jithendra Sureddy', 'Uber India', 'Cab ride to office', 'UPI', 'UPI/481029481029', 'SUCCESSFUL', ?),
      ('FP98231009', ?, 'bnk_01', 'cat_salary', 'INCOME', 55000.0, 'Acme Corp', 'Acme Corp Tech Payroll', 'Jithendra Sureddy', 'September Monthly Salary', 'BANK_TRANSFER', 'NEFT/SAL20260901', 'SUCCESSFUL', ?),
      ('FP98231008', ?, 'bnk_01', 'cat_bills', 'EXPENSE', 1250.0, 'BESCOM', 'Jithendra Sureddy', 'BESCOM Electricity Board', 'Electricity bill', 'UPI', 'BBPS/EB20260912', 'SUCCESSFUL', ?),
      ('FP98231007', ?, 'bnk_01', 'cat_rent', 'EXPENSE', 14000.0, 'Landlord', 'Jithendra Sureddy', 'Landlord House Rent', 'Flat 402 Rent', 'BANK_TRANSFER', 'IMPS/RENT092026', 'SUCCESSFUL', ?)
    `, [
      defaultUserId,
      new Date(now.getTime() - 3 * 3600000).toISOString(),
      defaultUserId,
      new Date(now.getTime() - 5 * 3600000).toISOString(),
      defaultUserId,
      new Date(now.getTime() - 13 * 86400000).toISOString(),
      defaultUserId,
      new Date(now.getTime() - 2 * 86400000).toISOString(),
      defaultUserId,
      new Date(now.getTime() - 11 * 86400000).toISOString()
    ]);

    // Seed Emergency Fund
    await runQuery(`
      INSERT INTO emergency_funds (id, user_id, target_amount, current_amount, is_locked, monthly_contribution, auto_save_enabled)
      VALUES ('emf_01', ?, 100000.0, 35000.0, 1, 5000.0, 1)
    `, [defaultUserId]);

    await runQuery(`
      INSERT INTO emergency_fund_audits (id, emergency_fund_id, action, amount, reason)
      VALUES 
      ('log_01', 'emf_01', 'DEPOSIT', 35000.0, 'Monthly allocation'),
      ('log_02', 'emf_01', 'LOCK', NULL, 'User locked emergency fund to safeguard savings')
    `);

    // Seed Savings Goals
    await runQuery(`
      INSERT INTO savings_goals (id, user_id, name, target_amount, current_amount, target_date, monthly_contribution, category)
      VALUES 
      ('goal_01', ?, 'MacBook Pro M4', 150000.0, 75000.0, '2026-12-31', 10000.0, 'TECH'),
      ('goal_02', ?, 'Japan Vacation', 200000.0, 68000.0, '2027-04-15', 20000.0, 'VACATION')
    `, [defaultUserId, defaultUserId]);

    // Seed Bills & EMIs
    await runQuery(`
      INSERT INTO bills (id, user_id, name, amount, due_date, category, recurrence, is_paid_this_cycle)
      VALUES 
      ('rec_01', ?, 'Electricity (BESCOM)', 1250.0, '2026-09-24', 'Electricity', 'MONTHLY', 0),
      ('rec_02', ?, 'High-Speed Fiber (Airtel)', 999.0, '2026-09-28', 'Internet', 'MONTHLY', 0),
      ('rec_03', ?, 'House Rent Flat 402', 14000.0, '2026-09-03', 'Rent', 'MONTHLY', 1)
    `, [defaultUserId, defaultUserId, defaultUserId]);

    await runQuery(`
      INSERT INTO emis (id, user_id, loan_name, total_amount, monthly_emi, total_tenure_months, paid_months, remaining_amount, interest_rate, next_due_date, is_paid_this_cycle)
      VALUES 
      ('emi_01', ?, 'Personal Car Loan (HDFC)', 500000.0, 14500.0, 48, 10, 362000.0, 8.5, '2026-10-05', 1)
    `, [defaultUserId]);

    // Seed Budgets
    await runQuery(`
      INSERT INTO budgets (id, user_id, category_id, amount, period, start_date, end_date)
      VALUES 
      ('bud_01', ?, 'cat_food', 5000.0, 'MONTHLY', '2026-09-01', '2026-09-30'),
      ('bud_02', ?, 'cat_travel', 3000.0, 'MONTHLY', '2026-09-01', '2026-09-30'),
      ('bud_03', ?, 'cat_bills', 3000.0, 'MONTHLY', '2026-09-01', '2026-09-30')
    `, [defaultUserId, defaultUserId, defaultUserId]);

    // Seed Audit Log
    await runQuery(`
      INSERT INTO audit_logs (id, user_id, action, ip_address, device_info, metadata)
      VALUES ('aud_01', ?, 'SYSTEM_INITIALIZED', '127.0.0.1', 'FinPocket Server Initializer', '{"version":"2.0.0"}')
    `, [defaultUserId]);
  }
}
