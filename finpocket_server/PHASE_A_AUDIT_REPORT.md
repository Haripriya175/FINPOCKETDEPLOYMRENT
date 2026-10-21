# FinPocket Backend — Phase A Repository Audit

Scope: full inspection of `finpocket_server` before any architecture change (production-readiness / PostgreSQL migration engagement). Baseline evidence: `npm test` executed **before any change — 282/282 assertions passed** across 10 suites (SSO 8, security 15, phase2 20, phase3 35, phase4 30, phase5a 35, phase5b 42, phase6 45, setu 22, docker 30). All green on SQLite. `phase5c_postgresql_integration` is outside the `npm test` chain (requires `DATABASE_URL`).

## 1. Dependency map (who touches which engine)

| Engine | Consumers |
|---|---|
| **SQLite** (via 4 helpers in `src/config/database.ts`: `execQuery/runQuery/getQuery/allQuery` + `withTransaction`) | **22 production files**: all 16 route files, `auth.middleware`, and services (`calculations`, `financial_planning`, `financial_insights`, `payments`, `accounts`, `aa_callback`, `consent`, `sync`, `notification`, `google/apple/meta_auth`, `account_aggregator`, `fake_aa_provider`) + `repositories/sqlite_repositories.ts`. 17 test files. Schema DDL lives in code: `initDatabase()` (18 tables + 6 indexes + 3 try/catch ALTERs + demo seed). |
| **PostgreSQL — ad-hoc** | `account_aggregator.provider.ts`: 3 × `new Pool(DATABASE_URL)` **created per operation**, wrapped in empty `catch {}` (lines 559-587, 606-617, 665-695) — mirror-writes balances/transactions to PG whenever `DATABASE_URL` is set, **even while the app reads SQLite** (split-brain; violates "no mixing", "no silent fallback"). |
| **PostgreSQL — standalone CLI** | `setup_postgres.ts`: creates DB, applies `postgres_schema.sql` by naive `split(';')`, **seeds demo user `jithendra@finpocket.com` / `Demo@1234` + demo balances unconditionally**. When run from `dist/`, `postgres_schema.sql` is never copied → `fs.existsSync` false → schema silently skipped while logging success. |
| **PostgreSQL — repos** | `repositories/postgres_repositories.ts`: **imported by nothing**. Implements 3 of 5 interfaces (Account, Transaction, Consent); `IProviderConnectionRepository` + `IFinancialSyncRepository` **missing**. Its `PostgresTransactionRepository` references columns `timestamp`/`state` that exist in no real table (`transactions` has `transaction_date`/`status`). |
| **SQLite repos** | Used by `consent.service`, `sync.service`, `provider_integration.routes`, `transaction_reconciliation`. `SQLiteProviderConnectionRepository` is a fake (hardcoded row, no-op save); `SQLiteFinancialSyncRepository` keeps logs in an **in-memory Map** (lost on restart; `getLastSync` → null forever after reboot) + writes an `audit_logs` row. |
| **Migrations** | `MigrationRunner`: sqlite branch real (2 versions), **PG branch returns fabricated `{applied: 0, currentVersion: migrations.length}`**; invoked **only from a test** — production never runs migrations (schema = `initDatabase()` DDL only). Live dev DB shows `schema_migrations` v1+v2 (historical run). |
| **Background/boot tasks** | `installFinancialDataProvider()` at boot (Mock vs Setu). No cron. Root scripts: `create_live_consent.ts` (imports src directly), `q_tx.mjs` (scratch, hardcoded user id — dev-only). |

## 2. Findings

### Schema / migrations
- **S1 HIGH — `postgres_schema.sql` is not parity with the SQLite schema the code actually runs** (~15 divergences): `users.app_pin_hash NOT NULL` (breaks SSO users w/o PIN); missing `users.phone_verified/sso_provider/upi_id/password_reset_*`; `devices` uses `device_type/trusted` while code writes `device_model/os_version/ip_address/is_trusted`; `sessions` adds `ip_address/user_agent/updated_at` (unused) and FKs `device_id` (code inserts `'device_default'` → would violate); `bank_accounts` missing `provider_type`, `institution_code NOT NULL`; `bills` missing `last_paid_date`; invented `users.app_pin_enabled/is_active` (no code references); `consent_handle UNIQUE` (re-consent updates would now fail); FKs on `transactions.account_id/category_id` (SQLite has none — inserts SQLite accepts would be rejected); BOOLEAN flags vs INTEGER; `audit_logs.metadata JSONB`; **missing tables `provider_connections`, `sync_history`, `schema_migrations`**. Applying it as-is would break auth, devices, and AA flows.
- **S2 HIGH — three competing `provider_connections` schemas.** Live table: `encrypted_access_token, token_expires_at, connection_status…` (from historical migration v2). Code INSERT (`account_aggregator.provider.ts:284`) writes `access_token_encrypted, token_status, expires_at` — **columns that do not exist** (reachable on the fallback link path). A **fresh** SQLite DB never gets the table at all (MigrationRunner not run in prod).
- **S3 MEDIUM — `setup_postgres.ts`**: unsafe unconditional demo seed; naive `--comment`-stripping/`;` split; silent schema skip from `dist/`; statement errors downgraded to warnings.
- **S4 MEDIUM — fake migration reporting**: PG branch of `MigrationRunner` reports success without executing anything (spec violation: no fake counts).

### Connections
- **C1 HIGH — 3 per-operation `Pool`s + empty `catch {}`**: connection churn/leak on throw-before-`end()`, and **every PG failure is swallowed invisibly** (spec: never silently fall back). Dev with `DATABASE_URL` set dual-writes (split-brain).
- **C2 MEDIUM — no pool hardening anywhere**: no max/idle/connect timeouts, no idle-client error handler, no TLS configuration layer, no graceful close (shutdown only closes HTTP server).

### SQL dialect incompatibilities (SQLite → PG)
- **D1 HIGH — flag semantics**: 16+ SQL literals (`is_primary = 1`, `is_revoked = 0/1`, `is_paid_this_cycle`, `is_active = 1`, `is_read`, `phone_verified = 1`) + JS `=== 1`/`=== 0` on returned rows → **BOOLEAN columns would silently break these**. Decision: PG flag columns are `SMALLINT` (0/1).
- **D2 HIGH — double-quoted string literals**: `connection_status = "CONNECTED"` (`payments.service.ts:159`), `consent_status = "ACTIVE"` (`sqlite_repositories.ts:213`) — SQLite quirk-tolerated, **PG syntax error**. Fix = single quotes (valid in both).
- **D3 MEDIUM — SQLite-only constructs**: `strftime('%Y-%m', …)` ×4 (→ `to_char(…, 'YYYY-MM')`), `INSERT OR IGNORE` ×3 prod (→ `… ON CONFLICT DO NOTHING`), `INSERT OR REPLACE` (repos only — PG repos have their own SQL). No `GROUP_CONCAT`, `ROUND(x,2)`, `RANDOM()`, `julianday`, `printf` found in `src`.
- **D4 MEDIUM — placeholders**: all queries use `?` → needs a quote/comment-aware `?`→`$n` rewrite (safe: zero string-interpolated SQL — verified: **no `${}` inside any SQL statement in src**).
- **D5 MEDIUM — result shapes**: pg returns `NUMERIC` as string, `TIMESTAMPTZ` as `Date`; code does arithmetic on values and string-ops on timestamps → mitigated by type parsers (`NUMERIC`→Number, timestamptz→ISO string) + schema choice (`DOUBLE PRECISION` for money, session `TimeZone=UTC`).

### Missing repository implementations
- **M1**: `PostgresProviderConnectionRepository`, `PostgresFinancialSyncRepository` absent (interfaces exist). SQLite counterparts fake/in-memory. `sync_history` table exists in dev DB but is never written.

### Foreign keys / transactions
- SQLite `withTransaction` = mutex + `BEGIN IMMEDIATE` on the single shared connection. PG equivalent must check out **one** client, BEGIN/COMMIT on it, and route all inner queries to that same client (savepoints for nesting) — otherwise queries silently leave the transaction.
- PG schema must mirror SQLite's FK set exactly (S1) to avoid new insert failures; SQLite's runtime `PRAGMA foreign_keys=ON` ≡ PG always-on — parity holds.

### Error handling gaps
- Empty `catch {}` around all PG mirror writes (C1); `setup_postgres` warn-and-continue (S3); `index.ts` logs "Connected to database with foreign keys enforced." unconditionally before/without any verification; 22 × `res.status(500).json({ error: err.message })` in auth routes bypass the sanitizing error handler.

### Test coverage
- Strong on SQLite (282 assertions, executed, green). **Zero tests execute application code against PostgreSQL**; `phase5c` (needs URL) is excluded from `npm test`; `docker_production_verification` asserts file text only. → Phase B/C must add real PG execution tests.

### Authentication & security (Phase D input — full detail from dedicated review)
- **CRITICAL 1**: `POST /auth/forgot-password` returns raw `resetToken` to **any unauthenticated caller** (`auth.routes.ts:370-374`, comment claims demo gating — no condition exists) → any-account takeover + enumeration.
- **CRITICAL 2**: Mock SSO tokens (`mock_gtoken:` / `mock_appletoken:` / `mock_metatoken:`) accepted as **verified identities** in any env except PRODUCTION/STAGING — and `NODE_ENV` defaults to `DEMO` (`app_config.ts:63`), committed `.env` sets `DEVELOPMENT`.
- **HIGH**: default JWT secret fallback with **no STAGING guard** (`app_config.ts:70`); default Setu webhook secret + HMAC optional outside PRODUCTION; **unauthenticated consent mutation** via `GET /setu/redirect` (no signature/ownership, `setu.routes.ts:93-102` + `aa_callback.service.ts:234-247`); **cross-user consent overwrite** in `reconcileLiveConsent` (queries lack `user_id` scoping, `aa_callback.service.ts:354-406`); **IDOR**: `/phone/verify-otp` takes `userId` from body, unauthenticated, sets `phone` + `phone_verified=1` on any account (`auth.routes.ts:552-583`).
- **MEDIUM**: auth rate-limiter mounted on nonexistent path `/auth/password-reset` (real: `/forgot-password`,`/reset-password`) → registration/reset/OTP/PIN/SSO unlimited; **PIN verification compares plaintext to bcrypt hash** (`savings.routes.ts:154` → PIN withdrawals always fail) + no PIN lockout; lockout/OTP state in process memory (resets on restart, per-instance); OTP via `Math.random()`; Apple token verified without `aud`; Meta token not app-bound; refresh-rotation theft is silent (no family revocation on reuse-of-rotated).
- **LOW**: raw `err.message` in 500s; webhook HMAC over re-serialized body; in-memory replay set.
- **Positive**: SQL fully parameterized everywhere (zero interpolation); auth logs clean (redaction allowlist in request tracker); refresh tokens SHA-256-hashed, single-use rotation, per-request session revocation checks; SSO explicit-link gating prevents silent takeover.

## 3. Phase B architecture decision (proceeding unless vetoed)

Keep every service/route/business logic untouched behind the existing `execQuery/runQuery/getQuery/allQuery/withTransaction` façade and swap the driver beneath it per process-wide engine selection:

1. **`db/engine.ts`** — resolve once: PRODUCTION/STAGING **require** `DATABASE_URL` (postgres) or startup fails (no SQLite fallback); dev/demo/test default SQLite (unchanged behavior); `DB_ENGINE=postgres` opts dev into PG; tests refuse to run on PG.
2. **`db/pg_pool.ts`** — single shared `pg.Pool`: connect/idle timeouts, pool cap, idle-client `error` handler, TLS via env (`PGSSLMODE`/`PGSSLROOTCERT`, verification on by default, `PRODUCTION` + disabled verification = startup failure), `TimeZone=UTC` on connect, sanitized errors (connection-string redaction), graceful `close()`.
3. **`db/translate.ts`** — mechanical, quote-aware translation of the dialect constructs that actually exist (audit-verified): `?`→`$n`, `strftime('%Y-%m',…)`→`to_char`, `INSERT OR IGNORE`→`ON CONFLICT DO NOTHING`; **unknown SQLite constructs throw loudly** (no silent half-translation).
4. **`db/postgres.ts`** — helpers over the pool; `withTransaction` pins one client via `AsyncLocalStorage` scope (foundation for Phase D `SET LOCAL app.current_user_id` RLS context); returns `{changes: rowCount}` parity.
5. **`database.ts`** — same exported API (39 importers unchanged), dispatches by engine; PG mode: ping → migrations → **no seed**; `closeDatabase()` for shutdown.
6. **Schema parity migration (`0001`)** as a versioned TS-embedded SQL migration (tsc does not copy `.sql` to `dist/`), history table + advisory lock + per-migration transaction. RLS as `0002` (Phase D).
7. Remove the 3 ad-hoc pools/dual-writes; fix D2 literals; fix the `provider_connections` INSERT column names; quarantine `setup_postgres.ts` (refuses to run in PRODUCTION).

Rejected alternative: rewriting all 22 data files onto per-engine repositories — violates the "do not rebuild / preserve business logic" rules and would invalidate the 282-assertion safety net.

---

## 4. Findings — closure status (2026-10-15)

Every finding above was fixed and re-verified. Evidence is from executed runs only.

### Schema / connections / dialect (Phases B+C)
- **S1, S2, D1, D2** — closed: versioned migration `0001_core_schema_parity` (advisory-locked, transactional) is now the single source of schema truth for PG; `provider_connections` INSERT column names fixed to the live table; flag columns are SMALLINT (0/1 semantics preserved); all 34 double-quoted/backtick literals fixed — verified live on PG (34/34 query checks, later 21/21 RLS checks).
- **C1** — closed: one shared pool (`pg_pool.ts`) with connect/idle timeouts, pool cap, idle-client error handler, connection-string redaction; DB failure aborts boot loudly (no swallowed errors, no dual-write).
- Missing repository implementations, FK/transaction gaps, error-handling, test coverage — closed through Phases B–C; regression net = **287/287** assertions.

### Authentication & security (Phase D)
- **CRITICAL 1** (forgot-password token leak) — closed: `resetToken` is echoed ONLY in TEST/DEVELOPMENT/DEMO (`auth.routes.ts` echoToken gate); STAGING/PRODUCTION keep it server-side.
- **CRITICAL 2** (mock SSO tokens) — closed: `allowMockSso` defaults false outside TEST/DEVELOPMENT; client-side mock token fabrication (`mock_gtoken:`/`mock_appletoken:`/`mock_metatoken:`) deleted from the app; Google/Apple/Meta now run real flows (Apple idToken JWKS + aud verified).
- **HIGH default JWT secret / no STAGING guard** — closed: PRODUCTION refuses weak/default secrets; the staging deployment runs a freshly generated 64-hex secret in `.env.staging` (gitignored, never logged).
- **HIGH default webhook secret / optional HMAC** — closed: PRODUCTION refuses AA boot without an explicit `SETU_WEBHOOK_SECRET`; staging generated a fresh one; unsigned/invalid webhooks are rejected fail-closed.
- **HIGH unauthenticated consent mutation (`GET /setu/redirect`)** — closed: consent redirect URLs carry a signed state `fp_state=<consentId>.<HMAC(jwtSecret, "finpocket:setu-redirect:v1")>`; verification is timing-safe. In STAGING/PRODUCTION an invalid/unsigned state performs NO mutation (recorded; unsigned-success falls back to provider reconcile, fail-closed). TEST/DEVELOPMENT keep the legacy sandbox path. Pinned by 5 new tests (setu_callback_integration 23–27).
- **HIGH cross-user consent overwrite in `reconcileLiveConsent`** — closed: reconcile now takes an explicit `userId` and scopes every read/write to that user.
- **HIGH IDOR `/phone/verify-otp`** — closed: authed requests write only their own account; unauthenticated requests only the account the OTP was issued to (OTP record binds the target). Attacker-supplied `userId` is ignored.
- **MEDIUM rate-limiter on nonexistent path** — closed: `authLimiter` mounted on the real auth paths (including `/auth/pin/verify`); limiter behavior exercised in the route walk without tripping.
- **MEDIUM PIN plaintext-vs-bcrypt** — closed: PIN verification is bcrypt and ONLY server-side (`POST /auth/pin/verify`, rate-limited). All local `'1234'` comparisons removed (server and app). EF withdraw also enforces `is_locked` → 403 server-side (was client-only).
- **MEDIUM OTP `Math.random`** — closed: `crypto.randomInt` CSPRNG + attempt cap (4) + expiry.
- **LOW raw `err.message` 500s / webhook re-serialization / replay set** — closed in the hardening sweep (sanitized error mapping, raw-body HMAC, timestamp-window replay set).

### Wire gaps found during the inch-by-inch verification (post-audit)
- **W1 HIGH — `is_primary = 1` was never written by any connect path** while six consumers require a primary account (EF deposit/withdraw, goals add-funds, bills pay, payments, expense deduction): for real users every money-moving feature dead-ended. Fixed: first connected account becomes primary in all three connect paths (mock provider, AA provider connect, AA callback promotion). Verified live over HTTP: route walk asserts `isPrimary: true` from `/accounts/connect-mock`.
- **W2 MED — account sync "not found" reported as 500** — fixed to 404 (`ACCOUNT_NOT_FOUND`) on both sync routes.
- **W3 financial contract aliases** — `/pending` returns `pending` + `pendingPayments`; `/monthly-summary` and `/spending` accept `months ?? periodMonths`; `/spending` returns `categories` + `categorySpending`.

### Verification evidence (executed)
- `tsc` clean + `npm test` **287/287** (10 suites).
- Live PostgreSQL RLS proof **21/21** (`pg_rls_verify.cjs`: provision -> migrate -> boot with role assertions; cross-user isolation enforced).
- Full-route HTTP walk on a fresh server: **174 passed / 0 failed / 0 warnings** (unauth probes prove every route exists and none crash; authenticated walk proves field contracts, PIN wire, EF lock 403/bcrypt 401/200, refresh/logout; negative control proves the detector works).
- STAGING deployment (PostgreSQL + TLS + RLS) behind public HTTPS: health/register/login/accounts/monthly-summary **5/5** from the public internet.
- Flutter: `flutter analyze` at the 32-issue baseline; `flutter test` **128/128**.
