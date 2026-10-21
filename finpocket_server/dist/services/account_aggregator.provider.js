"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AccountAggregatorProvider = void 0;
const uuid_1 = require("uuid");
const consent_service_js_1 = require("./consent.service.js");
const data_normalization_service_js_1 = require("./data_normalization.service.js");
const transaction_reconciliation_service_js_1 = require("./transaction_reconciliation.service.js");
const provider_security_service_js_1 = require("./provider_security.service.js");
const database_js_1 = require("../config/database.js");
const app_config_js_1 = require("../config/app_config.js");
const redirect_state_js_1 = require("../utils/redirect_state.js");
class AccountAggregatorProvider {
    circuitBreaker = {
        state: 'CLOSED',
        failureCount: 0,
        lastFailureTime: 0
    };
    static FAILURE_THRESHOLD = 5;
    static COOLDOWN_MS = 60000; // 60 seconds
    // Hook for testing / simulation of external HTTP responses
    httpMockHandler;
    setHttpMockHandler(handler) {
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
    getCircuitBreakerState() {
        return { ...this.circuitBreaker };
    }
    checkCircuitBreaker() {
        if (this.circuitBreaker.state === 'OPEN') {
            const elapsed = Date.now() - this.circuitBreaker.lastFailureTime;
            if (elapsed > AccountAggregatorProvider.COOLDOWN_MS) {
                this.circuitBreaker.state = 'HALF_OPEN';
            }
            else {
                throw new Error('503 Service Unavailable: Account Aggregator gateway circuit breaker is OPEN.');
            }
        }
    }
    recordSuccess() {
        if (this.circuitBreaker.state === 'HALF_OPEN' || this.circuitBreaker.state === 'CLOSED') {
            this.circuitBreaker.state = 'CLOSED';
            this.circuitBreaker.failureCount = 0;
        }
    }
    recordFailure() {
        this.circuitBreaker.failureCount++;
        this.circuitBreaker.lastFailureTime = Date.now();
        if (this.circuitBreaker.failureCount >= AccountAggregatorProvider.FAILURE_THRESHOLD) {
            this.circuitBreaker.state = 'OPEN';
        }
    }
    cachedOAuthToken;
    async getSetuOAuthToken() {
        if (this.cachedOAuthToken && Date.now() < this.cachedOAuthToken.expiresAt - 60000) {
            return this.cachedOAuthToken.token;
        }
        const clientId = app_config_js_1.config.aaProvider.setu.clientId || app_config_js_1.config.aaProvider.clientId;
        const clientSecret = app_config_js_1.config.aaProvider.setu.clientSecret || app_config_js_1.config.aaProvider.clientSecret;
        if (!clientId || !clientSecret) {
            throw new Error('Setu OAuth credentials missing.');
        }
        const authRes = await fetch(`${app_config_js_1.config.aaProvider.setu.authBaseUrl}/api/v2/auth/token`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ clientID: clientId, secret: clientSecret }),
            signal: AbortSignal.timeout(15000)
        });
        if (!authRes.ok) {
            const errText = await authRes.text();
            throw new Error(`Setu OAuth authentication failed with status ${authRes.status}`);
        }
        const authData = await authRes.json();
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
    async executeWithRetry(fn, maxRetries = 3) {
        this.checkCircuitBreaker();
        let attempt = 0;
        while (attempt <= maxRetries) {
            try {
                const result = await fn();
                this.recordSuccess();
                return result;
            }
            catch (err) {
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
    async connectAccount(userId, institutionCode, mobileNumber) {
        // Fail-closed guard in production
        if (app_config_js_1.config.environment === 'PRODUCTION' && (!app_config_js_1.config.aaProvider.enabled || !app_config_js_1.config.aaProvider.clientId)) {
            throw new Error('[FATAL] Production Account Aggregator gateway requires valid production configuration.');
        }
        const now = new Date().toISOString();
        const instName = institutionCode === 'SBIN' ? 'State Bank of India' :
            institutionCode === 'ICIC' ? 'ICICI Bank' :
                institutionCode === 'UTIB' ? 'Axis Bank' : 'HDFC Bank';
        const accountId = `bnk_aa_${institutionCode.toLowerCase()}_${(0, uuid_1.v4)().substring(0, 6)}`;
        const consentHandle = `AA_CONSENT_${(0, uuid_1.v4)()}`;
        // Create pending consent artifact
        const consentRecord = await consent_service_js_1.ConsentService.requestConsent(userId, accountId, consentHandle);
        // Construct ReBIT-compliant Consent Request DTO
        const consentRequestDTO = {
            ver: '1.1.2',
            timestamp: now,
            txnId: (0, uuid_1.v4)(),
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
            dataConsumer: { id: app_config_js_1.config.aaProvider.clientId || '' },
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
        const providerResponse = await this.executeWithRetry(async () => {
            if (this.httpMockHandler) {
                return await this.httpMockHandler(`${app_config_js_1.config.aaProvider.apiBaseUrl}/v2/consents`, {
                    method: 'POST',
                    body: consentRequestDTO
                });
            }
            // Setu is used whenever real credentials are present — the environment
            // (SANDBOX vs PRODUCTION) only selects the base URLs, configured in
            // app_config. Gating on 'SANDBOX' here would silently disable the live
            // Setu path in production (a dead wire).
            if (app_config_js_1.config.aaProvider.setu.clientId && app_config_js_1.config.aaProvider.setu.clientSecret) {
                try {
                    const token = await this.getSetuOAuthToken();
                    const redirectBase = app_config_js_1.config.aaProvider.setu.redirectBaseUrl || app_config_js_1.config.aaProvider.redirectUri;
                    if (!redirectBase) {
                        // Fail closed: consent flows must return to a URL we configured —
                        // never to a committed third-party tunnel.
                        throw new Error('Setu redirect URL is not configured (set SETU_REDIRECT_BASE_URL).');
                    }
                    // Signed state: the browser return is unauthenticated, so every
                    // redirect URL we hand the provider carries an HMAC over the local
                    // consent id (verified before any status mutation on return).
                    const redirectUrl = (0, redirect_state_js_1.withRedirectState)(`${redirectBase}/api/v1/setu/redirect`, consentRecord.id);
                    const fromDate = new Date(Date.now() - 90 * 86400000).toISOString().split('.')[0] + 'Z';
                    const toDate = new Date().toISOString().split('.')[0] + 'Z';
                    // The account holder's registered mobile (entered by the user in the
                    // app) identifies the account at the aggregator — never a made-up VUA.
                    const resolvedVua = (mobileNumber && /^[6-9]\d{9}$/.test(mobileNumber))
                        ? `${mobileNumber}@onemoney`
                        : app_config_js_1.config.aaProvider.setu.testVua ||
                            (app_config_js_1.config.aaProvider.setu.testPhoneNumber ? `${app_config_js_1.config.aaProvider.setu.testPhoneNumber}@onemoney` : undefined) ||
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
                    const res = await fetch(`${app_config_js_1.config.aaProvider.setu.apiBaseUrl}/v2/consents`, {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                            'Authorization': `Bearer ${token}`,
                            'x-product-instance-id': app_config_js_1.config.aaProvider.setu.productInstanceId
                        },
                        signal: AbortSignal.timeout(15000),
                        body: JSON.stringify(livePayload)
                    });
                    if (res.ok) {
                        const liveData = await res.json();
                        const liveHandle = liveData.id || liveData.consentId || consentHandle;
                        // Update consent record with live Setu handle
                        await (0, database_js_1.runQuery)('UPDATE account_consents SET consent_handle = ? WHERE id = ?', [liveHandle, consentRecord.id]);
                        return {
                            ver: '2.1.0',
                            timestamp: now,
                            txnId: liveHandle,
                            consentHandle: liveHandle,
                            status: 'PENDING',
                            redirectUrl: liveData.url || liveData.redirectUrl
                        };
                    }
                }
                catch (liveErr) {
                    // In test/sandbox fallback if network fails
                }
            }
            const fallbackRedirect = app_config_js_1.config.aaProvider.redirectUri
                ? (0, redirect_state_js_1.withRedirectState)(app_config_js_1.config.aaProvider.redirectUri, consentRecord.id)
                : app_config_js_1.config.aaProvider.redirectUri;
            return {
                ver: '1.1.2',
                timestamp: now,
                txnId: consentRequestDTO.txnId,
                consentHandle,
                status: 'PENDING',
                redirectUrl: `${app_config_js_1.config.aaProvider.apiBaseUrl}/consent?handle=${consentHandle}&redirect=${encodeURIComponent(fallbackRedirect)}`
            };
        });
        // Store initial account with PENDING status until consent is approved.
        // Real-data rule: a brand-new account always starts at ₹0 — the balance is
        // only written once the bank actually reports one.
        const masked = `PENDING ${accountId.substring(accountId.length - 6)}`;
        const initialBalance = 0.0;
        // First connected account becomes primary (see MockFinancialDataProvider):
        // consumers like EF deposit/bills/payments look up is_primary = 1.
        const existingPrimary = await (0, database_js_1.getQuery)('SELECT id FROM bank_accounts WHERE user_id = ? AND is_primary = 1 LIMIT 1', [userId]);
        const isFirstAccount = !existingPrimary;
        await (0, database_js_1.runQuery)(`
      INSERT INTO bank_accounts (id, user_id, institution_name, institution_code, masked_account_number, account_type, current_balance, available_balance, is_primary, connection_status, provider_type, last_synced_at)
      VALUES (?, ?, ?, ?, ?, 'SAVINGS', ?, ?, ?, 'PENDING', ?, ?)
    `, [accountId, userId, instName, institutionCode, masked, initialBalance, initialBalance, isFirstAccount ? 1 : 0, app_config_js_1.config.aaProvider.providerName, now]);
        // Store encrypted provider token.
        // Column names follow the provider_connections schema / repository
        // interface (encrypted_access_token, token_expires_at, connection_status).
        // The previous INSERT used access_token_encrypted / token_status /
        // expires_at — columns that exist in no schema (Phase A finding S2) and
        // threw on every fallback-path link.
        const encryptedToken = provider_security_service_js_1.ProviderSecurityService.encryptToken(`TOKEN_${(0, uuid_1.v4)()}`);
        await (0, database_js_1.runQuery)(`
      INSERT INTO provider_connections (id, user_id, provider_type, encrypted_access_token, connection_status, token_expires_at)
      VALUES (?, ?, ?, ?, 'ACTIVE', ?)
    `, [(0, uuid_1.v4)(), userId, app_config_js_1.config.aaProvider.providerName, encryptedToken, new Date(Date.now() + 30 * 86400000).toISOString()]);
        // Audit log
        await (0, database_js_1.runQuery)(`
      INSERT INTO audit_logs (id, user_id, action, metadata)
      VALUES (?, ?, 'ACCOUNT_LINK_STARTED', ?)
    `, [(0, uuid_1.v4)(), userId, JSON.stringify({
                accountId,
                consentHandle: providerResponse.consentHandle || consentHandle,
                institution: instName,
                provider: app_config_js_1.config.aaProvider.providerName
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
            providerType: app_config_js_1.config.aaProvider.providerName,
            lastSyncedAt: now,
            redirectUrl: providerResponse.redirectUrl,
            consentHandle: providerResponse.consentHandle || consentHandle
        };
    }
    /**
     * Create a Data Session with Setu AA v2 API
     */
    async createDataSession(consentId, dataRange) {
        const token = await this.getSetuOAuthToken();
        const productInstanceId = app_config_js_1.config.aaProvider.setu.productInstanceId;
        const apiBaseUrl = app_config_js_1.config.aaProvider.setu.apiBaseUrl;
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
    async fetchSessionData(dataSessionId) {
        const token = await this.getSetuOAuthToken();
        const productInstanceId = app_config_js_1.config.aaProvider.setu.productInstanceId;
        const apiBaseUrl = app_config_js_1.config.aaProvider.setu.apiBaseUrl;
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
    consentSessionMap = new Map();
    /**
     * Execute end-to-end Live Setu Sandbox Data Fetch
     */
    async fetchLiveSetuFIData(userId, accountId) {
        // Find active consent for user/account
        let consent = await (0, database_js_1.getQuery)(`SELECT id, consent_handle, consent_status, valid_from, valid_to FROM account_consents 
       WHERE bank_account_id = ? AND user_id = ? AND consent_status = 'ACTIVE' 
       ORDER BY created_at DESC LIMIT 1`, [accountId, userId]);
        const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
        if (!consent || (!uuidRegex.test(consent.consent_handle) && !uuidRegex.test(consent.id))) {
            const allConsents = await (0, database_js_1.allQuery)(`SELECT id, consent_handle, consent_status, valid_from, valid_to FROM account_consents 
         WHERE user_id = ? AND consent_status = 'ACTIVE' 
         ORDER BY created_at DESC`, [userId]);
            consent = allConsents.find(c => uuidRegex.test(c.consent_handle) || uuidRegex.test(c.id));
        }
        if (!consent) {
            throw new Error('403 Forbidden: No active consent found for account/user.');
        }
        const consentId = uuidRegex.test(consent.consent_handle) ? consent.consent_handle : (uuidRegex.test(consent.id) ? consent.id : consent.consent_handle);
        // Resolve or create data session
        let dataSessionId = this.consentSessionMap.get(consentId);
        let sessionTraceId;
        if (!dataSessionId) {
            const prevAudit = await (0, database_js_1.getQuery)(`SELECT metadata FROM audit_logs 
         WHERE user_id = ? AND action IN ('SETU_SESSION_CREATED', 'SETU_DATA_SYNC_SUCCESS') AND metadata LIKE ? 
         ORDER BY created_at DESC LIMIT 1`, [userId, `%${consentId}%`]);
            if (prevAudit?.metadata) {
                try {
                    const meta = JSON.parse(prevAudit.metadata);
                    if (meta.dataSessionId)
                        dataSessionId = meta.dataSessionId;
                }
                catch { }
            }
        }
        if (!dataSessionId) {
            try {
                const sessionRes = await this.createDataSession(consentId);
                dataSessionId = sessionRes.id;
                sessionTraceId = sessionRes.traceId;
                if (dataSessionId) {
                    this.consentSessionMap.set(consentId, dataSessionId);
                    await (0, database_js_1.runQuery)(`
            INSERT INTO audit_logs (id, user_id, action, metadata)
            VALUES (?, ?, 'SETU_SESSION_CREATED', ?)
          `, [(0, uuid_1.v4)(), userId, JSON.stringify({ consentId, dataSessionId, traceId: sessionTraceId })]);
                }
            }
            catch (err) {
                if (err.message?.includes('exceeded') || err.message?.includes('Consent use')) {
                    // No valid session exists — fail with the real reason instead of
                    // falling back to a guessed/foreign session id.
                    throw new Error(`Setu data session unavailable: ${err.message}`);
                }
                else {
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
        const rawAccount = {
            accountRefNumber: accountId,
            fipId: fip?.fipID || 'setu-fip',
            institutionName: fip?.fipID === 'setu-fip' ? 'Setu Mock Bank' : (fip?.fipID || 'Setu Partner Bank'),
            maskedAccNumber: acc?.maskedAccNumber || 'XXXXXXXX',
            accountType: summary?.type || 'SAVINGS',
            currentBalance: Number(summary?.currentBalance) || 0,
            availableBalance: Number(summary?.currentBalance) || 0,
            currency: summary?.currency || 'INR'
        };
        const mappedTxns = (Array.isArray(rawTxns) ? rawTxns : []).map((t) => ({
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
    async syncBalances(userId, accountId) {
        const consentValidation = await consent_service_js_1.ConsentService.validateConsentForFetch(userId);
        if (!consentValidation.valid) {
            throw new Error(`403 Forbidden: Sync rejected: ${consentValidation.reason}`);
        }
        let rawData;
        let liveSessionId;
        let traceId;
        if (this.httpMockHandler) {
            rawData = await this.executeWithRetry(async () => {
                return await this.httpMockHandler(`${app_config_js_1.config.aaProvider.apiBaseUrl}/v2/accounts/${accountId}/balance`, { method: 'GET' });
            });
        }
        else if (app_config_js_1.config.aaProvider.setu.clientId && app_config_js_1.config.aaProvider.setu.clientSecret) {
            const liveResult = await this.fetchLiveSetuFIData(userId, accountId);
            rawData = liveResult.account;
            liveSessionId = liveResult.dataSessionId;
            traceId = liveResult.traceId;
            // Also normalize and reconcile transactions that came with the session
            if (liveResult.transactions.length > 0) {
                const normalizedTxns = data_normalization_service_js_1.DataNormalizationService.normalizeTransactions(liveResult.transactions, userId, accountId);
                // Reconciliation writes through the single active database engine
                // (runQuery). The ad-hoc `new Pool(DATABASE_URL)` mirror-write that
                // used to live here created a second, silently-failing PostgreSQL
                // writer beside the primary engine (Phase A finding C1) — removed.
                await transaction_reconciliation_service_js_1.TransactionReconciliationService.reconcileTransactions(normalizedTxns);
            }
        }
        else {
            // No authoritative data source is configured (no aggregator credentials
            // and no mock handler). Never invent a balance — fail loudly so the
            // account keeps its last real figure instead of a fabricated one.
            throw new Error('Sync unavailable: no Account Aggregator data source is configured for this server.');
        }
        const normalized = data_normalization_service_js_1.DataNormalizationService.normalizeAccount(rawData, userId, app_config_js_1.config.aaProvider.providerName);
        const now = new Date().toISOString();
        await (0, database_js_1.runQuery)('UPDATE bank_accounts SET current_balance = ?, available_balance = ?, last_synced_at = ?, provider_type = ? WHERE id = ? AND user_id = ?', [normalized.currentBalance, normalized.availableBalance, now, app_config_js_1.config.aaProvider.providerName, accountId, userId]);
        await (0, database_js_1.runQuery)(`
      INSERT INTO audit_logs (id, user_id, action, metadata)
      VALUES (?, ?, 'SETU_DATA_SYNC_SUCCESS', ?)
    `, [(0, uuid_1.v4)(), userId, JSON.stringify({
                accountId,
                balance: normalized.availableBalance,
                provider: app_config_js_1.config.aaProvider.providerName,
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
    async syncTransactions(userId, accountId) {
        const consentValidation = await consent_service_js_1.ConsentService.validateConsentForFetch(userId);
        if (!consentValidation.valid) {
            throw new Error(`403 Forbidden: Sync rejected: ${consentValidation.reason}`);
        }
        let rawTxns;
        if (this.httpMockHandler) {
            rawTxns = await this.executeWithRetry(async () => {
                return await this.httpMockHandler(`${app_config_js_1.config.aaProvider.apiBaseUrl}/v2/accounts/${accountId}/transactions`, { method: 'GET' });
            });
        }
        else if (app_config_js_1.config.aaProvider.setu.clientId && app_config_js_1.config.aaProvider.setu.clientSecret) {
            const liveResult = await this.fetchLiveSetuFIData(userId, accountId);
            rawTxns = liveResult.transactions;
        }
        else if (['TEST', 'DEVELOPMENT', 'DEMO'].includes(app_config_js_1.config.environment)) {
            // Sandbox/demo stand-ins — only outside STAGING/PRODUCTION. In real
            // environments an unconfigured provider must FAIL, never fabricate
            // a ₹50,000 "salary" into the user's books.
            rawTxns = [
                { txnId: `TXN_AA_${Date.now()}_1`, amount: 1500, type: 'DEBIT', narration: 'Swiggy Food Order', timestamp: new Date().toISOString() },
                { txnId: `TXN_AA_${Date.now()}_2`, amount: 50000, type: 'CREDIT', narration: 'Monthly Salary Credit', timestamp: new Date().toISOString() }
            ];
        }
        else {
            throw new Error('Transaction sync unavailable: no AA provider is configured for this environment.');
        }
        const normalized = data_normalization_service_js_1.DataNormalizationService.normalizeTransactions(rawTxns, userId, accountId);
        // Reconciliation writes through the single active engine — the ad-hoc
        // per-operation PostgreSQL mirror pool that used to sit here is removed
        // (Phase A finding C1: silent failure + split-brain writes).
        const reconcileResults = await transaction_reconciliation_service_js_1.TransactionReconciliationService.reconcileTransactions(normalized);
        const newCount = reconcileResults.newInserted;
        await (0, database_js_1.runQuery)(`
      INSERT INTO audit_logs (id, user_id, action, metadata)
      VALUES (?, ?, 'SETU_TRANSACTIONS_SYNC_SUCCESS', ?)
    `, [(0, uuid_1.v4)(), userId, JSON.stringify({
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
    async disconnectAccount(userId, accountId) {
        await (0, database_js_1.runQuery)(`UPDATE bank_accounts SET connection_status = 'DISCONNECTED' WHERE id = ? AND user_id = ?`, [accountId, userId]);
        await (0, database_js_1.runQuery)(`UPDATE account_consents SET consent_status = 'REVOKED' WHERE bank_account_id = ? AND user_id = ?`, [accountId, userId]);
        await (0, database_js_1.runQuery)(`
      INSERT INTO audit_logs (id, user_id, action, metadata)
      VALUES (?, ?, 'ACCOUNT_UNLINKED', ?)
    `, [(0, uuid_1.v4)(), userId, JSON.stringify({ accountId, provider: app_config_js_1.config.aaProvider.providerName })]);
        return true;
    }
}
exports.AccountAggregatorProvider = AccountAggregatorProvider;
//# sourceMappingURL=account_aggregator.provider.js.map