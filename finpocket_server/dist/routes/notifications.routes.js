"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.notificationsRouter = void 0;
const express_1 = require("express");
const auth_middleware_js_1 = require("../middleware/auth.middleware.js");
const notification_service_js_1 = require("../services/notification.service.js");
exports.notificationsRouter = (0, express_1.Router)();
/**
 * Device notification centre backing store.
 *
 * The table existed since schema v1 but nothing ever read or wrote it, which
 * meant alerts lived and died on a single device. These endpoints let the app
 * rehydrate its notification list after a reinstall.
 */
exports.notificationsRouter.get('/', auth_middleware_js_1.authMiddleware, async (req, res) => {
    try {
        const limit = Math.min(Number(req.query.limit) || 50, 200);
        const notifications = await notification_service_js_1.NotificationService.list(req.user.id, limit);
        res.json({ notifications });
    }
    catch (err) {
        res.status(500).json({ error: err.message });
    }
});
exports.notificationsRouter.post('/read-all', auth_middleware_js_1.authMiddleware, async (req, res) => {
    try {
        const updated = await notification_service_js_1.NotificationService.markAllRead(req.user.id);
        res.json({ success: true, updated });
    }
    catch (err) {
        res.status(500).json({ error: err.message });
    }
});
exports.notificationsRouter.post('/', auth_middleware_js_1.authMiddleware, async (req, res) => {
    try {
        const { title, body, type } = req.body || {};
        if (!title || !body) {
            res.status(400).json({ error: 'title and body are required.' });
            return;
        }
        const id = await notification_service_js_1.NotificationService.record(req.user.id, String(title), String(body), String(type || 'system'));
        res.status(201).json({ success: true, id });
    }
    catch (err) {
        res.status(500).json({ error: err.message });
    }
});
exports.default = exports.notificationsRouter;
//# sourceMappingURL=notifications.routes.js.map