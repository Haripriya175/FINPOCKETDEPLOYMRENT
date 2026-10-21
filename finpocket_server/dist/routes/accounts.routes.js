"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const auth_middleware_js_1 = require("../middleware/auth.middleware.js");
const accounts_service_js_1 = require("../services/accounts.service.js");
const app_config_js_1 = require("../config/app_config.js");
const router = (0, express_1.Router)();
router.get('/', auth_middleware_js_1.authMiddleware, async (req, res) => {
    try {
        const accounts = await accounts_service_js_1.AccountsService.listAccounts(req.user.id);
        res.json({ accounts });
    }
    catch (err) {
        res.status(500).json({ error: err.message });
    }
});
router.post('/:id/sync', auth_middleware_js_1.authMiddleware, async (req, res) => {
    try {
        const updatedBalance = await accounts_service_js_1.AccountsService.syncAccount(req.user.id, req.params.id);
        res.json({ success: true, updatedBalance, message: 'Account synchronized via Financial Data Provider.' });
    }
    catch (err) {
        // An unknown account is a data-level 404, not a server fault.
        const notFound = typeof err?.message === 'string' && /not found/i.test(err.message);
        res.status(notFound ? 404 : 500).json({ error: err.message });
    }
});
router.post('/instant-link', auth_middleware_js_1.authMiddleware, async (req, res) => {
    try {
        const { institutionName, institutionCode, maskedAccountNumber, initialBalance, accountType } = req.body;
        const account = await accounts_service_js_1.AccountsService.createSelfDeclaredAccount(req.user.id, {
            institutionName: institutionName || 'Primary Bank Account',
            institutionCode: institutionCode || 'INSTANT',
            maskedAccountNumber: maskedAccountNumber || '•••• 4829',
            accountType: accountType || 'SAVINGS',
            initialBalance: typeof initialBalance === 'number' && initialBalance >= 0 ? initialBalance : 50000.0,
        });
        res.status(201).json({ success: true, account });
    }
    catch (err) {
        res.status(500).json({ error: err.message });
    }
});
router.post('/connect-mock', auth_middleware_js_1.authMiddleware, async (req, res) => {
    // Mock account connections are a TEST/DEV/DEMO affordance only — a real
    // environment must never fabricate a bank account for a user.
    if (!['TEST', 'DEVELOPMENT', 'DEMO'].includes(app_config_js_1.config.environment)) {
        res.status(403).json({ error: 'Mock account connections are not available in this environment.' });
        return;
    }
    try {
        const { institutionCode } = req.body;
        const account = await accounts_service_js_1.AccountsService.connectMockAccount(req.user.id, institutionCode || 'HDFC');
        res.status(201).json({ success: true, account });
    }
    catch (err) {
        res.status(500).json({ error: err.message });
    }
});
router.post('/:id/disconnect', auth_middleware_js_1.authMiddleware, async (req, res) => {
    try {
        await accounts_service_js_1.AccountsService.disconnectAccount(req.user.id, req.params.id);
        res.json({ success: true, message: 'Bank account disconnected and consent revoked.' });
    }
    catch (err) {
        res.status(500).json({ error: err.message });
    }
});
exports.default = router;
//# sourceMappingURL=accounts.routes.js.map