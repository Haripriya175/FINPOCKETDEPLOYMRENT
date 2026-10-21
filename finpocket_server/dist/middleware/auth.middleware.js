"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.JWT_SECRET = void 0;
exports.authMiddleware = authMiddleware;
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const database_js_1 = require("../config/database.js");
const context_js_1 = require("../config/db/context.js");
const app_config_js_1 = require("../config/app_config.js");
exports.JWT_SECRET = app_config_js_1.config.jwtSecret;
async function authMiddleware(req, res, next) {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        res.status(401).json({ error: 'Authentication required. No Bearer token provided.' });
        return;
    }
    const token = authHeader.split(' ')[1];
    try {
        const decoded = jsonwebtoken_1.default.verify(token, exports.JWT_SECRET);
        // Check if user exists
        const user = await (0, database_js_1.getQuery)('SELECT id, email, name FROM users WHERE id = ?', [decoded.userId]);
        if (!user) {
            res.status(401).json({ error: 'User session invalid or user not found.' });
            return;
        }
        // Check server-side session revocation if sessionId is in token
        if (decoded.sessionId) {
            const session = await (0, database_js_1.getQuery)('SELECT id, is_revoked, expires_at FROM sessions WHERE id = ?', [decoded.sessionId]);
            if (!session) {
                res.status(401).json({ error: 'Session not found or invalid.' });
                return;
            }
            if (session.is_revoked === 1) {
                res.status(401).json({ error: 'Session has been revoked. Please re-authenticate.' });
                return;
            }
            if (new Date(session.expires_at) < new Date()) {
                res.status(401).json({ error: 'Session has expired. Please refresh token or login again.' });
                return;
            }
            req.sessionId = session.id;
        }
        req.user = user;
        req.deviceId = req.headers['x-device-id'] || 'device_default';
        // Phase D RLS: bind THIS request's transaction to the authenticated user.
        // SET LOCAL is transaction-scoped — the identity dies at COMMIT/ROLLBACK,
        // so a pooled connection can never carry one user's context into another
        // request. No scope (SQLite mode / background calls) → no-op.
        const scope = (0, context_js_1.currentScope)();
        if (scope) {
            try {
                await scope.client.query(`SELECT set_config('app.current_user_id', $1, true)`, [user.id]);
                scope.userId = user.id;
            }
            catch (err) {
                console.error('[auth] Failed to establish RLS user context:', err?.message || err);
                res.status(500).json({ error: 'Internal server error. Please try again.' });
                return;
            }
        }
        next();
    }
    catch (err) {
        if (err.name === 'TokenExpiredError') {
            res.status(401).json({ error: 'Access token expired.' });
        }
        else {
            res.status(401).json({ error: 'Invalid or expired authorization token.' });
        }
    }
}
//# sourceMappingURL=auth.middleware.js.map