import { Router, Response } from 'express';
import { AuthRequest, authMiddleware } from '../middleware/auth.middleware.js';
import { allQuery, runQuery } from '../config/database.js';
import { v4 as uuidv4 } from 'uuid';

const router = Router();

// Security Audit Trail (Read-only log of security and financial events)
router.get('/audit-logs', authMiddleware, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const logs = await allQuery(
      'SELECT id, action, metadata, ip_address, created_at FROM audit_logs WHERE user_id = ? ORDER BY created_at DESC LIMIT 50',
      [req.user!.id]
    );
    res.json({ logs });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Devices list
router.get('/devices', authMiddleware, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const devices = await allQuery(
      'SELECT id, device_name, device_model, os_version, ip_address, is_trusted, last_active, created_at FROM devices WHERE user_id = ? ORDER BY last_active DESC',
      [req.user!.id]
    );
    res.json({ devices });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Revoke Device & all related sessions immediately
router.post('/devices/:id/revoke', authMiddleware, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const deviceId = req.params.id;
    // Invalidate all active sessions for this device
    await runQuery('UPDATE sessions SET is_revoked = 1 WHERE device_id = ? AND user_id = ?', [deviceId, req.user!.id]);
    await runQuery('DELETE FROM devices WHERE id = ? AND user_id = ?', [deviceId, req.user!.id]);
    
    await runQuery(`
      INSERT INTO audit_logs (id, user_id, action, metadata)
      VALUES (?, ?, 'DEVICE_REVOKED', ?)
    `, [uuidv4(), req.user!.id, JSON.stringify({ deviceId })]);

    res.json({ success: true, message: 'Device and its associated sessions revoked successfully.' });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Active Sessions list
router.get('/sessions', authMiddleware, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const sessions = await allQuery(
      'SELECT id, device_id, expires_at, is_revoked, created_at FROM sessions WHERE user_id = ? AND is_revoked = 0 ORDER BY created_at DESC',
      [req.user!.id]
    );
    res.json({ sessions });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Revoke specific session
router.post('/sessions/:id/revoke', authMiddleware, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const sessionId = req.params.id;
    await runQuery('UPDATE sessions SET is_revoked = 1 WHERE id = ? AND user_id = ?', [sessionId, req.user!.id]);

    await runQuery(`
      INSERT INTO audit_logs (id, user_id, action, metadata)
      VALUES (?, ?, 'SESSION_REVOKED', ?)
    `, [uuidv4(), req.user!.id, JSON.stringify({ sessionId })]);

    res.json({ success: true, message: 'Session revoked successfully.' });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Update spending and payment limits
router.post('/update-limits', authMiddleware, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { perTxnLimit, dailyLimit, monthlyLimit } = req.body;
    await runQuery(`
      UPDATE users SET 
        per_txn_payment_limit = COALESCE(?, per_txn_payment_limit),
        daily_payment_limit = COALESCE(?, daily_payment_limit),
        monthly_payment_limit = COALESCE(?, monthly_payment_limit)
      WHERE id = ?
    `, [perTxnLimit, dailyLimit, monthlyLimit, req.user!.id]);

    await runQuery(`
      INSERT INTO audit_logs (id, user_id, action, metadata)
      VALUES (?, ?, 'LIMIT_CHANGED', ?)
    `, [uuidv4(), req.user!.id, JSON.stringify({ perTxnLimit, dailyLimit, monthlyLimit })]);

    res.json({ success: true, message: 'Payment limits updated successfully.' });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
