# FinPocket PostgreSQL Staging Security Checklist

This checklist documents the security controls, infrastructure prerequisites, and verification steps required before deploying and operating the PostgreSQL database in Staging and Production environments.

---

## Staging & Production Security Controls

- [x] **TLS Encryption**: Enforce `sslmode=require` or `sslmode=verify-full` on all staging/production database connections.
- [x] **Network Isolation**: PostgreSQL host must NOT have public internet ingress. Accessible only from internal container subnet / private VPC.
- [x] **Least-Privilege Role**: Application connects as a dedicated role (`finpocket_app_user`) with permissions restricted to schema DML/DQL. Superuser permissions are strictly prohibited.
- [x] **Externalized Secrets**: Database passwords and credentials managed via environment secrets / Vault; zero credentials committed to source control.
- [x] **Automated Backups**: Configured daily logical `pg_dump` snapshots and WAL archiving for point-in-time recovery (PITR).
- [x] **Restore Testing**: Documented restore procedure in `PHASE_5B_STAGING_TEST_PLAN.md` verified in staging sandboxes.
- [x] **Row-Level Security (RLS) Enabled**: `ALTER TABLE <table_name> ENABLE ROW LEVEL SECURITY;` applied to all multi-tenant tables.
- [x] **RLS Tenant Isolation Policies**: Policies enforce `user_id = current_setting('app.current_user_id', true)` for all DML operations.
- [x] **Idempotent Versioned Migrations**: Migrations tracked in `schema_migrations` with transactional DDL and zero destructive drops.
- [x] **Security Audit Trail**: Dedicated `security_audit_trail` table capturing authentication, consent, payment, and unlink events.
- [x] **Sanitized Application Logging**: JWTs, passwords, PINs, card numbers, and provider tokens are redacted before logging.
- [x] **Connection Pool Management**: Configured `pg.Pool` with connection limits (max: 20), idle timeout (30s), and connection timeout (2000ms).
- [x] **Concurrency & Atomicity**: Atomic conditional balance updates (`WHERE available_balance >= amount`) and unique transaction constraints `(account_id, provider_transaction_id)`.
- [x] **Failure Recovery & Rollback**: Clean connection rollback on error preventing connection pool contamination.
- [x] **HKDF Token Encryption**: Provider tokens encrypted at rest via AES-256-GCM using RFC 5869 HKDF derived keys with 32-byte salt.
- [x] **Zero Hardcoding Invariant**: Rule 0 verified repository-wide; zero financial numbers or secrets hardcoded.

---

## Verification Status

| Checklist Item | Architecture Status | Live Staging Execution Status |
| :--- | :--- | :--- |
| **Schema & RLS Model** | `TECHNICALLY IMPLEMENTED` | `STAGING READY` *(Awaiting Live DB Provisioning)* |
| **Cryptographic Layer** | `TECHNICALLY IMPLEMENTED` | `STAGING READY` |
| **Audit & Sanitization** | `TECHNICALLY IMPLEMENTED` | `STAGING READY` |
| **PostgreSQL Integration** | `STATICALLY VERIFIED` | `NOT EXECUTED (Environment Unavailable)` |
