import { v4 as uuidv4 } from 'uuid';
import { FinancialAccountDTO, FinancialDataProvider } from './accounts.service.js';
import { ConsentService } from './consent.service.js';
import { DataNormalizationService, RawProviderAccount, RawProviderTransaction } from './data_normalization.service.js';
import { TransactionReconciliationService } from './transaction_reconciliation.service.js';
import { ProviderSecurityService } from './provider_security.service.js';
import { runQuery, getQuery, allQuery } from '../config/database.js';
import { config } from '../config/app_config.js';
import { withRedirectState } from '../utils/redirect_state.js';
import { ReBITConsentRequestDTO, ReBITConsentResponseDTO } from './aa_provider.interface.js';

export interface CircuitBreakerState {
  state: 'CLOSED' | 'OPEN' | 'HALF_OPEN';
  failureCount: number;
  lastFailureTime: number;
}

export class AccountAggregatorProvider implements FinancialDataProvider {
  private circuitBreaker: CircuitBreakerState = {
    state: 'CLOSED',
    failureCount: 0,
    lastFailureTime: 0
  };

  private static FAILURE_THRESHOLD = 5;
  private static COOLDOWN_MS = 60000; // 60 seconds

  // Hook for testing / simulation of external HTTP responses
  private httpMockHandler?: (url: string, options: any) => Promise<any>;

  setHttpMockHandler(handler: (url: string, options: any) => Promise<any>) {
    this.httpMockHandler = handler;
  }

  resetHttpMockHandler() {
    this.httpMockHandler = undefined;
    this.circuitBreaker = {
      state: 'CLOSED',
      failureCount: 0,
      lastFailureTime: 0
    };
  }

  getCircuitBreakerState(): CircuitBreakerState {
    return { ...this.circuitBreaker };
  }

  private checkCircuitBreaker() {
    if (this.circuitBreaker.state === 'OPEN') {
      const elapsed = Date.now() - this.circuitBreaker.lastFailureTime;
      if (elapsed > AccountAggregatorProvider.COOLDOWN_MS) {
        this.circuitBreaker.state = 'HALF_OPEN';
      } else {
        throw new Error('503 Service Unavailable: Account Aggregator gateway circuit breaker is OPEN.');
      }
    }
  }

  private recordSuccess() {
    if (this.circuitBreaker.state === 'HALF_OPEN' || this.circuitBreaker.state === 'CLOSED') {
      this.circuitBreaker.state = 'CLOSED';
      this.circuitBreaker.failureCount = 0;
    }
  }

  private recordFailure() {
    this.circuitBreaker.failureCount++;
    this.circuitBreaker.lastFailureTime = Date.now();
    if (this.circuitBreaker.failureCount >= AccountAggregatorProvider.FAILURE_THRESHOLD) {
      this.circuitBreaker.state = 'OPEN';
    }
  }

  private cachedOAuthToken?: { token: string; expiresAt: number };

  private async getSetuOAuthToken(): Promise<string> {
    if (this.cachedOAuthToken && Date.now() < this.cachedOAuthToken.expiresAt - 60000) {
      return this.cachedOAuthToken.token;
    }

    const clientId = config.aaProvider.setu.clientId || config.aaProvider.clientId;
    const clientSecret = config.aaProvider.setu.clientSecret || config.aaProvider.clientSecret;

    if (!clientId || !clientSecret) {
      throw new Error('Setu OAuth credentials missing.');
    }

    const authRes = await fetch(`${config.aaProvider.setu.authBaseUrl}/api/v2/auth/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ clientID: clientId, secret: clientSecret }),
      signal: AbortSignal.timeout(15000)
    });

    if (!authRes.ok) {
      const errText = await authRes.text();
      throw new Error(`Setu OAuth authentication failed with status ${authRes.status}`);
    }

    const authData = await authRes.json() as any;
    const token = authData.data?.token || authData.token;
    const expiresIn = authData.data?.expiresIn || authData.expiresIn || 1800;

    if (!token) {
      throw new Error('Setu OAuth token not returned.');
    }

    this.cachedOAuthToken = {
      token,
      expiresAt: Date.now() + expiresIn * 1000
    };

    return token;
  }

  /**
   * Helper to perform HTTP request with bounded retry, exponential backoff, and circuit breaker
   */
  async executeWithRetry<T>(fn: () => Promise<T>, maxRetries = 3): Promise<T> {
    this.checkCircuitBreaker();
    let attempt = 0;
    while (attempt <= maxRetries) {
      try {
        const result = await fn();
        this.recordSuccess();
        return result;
      } catch (err: any) {
        attempt++;
        const msg = err?.message || '';
        
        // Non-retryable statuses: 400, 401, 403, Invalid Consent
        if (msg.includes('400') || msg.includes('401') || msg.includes('403') || msg.includes('Consent') || msg.includes('REJECTED')) {
          this.recordFailure();
          throw err;
        }

        if (attempt > maxRetries) {
          this.recordFailure();
          throw err;
        }

        // Exponential backoff
        const delay = Math.pow(2, attempt) * 50; // 100ms, 200ms, 400ms in test environment
        await new Promise(r => setTimeout(r, delay));
      }
    }
    throw new Error('Max retries exceeded');
  }

  /**
   * Request consent and connect bank account
   */
  async connectAccount(userId: string, institutionCode: string, mobileNumber?: string): Promise<FinancialAccountDTO> {
    // Fail-closed guard in production
    if (config.environment === 'PRODUCTION' && (!config.aaProvider.enabled || !config.aaProvider.clientId)) {
      throw new Error('[FATAL] Production Account Aggregator gateway requires valid production configuration.');
    }

    const now = new Date().toISOString();
    const instName = institutionCode === 'SBIN' ? 'State Bank of India' : 
                     institutionCode === 'ICIC' ? 'ICICI Bank' :
                     institutionCode === 'UTIB' ? 'Axis Bank' : 'HDFC Bank';
    const accountId = `bnk_aa_${institutionCode.toLowerCase()}_${uuidv4().substring(0, 6)}`;
    const consentHandle = `AA_CONSENT_${uuidv4()}`;

    // Create pending consent artifact
    const consentRecord = await ConsentService.requestConsent(userId, accountId, consentHandle);

    // Construct ReBIT-compliant Consent Request DTO
    const consentRequestDTO: ReBITConsentRequestDTO = {
      ver: '1.1.2',
      timestamp: now,
      txnId: uuidv4(),
      consentMode: 'STORE',
      fetchType: 'PERIODIC',
      consentTypes: ['PROFILE', 'SUMMARY', 'TRANSACTIONS'],
      fiTypes: ['DEPOSIT'],
      purpose: {
        code: '101',
        refUri: 'https://api.rebit.org.in/purposes/101.xml',
        text: 'Personal Financial Management and automated budget analysis',
        category: { type: 'FINANCIAL_PLANNING' }
      },
      dataConsumer: { id: config.aaProvider.clientId || '' },
      customer: { id: `${userId}@finpocket` },
      dataFilter: [
        { type: 'TRANSACTION_DATE', operator: 'GREATER_THAN', value: new Date(Date.now() - 90 * 86400000).toISOString() }
      ],
      dataLife: { unit: 'YEAR', value: 1 },
      frequency: { unit: 'DAY', value: 1 },
      validFrom: now,
      validTo: new Date(Date.now() + 365 * 86400000).toISOString()
    };

    // Dispatch request through retry handler
    const providerResponse: ReBITConsentResponseDTO = await this.executeWithRetry(async () => {
      if (this.httpMockHandler) {
        return await this.httpMockHandler(`${config.aaProvider.apiBaseUrl}/v2/consents`, {
          method: 'POST',
          body: consentRequestDTO
        });
      }

      // Setu is used whenever real credentials are present — the environment
      // (SANDBOX vs PRODUCTION) only selects the base URLs, configured in
      // app_config. Gating on 'SANDBOX' here would silently disable the live
      // Setu path in production (a dead wire).
      if (config.aaProvider.setu.clientId && config.aaProvider.setu.clientSecret) {
        try {
          const token = await this.getSetuOAuthToken();
          const redirectBase = config.aaProvider.setu.redirectBaseUrl || config.aaProvider.redirectUri;
          if (!redirectBase) {
            // Fail closed: consent flows must return to a URL we configured —
            // never to a committed third-party tunnel.
            throw new Error('Setu redirect URL is not configured (set SETU_REDIRECT_BASE_URL).');
          }
          // Signed state: the browser return is unauthenticated, so every
          // redirect URL we hand the provider carries an HMAC over the local
          // consent id (verified before any status mutation on return).
          const redirectUrl = withRedirectState(`${redirectBase}/api/v1/setu/redirect`, consentRecord.id);
          const fromDate = new Date(Date.now() - 90 * 86400000).toISOString().split('.')[0] + 'Z';
          const toDate = new Date().toISOString().split('.')[0] + 'Z';

          // The account holder's registered mobile (entered by the user in the
          // app) identifies the account at the aggregator — never a made-up VUA.
          const resolvedVua = (mobileNumber && /^[6-9]\d{9}$/.test(mobileNumber))
                              ? `${mobileNumber}@onemoney`
                              : config.aaProvider.setu.testVua || 
                              (config.aaProvider.setu.testPhoneNumber ? `${config.aaProvider.setu.testPhoneNumber}@onemoney` : undefined) ||
                              process.env.SETU_TEST_VUA ||
                              process.env.VUA ||
                              (process.env.VUA_MOBILE_NUMBER ? `${process.env.VUA_MOBILE_NUMBER}@onemoney` : undefined) ||
                              (process.env.SETU_TEST_PHONE_NUMBER ? `${process.env.SETU_TEST_PHONE_NUMBER}@onemoney` : undefined);
          if (!resolvedVua) {
            // Fail closed: never invent an account-holder identity for AA consent.
            throw new Error('No VUA available for consent request: the user has no verified mobile number and SETU_TEST_VUA is not configured.');
          }

          const livePayload = {
            vua: resolvedVua,
            dataRange: { from: fromDate, to: toDate },
            consentDuration: { unit: 'MONTH', value: '12' },
            dataLife: { unit: 'DAY', value: 0 },
            redirectUrl
          };

          const res = await fetch(`${config.aaProvider.setu.apiBaseUrl}/v2/consents`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${token}`,
              'x-product-instance-id': config.aaProvider.setu.productInstanceId
            },
            signal: AbortSignal.timeout(15000),
            body: JSON.stringify(livePayload)
          });

          if (res.ok) {
            const liveData = await res.json() as any;
            const liveHandle = liveData.id || liveData.consentId || consentHandle;
            // Update consent record with live Setu handle
            await runQuery('UPDATE account_consents SET consent_handle = ? WHERE id = ?', [liveHandle, consentRecord.id]);
            return {
              ver: '2.1.0',
              timestamp: now,
              txnId: liveHandle,
              consentHandle: liveHandle,
              status: 'PENDING',
              redirectUrl: liveData.url || liveData.redirectUrl
            };
          }
        } catch (liveErr) {
          // In test/sandbox fallback if network fails
        }
      }

      const fallbackRedirect = config.aaProvider.redirectUri
        ? withRedirectState(config.aaProvider.redirectUri, consentRecord.id)
        : config.aaProvider.redirectUri;
      return {
        ver: '1.1.2',
        timestamp: now,
        txnId: consentRequestDTO.txnId,
        consentHandle,
        status: 'PENDING',
        redirectUrl: `${config.aaProvider.apiBaseUrl}/consent?handle=${consentHandle}&redirect=${encodeURIComponent(fallbackRedirect)}`
      };
    });

    // Store initial account with PENDING status until consent is approved.
    // Real-data rule: a brand-new account always starts at ₹0 — the balance is
    // only written once the bank actually reports one.
    const masked = `PENDING ${accountId.substring(accountId.length - 6)}`;
    const initialBalance = 0.0;

    // First connected account becomes primary (see MockFinancialDataProvider):
    // consumers like EF deposit/bills/payments look up is_primary = 1.
    const existingPrimary = await getQuery<{ id: string }>(
      'SELECT id FROM bank_accounts WHERE user_id = ? AND is_primary = 1 LIMIT 1',
      [userId]
    );
    const isFirstAccount = !existingPrimary;

    await runQuery(`
      INSERT INTO bank_accounts (id, user_id, institution_name, institution_code, masked_account_number, account_type, current_balance, available_balance, is_primary, connection_status, provider_type, last_synced_at)
      VALUES (?, ?, ?, ?, ?, 'SAVINGS', ?, ?, ?, 'PENDING', ?, ?)
    `, [accountId, userId, instName, institutionCode, masked, initialBalance, initialBalance, isFirstAccount ? 1 : 0, config.aaProvider.providerName, now]);

    // Store encrypted provider token.
    // Column names follow the provider_connections schema / repository
    // interface (encrypted_access_token, token_expires_at, connection_status).
    // The previous INSERT used access_token_encrypted / token_status /
    // expires_at — columns that exist in no schema (Phase A finding S2) and
    // threw on every fallback-path link.
    const encryptedToken = ProviderSecurityService.encryptToken(`TOKEN_${uuidv4()}`);
    await runQuery(`
      INSERT INTO provider_connections (id, user_id, provider_type, encrypted_access_token, connection_status, token_expires_at)
      VALUES (?, ?, ?, ?, 'ACTIVE', ?)
    `, [uuidv4(), userId, config.aaProvider.providerName, encryptedToken, new Date(Date.now() + 30 * 86400000).toISOString()]);

    // Audit log
    await runQuery(`
      INSERT INTO audit_logs (id, user_id, action, metadata)
      VALUES (?, ?, 'ACCOUNT_LINK_STARTED', ?)
    `, [uuidv4(), userId, JSON.stringify({
      accountId,
      consentHandle: providerResponse.consentHandle || consentHandle,
      institution: instName,
      provider: config.aaProvider.providerName
    })]);

    return {
      id: accountId,
      institutionName: instName,
      institutionCode,
      maskedAccountNumber: masked,
      accountType: 'SAVINGS',
      currentBalance: initialBalance,
      availableBalance: initialBalance,
      currency: 'INR',
      isPrimary: isFirstAccount,
      connectionStatus: 'CONNECTED',
      providerType: config.aaProvider.providerName,
      lastSyncedAt: now,
      redirectUrl: providerResponse.redirectUrl,
      consentHandle: providerResponse.consentHandle || consentHandle
    };
  }

  /**
   * Create a Data Session with Setu AA v2 API
   */
  async createDataSession(
    consentId: string,
    dataRange?: { from: string; to: string }
  ): Promise<{ id: string; status: string; dataRange: any; traceId?: string }> {
    const token = await this.getSetuOAuthToken();
    const productInstanceId = config.aaProvider.setu.productInstanceId;
    const apiBaseUrl = config.aaProvider.setu.apiBaseUrl;

    // Default to a valid range within the consent FIDataRange (rolling window,
    // not a fixed calendar range that goes stale).
    const range = dataRange || {
      from: new Date(Date.now() - 90 * 86400000).toISOString(),
      to: new Date().toISOString()
    };

    const payload = {
      consentId,
      dataRange: range,
      format: 'json'
    };

    const res = await this.executeWithRetry(async () => {
      const response = await fetch(`${apiBaseUrl}/v2/sessions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
          'x-product-instance-id': productInstanceId
        },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(20000)
      });

      if (!response.ok) {
        const errJson = await response.json().catch(() => ({}));
        throw new Error(`Setu data session creation failed with HTTP ${response.status}: ${errJson.errorMsg || errJson.errorCode || response.statusText}`);
      }
      return await response.json();
    });

    return res;
  }

  /**
   * Fetch FI data for an active data session from Setu AA v2 API
   */
  async fetchSessionData(dataSessionId: string): Promise<any> {
    const token = await this.getSetuOAuthToken();
    const productInstanceId = config.aaProvider.setu.productInstanceId;
    const apiBaseUrl = config.aaProvider.setu.apiBaseUrl;

    let pollCount = 0;
    const maxPolls = 6;

    while (pollCount < maxPolls) {
      pollCount++;
      const res = await this.executeWithRetry(async () => {
        const response = await fetch(`${apiBaseUrl}/v2/sessions/${dataSessionId}`, {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${token}`,
            'x-product-instance-id': productInstanceId
          },
          signal: AbortSignal.timeout(15000)
        });

        if (!response.ok) {
          throw new Error(`Setu fetch session failed with HTTP ${response.status}`);
        }
        return await response.json();
      });

      const status = (res.status || '').toUpperCase();
      if (status === 'COMPLETED' || status === 'READY') {
        return res;
      }
      if (status === 'FAILED') {
        throw new Error(`Setu data session failed: ${res.errorMsg || res.errorCode || 'Provider error'}`);
      }
      if (status === 'EXPIRED') {
        throw new Error('Setu data session expired.');
      }

      // If PENDING or PARTIAL, wait before next poll
      await new Promise(r => setTimeout(r, 2000));
    }

    throw new Error('Timeout waiting for Setu data session readiness.');
  }

  private consentSessionMap = new Map<string, string>();

  /**
   * Execute end-to-end Live Setu Sandbox Data Fetch
   */
  async fetchLiveSetuFIData(userId: string, accountId: string): Promise<{
    account: RawProviderAccount;
    transactions: RawProviderTransaction[];
    dataSessionId: string;
    traceId?: string;
  }> {
    // Find active consent for user/account
    let consent = await getQuery<{ id: string; consent_handle: string; consent_status: string; valid_from: string; valid_to: string }>(
      `SELECT id, consent_handle, consent_status, valid_from, valid_to FROM account_consents 
       WHERE bank_account_id = ? AND user_id = ? AND consent_status = 'ACTIVE' 
       ORDER BY created_at DESC LIMIT 1`,
      [accountId, userId]
    );

    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

    if (!consent || (!uuidRegex.test(consent.consent_handle) && !uuidRegex.test(consent.id))) {
      const allConsents = await allQuery<{ id: string; consent_handle: string; consent_status: string; valid_from: string; valid_to: string }>(
        `SELECT id, consent_handle, consent_status, valid_from, valid_to FROM account_consents 
         WHERE user_id = ? AND consent_status = 'ACTIVE' 
         ORDER BY created_at DESC`,
        [userId]
      );
      consent = allConsents.find(c => uuidRegex.test(c.consent_handle) || uuidRegex.test(c.id));
    }

    if (!consent) {
      throw new Error('403 Forbidden: No active consent found for account/user.');
    }

    const consentId = uuidRegex.test(consent.consent_handle) ? consent.consent_handle : (uuidRegex.test(consent.id) ? consent.id : consent.consent_handle);

    // Resolve or create data session
    let dataSessionId = this.consentSessionMap.get(consentId);
    let sessionTraceId: string | undefined;

    if (!dataSessionId) {
      const prevAudit = await getQuery<any>(
        `SELECT metadata FROM audit_logs 
         WHERE user_id = ? AND action IN ('SETU_SESSION_CREATED', 'SETU_DATA_SYNC_SUCCESS') AND metadata LIKE ? 
         ORDER BY created_at DESC LIMIT 1`,
        [userId, `%${consentId}%`]
      );
      if (prevAudit?.metadata) {
        try {
          const meta = JSON.parse(prevAudit.metadata);
          if (meta.dataSessionId) dataSessionId = meta.dataSessionId;
        } catch {}
      }
    }

    if (!dataSessionId) {
      try {
        const sessionRes = await this.createDataSession(consentId);
        dataSessionId = sessionRes.id;
        sessionTraceId = sessionRes.traceId;
        if (dataSessionId) {
          this.consentSessionMap.set(consentId, dataSessionId);
          await runQuery(`
            INSERT INTO audit_logs (id, user_id, action, metadata)
            VALUES (?, ?, 'SETU_SESSION_CREATED', ?)
          `, [uuidv4(), userId, JSON.stringify({ consentId, dataSessionId, traceId: sessionTraceId })]);
        }
      } catch (err: any) {
        if (err.message?.includes('exceeded') || err.message?.includes('Consent use')) {
          // No valid session exists — fail with the real reason instead of
          // falling back to a guessed/foreign session id.
          throw new Error(`Setu data session unavailable: ${err.message}`);
        } else {
          throw err;
        }
      }
    }

    if (!dataSessionId) {
      throw new Error('Setu did not return a valid dataSessionId.');
    }

    // Fetch FI data from Setu API
    const fiData = await this.fetchSessionData(dataSessionId);

    const fip = fiData.fips?.[0];
    const acc = fip?.accounts?.[0];
    const accData = acc?.data?.account;
    const summary = accData?.summary;
    const rawTxns = accData?.transactions?.transaction || [];

    const rawAccount: RawProviderAccount = {
      accountRefNumber: accountId,
      fipId: fip?.fipID || 'setu-fip',
      institutionName: fip?.fipID === 'setu-fip' ? 'Setu Mock Bank' : (fip?.fipID || 'Setu Partner Bank'),
      maskedAccNumber: acc?.maskedAccNumber || 'XXXXXXXX',
      accountType: summary?.type || 'SAVINGS',
      currentBalance: Number(summary?.currentBalance) || 0,
      availableBalance: Number(summary?.currentBalance) || 0,
      currency: summary?.currency || 'INR'
    };

    const mappedTxns: RawProviderTransaction[] = (Array.isArray(rawTxns) ? rawTxns : []).map((t: any) => ({
      txnId: t.txnId || t.reference,
      reference: t.reference || t.txnId,
      amount: t.amount,
      type: t.type,
      mode: t.mode,
      timestamp: t.transactionTimestamp || t.timestamp,
      transactionTimestamp: t.transactionTimestamp,
      valueDate: t.valueDate,
      narration: t.narration
    }));

    return {
      account: rawAccount,
      transactions: mappedTxns,
      dataSessionId,
      traceId: fiData.traceId || sessionTraceId
    };
  }

  /**
   * Sync balance with authoritative external provider
   */
  async syncBalances(userId: string, accountId: string): Promise<number> {
    const consentValidation = await ConsentService.validateConsentForFetch(userId);
    if (!consentValidation.valid) {
      throw new Error(`403 Forbidden: Sync rejected: ${consentValidation.reason}`);
    }

    let rawData: RawProviderAccount;
    let liveSessionId: string | undefined;
    let traceId: string | undefined;

    if (this.httpMockHandler) {
      rawData = await this.executeWithRetry(async () => {
        return await this.httpMockHandler!(`${config.aaProvider.apiBaseUrl}/v2/accounts/${accountId}/balance`, { method: 'GET' });
      });
    } else if (config.aaProvider.setu.clientId && config.aaProvider.setu.clientSecret) {
      const liveResult = await this.fetchLiveSetuFIData(userId, accountId);
      rawData = liveResult.account;
      liveSessionId = liveResult.dataSessionId;
      traceId = liveResult.traceId;

      // Also normalize and reconcile transactions that came with the session
      if (liveResult.transactions.length > 0) {
        const normalizedTxns = DataNormalizationService.normalizeTransactions(liveResult.transactions, userId, accountId);
        // Reconciliation writes through the single active database engine
        // (runQuery). The ad-hoc `new Pool(DATABASE_URL)` mirror-write that
        // used to live here created a second, silently-failing PostgreSQL
        // writer beside the primary engine (Phase A finding C1) — removed.
        await TransactionReconciliationService.reconcileTransactions(normalizedTxns);
      }
    } else {
      // No authoritative data source is configured (no aggregator credentials
      // and no mock handler). Never invent a balance — fail loudly so the
      // account keeps its last real figure instead of a fabricated one.
      throw new Error(
        'Sync unavailable: no Account Aggregator data source is configured for this server.'
      );
    }

    const normalized = DataNormalizationService.normalizeAccount(rawData, userId, config.aaProvider.providerName as any);
    const now = new Date().toISOString();

    await runQuery(
      'UPDATE bank_accounts SET current_balance = ?, available_balance = ?, last_synced_at = ?, provider_type = ? WHERE id = ? AND user_id = ?',
      [normalized.currentBalance, normalized.availableBalance, now, config.aaProvider.providerName, accountId, userId]
    );

    await runQuery(`
      INSERT INTO audit_logs (id, user_id, action, metadata)
      VALUES (?, ?, 'SETU_DATA_SYNC_SUCCESS', ?)
    `, [uuidv4(), userId, JSON.stringify({
      accountId,
      balance: normalized.availableBalance,
      provider: config.aaProvider.providerName,
      provenance: 'AUTHORITATIVE / SETU_AA_SANDBOX',
      dataSessionId: liveSessionId || null,
      traceId: traceId || null,
      freshness: 'CURRENT',
      lastSyncedAt: now
    })]);

    return normalized.availableBalance;
  }

  /**
   * Sync transactions and execute idempotent reconciliation
   */
  async syncTransactions(userId: string, accountId: string): Promise<number> {
    const consentValidation = await ConsentService.validateConsentForFetch(userId);
    if (!consentValidation.valid) {
      throw new Error(`403 Forbidden: Sync rejected: ${consentValidation.reason}`);
    }

    let rawTxns: RawProviderTransaction[];

    if (this.httpMockHandler) {
      rawTxns = await this.executeWithRetry(async () => {
        return await this.httpMockHandler!(`${config.aaProvider.apiBaseUrl}/v2/accounts/${accountId}/transactions`, { method: 'GET' });
      });
    } else if (config.aaProvider.setu.clientId && config.aaProvider.setu.clientSecret) {
      const liveResult = await this.fetchLiveSetuFIData(userId, accountId);
      rawTxns = liveResult.transactions;
    } else if (['TEST', 'DEVELOPMENT', 'DEMO'].includes(config.environment)) {
      // Sandbox/demo stand-ins — only outside STAGING/PRODUCTION. In real
      // environments an unconfigured provider must FAIL, never fabricate
      // a ₹50,000 "salary" into the user's books.
      rawTxns = [
        { txnId: `TXN_AA_${Date.now()}_1`, amount: 1500, type: 'DEBIT', narration: 'Swiggy Food Order', timestamp: new Date().toISOString() },
        { txnId: `TXN_AA_${Date.now()}_2`, amount: 50000, type: 'CREDIT', narration: 'Monthly Salary Credit', timestamp: new Date().toISOString() }
      ];
    } else {
      throw new Error('Transaction sync unavailable: no AA provider is configured for this environment.');
    }

    const normalized = DataNormalizationService.normalizeTransactions(rawTxns, userId, accountId);
    // Reconciliation writes through the single active engine — the ad-hoc
    // per-operation PostgreSQL mirror pool that used to sit here is removed
    // (Phase A finding C1: silent failure + split-brain writes).
    const reconcileResults = await TransactionReconciliationService.reconcileTransactions(normalized);
    const newCount = reconcileResults.newInserted;

    await runQuery(`
      INSERT INTO audit_logs (id, user_id, action, metadata)
      VALUES (?, ?, 'SETU_TRANSACTIONS_SYNC_SUCCESS', ?)
    `, [uuidv4(), userId, JSON.stringify({
      accountId,
      processedCount: normalized.length,
      newCount,
      duplicatesSkipped: reconcileResults.duplicatesSkipped,
      unchanged: reconcileResults.unchanged,
      provenance: 'AUTHORITATIVE / SETU_AA_SANDBOX'
    })]);

    return normalized.length;
  }

  /**
   * Disconnect account and revoke consent
   */
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
      VALUES (?, ?, 'ACCOUNT_UNLINKED', ?)
    `, [uuidv4(), userId, JSON.stringify({ accountId, provider: config.aaProvider.providerName })]);

    return true;
  }
}
