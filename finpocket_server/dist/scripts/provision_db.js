"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
/**
 * One-time least-privilege role provisioning (Phase D). Run as the database
 * OWNER:
 *
 *   FINPOCKET_APP_DB_PASSWORD=<strong> FINPOCKET_SYSTEM_DB_PASSWORD=<strong> npm run db:provision
 *
 * Connection: MIGRATIONS_DATABASE_URL (preferred) or DATABASE_URL.
 *
 * Creates/rotates exactly two LOGIN roles, both with the least privilege the
 * RLS design needs:
 *   finpocket_app    — API runtime role; row access shaped entirely by the
 *                      per-user policies of migration 0002.
 *   finpocket_system — webhook/callback role (no user context by nature).
 * Neither role is superuser, BYPASSRLS, createdb or createrole — anything
 * more would defeat the point of the policies.
 *
 * The script is idempotent: running it again rotates the passwords and
 * re-issues table grants (safe after every migration). Passwords come from
 * the environment and are NEVER printed, logged or embedded in errors.
 */
const dotenv_1 = __importDefault(require("dotenv"));
const pg_1 = require("pg");
const pg_pool_js_1 = require("../config/db/pg_pool.js");
dotenv_1.default.config();
/** Literal-quote a password for DDL (standard_conforming_strings: only ' matters). */
function lit(value) {
    return `'${value.replace(/'/g, "''")}'`;
}
async function main() {
    const url = (process.env.MIGRATIONS_DATABASE_URL || process.env.DATABASE_URL || '').trim();
    if (!url) {
        console.error('[provision] FAIL: set MIGRATIONS_DATABASE_URL (preferred) or DATABASE_URL to an OWNER connection string.');
        process.exit(1);
    }
    const appPassword = process.env.FINPOCKET_APP_DB_PASSWORD || '';
    const systemPassword = process.env.FINPOCKET_SYSTEM_DB_PASSWORD || '';
    if (!appPassword || !systemPassword) {
        console.error('[provision] FAIL: FINPOCKET_APP_DB_PASSWORD and FINPOCKET_SYSTEM_DB_PASSWORD must both be set (strong, unique, never committed).');
        process.exit(1);
    }
    if (appPassword === systemPassword) {
        console.error('[provision] FAIL: the two role passwords must be different.');
        process.exit(1);
    }
    if (appPassword.length < 12 || systemPassword.length < 12) {
        console.error('[provision] FAIL: role passwords must be at least 12 characters.');
        process.exit(1);
    }
    const pool = new pg_1.Pool({ connectionString: url, connectionTimeoutMillis: 5000 });
    try {
        await pool.query('SELECT 1');
    }
    catch (err) {
        console.error('[provision] FAIL: cannot connect with the owner URL:', (0, pg_pool_js_1.sanitizePgError)(err));
        process.exit(1);
    }
    const roles = [
        { name: 'finpocket_app', password: appPassword },
        { name: 'finpocket_system', password: systemPassword },
    ];
    try {
        for (const role of roles) {
            const existing = await pool.query('SELECT 1 FROM pg_roles WHERE rolname = $1', [role.name]);
            const attrs = `LOGIN PASSWORD ${lit(role.password)} NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS`;
            if (existing.rowCount) {
                await pool.query(`ALTER ROLE ${role.name} WITH ${attrs}`);
                console.log(`[provision] Role ${role.name} already existed — attributes enforced, password rotated.`);
            }
            else {
                await pool.query(`CREATE ROLE ${role.name} ${attrs}`);
                console.log(`[provision] Created role ${role.name} (no superuser, no BYPASSRLS, no createdb/createrole).`);
            }
        }
        // Table grants — idempotent. Before a schema exists this is a no-op;
        // after `npm run db:migrate` it (re)hands out the same grants migration
        // 0002 issues as the owner.
        const anyTable = await pool.query(`SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' LIMIT 1`);
        if (anyTable.rowCount) {
            await pool.query('GRANT USAGE ON SCHEMA public TO finpocket_app, finpocket_system');
            await pool.query('GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO finpocket_app, finpocket_system');
            const hasHistory = await pool.query(`SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'schema_migrations' LIMIT 1`);
            if (hasHistory.rowCount) {
                await pool.query('REVOKE INSERT, UPDATE, DELETE ON schema_migrations FROM finpocket_app, finpocket_system');
            }
            await pool.query('GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO finpocket_app, finpocket_system');
            console.log('[provision] Table grants applied for both roles.');
        }
        else {
            console.log('[provision] No tables yet — grants will be issued by migration 0002 during db:migrate.');
        }
        console.log('[provision] Done. Next steps:');
        console.log('  1) npm run db:migrate          (owner URL: MIGRATIONS_DATABASE_URL)');
        console.log('  2) DATABASE_URL            = connection as finpocket_app');
        console.log('  3) DATABASE_SYSTEM_URL     = connection as finpocket_system');
        console.log('  4) MIGRATIONS_DATABASE_URL = owner connection (for future migrations)');
    }
    catch (err) {
        console.error('[provision] FAILED:', (0, pg_pool_js_1.sanitizePgError)(err));
        process.exitCode = 1;
    }
    finally {
        await pool.end();
    }
}
main().catch((err) => {
    console.error('[provision] UNEXPECTED FAILURE:', (0, pg_pool_js_1.sanitizePgError)(err));
    process.exit(1);
});
//# sourceMappingURL=provision_db.js.map