"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.runPostgresMigrations = runPostgresMigrations;
const pg_pool_js_1 = require("./pg_pool.js");
const index_js_1 = require("./migrations/index.js");
/** Arbitrary app-wide constant; unique per application to avoid lock clashes. */
const ADVISORY_LOCK_KEY = 727_563_101;
async function runPostgresMigrations(pool) {
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
        const { rows } = await client.query('SELECT version FROM schema_migrations');
        const appliedVersions = new Set(rows.map((r) => r.version));
        let applied = 0;
        const ordered = [...index_js_1.POSTGRES_MIGRATIONS].sort((a, b) => a.version - b.version);
        for (const migration of ordered) {
            if (appliedVersions.has(migration.version))
                continue;
            await client.query('BEGIN');
            try {
                await client.query(migration.sql);
                await client.query('INSERT INTO schema_migrations (version, name) VALUES ($1, $2)', [migration.version, migration.name]);
                await client.query('COMMIT');
                applied++;
                console.log(`[Migrations] Applied ${migration.version} — ${migration.name}`);
            }
            catch (err) {
                await client.query('ROLLBACK').catch(() => { });
                throw new Error(`Migration ${migration.version} (${migration.name}) failed and was rolled back: ${(0, pg_pool_js_1.sanitizePgError)(err)}`);
            }
        }
        const cur = await client.query('SELECT COALESCE(MAX(version), 0) AS v FROM schema_migrations');
        return { applied, currentVersion: cur.rows[0].v };
    }
    finally {
        if (locked) {
            await client.query('SELECT pg_advisory_unlock($1)', [ADVISORY_LOCK_KEY]).catch(() => { });
        }
        client.release();
    }
}
//# sourceMappingURL=postgres_migrations.js.map