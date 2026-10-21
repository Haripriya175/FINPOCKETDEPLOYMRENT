import { v4 as uuidv4 } from 'uuid';
import { SQLiteConsentRepository, SQLiteFinancialAccountRepository } from '../repositories/sqlite_repositories.js';
import { AccountConsentEntity, ConsentStatus, IConsentRepository } from '../repositories/repository.interface.js';
import { runQuery } from '../config/database.js';

export class ConsentService {
  private static consentRepo: IConsentRepository = new SQLiteConsentRepository();

  /**
   * Create a new consent request adhering to ReBIT Account Aggregator specifications.
   */
  static async requestConsent(
    userId: string,
    bankAccountId: string,
    dataAccessTypesOrHandle?: string[] | string,
    durationDays: number = 365,
    initialStatus: ConsentStatus = 'ACTIVE'
  ): Promise<AccountConsentEntity> {
    const now = new Date();
    const validTo = new Date(now.getTime() + durationDays * 86400000);
    
    let accessTypes = 'TRANSACTIONS,BALANCES,PROFILE';
    let consentHandle = `AA_CONSENT_${uuidv4().replace(/-/g, '').substring(0, 16).toUpperCase()}`;

    if (Array.isArray(dataAccessTypesOrHandle)) {
      accessTypes = dataAccessTypesOrHandle.join(',');
    } else if (typeof dataAccessTypesOrHandle === 'string') {
      if (dataAccessTypesOrHandle.startsWith('AA_') || dataAccessTypesOrHandle.startsWith('cns_')) {
        consentHandle = dataAccessTypesOrHandle;
      } else {
        accessTypes = dataAccessTypesOrHandle;
      }
    }

    const consent: AccountConsentEntity = {
      id: `cns_${uuidv4().substring(0, 8)}`,
      userId,
      bankAccountId,
      consentHandle,
      consentStatus: initialStatus,
      dataAccessTypes: accessTypes,
      purposeCode: 'PERSONAL_FINANCE_MANAGEMENT',
      validFrom: now.toISOString(),
      validTo: validTo.toISOString(),
      createdAt: now.toISOString()
    };

    await this.consentRepo.save(consent);

    // Record audit event
    await runQuery(`
      INSERT INTO audit_logs (id, user_id, action, metadata)
      VALUES (?, ?, 'CONSENT_REQUESTED', ?)
    `, [uuidv4(), userId, JSON.stringify({ consentId: consent.id, handle: consentHandle, validTo: consent.validTo })]);

    return consent;
  }

  /**
   * Server-side authorization check: verify that active, non-expired, non-revoked consent exists for data fetch.
   */
  static async validateConsentForFetch(userId: string, consentId?: string): Promise<{ valid: boolean; reason?: string; consent?: AccountConsentEntity }> {
    let consent: AccountConsentEntity | null | undefined;

    if (consentId) {
      consent = await this.consentRepo.findById(consentId, userId);
      if (!consent) {
        return { valid: false, reason: 'Consent record not found.' };
      }
    } else {
      const activeConsents = await this.consentRepo.findActiveByUserId(userId);
      if (!activeConsents || activeConsents.length === 0) {
        return { valid: false, reason: 'No active consent found for user. Data fetch denied.' };
      }
      consent = activeConsents[0];
    }

    const stateCheck = this.checkConsentState(consent);
    if (!stateCheck.valid) return stateCheck;

    // Check linked account connection status if accountId is present
    if (consent.bankAccountId && consent.bankAccountId !== 'bnk_unlinked') {
      const accountRepo = new SQLiteFinancialAccountRepository();
      const account = await accountRepo.findById(consent.bankAccountId, userId);
      if (account && (account.connectionStatus === 'REVOKED' || account.connectionStatus === 'DISCONNECTED' || account.connectionStatus === 'UNLINKED')) {
        return { valid: false, reason: 'Linked bank account is not active or unlinked.', consent };
      }
    }

    return { valid: true, consent };
  }

  private static checkConsentState(consent: AccountConsentEntity): { valid: boolean; reason?: string; consent?: AccountConsentEntity } {
    if (consent.consentStatus === 'REVOKED') {
      return { valid: false, reason: 'Consent was revoked by user. Synchronization halted.', consent };
    }
    if (consent.consentStatus === 'EXPIRED' || new Date(consent.validTo) <= new Date()) {
      return { valid: false, reason: 'Consent has expired. Please re-authenticate account linking.', consent };
    }
    if (consent.consentStatus !== 'ACTIVE') {
      return { valid: false, reason: `Consent status '${consent.consentStatus}' does not permit data fetch.`, consent };
    }

    return { valid: true, consent };
  }

  /**
   * Revoke an active consent immediately.
   */
  static async revokeConsent(userId: string, consentId: string): Promise<boolean> {
    const consent = await this.consentRepo.findById(consentId, userId);
    if (!consent) return false;

    const revokedAt = new Date().toISOString();
    await this.consentRepo.updateStatus(consentId, userId, 'REVOKED', revokedAt);

    await runQuery(`
      INSERT INTO audit_logs (id, user_id, action, metadata)
      VALUES (?, ?, 'CONSENT_REVOKED', ?)
    `, [uuidv4(), userId, JSON.stringify({ consentId, handle: consent.consentHandle, revokedAt })]);

    return true;
  }
}
