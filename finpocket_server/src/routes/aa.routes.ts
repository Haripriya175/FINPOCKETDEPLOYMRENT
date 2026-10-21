import { Router, Request, Response } from 'express';
import { authMiddleware, AuthRequest } from '../middleware/auth.middleware.js';
import { AccountsService } from '../services/accounts.service.js';
import { ConsentService } from '../services/consent.service.js';
import { AACallbackService } from '../services/aa_callback.service.js';
import { config } from '../config/app_config.js';
import { getQuery, allQuery } from '../config/database.js';

const router = Router();

/**
 * POST /api/v1/aa/consent/request
 * Initiate Account Aggregator consent request
 */
router.post('/consent/request', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.id || '';
    const { institutionCode, mobileNumber } = req.body;

    if (!institutionCode) {
      return res.status(400).json({ code: 'INVALID_REQUEST', message: 'institutionCode is required.' });
    }

    const account = await AccountsService.getProvider().connectAccount(userId, institutionCode, mobileNumber);
    return res.status(200).json({
      status: 'SUCCESS',
      account,
      message: 'Consent request initiated successfully.'
    });
  } catch (err: any) {
    return res.status(500).json({
      code: 'AA_CONSENT_ERROR',
      message: err.message || 'Failed to initiate consent request.'
    });
  }
});

/**
 * GET /api/v1/aa/consent/status/:handle
 * Query consent status by handle
 */
router.get('/consent/status/:handle', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.id || '';
    const { handle } = req.params;

    const consent = await getQuery<any>(
      'SELECT * FROM account_consents WHERE consent_handle = ? AND user_id = ?',
      [handle, userId]
    );

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
  } catch (err: any) {
    return res.status(500).json({
      code: 'CONSENT_STATUS_ERROR',
      message: 'Failed to retrieve consent status.'
    });
  }
});

/**
 * POST /api/v1/aa/consent/revoke/:consentId
 * Revoke an active consent artefact
 */
router.post('/consent/revoke/:consentId', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.id || '';
    const { consentId } = req.params;

    const success = await ConsentService.revokeConsent(userId, consentId);
    if (!success) {
      return res.status(404).json({ code: 'NOT_FOUND', message: 'Consent record not found or unauthorized.' });
    }

    return res.status(200).json({
      status: 'SUCCESS',
      message: 'Consent revoked successfully.'
    });
  } catch (err: any) {
    return res.status(500).json({
      code: 'CONSENT_REVOKE_ERROR',
      message: 'Failed to revoke consent.'
    });
  }
});

/**
 * POST /api/v1/aa/callback
 * Asynchronous webhook from Account Aggregator gateway
 */
router.post('/callback', async (req: Request, res: Response) => {
  try {
    // HMAC over the exact received bytes (see express.json verify hook).
    const rawBody = (req as any).rawBody
      ? (req as any).rawBody.toString('utf8')
      : JSON.stringify(req.body);
    const signature = (req.headers['x-provider-signature'] || req.headers['x-setu-signature'] || '') as string;
    const secret = config.aaProvider.webhookSecret;

    const result = await AACallbackService.processWebhook(rawBody, signature, secret, req.body);
    if (!result.valid) {
      return res.status(400).json({
        code: result.code || 'WEBHOOK_VERIFICATION_FAILED',
        message: result.reason || 'Webhook verification failed.'
      });
    }

    return res.status(200).json({
      status: 'SUCCESS',
      message: 'Webhook processed successfully.'
    });
  } catch (err: any) {
    return res.status(500).json({
      code: 'WEBHOOK_PROCESSING_ERROR',
      message: 'Internal error processing webhook.'
    });
  }
});

/**
 * POST /api/v1/aa/accounts/sync/:accountId
 * Manually trigger synchronization for a connected account
 */
router.post('/accounts/sync/:accountId', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.id || '';
    const { accountId } = req.params;

    const balance = await AccountsService.syncAccount(userId, accountId);
    return res.status(200).json({
      status: 'SUCCESS',
      balance,
      message: 'Account synchronized successfully.'
    });
  } catch (err: any) {
    const isForbidden = err?.message?.includes('403') || err?.message?.includes('Consent');
    return res.status(isForbidden ? 403 : 500).json({
      code: isForbidden ? 'CONSENT_INVALID' : 'SYNC_FAILED',
      message: err.message || 'Synchronization failed.'
    });
  }
});

export default router;
