import { Router, Response } from 'express';
import { authMiddleware, AuthRequest } from '../middleware/auth.middleware.js';
import { ConsentService } from '../services/consent.service.js';
import { SyncService } from '../services/sync.service.js';
import { AccountsService } from '../services/accounts.service.js';
import { SQLiteConsentRepository, SQLiteFinancialSyncRepository } from '../repositories/sqlite_repositories.js';
import { runQuery } from '../config/database.js';
import { v4 as uuidv4 } from 'uuid';

export const providerRouter = Router();
const consentRepo = new SQLiteConsentRepository();
const syncRepo = new SQLiteFinancialSyncRepository();

/**
 * Request new ReBIT Account Aggregator Consent
 */
providerRouter.post('/consent/request', authMiddleware, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId = req.user!.id;
    const { bankAccountId, dataAccessTypes, durationDays } = req.body;

    const consent = await ConsentService.requestConsent(
      userId,
      bankAccountId || 'bnk_unlinked',
      dataAccessTypes || ['TRANSACTIONS', 'BALANCES', 'PROFILE'],
      Number(durationDays) || 365
    );

    res.status(201).json({
      success: true,
      consent
    });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

/**
 * Revoke an active Consent immediately
 */
providerRouter.post('/consent/revoke', authMiddleware, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId = req.user!.id;
    const { consentId } = req.body;

    if (!consentId) {
      res.status(400).json({ error: 'consentId is required.' });
      return;
    }

    const success = await ConsentService.revokeConsent(userId, consentId);
    if (!success) {
      res.status(404).json({ error: 'Consent not found or could not be revoked.' });
      return;
    }

    res.json({
      success: true,
      message: 'Consent revoked successfully. Data synchronization halted.'
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * Trigger manual data sync for authenticated user
 */
providerRouter.post('/sync', authMiddleware, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId = req.user!.id;
    const idempotencyKey = req.headers['idempotency-key'] as string;
    const { rawTransactions } = req.body;

    const result = await SyncService.syncUserData(userId, 'ACCOUNT_AGGREGATOR', idempotencyKey, rawTransactions);

    res.json({
      success: result.status === 'SUCCESS',
      syncResult: result
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * Get current provider integration status and data freshness
 */
providerRouter.get('/status', authMiddleware, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId = req.user!.id;
    const activeConsents = await consentRepo.findActiveByUserId(userId);
    const lastSync = await syncRepo.getLastSync(userId);
    const accounts = await AccountsService.listAccounts(userId);

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
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * Unlink connected bank account & revoke linked consent
 */
providerRouter.post('/unlink', authMiddleware, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId = req.user!.id;
    const { accountId } = req.body;

    if (!accountId) {
      res.status(400).json({ error: 'accountId is required.' });
      return;
    }

    await AccountsService.disconnectAccount(userId, accountId);

    await runQuery(`
      INSERT INTO audit_logs (id, user_id, action, metadata)
      VALUES (?, ?, 'ACCOUNT_UNLINKED', ?)
    `, [uuidv4(), userId, JSON.stringify({ accountId, unlinkedAt: new Date().toISOString() })]);

    res.json({
      success: true,
      message: 'Account unlinked and consent revoked successfully.'
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});
