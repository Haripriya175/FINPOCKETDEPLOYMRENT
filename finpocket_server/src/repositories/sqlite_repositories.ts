import { allQuery, getQuery, runQuery } from '../config/database.js';
import {
  FinancialAccountEntity,
  FinancialTransactionEntity,
  AccountConsentEntity,
  ProviderConnectionEntity,
  SyncLogEntity,
  IFinancialAccountRepository,
  ITransactionRepository,
  IConsentRepository,
  IProviderConnectionRepository,
  IFinancialSyncRepository,
  FreshnessStatus,
  ConsentStatus,
  ProviderType
} from './repository.interface.js';

export class SQLiteFinancialAccountRepository implements IFinancialAccountRepository {
  async findById(id: string, userId: string): Promise<FinancialAccountEntity | null> {
    const row = await getQuery<any>(
      'SELECT * FROM bank_accounts WHERE id = ? AND user_id = ?',
      [id, userId]
    );
    if (!row) return null;
    return this.mapRow(row);
  }

  async findByUserId(userId: string): Promise<FinancialAccountEntity[]> {
    const rows = await allQuery<any>(
      'SELECT * FROM bank_accounts WHERE user_id = ? ORDER BY is_primary DESC, created_at ASC',
      [userId]
    );
    return rows.map(r => this.mapRow(r));
  }

  async save(account: FinancialAccountEntity): Promise<void> {
    await runQuery(`
      INSERT INTO bank_accounts (
        id, user_id, institution_name, institution_code, masked_account_number,
        account_type, current_balance, available_balance, currency, is_primary,
        connection_status, provider_type, last_synced_at, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        institution_name = excluded.institution_name,
        current_balance = excluded.current_balance,
        available_balance = excluded.available_balance,
        connection_status = excluded.connection_status,
        last_synced_at = excluded.last_synced_at
    `, [
      account.id,
      account.userId,
      account.institutionName,
      account.institutionCode,
      account.maskedAccountNumber,
      account.accountType,
      account.currentBalance,
      account.availableBalance,
      account.currency,
      account.isPrimary ? 1 : 0,
      account.connectionStatus,
      account.providerType,
      account.lastSyncedAt,
      account.createdAt
    ]);
  }

  async updateBalance(
    id: string,
    userId: string,
    currentBalance: number,
    availableBalance: number,
    _freshness: FreshnessStatus,
    syncedAt: string
  ): Promise<void> {
    await runQuery(
      'UPDATE bank_accounts SET current_balance = ?, available_balance = ?, last_synced_at = ? WHERE id = ? AND user_id = ?',
      [currentBalance, availableBalance, syncedAt, id, userId]
    );
  }

  async updateStatus(id: string, userId: string, status: string): Promise<void> {
    await runQuery(
      'UPDATE bank_accounts SET connection_status = ? WHERE id = ? AND user_id = ?',
      [status, id, userId]
    );
  }

  async delete(id: string, userId: string): Promise<void> {
    await runQuery('DELETE FROM bank_accounts WHERE id = ? AND user_id = ?', [id, userId]);
  }

  private mapRow(row: any): FinancialAccountEntity {
    return {
      id: row.id,
      userId: row.user_id,
      institutionName: row.institution_name,
      institutionCode: row.institution_code || '',
      maskedAccountNumber: row.masked_account_number,
      accountType: row.account_type,
      currentBalance: Number(row.current_balance) || 0,
      availableBalance: Number(row.available_balance) || 0,
      currency: row.currency || 'INR',
      isPrimary: row.is_primary === 1,
      connectionStatus: row.connection_status || 'CONNECTED',
      providerType: (row.provider_type as ProviderType) || 'MOCK',
      freshnessStatus: 'CURRENT',
      lastSyncedAt: row.last_synced_at || new Date().toISOString(),
      createdAt: row.created_at || new Date().toISOString()
    };
  }
}

export class SQLiteTransactionRepository implements ITransactionRepository {
  async findById(id: string, userId: string): Promise<FinancialTransactionEntity | null> {
    const row = await getQuery<any>(
      'SELECT * FROM transactions WHERE id = ? AND user_id = ?',
      [id, userId]
    );
    if (!row) return null;
    return this.mapRow(row);
  }

  async findByProviderTxId(providerTxId: string, userId: string): Promise<FinancialTransactionEntity | null> {
    const row = await getQuery<any>(
      'SELECT * FROM transactions WHERE reference_id = ? AND user_id = ?',
      [providerTxId, userId]
    );
    if (!row) return null;
    return this.mapRow(row);
  }

  async findByUserId(userId: string, limit: number = 50, offset: number = 0): Promise<FinancialTransactionEntity[]> {
    const rows = await allQuery<any>(
      'SELECT * FROM transactions WHERE user_id = ? ORDER BY transaction_date DESC LIMIT ? OFFSET ?',
      [userId, limit, offset]
    );
    return rows.map(r => this.mapRow(r));
  }

  async save(transaction: FinancialTransactionEntity): Promise<void> {
    await runQuery(`
      INSERT OR REPLACE INTO transactions (
        id, user_id, account_id, amount, type, category_id, status, transaction_date, reference_id, description, merchant, sender, receiver
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      transaction.id,
      transaction.userId,
      transaction.accountId || null,
      transaction.amount,
      transaction.type,
      transaction.category,
      transaction.status,
      transaction.timestamp,
      transaction.referenceId,
      transaction.description || '',
      transaction.merchant || '',
      transaction.sender || '',
      transaction.receiver || ''
    ]);
  }

  async saveBatch(transactions: FinancialTransactionEntity[]): Promise<number> {
    let savedCount = 0;
    for (const t of transactions) {
      await this.save(t);
      savedCount++;
    }
    return savedCount;
  }

  private mapRow(row: any): FinancialTransactionEntity {
    return {
      id: row.id,
      userId: row.user_id,
      accountId: row.account_id,
      providerTransactionId: row.reference_id,
      amount: Number(row.amount) || 0,
      type: row.type as any,
      category: row.category_id || 'cat_other',
      sender: row.sender || '',
      receiver: row.receiver || '',
      merchant: row.merchant,
      description: row.description,
      referenceId: row.reference_id || row.id,
      timestamp: row.transaction_date || row.created_at || new Date().toISOString(),
      status: row.status as any
    };
  }
}

export class SQLiteConsentRepository implements IConsentRepository {
  async findById(id: string, userId: string): Promise<AccountConsentEntity | null> {
    const row = await getQuery<any>(
      'SELECT * FROM account_consents WHERE id = ? AND user_id = ?',
      [id, userId]
    );
    if (!row) return null;
    return this.mapRow(row);
  }

  async findByHandle(handle: string): Promise<AccountConsentEntity | null> {
    const row = await getQuery<any>(
      'SELECT * FROM account_consents WHERE consent_handle = ?',
      [handle]
    );
    if (!row) return null;
    return this.mapRow(row);
  }

  async findActiveByUserId(userId: string): Promise<AccountConsentEntity[]> {
    const now = new Date().toISOString();
    const rows = await allQuery<any>(
      `SELECT * FROM account_consents WHERE user_id = ? AND consent_status = 'ACTIVE' AND valid_to > ?`,
      [userId, now]
    );
    return rows.map(r => this.mapRow(r));
  }

  async save(consent: AccountConsentEntity): Promise<void> {
    await runQuery(`
      INSERT OR REPLACE INTO account_consents (
        id, user_id, bank_account_id, consent_handle, consent_status, data_access_types, valid_from, valid_to, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      consent.id,
      consent.userId,
      consent.bankAccountId || 'bnk_01',
      consent.consentHandle,
      consent.consentStatus,
      consent.dataAccessTypes,
      consent.validFrom,
      consent.validTo,
      consent.createdAt
    ]);
  }

  async updateStatus(id: string, userId: string, status: ConsentStatus, _revokedAt?: string): Promise<void> {
    await runQuery(
      'UPDATE account_consents SET consent_status = ? WHERE id = ? AND user_id = ?',
      [status, id, userId]
    );
  }

  private mapRow(row: any): AccountConsentEntity {
    return {
      id: row.id,
      userId: row.user_id,
      bankAccountId: row.bank_account_id,
      consentHandle: row.consent_handle,
      consentStatus: row.consent_status as ConsentStatus,
      dataAccessTypes: row.data_access_types || 'TRANSACTIONS,BALANCES',
      purposeCode: 'PERSONAL_FINANCE_MANAGEMENT',
      validFrom: row.valid_from,
      validTo: row.valid_to,
      createdAt: row.created_at
    };
  }
}

export class SQLiteProviderConnectionRepository implements IProviderConnectionRepository {
  async findByUserIdAndProvider(userId: string, provider: ProviderType): Promise<ProviderConnectionEntity | null> {
    return {
      id: `conn_${provider}_${userId}`,
      userId,
      providerType: provider,
      connectionStatus: 'ACTIVE',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
  }

  async save(_connection: ProviderConnectionEntity): Promise<void> {
    // SQLite demo implementation
  }

  async updateSyncStatus(_id: string, _success: boolean, _timestamp: string, _error?: string): Promise<void> {
    // SQLite demo implementation
  }
}

export class SQLiteFinancialSyncRepository implements IFinancialSyncRepository {
  private inMemoryLogs: Map<string, SyncLogEntity> = new Map();

  async findByIdempotencyKey(key: string, userId: string): Promise<SyncLogEntity | null> {
    for (const log of this.inMemoryLogs.values()) {
      if (log.idempotencyKey === key && log.userId === userId) {
        return log;
      }
    }
    return null;
  }

  async saveLog(log: SyncLogEntity): Promise<void> {
    this.inMemoryLogs.set(log.id, log);
    await runQuery(`
      INSERT INTO audit_logs (id, user_id, action, metadata)
      VALUES (?, ?, ?, ?)
    `, [
      log.id,
      log.userId,
      log.status === 'SUCCESS' ? 'SYNC_SUCCESS' : 'SYNC_FAILED',
      JSON.stringify({
        provider: log.providerType,
        accounts: log.accountsSynced,
        txs: log.transactionsSynced,
        durationMs: log.durationMs,
        error: log.errorDetails
      })
    ]);
  }

  async getLastSync(userId: string): Promise<SyncLogEntity | null> {
    let latest: SyncLogEntity | null = null;
    for (const log of this.inMemoryLogs.values()) {
      if (log.userId === userId) {
        if (!latest || new Date(log.timestamp) > new Date(latest.timestamp)) {
          latest = log;
        }
      }
    }
    return latest;
  }
}
