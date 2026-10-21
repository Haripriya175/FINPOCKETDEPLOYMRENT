"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.TransactionReconciliationService = void 0;
const sqlite_repositories_js_1 = require("../repositories/sqlite_repositories.js");
class TransactionReconciliationService {
    static txnRepo = new sqlite_repositories_js_1.SQLiteTransactionRepository();
    /**
     * Reconciles a batch of incoming provider transactions against existing records for a user.
     */
    static async reconcileBatch(userId, incomingTransactions) {
        const report = {
            totalProcessed: incomingTransactions.length,
            newInserted: 0,
            updated: 0,
            unchanged: 0,
            duplicatesSkipped: 0,
            reconciledTransactions: []
        };
        const seenProviderTxIds = new Set();
        for (const incoming of incomingTransactions) {
            const refId = incoming.providerTransactionId || incoming.referenceId;
            // In-batch duplicate check
            if (seenProviderTxIds.has(refId)) {
                report.duplicatesSkipped++;
                continue;
            }
            seenProviderTxIds.add(refId);
            // Check existing in database
            const existing = await this.txnRepo.findByProviderTxId(refId, userId);
            if (!existing) {
                // Brand new transaction
                incoming.reconciliationStatus = 'NEW';
                await this.txnRepo.save(incoming);
                report.newInserted++;
                report.reconciledTransactions.push(incoming);
            }
            else {
                // Compare values for updates
                const isDifferent = existing.amount !== incoming.amount ||
                    existing.status !== incoming.status ||
                    existing.description !== incoming.description;
                if (isDifferent) {
                    incoming.id = existing.id; // Keep existing ID
                    incoming.reconciliationStatus = 'UPDATED';
                    await this.txnRepo.save(incoming);
                    report.updated++;
                    report.reconciledTransactions.push(incoming);
                }
                else {
                    existing.reconciliationStatus = 'UNCHANGED';
                    report.unchanged++;
                    report.reconciledTransactions.push(existing);
                }
            }
        }
        report.newCount = report.newInserted;
        report.updatedCount = report.updated;
        report.unchangedCount = report.unchanged;
        report.duplicateCount = report.duplicatesSkipped;
        return report;
    }
    static async reconcileTransactions(userIdOrTxns, incomingTransactions) {
        if (typeof userIdOrTxns === 'string') {
            return this.reconcileBatch(userIdOrTxns, incomingTransactions || []);
        }
        else {
            const txns = userIdOrTxns || [];
            const userId = txns[0]?.userId || 'usr_default';
            return this.reconcileBatch(userId, txns);
        }
    }
}
exports.TransactionReconciliationService = TransactionReconciliationService;
//# sourceMappingURL=transaction_reconciliation.service.js.map