# FinPocket — Staging Deployment & Release Runbook (2026-10-15)

Everything below was executed and verified on this machine. Secrets live in
`.env.staging` / `android/key.properties` — both are gitignored (`.env.*`,
`key.properties`, `*.jks`). Never commit, paste or screenshot them.

## Topology (current)

```
Phone / friends  ──HTTPS──>  https://affiliates-frank-accurately-yard.trycloudflare.com
                               (cloudflared quick tunnel, TLS at Cloudflare edge)
                                        │ http
                                        ▼
                     localhost:8787  Express (NODE_ENV=STAGING)
                                        │ TLS (PGSSLROOTCERT=server.crt)
                                        ▼
                     localhost:5432  PostgreSQL 18, DB = finpocket_staging
                     roles: finpocket_app (RLS) / finpocket_system (webhooks)
```

Local dev on :3001 (SQLite, seeded) is unchanged and independent.

## Servers currently running

| What | Where | Started by |
|---|---|---|
| Dev API (SQLite) | http://localhost:3001 | `node dist/index.js` |
| Staging API (PG+TLS) | http://localhost:8787 | env from `.env.staging` then `node dist/index.js` |
| HTTPS tunnel | trycloudflare URL above | `D:\VMwareTemp\opencode\cloudflared.exe tunnel --url http://localhost:8787 --no-autoupdate` |

## Restarting the staging API (any time)

```powershell
cd "D:\Finpocket Final Mobile\finpocket_server"
Get-Content .env.staging | ForEach-Object {
  if ($_ -match '^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=(.*)$') {
    [Environment]::SetEnvironmentVariable($matches[1], $matches[2], 'Process') } }
node dist/index.js
```

`.env` provides provider creds (Setu sandbox, Google, Razorpay test, Meta);
`.env.staging` overrides environment/DB/TLS/URLs (dotenv never overwrites
already-set process vars).

## Database maintenance

- Schema is at version **2** (`0001_core_schema_parity`, `0002_rls_policies`).
- New migration: add to `src/config/db/migrations/`, then run
  `MIGRATIONS_DATABASE_URL=<owner in .env.staging> npm run db:migrate`.
- Role password rotation: `FINPOCKET_APP_DB_PASSWORD=… FINPOCKET_SYSTEM_DB_PASSWORD=…
  npm run db:provision` (idempotent, values already in `.env.staging`).

## PostgreSQL TLS (enabled 2026-10-15)

- Server: `ssl = on` appended to `C:\Program Files\PostgreSQL\18\data\postgresql.conf`
  (backup: `postgresql.conf.finpocket-tls.bak`; applied via `pg_reload_conf()` —
  no service restart needed).
- Cert: self-signed, SAN=localhost, 10y — `data\server.crt` + `server.key`.
- Client trust: `.env.staging` sets `POSTGRES_SSL=true` + `PGSSLROOTCERT`.
- STAGING/PRODUCTION refuse to boot on plaintext PG connections (by design).

## Tunnel notes (quick tunnel)

- URL is **ephemeral**: a new `cloudflared` session gets a new URL — restarts
  require rebuilding the APK with the new `FINPOCKET_API_HOST`, OR switch to a
  named tunnel with a stable subdomain (one-time `cloudflared tunnel login` +
  DNS, then the URL never changes).
- The PC must stay awake/online while friends use the app.

## Release APK

```powershell
cd "D:\Finpocket Final Mobile\finpocket_app"
flutter build apk --release `
  --dart-define=FINPOCKET_ENV=staging `
  --dart-define=FINPOCKET_API_HOST=https://<tunnel-url> `
  --dart-define=GOOGLE_SERVER_CLIENT_ID=<server .env GOOGLE_CLIENT_ID value>
```

- Signed by `android/app/upload-keystore.jks` via `android/key.properties`
  (password stored there only; alias `finpocket`).
- **Release SHA-1 (register in Google Cloud Console → your OAuth client →
  Android apps before Google Sign-In will work in the release build):**
  `47:4E:8D:11:C3:1A:79:72:82:84:F1:05:8C:9D:B5:5B:0E:C2:DB:B3`
- Debug builds use the debug SHA-1 already registered; switching debug→release
  on a device requires uninstall-first (signature differs).

## Smoke checklist (staging over public HTTPS)

1. `GET /health/live` → `{"status":"UP","environment":"STAGING"}`
2. `POST /api/v1/auth/register` → 201 with token
3. `POST /api/v1/auth/login` → 200
4. `GET /api/v1/accounts` with Bearer → `{"accounts":[]}` (RLS-scoped)
5. `GET /api/v1/financial/monthly-summary?months=3` → `{"summary":…}`

All five passed 2026-10-15 through the tunnel.

## Known limitations (honest list)

- Setu is **sandbox** (STAGING allows it; PRODUCTION guard requires real AA
  creds — bank linking in the friends build talks to Setu sandbox).
- Razorpay is in **test mode** (test keys from `.env`).
- Google SSO on the release APK needs the SHA-1 above added in the console.
- No email/SMS delivery configured: password-reset tokens are NOT echoed in
  STAGING (by design) — reset flow needs a delivery channel before use.

---

## Appendix: PostgreSQL-only storage cutover (2026-10-15)

All runtime storage is now PostgreSQL. Nothing in the app/server path writes SQLite.

- **Data migration**: `data/finpocket.sqlite` → `finpocket_staging` executed clean —
  1,931 rows across 20 tables, 0 conflicts, 0 errors, per-table counts verified
  (script: `D:\VMwareTemp\opencode\migrate_sqlite_to_pg.cjs`; runs as DB owner,
  FK-safe single transaction, type-coerced, `ON CONFLICT DO NOTHING` preserved
  the staging smoke-test rows).
- **Dev `.env` cutover**: `DB_ENGINE=postgres`, `DATABASE_URL`/`DATABASE_SYSTEM_URL`/
  `MIGRATIONS_DATABASE_URL` + TLS keys copied from `.env.staging` — dev (`:3001`) and
  staging (`:8787`) now share the single PG database `finpocket_staging`.
  Backup: `.env.pg-bak-<timestamp>` (gitignored).
- **Test suite**: engine pinned to SQLite for test entry points (`src/config/database.ts`) —
  `npm test` always uses `finpocket.test.sqlite`, never PG. Verified: 287/287.
- **Verification**: tsc clean; dev server boots on PG (roles verified, schema v2);
  login/accounts/monthly-summary/authme smoke green on `:3001`; route walk 174/0/0;
  staging `:8787` + tunnel healthy throughout.
- **SQLite archive**: `data/finpocket.sqlite` kept read-only as an archive
  (no code path opens it when the engine is postgres).
