"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PostgresConsentRepository = exports.PostgresTransactionRepository = exports.PostgresFinancialAccountRepository = void 0;
class PostgresFinancialAccountRepository {
    pgClient;
    constructor(pgClient) {
        this.pgClient = pgClient;
    }
    async findById(id, userId) {
        const res = await this.pgClient.query('SELECT * FROM bank_accounts WHERE id = $1 AND user_id = $2', [id, userId]);
        if (!res.rows[0])
            return null;
        return this.mapRow(res.rows[0]);
    }
    async findByUserId(userId) {
        const res = await this.pgClient.query('SELECT * FROM bank_accounts WHERE user_id = $1 ORDER BY is_primary DESC, created_at ASC', [userId]);
        return res.rows.map(r => this.mapRow(r));
    }
    async save(account) {
        await this.pgClient.query(`
      INSERT INTO bank_accounts (
        id, user_id, institution_name, institution_code, masked_account_number,
        account_type, current_balance, available_balance, currency, is_primary,
        connection_status, last_synced_at, created_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
      ON CONFLICT (id) DO UPDATE SET
        institution_name = EXCLUDED.institution_name,
        current_balance = EXCLUDED.current_balance,
        available_balance = EXCLUDED.available_balance,
        connection_status = EXCLUDED.connection_status,
        last_synced_at = EXCLUDED.last_synced_at
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
            account.isPrimary,
            account.connectionStatus,
            account.lastSyncedAt,
            account.createdAt
        ]);
    }
    async updateBalance(id, userId, currentBalance, availableBalance, _freshness, syncedAt) {
        await this.pgClient.query('UPDATE bank_accounts SET current_balance = $1, available_balance = $2, last_synced_at = $3 WHERE id = $4 AND user_id = $5', [currentBalance, availableBalance, syncedAt, id, userId]);
    }
    async updateStatus(id, userId, status) {
        await this.pgClient.query('UPDATE bank_accounts SET connection_status = $1 WHERE id = $2 AND user_id = $3', [status, id, userId]);
    }
    async delete(id, userId) {
        await this.pgClient.query('DELETE FROM bank_accounts WHERE id = $1 AND user_id = $2', [id, userId]);
    }
    mapRow(row) {
        return {
            id: row.id,
            userId: row.user_id,
            institutionName: row.institution_name,
            institutionCode: row.institution_code,
            maskedAccountNumber: row.masked_account_number,
            accountType: row.account_type,
            currentBalance: Number(row.current_balance) || 0,
            availableBalance: Number(row.available_balance) || 0,
            currency: row.currency || 'INR',
            isPrimary: Boolean(row.is_primary),
            connectionStatus: row.connection_status,
            providerType: 'ACCOUNT_AGGREGATOR',
            freshnessStatus: 'CURRENT',
            lastSyncedAt: row.last_synced_at,
            createdAt: row.created_at
        };
    }
}
exports.PostgresFinancialAccountRepository = PostgresFinancialAccountRepository;
class PostgresTransactionRepository {
    pgClient;
    constructor(pgClient) {
        this.pgClient = pgClient;
    }
    async findById(id, userId) {
        const res = await this.pgClient.query('SELECT * FROM transactions WHERE id = $1 AND user_id = $2', [id, userId]);
        if (!res.rows[0])
            return null;
        return this.mapRow(res.rows[0]);
    }
    async findByProviderTxId(providerTxId, userId) {
        const res = await this.pgClient.query('SELECT * FROM transactions WHERE reference_id = $1 AND user_id = $2', [providerTxId, userId]);
        if (!res.rows[0])
            return null;
        return this.mapRow(res.rows[0]);
    }
    async findByUserId(userId, limit = 50, offset = 0) {
        const res = await this.pgClient.query('SELECT * FROM transactions WHERE user_id = $1 ORDER BY timestamp DESC LIMIT $2 OFFSET $3', [userId, limit, offset]);
        return res.rows.map(r => this.mapRow(r));
    }
    async save(transaction) {
        await this.pgClient.query(`
      INSERT INTO transactions (
        id, user_id, amount, type, category_id, state, timestamp, reference_id, description, merchant
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      ON CONFLICT (id) DO UPDATE SET
        state = EXCLUDED.state,
        description = EXCLUDED.description
    `, [
            transaction.id,
            transaction.userId,
            transaction.amount,
            transaction.type,
            transaction.category,
            transaction.status === 'SUCCESSFUL' ? 'SUCCESS' : transaction.status,
            transaction.timestamp,
            transaction.referenceId,
            transaction.description || '',
            transaction.merchant || ''
        ]);
    }
    async saveBatch(transactions) {
        let count = 0;
        for (const t of transactions) {
            await this.save(t);
            count++;
        }
        return count;
    }
    mapRow(row) {
        return {
            id: row.id,
            userId: row.user_id,
            accountId: row.account_id,
            providerTransactionId: row.reference_id,
            amount: Number(row.amount) || 0,
            type: row.type,
            category: row.category_id || 'cat_other',
            sender: row.sender || '',
            receiver: row.receiver || '',
            merchant: row.merchant,
            description: row.description,
            referenceId: row.reference_id || row.id,
            timestamp: row.timestamp,
            status: row.state === 'SUCCESS' ? 'SUCCESSFUL' : row.state
        };
    }
}
exports.PostgresTransactionRepository = PostgresTransactionRepository;
class PostgresConsentRepository {
    pgClient;
    constructor(pgClient) {
        this.pgClient = pgClient;
    }
    async findById(id, userId) {
        const res = await this.pgClient.query('SELECT * FROM account_consents WHERE id = $1 AND user_id = $2', [id, userId]);
        if (!res.rows[0])
            return null;
        return this.mapRow(res.rows[0]);
    }
    async findByHandle(handle) {
        const res = await this.pgClient.query('SELECT * FROM account_consents WHERE consent_handle = $1', [handle]);
        if (!res.rows[0])
            return null;
        return this.mapRow(res.rows[0]);
    }
    async findActiveByUserId(userId) {
        const now = new Date().toISOString();
        const res = await this.pgClient.query('SELECT * FROM account_consents WHERE user_id = $1 AND consent_status = $2 AND valid_to > $3', [userId, 'ACTIVE', now]);
        return res.rows.map(r => this.mapRow(r));
    }
    async save(consent) {
        await this.pgClient.query(`
      INSERT INTO account_consents (
        id, user_id, bank_account_id, consent_handle, consent_status, data_access_types, valid_from, valid_to, created_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      ON CONFLICT (id) DO UPDATE SET
        consent_status = EXCLUDED.consent_status
    `, [
            consent.id,
            consent.userId,
            consent.bankAccountId || null,
            consent.consentHandle,
            consent.consentStatus,
            consent.dataAccessTypes,
            consent.validFrom,
            consent.validTo,
            consent.createdAt
        ]);
    }
    async updateStatus(id, userId, status, _revokedAt) {
        await this.pgClient.query('UPDATE account_consents SET consent_status = $1 WHERE id = $2 AND user_id = $3', [status, id, userId]);
    }
    mapRow(row) {
        return {
            id: row.id,
            userId: row.user_id,
            bankAccountId: row.bank_account_id,
            consentHandle: row.consent_handle,
            consentStatus: row.consent_status,
            dataAccessTypes: row.data_access_types || 'TRANSACTIONS,BALANCES',
            purposeCode: 'PERSONAL_FINANCE_MANAGEMENT',
            validFrom: row.valid_from,
            validTo: row.valid_to,
            createdAt: row.created_at
        };
    }
}
exports.PostgresConsentRepository = PostgresConsentRepository;
//# sourceMappingURL=postgres_repositories.js.map