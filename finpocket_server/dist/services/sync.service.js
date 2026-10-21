"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SyncService = void 0;
const uuid_1 = require("uuid");
const consent_service_js_1 = require("./consent.service.js");
const data_normalization_service_js_1 = require("./data_normalization.service.js");
const transaction_reconciliation_service_js_1 = require("./transaction_reconciliation.service.js");
const sqlite_repositories_js_1 = require("../repositories/sqlite_repositories.js");
const accounts_service_js_1 = require("./accounts.service.js");
class SyncService {
    static accountRepo = new sqlite_repositories_js_1.SQLiteFinancialAccountRepository();
    static syncRepo = new sqlite_repositories_js_1.SQLiteFinancialSyncRepository();
    /**
     * Authoritative sync workflow with consent validation, partial failure handling, and idempotency.
     */
    static async syncUserData(userId, provider = 'MOCK', idempotencyKey, simulatedRawTransactions, consentId) {
        const startTime = Date.now();
        const syncId = `sync_${(0, uuid_1.v4)().substring(0, 8)}`;
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
        const consentValidation = await consent_service_js_1.ConsentService.validateConsentForFetch(userId, consentId);
        if (!consentValidation.valid) {
            const failedResult = {
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
            const dataProvider = accounts_service_js_1.AccountsService.getProviderFor(acc.providerType);
            try {
                const liveBalance = await dataProvider.syncBalances(userId, acc.id);
                await this.accountRepo.updateBalance(acc.id, userId, liveBalance ?? acc.currentBalance, liveBalance ?? acc.availableBalance, 'CURRENT', now);
            }
            catch (providerErr) {
                // A single account failing (expired consent, FIP timeout) must not abort
                // the whole sync — report partial freshness instead of a silent no-op.
                console.warn(`[SyncService] Balance sync failed for ${acc.id}: ${providerErr?.message}`);
                await this.accountRepo.updateBalance(acc.id, userId, acc.currentBalance, acc.availableBalance, 'STALE', now);
            }
            accountsSynced++;
        }
        // 4. Normalize & Reconcile Transactions
        let transactionsSynced = 0;
        let reconReport = null;
        if (simulatedRawTransactions && simulatedRawTransactions.length > 0) {
            const normalizedList = simulatedRawTransactions.map(raw => data_normalization_service_js_1.DataNormalizationService.normalizeTransaction(raw, userId, userAccounts[0]?.id));
            reconReport = await transaction_reconciliation_service_js_1.TransactionReconciliationService.reconcileBatch(userId, normalizedList);
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
    static async recordSyncLog(userId, provider, syncId, status, accountsSynced, transactionsSynced, durationMs, idempotencyKey, errorDetails) {
        const log = {
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
exports.SyncService = SyncService;
//# sourceMappingURL=sync.service.js.map