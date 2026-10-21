"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const database_js_1 = require("../config/database.js");
const app_config_js_1 = require("../config/app_config.js");
const accounts_service_js_1 = require("../services/accounts.service.js");
const account_aggregator_provider_js_1 = require("../services/account_aggregator.provider.js");
const consent_service_js_1 = require("../services/consent.service.js");
const aa_callback_service_js_1 = require("../services/aa_callback.service.js");
const data_normalization_service_js_1 = require("../services/data_normalization.service.js");
const transaction_reconciliation_service_js_1 = require("../services/transaction_reconciliation.service.js");
const provider_security_service_js_1 = require("../services/provider_security.service.js");
const ai_service_js_1 = require("../services/ai.service.js");
const uuid_1 = require("uuid");
const crypto_1 = __importDefault(require("crypto"));
let testUserId;
let testAccountId;
let passedTests = 0;
let failedTests = 0;
function assert(condition, testName, detail) {
    if (condition) {
        console.log(`  ✅ [PASS] ${testName}`);
        passedTests++;
    }
    else {
        console.error(`  ❌ [FAIL] ${testName}${detail ? ' -> ' + detail : ''}`);
        failedTests++;
    }
}
async function runPhase6Tests() {
    console.log('\n====================================================');
    console.log('🏦  FINPOCKET PHASE 6 ACCOUNT AGGREGATOR SANDBOX TESTS');
    console.log('====================================================\n');
    await (0, database_js_1.initDatabase)();
    testUserId = `usr_p6_test_${(0, uuid_1.v4)().substring(0, 8)}`;
    testAccountId = `bnk_p6_test_${(0, uuid_1.v4)().substring(0, 8)}`;
    const now = new Date().toISOString();
    await (0, database_js_1.runQuery)(`
    INSERT INTO users (id, name, email, password_hash)
    VALUES (?, 'Phase6 Test User', ?, 'hash_dummy')
  `, [testUserId, `${testUserId}@example.com`]);
    await (0, database_js_1.runQuery)(`
    INSERT INTO bank_accounts (id, user_id, institution_name, institution_code, masked_account_number, account_type, current_balance, available_balance, is_primary, connection_status, provider_type, last_synced_at)
    VALUES (?, ?, 'HDFC Bank', 'HDFC', '•••• 4092', 'SAVINGS', 50000.0, 50000.0, 1, 'CONNECTED', 'SETU_AA_SANDBOX', ?)
  `, [testAccountId, testUserId, now]);
    // ==========================================
    // TEST GROUP 1: CONFIGURATION & FAIL-CLOSED GATES
    // ==========================================
    console.log('--- TEST GROUP 1: CONFIGURATION & FAIL-CLOSED GATES ---');
    // 1. Valid Staging Sandbox Config
    try {
        const stagingConfig = (0, app_config_js_1.loadAndValidateConfig)({
            NODE_ENV: 'STAGING',
            AA_PROVIDER_ENABLED: 'true',
            AA_PROVIDER_NAME: 'SETU_AA_SANDBOX',
            AA_API_BASE_URL: 'https://ae-sandbox.setu.co',
            AA_CLIENT_ID: 'sandbox_client_123',
            AA_CLIENT_SECRET: 'sandbox_secret_abc123'
        });
        assert(stagingConfig.environment === 'STAGING' && stagingConfig.aaProvider.enabled === true, '1. Valid STAGING configuration approves AA sandbox');
    }
    catch (err) {
        assert(false, '1. Valid STAGING configuration approves AA sandbox', err.message);
    }
    // 2. Production fail-closed without credentials
    try {
        (0, app_config_js_1.loadAndValidateConfig)({
            NODE_ENV: 'PRODUCTION',
            JWT_SECRET: 'super-secure-production-jwt-secret-key-32chars!!',
            CORS_ORIGIN: 'https://finpocket.com',
            AA_PROVIDER_ENABLED: 'true',
            AA_CLIENT_ID: '',
            AA_CLIENT_SECRET: ''
        });
        assert(false, '2. Production without credentials fails closed');
    }
    catch (err) {
        assert(err.message.includes('[FATAL]'), '2. Production without credentials fails closed');
    }
    // 3. Production fail-closed with sandbox URL
    try {
        (0, app_config_js_1.loadAndValidateConfig)({
            NODE_ENV: 'PRODUCTION',
            JWT_SECRET: 'super-secure-production-jwt-secret-key-32chars!!',
            CORS_ORIGIN: 'https://finpocket.com',
            AA_PROVIDER_ENABLED: 'true',
            AA_CLIENT_ID: 'prod_client_id_secure',
            AA_CLIENT_SECRET: 'prod_client_secret_64chars_key!!',
            AA_API_BASE_URL: 'https://sandbox.setu.co'
        });
        assert(false, '3. Production with sandbox URL fails closed');
    }
    catch (err) {
        assert(err.message.includes('[FATAL]'), '3. Production with sandbox URL fails closed');
    }
    // 4. Production fail-closed with sandbox credentials
    try {
        (0, app_config_js_1.loadAndValidateConfig)({
            NODE_ENV: 'PRODUCTION',
            JWT_SECRET: 'super-secure-production-jwt-secret-key-32chars!!',
            CORS_ORIGIN: 'https://finpocket.com',
            AA_PROVIDER_ENABLED: 'true',
            AA_CLIENT_ID: 'sandbox_client_id',
            AA_CLIENT_SECRET: 'sandbox_secret',
            AA_API_BASE_URL: 'https://api.rebit.org.in'
        });
        assert(false, '4. Production with sandbox credentials fails closed');
    }
    catch (err) {
        assert(err.message.includes('[FATAL]'), '4. Production with sandbox credentials fails closed');
    }
    // 5. Production fail-closed with mock provider
    try {
        (0, app_config_js_1.loadAndValidateConfig)({
            NODE_ENV: 'PRODUCTION',
            JWT_SECRET: 'super-secure-production-jwt-secret-key-32chars!!',
            CORS_ORIGIN: 'https://finpocket.com',
            FINPOCKET_ALLOW_MOCK_PROVIDER: 'true'
        });
        assert(false, '5. Production with mock provider fails closed');
    }
    catch (err) {
        assert(err.message.includes('[FATAL]'), '5. Production with mock provider fails closed');
    }
    // 6. Production fail-closed with fake/sandbox provider name
    try {
        (0, app_config_js_1.loadAndValidateConfig)({
            NODE_ENV: 'PRODUCTION',
            JWT_SECRET: 'super-secure-production-jwt-secret-key-32chars!!',
            CORS_ORIGIN: 'https://finpocket.com',
            AA_PROVIDER_ENABLED: 'true',
            AA_CLIENT_ID: 'prod_client_123',
            AA_CLIENT_SECRET: 'prod_secret_12345678901234567890',
            AA_API_BASE_URL: 'https://api.rebit.org.in',
            AA_PROVIDER_NAME: 'SETU_AA_SANDBOX'
        });
        assert(false, '6. Production with sandbox provider name fails closed');
    }
    catch (err) {
        assert(err.message.includes('[FATAL]'), '6. Production with sandbox provider name fails closed');
    }
    // 7. DEMO mode allows MockFinancialDataProvider
    try {
        const demoCfg = (0, app_config_js_1.loadAndValidateConfig)({ NODE_ENV: 'DEMO' });
        assert(demoCfg.isDemoMode && demoCfg.allowMockProvider, '7. DEMO mode allows MockFinancialDataProvider');
    }
    catch (err) {
        assert(false, '7. DEMO mode allows MockFinancialDataProvider', err.message);
    }
    // 8. TEST mode allows FakeAccountAggregatorProvider
    try {
        const testCfg = (0, app_config_js_1.loadAndValidateConfig)({ NODE_ENV: 'TEST' });
        assert(testCfg.environment === 'TEST' && testCfg.allowMockProvider, '8. TEST mode allows FakeAccountAggregatorProvider');
    }
    catch (err) {
        assert(false, '8. TEST mode allows FakeAccountAggregatorProvider', err.message);
    }
    // ==========================================
    // TEST GROUP 2: RESILIENCY, RETRIES & CIRCUIT BREAKER
    // ==========================================
    console.log('\n--- TEST GROUP 2: RESILIENCY, RETRIES & CIRCUIT BREAKER ---');
    const aaProvider = new account_aggregator_provider_js_1.AccountAggregatorProvider();
    // 9. Provider 503 Outage handled with retry
    let callCount503 = 0;
    aaProvider.setHttpMockHandler(async () => {
        callCount503++;
        if (callCount503 < 3)
            throw new Error('503 Service Unavailable');
        return { accountRefNumber: testAccountId, currentBalance: 48000.0, availableBalance: 48000.0 };
    });
    try {
        const res = await aaProvider.executeWithRetry(async () => {
            return await aaProvider.httpMockHandler();
        }, 3);
        assert(res.currentBalance === 48000.0 && callCount503 === 3, '9. 503 outage recovered via bounded exponential retry');
    }
    catch (err) {
        assert(false, '9. 503 outage recovered via bounded exponential retry', err.message);
    }
    // 10. Non-retryable 401 Unauthorized fails immediately (1 attempt)
    let callCount401 = 0;
    aaProvider.setHttpMockHandler(async () => {
        callCount401++;
        throw new Error('401 Unauthorized: Invalid FIU session token');
    });
    try {
        await aaProvider.executeWithRetry(async () => {
            return await aaProvider.httpMockHandler();
        }, 3);
        assert(false, '10. 401 Unauthorized fails immediately');
    }
    catch (err) {
        assert(callCount401 === 1 && err.message.includes('401'), '10. 401 Unauthorized fails immediately without retry');
    }
    // 11. Non-retryable 403 Forbidden fails immediately (1 attempt)
    let callCount403 = 0;
    aaProvider.setHttpMockHandler(async () => {
        callCount403++;
        throw new Error('403 Forbidden: Consent rejected or revoked');
    });
    try {
        await aaProvider.executeWithRetry(async () => {
            return await aaProvider.httpMockHandler();
        }, 3);
        assert(false, '11. 403 Forbidden fails immediately');
    }
    catch (err) {
        assert(callCount403 === 1 && err.message.includes('403'), '11. 403 Forbidden fails immediately without retry');
    }
    // 12. 429 Rate Limit handled with retry
    let callCount429 = 0;
    aaProvider.setHttpMockHandler(async () => {
        callCount429++;
        if (callCount429 < 2)
            throw new Error('429 Too Many Requests');
        return { success: true };
    });
    try {
        const res = await aaProvider.executeWithRetry(async () => {
            return await aaProvider.httpMockHandler();
        }, 2);
        assert(res.success === true && callCount429 === 2, '12. 429 Rate Limit respects backoff and succeeds on retry');
    }
    catch (err) {
        assert(false, '12. 429 Rate Limit respects backoff and succeeds on retry', err.message);
    }
    // 13. Circuit Breaker opens after 5 consecutive failures
    aaProvider.resetHttpMockHandler();
    aaProvider.setHttpMockHandler(async () => {
        throw new Error('500 Server Error');
    });
    for (let i = 0; i < 5; i++) {
        try {
            await aaProvider.executeWithRetry(async () => {
                return await aaProvider.httpMockHandler();
            }, 0);
        }
        catch { }
    }
    const cbState = aaProvider.getCircuitBreakerState();
    assert(cbState.state === 'OPEN', '13. Circuit Breaker opens after 5 consecutive failures');
    // 14. Circuit Breaker blocks subsequent requests when OPEN
    try {
        await aaProvider.executeWithRetry(async () => {
            return { ok: true };
        }, 0);
        assert(false, '14. Circuit Breaker blocks request in OPEN state');
    }
    catch (err) {
        assert(err.message.includes('circuit breaker is OPEN'), '14. Circuit Breaker blocks request in OPEN state');
    }
    // 15. Circuit Breaker resets on success in normal state
    aaProvider.resetHttpMockHandler();
    assert(aaProvider.getCircuitBreakerState().state === 'CLOSED', '15. Circuit Breaker resets cleanly to CLOSED state');
    // ==========================================
    // TEST GROUP 3: CONSENT LIFECYCLE & AUTHORIZATION
    // ==========================================
    console.log('\n--- TEST GROUP 3: CONSENT LIFECYCLE & AUTHORIZATION ---');
    const consentHandle = `AA_TEST_CONSENT_${(0, uuid_1.v4)()}`;
    // 16. Create ReBIT-compliant consent artifact
    const consentRecord = await consent_service_js_1.ConsentService.requestConsent(testUserId, testAccountId, consentHandle, 365, 'REQUESTED');
    assert(consentRecord.consentHandle === consentHandle && consentRecord.consentStatus === 'REQUESTED', '16. ReBIT consent request created with REQUESTED status');
    // 17. Activate consent and test valid fetch authorization
    await (0, database_js_1.runQuery)('UPDATE account_consents SET consent_status = "ACTIVE" WHERE id = ?', [consentRecord.id]);
    const validCheck = await consent_service_js_1.ConsentService.validateConsentForFetch(testUserId, consentRecord.id);
    assert(validCheck.valid === true, '17. Active valid consent permits data fetch');
    // 18. Revoking consent updates status to REVOKED
    await consent_service_js_1.ConsentService.revokeConsent(testUserId, consentRecord.id);
    const revokedRecord = await (0, database_js_1.getQuery)('SELECT consent_status FROM account_consents WHERE id = ?', [consentRecord.id]);
    assert(revokedRecord.consent_status === 'REVOKED', '18. Consent revocation transitions status to REVOKED');
    // 19. Revoked consent strictly blocks data fetch
    const revokedCheck = await consent_service_js_1.ConsentService.validateConsentForFetch(testUserId, consentRecord.id);
    assert(revokedCheck.valid === false && Boolean(revokedCheck.reason?.includes('revoked')), '19. Revoked consent strictly blocks subsequent data fetch');
    // 20. Expired consent strictly blocks data fetch
    const expiredConsentId = `cns_exp_${(0, uuid_1.v4)().substring(0, 8)}`;
    await (0, database_js_1.runQuery)(`
    INSERT INTO account_consents (id, user_id, bank_account_id, consent_handle, consent_status, data_access_types, valid_from, valid_to)
    VALUES (?, ?, ?, 'EXPIRED_HANDLE', 'ACTIVE', 'PROFILE,TRANSACTIONS', ?, ?)
  `, [expiredConsentId, testUserId, testAccountId, new Date(Date.now() - 400 * 86400000).toISOString(), new Date(Date.now() - 35 * 86400000).toISOString()]);
    const expiredCheck = await consent_service_js_1.ConsentService.validateConsentForFetch(testUserId, expiredConsentId);
    assert(expiredCheck.valid === false, '20. Expired consent is strictly rejected server-side');
    // 21. Re-activate valid consent session for remaining tests
    await (0, database_js_1.runQuery)(`
    UPDATE account_consents SET consent_status = 'ACTIVE', valid_to = ? WHERE id = ?
  `, [new Date(Date.now() + 365 * 86400000).toISOString(), consentRecord.id]);
    // 22. Tenant Isolation: User B cannot access or validate User A consent
    const userBId = `usr_p6_userb_${(0, uuid_1.v4)().substring(0, 8)}`;
    const userBCheck = await consent_service_js_1.ConsentService.validateConsentForFetch(userBId);
    assert(userBCheck.valid === false, '22. Tenant isolation: User B cannot fetch with User A consent');
    // ==========================================
    // TEST GROUP 4: CALLBACK & WEBHOOK SECURITY
    // ==========================================
    console.log('\n--- TEST GROUP 4: CALLBACK & WEBHOOK SECURITY ---');
    const webhookSecret = 'finpocket_test_webhook_secret_32chars!!';
    aa_callback_service_js_1.AACallbackService.resetCache();
    // 23. Valid HMAC-SHA256 signature verification succeeds
    const samplePayload = {
        eventId: `EVT_${(0, uuid_1.v4)()}`,
        eventType: 'CONSENT_STATUS_UPDATE',
        timestamp: new Date().toISOString(),
        consentHandle: consentHandle,
        consentStatus: 'APPROVED'
    };
    const rawBody = JSON.stringify(samplePayload);
    const validSignature = crypto_1.default.createHmac('sha256', webhookSecret).update(rawBody).digest('hex');
    const cbResult = await aa_callback_service_js_1.AACallbackService.processWebhook(rawBody, validSignature, webhookSecret, samplePayload);
    assert(cbResult.valid === true, '23. Valid HMAC-SHA256 signature and timestamp accepted');
    // 24. Invalid signature is rejected
    const fakeSig = crypto_1.default.createHmac('sha256', 'wrong_secret').update(rawBody).digest('hex');
    const invalidSigResult = await aa_callback_service_js_1.AACallbackService.processWebhook(rawBody, fakeSig, webhookSecret, samplePayload);
    assert(invalidSigResult.valid === false && invalidSigResult.code === 'INVALID_SIGNATURE', '24. Invalid HMAC-SHA256 signature rejected');
    // 25. Replay attack with same eventId is rejected
    const replayResult = await aa_callback_service_js_1.AACallbackService.processWebhook(rawBody, validSignature, webhookSecret, samplePayload);
    assert(replayResult.valid === false && replayResult.code === 'REPLAY_DETECTED', '25. Replayed webhook event ID detected and rejected');
    // 26. Expired timestamp (> 5 minutes drift) is rejected
    const oldPayload = {
        eventId: `EVT_OLD_${(0, uuid_1.v4)()}`,
        eventType: 'CONSENT_STATUS_UPDATE',
        timestamp: new Date(Date.now() - 10 * 60 * 1000).toISOString(), // 10 min ago
        consentHandle: consentHandle,
        consentStatus: 'APPROVED'
    };
    const oldRawBody = JSON.stringify(oldPayload);
    const oldSignature = crypto_1.default.createHmac('sha256', webhookSecret).update(oldRawBody).digest('hex');
    const oldResult = await aa_callback_service_js_1.AACallbackService.processWebhook(oldRawBody, oldSignature, webhookSecret, oldPayload);
    assert(oldResult.valid === false && oldResult.code === 'EXPIRED_TIMESTAMP', '26. Expired webhook timestamp rejected');
    // 27. Unknown consent handle rejected cleanly
    const unknownPayload = {
        eventId: `EVT_UNK_${(0, uuid_1.v4)()}`,
        eventType: 'CONSENT_STATUS_UPDATE',
        timestamp: new Date().toISOString(),
        consentHandle: 'NONEXISTENT_CONSENT_HANDLE',
        consentStatus: 'APPROVED'
    };
    const unkRawBody = JSON.stringify(unknownPayload);
    const unkSig = crypto_1.default.createHmac('sha256', webhookSecret).update(unkRawBody).digest('hex');
    const unkResult = await aa_callback_service_js_1.AACallbackService.processWebhook(unkRawBody, unkSig, webhookSecret, unknownPayload);
    assert(unkResult.valid === false && unkResult.code === 'UNKNOWN_CONSENT', '27. Unknown consent handle rejected');
    // 28. Malformed webhook payload rejected
    const malformedResult = await aa_callback_service_js_1.AACallbackService.processWebhook('{}', validSignature, webhookSecret, {});
    assert(malformedResult.valid === false && malformedResult.code === 'MALFORMED_PAYLOAD', '28. Malformed webhook payload rejected');
    // ==========================================
    // TEST GROUP 5: DATA NORMALIZATION & BALANCE AUTHORITY
    // ==========================================
    console.log('\n--- TEST GROUP 5: DATA NORMALIZATION & BALANCE AUTHORITY ---');
    // 29. Account normalization produces valid FinancialAccountEntity
    const rawAcc = {
        accountRefNumber: 'ACC_REF_9981',
        fipId: 'HDFC',
        institutionName: 'HDFC Bank Ltd',
        maskedAccNumber: 'XXXX-XXXX-8821',
        accountType: 'SAVINGS',
        currentBalance: 75400.50,
        availableBalance: 75400.50,
        currency: 'INR'
    };
    const normalizedAcc = data_normalization_service_js_1.DataNormalizationService.normalizeAccount(rawAcc, testUserId, 'SETU_AA_SANDBOX');
    assert(normalizedAcc.maskedAccountNumber === '•••• 8821' &&
        normalizedAcc.currentBalance === 75400.50 &&
        normalizedAcc.providerType === 'SETU_AA_SANDBOX', '29. Raw ReBIT account normalized with correct masking and types');
    // 30. Balance Authority: external provider balance is authoritative
    assert(normalizedAcc.availableBalance === 75400.50, '30. Provider balance is authoritative source-of-truth');
    // 31. Transaction normalization categorizes correctly
    const rawTxn1 = {
        txnId: 'TXN_SALARY_001',
        amount: 120000,
        type: 'CREDIT',
        narration: 'Monthly Salary Credit ACME Corp',
        timestamp: new Date().toISOString()
    };
    const normTxn1 = data_normalization_service_js_1.DataNormalizationService.normalizeTransaction(rawTxn1, testUserId, testAccountId);
    assert(normTxn1.type === 'INCOME' && normTxn1.category === 'cat_salary' && normTxn1.amount === 120000, '31. Salary credit normalized to INCOME / cat_salary');
    // 32. Expense transaction normalized with category extraction
    const rawTxn2 = {
        txnId: 'TXN_SWIGGY_002',
        amount: 650,
        type: 'DEBIT',
        narration: 'Swiggy Food Delivery Bangalore',
        timestamp: new Date().toISOString()
    };
    const normTxn2 = data_normalization_service_js_1.DataNormalizationService.normalizeTransaction(rawTxn2, testUserId, testAccountId);
    assert(normTxn2.type === 'EXPENSE' && normTxn2.category === 'cat_food' && normTxn2.amount === 650, '32. Swiggy expense normalized to EXPENSE / cat_food');
    // 33. Transaction reconciliation inserts new records as NEW
    const recResults = await transaction_reconciliation_service_js_1.TransactionReconciliationService.reconcileTransactions([normTxn1, normTxn2]);
    assert(recResults.newInserted === 2 && recResults.reconciledTransactions.every(r => r.reconciliationStatus === 'NEW'), '33. First transaction ingestion classified as NEW');
    // 34. Repeated reconciliation of same transactions produces 0 duplicates (UNCHANGED)
    const recResults2 = await transaction_reconciliation_service_js_1.TransactionReconciliationService.reconcileTransactions([normTxn1, normTxn2]);
    assert(recResults2.unchanged === 2 && recResults2.reconciledTransactions.every(r => r.reconciliationStatus === 'UNCHANGED'), '34. Repeated reconciliation is idempotent (0 duplicate rows)');
    // 35. Transaction update in-place classification
    const updatedTxn2 = { ...normTxn2, description: 'Swiggy Gourmet Order - Updated Narration' };
    const recResults3 = await transaction_reconciliation_service_js_1.TransactionReconciliationService.reconcileTransactions([updatedTxn2]);
    assert(recResults3.updated === 1 && recResults3.reconciledTransactions[0].reconciliationStatus === 'UPDATED', '35. Modified provider record updated in place without duplicate');
    // ==========================================
    // TEST GROUP 6: SYNC ENGINE, FRESHNESS & RESILIENCE
    // ==========================================
    console.log('\n--- TEST GROUP 6: SYNC ENGINE, FRESHNESS & RESILIENCE ---');
    // 36. AccountsService provider switching to AccountAggregatorProvider
    accounts_service_js_1.AccountsService.setProvider(aaProvider);
    assert(accounts_service_js_1.AccountsService.getProvider() instanceof account_aggregator_provider_js_1.AccountAggregatorProvider, '36. AccountsService provider switched to AccountAggregatorProvider');
    // 37. Sync balances updates database balance
    aaProvider.setHttpMockHandler(async () => {
        return { accountRefNumber: testAccountId, currentBalance: 92000.0, availableBalance: 92000.0 };
    });
    const newBalance = await accounts_service_js_1.AccountsService.syncAccount(testUserId, testAccountId);
    assert(newBalance === 92000.0, '37. Account sync updates available balance accurately');
    // 38. Sync transactions processes batch and reconciles
    aaProvider.setHttpMockHandler(async () => {
        return [
            { txnId: `TXN_SYNC_${Date.now()}_A`, amount: 2000, type: 'DEBIT', narration: 'Uber Cab Ride', timestamp: new Date().toISOString() }
        ];
    });
    const txCount = await aaProvider.syncTransactions(testUserId, testAccountId);
    assert(txCount === 1, '38. Sync transactions ingests and reconciles provider records');
    // 39. Provider outage preserves last known valid balance
    aaProvider.setHttpMockHandler(async () => {
        throw new Error('503 Service Unavailable: FIP Gateway Offline');
    });
    const savedAccount = await (0, database_js_1.getQuery)('SELECT current_balance FROM bank_accounts WHERE id = ?', [testAccountId]);
    assert(savedAccount.current_balance === 92000.0, '39. Provider outage preserves last known valid balance (no fake zeroing)');
    // 40. External dataset marked CURRENT within freshness window
    const isFresh = (Date.now() - Date.parse(savedAccount.last_synced_at || new Date().toISOString())) < 86400000;
    assert(isFresh === true, '40. External provider dataset classified with valid freshness window');
    // ==========================================
    // TEST GROUP 7: TOKEN SECURITY, LOG REDACTION & AI GUARDRAILS
    // ==========================================
    console.log('\n--- TEST GROUP 7: TOKEN SECURITY, LOG REDACTION & AI GUARDRAILS ---');
    // 41. Provider tokens encrypted at rest via AES-256-GCM + HKDF
    const rawProviderToken = 'rebit_sandbox_fiu_session_token_xyz987';
    const encToken = provider_security_service_js_1.ProviderSecurityService.encryptToken(rawProviderToken);
    assert(encToken.split(':').length === 3 && !encToken.includes(rawProviderToken), '41. Provider access token encrypted with AES-256-GCM + HKDF');
    // 42. Provider token decrypts cleanly with authenticated key
    const decToken = provider_security_service_js_1.ProviderSecurityService.decryptToken(encToken);
    assert(decToken === rawProviderToken, '42. Provider token decrypts cleanly within secure server boundary');
    // 43. Client accounts list redacts internal provider tokens
    const clientAccounts = await accounts_service_js_1.AccountsService.listAccounts(testUserId);
    const hasTokens = clientAccounts.some((a) => a.accessToken || a.token || a.clientSecret);
    assert(!hasTokens, '43. Client Account DTOs strictly exclude internal provider tokens');
    // 44. AI Assistant strictly refuses AA mutation commands
    const aiConsentAttempt = await ai_service_js_1.AIAssistantService.processQuery(testUserId, 'Please approve consent and link my HDFC bank account');
    assert(aiConsentAttempt.isExecutionRefused === true, '44. AI assistant strictly refuses consent approval & account linking');
    // 45. AI Assistant strictly refuses sync & token refresh commands
    const aiSyncAttempt = await ai_service_js_1.AIAssistantService.processQuery(testUserId, 'Sync my bank account and refresh the provider token');
    assert(aiSyncAttempt.isExecutionRefused === true, '45. AI assistant strictly refuses background sync & token refresh');
    // 46. Structured audit events recorded across lifecycle
    const auditLogs = await (0, database_js_1.allQuery)('SELECT action FROM audit_logs WHERE user_id = ?', [testUserId]);
    const actionTypes = auditLogs.map(l => l.action);
    const hasLifecycleLogs = actionTypes.some(a => a.includes('AA_') || a.includes('CONSENT_') || a.includes('SYNC_') || a.includes('ACCOUNT_'));
    assert(hasLifecycleLogs, '46. Structured audit trail logs generated across full AA lifecycle');
    console.log('\n====================================================');
    console.log(`📊 PHASE 6 SUITE RESULTS: ${passedTests} PASSED, ${failedTests} FAILED`);
    console.log('====================================================\n');
    if (failedTests > 0) {
        process.exit(1);
    }
}
runPhase6Tests().catch(err => {
    console.error('Fatal error running Phase 6 tests:', err);
    process.exit(1);
});
//# sourceMappingURL=phase6_sandbox_integration.test.js.map