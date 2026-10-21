import { Request, Response, NextFunction } from 'express';
import { TrackingRequest } from './request_tracker.middleware.js';
import { config } from '../config/app_config.js';

export interface AppError extends Error {
  statusCode?: number;
  code?: string;
  isOperational?: boolean;
}

export function sanitizeErrorResponse(err: Error, requestId: string, isProduction: boolean = true) {
  const code = (err as AppError).code || 'INTERNAL_SERVER_ERROR';
  const safeMessage = isProduction
    ? 'An unexpected error occurred. Please contact support with your Request ID.'
    : err.message || 'Internal Server Error';

  return {
    code,
    message: safeMessage,
    requestId,
    ...(!isProduction ? { debugDetails: err.message } : {})
  };
}

export function errorHandler(
  err: AppError,
  req: TrackingRequest,
  res: Response,
  _next: NextFunction
): void {
  const statusCode = err.statusCode || 500;
  const requestId = req.requestId || (res.getHeader('x-request-id') as string) || 'req_unknown';
  const code = err.code || (statusCode === 404 ? 'NOT_FOUND' : statusCode === 400 ? 'BAD_REQUEST' : statusCode === 401 ? 'UNAUTHORIZED' : statusCode === 403 ? 'FORBIDDEN' : 'INTERNAL_SERVER_ERROR');

  // Log internal details securely
  console.error(`[ERROR HANDLER] [${requestId}] ${err.name}: ${err.message}`, {
    stack: config.environment !== 'PRODUCTION' ? err.stack : undefined,
    url: req.originalUrl,
    method: req.method,
    statusCode,
  });

  const responseBody = sanitizeErrorResponse(err, requestId, config.environment === 'PRODUCTION' && statusCode >= 500);
  res.status(statusCode).json({
    ...responseBody,
    code,
  });
}
