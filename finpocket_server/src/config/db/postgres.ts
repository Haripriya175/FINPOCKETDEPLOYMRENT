/**
 * PostgreSQL implementations of the five query helpers the whole application
 * already uses (execQuery / runQuery / getQuery / allQuery / withTransaction).
 *
 * database.ts dispatches to these when the engine is postgres — the 39 files
 * importing the helpers stay byte-for-byte unchanged.
 *
 * Transaction pinning: withTransaction() checks out ONE client, runs the
 * operation inside an AsyncLocalStorage scope, and every helper call issued
 * from within that async context transparently uses the SAME client — so
 * BEGIN/COMMIT actually contain the queries. Nested withTransaction() calls
 * become SAVEPOINTs. This scope is also the future attachment point for the
 * Phase D RLS context (SET LOCAL app.current_user_id).
 */
import type { Pool, PoolClient } from 'pg';
import { currentScope, dbScopeStorage } from './context.js';
import { translateToPostgres } from './translate.js';
import { sanitizePgError } from './pg_pool.js';

let pool: Pool | null = null;
let systemPool: Pool | null = null;

export function attachPgPool(p: Pool): void {
  pool = p;
}

/** The finpocket_system-role pool used by explicitly-scoped webhook routes. */
export function attachPgSystemPool(p: Pool): void {
  systemPool = p;
}

export function getSystemPgPool(): Pool {
  if (!systemPool) {
    throw new Error('[DB] PostgreSQL system pool not attached — initDatabase() must run before serving requests.');
  }
  return systemPool;
}

function getPool(): Pool {
  if (!pool) {
    throw new Error('[DB] PostgreSQL pool not attached — initDatabase() must run before serving requests.');
  }
  return pool;
}

/** The finpocket_app-role pool (request-scope middleware checks out from it). */
export function getAppPgPool(): Pool {
  return getPool();
}

function sanitize<T>(err: T): T {
  if (err && typeof (err as { message?: unknown }).message === 'string') {
    (err as unknown as { message: string }).message = sanitizePgError(err);
  }
  return err;
}

async function execOnAny(query: string, params: unknown[]): Promise<{ rows: any[]; rowCount: number | null }> {
  const scope = currentScope();
  try {
    if (scope) {
      return await scope.client.query(query, params as any[]);
    }
    return await getPool().query(query, params as any[]);
  } catch (err) {
    // PG errors can embed connection info — strip before they reach logs.
    throw sanitize(err);
  }
}

/** Multi-statement, no parameters — matches SQLite's db.exec semantics. */
export async function pgExecQuery(sql: string): Promise<void> {
  try {
    await (currentScope()?.client ?? getPool()).query(translateToPostgres(sql));
  } catch (err) {
    throw sanitize(err);
  }
}

export interface PgRunResult {
  changes: number;
  lastID: undefined; // no caller in src uses lastID (audit-verified)
}

export async function pgRunQuery(sql: string, params: any[] = []): Promise<PgRunResult> {
  const res = await execOnAny(translateToPostgres(sql), params);
  return { changes: res.rowCount ?? 0, lastID: undefined };
}

export async function pgGetQuery<T = any>(sql: string, params: any[] = []): Promise<T | undefined> {
  const res = await execOnAny(translateToPostgres(sql), params);
  return res.rows[0] as T | undefined;
}

export async function pgAllQuery<T = any>(sql: string, params: any[] = []): Promise<T[]> {
  const res = await execOnAny(translateToPostgres(sql), params);
  return res.rows as T[];
}

export async function pgWithTransaction<T>(operation: () => Promise<T>): Promise<T> {
  const scope = currentScope();

  // Already inside a pinned transaction → nest with a savepoint so an inner
  // failure rolls back only the inner work (same semantics as SQLite, where
  // nested calls share the single connection).
  if (scope) {
    const name = `fp_sp_${scope.txDepth + 1}`;
    try {
      await scope.client.query(`SAVEPOINT ${name}`);
    } catch (err) {
      throw sanitize(err);
    }
    scope.txDepth += 1;
    try {
      const result = await operation();
      await scope.client.query(`RELEASE SAVEPOINT ${name}`);
      return result;
    } catch (err) {
      try {
        await scope.client.query(`ROLLBACK TO SAVEPOINT ${name}`);
      } catch {
        /* the outer transaction will fail as a whole anyway */
      }
      throw err;
    } finally {
      scope.txDepth -= 1;
    }
  }

  const client = await getPool().connect();
  try {
    return await dbScopeStorage.run({ client, txDepth: 1 }, async () => {
      try {
        await client.query('BEGIN');
      } catch (err) {
        throw sanitize(err);
      }
      try {
        const result = await operation();
        await client.query('COMMIT');
        return result;
      } catch (error) {
        try {
          await client.query('ROLLBACK');
        } catch (rollbackErr) {
          console.error('[Database] Rollback failed:', sanitizePgError(rollbackErr));
        }
        throw error;
      }
    });
  } finally {
    client.release();
  }
}
