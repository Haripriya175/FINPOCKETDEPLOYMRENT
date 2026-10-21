"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.attachPgPool = attachPgPool;
exports.attachPgSystemPool = attachPgSystemPool;
exports.getSystemPgPool = getSystemPgPool;
exports.getAppPgPool = getAppPgPool;
exports.pgExecQuery = pgExecQuery;
exports.pgRunQuery = pgRunQuery;
exports.pgGetQuery = pgGetQuery;
exports.pgAllQuery = pgAllQuery;
exports.pgWithTransaction = pgWithTransaction;
const context_js_1 = require("./context.js");
const translate_js_1 = require("./translate.js");
const pg_pool_js_1 = require("./pg_pool.js");
let pool = null;
let systemPool = null;
function attachPgPool(p) {
    pool = p;
}
/** The finpocket_system-role pool used by explicitly-scoped webhook routes. */
function attachPgSystemPool(p) {
    systemPool = p;
}
function getSystemPgPool() {
    if (!systemPool) {
        throw new Error('[DB] PostgreSQL system pool not attached — initDatabase() must run before serving requests.');
    }
    return systemPool;
}
function getPool() {
    if (!pool) {
        throw new Error('[DB] PostgreSQL pool not attached — initDatabase() must run before serving requests.');
    }
    return pool;
}
/** The finpocket_app-role pool (request-scope middleware checks out from it). */
function getAppPgPool() {
    return getPool();
}
function sanitize(err) {
    if (err && typeof err.message === 'string') {
        err.message = (0, pg_pool_js_1.sanitizePgError)(err);
    }
    return err;
}
async function execOnAny(query, params) {
    const scope = (0, context_js_1.currentScope)();
    try {
        if (scope) {
            return await scope.client.query(query, params);
        }
        return await getPool().query(query, params);
    }
    catch (err) {
        // PG errors can embed connection info — strip before they reach logs.
        throw sanitize(err);
    }
}
/** Multi-statement, no parameters — matches SQLite's db.exec semantics. */
async function pgExecQuery(sql) {
    try {
        await ((0, context_js_1.currentScope)()?.client ?? getPool()).query((0, translate_js_1.translateToPostgres)(sql));
    }
    catch (err) {
        throw sanitize(err);
    }
}
async function pgRunQuery(sql, params = []) {
    const res = await execOnAny((0, translate_js_1.translateToPostgres)(sql), params);
    return { changes: res.rowCount ?? 0, lastID: undefined };
}
async function pgGetQuery(sql, params = []) {
    const res = await execOnAny((0, translate_js_1.translateToPostgres)(sql), params);
    return res.rows[0];
}
async function pgAllQuery(sql, params = []) {
    const res = await execOnAny((0, translate_js_1.translateToPostgres)(sql), params);
    return res.rows;
}
async function pgWithTransaction(operation) {
    const scope = (0, context_js_1.currentScope)();
    // Already inside a pinned transaction → nest with a savepoint so an inner
    // failure rolls back only the inner work (same semantics as SQLite, where
    // nested calls share the single connection).
    if (scope) {
        const name = `fp_sp_${scope.txDepth + 1}`;
        try {
            await scope.client.query(`SAVEPOINT ${name}`);
        }
        catch (err) {
            throw sanitize(err);
        }
        scope.txDepth += 1;
        try {
            const result = await operation();
            await scope.client.query(`RELEASE SAVEPOINT ${name}`);
            return result;
        }
        catch (err) {
            try {
                await scope.client.query(`ROLLBACK TO SAVEPOINT ${name}`);
            }
            catch {
                /* the outer transaction will fail as a whole anyway */
            }
            throw err;
        }
        finally {
            scope.txDepth -= 1;
        }
    }
    const client = await getPool().connect();
    try {
        return await context_js_1.dbScopeStorage.run({ client, txDepth: 1 }, async () => {
            try {
                await client.query('BEGIN');
            }
            catch (err) {
                throw sanitize(err);
            }
            try {
                const result = await operation();
                await client.query('COMMIT');
                return result;
            }
            catch (error) {
                try {
                    await client.query('ROLLBACK');
                }
                catch (rollbackErr) {
                    console.error('[Database] Rollback failed:', (0, pg_pool_js_1.sanitizePgError)(rollbackErr));
                }
                throw error;
            }
        });
    }
    finally {
        client.release();
    }
}
//# sourceMappingURL=postgres.js.map