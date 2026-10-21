# FinPocket Phase 5B — Manual Staging Test Plan

This document outlines the step-by-step procedure for executing staging verification of the FinPocket production architecture, PostgreSQL migration/RLS layer, consent lifecycle, reconciliation engine, and security boundaries.

---

## Prerequisites & Environment Matrix

| Component | Target Version | Staging Role |
| :--- | :--- | :--- |
| **PostgreSQL** | 15.0+ | Authoritative multi-tenant ACID store |
| **Node.js runtime** | 18.x / 20.x LTS | Backend TypeScript server engine |
| **Flutter client** | 3.x stable | Mobile client UI and local state machine |
| **Provider Adapter**| Staging Mock / Sandbox AA | Controlled FIU/AA interaction harness |

---

## Staging Verification Workflow (18 Steps)

### 1. Deploy Backend to Staging
- **Action**: Build and deploy `finpocket_server` container or service in the staging cluster.
- **Verification**: `GET /api/health` returns `HTTP 200 OK` with status `"healthy"`.
- **Environment**: Internal Staging.

### 2. Connect PostgreSQL 15+
- **Action**: Supply `DATABASE_URL=postgres://app_user:app_pass@staging-pg:5432/finpocket_staging?sslmode=require`.
- **Verification**: Connection pool initializes 10–20 connections with SSL enabled.
- **Environment**: Internal Staging.

### 3. Run Migrations
- **Action**: Execute `npm run migrate` or run `001_initial_schema.sql` and `002_account_aggregator_schema.sql`.
- **Verification**: Table `schema_migrations` contains all applied versions. All indexes, foreign keys, and triggers exist.
- **Environment**: Internal Staging.

### 4. Verify Row-Level Security (RLS)
- **Action**: Execute SQL test suite setting `SET LOCAL app.current_user_id = 'user_a'` and query tables.
- **Verification**: `SELECT * FROM bank_accounts;` returns only `user_a` accounts. Queries attempting to select `user_b` accounts return 0 rows.
- **Environment**: Internal Staging.

### 5. Create Two Test Users
- **Action**: Register/seed two distinct staging accounts: `user_staging_alpha` and `user_staging_beta`.
- **Verification**: Both receive distinct UUIDs and isolated JWT sessions.
- **Environment**: Internal Staging.

### 6. Seed Staging Financial Test Fixtures
- **Action**: Seed isolated mock bank accounts for both test users using explicit staging fixtures.
- **Verification**: No production values or hardcoded defaults are used.
- **Environment**: Internal Staging.

### 7. Execute Account Linking Flow
- **Action**: Initiate account discovery on mobile client/staging UI for `user_staging_alpha`.
- **Verification**: Discovered accounts appear in UI with `UNLINKED` status.
- **Environment**: Internal Staging.

### 8. Test Consent Creation & Explanation
- **Action**: Request consent creation with explicit validity date range and data types.
- **Verification**: Consent prompt shows detailed data access scopes and expiry. In DB, consent is stored with status `PENDING` or `ACTIVE`.
- **Environment**: Internal Staging.

### 9. Test Financial Synchronization
- **Action**: Trigger sync for the linked account.
- **Verification**: Normalized transactions appear in `financial_transactions`. Account balance updates atomically. Freshness moves from `SYNCING` to `CURRENT`.
- **Environment**: Internal Staging.

### 10. Simulate Provider Outage
- **Action**: Trigger fake provider failure simulation (HTTP 502 / Timeout / Rate Limit).
- **Verification**: Backend catches provider exception gracefully. Historical balances and transactions are retained without corruption. Status becomes `FAILED` or `STALE`.
- **Environment**: Internal Staging (Simulated Failure Harness).

### 11. Verify Stale State Indication
- **Action**: Inspect UI when last sync is older than threshold or sync fails.
- **Verification**: UI displays `STALE` badge. Previous balances remain visible; no zeroing out occurs.
- **Environment**: Internal Staging / Flutter UI.

### 12. Verify Transaction Reconciliation
- **Action**: Ingest identical transaction batch twice, followed by a modified metadata batch.
- **Verification**: No duplicate transaction rows created. Updates modify existing rows deterministically without changing transaction IDs.
- **Environment**: Internal Staging.

### 13. Verify Account Unlinking
- **Action**: Invoke `DELETE /api/financial/accounts/:id/unlink`.
- **Verification**: Bank account marked `DISCONNECTED`. Active consent revoked. Provider token purged/invalidated. Audit log entry created.
- **Environment**: Internal Staging.

### 14. Verify AI Restrictions
- **Action**: Prompt FinPocket AI assistant with requests like "Pay 500 to Bob" or "Unlink my HDFC account".
- **Verification**: AI refuses write operations with explicit read-only notice. No mutations occur.
- **Environment**: Internal Staging / Flutter UI.

### 15. Verify Redacted Logging
- **Action**: Inspect server STDOUT and log aggregator during authentication, token exchange, and payment attempts.
- **Verification**: No JWTs, refresh tokens, passwords, PINs, or raw encryption keys appear in logs.
- **Environment**: Internal Staging.

### 16. Verify Audit Trail Integrity
- **Action**: Query `security_audit_trail` table for recent actions.
- **Verification**: Audit entries exist for login, consent grant, consent revoke, sync, and unlink with valid timestamps and actor IDs.
- **Environment**: Internal Staging.

### 17. Verify Backup and Point-in-Time Restore
- **Action**: Execute `pg_dump` on staging database, wipe test database, and restore from dump.
- **Verification**: Database recovers with zero data loss or constraint corruption.
- **Environment**: Internal Staging.

### 18. Verify Rollback Procedure
- **Action**: Execute migration rollback script to previous schema version on staging clone.
- **Verification**: Rollback completes idempotently without locking or data corruption.
- **Environment**: Internal Staging.

---

## External Provider Boundary Note

| Step | Test Environment Requirement | External Provider Needed? |
| :--- | :--- | :--- |
| Steps 1–18 | Staging PostgreSQL + Staging Harness | **NO** (Fully executable in Staging) |
| Live Bank Sync | Live FIU / AA Production Gateway | **YES** *(Requires Sahamati / RBI FIU onboarding)* |
