import { Router, Response } from 'express';
import { AuthRequest, authMiddleware } from '../middleware/auth.middleware.js';
import { AIAssistantService } from '../services/ai.service.js';

const router = Router();

router.post('/query', authMiddleware, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { query } = req.body;
    if (!query || typeof query !== 'string') {
      res.status(400).json({ error: 'Query string is required.' });
      return;
    }

    const response = await AIAssistantService.processQuery(req.user!.id, query);
    res.json({ response });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
