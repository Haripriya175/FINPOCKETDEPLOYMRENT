-- ==============================================================================
-- FINPOCKET PRODUCTION POSTGRESQL SCHEMA & ROW-LEVEL SECURITY (RLS) SPECIFICATION
-- ==============================================================================
-- !!! SUPERSEDED — DO NOT APPLY THIS FILE TO A DATABASE !!!
-- The application's PostgreSQL schema is now created exclusively by the
-- versioned migrations in src/config/db/migrations/ (see postgres_migrations.ts).
-- This file is retained as historical specification only: the Phase A audit
-- found ~15 divergences between it and the SQLite schema the code actually
-- runs on (nullable PIN column, device/session column mismatches, missing
-- tables, BOOLEAN vs INTEGER flags, extra UNIQUE constraints). See
-- PHASE_A_AUDIT_REPORT.md (finding S1) for the full list.
-- ==============================================================================
-- Target Engine: PostgreSQL 15+
-- Security Architecture: Multi-tenant defense-in-depth via Row-Level Security (RLS)
-- Execution: Run against staging/production PostgreSQL database during provisioning.
-- ==============================================================================

-- 1. Enable Required Extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- 2. Core Users & Credentials Table
CREATE TABLE IF NOT EXISTS users (
    id VARCHAR(64) PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    phone VARCHAR(32),
    password_hash VARCHAR(255) NOT NULL,
    app_pin_hash VARCHAR(255) NOT NULL,
    preferred_currency VARCHAR(8) DEFAULT 'INR',
    preferred_language VARCHAR(8) DEFAULT 'en',
    monthly_income NUMERIC(14, 2) DEFAULT 0.00,
    savings_target_percentage NUMERIC(5, 2) DEFAULT 20.00,
    emergency_reserve_target NUMERIC(14, 2) DEFAULT 100000.00,
    daily_payment_limit NUMERIC(14, 2) DEFAULT 50000.00,
    per_txn_payment_limit NUMERIC(14, 2) DEFAULT 25000.00,
    monthly_payment_limit NUMERIC(14, 2) DEFAULT 200000.00,
    biometrics_enabled BOOLEAN DEFAULT TRUE,
    app_pin_enabled BOOLEAN DEFAULT TRUE,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- 3. Sessions & Devices
CREATE TABLE IF NOT EXISTS devices (
    id VARCHAR(64) PRIMARY KEY,
    user_id VARCHAR(64) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    device_name VARCHAR(255) NOT NULL,
    device_type VARCHAR(64) NOT NULL,
    trusted BOOLEAN DEFAULT FALSE,
    last_active TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS sessions (
    id VARCHAR(64) PRIMARY KEY,
    user_id VARCHAR(64) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    device_id VARCHAR(64) REFERENCES devices(id) ON DELETE SET NULL,
    refresh_token_hash VARCHAR(255) NOT NULL,
    ip_address VARCHAR(64),
    user_agent TEXT,
    is_revoked BOOLEAN DEFAULT FALSE,
    expires_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS user_identities (
    id VARCHAR(64) PRIMARY KEY,
    user_id VARCHAR(64) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    provider VARCHAR(32) NOT NULL,
    provider_subject VARCHAR(255) NOT NULL,
    email_at_link_time VARCHAR(255),
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    last_login_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_user_identity UNIQUE (provider, provider_subject)
);

-- 4. Bank Accounts & Aggregator Consents
CREATE TABLE IF NOT EXISTS bank_accounts (
    id VARCHAR(64) PRIMARY KEY,
    user_id VARCHAR(64) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    institution_name VARCHAR(255) NOT NULL,
    institution_code VARCHAR(32) NOT NULL,
    masked_account_number VARCHAR(32) NOT NULL,
    account_type VARCHAR(32) NOT NULL,
    current_balance NUMERIC(14, 2) DEFAULT 0.00,
    available_balance NUMERIC(14, 2) DEFAULT 0.00,
    currency VARCHAR(8) DEFAULT 'INR',
    is_primary BOOLEAN DEFAULT FALSE,
    connection_status VARCHAR(32) DEFAULT 'CONNECTED',
    last_synced_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS account_consents (
    id VARCHAR(64) PRIMARY KEY,
    user_id VARCHAR(64) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    bank_account_id VARCHAR(64) NOT NULL REFERENCES bank_accounts(id) ON DELETE CASCADE,
    consent_handle VARCHAR(255) UNIQUE NOT NULL,
    consent_status VARCHAR(32) NOT NULL,
    data_access_types TEXT NOT NULL,
    valid_from TIMESTAMPTZ NOT NULL,
    valid_to TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- 5. Categories & Transactions
CREATE TABLE IF NOT EXISTS categories (
    id VARCHAR(64) PRIMARY KEY,
    name VARCHAR(128) NOT NULL,
    icon VARCHAR(64),
    color VARCHAR(32),
    type VARCHAR(32) NOT NULL
);

CREATE TABLE IF NOT EXISTS transactions (
    id VARCHAR(64) PRIMARY KEY,
    user_id VARCHAR(64) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    account_id VARCHAR(64) REFERENCES bank_accounts(id) ON DELETE SET NULL,
    category_id VARCHAR(64) REFERENCES categories(id) ON DELETE SET NULL,
    type VARCHAR(32) NOT NULL,
    amount NUMERIC(14, 2) NOT NULL,
    currency VARCHAR(8) DEFAULT 'INR',
    merchant VARCHAR(255),
    sender VARCHAR(255),
    receiver VARCHAR(255),
    description TEXT,
    payment_method VARCHAR(64) DEFAULT 'UPI',
    reference_id VARCHAR(255) UNIQUE,
    status VARCHAR(32) NOT NULL DEFAULT 'SUCCESSFUL',
    transaction_date TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- 6. Financial Planning: Budgets, Goals, Emergency Fund, Bills & EMIs
CREATE TABLE IF NOT EXISTS budgets (
    id VARCHAR(64) PRIMARY KEY,
    user_id VARCHAR(64) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    category_id VARCHAR(64) NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
    amount NUMERIC(14, 2) NOT NULL,
    period VARCHAR(32) DEFAULT 'MONTHLY',
    start_date DATE NOT NULL,
    end_date DATE NOT NULL,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS savings_goals (
    id VARCHAR(64) PRIMARY KEY,
    user_id VARCHAR(64) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    target_amount NUMERIC(14, 2) NOT NULL,
    current_amount NUMERIC(14, 2) DEFAULT 0.00,
    target_date DATE NOT NULL,
    monthly_contribution NUMERIC(14, 2) DEFAULT 0.00,
    category VARCHAR(64),
    status VARCHAR(32) DEFAULT 'IN_PROGRESS',
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS emergency_funds (
    id VARCHAR(64) PRIMARY KEY,
    user_id VARCHAR(64) UNIQUE NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    target_amount NUMERIC(14, 2) NOT NULL DEFAULT 100000.00,
    current_amount NUMERIC(14, 2) DEFAULT 0.00,
    is_locked BOOLEAN DEFAULT TRUE,
    monthly_contribution NUMERIC(14, 2) DEFAULT 0.00, -- no invented ₹5,000/month commitment
    auto_save_enabled BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS emergency_fund_audits (
    id VARCHAR(64) PRIMARY KEY,
    emergency_fund_id VARCHAR(64) NOT NULL REFERENCES emergency_funds(id) ON DELETE CASCADE,
    action VARCHAR(32) NOT NULL,
    amount NUMERIC(14, 2),
    reason TEXT,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS bills (
    id VARCHAR(64) PRIMARY KEY,
    user_id VARCHAR(64) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    amount NUMERIC(14, 2) NOT NULL,
    due_date DATE NOT NULL,
    category VARCHAR(64) NOT NULL,
    recurrence VARCHAR(32) DEFAULT 'MONTHLY',
    is_paid_this_cycle BOOLEAN DEFAULT FALSE,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS emis (
    id VARCHAR(64) PRIMARY KEY,
    user_id VARCHAR(64) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    loan_name VARCHAR(255) NOT NULL,
    total_amount NUMERIC(14, 2) NOT NULL,
    monthly_emi NUMERIC(14, 2) NOT NULL,
    total_tenure_months INT NOT NULL,
    paid_months INT NOT NULL DEFAULT 0,
    remaining_amount NUMERIC(14, 2) NOT NULL,
    interest_rate NUMERIC(5, 2),
    next_due_date DATE NOT NULL,
    is_paid_this_cycle BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- 7. Payment Requests, Insights & Audit Logs
CREATE TABLE IF NOT EXISTS payment_requests (
    id VARCHAR(64) PRIMARY KEY,
    idempotency_key VARCHAR(255) UNIQUE NOT NULL,
    user_id VARCHAR(64) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    source_account_id VARCHAR(64) REFERENCES bank_accounts(id),
    recipient_identifier VARCHAR(255) NOT NULL,
    amount NUMERIC(14, 2) NOT NULL,
    category_id VARCHAR(64),
    note TEXT,
    state VARCHAR(32) NOT NULL DEFAULT 'INITIATED',
    failure_reason TEXT,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS insights (
    id VARCHAR(64) PRIMARY KEY,
    user_id VARCHAR(64) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    type VARCHAR(64) NOT NULL,
    title VARCHAR(255) NOT NULL,
    description TEXT NOT NULL,
    explanation TEXT NOT NULL,
    action_type VARCHAR(64),
    severity VARCHAR(32) DEFAULT 'INFO',
    is_read BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS notifications (
    id VARCHAR(64) PRIMARY KEY,
    user_id VARCHAR(64) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    title VARCHAR(255) NOT NULL,
    body TEXT NOT NULL,
    type VARCHAR(64) NOT NULL,
    is_read BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS audit_logs (
    id VARCHAR(64) PRIMARY KEY,
    user_id VARCHAR(64) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    action VARCHAR(128) NOT NULL,
    ip_address VARCHAR(64),
    device_info VARCHAR(255),
    request_id VARCHAR(64),
    metadata JSONB,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- ==============================================================================
-- 8. ROW-LEVEL SECURITY (RLS) POLICIES
-- ==============================================================================
-- The application sets session context: SET LOCAL app.current_user_id = '<authenticated_user_id>';

ALTER TABLE bank_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE bank_accounts FORCE ROW LEVEL SECURITY;
CREATE POLICY bank_accounts_user_isolation ON bank_accounts
    FOR ALL
    USING (user_id = NULLIF(current_setting('app.current_user_id', true), ''));

ALTER TABLE transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE transactions FORCE ROW LEVEL SECURITY;
CREATE POLICY transactions_user_isolation ON transactions
    FOR ALL
    USING (user_id = NULLIF(current_setting('app.current_user_id', true), ''));

ALTER TABLE budgets ENABLE ROW LEVEL SECURITY;
ALTER TABLE budgets FORCE ROW LEVEL SECURITY;
CREATE POLICY budgets_user_isolation ON budgets
    FOR ALL
    USING (user_id = NULLIF(current_setting('app.current_user_id', true), ''));

ALTER TABLE savings_goals ENABLE ROW LEVEL SECURITY;
ALTER TABLE savings_goals FORCE ROW LEVEL SECURITY;
CREATE POLICY savings_goals_user_isolation ON savings_goals
    FOR ALL
    USING (user_id = NULLIF(current_setting('app.current_user_id', true), ''));

ALTER TABLE emergency_funds ENABLE ROW LEVEL SECURITY;
ALTER TABLE emergency_funds FORCE ROW LEVEL SECURITY;
CREATE POLICY emergency_funds_user_isolation ON emergency_funds
    FOR ALL
    USING (user_id = NULLIF(current_setting('app.current_user_id', true), ''));

ALTER TABLE bills ENABLE ROW LEVEL SECURITY;
ALTER TABLE bills FORCE ROW LEVEL SECURITY;
CREATE POLICY bills_user_isolation ON bills
    FOR ALL
    USING (user_id = NULLIF(current_setting('app.current_user_id', true), ''));

ALTER TABLE emis ENABLE ROW LEVEL SECURITY;
ALTER TABLE emis FORCE ROW LEVEL SECURITY;
CREATE POLICY emis_user_isolation ON emis
    FOR ALL
    USING (user_id = NULLIF(current_setting('app.current_user_id', true), ''));

ALTER TABLE payment_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE payment_requests FORCE ROW LEVEL SECURITY;
CREATE POLICY payment_requests_user_isolation ON payment_requests
    FOR ALL
    USING (user_id = NULLIF(current_setting('app.current_user_id', true), ''));

ALTER TABLE insights ENABLE ROW LEVEL SECURITY;
ALTER TABLE insights FORCE ROW LEVEL SECURITY;
CREATE POLICY insights_user_isolation ON insights
    FOR ALL
    USING (user_id = NULLIF(current_setting('app.current_user_id', true), ''));

ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications FORCE ROW LEVEL SECURITY;
CREATE POLICY notifications_user_isolation ON notifications
    FOR ALL
    USING (user_id = NULLIF(current_setting('app.current_user_id', true), ''));

ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs FORCE ROW LEVEL SECURITY;
CREATE POLICY audit_logs_user_isolation ON audit_logs
    FOR ALL
    USING (user_id = NULLIF(current_setting('app.current_user_id', true), ''));
