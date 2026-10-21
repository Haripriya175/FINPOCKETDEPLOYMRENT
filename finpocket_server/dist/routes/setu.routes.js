"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const auth_middleware_js_1 = require("../middleware/auth.middleware.js");
const accounts_service_js_1 = require("../services/accounts.service.js");
const consent_service_js_1 = require("../services/consent.service.js");
const aa_callback_service_js_1 = require("../services/aa_callback.service.js");
const app_config_js_1 = require("../config/app_config.js");
const database_js_1 = require("../config/database.js");
const router = (0, express_1.Router)();
/**
 * POST /api/v1/setu/webhook
 * Asynchronous webhook from Setu Account Aggregator Gateway
 * Handles consent status updates and FI_DATA_READY notifications.
 */
router.post('/webhook', async (req, res) => {
    try {
        // HMAC is verified over the exact bytes that arrived on the wire
        // (captured by express.json's verify hook); re-serializing req.body can
        // differ from the provider's bytes and silently fail verification.
        const rawBody = req.rawBody
            ? req.rawBody.toString('utf8')
            : JSON.stringify(req.body);
        const signature = (req.headers['x-setu-signature'] ||
            req.headers['x-provider-signature'] ||
            req.headers['setu-signature'] ||
            '');
        const requestId = (req.headers['x-request-id'] || '');
        const secret = app_config_js_1.config.aaProvider.setu.webhookSecret || app_config_js_1.config.aaProvider.webhookSecret;
        // In production, signature is mandatory (fail-closed)
        if (!signature && app_config_js_1.config.environment === 'PRODUCTION') {
            return res.status(400).json({
                code: 'MISSING_SIGNATURE',
                message: 'Webhook signature header (x-setu-signature) is required in production.'
            });
        }
        const result = await aa_callback_service_js_1.AACallbackService.processWebhook(rawBody, signature, secret, req.body, requestId);
        if (!result.valid) {
            return res.status(400).json({
                code: result.code || 'WEBHOOK_VERIFICATION_FAILED',
                message: result.reason || 'Webhook verification failed.'
            });
        }
        return res.status(200).json({
            status: 'SUCCESS',
            message: 'Setu Account Aggregator webhook processed successfully.',
            event: {
                consentId: result.consentId,
                status: result.status,
                eventType: result.eventType,
                verifiedMode: result.verifiedMode
            }
        });
    }
    catch (err) {
        return res.status(500).json({
            code: 'WEBHOOK_PROCESSING_ERROR',
            message: 'Internal error processing Setu webhook.'
        });
    }
});
/**
 * POST /api/v1/setu/consent/reconcile/:consentId
 * Safely reconcile an existing active Setu consent artifact with local database
 */
router.post('/consent/reconcile/:consentId', auth_middleware_js_1.authMiddleware, async (req, res) => {
    try {
        const userId = req.user?.id || '';
        const { consentId } = req.params;
        if (!consentId) {
            return res.status(400).json({ code: 'INVALID_REQUEST', message: 'consentId is required.' });
        }
        const result = await aa_callback_service_js_1.AACallbackService.reconcileLiveConsent(userId, consentId);
        return res.status(200).json({
            status: 'SUCCESS',
            message: 'Setu consent successfully reconciled with authoritative provider state.',
            consent: result
        });
    }
    catch (err) {
        return res.status(500).json({
            code: 'RECONCILIATION_ERROR',
            message: err.message || 'Failed to reconcile Setu consent.'
        });
    }
});
/**
 * GET /api/v1/setu/redirect
 * Customer browser redirect landing endpoint after completing or cancelling Setu consent flow
 */
router.get('/redirect', async (req, res) => {
    try {
        const query = {
            success: req.query.success,
            id: (req.query.id || req.query.consentHandle || req.query.consentId),
            errorcode: (req.query.errorcode || req.query.errorCode),
            error: req.query.error,
            fp_state: req.query.fp_state
        };
        const result = await aa_callback_service_js_1.AACallbackService.handleRedirect(query);
        // HTML-escape all user-controlled values before rendering
        const escapeHtml = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
        const safeMessage = escapeHtml(result.message);
        const safeDeepLink = escapeHtml(result.deepLinkUrl);
        const safeSuccess = result.success;
        // Render mobile-friendly responsive return page with deep-link redirect
        const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>FinPocket - Account Linking</title>
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      background-color: #0B1120;
      color: #F1F5F9;
      display: flex;
      justify-content: center;
      align-items: center;
      min-height: 100vh;
      margin: 0;
      padding: 20px;
    }
    .card {
      background-color: #1E293B;
      border: 1px solid #334155;
      border-radius: 20px;
      padding: 32px 24px;
      max-width: 400px;
      width: 100%;
      text-align: center;
      box-shadow: 0 10px 25px rgba(0,0,0,0.5);
    }
    .icon {
      width: 64px;
      height: 64px;
      border-radius: 50%;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      font-size: 32px;
      margin-bottom: 20px;
      background-color: ${safeSuccess ? 'rgba(20, 184, 166, 0.15)' : 'rgba(239, 68, 68, 0.15)'};
      color: ${safeSuccess ? '#14B8A6' : '#EF4444'};
    }
    h2 { margin: 0 0 10px 0; font-size: 22px; font-weight: 700; }
    p { color: #94A3B8; font-size: 14px; line-height: 1.5; margin: 0 0 24px 0; }
    .btn {
      display: inline-block;
      background-color: #14B8A6;
      color: #FFFFFF;
      font-weight: 600;
      font-size: 15px;
      text-decoration: none;
      padding: 14px 28px;
      border-radius: 12px;
      transition: background-color 0.2s;
      width: 100%;
      box-sizing: border-box;
    }
    .btn:hover { background-color: #0D9488; }
    .footer { margin-top: 20px; font-size: 12px; color: #64748B; }
  </style>
  <script>
    // Automatic deep-link return
    window.addEventListener('DOMContentLoaded', () => {
      setTimeout(() => {
        window.location.href = "${safeDeepLink}";
      }, 800);
    });
  </script>
</head>
<body>
  <div class="card">
    <div class="icon">${safeSuccess ? '✓' : '✕'}</div>
    <h2>${safeSuccess ? 'Consent Authorized' : 'Consent Not Completed'}</h2>
    <p>${safeMessage}</p>
    <a href="${safeDeepLink}" class="btn">Return to FinPocket App</a>
    <div class="footer">Setu Account Aggregator • Sandbox Secure Layer</div>
  </div>
</body>
</html>`;
        res.setHeader('Content-Type', 'text/html');
        return res.status(200).send(html);
    }
    catch (err) {
        return res.status(500).send('<h3>Error processing Account Aggregator redirect.</h3>');
    }
});
/**
 * POST /api/v1/setu/consent/request
 * Initiate Account Aggregator consent request via Setu Sandbox
 */
router.post('/consent/request', auth_middleware_js_1.authMiddleware, async (req, res) => {
    try {
        const userId = req.user?.id || '';
        const { institutionCode, mobileNumber } = req.body;
        if (!institutionCode) {
            return res.status(400).json({ code: 'INVALID_REQUEST', message: 'institutionCode is required.' });
        }
        const account = await accounts_service_js_1.AccountsService.getProvider().connectAccount(userId, institutionCode, mobileNumber);
        return res.status(200).json({
            status: 'SUCCESS',
            account,
            message: 'Setu consent request initiated successfully.'
        });
    }
    catch (err) {
        return res.status(500).json({
            code: 'SETU_CONSENT_ERROR',
            message: err.message || 'Failed to initiate Setu consent request.'
        });
    }
});
/**
 * GET /api/v1/setu/consent/status/:handle
 * Query consent status by handle
 */
router.get('/consent/status/:handle', auth_middleware_js_1.authMiddleware, async (req, res) => {
    try {
        const userId = req.user?.id || '';
        const { handle } = req.params;
        const consent = await (0, database_js_1.getQuery)('SELECT * FROM account_consents WHERE (consent_handle = ? OR id = ?) AND user_id = ?', [handle, handle, userId]);
        if (!consent) {
            return res.status(404).json({ code: 'NOT_FOUND', message: 'Consent record not found.' });
        }
        return res.status(200).json({
            status: 'SUCCESS',
            consent: {
                id: consent.id,
                consentHandle: consent.consent_handle,
                status: consent.consent_status,
                validFrom: consent.valid_from,
                validTo: consent.valid_to
            }
        });
    }
    catch (err) {
        return res.status(500).json({
            code: 'CONSENT_STATUS_ERROR',
            message: 'Failed to retrieve consent status.'
        });
    }
});
/**
 * POST /api/v1/setu/consent/revoke/:consentId
 * Revoke an active consent artifact
 */
router.post('/consent/revoke/:consentId', auth_middleware_js_1.authMiddleware, async (req, res) => {
    try {
        const userId = req.user?.id || '';
        const { consentId } = req.params;
        const success = await consent_service_js_1.ConsentService.revokeConsent(userId, consentId);
        if (!success) {
            return res.status(404).json({ code: 'NOT_FOUND', message: 'Consent record not found or unauthorized.' });
        }
        return res.status(200).json({
            status: 'SUCCESS',
            message: 'Setu consent revoked successfully.'
        });
    }
    catch (err) {
        return res.status(500).json({
            code: 'CONSENT_REVOKE_ERROR',
            message: 'Failed to revoke consent.'
        });
    }
});
/**
 * POST /api/v1/setu/sync/:accountId
 * Trigger manual data sync for linked account
 */
router.post('/sync/:accountId', auth_middleware_js_1.authMiddleware, async (req, res) => {
    try {
        const userId = req.user?.id || '';
        const { accountId } = req.params;
        const balance = await accounts_service_js_1.AccountsService.syncAccount(userId, accountId);
        return res.status(200).json({
            status: 'SUCCESS',
            balance,
            message: 'Account synchronized successfully.'
        });
    }
    catch (err) {
        const isForbidden = err?.message?.includes('403') || err?.message?.includes('Consent');
        const isNotFound = typeof err?.message === 'string' && /not found/i.test(err.message);
        return res.status(isForbidden ? 403 : isNotFound ? 404 : 500).json({
            code: isForbidden ? 'CONSENT_INVALID' : isNotFound ? 'ACCOUNT_NOT_FOUND' : 'SYNC_FAILED',
            message: err.message || 'Synchronization failed.'
        });
    }
});
exports.default = router;
//# sourceMappingURL=setu.routes.js.map