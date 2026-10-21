"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.FakeAccountAggregatorProvider = void 0;
const uuid_1 = require("uuid");
const consent_service_js_1 = require("./consent.service.js");
const database_js_1 = require("../config/database.js");
class FakeAccountAggregatorProvider {
    simOptions = {};
    setSimOptions(opts) {
        this.simOptions = opts;
    }
    resetSimOptions() {
        this.simOptions = {};
    }
    async connectAccount(userId, institutionCode) {
        if (this.simOptions.forceTimeout) {
            throw new Error('ETIMEDOUT: Connection to Account Aggregator gateway timed out after 10000ms.');
        }
        if (this.simOptions.forceOutage) {
            throw new Error('503 Service Unavailable: FIP Banking Gateway is undergoing scheduled maintenance.');
        }
        if (this.simOptions.forceMalformed) {
            throw new Error('502 Bad Gateway: Received malformed JSON from Financial Information Provider.');
        }
        const id = `bnk_fake_${institutionCode.toLowerCase()}_${(0, uuid_1.v4)().substring(0, 6)}`;
        const now = new Date().toISOString();
        const instName = institutionCode === 'SBIN' ? 'State Bank of India'
            : (institutionCode === 'ICIC' || institutionCode === 'ICICI') ? 'ICICI Bank'
                : institutionCode === 'UTIB' ? 'Axis Bank'
                    : 'HDFC Bank';
        // Unique masked number per fake account: two accounts of the same bank
        // must never collide on (user_id, institution_name, masked_account_number).
        const digitSeed = (0, uuid_1.v4)().replace(/[^0-9]/g, '');
        const masked = `•••• ${(digitSeed + '0000').substring(0, 4)}`;
        // Connecting the same institution twice must return the wallet the user
        // already has. Previously every call inserted a brand-new row, so repeated
        // runs of the provider suite grew a single user to 46 duplicate accounts,
        // all reporting the same ₹42,580 — which the app then summed into a
        // ₹20.8L "bank balance".
        const existing = await (0, database_js_1.getQuery)(`SELECT id, current_balance, available_balance, masked_account_number FROM bank_accounts
       WHERE user_id = ? AND institution_code = ? AND provider_type = 'FAKE_TEST_PROVIDER'
       LIMIT 1`, [userId, institutionCode]);
        if (existing) {
            await consent_service_js_1.ConsentService.requestConsent(userId, existing.id);
            return {
                id: existing.id,
                institutionName: instName,
                institutionCode,
                maskedAccountNumber: existing.masked_account_number || masked,
                accountType: 'SAVINGS',
                currentBalance: existing.current_balance,
                availableBalance: existing.available_balance,
                currency: 'INR',
                isPrimary: false,
                connectionStatus: 'CONNECTED',
                providerType: 'FAKE_TEST_PROVIDER',
                lastSyncedAt: now
            };
        }
        await (0, database_js_1.runQuery)(`
      INSERT INTO bank_accounts (id, user_id, institution_name, institution_code, masked_account_number, account_type, current_balance, available_balance, is_primary, connection_status, provider_type, last_synced_at)
      VALUES (?, ?, ?, ?, ?, 'SAVINGS', 42580.0, 42580.0, 0, 'CONNECTED', 'FAKE_TEST_PROVIDER', ?)
    `, [id, userId, instName, institutionCode, masked, now]);
        await consent_service_js_1.ConsentService.requestConsent(userId, id);
        return {
            id,
            institutionName: instName,
            institutionCode,
            maskedAccountNumber: masked,
            accountType: 'SAVINGS',
            currentBalance: 42580.0,
            availableBalance: 42580.0,
            currency: 'INR',
            isPrimary: false,
            connectionStatus: 'CONNECTED',
            providerType: 'FAKE_TEST_PROVIDER',
            lastSyncedAt: now
        };
    }
    async syncBalances(userId, accountId) {
        if (this.simOptions.forceOutage) {
            throw new Error('503 Service Unavailable: FIP Balance Service is offline.');
        }
        const consentCheck = await consent_service_js_1.ConsentService.validateConsentForFetch(userId);
        if (!consentCheck.valid) {
            throw new Error(`Sync rejected: ${consentCheck.reason}`);
        }
        return 42580.0;
    }
    async syncTransactions(userId, accountId) {
        if (this.simOptions.forcePartialFailure) {
            throw new Error('500 Internal Error: Transaction sync failed while balance sync succeeded.');
        }
        if (this.simOptions.forceOutage) {
            throw new Error('503 Service Unavailable: FIP Transaction Ledger is offline.');
        }
        const consentCheck = await consent_service_js_1.ConsentService.validateConsentForFetch(userId);
        if (!consentCheck.valid) {
            throw new Error(`Sync rejected: ${consentCheck.reason}`);
        }
        return 10;
    }
    async disconnectAccount(userId, accountId) {
        await (0, database_js_1.runQuery)(`UPDATE bank_accounts SET connection_status = 'DISCONNECTED' WHERE id = ? AND user_id = ?`, [accountId, userId]);
        await (0, database_js_1.runQuery)(`UPDATE account_consents SET consent_status = 'REVOKED' WHERE bank_account_id = ? AND user_id = ?`, [accountId, userId]);
        return true;
    }
}
exports.FakeAccountAggregatorProvider = FakeAccountAggregatorProvider;
//# sourceMappingURL=fake_aa_provider.js.map