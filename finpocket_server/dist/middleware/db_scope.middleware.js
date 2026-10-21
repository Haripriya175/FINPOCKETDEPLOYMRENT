"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.dbScopeMiddleware = dbScopeMiddleware;
exports.systemDbScopeMiddleware = systemDbScopeMiddleware;
const context_js_1 = require("../config/db/context.js");
const database_js_1 = require("../config/database.js");
const postgres_js_1 = require("../config/db/postgres.js");
const pg_pool_js_1 = require("../config/db/pg_pool.js");
/** 5xx or an unfinished response = handler failed mid-work → roll back. */
function outcomeFor(res, finished) {
    if (!finished)
        return 'rollback'; // aborted before completing
    return res.statusCode >= 500 ? 'rollback' : 'commit';
}
async function beginScopedRequest(pool, req, res, next) {
    let client;
    try {
        client = await pool.connect();
    }
    catch (err) {
        console.error('[DB] Request-scope client checkout failed:', (0, pg_pool_js_1.sanitizePgError)(err));
        if (!res.headersSent) {
            res.status(503).json({ error: 'Service temporarily unavailable. Please try again.' });
        }
        return;
    }
    req.__dbScoped = true;
    let settled = false;
    let released = false;
    const releaseOnce = () => {
        if (!released) {
            released = true;
            client.release();
        }
    };
    const settle = async (finished) => {
        if (settled)
            return;
        settled = true;
        try {
            await client.query(outcomeFor(res, finished) === 'commit' ? 'COMMIT' : 'ROLLBACK');
        }
        catch (err) {
            console.error('[DB] Request-scope transaction settle failed:', (0, pg_pool_js_1.sanitizePgError)(err));
        }
        finally {
            releaseOnce();
        }
    };
    try {
        await client.query('BEGIN');
    }
    catch (err) {
        console.error('[DB] Request-scope BEGIN failed:', (0, pg_pool_js_1.sanitizePgError)(err));
        releaseOnce();
        if (!res.headersSent) {
            res.status(503).json({ error: 'Service temporarily unavailable. Please try again.' });
        }
        return;
    }
    // Response lifecycle → transaction outcome. 'finish' = handler completed
    // (5xx rolls back partial writes; 4xx commits — e.g. LOGIN_FAILED audits).
    // 'close' without 'finish' = client aborted → roll back unfinished work.
    let finished = false;
    res.once('finish', () => {
        finished = true;
        void settle(true);
    });
    res.once('close', () => {
        void settle(finished);
    });
    // Enter the ALS scope BEFORE continuing the chain: everything downstream
    // (auth set_config, handlers, services, withTransaction savepoints) inherits
    // this pinned client.
    context_js_1.dbScopeStorage.run({ client, txDepth: 1 }, () => {
        next();
    });
}
/** Normal API requests — finpocket_app role, user context set by authMiddleware. */
function dbScopeMiddleware(req, res, next) {
    if (!(0, database_js_1.isPostgresEngine)())
        return next();
    const scopedReq = req;
    if (scopedReq.__dbScoped)
        return next();
    void beginScopedRequest((0, postgres_js_1.getAppPgPool)(), scopedReq, res, next);
}
/**
 * Unauthenticated provider callback routes — finpocket_system role (policies
 * allow access without a user GUC). Marks the request so the generic app
 * scope does not stack a second transaction on top.
 */
function systemDbScopeMiddleware(req, res, next) {
    if (!(0, database_js_1.isPostgresEngine)())
        return next();
    const scopedReq = req;
    if (scopedReq.__dbScoped)
        return next();
    void beginScopedRequest((0, postgres_js_1.getSystemPgPool)(), scopedReq, res, next);
}
//# sourceMappingURL=db_scope.middleware.js.map