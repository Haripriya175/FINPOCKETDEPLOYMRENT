import { AsyncLocalStorage } from 'node:async_hooks';
import type { PoolClient } from 'pg';

/**
 * Request-scoped database scope, propagated through async call chains with
 * AsyncLocalStorage.
 *
 * Why this exists: `withTransaction()` and (in Phase D) Row-Level Security both
 * require that every query belonging to one logical unit of work runs on ONE
 * PostgreSQL client, inside ONE transaction. Express handlers are async and
 * never pass a client handle down explicitly — the scope solves that without
 * changing any service signature.
 *
 * In SQLite mode this module is unused (single shared connection + mutex).
 */
export interface DbScope {
  client: PoolClient;
  /** Authenticated user id once known (RLS context in Phase D). */
  userId?: string;
  /** Nesting depth — inner transactions become SAVEPOINTs. */
  txDepth: number;
}

export const dbScopeStorage = new AsyncLocalStorage<DbScope>();

export function currentScope(): DbScope | undefined {
  return dbScopeStorage.getStore();
}
