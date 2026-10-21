"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const node_dns_1 = __importDefault(require("node:dns"));
node_dns_1.default.setDefaultResultOrder('ipv4first');
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const helmet_1 = __importDefault(require("helmet"));
const app_config_js_1 = require("./config/app_config.js");
const database_js_1 = require("./config/database.js");
const request_tracker_middleware_js_1 = require("./middleware/request_tracker.middleware.js");
const rate_limit_middleware_js_1 = require("./middleware/rate_limit.middleware.js");
const db_scope_middleware_js_1 = require("./middleware/db_scope.middleware.js");
const error_handler_middleware_js_1 = require("./middleware/error_handler.middleware.js");
const auth_routes_js_1 = __importDefault(require("./routes/auth.routes.js"));
const dashboard_routes_js_1 = __importDefault(require("./routes/dashboard.routes.js"));
const accounts_routes_js_1 = __importDefault(require("./routes/accounts.routes.js"));
const transactions_routes_js_1 = __importDefault(require("./routes/transactions.routes.js"));
const payments_routes_js_1 = __importDefault(require("./routes/payments.routes.js"));
const savings_routes_js_1 = __importDefault(require("./routes/savings.routes.js"));
const bills_routes_js_1 = __importDefault(require("./routes/bills.routes.js"));
const ai_routes_js_1 = __importDefault(require("./routes/ai.routes.js"));
const security_routes_js_1 = __importDefault(require("./routes/security.routes.js"));
const financial_routes_js_1 = __importDefault(require("./routes/financial.routes.js"));
const health_routes_js_1 = __importDefault(require("./routes/health.routes.js"));
const provider_integration_routes_js_1 = require("./routes/provider_integration.routes.js");
const aa_routes_js_1 = __importDefault(require("./routes/aa.routes.js"));
const setu_routes_js_1 = __importDefault(require("./routes/setu.routes.js"));
const accounts_service_js_1 = require("./services/accounts.service.js");
const notifications_routes_js_1 = __importDefault(require("./routes/notifications.routes.js"));
/**
 * Installs the Financial Data Provider that every balance read and sync goes
 * through.
 *
 * `AccountsService` defaults to `MockFinancialDataProvider`, which only bumps
 * `last_synced_at` and never changes a balance — so without this call the app
 * can only ever display the seeded numbers regardless of what the user does.
 * When the Account Aggregator (Setu) is configured and enabled we install the
 * real provider instead, so balances come from the bank's AA feed.
 */
function installFinancialDataProvider() {
    const aa = app_config_js_1.config.aaProvider;
    const hasCredentials = Boolean(aa.setu.clientId && aa.setu.clientSecret);
    const isTest = app_config_js_1.config.environment === 'TEST';
    // MOCK accounts (the seeded HDFC/SBI wallets) are owned by the mock provider,
    // which reports each account's own stored balance. Registering it per-type
    // keeps the AA provider below from writing its single canned figure over
    // accounts it does not own.
    accounts_service_js_1.AccountsService.registerProvider('MOCK', new accounts_service_js_1.MockFinancialDataProvider());
    if (!isTest && aa.enabled && hasCredentials) {
        const setu = new accounts_service_js_1.AccountAggregatorProvider();
        accounts_service_js_1.AccountsService.setProvider(setu);
        accounts_service_js_1.AccountsService.registerProvider(aa.providerName, setu);
        console.log(`[FinPocket Backend API] Financial data provider -> ${aa.providerName} (${aa.setu.environment})`);
        return;
    }
    accounts_service_js_1.AccountsService.setProvider(new accounts_service_js_1.MockFinancialDataProvider());
    const reason = isTest
        ? 'TEST environment'
        : !aa.enabled
            ? 'AA_PROVIDER_ENABLED is off'
            : 'no Setu credentials';
    console.log(`[FinPocket Backend API] Financial data provider -> MOCK (${reason})`);
}
const app = (0, express_1.default)();
const PORT = app_config_js_1.config.port;
// Client identity behind a local reverse proxy (the cloudflared tunnel runs on
// this host): trust X-Forwarded-For ONLY from loopback peers. The tunnel's
// forwarded client IP is then genuine, while anyone reaching :PORT directly
// from the LAN is not loopback and cannot spoof it. Without this, every
// tunneled user shares one 127.0.0.1 rate-limit bucket, request logs lose the
// real client IP, and express-rate-limit raises ERR_ERL_UNEXPECTED_X_FORWARDED_FOR.
app.set('trust proxy', 'loopback');
// 1. Security Headers & CORS
app.use((0, helmet_1.default)({
    contentSecurityPolicy: app_config_js_1.config.environment === 'PRODUCTION' ? undefined : false,
    crossOriginEmbedderPolicy: false,
}));
app.use((0, cors_1.default)({
    origin: app_config_js_1.config.corsOrigin,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'Idempotency-Key', 'x-device-id', 'x-request-id', 'x-provider-signature', 'x-setu-signature', 'x-provider-timestamp', 'x-event-id']
}));
// 2. Request Correlation & Sanitized Logging
app.use(request_tracker_middleware_js_1.requestTracker);
// 3. Request Body Parsing with Size Limits (64 KB ceiling)
// `verify` keeps the exact received bytes so webhook HMAC signatures are
// checked against what the provider actually sent (JSON.stringify(req.body)
// can differ from the wire bytes and silently fails verification).
app.use(express_1.default.json({
    limit: '64kb',
    verify: (req, _res, buf) => {
        req.rawBody = buf;
    },
}));
// 4. Layered Rate Limiting
app.use('/api/', rate_limit_middleware_js_1.generalLimiter);
// Credential/OTP/token endpoints — the old mount targeted a non-existent
// '/password-reset' path, so throttling never applied to real resets.
app.use('/api/v1/auth/login', rate_limit_middleware_js_1.authLimiter);
app.use('/api/v1/auth/refresh', rate_limit_middleware_js_1.authLimiter);
app.use('/api/v1/auth/register', rate_limit_middleware_js_1.authLimiter);
app.use('/api/v1/auth/forgot-password', rate_limit_middleware_js_1.authLimiter);
app.use('/api/v1/auth/reset-password', rate_limit_middleware_js_1.authLimiter);
app.use('/api/v1/auth/email/send-otp', rate_limit_middleware_js_1.authLimiter);
app.use('/api/v1/auth/email/verify-otp', rate_limit_middleware_js_1.authLimiter);
app.use('/api/v1/auth/phone/send-otp', rate_limit_middleware_js_1.authLimiter);
app.use('/api/v1/auth/phone/verify-otp', rate_limit_middleware_js_1.authLimiter);
app.use('/api/v1/auth/otp/resend', rate_limit_middleware_js_1.authLimiter);
app.use('/api/v1/auth/pin/verify', rate_limit_middleware_js_1.authLimiter);
app.use('/api/v1/auth/google', rate_limit_middleware_js_1.authLimiter);
app.use('/api/v1/auth/apple', rate_limit_middleware_js_1.authLimiter);
app.use('/api/v1/auth/meta', rate_limit_middleware_js_1.authLimiter);
app.use('/api/v1/payments', rate_limit_middleware_js_1.paymentsLimiter);
app.use('/api/v1/ai', rate_limit_middleware_js_1.aiLimiter);
// 4b. RLS request scopes (Phase D, PostgreSQL only — no-ops on SQLite).
// System-role scopes are registered FIRST and mark the request so the generic
// app scope never stacks on top: exactly the three unauthenticated provider
// callback endpoints run without a user context and therefore as
// finpocket_system; everything else under /api runs as finpocket_app with
// SET LOCAL app.current_user_id applied by authMiddleware.
app.use('/api/v1/setu/webhook', db_scope_middleware_js_1.systemDbScopeMiddleware);
app.use('/api/v1/aa/callback', db_scope_middleware_js_1.systemDbScopeMiddleware);
app.use('/api/v1/setu/redirect', db_scope_middleware_js_1.systemDbScopeMiddleware);
app.use('/api', db_scope_middleware_js_1.dbScopeMiddleware);
// 5. Observability & Health Routes
app.use('/health', health_routes_js_1.default);
// 6. Mount Feature Routes
app.use('/api/v1/auth', auth_routes_js_1.default);
app.use('/api/v1/dashboard', dashboard_routes_js_1.default);
app.use('/api/v1/financial', financial_routes_js_1.default);
app.use('/api/v1/accounts', accounts_routes_js_1.default);
app.use('/api/v1/transactions', transactions_routes_js_1.default);
app.use('/api/v1/payments', payments_routes_js_1.default);
app.use('/api/v1/savings', savings_routes_js_1.default);
app.use('/api/v1/bills', bills_routes_js_1.default);
app.use('/api/v1/ai', ai_routes_js_1.default);
app.use('/api/v1/security', security_routes_js_1.default);
app.use('/api/v1/provider', provider_integration_routes_js_1.providerRouter);
app.use('/api/v1/aa', aa_routes_js_1.default);
app.use('/api/v1/setu', setu_routes_js_1.default);
app.use('/api/v1/notifications', notifications_routes_js_1.default);
// 7. Centralized Error Handling
app.use(error_handler_middleware_js_1.errorHandler);
let server = null;
async function startServer() {
    await (0, database_js_1.initDatabase)();
    installFinancialDataProvider();
    server = app.listen(PORT, '0.0.0.0', () => {
        console.log(`[FinPocket Backend API] Server running in ${app_config_js_1.config.environment} mode at http://localhost:${PORT}`);
        console.log(database_js_1.engine === 'postgres'
            ? '[FinPocket Backend API] Database: PostgreSQL (shared pool, TLS per PGSSLMODE, migrations applied).'
            : '[FinPocket Backend API] Connected to SQLite database with foreign keys enforced.');
    });
}
function handleShutdown(signal) {
    console.log(`[FinPocket Backend API] Received ${signal}. Starting graceful shutdown...`);
    if (server) {
        server.close(async () => {
            console.log('[FinPocket Backend API] HTTP server closed gracefully.');
            try {
                await (0, database_js_1.closeDatabase)();
                console.log('[FinPocket Backend API] Database connections closed.');
            }
            catch (err) {
                console.error('[FinPocket Backend API] Error while closing database:', err);
            }
            process.exit(0);
        });
        // Force shutdown after timeout if connections remain open
        setTimeout(() => {
            console.error('[FinPocket Backend API] Graceful shutdown timed out. Forcing exit.');
            process.exit(1);
        }, 10000).unref();
    }
    else {
        process.exit(0);
    }
}
process.on('SIGTERM', () => handleShutdown('SIGTERM'));
process.on('SIGINT', () => handleShutdown('SIGINT'));
startServer().catch(err => {
    console.error('[FinPocket Backend API] Failed to start server:', err);
    process.exit(1);
});
//# sourceMappingURL=index.js.map