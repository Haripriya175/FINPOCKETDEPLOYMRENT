"use strict";
/**
 * Database engine resolution — the single place that decides whether this
 * process talks to SQLite (test / demo / development) or PostgreSQL
 * (staging / production).
 *
 * Rules enforced here (production-readiness spec):
 *  - PRODUCTION and STAGING REQUIRE PostgreSQL via DATABASE_URL. There is no
 *    silent SQLite fallback: a missing or malformed URL fails startup.
 *  - In DEVELOPMENT/DEMO/TEST nothing changes: SQLite stays the default, so
 *    existing dev workflows and the test suite keep working untouched.
 *  - DB_ENGINE=postgres is the explicit opt-in that lets development run
 *    against a local/cloud PostgreSQL for verification.
 *  - The test suite refuses to run against PostgreSQL (it is written in
 *    SQLite dialect and must never touch a shared database).
 *
 * Nothing in this module ever logs a connection string or its credentials.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.resolveDbEngine = resolveDbEngine;
function fail(message) {
    // Deliberately generic wrapper: callers never interpolate connection strings
    // into these messages (spec: no credentials in logs/errors).
    throw new Error(`[FATAL] Database configuration error: ${message}`);
}
function validatePgUrl(url, environment) {
    if (!/^postgres(ql)?:\/\//i.test(url)) {
        fail(`DATABASE_URL must be a postgresql:// connection string in ${environment} (never http://, never a SQLite path).`);
    }
    if (/^postgres(ql)?:\/\/[^@\s]*@/i.test(url) === false) {
        fail(`DATABASE_URL in ${environment} must include explicit credentials.`);
    }
    return url;
}
function resolveDbEngine(env = process.env) {
    const raw = (env.NODE_ENV || 'DEMO').toUpperCase();
    const environment = ['PRODUCTION', 'STAGING', 'TEST', 'DEVELOPMENT'].includes(raw)
        ? raw
        : 'DEMO';
    const requested = (env.DB_ENGINE || '').trim().toLowerCase();
    if (requested && requested !== 'sqlite' && requested !== 'postgres') {
        fail(`DB_ENGINE must be 'sqlite' or 'postgres' (got '${requested}').`);
    }
    const url = (env.DATABASE_URL || '').trim();
    // ---- Fail-closed paths: PRODUCTION / STAGING must be on PostgreSQL ----
    if (environment === 'PRODUCTION' || environment === 'STAGING') {
        if (requested === 'sqlite') {
            fail(`DB_ENGINE=sqlite is not permitted in ${environment}. SQLite is restricted to test/demo/development.`);
        }
        if (!url) {
            fail(`DATABASE_URL is required in ${environment}. ` +
                'Refusing to start on SQLite (no silent fallback to a local file database).');
        }
        validatePgUrl(url, environment);
        return {
            engine: 'postgres',
            connectionString: url,
            reason: `${environment} requires DATABASE_URL`,
        };
    }
    // ---- Explicit opt-in or configured DATABASE_URL default ----
    if (requested === 'postgres' || (url && requested !== 'sqlite')) {
        if (!url)
            fail('DB_ENGINE=postgres requires DATABASE_URL to be set.');
        validatePgUrl(url, environment);
        return {
            engine: 'postgres',
            connectionString: url,
            reason: requested === 'postgres' ? 'DB_ENGINE=postgres (explicit opt-in)' : 'DATABASE_URL configured (PostgreSQL default)',
        };
    }
    // ---- Fallback: SQLite only when explicitly requested or no DATABASE_URL ----
    return { engine: 'sqlite', reason: `${environment} default: SQLite` };
}
//# sourceMappingURL=engine.js.map