"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.DataNormalizationService = void 0;
const provider_security_service_js_1 = require("./provider_security.service.js");
const crypto_1 = __importDefault(require("crypto"));
class DataNormalizationService {
    /**
     * Normalize provider account object into standardized FinPocket FinancialAccountEntity.
     */
    static normalizeAccount(raw, userId, provider) {
        const rawAccNum = raw.maskedAccNumber || '0000';
        const masked = provider_security_service_js_1.ProviderSecurityService.maskAccountNumber(rawAccNum);
        const currBalance = Number(raw.currentBalance) || 0;
        const availBalance = Number(raw.availableBalance) || currBalance;
        return {
            id: raw.accountRefNumber || `acc_${userId}_${raw.fipId || 'fip'}`,
            userId,
            institutionName: raw.institutionName || 'Financial Institution',
            institutionCode: raw.fipId || 'BANK',
            maskedAccountNumber: masked,
            accountType: (raw.accountType || 'SAVINGS').toUpperCase(),
            currentBalance: currBalance,
            availableBalance: availBalance,
            currency: raw.currency || 'INR',
            isPrimary: false,
            connectionStatus: 'CONNECTED',
            providerType: provider,
            freshnessStatus: 'CURRENT',
            lastSyncedAt: new Date().toISOString(),
            createdAt: new Date().toISOString()
        };
    }
    /**
     * Normalize provider transaction record into standardized FinPocket FinancialTransactionEntity.
     */
    static normalizeTransaction(raw, userId, accountId) {
        const rawAmount = Math.abs(Number(raw.amount) || 0);
        const direction = (raw.type || '').toUpperCase();
        const isIncome = direction === 'CREDIT' || direction === 'INCOME';
        let cat = raw.category || 'cat_other';
        const desc = raw.narration || 'External transaction';
        // Parse merchant / party from Setu slash-delimited narration e.g. "UPI/CR/123/Arhaan Dyal/..."
        let parsedParty = raw.merchant;
        if (!parsedParty && desc.includes('/')) {
            const parts = desc.split('/').map(p => p.trim()).filter(Boolean);
            if (parts.length >= 4) {
                parsedParty = parts[3]; // often the party name
            }
            else if (parts.length >= 3) {
                parsedParty = parts[2];
            }
        }
        if (desc.toLowerCase().includes('salary') || desc.toLowerCase().includes('payroll'))
            cat = 'cat_salary';
        else if (desc.toLowerCase().includes('swiggy') || desc.toLowerCase().includes('zomato') || desc.toLowerCase().includes('food'))
            cat = 'cat_food';
        else if (desc.toLowerCase().includes('uber') || desc.toLowerCase().includes('ola') || desc.toLowerCase().includes('fuel'))
            cat = 'cat_travel';
        else if (desc.toLowerCase().includes('rent'))
            cat = 'cat_rent';
        else if (desc.toLowerCase().includes('bescom') || desc.toLowerCase().includes('electricity') || desc.toLowerCase().includes('bill'))
            cat = 'cat_bills';
        else if (desc.toLowerCase().includes('emi') || desc.toLowerCase().includes('loan'))
            cat = 'cat_emi';
        const rawTime = raw.transactionTimestamp || raw.timestamp;
        const parsedTimestamp = rawTime ? new Date(rawTime).toISOString() : new Date().toISOString();
        return {
            id: `txn_${raw.txnId || raw.reference || crypto_1.default.randomBytes(8).toString('hex')}`,
            userId,
            accountId,
            providerTransactionId: raw.txnId || raw.reference,
            amount: rawAmount,
            type: isIncome ? 'INCOME' : 'EXPENSE',
            category: cat,
            sender: isIncome ? (parsedParty || 'External Sender') : 'User',
            receiver: isIncome ? 'User' : (parsedParty || 'Merchant'),
            merchant: parsedParty,
            description: desc,
            referenceId: raw.reference || raw.txnId || `REF_${Date.now()}`,
            timestamp: parsedTimestamp,
            valueDate: raw.valueDate,
            status: 'SUCCESSFUL',
            reconciliationStatus: 'NEW'
        };
    }
    /**
     * Normalize an array of provider transactions.
     */
    static normalizeTransactions(rawList, userId, accountId) {
        if (!rawList || !Array.isArray(rawList))
            return [];
        return rawList.map(raw => this.normalizeTransaction(raw, userId, accountId));
    }
    /**
     * Derive data freshness status based on the last synchronization timestamp.
     */
    static deriveFreshness(lastSyncedAt) {
        if (!lastSyncedAt)
            return 'NEVER_SYNCED';
        const diffMs = Date.now() - new Date(lastSyncedAt).getTime();
        if (diffMs > 24 * 3600 * 1000)
            return 'STALE';
        return 'CURRENT';
    }
}
exports.DataNormalizationService = DataNormalizationService;
//# sourceMappingURL=data_normalization.service.js.map