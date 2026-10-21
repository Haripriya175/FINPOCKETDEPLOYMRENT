import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { getQuery } from '../config/database.js';
import { currentScope } from '../config/db/context.js';
import { config } from '../config/app_config.js';

export const JWT_SECRET = config.jwtSecret;

export interface AuthenticatedUser {
  id: string;
  email: string;
  name: string;
}

export interface AuthRequest extends Request {
  user?: AuthenticatedUser;
  sessionId?: string;
  deviceId?: string;
}

export async function authMiddleware(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Authentication required. No Bearer token provided.' });
    return;
  }

  const token = authHeader.split(' ')[1];
  try {
    const decoded = jwt.verify(token, JWT_SECRET) as any;
    
    // Check if user exists
    const user = await getQuery<{ id: string; email: string; name: string }>(
      'SELECT id, email, name FROM users WHERE id = ?',
      [decoded.userId]
    );

    if (!user) {
      res.status(401).json({ error: 'User session invalid or user not found.' });
      return;
    }

    // Check server-side session revocation if sessionId is in token
    if (decoded.sessionId) {
      const session = await getQuery<{ id: string; is_revoked: number; expires_at: string }>(
        'SELECT id, is_revoked, expires_at FROM sessions WHERE id = ?',
        [decoded.sessionId]
      );

      if (!session) {
        res.status(401).json({ error: 'Session not found or invalid.' });
        return;
      }

      if (session.is_revoked === 1) {
        res.status(401).json({ error: 'Session has been revoked. Please re-authenticate.' });
        return;
      }

      if (new Date(session.expires_at) < new Date()) {
        res.status(401).json({ error: 'Session has expired. Please refresh token or login again.' });
        return;
      }

      req.sessionId = session.id;
    }

    req.user = user;
    req.deviceId = req.headers['x-device-id'] as string || 'device_default';

    // Phase D RLS: bind THIS request's transaction to the authenticated user.
    // SET LOCAL is transaction-scoped — the identity dies at COMMIT/ROLLBACK,
    // so a pooled connection can never carry one user's context into another
    // request. No scope (SQLite mode / background calls) → no-op.
    const scope = currentScope();
    if (scope) {
      try {
        await scope.client.query(`SELECT set_config('app.current_user_id', $1, true)`, [user.id]);
        scope.userId = user.id;
      } catch (err: any) {
        console.error('[auth] Failed to establish RLS user context:', err?.message || err);
        res.status(500).json({ error: 'Internal server error. Please try again.' });
        return;
      }
    }

    next();
  } catch (err: any) {
    if (err.name === 'TokenExpiredError') {
      res.status(401).json({ error: 'Access token expired.' });
    } else {
      res.status(401).json({ error: 'Invalid or expired authorization token.' });
    }
  }
}
