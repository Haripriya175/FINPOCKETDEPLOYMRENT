# PostgreSQL Production Validation & Schema Specifications

## 1. Validation Status & Executive Summary

> [!IMPORTANT]
> **Current Status**: **Statically Validated & Schema-Ready**
> **PostgreSQL Integration Execution Status**: **NOT EXECUTED (Local PostgreSQL / Docker daemon unavailable in build environment)**
> *In strict conformance with Phase 5B rules, results are NOT fabricated. The schema, migrations, connection pool structure, and Row-Level Security policies are statically verified against PostgreSQL 15+ syntax specifications.*

---

## 2. PostgreSQL 15+ Target Schema Definition

The full production schema is codified in [`postgres_schema.sql`](file:///d:/Finpocket%20Final%20Mobile/finpocket_server/src/config/postgres_schema.sql).

### Key Relational Entities:
1. **`users`**:
   - `id VARCHAR(64) PRIMARY KEY`
   - `email VARCHAR(255) UNIQUE NOT NULL`
   - `password_hash VARCHAR(255) NOT NULL` (Argon2 / bcrypt)
   - `monthly_income NUMERIC(12,2) DEFAULT 55000.00`
   - `daily_payment_limit NUMERIC(12,2) DEFAULT 50000.00`
2. **`bank_accounts`**:
   - `id VARCHAR(64) PRIMARY KEY`
   - `user_id VARCHAR(64) REFERENCES users(id) ON DELETE CASCADE`
   - `available_balance NUMERIC(12,2) NOT NULL DEFAULT 0.00`
   - `current_balance NUMERIC(12,2) NOT NULL DEFAULT 0.00`
   - `connection_status VARCHAR(32) DEFAULT 'CONNECTED'`
   - `provider_type VARCHAR(32) DEFAULT 'MOCK'`
3. **`account_consents`**:
   - `id VARCHAR(64) PRIMARY KEY`
   - `user_id VARCHAR(64) REFERENCES users(id) ON DELETE CASCADE`
   - `bank_account_id VARCHAR(64) REFERENCES bank_accounts(id) ON DELETE CASCADE`
   - `consent_handle VARCHAR(128) NOT NULL`
   - `consent_status VARCHAR(32) DEFAULT 'ACTIVE'`
   - `valid_from TIMESTAMPTZ NOT NULL`
   - `valid_to TIMESTAMPTZ NOT NULL`
4. **`transactions`**:
   - `id VARCHAR(64) PRIMARY KEY`
   - `user_id VARCHAR(64) REFERENCES users(id) ON DELETE CASCADE`
   - `account_id VARCHAR(64) REFERENCES bank_accounts(id) ON DELETE SET NULL`
   - `amount NUMERIC(12,2) NOT NULL`
   - `type VARCHAR(16) NOT NULL` (`INCOME`, `EXPENSE`, `TRANSFER`)
   - `status VARCHAR(32) NOT NULL` (`SUCCESSFUL`, `PENDING`, `FAILED`, `CANCELLED`)
   - `reference_id VARCHAR(128) NOT NULL`

---

## 3. Migration Runner & Idempotency Strategy

- **Table**: `schema_migrations`
- **Engine**: [`MigrationRunner`](file:///d:/Finpocket%20Final%20Mobile/finpocket_server/src/config/migration_runner.ts)
- **Execution**:
  1. Transactional DDL execution where supported.
  2. Version hash registration preventing duplicate or out-of-order execution.
  3. Non-destructive startup; existing operational data is never dropped.

---

## 4. Connection Pooling & Production Prerequisites

```typescript
// Production Pool Configuration Spec (pg.Pool)
const poolConfig = {
  host: process.env.POSTGRES_HOST,
  port: Number(process.env.POSTGRES_PORT) || 5432,
  database: process.env.POSTGRES_DB,
  user: process.env.POSTGRES_USER,
  password: process.env.POSTGRES_PASSWORD,
  max: 25, // Maximum pooled connections
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
  ssl: {
    rejectUnauthorized: true,
    ca: process.env.POSTGRES_CA_CERT
  }
};
```

### Staging Deployment Checklist for PostgreSQL:
- [ ] Provision dedicated PostgreSQL 15+ instance on Amazon RDS / Google Cloud SQL.
- [ ] Enforce SSL/TLS `verify-full` connection security.
- [ ] Configure automated daily WAL archiving and snapshots.
- [ ] Execute `MigrationRunner.runAll()` inside staging CI/CD pipeline.
