# FinPocket Staging Deployment Guide

## 1. Prerequisites & Infrastructure Setup

1. **Node.js**: v20.x or higher.
2. **PostgreSQL**: Version 15+ instance (Amazon RDS, Cloud SQL, or containerized).
3. **Environment Variables**: Managed via secure vault injection or `.env.staging`.

---

## 2. Environment Configuration Spec (`.env.staging`)

```ini
# Core Server Configuration
NODE_ENV=STAGING
PORT=3001
CORS_ORIGIN=https://staging-app.finpocket.com

# Cryptographic Keys (Min 32 bytes)
JWT_SECRET=staging_jwt_secret_must_be_minimum_32_bytes_long!!
PROVIDER_ENCRYPTION_KEY=staging_provider_encryption_key_32_bytes_min!!

# Database Configuration (PostgreSQL 15+)
POSTGRES_HOST=staging-postgres.finpocket.internal
POSTGRES_PORT=5432
POSTGRES_DB=finpocket_staging
POSTGRES_USER=finpocket_app_user
POSTGRES_PASSWORD=secure_staging_pg_password_here
POSTGRES_SSL=true

# Safety Gates
FINPOCKET_DEMO_MODE=false
FINPOCKET_ALLOW_MOCK_PROVIDER=false
USE_MOCK_FINANCIAL_PROVIDER=false
```

---

## 3. Step-by-Step Deployment Procedure

### Step 1: Database Provisioning & User Privileges
```sql
CREATE DATABASE finpocket_staging;
CREATE USER finpocket_app_user WITH ENCRYPTED PASSWORD 'secure_staging_pg_password_here';
GRANT ALL PRIVILEGES ON DATABASE finpocket_staging TO finpocket_app_user;
```

### Step 2: Build & Migration Execution
```bash
cd finpocket_server
npm install --production=false
npm run build
# Execute versioned migration chain
node -e "import('./dist/config/migration_runner.js').then(m => m.MigrationRunner.runAll())"
```

### Step 3: Launch Staging Server
```bash
node dist/index.js
```

### Step 4: Health Verification
```bash
curl -I https://staging-api.finpocket.com/health/live
curl -I https://staging-api.finpocket.com/health/ready
```
Both endpoints must return `HTTP/1.1 200 OK`.
