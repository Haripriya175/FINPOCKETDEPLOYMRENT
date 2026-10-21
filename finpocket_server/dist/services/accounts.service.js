"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AccountsService = exports.AccountAggregatorProvider = exports.MockFinancialDataProvider = void 0;
const database_js_1 = require("../config/database.js");
const uuid_1 = require("uuid");
const crypto_1 = __importDefault(require("crypto"));
class MockFinancialDataProvider {
    /// What we write into `bank_accounts.provider_type` for an account this mock
    /// provider created. It must say MOCK — never 'ACCOUNT_AGGREGATOR' — so the
    /// sync loop routes it back here instead of asking an Account Aggregator for
    /// a bank's real figure, and so the UI can never present invented money as a
    /// bank-reported balance.
    providerTag = 'MOCK';
    async syncBalances(userId, accountId) {
        const account = await (0, database_js_1.getQuery)('SELECT current_balance, available_balance FROM bank_accounts WHERE id = ? AND user_id = ?', [accountId, userId]);
        if (!account)
            throw new Error('Bank account not found');
        const syncedAt = new Date().toISOString();
        await (0, database_js_1.runQuery)('UPDATE bank_accounts SET last_synced_at = ? WHERE id = ? AND user_id = ?', [syncedAt, accountId, userId]);
        await (0, database_js_1.runQuery)(`
      INSERT INTO audit_logs (id, user_id, action, metadata)
      VALUES (?, ?, 'BANK_SYNC_BALANCE', ?)
    `, [(0, uuid_1.v4)(), userId, JSON.stringify({ accountId, provider: 'MOCK_FINANCIAL_DATA_PROVIDER', syncedAt })]);
        return account.available_balance;
    }
    async syncTransactions(userId, accountId) {
        const txCountRow = await (0, database_js_1.getQuery)('SELECT COUNT(*) as count FROM transactions WHERE user_id = ? AND account_id = ?', [userId, accountId]);
        return txCountRow?.count || 0;
    }
    async connectAccount(userId, institutionCode) {
        const id = `bnk_${(0, uuid_1.v4)().substring(0, 8)}`;
        const randomDigits = crypto_1.default.randomInt(1000, 10000);
        const masked = `•••• ${randomDigits}`;
        // A newly connected account holds ₹0 until the provider syncs real data.
        // This used to seed `15000 + random(0..40000)` — i.e. it handed every brand
        // new account between ₹15,000 and ₹55,000 of invented money and then
        // labelled it 'ACCOUNT_AGGREGATOR' as though the bank had reported it. In a
        // financial app that is the one thing we must never do: the number on
        // screen has to be the number in the bank.
        const initialBalance = 0;
        let name = 'HDFC Bank';
        if (institutionCode === 'SBIN')
            name = 'State Bank of India';
        else if (institutionCode === 'ICIC')
            name = 'ICICI Bank';
        else if (institutionCode === 'UTIB')
            name = 'Axis Bank';
        const now = new Date().toISOString();
        // First connected account becomes the user's primary. Nothing else ever
        // sets is_primary, and six consumers (EF deposit/withdraw, goals add-funds,
        // bills pay, payments, expense deduction) require one — without this every
        // real user dead-ended at "no primary account".
        const existingPrimary = await (0, database_js_1.getQuery)('SELECT id FROM bank_accounts WHERE user_id = ? AND is_primary = 1 LIMIT 1', [userId]);
        const isFirstAccount = !existingPrimary;
        await (0, database_js_1.runQuery)(`
      INSERT INTO bank_accounts (id, user_id, institution_name, institution_code, masked_account_number, account_type, current_balance, available_balance, is_primary, connection_status, provider_type, last_synced_at)
      VALUES (?, ?, ?, ?, ?, 'SAVINGS', ?, ?, ?, 'CONNECTED', ?, ?)
    `, [id, userId, name, institutionCode, masked, initialBalance, initialBalance, isFirstAccount ? 1 : 0, this.providerTag, now]);
        // Create consent record
        await (0, database_js_1.runQuery)(`
      INSERT INTO account_consents (id, user_id, bank_account_id, consent_handle, consent_status, data_access_types, valid_from, valid_to)
      VALUES (?, ?, ?, ?, 'ACTIVE', 'PROFILE,TRANSACTIONS,BALANCES', ?, ?)
    `, [(0, uuid_1.v4)(), userId, id, `AA_CONSENT_${Date.now()}`, now, new Date(Date.now() + 365 * 86400000).toISOString()]);
        await (0, database_js_1.runQuery)(`
      INSERT INTO audit_logs (id, user_id, action, metadata)
      VALUES (?, ?, 'BANK_CONNECTED', ?)
    `, [(0, uuid_1.v4)(), userId, JSON.stringify({ accountId: id, institution: name, provider: 'ACCOUNT_AGGREGATOR' })]);
        return {
            id,
            institutionName: name,
            institutionCode,
            maskedAccountNumber: masked,
            accountType: 'SAVINGS',
            currentBalance: initialBalance,
            availableBalance: initialBalance,
            currency: 'INR',
            isPrimary: isFirstAccount,
            connectionStatus: 'CONNECTED',
            providerType: 'ACCOUNT_AGGREGATOR',
            lastSyncedAt: now
        };
    }
    async disconnectAccount(userId, accountId) {
        await (0, database_js_1.runQuery)(`UPDATE bank_accounts SET connection_status = 'DISCONNECTED' WHERE id = ? AND user_id = ?`, [accountId, userId]);
        await (0, database_js_1.runQuery)(`UPDATE account_consents SET consent_status = 'REVOKED' WHERE bank_account_id = ? AND user_id = ?`, [accountId, userId]);
        await (0, database_js_1.runQuery)(`
      INSERT INTO audit_logs (id, user_id, action, metadata)
      VALUES (?, ?, 'BANK_DISCONNECTED', ?)
    `, [(0, uuid_1.v4)(), userId, JSON.stringify({ accountId, provider: 'MOCK_FINANCIAL_DATA_PROVIDER' })]);
        return true;
    }
}
exports.MockFinancialDataProvider = MockFinancialDataProvider;
const account_aggregator_provider_js_1 = require("./account_aggregator.provider.js");
Object.defineProperty(exports, "AccountAggregatorProvider", { enumerable: true, get: function () { return account_aggregator_provider_js_1.AccountAggregatorProvider; } });
class AccountsService {
    static provider = new MockFinancialDataProvider();
    /// Optional per-provider-type registry. `provider_type` on a bank_account row
    /// says which institution actually owns that account; routing a sync through
    /// the *global* provider instead made the Setu sandbox overwrite every MOCK
    /// account (including the seeded ones) with its own canned figure — which is
    /// how ₹15,400 became ₹42,580 across the board.
    static providersByType = new Map();
    static setProvider(newProvider) {
        this.provider = newProvider;
    }
    static registerProvider(providerType, providerInstance) {
        this.providersByType.set(providerType, providerInstance);
    }
    static getProvider() {
        return this.provider;
    }
    /// The provider that actually owns [providerType]'s accounts. Falls back to
    /// the globally installed provider when the type is unknown, so behaviour is
    /// unchanged for anything that never registered itself.
    static getProviderFor(providerType) {
        if (providerType) {
            const registered = this.providersByType.get(providerType);
            if (registered)
                return registered;
        }
        return this.provider;
    }
    static async listAccounts(userId) {
        const rows = await (0, database_js_1.allQuery)('SELECT * FROM bank_accounts WHERE user_id = ?', [userId]);
        return rows.map(r => ({
            id: r.id,
            institutionName: r.institution_name,
            institutionCode: r.institution_code || '',
            maskedAccountNumber: r.masked_account_number,
            accountType: r.account_type,
            currentBalance: r.current_balance,
            availableBalance: r.available_balance,
            currency: r.currency || 'INR',
            isPrimary: r.is_primary === 1,
            connectionStatus: r.connection_status,
            providerType: r.provider_type,
            lastSyncedAt: r.last_synced_at
        }));
    }
    static async syncAccount(userId, accountId) {
        return await this.provider.syncBalances(userId, accountId);
    }
    static async connectMockAccount(userId, institutionCode, mobileNumber) {
        return await this.provider.connectAccount(userId, institutionCode, mobileNumber);
    }
    static async disconnectAccount(userId, accountId) {
        return await this.provider.disconnectAccount(userId, accountId);
    }
    static async createSelfDeclaredAccount(userId, params) {
        const id = `bnk_${(0, uuid_1.v4)().substring(0, 8)}`;
        const now = new Date().toISOString();
        const instName = params.institutionName || 'Primary Bank Account';
        const instCode = params.institutionCode || 'INSTANT';
        const masked = params.maskedAccountNumber || '•••• 4829';
        const accType = params.accountType || 'SAVINGS';
        const bal = typeof params.initialBalance === 'number' && params.initialBalance >= 0 ? params.initialBalance : 50000.0;
        const existingPrimary = await (0, database_js_1.getQuery)('SELECT id FROM bank_accounts WHERE user_id = ? AND is_primary = 1 LIMIT 1', [userId]);
        const isPrimary = !existingPrimary ? 1 : 0;
        await (0, database_js_1.runQuery)(`
      INSERT INTO bank_accounts (id, user_id, institution_name, institution_code, masked_account_number, account_type, current_balance, available_balance, is_primary, connection_status, provider_type, last_synced_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'CONNECTED', 'SELF_DECLARED', ?)
    `, [
            id,
            userId,
            instName,
            instCode,
            masked,
            accType,
            bal,
            bal,
            isPrimary,
            now
        ]);
        await (0, database_js_1.runQuery)(`
      INSERT INTO audit_logs (id, user_id, action, metadata)
      VALUES (?, ?, 'BANK_CONNECTED', ?)
    `, [(0, uuid_1.v4)(), userId, JSON.stringify({ accountId: id, institution: instName, provider: 'SELF_DECLARED' })]);
        return {
            id,
            institutionName: instName,
            institutionCode: instCode,
            maskedAccountNumber: masked,
            accountType: accType,
            currentBalance: bal,
            availableBalance: bal,
            currency: 'INR',
            isPrimary: isPrimary === 1,
            connectionStatus: 'CONNECTED',
            providerType: 'SELF_DECLARED',
            lastSyncedAt: now,
        };
    }
}
exports.AccountsService = AccountsService;
//# sourceMappingURL=accounts.service.js.map