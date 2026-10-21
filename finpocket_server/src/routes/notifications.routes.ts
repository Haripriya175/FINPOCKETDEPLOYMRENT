import { Router, Response } from 'express';
import { authMiddleware, AuthRequest } from '../middleware/auth.middleware.js';
import { NotificationService } from '../services/notification.service.js';

export const notificationsRouter = Router();

/**
 * Device notification centre backing store.
 *
 * The table existed since schema v1 but nothing ever read or wrote it, which
 * meant alerts lived and died on a single device. These endpoints let the app
 * rehydrate its notification list after a reinstall.
 */
notificationsRouter.get('/', authMiddleware, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const limit = Math.min(Number(req.query.limit) || 50, 200);
    const notifications = await NotificationService.list(req.user!.id, limit);
    res.json({ notifications });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

notificationsRouter.post('/read-all', authMiddleware, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const updated = await NotificationService.markAllRead(req.user!.id);
    res.json({ success: true, updated });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

notificationsRouter.post('/', authMiddleware, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { title, body, type } = req.body || {};
    if (!title || !body) {
      res.status(400).json({ error: 'title and body are required.' });
      return;
    }
    const id = await NotificationService.record(
      req.user!.id,
      String(title),
      String(body),
      String(type || 'system')
    );
    res.status(201).json({ success: true, id });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default notificationsRouter;
