"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const auth_middleware_js_1 = require("../middleware/auth.middleware.js");
const database_js_1 = require("../config/database.js");
const uuid_1 = require("uuid");
const router = (0, express_1.Router)();
// Security Audit Trail (Read-only log of security and financial events)
router.get('/audit-logs', auth_middleware_js_1.authMiddleware, async (req, res) => {
    try {
        const logs = await (0, database_js_1.allQuery)('SELECT id, action, metadata, ip_address, created_at FROM audit_logs WHERE user_id = ? ORDER BY created_at DESC LIMIT 50', [req.user.id]);
        res.json({ logs });
    }
    catch (err) {
        res.status(500).json({ error: err.message });
    }
});
// Devices list
router.get('/devices', auth_middleware_js_1.authMiddleware, async (req, res) => {
    try {
        const devices = await (0, database_js_1.allQuery)('SELECT id, device_name, device_model, os_version, ip_address, is_trusted, last_active, created_at FROM devices WHERE user_id = ? ORDER BY last_active DESC', [req.user.id]);
        res.json({ devices });
    }
    catch (err) {
        res.status(500).json({ error: err.message });
    }
});
// Revoke Device & all related sessions immediately
router.post('/devices/:id/revoke', auth_middleware_js_1.authMiddleware, async (req, res) => {
    try {
        const deviceId = req.params.id;
        // Invalidate all active sessions for this device
        await (0, database_js_1.runQuery)('UPDATE sessions SET is_revoked = 1 WHERE device_id = ? AND user_id = ?', [deviceId, req.user.id]);
        await (0, database_js_1.runQuery)('DELETE FROM devices WHERE id = ? AND user_id = ?', [deviceId, req.user.id]);
        await (0, database_js_1.runQuery)(`
      INSERT INTO audit_logs (id, user_id, action, metadata)
      VALUES (?, ?, 'DEVICE_REVOKED', ?)
    `, [(0, uuid_1.v4)(), req.user.id, JSON.stringify({ deviceId })]);
        res.json({ success: true, message: 'Device and its associated sessions revoked successfully.' });
    }
    catch (err) {
        res.status(500).json({ error: err.message });
    }
});
// Active Sessions list
router.get('/sessions', auth_middleware_js_1.authMiddleware, async (req, res) => {
    try {
        const sessions = await (0, database_js_1.allQuery)('SELECT id, device_id, expires_at, is_revoked, created_at FROM sessions WHERE user_id = ? AND is_revoked = 0 ORDER BY created_at DESC', [req.user.id]);
        res.json({ sessions });
    }
    catch (err) {
        res.status(500).json({ error: err.message });
    }
});
// Revoke specific session
router.post('/sessions/:id/revoke', auth_middleware_js_1.authMiddleware, async (req, res) => {
    try {
        const sessionId = req.params.id;
        await (0, database_js_1.runQuery)('UPDATE sessions SET is_revoked = 1 WHERE id = ? AND user_id = ?', [sessionId, req.user.id]);
        await (0, database_js_1.runQuery)(`
      INSERT INTO audit_logs (id, user_id, action, metadata)
      VALUES (?, ?, 'SESSION_REVOKED', ?)
    `, [(0, uuid_1.v4)(), req.user.id, JSON.stringify({ sessionId })]);
        res.json({ success: true, message: 'Session revoked successfully.' });
    }
    catch (err) {
        res.status(500).json({ error: err.message });
    }
});
// Update spending and payment limits
router.post('/update-limits', auth_middleware_js_1.authMiddleware, async (req, res) => {
    try {
        const { perTxnLimit, dailyLimit, monthlyLimit } = req.body;
        await (0, database_js_1.runQuery)(`
      UPDATE users SET 
        per_txn_payment_limit = COALESCE(?, per_txn_payment_limit),
        daily_payment_limit = COALESCE(?, daily_payment_limit),
        monthly_payment_limit = COALESCE(?, monthly_payment_limit)
      WHERE id = ?
    `, [perTxnLimit, dailyLimit, monthlyLimit, req.user.id]);
        await (0, database_js_1.runQuery)(`
      INSERT INTO audit_logs (id, user_id, action, metadata)
      VALUES (?, ?, 'LIMIT_CHANGED', ?)
    `, [(0, uuid_1.v4)(), req.user.id, JSON.stringify({ perTxnLimit, dailyLimit, monthlyLimit })]);
        res.json({ success: true, message: 'Payment limits updated successfully.' });
    }
    catch (err) {
        res.status(500).json({ error: err.message });
    }
});
exports.default = router;
//# sourceMappingURL=security.routes.js.map