"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const database_js_1 = require("../config/database.js");
const app_config_js_1 = require("../config/app_config.js");
const router = (0, express_1.Router)();
/**
 * 0. GET /health (Root health check)
 */
router.get('/', (_req, res) => {
    res.json({
        status: 'OK',
        environment: app_config_js_1.config.environment,
        timestamp: new Date().toISOString(),
    });
});
/**
 * 1. GET /health/live (Kubernetes / container liveness check)
 */
router.get('/live', (_req, res) => {
    res.json({
        status: 'UP',
        timestamp: new Date().toISOString(),
        uptimeSeconds: Math.floor(process.uptime()),
        environment: app_config_js_1.config.environment,
    });
});
/**
 * 2. GET /health/ready (Readiness probe verifying DB & config)
 */
router.get('/ready', async (_req, res) => {
    try {
        const dbTest = await (0, database_js_1.getQuery)('SELECT 1 as val');
        const isDbConnected = dbTest?.val === 1;
        if (!isDbConnected) {
            res.status(503).json({
                status: 'UNHEALTHY',
                database: 'DISCONNECTED',
                timestamp: new Date().toISOString()
            });
            return;
        }
        res.json({
            status: 'READY',
            database: 'CONNECTED',
            environment: app_config_js_1.config.environment,
            // Account Aggregator availability — lets the mobile app choose between
            // the real AA consent flow and the on-device SMS importer instead of guessing.
            aaEnabled: app_config_js_1.config.aaProvider.enabled === true &&
                !['MOCK', 'FAKE_TEST_PROVIDER'].includes(app_config_js_1.config.aaProvider.providerName),
            aaProvider: app_config_js_1.config.aaProvider.providerName,
            timestamp: new Date().toISOString()
        });
    }
    catch (err) {
        res.status(503).json({
            status: 'UNHEALTHY',
            error: app_config_js_1.config.environment === 'PRODUCTION' ? 'Dependency check failed' : err.message,
            timestamp: new Date().toISOString()
        });
    }
});
/**
 * 3. GET /health/email-diag (Inspect configured email gateways safely)
 */
router.get('/email-diag', async (_req, res) => {
    res.json({
        hasResend: Boolean(process.env.RESEND_API_KEY),
        hasBrevo: Boolean(process.env.BREVO_API_KEY),
        hasSmtp: Boolean(app_config_js_1.config.smtp.user && app_config_js_1.config.smtp.appPassword),
        has2Factor: Boolean(process.env.TWOFACTOR_API_KEY || process.env['2FACTOR_API_KEY']),
        smsProvider: process.env.SMS_PROVIDER || app_config_js_1.config.sms?.provider || 'none',
        brevoFrom: process.env.BREVO_FROM_EMAIL || app_config_js_1.config.smtp.user || 'no-reply@finpocket.com',
    });
});
/**
 * 4. GET /health/test-brevo (Direct probe from Render to Brevo API)
 */
router.get('/test-brevo', async (req, res) => {
    const targetEmail = req.query.email || 'sureddydinesh197@gmail.com';
    const brevoApiKey = process.env.BREVO_API_KEY;
    const brevoFromEmail = process.env.BREVO_FROM_EMAIL || app_config_js_1.config.smtp.user || 'no-reply@finpocket.com';
    const brevoFromName = process.env.BREVO_FROM_NAME || 'FinPocket Security';
    if (!brevoApiKey) {
        res.status(400).json({ error: 'BREVO_API_KEY is not defined on this server.' });
        return;
    }
    try {
        const brevoRes = await fetch('https://api.brevo.com/v3/smtp/email', {
            method: 'POST',
            headers: {
                'api-key': brevoApiKey,
                'Content-Type': 'application/json',
                'Accept': 'application/json',
            },
            body: JSON.stringify({
                sender: { name: brevoFromName, email: brevoFromEmail },
                to: [{ email: targetEmail }],
                subject: 'FinPocket Cloud Verification Test',
                htmlContent: '<p>Direct cloud test from Render</p>',
            }),
        });
        const status = brevoRes.status;
        const body = await brevoRes.text();
        res.json({ brevoStatus: status, brevoResponse: body });
    }
    catch (err) {
        res.status(500).json({ error: err.message });
    }
});
exports.default = router;
//# sourceMappingURL=health.routes.js.map