import dns from 'node:dns';
dns.setDefaultResultOrder('ipv4first');

import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { config } from './config/app_config.js';
import { initDatabase, closeDatabase, engine } from './config/database.js';
import { requestTracker } from './middleware/request_tracker.middleware.js';
import { generalLimiter, authLimiter, paymentsLimiter, aiLimiter } from './middleware/rate_limit.middleware.js';
import { dbScopeMiddleware, systemDbScopeMiddleware } from './middleware/db_scope.middleware.js';
import { errorHandler } from './middleware/error_handler.middleware.js';

import authRoutes from './routes/auth.routes.js';
import dashboardRoutes from './routes/dashboard.routes.js';
import accountsRoutes from './routes/accounts.routes.js';
import transactionsRoutes from './routes/transactions.routes.js';
import paymentsRoutes from './routes/payments.routes.js';
import savingsRoutes from './routes/savings.routes.js';
import billsRoutes from './routes/bills.routes.js';
import aiRoutes from './routes/ai.routes.js';
import securityRoutes from './routes/security.routes.js';
import financialRoutes from './routes/financial.routes.js';
import healthRoutes from './routes/health.routes.js';
import { providerRouter } from './routes/provider_integration.routes.js';
import aaRoutes from './routes/aa.routes.js';
import setuRoutes from './routes/setu.routes.js';
import {
  AccountsService,
  AccountAggregatorProvider,
  MockFinancialDataProvider,
} from './services/accounts.service.js';
import notificationsRouter from './routes/notifications.routes.js';

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
function installFinancialDataProvider(): void {
  const aa = config.aaProvider;
  const hasCredentials = Boolean(aa.setu.clientId && aa.setu.clientSecret);
  const isTest = config.environment === 'TEST';

  // MOCK accounts (the seeded HDFC/SBI wallets) are owned by the mock provider,
  // which reports each account's own stored balance. Registering it per-type
  // keeps the AA provider below from writing its single canned figure over
  // accounts it does not own.
  AccountsService.registerProvider('MOCK', new MockFinancialDataProvider());

  if (!isTest && aa.enabled && hasCredentials) {
    const setu = new AccountAggregatorProvider();
    AccountsService.setProvider(setu);
    AccountsService.registerProvider(aa.providerName, setu);
    console.log(
      `[FinPocket Backend API] Financial data provider -> ${aa.providerName} (${aa.setu.environment})`
    );
    return;
  }

  AccountsService.setProvider(new MockFinancialDataProvider());
  const reason = isTest
    ? 'TEST environment'
    : !aa.enabled
        ? 'AA_PROVIDER_ENABLED is off'
        : 'no Setu credentials';
  console.log(`[FinPocket Backend API] Financial data provider -> MOCK (${reason})`);
}

const app = express();
const PORT = config.port;

// Client identity behind a local reverse proxy (the cloudflared tunnel runs on
// this host): trust X-Forwarded-For ONLY from loopback peers. The tunnel's
// forwarded client IP is then genuine, while anyone reaching :PORT directly
// from the LAN is not loopback and cannot spoof it. Without this, every
// tunneled user shares one 127.0.0.1 rate-limit bucket, request logs lose the
// real client IP, and express-rate-limit raises ERR_ERL_UNEXPECTED_X_FORWARDED_FOR.
app.set('trust proxy', 'loopback');

// 1. Security Headers & CORS
app.use(helmet({
  contentSecurityPolicy: config.environment === 'PRODUCTION' ? undefined : false,
  crossOriginEmbedderPolicy: false,
}));

app.use(cors({
  origin: config.corsOrigin,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'Idempotency-Key', 'x-device-id', 'x-request-id', 'x-provider-signature', 'x-setu-signature', 'x-provider-timestamp', 'x-event-id']
}));

// 2. Request Correlation & Sanitized Logging
app.use(requestTracker);

// 3. Request Body Parsing with Size Limits (64 KB ceiling)
// `verify` keeps the exact received bytes so webhook HMAC signatures are
// checked against what the provider actually sent (JSON.stringify(req.body)
// can differ from the wire bytes and silently fails verification).
app.use(express.json({
  limit: '64kb',
  verify: (req, _res, buf) => {
    (req as any).rawBody = buf;
  },
}));

// 4. Layered Rate Limiting
app.use('/api/', generalLimiter);
// Credential/OTP/token endpoints — the old mount targeted a non-existent
// '/password-reset' path, so throttling never applied to real resets.
app.use('/api/v1/auth/login', authLimiter);
app.use('/api/v1/auth/refresh', authLimiter);
app.use('/api/v1/auth/register', authLimiter);
app.use('/api/v1/auth/forgot-password', authLimiter);
app.use('/api/v1/auth/reset-password', authLimiter);
app.use('/api/v1/auth/email/send-otp', authLimiter);
app.use('/api/v1/auth/email/verify-otp', authLimiter);
app.use('/api/v1/auth/phone/send-otp', authLimiter);
app.use('/api/v1/auth/phone/verify-otp', authLimiter);
app.use('/api/v1/auth/otp/resend', authLimiter);
app.use('/api/v1/auth/pin/verify', authLimiter);
app.use('/api/v1/auth/google', authLimiter);
app.use('/api/v1/auth/apple', authLimiter);
app.use('/api/v1/auth/meta', authLimiter);
app.use('/api/v1/payments', paymentsLimiter);
app.use('/api/v1/ai', aiLimiter);

// 4b. RLS request scopes (Phase D, PostgreSQL only — no-ops on SQLite).
// System-role scopes are registered FIRST and mark the request so the generic
// app scope never stacks on top: exactly the three unauthenticated provider
// callback endpoints run without a user context and therefore as
// finpocket_system; everything else under /api runs as finpocket_app with
// SET LOCAL app.current_user_id applied by authMiddleware.
app.use('/api/v1/setu/webhook', systemDbScopeMiddleware);
app.use('/api/v1/aa/callback', systemDbScopeMiddleware);
app.use('/api/v1/setu/redirect', systemDbScopeMiddleware);
app.use('/api', dbScopeMiddleware);

// 5. Observability & Health Routes
app.use('/health', healthRoutes);

// 6. Mount Feature Routes
app.use('/api/v1/auth', authRoutes);
app.use('/api/v1/dashboard', dashboardRoutes);
app.use('/api/v1/financial', financialRoutes);
app.use('/api/v1/accounts', accountsRoutes);
app.use('/api/v1/transactions', transactionsRoutes);
app.use('/api/v1/payments', paymentsRoutes);
app.use('/api/v1/savings', savingsRoutes);
app.use('/api/v1/bills', billsRoutes);
app.use('/api/v1/ai', aiRoutes);
app.use('/api/v1/security', securityRoutes);
app.use('/api/v1/provider', providerRouter);
app.use('/api/v1/aa', aaRoutes);
app.use('/api/v1/setu', setuRoutes);
app.use('/api/v1/notifications', notificationsRouter);

// 7. Centralized Error Handling
app.use(errorHandler);

let server: import('http').Server | null = null;

async function startServer() {
  await initDatabase();
  installFinancialDataProvider();
  server = app.listen(PORT, '0.0.0.0', () => {
    console.log(`[FinPocket Backend API] Server running in ${config.environment} mode at http://localhost:${PORT}`);
    console.log(
      engine === 'postgres'
        ? '[FinPocket Backend API] Database: PostgreSQL (shared pool, TLS per PGSSLMODE, migrations applied).'
        : '[FinPocket Backend API] Connected to SQLite database with foreign keys enforced.'
    );
  });
}

function handleShutdown(signal: string) {
  console.log(`[FinPocket Backend API] Received ${signal}. Starting graceful shutdown...`);
  if (server) {
    server.close(async () => {
      console.log('[FinPocket Backend API] HTTP server closed gracefully.');
      try {
        await closeDatabase();
        console.log('[FinPocket Backend API] Database connections closed.');
      } catch (err) {
        console.error('[FinPocket Backend API] Error while closing database:', err);
      }
      process.exit(0);
    });

    // Force shutdown after timeout if connections remain open
    setTimeout(() => {
      console.error('[FinPocket Backend API] Graceful shutdown timed out. Forcing exit.');
      process.exit(1);
    }, 10000).unref();
  } else {
    process.exit(0);
  }
}

process.on('SIGTERM', () => handleShutdown('SIGTERM'));
process.on('SIGINT', () => handleShutdown('SIGINT'));

startServer().catch(err => {
  console.error('[FinPocket Backend API] Failed to start server:', err);
  process.exit(1);
});
