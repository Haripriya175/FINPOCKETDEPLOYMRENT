import { Router, Request, Response } from 'express';
import { getQuery } from '../config/database.js';
import { config } from '../config/app_config.js';

const router = Router();

/**
 * 0. GET /health (Root health check)
 */
router.get('/', (_req: Request, res: Response) => {
  res.json({
    status: 'OK',
    environment: config.environment,
    timestamp: new Date().toISOString(),
  });
});

/**
 * 1. GET /health/live (Kubernetes / container liveness check)
 */
router.get('/live', (_req: Request, res: Response) => {
  res.json({
    status: 'UP',
    timestamp: new Date().toISOString(),
    uptimeSeconds: Math.floor(process.uptime()),
    environment: config.environment,
  });
});

/**
 * 2. GET /health/ready (Readiness probe verifying DB & config)
 */
router.get('/ready', async (_req: Request, res: Response) => {
  try {
    const dbTest = await getQuery<{ val: number }>('SELECT 1 as val');
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
      environment: config.environment,
      // Account Aggregator availability — lets the mobile app choose between
      // the real AA consent flow and the on-device SMS importer instead of guessing.
      aaEnabled: config.aaProvider.enabled === true &&
          !['MOCK', 'FAKE_TEST_PROVIDER'].includes(config.aaProvider.providerName),
      aaProvider: config.aaProvider.providerName,
      timestamp: new Date().toISOString()
    });
  } catch (err: any) {
    res.status(503).json({
      status: 'UNHEALTHY',
      error: config.environment === 'PRODUCTION' ? 'Dependency check failed' : err.message,
      timestamp: new Date().toISOString()
    });
  }
});

/**
 * 3. GET /health/email-diag (Inspect configured email gateways safely)
 */
router.get('/email-diag', async (_req: Request, res: Response) => {
  res.json({
    hasResend: Boolean(process.env.RESEND_API_KEY),
    hasBrevo: Boolean(process.env.BREVO_API_KEY),
    hasSmtp: Boolean(config.smtp.user && config.smtp.appPassword),
    has2Factor: Boolean(process.env.TWOFACTOR_API_KEY || process.env['2FACTOR_API_KEY']),
    smsProvider: process.env.SMS_PROVIDER || config.sms?.provider || 'none',
    brevoFrom: process.env.BREVO_FROM_EMAIL || config.smtp.user || 'no-reply@finpocket.com',
  });
});

/**
 * 4. GET /health/test-brevo (Direct probe from Render to Brevo API)
 */
router.get('/test-brevo', async (req: Request, res: Response) => {
  const targetEmail = (req.query.email as string) || 'sureddydinesh197@gmail.com';
  const brevoApiKey = process.env.BREVO_API_KEY;
  const brevoFromEmail = process.env.BREVO_FROM_EMAIL || config.smtp.user || 'no-reply@finpocket.com';
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
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;

