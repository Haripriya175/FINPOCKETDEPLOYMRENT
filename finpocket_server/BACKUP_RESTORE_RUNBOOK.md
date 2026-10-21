# FinPocket — PostgreSQL Backup & Restore Runbook

Scope: production/staging PostgreSQL deployments of the FinPocket backend
(engine `postgres`). Covers what to back up, how to restore onto a fresh
cluster (including the least-privilege roles and RLS policies), and how to
verify a restore. Development SQLite notes are at the end.

---

## 1. What a full backup consists of

| Component | Why | Where it lives |
|---|---|---|
| Database (schema + data + RLS policies + `schema_migrations`) | Everything user-facing | `pg_dump -Fc` file |
| Cluster roles (`finpocket_app`, `finpocket_system`) | Not part of a database dump — they are cluster-wide | Re-created with `npm run db:provision` (preferred) or `pg_dumpall --roles-only` |
| Secrets (`.env`: `JWT_SECRET`, DB URLs, Setu/Razorpay/Google credentials) | App cannot boot without them | Secret store — **never** in the repo, never in the dump dir in plain text |
| Application build (`dist/`) | Reproducible from source; not a backup item | Redeploy from CI |

> **Rule:** a database dump contains all user PII and financial data.
> Treat dump files like production data: restrict file permissions,
> encrypt at rest, and never commit or log them.

---

## 2. Backup procedure

Run as a user that can read the target database (owner or superuser):

```bash
# 1. Database (schema + data + policies), custom (compressible, restorable piecewise)
pg_dump -Fc -d <DB_NAME> -f <BACKUP_DIR>/finpocket_$(date +%F).dump

# 2. Roles (optional if you rely on db:provision — see below)
pg_dumpall --roles-only -f <BACKUP_DIR>/finpocket_roles_$(date +%F).sql

# 3. Verify the dump is readable (cheap integrity check)
pg_restore -l <BACKUP_DIR>/finpocket_$(date +%F).dump | head -20
```

Suggested schedule: nightly `pg_dump -Fc`, retain 7 daily + 4 weekly.
Example cron line (server local time, 03:15):

```cron
15 3 * * * pg_dump -Fc -d finpocket -f /var/backups/finpocket/finpocket_$(date +\%F).dump && find /var/backups/finpocket -name 'finpocket_*.dump' -mtime +28 -delete
```

Notes:
- `pg_dump` is consistent without stopping the server (MVCC snapshot).
- Back up `.env` **separately** through your secret manager. Losing
  `JWT_SECRET` invalidates all sessions (recoverable); losing the DB
  passwords is recoverable via `db:provision` rotation; losing Setu/Razorpay
  secrets is NOT recoverable from the dump.

---

## 3. Restore procedure

### 3.1 Fresh cluster (disaster recovery)

The provision → migrate → boot order is mandatory: migrations run
`CREATE POLICY` statements that validate the roles exist, and the server
refuses to boot if the runtime role is wrong (fail-closed role assertion).

```bash
# 1. Create the database
createdb <DB_NAME>

# 2. Create/verify least-privilege roles (cluster-wide, idempotent;
#    also rotates their passwords to the values in your env)
MIGRATIONS_DATABASE_URL=postgresql://<owner>@<host>:5432/<DB_NAME> \
FINPOCKET_APP_DB_PASSWORD=<new app password, >=12 chars> \
FINPOCKET_SYSTEM_DB_PASSWORD=<new system password, >=12 chars> \
npm run db:provision

# 3. Restore data + schema (as owner; RLS policies and grants come with it)
pg_restore -d <DB_NAME> <BACKUP_DIR>/finpocket_<date>.dump

# 4. Reconcile migration state (must report applied=0 — dump already contains
#    the schema; any other result means dump/migration versions differ)
MIGRATIONS_DATABASE_URL=postgresql://<owner>@<host>:5432/<DB_NAME> npm run db:migrate

# 5. Boot the server with all three URLs
#    DATABASE_URL            -> postgresql://finpocket_app@.../<DB_NAME>
#    DATABASE_SYSTEM_URL     -> postgresql://finpocket_system@.../<DB_NAME>
#    MIGRATIONS_DATABASE_URL -> owner URL (used at boot for migration check)
npm run start   # or your process manager

# 6. Verify (see section 4)
```

If restoring onto a cluster where the roles were lost and you cannot use
`db:provision` (e.g., offline), restore `finpocket_roles_*.sql` **before**
step 3.

### 3.2 Same cluster, overwrite in place

```bash
# Stop the app first (or restore into a new DB name and switch DATABASE_URL)
pg_restore -d <DB_NAME> --clean --if-exists <BACKUP_DIR>/finpocket_<date>.dump
```

Prefer restore-to-new-name + switch: it keeps the old data intact until the
new restore is verified.

---

## 4. Post-restore verification checklist

```sql
-- 4.1 Migration state matches the build
SELECT * FROM schema_migrations ORDER BY version;
-- expect: latest applied versions, identical to pre-backup

-- 4.2 RLS is still enforced on the app role (no context => zero data rows)
SET ROLE finpocket_app;
SELECT count(*) FROM transactions;   -- expect 0 without app.current_user_id
RESET ROLE;

-- 4.3 Roles are not superusers and lack BYPASSRLS
SELECT rolname, rolsuper, rolbypassrls FROM pg_roles
 WHERE rolname IN ('finpocket_app', 'finpocket_system');
-- expect: f, f for both
```

HTTP smoke test (server booted against the restored DB):

```
GET  /health/live                 -> 200
POST /api/v1/auth/register        -> 201 (writes user + emergency_funds under RLS context)
POST /api/v1/auth/login           -> 200 with token
GET  /api/v1/transactions         -> 200, only the new user's rows
```

If the role assertion fails at boot (`role check failed`), the restored
cluster's roles are wrong — re-run `npm run db:provision`; do **not** point
`DATABASE_URL` at an owner/superuser to bypass it.

---

## 5. Development (SQLite) backup

The dev database is a single file (`finpocket_server/finpocket.db`):

```powershell
# Consistent snapshot without stopping the server
node -e "const {DatabaseSync}=require('node:sqlite');const d=new DatabaseSync('finpocket.db');d.exec(\"VACUUM INTO 'finpocket_backup.db'\");d.close()"
```

or stop the server and copy `finpocket.db` (+ `-wal`/`-shm` if present).

Never restore a dev SQLite file over a production PostgreSQL deployment —
they are separate engines by design (no silent fallback in production).

---

## 6. Restore drill

Quarterly: restore the latest dump into a scratch database
(e.g., `finpocket_restore_drill`), run section 4's checklist against it,
then drop the scratch database. A backup that has never been restored is
not a backup.
