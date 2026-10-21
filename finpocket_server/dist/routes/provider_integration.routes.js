"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.providerRouter = void 0;
const express_1 = require("express");
const auth_middleware_js_1 = require("../middleware/auth.middleware.js");
const consent_service_js_1 = require("../services/consent.service.js");
const sync_service_js_1 = require("../services/sync.service.js");
const accounts_service_js_1 = require("../services/accounts.service.js");
const sqlite_repositories_js_1 = require("../repositories/sqlite_repositories.js");
const database_js_1 = require("../config/database.js");
const uuid_1 = require("uuid");
exports.providerRouter = (0, express_1.Router)();
const consentRepo = new sqlite_repositories_js_1.SQLiteConsentRepository();
const syncRepo = new sqlite_repositories_js_1.SQLiteFinancialSyncRepository();
/**
 * Request new ReBIT Account Aggregator Consent
 */
exports.providerRouter.post('/consent/request', auth_middleware_js_1.authMiddleware, async (req, res) => {
    try {
        const userId = req.user.id;
        const { bankAccountId, dataAccessTypes, durationDays } = req.body;
        const consent = await consent_service_js_1.ConsentService.requestConsent(userId, bankAccountId || 'bnk_unlinked', dataAccessTypes || ['TRANSACTIONS', 'BALANCES', 'PROFILE'], Number(durationDays) || 365);
        res.status(201).json({
            success: true,
            consent
        });
    }
    catch (err) {
        res.status(400).json({ error: err.message });
    }
});
/**
 * Revoke an active Consent immediately
 */
exports.providerRouter.post('/consent/revoke', auth_middleware_js_1.authMiddleware, async (req, res) => {
    try {
        const userId = req.user.id;
        const { consentId } = req.body;
        if (!consentId) {
            res.status(400).json({ error: 'consentId is required.' });
            return;
        }
        const success = await consent_service_js_1.ConsentService.revokeConsent(userId, consentId);
        if (!success) {
            res.status(404).json({ error: 'Consent not found or could not be revoked.' });
            return;
        }
        res.json({
            success: true,
            message: 'Consent revoked successfully. Data synchronization halted.'
        });
    }
    catch (err) {
        res.status(500).json({ error: err.message });
    }
});
/**
 * Trigger manual data sync for authenticated user
 */
exports.providerRouter.post('/sync', auth_middleware_js_1.authMiddleware, async (req, res) => {
    try {
        const userId = req.user.id;
        const idempotencyKey = req.headers['idempotency-key'];
        const { rawTransactions } = req.body;
        const result = await sync_service_js_1.SyncService.syncUserData(userId, 'ACCOUNT_AGGREGATOR', idempotencyKey, rawTransactions);
        res.json({
            success: result.status === 'SUCCESS',
            syncResult: result
        });
    }
    catch (err) {
        res.status(500).json({ error: err.message });
    }
});
/**
 * Get current provider integration status and data freshness
 */
exports.providerRouter.get('/status', auth_middleware_js_1.authMiddleware, async (req, res) => {
    try {
        const userId = req.user.id;
        const activeConsents = await consentRepo.findActiveByUserId(userId);
        const lastSync = await syncRepo.getLastSync(userId);
        const accounts = await accounts_service_js_1.AccountsService.listAccounts(userId);
        const freshness = lastSync
            ? (Date.now() - new Date(lastSync.timestamp).getTime() > 24 * 3600 * 1000 ? 'STALE' : 'CURRENT')
            : 'NEVER_SYNCED';
        res.json({
            providerType: 'ACCOUNT_AGGREGATOR',
            activeConsentsCount: activeConsents.length,
            connectedAccountsCount: accounts.length,
            freshnessStatus: freshness,
            lastSyncTime: lastSync?.timestamp || null,
            lastSyncStatus: lastSync?.status || null
        });
    }
    catch (err) {
        res.status(500).json({ error: err.message });
    }
});
/**
 * Unlink connected bank account & revoke linked consent
 */
exports.providerRouter.post('/unlink', auth_middleware_js_1.authMiddleware, async (req, res) => {
    try {
        const userId = req.user.id;
        const { accountId } = req.body;
        if (!accountId) {
            res.status(400).json({ error: 'accountId is required.' });
            return;
        }
        await accounts_service_js_1.AccountsService.disconnectAccount(userId, accountId);
        await (0, database_js_1.runQuery)(`
      INSERT INTO audit_logs (id, user_id, action, metadata)
      VALUES (?, ?, 'ACCOUNT_UNLINKED', ?)
    `, [(0, uuid_1.v4)(), userId, JSON.stringify({ accountId, unlinkedAt: new Date().toISOString() })]);
        res.json({
            success: true,
            message: 'Account unlinked and consent revoked successfully.'
        });
    }
    catch (err) {
        res.status(500).json({ error: err.message });
    }
});
//# sourceMappingURL=provider_integration.routes.js.map