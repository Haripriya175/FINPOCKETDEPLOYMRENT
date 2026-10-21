import { FinancialTransactionEntity, ITransactionRepository } from '../repositories/repository.interface.js';
import { SQLiteTransactionRepository } from '../repositories/sqlite_repositories.js';

export interface ReconciliationReport {
  totalProcessed: number;
  newInserted: number;
  updated: number;
  unchanged: number;
  duplicatesSkipped: number;
  newCount?: number;
  updatedCount?: number;
  unchangedCount?: number;
  duplicateCount?: number;
  reconciledTransactions: FinancialTransactionEntity[];
}

export class TransactionReconciliationService {
  private static txnRepo: ITransactionRepository = new SQLiteTransactionRepository();

  /**
   * Reconciles a batch of incoming provider transactions against existing records for a user.
   */
  static async reconcileBatch(
    userId: string,
    incomingTransactions: FinancialTransactionEntity[]
  ): Promise<ReconciliationReport> {
    const report: ReconciliationReport = {
      totalProcessed: incomingTransactions.length,
      newInserted: 0,
      updated: 0,
      unchanged: 0,
      duplicatesSkipped: 0,
      reconciledTransactions: []
    };

    const seenProviderTxIds = new Set<string>();

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
      } else {
        // Compare values for updates
        const isDifferent =
          existing.amount !== incoming.amount ||
          existing.status !== incoming.status ||
          existing.description !== incoming.description;

        if (isDifferent) {
          incoming.id = existing.id; // Keep existing ID
          incoming.reconciliationStatus = 'UPDATED';
          await this.txnRepo.save(incoming);
          report.updated++;
          report.reconciledTransactions.push(incoming);
        } else {
          existing.reconciliationStatus = 'UNCHANGED';
          report.unchanged++;
          report.reconciledTransactions.push(existing);
        }
      }
    }

    (report as any).newCount = report.newInserted;
    (report as any).updatedCount = report.updated;
    (report as any).unchangedCount = report.unchanged;
    (report as any).duplicateCount = report.duplicatesSkipped;

    return report;
  }

  static async reconcileTransactions(
    userIdOrTxns: string | FinancialTransactionEntity[],
    incomingTransactions?: FinancialTransactionEntity[]
  ): Promise<ReconciliationReport> {
    if (typeof userIdOrTxns === 'string') {
      return this.reconcileBatch(userIdOrTxns, incomingTransactions || []);
    } else {
      const txns = userIdOrTxns || [];
      const userId = txns[0]?.userId || 'usr_default';
      return this.reconcileBatch(userId, txns);
    }
  }
}
