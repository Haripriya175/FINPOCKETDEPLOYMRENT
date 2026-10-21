import { v4 as uuidv4 } from 'uuid';
import { FinancialAccountDTO, FinancialDataProvider } from './accounts.service.js';
import { ConsentService } from './consent.service.js';
import { getQuery, runQuery } from '../config/database.js';

export interface FakeProviderSimOptions {
  forceTimeout?: boolean;
  forceMalformed?: boolean;
  forceOutage?: boolean;
  forcePartialFailure?: boolean;
  duplicateCount?: number;
}

export class FakeAccountAggregatorProvider implements FinancialDataProvider {
  public simOptions: FakeProviderSimOptions = {};

  setSimOptions(opts: FakeProviderSimOptions) {
    this.simOptions = opts;
  }

  resetSimOptions() {
    this.simOptions = {};
  }

  async connectAccount(userId: string, institutionCode: string): Promise<FinancialAccountDTO> {
    if (this.simOptions.forceTimeout) {
      throw new Error('ETIMEDOUT: Connection to Account Aggregator gateway timed out after 10000ms.');
    }
    if (this.simOptions.forceOutage) {
      throw new Error('503 Service Unavailable: FIP Banking Gateway is undergoing scheduled maintenance.');
    }
    if (this.simOptions.forceMalformed) {
      throw new Error('502 Bad Gateway: Received malformed JSON from Financial Information Provider.');
    }

    const id = `bnk_fake_${institutionCode.toLowerCase()}_${uuidv4().substring(0, 6)}`;
    const now = new Date().toISOString();
    const instName = institutionCode === 'SBIN' ? 'State Bank of India'
      : (institutionCode === 'ICIC' || institutionCode === 'ICICI') ? 'ICICI Bank'
      : institutionCode === 'UTIB' ? 'Axis Bank'
      : 'HDFC Bank';
    // Unique masked number per fake account: two accounts of the same bank
    // must never collide on (user_id, institution_name, masked_account_number).
    const digitSeed = uuidv4().replace(/[^0-9]/g, '');
    const masked = `•••• ${(digitSeed + '0000').substring(0, 4)}`;

    // Connecting the same institution twice must return the wallet the user
    // already has. Previously every call inserted a brand-new row, so repeated
    // runs of the provider suite grew a single user to 46 duplicate accounts,
    // all reporting the same ₹42,580 — which the app then summed into a
    // ₹20.8L "bank balance".
    const existing = await getQuery<any>(
      `SELECT id, current_balance, available_balance, masked_account_number FROM bank_accounts
       WHERE user_id = ? AND institution_code = ? AND provider_type = 'FAKE_TEST_PROVIDER'
       LIMIT 1`,
      [userId, institutionCode]
    );

    if (existing) {
      await ConsentService.requestConsent(userId, existing.id);
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

    await runQuery(`
      INSERT INTO bank_accounts (id, user_id, institution_name, institution_code, masked_account_number, account_type, current_balance, available_balance, is_primary, connection_status, provider_type, last_synced_at)
      VALUES (?, ?, ?, ?, ?, 'SAVINGS', 42580.0, 42580.0, 0, 'CONNECTED', 'FAKE_TEST_PROVIDER', ?)
    `, [id, userId, instName, institutionCode, masked, now]);

    await ConsentService.requestConsent(userId, id);

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

  async syncBalances(userId: string, accountId: string): Promise<number> {
    if (this.simOptions.forceOutage) {
      throw new Error('503 Service Unavailable: FIP Balance Service is offline.');
    }

    const consentCheck = await ConsentService.validateConsentForFetch(userId);
    if (!consentCheck.valid) {
      throw new Error(`Sync rejected: ${consentCheck.reason}`);
    }

    return 42580.0;
  }

  async syncTransactions(userId: string, accountId: string): Promise<number> {
    if (this.simOptions.forcePartialFailure) {
      throw new Error('500 Internal Error: Transaction sync failed while balance sync succeeded.');
    }
    if (this.simOptions.forceOutage) {
      throw new Error('503 Service Unavailable: FIP Transaction Ledger is offline.');
    }

    const consentCheck = await ConsentService.validateConsentForFetch(userId);
    if (!consentCheck.valid) {
      throw new Error(`Sync rejected: ${consentCheck.reason}`);
    }

    return 10;
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
    return true;
  }
}
