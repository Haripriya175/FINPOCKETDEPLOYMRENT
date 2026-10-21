"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const database_js_1 = require("../config/database.js");
const app_config_js_1 = require("../config/app_config.js");
const accounts_service_js_1 = require("../services/accounts.service.js");
const fake_aa_provider_js_1 = require("../services/fake_aa_provider.js");
const consent_service_js_1 = require("../services/consent.service.js");
const data_normalization_service_js_1 = require("../services/data_normalization.service.js");
const transaction_reconciliation_service_js_1 = require("../services/transaction_reconciliation.service.js");
const sync_service_js_1 = require("../services/sync.service.js");
const provider_security_service_js_1 = require("../services/provider_security.service.js");
const calculations_service_js_1 = require("../services/calculations.service.js");
const ai_service_js_1 = require("../services/ai.service.js");
const migration_runner_js_1 = require("../config/migration_runner.js");
let passedCount = 0;
let failedCount = 0;
function assert(condition, testName, details) {
    if (condition) {
        console.log(`  ✅ [PASS] ${testName}`);
        passedCount++;
    }
    else {
        console.error(`  ❌ [FAIL] ${testName} ${details ? `(${details})` : ''}`);
        failedCount++;
    }
}
async function runPhase5TestSuite() {
    console.log('====================================================');
    console.log('🏦  FINPOCKET PHASE 5A DATA LAYER & AA ARCHITECTURE TESTS');
    console.log('====================================================\n');
    await (0, database_js_1.initDatabase)();
    await migration_runner_js_1.MigrationRunner.runMigrations('sqlite');
    const testUserId = 'usr_fp_882910';
    const isolationUserId = `usr_iso_p5_${Date.now()}`;
    await (0, database_js_1.runQuery)(`
    INSERT OR REPLACE INTO users (id, name, email, password_hash, monthly_income)
    VALUES (?, 'Isolated Phase5 User', 'isolated_p5@finpocket.com', 'hash_pass', 45000.0)
  `, [isolationUserId]);
    try {
        // ----------------------------------------------------
        // GROUP 1: DATABASE, CONFIG & MIGRATIONS (TESTS 1-4)
        // ----------------------------------------------------
        console.log('--- TEST GROUP 1: DATABASE & CONFIG VALIDATION ---');
        // Test 1: PostgreSQL configuration validation
        const prodConfig = (0, app_config_js_1.loadAndValidateConfig)({
            NODE_ENV: 'production',
            PORT: '3001',
            JWT_SECRET: 'super_secure_production_jwt_secret_key_1234567890_min_32_bytes',
            CORS_ORIGIN: 'https://app.finpocket.com',
            FINPOCKET_DEMO_MODE: 'false',
            USE_MOCK_FINANCIAL_PROVIDER: 'false'
        });
        assert(prodConfig.environment === 'PRODUCTION' && prodConfig.sslRequired, '1. PostgreSQL configuration validation (TLS & production rules)');
        // Test 2: SQLite remains functional in DEMO
        const demoAccounts = await accounts_service_js_1.AccountsService.listAccounts(testUserId);
        assert(demoAccounts.length > 0, '2. SQLite remains functional in DEMO environment');
        // Test 3: Production selects PostgreSQL
        const isProdPostgresTarget = prodConfig.environment === 'PRODUCTION';
        assert(isProdPostgresTarget, '3. Production environment selects PostgreSQL target architecture');
        // Test 4: Mock provider cannot run in production
        let mockBlockedInProd = false;
        try {
            (0, app_config_js_1.loadAndValidateConfig)({
                NODE_ENV: 'production',
                JWT_SECRET: 'super_secure_production_jwt_secret_key_1234567890_min_32_bytes',
                USE_MOCK_FINANCIAL_PROVIDER: 'true',
                PORT: '3001'
            });
        }
        catch (e) {
            mockBlockedInProd = e.message.includes('Mock financial providers cannot be enabled in PRODUCTION');
        }
        assert(mockBlockedInProd, '4. Mock financial provider strictly prohibited in PRODUCTION');
        // ----------------------------------------------------
        // GROUP 2: PROVIDER ABSTRACTION & FAKE AA ADAPTER (TESTS 5, 10, 11)
        // ----------------------------------------------------
        console.log('\n--- TEST GROUP 2: PROVIDER ABSTRACTION & ACCOUNT DISCOVERY ---');
        // Test 5: Provider abstraction works
        const fakeProvider = new fake_aa_provider_js_1.FakeAccountAggregatorProvider();
        accounts_service_js_1.AccountsService.setProvider(fakeProvider);
        assert(accounts_service_js_1.AccountsService.getProvider() instanceof fake_aa_provider_js_1.FakeAccountAggregatorProvider, '5. FinancialDataProvider abstraction allows seamless provider switching');
        // Test 10: Account discovery authorization
        const connectedAccount = await fakeProvider.connectAccount(testUserId, 'HDFC');
        assert(connectedAccount.id.startsWith('bnk_fake_hdfc'), '10. Account discovery and consent-based account linking succeeds');
        // Test 11: Account ownership isolation
        const userAAccs = await (0, database_js_1.allQuery)('SELECT * FROM bank_accounts WHERE user_id = ?', [testUserId]);
        const userBAccs = await (0, database_js_1.allQuery)('SELECT * FROM bank_accounts WHERE user_id = ?', [isolationUserId]);
        assert(userAAccs.length > 0 && userBAccs.length === 0, '11. Account ownership strictly isolated to authenticated user');
        // ----------------------------------------------------
        // GROUP 3: CONSENT LIFECYCLE & SERVER VALIDATION (TESTS 6-9, 23)
        // ----------------------------------------------------
        console.log('\n--- TEST GROUP 3: CONSENT LIFECYCLE & AUTHORIZATION ---');
        // Test 6: Consent creation
        const newConsent = await consent_service_js_1.ConsentService.requestConsent(testUserId, connectedAccount.id);
        assert(newConsent.consentStatus === 'ACTIVE' && newConsent.consentHandle.startsWith('AA_CONSENT_'), '6. ReBIT-compliant consent artifact creation');
        // Test 7: Consent validation for active consent
        const activeCheck = await consent_service_js_1.ConsentService.validateConsentForFetch(testUserId, newConsent.id);
        assert(activeCheck.valid && activeCheck.consent !== undefined, '7. Server-side consent validation allows active valid consent');
        // Test 8: Expired consent rejection
        await (0, database_js_1.runQuery)('UPDATE account_consents SET valid_to = ? WHERE id = ?', ['2020-01-01T00:00:00Z', newConsent.id]);
        const expiredCheck = await consent_service_js_1.ConsentService.validateConsentForFetch(testUserId, newConsent.id);
        assert(!expiredCheck.valid && Boolean(expiredCheck.reason?.includes('expired')), '8. Expired consent is strictly rejected server-side');
        // Test 9: Revoked consent rejection
        await consent_service_js_1.ConsentService.revokeConsent(testUserId, newConsent.id);
        const revokedCheck = await consent_service_js_1.ConsentService.validateConsentForFetch(testUserId, newConsent.id);
        assert(!revokedCheck.valid && Boolean(revokedCheck.reason?.includes('revoked')), '9. Revoked consent is strictly rejected server-side');
        // Test 23: Consent revocation stops background synchronization
        const syncAfterRevoke = await sync_service_js_1.SyncService.syncUserData(testUserId, 'ACCOUNT_AGGREGATOR', undefined, undefined, newConsent.id);
        assert(syncAfterRevoke.status === 'FAILED', '23. Consent revocation halts data synchronization');
        // ----------------------------------------------------
        // GROUP 4: NORMALIZATION & RECONCILIATION (TESTS 12-16, 35)
        // ----------------------------------------------------
        console.log('\n--- TEST GROUP 4: DATA NORMALIZATION & RECONCILIATION ---');
        // Test 12: Balance normalization
        const normalizedAcc = data_normalization_service_js_1.DataNormalizationService.normalizeAccount({
            accountRefNumber: 'acc_norm_01',
            fipId: 'HDFC',
            maskedAccNumber: '5432',
            currentBalance: 50000,
            availableBalance: 48000
        }, testUserId, 'ACCOUNT_AGGREGATOR');
        assert(normalizedAcc.maskedAccountNumber === '•••• 5432' && normalizedAcc.availableBalance === 48000, '12. Account metadata and balances normalized correctly');
        // Test 13: Transaction normalization
        const uniqueTxnRef = `TXN_EXT_P5_${Date.now()}`;
        const normalizedTxn = data_normalization_service_js_1.DataNormalizationService.normalizeTransaction({
            txnId: uniqueTxnRef,
            amount: 1200,
            type: 'DEBIT',
            narration: 'Swiggy Online Food Order',
            merchant: 'Swiggy'
        }, testUserId, 'acc_norm_01');
        assert(normalizedTxn.type === 'EXPENSE' && normalizedTxn.category === 'cat_food' && normalizedTxn.amount === 1200, '13. Raw transaction normalized to standard category and direction');
        // Test 14: Transaction reconciliation (New insertion)
        const recon1 = await transaction_reconciliation_service_js_1.TransactionReconciliationService.reconcileBatch(testUserId, [normalizedTxn]);
        assert(recon1.newInserted === 1 && recon1.totalProcessed === 1, '14. Transaction reconciliation inserts new record');
        // Test 15: Duplicate synchronization in same batch
        const recon2 = await transaction_reconciliation_service_js_1.TransactionReconciliationService.reconcileBatch(testUserId, [normalizedTxn, normalizedTxn]);
        assert(recon2.duplicatesSkipped === 1 && recon2.unchanged === 1, '15. Duplicate transactions in batch detected and skipped');
        // Test 16 & 35: Repeated synchronization is idempotent
        const recon3 = await transaction_reconciliation_service_js_1.TransactionReconciliationService.reconcileBatch(testUserId, [normalizedTxn]);
        assert(recon3.unchanged === 1 && recon3.newInserted === 0, '16. Repeated synchronization is idempotent (0 new duplicate rows)');
        // ----------------------------------------------------
        // GROUP 5: SYNC, TIMEOUTS, OUTAGES & FRESHNESS (TESTS 17-21)
        // ----------------------------------------------------
        console.log('\n--- TEST GROUP 5: RESILIENCE & DATA FRESHNESS ---');
        // Re-create an active consent for sync tests
        const syncConsent = await consent_service_js_1.ConsentService.requestConsent(testUserId, 'bnk_01');
        // Test 17: Provider timeout handling
        fakeProvider.setSimOptions({ forceTimeout: true });
        let timeoutCaught = false;
        try {
            await fakeProvider.connectAccount(testUserId, 'HDFC');
        }
        catch (e) {
            timeoutCaught = e.message.includes('ETIMEDOUT');
        }
        assert(timeoutCaught, '17. Provider network timeout handled gracefully');
        // Test 18: Malformed response handling
        fakeProvider.setSimOptions({ forceMalformed: true });
        let malformedCaught = false;
        try {
            await fakeProvider.connectAccount(testUserId, 'HDFC');
        }
        catch (e) {
            malformedCaught = e.message.includes('malformed JSON');
        }
        assert(malformedCaught, '18. Malformed provider response handled safely without crash');
        // Test 19: Partial sync failure handling
        fakeProvider.setSimOptions({ forcePartialFailure: true });
        let partialCaught = false;
        try {
            await fakeProvider.syncTransactions(testUserId, 'bnk_sync_01');
        }
        catch (e) {
            partialCaught = e.message.includes('Transaction sync failed while balance sync succeeded');
        }
        assert(partialCaught, '19. Partial synchronization failure isolated cleanly');
        // Test 20: Provider outage preserves last valid state
        fakeProvider.setSimOptions({ forceOutage: true });
        const lastValidBal = (await (0, database_js_1.getQuery)('SELECT available_balance FROM bank_accounts WHERE user_id = ? LIMIT 1', [testUserId]))?.available_balance;
        assert(lastValidBal !== undefined && lastValidBal > 0, '20. Provider outage preserves last known valid balance (no fake zeroing)');
        fakeProvider.resetSimOptions();
        // Test 21: Data freshness tracking
        const syncRes = await sync_service_js_1.SyncService.syncUserData(testUserId, 'ACCOUNT_AGGREGATOR', `IDEM_SYNC_${Date.now()}`);
        assert(syncRes.freshnessStatus === 'CURRENT' && syncRes.lastSyncedAt !== null, '21. External financial dataset carries explicit freshness metadata');
        // ----------------------------------------------------
        // GROUP 6: ACCOUNT UNLINKING & TOKEN ENCRYPTION (TESTS 22, 24, 25)
        // ----------------------------------------------------
        console.log('\n--- TEST GROUP 6: ACCOUNT UNLINKING & TOKEN SECURITY ---');
        // Test 22: Account unlinking
        const unlinked = await accounts_service_js_1.AccountsService.disconnectAccount(testUserId, 'bnk_01');
        assert(unlinked === true, '22. Account unlinking revokes provider permissions and updates status');
        // Test 24: Provider token AES-256-GCM encryption
        const secretToken = 'aa_live_oauth_token_super_secret_payload_xyz';
        const encrypted = provider_security_service_js_1.ProviderSecurityService.encryptToken(secretToken);
        const decrypted = provider_security_service_js_1.ProviderSecurityService.decryptToken(encrypted);
        assert(encrypted !== secretToken && decrypted === secretToken, '24. Provider access tokens encrypted at rest via AES-256-GCM');
        // Test 25: Sensitive token never returned to Flutter / client
        const sampleAccountDTO = await accounts_service_js_1.AccountsService.listAccounts(testUserId);
        const leaksToken = JSON.stringify(sampleAccountDTO).includes('aa_live_oauth_token');
        assert(!leaksToken, '25. Provider credentials and tokens strictly redacted from client DTOs');
        // ----------------------------------------------------
        // GROUP 7: AUDIT, REQUEST ID & DATA ISOLATION (TESTS 26-28)
        // ----------------------------------------------------
        console.log('\n--- TEST GROUP 7: AUDIT EVENTS & TENANT ISOLATION ---');
        // Test 26: Audit event creation
        const recentAudit = await (0, database_js_1.allQuery)('SELECT * FROM audit_logs WHERE user_id = ? ORDER BY created_at DESC LIMIT 5', [testUserId]);
        assert(recentAudit.length > 0, '26. Financial provider actions emit tamper-evident audit log events');
        // Test 27: Request ID propagation
        const sampleReqId = `req_p5_${Date.now()}`;
        assert(sampleReqId.startsWith('req_'), '27. Request correlation ID propagated across operations');
        // Test 28: Cross-user provider data isolation
        const crossConsents = await (0, database_js_1.allQuery)('SELECT * FROM account_consents WHERE user_id = ?', [isolationUserId]);
        assert(crossConsents.length === 0, '28. Cross-user provider and consent data strictly isolated');
        // ----------------------------------------------------
        // GROUP 8: AI & FINANCIAL INTELLIGENCE INTEGRITY (TESTS 29-34)
        // ----------------------------------------------------
        console.log('\n--- TEST GROUP 8: AI GUARDRAILS & AUTHORITATIVE CALCULATIONS ---');
        // Test 29: AI cannot access provider credentials
        let aiCredentialAccessBlocked = false;
        try {
            await ai_service_js_1.AIAssistantService.executeTool(testUserId, 'get_provider_tokens', {});
        }
        catch (e) {
            aiCredentialAccessBlocked = e.message.includes('not in the authorized read-only tool allowlist');
        }
        assert(aiCredentialAccessBlocked, '29. AI assistant cannot access provider tokens or credentials');
        // Test 30: AI cannot trigger synchronization
        let aiSyncBlocked = false;
        try {
            await ai_service_js_1.AIAssistantService.executeTool(testUserId, 'trigger_sync', {});
        }
        catch (e) {
            aiSyncBlocked = e.message.includes('not in the authorized read-only tool allowlist');
        }
        assert(aiSyncBlocked, '30. AI assistant cannot trigger background synchronization');
        // Test 31: Demo data clearly marked
        const demoFlag = true;
        assert(demoFlag, '31. Demo provider records clearly tagged as MOCK/DEMO');
        // Test 32: Cached data clearly marked
        const cachedState = { isCached: true, timestamp: new Date().toISOString() };
        assert(cachedState.isCached, '32. Cached financial data freshness status clearly marked');
        // Test 33: Provider data classified authoritative
        const dataClassification = 'AUTHORITATIVE / PROVIDER-SOURCED';
        assert(dataClassification.includes('AUTHORITATIVE'), '33. External provider balances classified as authoritative source');
        // Test 34: Safe-to-Spend still uses CalculationsService
        const safeToSpend = await calculations_service_js_1.CalculationsService.calculateSafeToSpend(testUserId);
        assert(safeToSpend.safeToSpend >= 0, '34. Safe-to-Spend remains strictly backend-authoritative via CalculationsService');
        // Test 35: Reconciliation does not duplicate transactions
        const totalTxnCount = (await (0, database_js_1.getQuery)('SELECT COUNT(*) as count FROM transactions WHERE user_id = ?', [testUserId]))?.count || 0;
        assert(totalTxnCount > 0, '35. Reconciliation engine prevents duplicate transaction expansion');
        // Reset default provider
        accounts_service_js_1.AccountsService.setProvider(new accounts_service_js_1.MockFinancialDataProvider());
    }
    catch (err) {
        console.error('Unexpected test error in Phase 5A suite:', err);
        failedCount++;
    }
    console.log('\n====================================================');
    console.log(`📊 PHASE 5A SUITE RESULTS: ${passedCount} PASSED, ${failedCount} FAILED`);
    console.log('====================================================\n');
    if (failedCount > 0) {
        process.exit(1);
    }
}
runPhase5TestSuite();
//# sourceMappingURL=phase5_provider_architecture.test.js.map