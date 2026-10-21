"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
/**
 * Apply versioned PostgreSQL migrations as the OWNER role:
 *
 *   MIGRATIONS_DATABASE_URL=postgres://owner... npm run db:migrate
 *
 * (falls back to DATABASE_URL for local development where that connection is
 * already the owner). The application runtime roles CANNOT run this — DDL is
 * owner-only by design, and the server refuses to boot on a missing schema
 * rather than creating tables with its request role.)
 */
const dotenv_1 = __importDefault(require("dotenv"));
const pg_1 = require("pg");
const postgres_migrations_js_1 = require("../config/db/postgres_migrations.js");
const pg_pool_js_1 = require("../config/db/pg_pool.js");
dotenv_1.default.config();
async function main() {
    const url = (process.env.MIGRATIONS_DATABASE_URL || process.env.DATABASE_URL || '').trim();
    if (!url) {
        console.error('[migrate] FAIL: set MIGRATIONS_DATABASE_URL (or DATABASE_URL for owner-run local dev).');
        process.exit(1);
    }
    const pool = new pg_1.Pool({ connectionString: url, connectionTimeoutMillis: 5000 });
    try {
        const result = await (0, postgres_migrations_js_1.runPostgresMigrations)(pool);
        console.log(`[migrate] OK — applied ${result.applied} migration(s); schema version = ${result.currentVersion}.`);
        if (result.applied === 0) {
            console.log('[migrate] Schema already up to date.');
        }
    }
    catch (err) {
        console.error('[migrate] FAILED:', (0, pg_pool_js_1.sanitizePgError)(err));
        console.error('[migrate] Hint: the URL must be the database OWNER, and `npm run db:provision` must run first (migration 0002 needs the RLS roles).');
        process.exitCode = 1;
    }
    finally {
        await pool.end();
    }
}
main().catch((err) => {
    console.error('[migrate] UNEXPECTED FAILURE:', (0, pg_pool_js_1.sanitizePgError)(err));
    process.exit(1);
});
//# sourceMappingURL=migrate_db.js.map