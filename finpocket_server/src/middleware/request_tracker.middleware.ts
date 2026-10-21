import { Request, Response, NextFunction } from 'express';
import { v4 as uuidv4 } from 'uuid';

export interface TrackingRequest extends Request {
  requestId?: string;
  startTime?: number;
}

export function sanitizePayload(data: any): any {
  if (!data || typeof data !== 'object') return data;
  if (Array.isArray(data)) return data.map(sanitizePayload);

  const sanitized: Record<string, any> = {};

  const SENSITIVE_KEYS = new Set([
    'password', 'passwordhash', 'password_hash',
    'pin', 'pinhash', 'pin_hash', 'apppin', 'app_pin', 'app_pin_hash',
    'token', 'accesstoken', 'access_token',
    'refreshtoken', 'refresh_token',
    'authorization', 'secret', 'jwt_secret',
    'cardnumber', 'card_number', 'cvv', 'cvv2'
  ]);

  for (const [key, value] of Object.entries(data)) {
    const lowerKey = key.toLowerCase().replace(/[-_]/g, '');
    if (SENSITIVE_KEYS.has(lowerKey) || lowerKey.includes('password') || lowerKey.includes('secret') || lowerKey.includes('pin')) {
      sanitized[key] = '[REDACTED]';
    } else if (typeof value === 'object') {
      sanitized[key] = sanitizePayload(value);
    } else {
      sanitized[key] = value;
    }
  }
  return sanitized;
}

export const sanitizeForLogging = sanitizePayload;

export function requestTracker(req: TrackingRequest, res: Response, next: NextFunction): void {
  const incomingId = req.headers['x-request-id'] as string;
  const requestId = (incomingId && /^[a-zA-Z0-9_-]{8,64}$/.test(incomingId)) ? incomingId : uuidv4();
  
  req.requestId = requestId;
  req.startTime = Date.now();
  res.setHeader('x-request-id', requestId);

  res.on('finish', () => {
    const duration = Date.now() - (req.startTime || Date.now());
    const logData = {
      timestamp: new Date().toISOString(),
      requestId,
      method: req.method,
      url: req.originalUrl || req.url,
      statusCode: res.statusCode,
      durationMs: duration,
      ip: req.ip || req.socket.remoteAddress,
      userAgent: req.headers['user-agent'] || 'unknown',
      userId: (req as any).user?.id || 'anonymous',
    };

    if (res.statusCode >= 500) {
      console.error(`[HTTP ERROR] ${JSON.stringify(logData)}`);
    } else if (res.statusCode >= 400) {
      console.warn(`[HTTP WARN] ${JSON.stringify(logData)}`);
    } else if (process.env.NODE_ENV !== 'TEST') {
      console.log(`[HTTP INFO] ${JSON.stringify(logData)}`);
    }
  });

  next();
}
