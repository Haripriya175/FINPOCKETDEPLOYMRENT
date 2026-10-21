import { allQuery, getQuery, runQuery } from '../config/database.js';
import { v4 as uuidv4 } from 'uuid';
import crypto from 'crypto';

export interface BankAccountDTO {
  id: string;
  institutionName: string;
  institutionCode: string;
  maskedAccountNumber: string;
  accountType: string;
  currentBalance: number;
  availableBalance: number;
  currency: string;
  isPrimary: boolean;
  connectionStatus: string;
  providerType: string;
  lastSyncedAt: string;
  redirectUrl?: string;
  consentHandle?: string;
}

export interface FinancialDataProvider {
  syncBalances(userId: string, accountId: string): Promise<number>;
  syncTransactions(userId: string, accountId: string): Promise<number>;
  connectAccount(userId: string, institutionCode: string, mobileNumber?: string): Promise<BankAccountDTO>;
  disconnectAccount(userId: string, accountId: string): Promise<boolean>;
}

export class MockFinancialDataProvider implements FinancialDataProvider {
  /// What we write into `bank_accounts.provider_type` for an account this mock
  /// provider created. It must say MOCK — never 'ACCOUNT_AGGREGATOR' — so the
  /// sync loop routes it back here instead of asking an Account Aggregator for
  /// a bank's real figure, and so the UI can never present invented money as a
  /// bank-reported balance.
  private readonly providerTag = 'MOCK';

  async syncBalances(userId: string, accountId: string): Promise<number> {
    const account = await getQuery<{ current_balance: number; available_balance: number }>(
      'SELECT current_balance, available_balance FROM bank_accounts WHERE id = ? AND user_id = ?',
      [accountId, userId]
    );
    if (!account) throw new Error('Bank account not found');

    const syncedAt = new Date().toISOString();
    await runQuery(
      'UPDATE bank_accounts SET last_synced_at = ? WHERE id = ? AND user_id = ?',
      [syncedAt, accountId, userId]
    );

    await runQuery(`
      INSERT INTO audit_logs (id, user_id, action, metadata)
      VALUES (?, ?, 'BANK_SYNC_BALANCE', ?)
    `, [uuidv4(), userId, JSON.stringify({ accountId, provider: 'MOCK_FINANCIAL_DATA_PROVIDER', syncedAt })]);

    return account.available_balance;
  }

  async syncTransactions(userId: string, accountId: string): Promise<number> {
    const txCountRow = await getQuery<{ count: number }>(
      'SELECT COUNT(*) as count FROM transactions WHERE user_id = ? AND account_id = ?',
      [userId, accountId]
    );
    return txCountRow?.count || 0;
  }

  async connectAccount(userId: string, institutionCode: string): Promise<BankAccountDTO> {
    const id = `bnk_${uuidv4().substring(0, 8)}`;
    const randomDigits = crypto.randomInt(1000, 10000);
    const masked = `•••• ${randomDigits}`;

    // A newly connected account holds ₹0 until the provider syncs real data.
    // This used to seed `15000 + random(0..40000)` — i.e. it handed every brand
    // new account between ₹15,000 and ₹55,000 of invented money and then
    // labelled it 'ACCOUNT_AGGREGATOR' as though the bank had reported it. In a
    // financial app that is the one thing we must never do: the number on
    // screen has to be the number in the bank.
    const initialBalance = 0;

    let name = 'HDFC Bank';
    if (institutionCode === 'SBIN') name = 'State Bank of India';
    else if (institutionCode === 'ICIC') name = 'ICICI Bank';
    else if (institutionCode === 'UTIB') name = 'Axis Bank';

    const now = new Date().toISOString();
    // First connected account becomes the user's primary. Nothing else ever
    // sets is_primary, and six consumers (EF deposit/withdraw, goals add-funds,
    // bills pay, payments, expense deduction) require one — without this every
    // real user dead-ended at "no primary account".
    const existingPrimary = await getQuery<{ id: string }>(
      'SELECT id FROM bank_accounts WHERE user_id = ? AND is_primary = 1 LIMIT 1',
      [userId]
    );
    const isFirstAccount = !existingPrimary;
    await runQuery(`
      INSERT INTO bank_accounts (id, user_id, institution_name, institution_code, masked_account_number, account_type, current_balance, available_balance, is_primary, connection_status, provider_type, last_synced_at)
      VALUES (?, ?, ?, ?, ?, 'SAVINGS', ?, ?, ?, 'CONNECTED', ?, ?)
    `, [id, userId, name, institutionCode, masked, initialBalance, initialBalance, isFirstAccount ? 1 : 0, this.providerTag, now]);

    // Create consent record
    await runQuery(`
      INSERT INTO account_consents (id, user_id, bank_account_id, consent_handle, consent_status, data_access_types, valid_from, valid_to)
      VALUES (?, ?, ?, ?, 'ACTIVE', 'PROFILE,TRANSACTIONS,BALANCES', ?, ?)
    `, [uuidv4(), userId, id, `AA_CONSENT_${Date.now()}`, now, new Date(Date.now() + 365 * 86400000).toISOString()]);

    await runQuery(`
      INSERT INTO audit_logs (id, user_id, action, metadata)
      VALUES (?, ?, 'BANK_CONNECTED', ?)
    `, [uuidv4(), userId, JSON.stringify({ accountId: id, institution: name, provider: 'ACCOUNT_AGGREGATOR' })]);

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

  async disconnectAccount(userId: string, accountId: string): Promise<boolean> {
    await runQuery(
      `UPDATE bank_accounts SET connection_status = 'DISCONNECTED' WHERE id = ? AND user_id = ?`,
      [accountId, userId]
    );
    await runQuery(
      `UPDATE account_consents SET consent_status = 'REVOKED' WHERE bank_account_id = ? AND user_id = ?`,
      [accountId, userId]
    );

    await runQuery(`
      INSERT INTO audit_logs (id, user_id, action, metadata)
      VALUES (?, ?, 'BANK_DISCONNECTED', ?)
    `, [uuidv4(), userId, JSON.stringify({ accountId, provider: 'MOCK_FINANCIAL_DATA_PROVIDER' })]);

    return true;
  }
}

import { AccountAggregatorProvider } from './account_aggregator.provider.js';
export { AccountAggregatorProvider };

export type FinancialAccountDTO = BankAccountDTO;

export class AccountsService {
  private static provider: FinancialDataProvider = new MockFinancialDataProvider();

  /// Optional per-provider-type registry. `provider_type` on a bank_account row
  /// says which institution actually owns that account; routing a sync through
  /// the *global* provider instead made the Setu sandbox overwrite every MOCK
  /// account (including the seeded ones) with its own canned figure — which is
  /// how ₹15,400 became ₹42,580 across the board.
  private static providersByType = new Map<string, FinancialDataProvider>();

  static setProvider(newProvider: FinancialDataProvider) {
    this.provider = newProvider;
  }

  static registerProvider(providerType: string, providerInstance: FinancialDataProvider) {
    this.providersByType.set(providerType, providerInstance);
  }

  static getProvider(): FinancialDataProvider {
    return this.provider;
  }

  /// The provider that actually owns [providerType]'s accounts. Falls back to
  /// the globally installed provider when the type is unknown, so behaviour is
  /// unchanged for anything that never registered itself.
  static getProviderFor(providerType?: string | null): FinancialDataProvider {
    if (providerType) {
      const registered = this.providersByType.get(providerType);
      if (registered) return registered;
    }
    return this.provider;
  }

  static async listAccounts(userId: string): Promise<BankAccountDTO[]> {
    const rows = await allQuery<any>(
      'SELECT * FROM bank_accounts WHERE user_id = ?',
      [userId]
    );

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

  static async syncAccount(userId: string, accountId: string) {
    return await this.provider.syncBalances(userId, accountId);
  }

  static async connectMockAccount(userId: string, institutionCode: string, mobileNumber?: string) {
    return await this.provider.connectAccount(userId, institutionCode, mobileNumber);
  }

  static async disconnectAccount(userId: string, accountId: string) {
    return await this.provider.disconnectAccount(userId, accountId);
  }

  static async createSelfDeclaredAccount(
    userId: string,
    params: {
      institutionName?: string;
      institutionCode?: string;
      maskedAccountNumber?: string;
      accountType?: string;
      initialBalance?: number;
    }
  ): Promise<BankAccountDTO> {
    const id = `bnk_${uuidv4().substring(0, 8)}`;
    const now = new Date().toISOString();
    const instName = params.institutionName || 'Primary Bank Account';
    const instCode = params.institutionCode || 'INSTANT';
    const masked = params.maskedAccountNumber || '•••• 4829';
    const accType = params.accountType || 'SAVINGS';
    const bal = typeof params.initialBalance === 'number' && params.initialBalance >= 0 ? params.initialBalance : 50000.0;

    const existingPrimary = await getQuery<{ id: string }>(
      'SELECT id FROM bank_accounts WHERE user_id = ? AND is_primary = 1 LIMIT 1',
      [userId]
    );
    const isPrimary = !existingPrimary ? 1 : 0;

    await runQuery(`
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

    await runQuery(`
      INSERT INTO audit_logs (id, user_id, action, metadata)
      VALUES (?, ?, 'BANK_CONNECTED', ?)
    `, [uuidv4(), userId, JSON.stringify({ accountId: id, institution: instName, provider: 'SELF_DECLARED' })]);

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
