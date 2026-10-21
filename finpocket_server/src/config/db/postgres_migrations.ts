/**
 * PostgreSQL migration runner.
 *
 * Guarantees (production-readiness spec):
 *  - Versioned, idempotent migrations recorded in a schema_migrations history
 *    table — no fabricated success counts (the old MigrationRunner's PG branch
 *    returned a fake result without executing anything).
 *  - Each migration runs inside its own transaction: it either fully applies
 *    (plus its history row) or is rolled back and startup fails.
 *  - A session-level advisory lock serializes concurrent boots so two replicas
 *    cannot race the same migration.
 *  - Only structural changes: no seeding of demo accounts/credentials/data.
 *  - Errors are sanitized (connection strings never leak into messages).
 */
import type { Pool } from 'pg';
import { sanitizePgError } from './pg_pool.js';
import { POSTGRES_MIGRATIONS } from './migrations/index.js';

/** Arbitrary app-wide constant; unique per application to avoid lock clashes. */
const ADVISORY_LOCK_KEY = 727_563_101;

export interface MigrationRunResult {
  /** Migrations applied by THIS run. */
  applied: number;
  /** Highest recorded version after the run. */
  currentVersion: number;
}

export async function runPostgresMigrations(pool: Pool): Promise<MigrationRunResult> {
  const client = await pool.connect();
  let locked = false;
  try {
    await client.query('SELECT pg_advisory_lock($1)', [ADVISORY_LOCK_KEY]);
    locked = true;

    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        version INTEGER PRIMARY KEY,
        name TEXT NOT NULL,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `);

    const { rows } = await client.query<{ version: number }>('SELECT version FROM schema_migrations');
    const appliedVersions = new Set(rows.map((r) => r.version));

    let applied = 0;
    const ordered = [...POSTGRES_MIGRATIONS].sort((a, b) => a.version - b.version);

    for (const migration of ordered) {
      if (appliedVersions.has(migration.version)) continue;

      await client.query('BEGIN');
      try {
        await client.query(migration.sql);
        await client.query(
          'INSERT INTO schema_migrations (version, name) VALUES ($1, $2)',
          [migration.version, migration.name]
        );
        await client.query('COMMIT');
        applied++;
        console.log(`[Migrations] Applied ${migration.version} — ${migration.name}`);
      } catch (err) {
        await client.query('ROLLBACK').catch(() => {});
        throw new Error(
          `Migration ${migration.version} (${migration.name}) failed and was rolled back: ${sanitizePgError(err)}`
        );
      }
    }

    const cur = await client.query<{ v: number }>('SELECT COALESCE(MAX(version), 0) AS v FROM schema_migrations');
    return { applied, currentVersion: cur.rows[0].v };
  } finally {
    if (locked) {
      await client.query('SELECT pg_advisory_unlock($1)', [ADVISORY_LOCK_KEY]).catch(() => {});
    }
    client.release();
  }
}
