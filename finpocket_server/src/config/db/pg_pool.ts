/**
 * The ONE shared PostgreSQL connection pool for the whole application.
 *
 * Phase A findings this replaces: three ad-hoc `new Pool()` instances created
 * per Account-Aggregator operation inside account_aggregator.provider.ts, with
 * no timeouts, no idle-client error handling, no TLS layer and no graceful
 * close — and every failure swallowed by an empty catch.
 *
 * Configuration is env-driven and never logs credentials:
 *   PG_POOL_MAX             pool cap (default 10)
 *   PG_IDLE_TIMEOUT_MS      idle-client reclaim (default 30000)
 *   PG_CONNECT_TIMEOUT_MS   connect timeout (default 5000)
 *   PGSSLMODE               disable | require | verify-ca | verify-full
 *                           (also accepts POSTGRES_SSL as a boolean-ish alias)
 *   PGSSLROOTCERT           path to a root CA / server cert PEM
 *   PGSSL_REJECT_UNAUTHORIZED=false  → explicit, loudly-warned opt-out
 *
 * TLS posture (spec): certificate verification is ON by default. Turning it
 * off requires an explicit env flag AND produces a warning; in PRODUCTION a
 * disabled verification is a startup failure, never a silent downgrade.
 */
import fs from 'fs';
import { Pool, types } from 'pg';

// ---------------------------------------------------------------------------
// Result-shape parity with SQLite (application code does arithmetic on row
// values and string-operations on timestamps — pg defaults would break both).
//   NUMERIC    → Number      (schema uses DOUBLE PRECISION; this is defense)
//   TIMESTAMPTZ → ISO-8601 UTC string (SQLite stored ISO strings)
//   DATE       → left as 'YYYY-MM-DD' text (default), matching SQLite TEXT dates
// ---------------------------------------------------------------------------
types.setTypeParser(1700, (v: string) => Number(v));
types.setTypeParser(1184, (v: string) => new Date(v).toISOString());
// Timestamp WITHOUT time zone: treated as UTC by convention (SQLite's
// CURRENT_TIMESTAMP produces UTC strings).
types.setTypeParser(1114, (v: string) => new Date(`${v.replace(' ', 'T')}Z`).toISOString());

const DEFAULT_ENVIRONMENTS_REQUIRING_TLS = new Set(['PRODUCTION', 'STAGING']);

function resolveSslOptions(env: NodeJS.ProcessEnv): Record<string, unknown> | undefined {
  const mode = (env.PGSSLMODE || env.POSTGRES_SSL || '').toLowerCase();
  const disabled = mode === 'disable' || mode === 'disabled' || mode === 'false' || mode === 'off' || mode === '0';

  const environment = (env.NODE_ENV || 'DEMO').toUpperCase();

  if (disabled) {
    if (DEFAULT_ENVIRONMENTS_REQUIRING_TLS.has(environment)) {
      throw new Error(
        '[FATAL] TLS is disabled (PGSSLMODE/POSTGRES_SSL) but the environment requires it. ' +
          'Refusing to start without transport encryption.'
      );
    }
    return undefined; // local, plaintext (e.g. local dev Postgres)
  }

  const opts: Record<string, unknown> = {};
  const rootCert = env.PGSSLROOTCERT;
  if (rootCert && fs.existsSync(rootCert)) {
    opts.ca = fs.readFileSync(rootCert);
  }

  const reject = (env.PGSSL_REJECT_UNAUTHORIZED || '').toLowerCase();
  if (reject === 'false' || reject === '0') {
    console.warn(
      '[DB] WARNING: PGSSL_REJECT_UNAUTHORIZED=false — TLS certificate verification is DISABLED. ' +
        'This must never be used in production.'
    );
    opts.rejectUnauthorized = false;
  }
  // Everything else (require / verify-ca / verify-full / unset) verifies the
  // server certificate against the provided CA or the system trust store.
  return opts;
}

let pools = new Map<string, Pool>();

/** Redact any userinfo from a message that might embed a connection string. */
export function sanitizePgError(err: unknown): string {
  const raw = err instanceof Error ? err.message : String(err);
  return raw.replace(/\/\/[^@\s/]+@/g, '//***@');
}

export type PoolKey = 'app' | 'system' | 'migrations';

/**
 * Named pool registry — Phase D needs up to three connections with DIFFERENT
 * database roles (least privilege):
 *   app       finpocket_app    — normal API requests, RLS-enforced
 *   system    finpocket_system — unauthenticated webhook/callback routes
 *   migrations owner/admin     — DDL only, used by the migration CLI/startup
 * The first call for a key wins (same singleton semantics as before).
 */
export function getPgPool(connectionString: string, key: PoolKey = 'app'): Pool {
  const existing = pools.get(key);
  if (existing) return existing;

  const p = new Pool({
    connectionString,
    max: Number(process.env.PG_POOL_MAX) || 10,
    idleTimeoutMillis: Number(process.env.PG_IDLE_TIMEOUT_MS) || 30_000,
    connectionTimeoutMillis: Number(process.env.PG_CONNECT_TIMEOUT_MS) || 5_000,
    application_name: key === 'app' ? 'finpocket-api' : `finpocket-api-${key}`,
    // SQLite stored ISO-8601 UTC strings; pin every session to UTC in the
    // connection startup packet so strftime→to_char month buckets and every
    // timestamp round-trip behave identically.
    options: '-c TimeZone=UTC',
    ssl: resolveSslOptions(process.env),
  });

  // A client that errors while idle must not take the pool (or the process)
  // down — pg would otherwise emit an unhandled 'error' event.
  p.on('error', (err) => {
    console.error(`[DB] Idle PostgreSQL client error (${key}):`, sanitizePgError(err));
  });

  pools.set(key, p);
  return p;
}

export async function closePgPool(): Promise<void> {
  const all = [...pools.values()];
  pools = new Map();
  await Promise.all(all.map((p) => p.end()));
}
