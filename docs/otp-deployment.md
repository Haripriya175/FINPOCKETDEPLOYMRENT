# FinPocket OTP Authentication: Deployment & Operations Guide

This guide details the deployment architecture, database migration procedure, secrets management, health checks, rollback protocols, and production operational controls for the FinPocket OTP authentication system.

---

## 1. System Requirements & Runtime Matrix

| Component | Target Version | Production Requirement |
| :--- | :--- | :--- |
| **Node.js Runtime** | `v20.x` or `v22.x` LTS | Official Node Alpine LTS image (`node:20-alpine`) |
| **Database Engine** | PostgreSQL 18 | Multi-tenant Row-Level Security (RLS) enabled, TLS enforced (`sslmode=require`) |
| **Process Manager** | Docker / Kubernetes / systemd | Non-root container execution (`USER finpocket`, UID 10001), `dumb-init` signal handler |
| **Transport Security** | TLS 1.3 / HTTPS | Reverse proxy (NGINX / Cloudflare / AWS ALB) terminating HTTPS, enforcing HSTS |
| **Flutter Mobile App** | Flutter 3.x / Dart 3.x | Compiled release APK / AAB / iOS IPA with zero hardcoded API secrets |

---

## 2. Secrets Management & Environment Security

### 2.1. Secret Manager Best Practices
In staging and production, NEVER commit credentials or write plaintext passwords to disk:
- **AWS Secrets Manager / SSM Parameter Store**: Store `DATABASE_URL`, `JWT_SECRET`, `SMTP_APP_PASSWORD`, `FAST2SMS_API_KEY`.
- **GCP Secret Manager**: Mount secrets as environment variables into Cloud Run / GKE pods.
- **Docker / Kubernetes Secrets**: Inject secrets via `secretKeyRef` directly into container environment.

### 2.2. Production Environment Variable Checklist

```ini
# Production Environment Definition
NODE_ENV=PRODUCTION
PORT=3001
CORS_ORIGIN=https://app.finpocket.com

# Cryptographic Keys (Must be >= 32 characters, randomly generated)
JWT_SECRET=replace_with_a_secure_minimum_32_character_random_string_in_production
ACCESS_TOKEN_EXPIRY=15m
REFRESH_TOKEN_EXPIRY=7d

# PostgreSQL Connection (Request Role: finpocket_app)
DATABASE_URL=postgresql://finpocket_app:StrongAppPassword123!@postgres.internal:5432/finpocket_prod?sslmode=require

# Database Migration / DDL Connection (Owner Role: finpocket_owner)
MIGRATIONS_DATABASE_URL=postgresql://finpocket_owner:StrongOwnerPassword123!@postgres.internal:5432/finpocket_prod?sslmode=require

# Email SMTP (Gmail with 2FA App Password)
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=security-alerts@finpocket.com
SMTP_APP_PASSWORD=generated_16_char_app_password
SMTP_FROM="FinPocket Security" <no-reply@finpocket.com>

# Mobile SMS Provider (Fast2SMS or MSG91)
SMS_PROVIDER=fast2sms
FAST2SMS_API_KEY=live_production_fast2sms_api_key
FAST2SMS_ROUTE=otp

# Production Safety Fail-Closed Guards (MUST be false in PRODUCTION)
FINPOCKET_DEMO_MODE=false
FINPOCKET_ALLOW_MOCK_PROVIDER=false
FINPOCKET_DEMO_AUTO_LOGIN=false
ALLOW_MOCK_SSO=false

# Account Aggregator (Setu India)
AA_PROVIDER_ENABLED=true
AA_PROVIDER_NAME=SETU_AA_PRODUCTION
SETU_ENVIRONMENT=PRODUCTION
SETU_CLIENT_ID=prod_client_id
SETU_CLIENT_SECRET=prod_client_secret
SETU_PRODUCT_INSTANCE_ID=prod_product_instance_id
SETU_API_BASE_URL=https://aa.setu.co
SETU_AUTH_BASE_URL=https://api.setu.co
SETU_REDIRECT_BASE_URL=https://app.finpocket.com/aa/redirect
SETU_CALLBACK_BASE_URL=https://api.finpocket.com/api/v1/aa/callback
SETU_WEBHOOK_SECRET=prod_webhook_hmac_secret
```

### 2.3. Credential Rotation Procedures
If any credential is compromised or scheduled for periodic rotation:
1. **Gmail SMTP App Password:**
   - Log in to Google Account -> **Security** -> **App passwords**.
   - Create new App Password `FinPocket Backend (New)`.
   - Update Secret Manager with new value.
   - Perform zero-downtime rolling restart of backend instances.
   - Revoke old App Password in Google Account.
2. **SMS Provider API Key (Fast2SMS / MSG91):**
   - Generate secondary API key in provider dashboard.
   - Update Secret Manager with new key.
   - Restart backend instances.
   - Delete previous API key.
3. **JWT Secret:**
   - Note: Changing `JWT_SECRET` invalidates all currently active user access tokens, requiring users to refresh or re-login.
   - Rotate during off-peak maintenance window.

---

## 3. Database Deployment & Migration Procedure

### 3.1. Pre-Migration Database Backup
Always capture an authoritative full logical backup before applying DDL migrations:

```bash
# PostgreSQL logical dump with schema and data
pg_dump -h postgres.internal -U finpocket_owner -d finpocket_prod -F c -b -v -f finpocket_prod_pre_otp_backup_$(date +%Y%m%d_%H%M%S).dump
```

Verify backup file integrity:
```bash
pg_restore -l finpocket_prod_pre_otp_backup_*.dump | head -n 25
```

### 3.2. Migration Review
FinPocket versioned migrations are located in `src/config/db/migrations/index.ts`:
- **Version 0001 (`core_schema_parity`)**: Core tables (`users`, `devices`, `sessions`, `bank_accounts`, `transactions`, etc.).
- **Version 0002 (`rls_policies`)**: Tenant-isolated Row-Level Security policies and runtime role grants (`finpocket_app`, `finpocket_system`).
- **Version 0003 (`otp_verifications`)**: Adds `users.email_verified SMALLINT DEFAULT 0` and creates `otp_verifications` table with indexes:
  ```sql
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

  GRANT SELECT, INSERT, UPDATE, DELETE ON otp_verifications TO finpocket_app, finpocket_system;
  ```

### 3.3. Execution Command
Migrations must be executed by the database **OWNER** role using `MIGRATIONS_DATABASE_URL`:

```bash
MIGRATIONS_DATABASE_URL="postgresql://finpocket_owner:StrongOwnerPassword123!@postgres.internal:5432/finpocket_prod?sslmode=require" npm run db:migrate
```

Expected command output:
```
[migrate] OK — applied 1 migration(s); schema version = 3.
```

### 3.4. Schema & RLS Verification Query
Run the following SQL check on PostgreSQL:
```sql
-- 1. Verify schema migration version
SELECT version, name, applied_at FROM schema_migrations ORDER BY version DESC;

-- 2. Verify otp_verifications table exists and has correct columns
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'otp_verifications';

-- 3. Confirm RLS policies remain enabled and enforced on tenant tables
SELECT tablename, rowsecurity, forcerowsecurity
FROM pg_tables
WHERE schemaname = 'public'
  AND tablename IN ('transactions', 'bank_accounts', 'budgets', 'savings_goals', 'audit_logs');
```

---

## 4. Rollback & Forward-Fix Protocol

### Forward-Fix Principle
FinPocket migration 0003 is **strictly additive**:
- Adds column `email_verified` (nullable/default 0).
- Creates independent table `otp_verifications`.
- Leaves existing tables, relations, and transactions unmodified.

If an issue arises, prefer a **forward-fix**:
- Check database connectivity, grants, and connection pool timeouts.
- If runtime role lacks table permissions, re-run:
  ```sql
  GRANT SELECT, INSERT, UPDATE, DELETE ON otp_verifications TO finpocket_app, finpocket_system;
  ```

### Emergency Database Rollback (Only if explicitly required)
If migration 0003 needs to be reverted prior to data writes:
```sql
-- Connect as finpocket_owner
BEGIN;
DROP TABLE IF EXISTS otp_verifications;
ALTER TABLE users DROP COLUMN IF EXISTS email_verified;
DELETE FROM schema_migrations WHERE version = 3;
COMMIT;
```

---

## 5. Build, Startup & Health Check Verification

### 5.1. Docker Build & Multi-Stage Deployment
FinPocket uses an optimized multi-stage `Dockerfile`:
```bash
# Build production image
docker build -t finpocket-server:latest -f Dockerfile .

# Run container
docker run -d \
  --name finpocket-api \
  -p 3001:3001 \
  --env-file .env.production \
  finpocket-server:latest
```

### 5.2. Health Check Endpoints
FinPocket provides specialized health check endpoints:
- `GET /health/live`: Liveness probe (verifies process responsiveness).
- `GET /health/ready`: Readiness probe (verifies database pool connectivity).
- `GET /health`: Comprehensive status overview.

Verify liveness and readiness:
```bash
curl -I https://api.finpocket.com/health/live
# Expected: HTTP/1.1 200 OK

curl https://api.finpocket.com/health/ready
# Expected: {"status":"READY","database":"CONNECTED","timestamp":"..."}
```

---

## 6. Post-Deployment Smoke Test Protocol

Perform the following smoke tests on the newly deployed service:

| Step | Action | Expected Result |
| :--- | :--- | :--- |
| **1. Liveness & Readiness** | Query `/health/live` and `/health/ready` | HTTP 200 OK, database `CONNECTED`. |
| **2. Email OTP Dispatch** | Submit `POST /auth/email/send-otp` with test email | HTTP 200 OK, message delivered via Gmail SMTP. |
| **3. Mobile OTP Dispatch** | Submit `POST /auth/phone/send-otp` with authorized test number | HTTP 200 OK, SMS dispatched via Fast2SMS / MSG91. |
| **4. Rate Limit Verification** | Submit 2 requests within 30 seconds for same destination | Second request returns HTTP 429 (`resendCooldownSeconds`). |
| **5. Invalid Code Rejection** | Submit incorrect OTP to `POST /auth/email/verify-otp` | HTTP 400 Bad Request, remaining attempts decremented. |
| **6. Successful Verification**| Submit correct OTP | HTTP 200 OK, `verified: true`. |
| **7. Replay Rejection** | Re-submit the same OTP code | HTTP 400 Bad Request (consumed code cannot be replayed). |
| **8. Registration & Status** | Register account and call `GET /auth/verification-status` | HTTP 200 OK, `emailVerified: true`, `phoneVerified: true`. |
| **9. Log Secret Redaction** | Review CloudWatch / GCP logs for the test period | Zero plaintext OTPs, passwords, or tokens present in logs. |
