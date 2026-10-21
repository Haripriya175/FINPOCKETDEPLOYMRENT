import rateLimit from 'express-rate-limit';
import { config } from '../config/app_config.js';

export const generalLimiter = rateLimit({
  windowMs: config.rateLimits.generalWindowMs,
  max: config.rateLimits.generalMax,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    code: 'RATE_LIMIT_EXCEEDED',
    message: 'Too many requests from this IP, please try again later.',
  }
});

export const authLimiter = rateLimit({
  windowMs: config.rateLimits.authWindowMs,
  max: config.rateLimits.authMax,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    code: 'AUTH_RATE_LIMIT_EXCEEDED',
    message: 'Too many authentication attempts. Account access is temporarily throttled for security.',
  }
});

export const paymentsLimiter = rateLimit({
  windowMs: config.rateLimits.paymentsWindowMs,
  max: config.rateLimits.paymentsMax,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    code: 'PAYMENT_RATE_LIMIT_EXCEEDED',
    message: 'Payment initiation rate limit exceeded. Please wait before submitting another transaction.',
  }
});

export const aiLimiter = rateLimit({
  windowMs: config.rateLimits.aiWindowMs,
  max: config.rateLimits.aiMax,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    code: 'AI_RATE_LIMIT_EXCEEDED',
    message: 'AI assistant query rate limit reached. Please wait before asking more questions.',
  }
});
