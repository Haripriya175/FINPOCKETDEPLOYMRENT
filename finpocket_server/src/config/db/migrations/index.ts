/**
 * Versioned PostgreSQL migrations.
 *
 * Embedded as TypeScript (not .sql files) on purpose: `tsc` does not copy
 * non-TS assets into dist/, and setup_postgres.ts already demonstrated that
 * trap (schema silently skipped when run from dist/). TS strings always ship
 * with the compiled server.
 *
 * ---------------------------------------------------------------------------
 * 0001 — core schema parity
 * ---------------------------------------------------------------------------
 * Transcribed 1:1 from initDatabase()'s SQLite DDL (the schema the application
 * ACTUALLY runs on), with explicit type mapping chosen for query/JS parity:
 *
 *   TEXT                        → TEXT
 *   REAL (money/amounts)        → DOUBLE PRECISION  (JS Number == float64)
 *   INTEGER flags (0/1)         → SMALLINT          (keeps `flag = 1` SQL
 *                                 literals and JS `=== 1` checks working)
 *   ISO-8601 datetime strings   → TIMESTAMPTZ       (driver returns ISO strings)
 *   'YYYY-MM-DD' strings        → DATE              (driver returns 'YYYY-MM-DD')
 *
 * Deliberate parity decisions that differ from the old postgres_schema.sql:
 *   - users.app_pin_hash is NULLABLE (SSO users never set a PIN).
 *   - No FK from transactions.account_id / category_id (SQLite has none —
 *     adding one would reject inserts SQLite accepts).
 *   - No UNIQUE on account_consents.consent_handle (SQLite has none; re-consent
 *     updates would fail under one).
 *   - sessions.device_id has no FK (code inserts 'device_default').
 *   - audit_logs.metadata stays TEXT (SQLite parity) — inserts are JSON
 *     strings but some paths may pass plain text.
 *   - Only the FK set SQLite actually enforces at runtime is mirrored.
 *
 * 0002 (Phase D) adds RLS policies and roles on top of this schema.
 */

export interface PostgresMigration {
  version: number;
  name: string;
  sql: string;
}

const M0001_CORE_SCHEMA_PARITY = `
-- =====================================================================
-- 0001 core_schema_parity — mirrors initDatabase() SQLite DDL exactly
-- =====================================================================

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT UNIQUE NOT NULL,
  phone TEXT,
  password_hash TEXT NOT NULL,
  preferred_currency TEXT DEFAULT 'INR',
  preferred_language TEXT DEFAULT 'en',
  monthly_income DOUBLE PRECISION DEFAULT 0.00,
  savings_target_percentage DOUBLE PRECISION DEFAULT 20.00,
  emergency_reserve_target DOUBLE PRECISION DEFAULT 100000.00,
  daily_payment_limit DOUBLE PRECISION DEFAULT 50000.00,
  per_txn_payment_limit DOUBLE PRECISION DEFAULT 25000.00,
  monthly_payment_limit DOUBLE PRECISION DEFAULT 200000.00,
  biometrics_enabled SMALLINT DEFAULT 1,
  app_pin_hash TEXT,                                   -- NULLABLE: SSO users have no PIN
  password_reset_token TEXT,
  password_reset_expires TIMESTAMPTZ,
  phone_verified SMALLINT DEFAULT 0,                   -- SQLite ALTER-parity columns
  sso_provider TEXT,
  upi_id TEXT,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS devices (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  device_name TEXT NOT NULL,
  device_model TEXT,
  os_version TEXT,
  ip_address TEXT,
  is_trusted SMALLINT DEFAULT 1,
  last_active TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  device_id TEXT,                                      -- no FK (SQLite parity: 'device_default')
  refresh_token_hash TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  is_revoked SMALLINT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS user_identities (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  provider TEXT NOT NULL,
  provider_subject TEXT NOT NULL,
  email_at_link_time TEXT,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  last_login_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(provider, provider_subject)
);

CREATE TABLE IF NOT EXISTS bank_accounts (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  institution_name TEXT NOT NULL,
  institution_code TEXT,
  masked_account_number TEXT NOT NULL,
  account_type TEXT NOT NULL,
  current_balance DOUBLE PRECISION NOT NULL DEFAULT 0.00,
  available_balance DOUBLE PRECISION NOT NULL DEFAULT 0.00,
  currency TEXT DEFAULT 'INR',
  is_primary SMALLINT DEFAULT 0,
  connection_status TEXT DEFAULT 'CONNECTED',
  provider_type TEXT DEFAULT 'MOCK',
  last_synced_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- One account per bank per user (same guard SQLite has, to prevent double-counted balances)
CREATE UNIQUE INDEX IF NOT EXISTS uq_bank_accounts_user_bank_acct
  ON bank_accounts(user_id, institution_name, masked_account_number);

CREATE TABLE IF NOT EXISTS account_consents (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  bank_account_id TEXT NOT NULL REFERENCES bank_accounts(id) ON DELETE CASCADE,
  consent_handle TEXT NOT NULL,                        -- not UNIQUE (SQLite parity)
  consent_status TEXT DEFAULT 'ACTIVE',
  data_access_types TEXT NOT NULL,
  valid_from TIMESTAMPTZ NOT NULL,
  valid_to TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
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
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  account_id TEXT,                                     -- no FK (SQLite parity)
  category_id TEXT,                                    -- no FK (SQLite parity)
  type TEXT NOT NULL,
  amount DOUBLE PRECISION NOT NULL,
  currency TEXT DEFAULT 'INR',
  merchant TEXT,
  sender TEXT,
  receiver TEXT,
  description TEXT,
  payment_method TEXT DEFAULT 'UPI',
  reference_id TEXT UNIQUE,
  status TEXT NOT NULL DEFAULT 'SUCCESSFUL',
  transaction_date TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS budgets (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  category_id TEXT NOT NULL,                           -- no FK (SQLite parity)
  amount DOUBLE PRECISION NOT NULL,
  period TEXT DEFAULT 'MONTHLY',
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS savings_goals (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  target_amount DOUBLE PRECISION NOT NULL,
  current_amount DOUBLE PRECISION NOT NULL DEFAULT 0.00,
  target_date DATE NOT NULL,
  monthly_contribution DOUBLE PRECISION DEFAULT 0.00,
  category TEXT,
  status TEXT DEFAULT 'IN_PROGRESS',
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS emergency_funds (
  id TEXT PRIMARY KEY,
  user_id TEXT UNIQUE NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  target_amount DOUBLE PRECISION NOT NULL DEFAULT 100000.00,
  current_amount DOUBLE PRECISION NOT NULL DEFAULT 0.00,
  is_locked SMALLINT DEFAULT 1,
  locked_at TIMESTAMPTZ,
  monthly_contribution DOUBLE PRECISION DEFAULT 0.00,
  auto_save_enabled SMALLINT DEFAULT 1,
  updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS emergency_fund_audits (
  id TEXT PRIMARY KEY,
  emergency_fund_id TEXT NOT NULL REFERENCES emergency_funds(id) ON DELETE CASCADE,
  action TEXT NOT NULL,
  amount DOUBLE PRECISION,
  reason TEXT,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS bills (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  amount DOUBLE PRECISION NOT NULL,
  due_date DATE NOT NULL,
  category TEXT,
  recurrence TEXT DEFAULT 'MONTHLY',
  is_paid_this_cycle SMALLINT DEFAULT 0,
  last_paid_date TIMESTAMPTZ,
  is_active SMALLINT DEFAULT 1,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS emis (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  loan_name TEXT NOT NULL,
  total_amount DOUBLE PRECISION NOT NULL,
  monthly_emi DOUBLE PRECISION NOT NULL,
  total_tenure_months INTEGER NOT NULL,
  paid_months INTEGER NOT NULL DEFAULT 0,
  remaining_amount DOUBLE PRECISION NOT NULL,
  interest_rate DOUBLE PRECISION NOT NULL,
  next_due_date DATE NOT NULL,
  is_paid_this_cycle SMALLINT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS payment_requests (
  id TEXT PRIMARY KEY,
  idempotency_key TEXT UNIQUE NOT NULL,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  source_account_id TEXT,                              -- no FK (SQLite parity)
  recipient_identifier TEXT NOT NULL,
  amount DOUBLE PRECISION NOT NULL,
  category_id TEXT,                                    -- no FK (SQLite parity)
  note TEXT,
  state TEXT NOT NULL DEFAULT 'INITIATED',
  failure_reason TEXT,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS insights (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  explanation TEXT NOT NULL,
  action_type TEXT,
  severity TEXT DEFAULT 'INFO',
  is_read SMALLINT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS notifications (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  type TEXT NOT NULL,
  is_read SMALLINT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS audit_logs (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  action TEXT NOT NULL,
  ip_address TEXT,
  device_info TEXT,
  metadata TEXT,                                       -- TEXT parity (JSON strings in practice)
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- Account Aggregator connection records. Column names follow the repository
-- interface (encrypted_access_token / token_expires_at / connection_status) —
-- the old code INSERT used a third naming set that matched no schema (Phase A, S2).
CREATE TABLE IF NOT EXISTS provider_connections (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  provider_type TEXT NOT NULL,
  encrypted_access_token TEXT,
  encrypted_refresh_token TEXT,
  token_expires_at TIMESTAMPTZ,
  connection_status TEXT DEFAULT 'ACTIVE',
  last_successful_sync TIMESTAMPTZ,
  last_failed_sync TIMESTAMPTZ,
  last_error_message TEXT,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS sync_history (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  provider_type TEXT NOT NULL,
  consent_id TEXT,
  status TEXT NOT NULL,
  accounts_synced INTEGER DEFAULT 0,
  transactions_synced INTEGER DEFAULT 0,
  error_details TEXT,
  idempotency_key TEXT,
  duration_ms INTEGER DEFAULT 0,
  timestamp TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- Composite performance/integrity indexes (same names as SQLite)
CREATE INDEX IF NOT EXISTS idx_transactions_user_date ON transactions(user_id, transaction_date);
CREATE INDEX IF NOT EXISTS idx_audit_logs_user_date ON audit_logs(user_id, created_at);
CREATE INDEX IF NOT EXISTS idx_payment_requests_user_idempotency ON payment_requests(user_id, idempotency_key);
CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_devices_user ON devices(user_id);
CREATE INDEX IF NOT EXISTS idx_bills_user ON bills(user_id);

-- Foreign-key columns queried in hot paths (PG does not auto-index FK columns)
CREATE INDEX IF NOT EXISTS idx_bank_accounts_user ON bank_accounts(user_id);
CREATE INDEX IF NOT EXISTS idx_account_consents_user ON account_consents(user_id);
CREATE INDEX IF NOT EXISTS idx_budgets_user ON budgets(user_id);
CREATE INDEX IF NOT EXISTS idx_savings_goals_user ON savings_goals(user_id);
CREATE INDEX IF NOT EXISTS idx_emis_user ON emis(user_id);
CREATE INDEX IF NOT EXISTS idx_payment_requests_user ON payment_requests(user_id);
CREATE INDEX IF NOT EXISTS idx_insights_user ON insights(user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_provider_connections_user ON provider_connections(user_id);
CREATE INDEX IF NOT EXISTS idx_sync_history_user ON sync_history(user_id);
`;

// ---------------------------------------------------------------------------
// 0002 — Row-Level Security (Phase D)
// ---------------------------------------------------------------------------
// Two runtime roles (created by `npm run db:provision` BEFORE this runs):
//   finpocket_app    — the API's request role. Every request runs inside a
//                      transaction with SET LOCAL app.current_user_id, so the
//                      policies below confine every read and write to the
//                      authenticated user's rows. Without context (pre-auth),
//                      data tables return nothing and reject inserts.
//   finpocket_system — webhook/callback role (Setu/AA callbacks arrive
//                      unauthenticated but must update consents/accounts).
//                      Full table access, used only by explicitly-scoped
//                      callback routes.
//
// Identity tables (users, sessions, devices, user_identities, categories)
// deliberately have NO RLS: authentication must resolve an identity before
// any user context exists, pre-auth flows touch only these tables, and every
// query against them is already keyed by id/user_id in code. audit_logs gets
// an INSERT allowance for pre-authentication audit events (login attempts,
// password-reset requests) but is readable only with matching context and is
// immutable to the app role (no UPDATE/DELETE policy).
//
// ENABLE + FORCE: even if table ownership ever moves to a runtime role,
// FORCE keeps that role subject to its own policies. Superuser and BYPASSRLS
// bypasses are prevented at boot by the startup role assertion, not here.

const RLS_TENANT_TABLES = [
  'bank_accounts',
  'account_consents',
  'transactions',
  'budgets',
  'savings_goals',
  'emergency_funds',
  'bills',
  'emis',
  'payment_requests',
  'insights',
  'notifications',
  'provider_connections',
  'sync_history',
];

const RLS_CTX = `NULLIF(current_setting('app.current_user_id', true), '')`;

function tenantTableSql(table: string): string {
  return `
ALTER TABLE ${table} ENABLE ROW LEVEL SECURITY;
ALTER TABLE ${table} FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS app_tenant ON ${table};
CREATE POLICY app_tenant ON ${table} FOR ALL TO finpocket_app
  USING (user_id = ${RLS_CTX})
  WITH CHECK (user_id = ${RLS_CTX});
DROP POLICY IF EXISTS sys_all ON ${table};
CREATE POLICY sys_all ON ${table} FOR ALL TO finpocket_system
  USING (true) WITH CHECK (true);
`;
}

const M0002_RLS_POLICIES = `
-- =====================================================================
-- 0002 rls_policies — least-privilege roles, per-user Row-Level Security
-- =====================================================================

-- Fail fast with an actionable message if roles were not provisioned yet
-- (CREATE POLICY TO <role> requires the role to exist).
DO $rls$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'finpocket_app') THEN
    RAISE EXCEPTION 'finpocket_app role does not exist — run "npm run db:provision" first';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'finpocket_system') THEN
    RAISE EXCEPTION 'finpocket_system role does not exist — run "npm run db:provision" first';
  END IF;
END
$rls$;

${RLS_TENANT_TABLES.map(tenantTableSql).join('\n')}

-- audit_logs: user-scoped reads; context-bound inserts with a pre-auth
-- allowance (login/register/password-reset audits carry no GUC yet);
-- NO update/delete policy for the app role → audit immutability.
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS app_audit_select ON audit_logs;
CREATE POLICY app_audit_select ON audit_logs FOR SELECT TO finpocket_app
  USING (user_id = ${RLS_CTX});
DROP POLICY IF EXISTS app_audit_insert ON audit_logs;
CREATE POLICY app_audit_insert ON audit_logs FOR INSERT TO finpocket_app
  WITH CHECK (user_id = ${RLS_CTX} OR ${RLS_CTX} IS NULL);
DROP POLICY IF EXISTS sys_all ON audit_logs;
CREATE POLICY sys_all ON audit_logs FOR ALL TO finpocket_system
  USING (true) WITH CHECK (true);

-- emergency_fund_audits has no user_id column: scope through the parent fund.
ALTER TABLE emergency_fund_audits ENABLE ROW LEVEL SECURITY;
ALTER TABLE emergency_fund_audits FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS app_tenant ON emergency_fund_audits;
CREATE POLICY app_tenant ON emergency_fund_audits FOR ALL TO finpocket_app
  USING (emergency_fund_id IN (SELECT id FROM emergency_funds WHERE user_id = ${RLS_CTX}))
  WITH CHECK (emergency_fund_id IN (SELECT id FROM emergency_funds WHERE user_id = ${RLS_CTX}));
DROP POLICY IF EXISTS sys_all ON emergency_fund_audits;
CREATE POLICY sys_all ON emergency_fund_audits FOR ALL TO finpocket_system
  USING (true) WITH CHECK (true);

-- Table privileges for the runtime roles (policies only shape ROWS; the
-- roles still need table/column GRANTs). Runs as the migration (owner) user.
GRANT USAGE ON SCHEMA public TO finpocket_app, finpocket_system;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO finpocket_app, finpocket_system;
REVOKE INSERT, UPDATE, DELETE ON schema_migrations FROM finpocket_app, finpocket_system;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO finpocket_app, finpocket_system;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO finpocket_app, finpocket_system;
`;

// ---------------------------------------------------------------------------
// 0003 — otp_verifications & email_verified status
// ---------------------------------------------------------------------------
const M0003_OTP_VERIFICATIONS = `
-- =====================================================================
-- 0003 otp_verifications — email/phone OTP state & email_verified status
-- =====================================================================

ALTER TABLE users ADD COLUMN IF NOT EXISTS email_verified SMALLINT DEFAULT 0;

CREATE TABLE IF NOT EXISTS otp_verifications (
  id TEXT PRIMARY KEY,
  user_id TEXT REFERENCES users(id) ON DELETE CASCADE,
  destination TEXT NOT NULL,
  destination_type TEXT NOT NULL,
  purpose TEXT NOT NULL,
  otp_hash TEXT NOT NULL,
  salt TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  consumed_at TIMESTAMPTZ,
  attempts SMALLINT DEFAULT 0,
  max_attempts SMALLINT DEFAULT 5,
  resend_after TIMESTAMPTZ NOT NULL,
  ip_address TEXT,
  user_agent TEXT,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_otp_dest_purpose ON otp_verifications(destination, purpose, consumed_at);
CREATE INDEX IF NOT EXISTS idx_otp_expires_at ON otp_verifications(expires_at);
CREATE INDEX IF NOT EXISTS idx_otp_user_id ON otp_verifications(user_id);

-- Pre-auth and tenant access grants
GRANT SELECT, INSERT, UPDATE, DELETE ON otp_verifications TO finpocket_app, finpocket_system;
`;

export const POSTGRES_MIGRATIONS: PostgresMigration[] = [
  { version: 1, name: 'core_schema_parity', sql: M0001_CORE_SCHEMA_PARITY },
  { version: 2, name: 'rls_policies', sql: M0002_RLS_POLICIES },
  { version: 3, name: 'otp_verifications', sql: M0003_OTP_VERIFICATIONS },
];
