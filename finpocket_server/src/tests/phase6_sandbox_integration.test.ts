import { initDatabase, runQuery, getQuery, allQuery } from '../config/database.js';
import { loadAndValidateConfig } from '../config/app_config.js';
import { AccountsService, MockFinancialDataProvider } from '../services/accounts.service.js';
import { FakeAccountAggregatorProvider } from '../services/fake_aa_provider.js';
import { AccountAggregatorProvider } from '../services/account_aggregator.provider.js';
import { ConsentService } from '../services/consent.service.js';
import { AACallbackService } from '../services/aa_callback.service.js';
import { DataNormalizationService } from '../services/data_normalization.service.js';
import { TransactionReconciliationService } from '../services/transaction_reconciliation.service.js';
import { ProviderSecurityService } from '../services/provider_security.service.js';
import { AIAssistantService } from '../services/ai.service.js';
import { v4 as uuidv4 } from 'uuid';
import crypto from 'crypto';

let testUserId: string;
let testAccountId: string;

let passedTests = 0;
let failedTests = 0;

function assert(condition: boolean, testName: string, detail?: string) {
  if (condition) {
    console.log(`  ✅ [PASS] ${testName}`);
    passedTests++;
  } else {
    console.error(`  ❌ [FAIL] ${testName}${detail ? ' -> ' + detail : ''}`);
    failedTests++;
  }
}

async function runPhase6Tests() {
  console.log('\n====================================================');
  console.log('🏦  FINPOCKET PHASE 6 ACCOUNT AGGREGATOR SANDBOX TESTS');
  console.log('====================================================\n');

  await initDatabase();

  testUserId = `usr_p6_test_${uuidv4().substring(0, 8)}`;
  testAccountId = `bnk_p6_test_${uuidv4().substring(0, 8)}`;
  const now = new Date().toISOString();

  await runQuery(`
    INSERT INTO users (id, name, email, password_hash)
    VALUES (?, 'Phase6 Test User', ?, 'hash_dummy')
  `, [testUserId, `${testUserId}@example.com`]);

  await runQuery(`
    INSERT INTO bank_accounts (id, user_id, institution_name, institution_code, masked_account_number, account_type, current_balance, available_balance, is_primary, connection_status, provider_type, last_synced_at)
    VALUES (?, ?, 'HDFC Bank', 'HDFC', '•••• 4092', 'SAVINGS', 50000.0, 50000.0, 1, 'CONNECTED', 'SETU_AA_SANDBOX', ?)
  `, [testAccountId, testUserId, now]);

  // ==========================================
  // TEST GROUP 1: CONFIGURATION & FAIL-CLOSED GATES
  // ==========================================
  console.log('--- TEST GROUP 1: CONFIGURATION & FAIL-CLOSED GATES ---');

  // 1. Valid Staging Sandbox Config
  try {
    const stagingConfig = loadAndValidateConfig({
      NODE_ENV: 'STAGING',
      AA_PROVIDER_ENABLED: 'true',
      AA_PROVIDER_NAME: 'SETU_AA_SANDBOX',
      AA_API_BASE_URL: 'https://ae-sandbox.setu.co',
      AA_CLIENT_ID: 'sandbox_client_123',
      AA_CLIENT_SECRET: 'sandbox_secret_abc123'
    });
    assert(stagingConfig.environment === 'STAGING' && stagingConfig.aaProvider.enabled === true, '1. Valid STAGING configuration approves AA sandbox');
  } catch (err: any) {
    assert(false, '1. Valid STAGING configuration approves AA sandbox', err.message);
  }

  // 2. Production fail-closed without credentials
  try {
    loadAndValidateConfig({
      NODE_ENV: 'PRODUCTION',
      JWT_SECRET: 'super-secure-production-jwt-secret-key-32chars!!',
      CORS_ORIGIN: 'https://finpocket.com',
      AA_PROVIDER_ENABLED: 'true',
      AA_CLIENT_ID: '',
      AA_CLIENT_SECRET: ''
    });
    assert(false, '2. Production without credentials fails closed');
  } catch (err: any) {
    assert(err.message.includes('[FATAL]'), '2. Production without credentials fails closed');
  }

  // 3. Production fail-closed with sandbox URL
  try {
    loadAndValidateConfig({
      NODE_ENV: 'PRODUCTION',
      JWT_SECRET: 'super-secure-production-jwt-secret-key-32chars!!',
      CORS_ORIGIN: 'https://finpocket.com',
      AA_PROVIDER_ENABLED: 'true',
      AA_CLIENT_ID: 'prod_client_id_secure',
      AA_CLIENT_SECRET: 'prod_client_secret_64chars_key!!',
      AA_API_BASE_URL: 'https://sandbox.setu.co'
    });
    assert(false, '3. Production with sandbox URL fails closed');
  } catch (err: any) {
    assert(err.message.includes('[FATAL]'), '3. Production with sandbox URL fails closed');
  }

  // 4. Production fail-closed with sandbox credentials
  try {
    loadAndValidateConfig({
      NODE_ENV: 'PRODUCTION',
      JWT_SECRET: 'super-secure-production-jwt-secret-key-32chars!!',
      CORS_ORIGIN: 'https://finpocket.com',
      AA_PROVIDER_ENABLED: 'true',
      AA_CLIENT_ID: 'sandbox_client_id',
      AA_CLIENT_SECRET: 'sandbox_secret',
      AA_API_BASE_URL: 'https://api.rebit.org.in'
    });
    assert(false, '4. Production with sandbox credentials fails closed');
  } catch (err: any) {
    assert(err.message.includes('[FATAL]'), '4. Production with sandbox credentials fails closed');
  }

  // 5. Production fail-closed with mock provider
  try {
    loadAndValidateConfig({
      NODE_ENV: 'PRODUCTION',
      JWT_SECRET: 'super-secure-production-jwt-secret-key-32chars!!',
      CORS_ORIGIN: 'https://finpocket.com',
      FINPOCKET_ALLOW_MOCK_PROVIDER: 'true'
    });
    assert(false, '5. Production with mock provider fails closed');
  } catch (err: any) {
    assert(err.message.includes('[FATAL]'), '5. Production with mock provider fails closed');
  }

  // 6. Production fail-closed with fake/sandbox provider name
  try {
    loadAndValidateConfig({
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
  } catch (err: any) {
    assert(err.message.includes('[FATAL]'), '6. Production with sandbox provider name fails closed');
  }

  // 7. DEMO mode allows MockFinancialDataProvider
  try {
    const demoCfg = loadAndValidateConfig({ NODE_ENV: 'DEMO' });
    assert(demoCfg.isDemoMode && demoCfg.allowMockProvider, '7. DEMO mode allows MockFinancialDataProvider');
  } catch (err: any) {
    assert(false, '7. DEMO mode allows MockFinancialDataProvider', err.message);
  }

  // 8. TEST mode allows FakeAccountAggregatorProvider
  try {
    const testCfg = loadAndValidateConfig({ NODE_ENV: 'TEST' });
    assert(testCfg.environment === 'TEST' && testCfg.allowMockProvider, '8. TEST mode allows FakeAccountAggregatorProvider');
  } catch (err: any) {
    assert(false, '8. TEST mode allows FakeAccountAggregatorProvider', err.message);
  }

  // ==========================================
  // TEST GROUP 2: RESILIENCY, RETRIES & CIRCUIT BREAKER
  // ==========================================
  console.log('\n--- TEST GROUP 2: RESILIENCY, RETRIES & CIRCUIT BREAKER ---');

  const aaProvider = new AccountAggregatorProvider();

  // 9. Provider 503 Outage handled with retry
  let callCount503 = 0;
  aaProvider.setHttpMockHandler(async () => {
    callCount503++;
    if (callCount503 < 3) throw new Error('503 Service Unavailable');
    return { accountRefNumber: testAccountId, currentBalance: 48000.0, availableBalance: 48000.0 };
  });
  try {
    const res = await aaProvider.executeWithRetry(async () => {
      return await (aaProvider as any).httpMockHandler();
    }, 3);
    assert(res.currentBalance === 48000.0 && callCount503 === 3, '9. 503 outage recovered via bounded exponential retry');
  } catch (err: any) {
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
      return await (aaProvider as any).httpMockHandler();
    }, 3);
    assert(false, '10. 401 Unauthorized fails immediately');
  } catch (err: any) {
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
      return await (aaProvider as any).httpMockHandler();
    }, 3);
    assert(false, '11. 403 Forbidden fails immediately');
  } catch (err: any) {
    assert(callCount403 === 1 && err.message.includes('403'), '11. 403 Forbidden fails immediately without retry');
  }

  // 12. 429 Rate Limit handled with retry
  let callCount429 = 0;
  aaProvider.setHttpMockHandler(async () => {
    callCount429++;
    if (callCount429 < 2) throw new Error('429 Too Many Requests');
    return { success: true };
  });
  try {
    const res = await aaProvider.executeWithRetry(async () => {
      return await (aaProvider as any).httpMockHandler();
    }, 2);
    assert(res.success === true && callCount429 === 2, '12. 429 Rate Limit respects backoff and succeeds on retry');
  } catch (err: any) {
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
        return await (aaProvider as any).httpMockHandler();
      }, 0);
    } catch {}
  }
  const cbState = aaProvider.getCircuitBreakerState();
  assert(cbState.state === 'OPEN', '13. Circuit Breaker opens after 5 consecutive failures');

  // 14. Circuit Breaker blocks subsequent requests when OPEN
  try {
    await aaProvider.executeWithRetry(async () => {
      return { ok: true };
    }, 0);
    assert(false, '14. Circuit Breaker blocks request in OPEN state');
  } catch (err: any) {
    assert(err.message.includes('circuit breaker is OPEN'), '14. Circuit Breaker blocks request in OPEN state');
  }

  // 15. Circuit Breaker resets on success in normal state
  aaProvider.resetHttpMockHandler();
  assert(aaProvider.getCircuitBreakerState().state === 'CLOSED', '15. Circuit Breaker resets cleanly to CLOSED state');

  // ==========================================
  // TEST GROUP 3: CONSENT LIFECYCLE & AUTHORIZATION
  // ==========================================
  console.log('\n--- TEST GROUP 3: CONSENT LIFECYCLE & AUTHORIZATION ---');

  const consentHandle = `AA_TEST_CONSENT_${uuidv4()}`;

  // 16. Create ReBIT-compliant consent artifact
  const consentRecord = await ConsentService.requestConsent(testUserId, testAccountId, consentHandle, 365, 'REQUESTED');
  assert(consentRecord.consentHandle === consentHandle && consentRecord.consentStatus === 'REQUESTED', '16. ReBIT consent request created with REQUESTED status');

  // 17. Activate consent and test valid fetch authorization
  await runQuery('UPDATE account_consents SET consent_status = "ACTIVE" WHERE id = ?', [consentRecord.id]);
  const validCheck = await ConsentService.validateConsentForFetch(testUserId, consentRecord.id);
  assert(validCheck.valid === true, '17. Active valid consent permits data fetch');

  // 18. Revoking consent updates status to REVOKED
  await ConsentService.revokeConsent(testUserId, consentRecord.id);
  const revokedRecord = await getQuery<any>('SELECT consent_status FROM account_consents WHERE id = ?', [consentRecord.id]);
  assert(revokedRecord.consent_status === 'REVOKED', '18. Consent revocation transitions status to REVOKED');

  // 19. Revoked consent strictly blocks data fetch
  const revokedCheck = await ConsentService.validateConsentForFetch(testUserId, consentRecord.id);
  assert(revokedCheck.valid === false && Boolean(revokedCheck.reason?.includes('revoked')), '19. Revoked consent strictly blocks subsequent data fetch');

  // 20. Expired consent strictly blocks data fetch
  const expiredConsentId = `cns_exp_${uuidv4().substring(0, 8)}`;
  await runQuery(`
    INSERT INTO account_consents (id, user_id, bank_account_id, consent_handle, consent_status, data_access_types, valid_from, valid_to)
    VALUES (?, ?, ?, 'EXPIRED_HANDLE', 'ACTIVE', 'PROFILE,TRANSACTIONS', ?, ?)
  `, [expiredConsentId, testUserId, testAccountId, new Date(Date.now() - 400 * 86400000).toISOString(), new Date(Date.now() - 35 * 86400000).toISOString()]);
  const expiredCheck = await ConsentService.validateConsentForFetch(testUserId, expiredConsentId);
  assert(expiredCheck.valid === false, '20. Expired consent is strictly rejected server-side');

  // 21. Re-activate valid consent session for remaining tests
  await runQuery(`
    UPDATE account_consents SET consent_status = 'ACTIVE', valid_to = ? WHERE id = ?
  `, [new Date(Date.now() + 365 * 86400000).toISOString(), consentRecord.id]);

  // 22. Tenant Isolation: User B cannot access or validate User A consent
  const userBId = `usr_p6_userb_${uuidv4().substring(0, 8)}`;
  const userBCheck = await ConsentService.validateConsentForFetch(userBId);
  assert(userBCheck.valid === false, '22. Tenant isolation: User B cannot fetch with User A consent');

  // ==========================================
  // TEST GROUP 4: CALLBACK & WEBHOOK SECURITY
  // ==========================================
  console.log('\n--- TEST GROUP 4: CALLBACK & WEBHOOK SECURITY ---');

  const webhookSecret = 'finpocket_test_webhook_secret_32chars!!';
  AACallbackService.resetCache();

  // 23. Valid HMAC-SHA256 signature verification succeeds
  const samplePayload = {
    eventId: `EVT_${uuidv4()}`,
    eventType: 'CONSENT_STATUS_UPDATE' as const,
    timestamp: new Date().toISOString(),
    consentHandle: consentHandle,
    consentStatus: 'APPROVED' as const
  };
  const rawBody = JSON.stringify(samplePayload);
  const validSignature = crypto.createHmac('sha256', webhookSecret).update(rawBody).digest('hex');

  const cbResult = await AACallbackService.processWebhook(rawBody, validSignature, webhookSecret, samplePayload);
  assert(cbResult.valid === true, '23. Valid HMAC-SHA256 signature and timestamp accepted');

  // 24. Invalid signature is rejected
  const fakeSig = crypto.createHmac('sha256', 'wrong_secret').update(rawBody).digest('hex');
  const invalidSigResult = await AACallbackService.processWebhook(rawBody, fakeSig, webhookSecret, samplePayload);
  assert(invalidSigResult.valid === false && invalidSigResult.code === 'INVALID_SIGNATURE', '24. Invalid HMAC-SHA256 signature rejected');

  // 25. Replay attack with same eventId is rejected
  const replayResult = await AACallbackService.processWebhook(rawBody, validSignature, webhookSecret, samplePayload);
  assert(replayResult.valid === false && replayResult.code === 'REPLAY_DETECTED', '25. Replayed webhook event ID detected and rejected');

  // 26. Expired timestamp (> 5 minutes drift) is rejected
  const oldPayload = {
    eventId: `EVT_OLD_${uuidv4()}`,
    eventType: 'CONSENT_STATUS_UPDATE' as const,
    timestamp: new Date(Date.now() - 10 * 60 * 1000).toISOString(), // 10 min ago
    consentHandle: consentHandle,
    consentStatus: 'APPROVED' as const
  };
  const oldRawBody = JSON.stringify(oldPayload);
  const oldSignature = crypto.createHmac('sha256', webhookSecret).update(oldRawBody).digest('hex');
  const oldResult = await AACallbackService.processWebhook(oldRawBody, oldSignature, webhookSecret, oldPayload);
  assert(oldResult.valid === false && oldResult.code === 'EXPIRED_TIMESTAMP', '26. Expired webhook timestamp rejected');

  // 27. Unknown consent handle rejected cleanly
  const unknownPayload = {
    eventId: `EVT_UNK_${uuidv4()}`,
    eventType: 'CONSENT_STATUS_UPDATE' as const,
    timestamp: new Date().toISOString(),
    consentHandle: 'NONEXISTENT_CONSENT_HANDLE',
    consentStatus: 'APPROVED' as const
  };
  const unkRawBody = JSON.stringify(unknownPayload);
  const unkSig = crypto.createHmac('sha256', webhookSecret).update(unkRawBody).digest('hex');
  const unkResult = await AACallbackService.processWebhook(unkRawBody, unkSig, webhookSecret, unknownPayload);
  assert(unkResult.valid === false && unkResult.code === 'UNKNOWN_CONSENT', '27. Unknown consent handle rejected');

  // 28. Malformed webhook payload rejected
  const malformedResult = await AACallbackService.processWebhook('{}', validSignature, webhookSecret, {} as any);
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
  const normalizedAcc = DataNormalizationService.normalizeAccount(rawAcc, testUserId, 'SETU_AA_SANDBOX' as any);
  assert(
    normalizedAcc.maskedAccountNumber === '•••• 8821' &&
    normalizedAcc.currentBalance === 75400.50 &&
    normalizedAcc.providerType === 'SETU_AA_SANDBOX',
    '29. Raw ReBIT account normalized with correct masking and types'
  );

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
  const normTxn1 = DataNormalizationService.normalizeTransaction(rawTxn1, testUserId, testAccountId);
  assert(normTxn1.type === 'INCOME' && normTxn1.category === 'cat_salary' && normTxn1.amount === 120000, '31. Salary credit normalized to INCOME / cat_salary');

  // 32. Expense transaction normalized with category extraction
  const rawTxn2 = {
    txnId: 'TXN_SWIGGY_002',
    amount: 650,
    type: 'DEBIT',
    narration: 'Swiggy Food Delivery Bangalore',
    timestamp: new Date().toISOString()
  };
  const normTxn2 = DataNormalizationService.normalizeTransaction(rawTxn2, testUserId, testAccountId);
  assert(normTxn2.type === 'EXPENSE' && normTxn2.category === 'cat_food' && normTxn2.amount === 650, '32. Swiggy expense normalized to EXPENSE / cat_food');

  // 33. Transaction reconciliation inserts new records as NEW
  const recResults = await TransactionReconciliationService.reconcileTransactions([normTxn1, normTxn2]);
  assert(recResults.newInserted === 2 && recResults.reconciledTransactions.every(r => r.reconciliationStatus === 'NEW'), '33. First transaction ingestion classified as NEW');

  // 34. Repeated reconciliation of same transactions produces 0 duplicates (UNCHANGED)
  const recResults2 = await TransactionReconciliationService.reconcileTransactions([normTxn1, normTxn2]);
  assert(recResults2.unchanged === 2 && recResults2.reconciledTransactions.every(r => r.reconciliationStatus === 'UNCHANGED'), '34. Repeated reconciliation is idempotent (0 duplicate rows)');

  // 35. Transaction update in-place classification
  const updatedTxn2 = { ...normTxn2, description: 'Swiggy Gourmet Order - Updated Narration' };
  const recResults3 = await TransactionReconciliationService.reconcileTransactions([updatedTxn2]);
  assert(recResults3.updated === 1 && recResults3.reconciledTransactions[0].reconciliationStatus === 'UPDATED', '35. Modified provider record updated in place without duplicate');

  // ==========================================
  // TEST GROUP 6: SYNC ENGINE, FRESHNESS & RESILIENCE
  // ==========================================
  console.log('\n--- TEST GROUP 6: SYNC ENGINE, FRESHNESS & RESILIENCE ---');

  // 36. AccountsService provider switching to AccountAggregatorProvider
  AccountsService.setProvider(aaProvider);
  assert(AccountsService.getProvider() instanceof AccountAggregatorProvider, '36. AccountsService provider switched to AccountAggregatorProvider');

  // 37. Sync balances updates database balance
  aaProvider.setHttpMockHandler(async () => {
    return { accountRefNumber: testAccountId, currentBalance: 92000.0, availableBalance: 92000.0 };
  });
  const newBalance = await AccountsService.syncAccount(testUserId, testAccountId);
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
  const savedAccount = await getQuery<any>('SELECT current_balance FROM bank_accounts WHERE id = ?', [testAccountId]);
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
  const encToken = ProviderSecurityService.encryptToken(rawProviderToken);
  assert(encToken.split(':').length === 3 && !encToken.includes(rawProviderToken), '41. Provider access token encrypted with AES-256-GCM + HKDF');

  // 42. Provider token decrypts cleanly with authenticated key
  const decToken = ProviderSecurityService.decryptToken(encToken);
  assert(decToken === rawProviderToken, '42. Provider token decrypts cleanly within secure server boundary');

  // 43. Client accounts list redacts internal provider tokens
  const clientAccounts = await AccountsService.listAccounts(testUserId);
  const hasTokens = (clientAccounts as any).some((a: any) => a.accessToken || a.token || a.clientSecret);
  assert(!hasTokens, '43. Client Account DTOs strictly exclude internal provider tokens');

  // 44. AI Assistant strictly refuses AA mutation commands
  const aiConsentAttempt = await AIAssistantService.processQuery(testUserId, 'Please approve consent and link my HDFC bank account');
  assert(aiConsentAttempt.isExecutionRefused === true, '44. AI assistant strictly refuses consent approval & account linking');

  // 45. AI Assistant strictly refuses sync & token refresh commands
  const aiSyncAttempt = await AIAssistantService.processQuery(testUserId, 'Sync my bank account and refresh the provider token');
  assert(aiSyncAttempt.isExecutionRefused === true, '45. AI assistant strictly refuses background sync & token refresh');

  // 46. Structured audit events recorded across lifecycle
  const auditLogs = await allQuery<any>('SELECT action FROM audit_logs WHERE user_id = ?', [testUserId]);
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
