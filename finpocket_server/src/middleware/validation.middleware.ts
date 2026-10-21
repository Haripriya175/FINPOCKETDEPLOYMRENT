import { Request, Response, NextFunction } from 'express';

export function isFinancialAmountValid(val: number): { valid: boolean; reason?: string } {
  if (val === undefined || val === null) {
    return { valid: false, reason: 'Amount is required' };
  }
  const numValue = Number(val);
  if (isNaN(numValue) || !isFinite(numValue)) {
    return { valid: false, reason: 'Amount must be a finite number' };
  }
  if (numValue <= 0) {
    return { valid: false, reason: 'Amount must be positive' };
  }
  if (numValue > 10000000.0) {
    return { valid: false, reason: 'Amount exceeds maximum threshold (₹1 Crore)' };
  }
  return { valid: true };
}

export function parsePagination(page?: any, limit?: any): { page: number; limit: number } {
  let p = Number(page) || 1;
  let l = Number(limit) || 20;
  if (p < 1) p = 1;
  if (l < 1) l = 20;
  if (l > 100) l = 100;
  return { page: p, limit: l };
}

export function validateFinancialAmount(field: string = 'amount') {
  return (req: Request, res: Response, next: NextFunction): void => {
    const rawValue = req.body[field];
    const check = isFinancialAmountValid(rawValue);
    if (!check.valid) {
      res.status(400).json({
        code: 'INVALID_AMOUNT',
        message: check.reason || `Field '${field}' is invalid.`
      });
      return;
    }

    req.body[field] = Number(rawValue);
    next();
  };
}

export function validatePaginationParams(req: Request, res: Response, next: NextFunction): void {
  const { limit, page } = req.query;

  if (limit !== undefined) {
    const numLimit = Number(limit);
    if (isNaN(numLimit) || numLimit < 1 || numLimit > 100) {
      res.status(400).json({
        code: 'INVALID_PAGINATION',
        message: 'Pagination parameter limit must be between 1 and 100.'
      });
      return;
    }
  }

  if (page !== undefined) {
    const numPage = Number(page);
    if (isNaN(numPage) || numPage < 1) {
      res.status(400).json({
        code: 'INVALID_PAGINATION',
        message: 'Pagination parameter page must be 1 or greater.'
      });
      return;
    }
  }

  next();
}

export function validatePayloadSize(maxBytes: number = 65536) { // 64 KB default
  return (req: Request, res: Response, next: NextFunction): void => {
    const contentLength = Number(req.headers['content-length'] || 0);
    if (contentLength > maxBytes) {
      res.status(413).json({
        code: 'PAYLOAD_TOO_LARGE',
        message: `Request payload exceeds maximum allowable size (${maxBytes} bytes).`
      });
      return;
    }
    next();
  };
}
