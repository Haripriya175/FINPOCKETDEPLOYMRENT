import { allQuery, execQuery, getQuery, runQuery } from './database.js';

export interface Migration {
  version: number;
  name: string;
  up: (engine: 'sqlite' | 'postgres') => Promise<void>;
  down?: (engine: 'sqlite' | 'postgres') => Promise<void>;
}

export class MigrationRunner {
  private static migrations: Migration[] = [
    {
      version: 1,
      name: 'initial_core_schema',
      up: async (_engine) => {
        // Core schema already created by initDatabase()
      }
    },
    {
      version: 2,
      name: 'account_aggregator_and_freshness_fields',
      up: async (engine) => {
        if (engine === 'sqlite') {
          await execQuery(`
            CREATE TABLE IF NOT EXISTS schema_migrations (
              version INTEGER PRIMARY KEY,
              name TEXT NOT NULL,
              applied_at TEXT DEFAULT CURRENT_TIMESTAMP
            );

            CREATE TABLE IF NOT EXISTS provider_connections (
              id TEXT PRIMARY KEY,
              user_id TEXT NOT NULL,
              provider_type TEXT NOT NULL,
              encrypted_access_token TEXT,
              encrypted_refresh_token TEXT,
              token_expires_at TEXT,
              connection_status TEXT DEFAULT 'ACTIVE',
              last_successful_sync TEXT,
              last_failed_sync TEXT,
              last_error_message TEXT,
              created_at TEXT DEFAULT CURRENT_TIMESTAMP,
              updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
              FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
            );

            CREATE TABLE IF NOT EXISTS sync_history (
              id TEXT PRIMARY KEY,
              user_id TEXT NOT NULL,
              provider_type TEXT NOT NULL,
              consent_id TEXT,
              status TEXT NOT NULL,
              accounts_synced INTEGER DEFAULT 0,
              transactions_synced INTEGER DEFAULT 0,
              error_details TEXT,
              idempotency_key TEXT,
              duration_ms INTEGER DEFAULT 0,
              timestamp TEXT DEFAULT CURRENT_TIMESTAMP,
              FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
            );
          `);
        }
      }
    }
  ];

  static async runMigrations(engine: 'sqlite' | 'postgres' = 'sqlite'): Promise<{ applied: number; currentVersion: number }> {
    if (engine === 'sqlite') {
      await execQuery(`
        CREATE TABLE IF NOT EXISTS schema_migrations (
          version INTEGER PRIMARY KEY,
          name TEXT NOT NULL,
          applied_at TEXT DEFAULT CURRENT_TIMESTAMP
        );
      `);

      const appliedRows = await allQuery<{ version: number }>('SELECT version FROM schema_migrations ORDER BY version ASC');
      const appliedSet = new Set(appliedRows.map(r => r.version));
      let count = 0;

      for (const m of this.migrations) {
        if (!appliedSet.has(m.version)) {
          await m.up(engine);
          await runQuery('INSERT INTO schema_migrations (version, name) VALUES (?, ?)', [m.version, m.name]);
          count++;
        }
      }

      const latest = (await getQuery<{ max_ver: number }>('SELECT MAX(version) as max_ver FROM schema_migrations'))?.max_ver || 0;
      return { applied: count, currentVersion: latest };
    }

    return { applied: 0, currentVersion: this.migrations.length };
  }
}
