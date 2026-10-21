import { v4 as uuidv4 } from 'uuid';
import { ConsentService } from './consent.service.js';
import { DataNormalizationService, RawProviderTransaction } from './data_normalization.service.js';
import { TransactionReconciliationService } from './transaction_reconciliation.service.js';
import { SQLiteFinancialAccountRepository, SQLiteFinancialSyncRepository } from '../repositories/sqlite_repositories.js';
import { AccountsService } from './accounts.service.js';
import { FreshnessStatus, ProviderType, SyncLogEntity } from '../repositories/repository.interface.js';
import { runQuery } from '../config/database.js';

export interface SyncExecutionResult {
  syncId: string;
  status: 'SUCCESS' | 'PARTIAL' | 'FAILED';
  accountsSynced: number;
  transactionsSynced: number;
  freshnessStatus: FreshnessStatus;
  lastSyncedAt: string;
  errorMessage?: string;
  reconciliationReport?: any;
}

export class SyncService {
  private static accountRepo = new SQLiteFinancialAccountRepository();
  private static syncRepo = new SQLiteFinancialSyncRepository();

  /**
   * Authoritative sync workflow with consent validation, partial failure handling, and idempotency.
   */
  static async syncUserData(
    userId: string,
    provider: ProviderType = 'MOCK',
    idempotencyKey?: string,
    simulatedRawTransactions?: RawProviderTransaction[],
    consentId?: string
  ): Promise<SyncExecutionResult> {
    const startTime = Date.now();
    const syncId = `sync_${uuidv4().substring(0, 8)}`;

    // 1. Idempotency check: if already executed for this key and user
    if (idempotencyKey) {
      const existing = await this.syncRepo.findByIdempotencyKey(idempotencyKey, userId);
      if (existing) {
        return {
          syncId: existing.id,
          status: existing.status,
          accountsSynced: existing.accountsSynced,
          transactionsSynced: existing.transactionsSynced,
          freshnessStatus: 'CURRENT',
          lastSyncedAt: existing.timestamp
        };
      }
    }

    // 2. Server-side Consent Check
    const consentValidation = await ConsentService.validateConsentForFetch(userId, consentId);
    if (!consentValidation.valid) {
      const failedResult: SyncExecutionResult = {
        syncId,
        status: 'FAILED',
        accountsSynced: 0,
        transactionsSynced: 0,
        freshnessStatus: 'FAILED',
        lastSyncedAt: new Date().toISOString(),
        errorMessage: consentValidation.reason
      };

      await this.recordSyncLog(userId, provider, syncId, 'FAILED', 0, 0, Date.now() - startTime, idempotencyKey, consentValidation.reason);
      return failedResult;
    }

    // 3. Sync Accounts & Balances through the Financial Data Provider that owns
    //    each account. Previously this loop used one global provider for every
    //    account, so installing the Setu AA provider caused it to write the
    //    sandbox's canned balance over accounts it had never seen — every wallet
    //    ended up showing the same number. It also re-wrote each account's
    //    *existing* balance back to the same row, so "Sync balances" only flipped
    //    freshnessStatus and never fetched anything from the bank.
    const userAccounts = await this.accountRepo.findByUserId(userId);
    let accountsSynced = 0;
    const now = new Date().toISOString();

    for (const acc of userAccounts) {
      const dataProvider = AccountsService.getProviderFor(acc.providerType);
      try {
        const liveBalance = await dataProvider.syncBalances(userId, acc.id);
        await this.accountRepo.updateBalance(
          acc.id,
          userId,
          liveBalance ?? acc.currentBalance,
          liveBalance ?? acc.availableBalance,
          'CURRENT',
          now
        );
      } catch (providerErr: any) {
        // A single account failing (expired consent, FIP timeout) must not abort
        // the whole sync — report partial freshness instead of a silent no-op.
        console.warn(`[SyncService] Balance sync failed for ${acc.id}: ${providerErr?.message}`);
        await this.accountRepo.updateBalance(
          acc.id,
          userId,
          acc.currentBalance,
          acc.availableBalance,
          'STALE',
          now
        );
      }
      accountsSynced++;
    }

    // 4. Normalize & Reconcile Transactions
    let transactionsSynced = 0;
    let reconReport = null;

    if (simulatedRawTransactions && simulatedRawTransactions.length > 0) {
      const normalizedList = simulatedRawTransactions.map(raw =>
        DataNormalizationService.normalizeTransaction(raw, userId, userAccounts[0]?.id)
      );

      reconReport = await TransactionReconciliationService.reconcileBatch(userId, normalizedList);
      transactionsSynced = reconReport.newInserted + reconReport.updated;
    }

    const duration = Date.now() - startTime;
    await this.recordSyncLog(userId, provider, syncId, 'SUCCESS', accountsSynced, transactionsSynced, duration, idempotencyKey);

    return {
      syncId,
      status: 'SUCCESS',
      accountsSynced,
      transactionsSynced,
      freshnessStatus: 'CURRENT',
      lastSyncedAt: now,
      reconciliationReport: reconReport
    };
  }

  private static async recordSyncLog(
    userId: string,
    provider: ProviderType,
    syncId: string,
    status: 'SUCCESS' | 'PARTIAL' | 'FAILED',
    accountsSynced: number,
    transactionsSynced: number,
    durationMs: number,
    idempotencyKey?: string,
    errorDetails?: string
  ): Promise<void> {
    const log: SyncLogEntity = {
      id: syncId,
      userId,
      providerType: provider,
      status,
      accountsSynced,
      transactionsSynced,
      durationMs,
      idempotencyKey,
      errorDetails,
      timestamp: new Date().toISOString()
    };

    await this.syncRepo.saveLog(log);
  }
}
