/**
 * Phase D — request-scoped database transactions (PostgreSQL only).
 *
 * Row-Level Security policies read `app.current_user_id` with SET LOCAL, and
 * SET LOCAL is transaction-scoped. So in PostgreSQL mode every /api request
 * runs as:
 *
 *   checkout pinned client → BEGIN → (auth middleware: SET LOCAL user id)
 *   → handler runs → COMMIT (or ROLLBACK on 5xx/abort) → release
 *
 * Because the client is pinned through AsyncLocalStorage for the whole
 * request, every helper call in the handler shares one connection/transaction:
 *  - the context applies to every query of this request,
 *  - SET LOCAL dies with the transaction, so a connection returned to the pool
 *    can never carry one user's identity into another request (no leakage),
 *  - handler `withTransaction()` calls nest as SAVEPOINTs (existing Phase B
 *    semantics, unchanged).
 *
 * Unauthenticated provider callbacks (Setu redirect / webhooks) run under the
 * systemDbScopeMiddleware instead: they use the finpocket_system role, whose
 * policies grant access without a user context — scoped to exactly the routes
 * that need it, never to normal API traffic.
 *
 * In SQLite mode both middlewares are pass-through no-ops.
 */
import { NextFunction, Request, Response } from 'express';
import type { Pool, PoolClient } from 'pg';
import { dbScopeStorage } from '../config/db/context.js';
import { isPostgresEngine } from '../config/database.js';
import { getAppPgPool, getSystemPgPool } from '../config/db/postgres.js';
import { sanitizePgError } from '../config/db/pg_pool.js';

interface ScopedRequest extends Request {
  /** Set once a scope (app or system) owns this request — prevents nesting. */
  __dbScoped?: boolean;
}

/** 5xx or an unfinished response = handler failed mid-work → roll back. */
function outcomeFor(res: Response, finished: boolean): 'commit' | 'rollback' {
  if (!finished) return 'rollback'; // aborted before completing
  return res.statusCode >= 500 ? 'rollback' : 'commit';
}

async function beginScopedRequest(
  pool: Pool,
  req: ScopedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  let client: PoolClient;
  try {
    client = await pool.connect();
  } catch (err) {
    console.error('[DB] Request-scope client checkout failed:', sanitizePgError(err));
    if (!res.headersSent) {
      res.status(503).json({ error: 'Service temporarily unavailable. Please try again.' });
    }
    return;
  }

  req.__dbScoped = true;

  let settled = false;
  let released = false;
  const releaseOnce = (): void => {
    if (!released) {
      released = true;
      client.release();
    }
  };
  const settle = async (finished: boolean): Promise<void> => {
    if (settled) return;
    settled = true;
    try {
      await client.query(outcomeFor(res, finished) === 'commit' ? 'COMMIT' : 'ROLLBACK');
    } catch (err) {
      console.error('[DB] Request-scope transaction settle failed:', sanitizePgError(err));
    } finally {
      releaseOnce();
    }
  };

  try {
    await client.query('BEGIN');
  } catch (err) {
    console.error('[DB] Request-scope BEGIN failed:', sanitizePgError(err));
    releaseOnce();
    if (!res.headersSent) {
      res.status(503).json({ error: 'Service temporarily unavailable. Please try again.' });
    }
    return;
  }

  // Response lifecycle → transaction outcome. 'finish' = handler completed
  // (5xx rolls back partial writes; 4xx commits — e.g. LOGIN_FAILED audits).
  // 'close' without 'finish' = client aborted → roll back unfinished work.
  let finished = false;
  res.once('finish', () => {
    finished = true;
    void settle(true);
  });
  res.once('close', () => {
    void settle(finished);
  });

  // Enter the ALS scope BEFORE continuing the chain: everything downstream
  // (auth set_config, handlers, services, withTransaction savepoints) inherits
  // this pinned client.
  dbScopeStorage.run({ client, txDepth: 1 }, () => {
    next();
  });
}

/** Normal API requests — finpocket_app role, user context set by authMiddleware. */
export function dbScopeMiddleware(req: Request, res: Response, next: NextFunction): void {
  if (!isPostgresEngine()) return next();
  const scopedReq = req as ScopedRequest;
  if (scopedReq.__dbScoped) return next();
  void beginScopedRequest(getAppPgPool(), scopedReq, res, next);
}

/**
 * Unauthenticated provider callback routes — finpocket_system role (policies
 * allow access without a user GUC). Marks the request so the generic app
 * scope does not stack a second transaction on top.
 */
export function systemDbScopeMiddleware(req: Request, res: Response, next: NextFunction): void {
  if (!isPostgresEngine()) return next();
  const scopedReq = req as ScopedRequest;
  if (scopedReq.__dbScoped) return next();
  void beginScopedRequest(getSystemPgPool(), scopedReq, res, next);
}
