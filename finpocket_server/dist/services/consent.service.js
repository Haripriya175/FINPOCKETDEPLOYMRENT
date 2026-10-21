"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ConsentService = void 0;
const uuid_1 = require("uuid");
const sqlite_repositories_js_1 = require("../repositories/sqlite_repositories.js");
const database_js_1 = require("../config/database.js");
class ConsentService {
    static consentRepo = new sqlite_repositories_js_1.SQLiteConsentRepository();
    /**
     * Create a new consent request adhering to ReBIT Account Aggregator specifications.
     */
    static async requestConsent(userId, bankAccountId, dataAccessTypesOrHandle, durationDays = 365, initialStatus = 'ACTIVE') {
        const now = new Date();
        const validTo = new Date(now.getTime() + durationDays * 86400000);
        let accessTypes = 'TRANSACTIONS,BALANCES,PROFILE';
        let consentHandle = `AA_CONSENT_${(0, uuid_1.v4)().replace(/-/g, '').substring(0, 16).toUpperCase()}`;
        if (Array.isArray(dataAccessTypesOrHandle)) {
            accessTypes = dataAccessTypesOrHandle.join(',');
        }
        else if (typeof dataAccessTypesOrHandle === 'string') {
            if (dataAccessTypesOrHandle.startsWith('AA_') || dataAccessTypesOrHandle.startsWith('cns_')) {
                consentHandle = dataAccessTypesOrHandle;
            }
            else {
                accessTypes = dataAccessTypesOrHandle;
            }
        }
        const consent = {
            id: `cns_${(0, uuid_1.v4)().substring(0, 8)}`,
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
        await (0, database_js_1.runQuery)(`
      INSERT INTO audit_logs (id, user_id, action, metadata)
      VALUES (?, ?, 'CONSENT_REQUESTED', ?)
    `, [(0, uuid_1.v4)(), userId, JSON.stringify({ consentId: consent.id, handle: consentHandle, validTo: consent.validTo })]);
        return consent;
    }
    /**
     * Server-side authorization check: verify that active, non-expired, non-revoked consent exists for data fetch.
     */
    static async validateConsentForFetch(userId, consentId) {
        let consent;
        if (consentId) {
            consent = await this.consentRepo.findById(consentId, userId);
            if (!consent) {
                return { valid: false, reason: 'Consent record not found.' };
            }
        }
        else {
            const activeConsents = await this.consentRepo.findActiveByUserId(userId);
            if (!activeConsents || activeConsents.length === 0) {
                return { valid: false, reason: 'No active consent found for user. Data fetch denied.' };
            }
            consent = activeConsents[0];
        }
        const stateCheck = this.checkConsentState(consent);
        if (!stateCheck.valid)
            return stateCheck;
        // Check linked account connection status if accountId is present
        if (consent.bankAccountId && consent.bankAccountId !== 'bnk_unlinked') {
            const accountRepo = new sqlite_repositories_js_1.SQLiteFinancialAccountRepository();
            const account = await accountRepo.findById(consent.bankAccountId, userId);
            if (account && (account.connectionStatus === 'REVOKED' || account.connectionStatus === 'DISCONNECTED' || account.connectionStatus === 'UNLINKED')) {
                return { valid: false, reason: 'Linked bank account is not active or unlinked.', consent };
            }
        }
        return { valid: true, consent };
    }
    static checkConsentState(consent) {
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
    static async revokeConsent(userId, consentId) {
        const consent = await this.consentRepo.findById(consentId, userId);
        if (!consent)
            return false;
        const revokedAt = new Date().toISOString();
        await this.consentRepo.updateStatus(consentId, userId, 'REVOKED', revokedAt);
        await (0, database_js_1.runQuery)(`
      INSERT INTO audit_logs (id, user_id, action, metadata)
      VALUES (?, ?, 'CONSENT_REVOKED', ?)
    `, [(0, uuid_1.v4)(), userId, JSON.stringify({ consentId, handle: consent.consentHandle, revokedAt })]);
        return true;
    }
}
exports.ConsentService = ConsentService;
//# sourceMappingURL=consent.service.js.map