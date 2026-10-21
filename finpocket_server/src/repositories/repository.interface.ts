export type FreshnessStatus = 'CURRENT' | 'STALE' | 'SYNCING' | 'FAILED' | 'NEVER_SYNCED';
export type ConsentStatus = 'REQUESTED' | 'PENDING' | 'ACTIVE' | 'EXPIRED' | 'REVOKED' | 'REJECTED' | 'FAILED';
export type ProviderType = 'MOCK' | 'ACCOUNT_AGGREGATOR' | 'FAKE_TEST_PROVIDER' | 'SETU_AA_SANDBOX' | 'REBIT_AA';

export interface FinancialAccountEntity {
  id: string;
  userId: string;
  institutionName: string;
  institutionCode: string;
  maskedAccountNumber: string;
  accountType: string;
  currentBalance: number;
  availableBalance: number;
  currency: string;
  isPrimary: boolean;
  connectionStatus: string;
  providerType: ProviderType;
  freshnessStatus: FreshnessStatus;
  lastSyncedAt: string;
  createdAt: string;
}

export interface FinancialTransactionEntity {
  id: string;
  userId: string;
  accountId?: string;
  providerTransactionId?: string;
  amount: number;
  type: 'INCOME' | 'EXPENSE' | 'TRANSFER';
  category: string;
  sender: string;
  receiver: string;
  merchant?: string;
  description?: string;
  referenceId: string;
  timestamp: string;
  valueDate?: string;
  status: 'SUCCESSFUL' | 'PENDING' | 'FAILED' | 'CANCELLED';
  reconciliationStatus?: 'NEW' | 'UPDATED' | 'UNCHANGED' | 'REVERSED' | 'DUPLICATE';
}

export interface AccountConsentEntity {
  id: string;
  userId: string;
  bankAccountId?: string;
  consentHandle: string;
  consentStatus: ConsentStatus;
  dataAccessTypes: string; // e.g. 'PROFILE,TRANSACTIONS,BALANCES'
  purposeCode: string; // e.g. 'PERSONAL_FINANCE_MANAGEMENT'
  validFrom: string;
  validTo: string;
  revokedAt?: string;
  createdAt: string;
}

export interface ProviderConnectionEntity {
  id: string;
  userId: string;
  providerType: ProviderType;
  encryptedAccessToken?: string;
  encryptedRefreshToken?: string;
  tokenExpiresAt?: string;
  connectionStatus: string;
  lastSuccessfulSync?: string;
  lastFailedSync?: string;
  lastErrorMessage?: string;
  createdAt: string;
  updatedAt: string;
}

export interface SyncLogEntity {
  id: string;
  userId: string;
  providerType: ProviderType;
  consentId?: string;
  status: 'SUCCESS' | 'PARTIAL' | 'FAILED';
  accountsSynced: number;
  transactionsSynced: number;
  errorDetails?: string;
  idempotencyKey?: string;
  durationMs: number;
  timestamp: string;
}

export interface IFinancialAccountRepository {
  findById(id: string, userId: string): Promise<FinancialAccountEntity | null>;
  findByUserId(userId: string): Promise<FinancialAccountEntity[]>;
  save(account: FinancialAccountEntity): Promise<void>;
  updateBalance(id: string, userId: string, currentBalance: number, availableBalance: number, freshness: FreshnessStatus, syncedAt: string): Promise<void>;
  updateStatus(id: string, userId: string, status: string): Promise<void>;
  delete(id: string, userId: string): Promise<void>;
}

export interface ITransactionRepository {
  findById(id: string, userId: string): Promise<FinancialTransactionEntity | null>;
  findByProviderTxId(providerTxId: string, userId: string): Promise<FinancialTransactionEntity | null>;
  findByUserId(userId: string, limit?: number, offset?: number): Promise<FinancialTransactionEntity[]>;
  saveBatch(transactions: FinancialTransactionEntity[]): Promise<number>;
  save(transaction: FinancialTransactionEntity): Promise<void>;
}

export interface IConsentRepository {
  findById(id: string, userId: string): Promise<AccountConsentEntity | null>;
  findByHandle(handle: string): Promise<AccountConsentEntity | null>;
  findActiveByUserId(userId: string): Promise<AccountConsentEntity[]>;
  save(consent: AccountConsentEntity): Promise<void>;
  updateStatus(id: string, userId: string, status: ConsentStatus, revokedAt?: string): Promise<void>;
}

export interface IProviderConnectionRepository {
  findByUserIdAndProvider(userId: string, provider: ProviderType): Promise<ProviderConnectionEntity | null>;
  save(connection: ProviderConnectionEntity): Promise<void>;
  updateSyncStatus(id: string, success: boolean, timestamp: string, error?: string): Promise<void>;
}

export interface IFinancialSyncRepository {
  findByIdempotencyKey(key: string, userId: string): Promise<SyncLogEntity | null>;
  saveLog(log: SyncLogEntity): Promise<void>;
  getLastSync(userId: string): Promise<SyncLogEntity | null>;
}
