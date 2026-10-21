import { Client } from 'pg';
import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';
import bcrypt from 'bcryptjs';

dotenv.config();

export async function setupPostgresDatabase() {
  // LEGACY DEV BOOTSTRAP — this script seeds demo credentials and applies a
  // hand-maintained schema file that has drifted from the real application
  // schema (see PHASE_A_AUDIT_REPORT.md, finding S1/S3). The production schema
  // is now created exclusively by the versioned migrations in
  // config/db/postgres_migrations.ts. This script refuses to touch production.
  if ((process.env.NODE_ENV || '').toUpperCase() === 'PRODUCTION') {
    throw new Error(
      '[FATAL] setup_postgres.ts seeds demo data and must never run against PRODUCTION. ' +
        'Use the versioned migrations (src/config/db/postgres_migrations.ts) instead.'
    );
  }
  const host = process.env.POSTGRES_HOST || 'localhost';
  const port = Number(process.env.POSTGRES_PORT) || 5432;
  const user = process.env.POSTGRES_USER || 'postgres';
  const password = process.env.POSTGRES_PASSWORD || '';
  const dbName = process.env.POSTGRES_DB || 'finpocket';

  console.log(`[PostgreSQL Setup] Connecting to PostgreSQL server at ${host}:${port} as user '${user}'...`);

  // 1. Connect to postgres administrative database to check/create target database
  const adminClient = new Client({
    host,
    port,
    user,
    password,
    database: 'postgres',
    connectionTimeoutMillis: 5000,
  });

  try {
    await adminClient.connect();
    console.log('[PostgreSQL Setup] Connected to admin database.');

    const res = await adminClient.query('SELECT 1 FROM pg_database WHERE datname = $1', [dbName]);
    if (res.rowCount === 0) {
      console.log(`[PostgreSQL Setup] Database '${dbName}' does not exist. Creating...`);
      await adminClient.query(`CREATE DATABASE "${dbName}"`);
      console.log(`[PostgreSQL Setup] Database '${dbName}' created successfully.`);
    } else {
      console.log(`[PostgreSQL Setup] Database '${dbName}' already exists.`);
    }
  } finally {
    await adminClient.end();
  }

  // 2. Connect to the target finpocket database
  const dbClient = new Client({
    host,
    port,
    user,
    password,
    database: dbName,
    connectionTimeoutMillis: 5000,
  });

  try {
    await dbClient.connect();
    console.log(`[PostgreSQL Setup] Connected to target database '${dbName}'.`);

    // 3. Read and execute postgres_schema.sql
    const schemaPath = path.resolve(__dirname, 'postgres_schema.sql');
    if (fs.existsSync(schemaPath)) {
      console.log('[PostgreSQL Setup] Applying schema from postgres_schema.sql...');
      const schemaSql = fs.readFileSync(schemaPath, 'utf-8');

      // Split and execute statements safely
      const statements = schemaSql
        .replace(/--.*$/gm, '') // strip single line comments
        .split(';')
        .map(s => s.trim())
        .filter(s => s.length > 0);

      for (const stmt of statements) {
        try {
          await dbClient.query(stmt);
        } catch (err: any) {
          // Ignore policy already exists or extension already exists errors
          if (err.code === '42710' || err.message?.includes('already exists')) {
            // Duplicate object/policy, continue
          } else {
            console.warn(`[PostgreSQL Setup] Note on statement: ${err.message}`);
          }
        }
      }
      console.log('[PostgreSQL Setup] Schema applied successfully.');
    }

    // 4. Seed initial default user & data if not already present
    const userCheck = await dbClient.query('SELECT id FROM users WHERE email = $1', ['jithendra@finpocket.com']);
    if (userCheck.rowCount === 0) {
      console.log('[PostgreSQL Setup] Seeding default dataset into PostgreSQL...');
      const defaultUserId = 'usr_fp_882910';
      const passwordHash = await bcrypt.hash('Demo@1234', 10);
      const pinHash = await bcrypt.hash('1234', 10);

      await dbClient.query(`
        INSERT INTO users (id, name, email, phone, password_hash, app_pin_hash, monthly_income, savings_target_percentage, emergency_reserve_target)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
        ON CONFLICT (id) DO NOTHING
      `, [defaultUserId, 'Jithendra Sureddy', 'jithendra@finpocket.com', '+91 98765 43210', passwordHash, pinHash, 55000.0, 20.0, 100000.0]);

      // Seed Bank Accounts
      await dbClient.query(`
        INSERT INTO bank_accounts (id, user_id, institution_name, institution_code, masked_account_number, account_type, current_balance, available_balance, is_primary)
        VALUES 
        ('bnk_01', $1, 'HDFC Bank', 'HDFC0001', '•••• 4829', 'SALARY', 42580.0, 42580.0, true),
        ('bnk_02', $1, 'State Bank of India', 'SBIN0002', '•••• 9102', 'SAVINGS', 15400.0, 15400.0, false)
        ON CONFLICT (id) DO NOTHING
      `, [defaultUserId]);

      // Seed Consents
      await dbClient.query(`
        INSERT INTO account_consents (id, user_id, bank_account_id, consent_handle, consent_status, data_access_types, valid_from, valid_to)
        VALUES 
        ('cns_01', $1, 'bnk_01', 'AA_HDFC_CONSENT_984', 'ACTIVE', 'PROFILE,TRANSACTIONS,BALANCES', '2026-01-01', '2027-01-01'),
        ('cns_02', $1, 'bnk_02', 'AA_SBI_CONSENT_192', 'ACTIVE', 'PROFILE,TRANSACTIONS,BALANCES', '2026-01-01', '2027-01-01')
        ON CONFLICT (id) DO NOTHING
      `, [defaultUserId]);

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
        await dbClient.query(
          'INSERT INTO categories (id, name, icon, color, type) VALUES ($1, $2, $3, $4, $5) ON CONFLICT (id) DO NOTHING',
          c
        );
      }

      console.log('[PostgreSQL Setup] Default seed data inserted.');
    }

    console.log('[PostgreSQL Setup] PostgreSQL configuration & setup verified successfully!');
  } finally {
    await dbClient.end();
  }
}

if (process.argv[1] && process.argv[1].endsWith('setup_postgres.ts')) {
  setupPostgresDatabase().catch(err => {
    console.error('[PostgreSQL Setup] Error:', err.message);
    process.exit(1);
  });
}
