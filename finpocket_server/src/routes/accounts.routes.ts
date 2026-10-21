import { Router, Response } from 'express';
import { AuthRequest, authMiddleware } from '../middleware/auth.middleware.js';
import { AccountsService } from '../services/accounts.service.js';
import { config } from '../config/app_config.js';

const router = Router();

router.get('/', authMiddleware, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const accounts = await AccountsService.listAccounts(req.user!.id);
    res.json({ accounts });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/:id/sync', authMiddleware, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const updatedBalance = await AccountsService.syncAccount(req.user!.id, req.params.id);
    res.json({ success: true, updatedBalance, message: 'Account synchronized via Financial Data Provider.' });
  } catch (err: any) {
    // An unknown account is a data-level 404, not a server fault.
    const notFound = typeof err?.message === 'string' && /not found/i.test(err.message);
    res.status(notFound ? 404 : 500).json({ error: err.message });
  }
});

router.post('/instant-link', authMiddleware, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { institutionName, institutionCode, maskedAccountNumber, initialBalance, accountType } = req.body;
    const account = await AccountsService.createSelfDeclaredAccount(req.user!.id, {
      institutionName: institutionName || 'Primary Bank Account',
      institutionCode: institutionCode || 'INSTANT',
      maskedAccountNumber: maskedAccountNumber || '•••• 4829',
      accountType: accountType || 'SAVINGS',
      initialBalance: typeof initialBalance === 'number' && initialBalance >= 0 ? initialBalance : 50000.0,
    });
    res.status(201).json({ success: true, account });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/connect-mock', authMiddleware, async (req: AuthRequest, res: Response): Promise<void> => {
  // Mock account connections are a TEST/DEV/DEMO affordance only — a real
  // environment must never fabricate a bank account for a user.
  if (!['TEST', 'DEVELOPMENT', 'DEMO'].includes(config.environment)) {
    res.status(403).json({ error: 'Mock account connections are not available in this environment.' });
    return;
  }
  try {
    const { institutionCode } = req.body;
    const account = await AccountsService.connectMockAccount(req.user!.id, institutionCode || 'HDFC');
    res.status(201).json({ success: true, account });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/:id/disconnect', authMiddleware, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    await AccountsService.disconnectAccount(req.user!.id, req.params.id);
    res.json({ success: true, message: 'Bank account disconnected and consent revoked.' });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
