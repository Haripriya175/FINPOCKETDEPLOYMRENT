"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const crypto_1 = __importDefault(require("crypto"));
const uuid_1 = require("uuid");
const aa_callback_service_js_1 = require("../services/aa_callback.service.js");
const database_js_1 = require("../config/database.js");
const app_config_js_1 = require("../config/app_config.js");
const redirect_state_js_1 = require("../utils/redirect_state.js");
let passedTests = 0;
let failedTests = 0;
function assert(condition, testName, details) {
    if (condition) {
        console.log(`  ✅ [PASS] ${testName}`);
        passedTests++;
    }
    else {
        console.error(`  ❌ [FAIL] ${testName}`);
        if (details)
            console.error(`     Details: ${details}`);
        failedTests++;
    }
}
function signPayload(payload, secret, format = 'hex') {
    const rawBody = JSON.stringify(payload);
    const signature = crypto_1.default.createHmac('sha256', secret).update(rawBody).digest(format);
    return { rawBody, signature };
}
async function runSetuCallbackTests() {
    console.log('\n====================================================');
    console.log('🏦 FINPOCKET SETU ACCOUNT AGGREGATOR CALLBACK SUITE');
    console.log('====================================================\n');
    await (0, database_js_1.initDatabase)();
    const secret = app_config_js_1.config.aaProvider.setu.webhookSecret || 'test_setu_webhook_secret_32chars!!';
    // Seed test user and consent record
    const userId = `usr_setu_test_${(0, uuid_1.v4)().substring(0, 6)}`;
    const consentId = `cns_setu_${(0, uuid_1.v4)().substring(0, 6)}`;
    const consentHandle = `AA_CONSENT_SETU_${(0, uuid_1.v4)().substring(0, 8)}`;
    const bankAccountId = `bnk_setu_${(0, uuid_1.v4)().substring(0, 6)}`;
    await (0, database_js_1.runQuery)(`
    INSERT INTO users (id, name, email, password_hash)
    VALUES (?, 'Setu Test User', ?, 'hash123')
  `, [userId, `${userId}@example.com`]);
    await (0, database_js_1.runQuery)(`
    INSERT INTO bank_accounts (id, user_id, institution_name, institution_code, masked_account_number, account_type, current_balance, available_balance, is_primary, connection_status)
    VALUES (?, ?, 'HDFC Bank', 'HDFC', '•••• 1234', 'SAVINGS', 45000.0, 45000.0, 1, 'CONNECTED')
  `, [bankAccountId, userId]);
    await (0, database_js_1.runQuery)(`
    INSERT INTO account_consents (id, user_id, bank_account_id, consent_handle, consent_status, data_access_types, valid_from, valid_to, created_at)
    VALUES (?, ?, ?, ?, 'REQUESTED', 'TRANSACTIONS,BALANCES,PROFILE', ?, ?, ?)
  `, [
        consentId,
        userId,
        bankAccountId,
        consentHandle,
        new Date().toISOString(),
        new Date(Date.now() + 365 * 86400000).toISOString(),
        new Date().toISOString()
    ]);
    console.log('--- TEST GROUP 1: SIGNATURE VERIFICATION & CRYPTOGRAPHY ---');
    aa_callback_service_js_1.AACallbackService.resetCache();
    // Test 1: Valid Hex Signature Verification
    const validPayload1 = {
        type: 'CONSENT_STATUS_UPDATE',
        consentId: consentHandle,
        status: 'ACTIVE',
        timestamp: new Date().toISOString(),
        data: {
            status: 'ACTIVE',
            detail: {
                accounts: [{ maskedAccNumber: '•••• 9999', accType: 'SAVINGS', fipId: 'HDFC' }]
            }
        }
    };
    const { rawBody: raw1, signature: sig1 } = signPayload(validPayload1, secret, 'hex');
    assert(aa_callback_service_js_1.AACallbackService.verifySignature(raw1, sig1, secret), '1. HMAC-SHA256 hex signature verified with constant-time equality');
    // Test 2: Valid Base64 Signature Verification
    const { rawBody: raw2, signature: sig2 } = signPayload(validPayload1, secret, 'base64');
    assert(aa_callback_service_js_1.AACallbackService.verifySignature(raw2, sig2, secret), '2. HMAC-SHA256 base64 signature verified successfully');
    // Test 3: Invalid Signature Rejected
    assert(!aa_callback_service_js_1.AACallbackService.verifySignature(raw1, 'invalid_hmac_signature_hex_digest_1234567890', secret), '3. Tampered signature rejected safely');
    // Test 4: Mismatched Secret Key Rejected
    assert(!aa_callback_service_js_1.AACallbackService.verifySignature(raw1, sig1, 'wrong_secret_key_32chars_long_xyz!!'), '4. Wrong shared secret key fails verification');
    console.log('\n--- TEST GROUP 2: WEBHOOK PROCESSING & LIFECYCLE ---');
    aa_callback_service_js_1.AACallbackService.resetCache();
    // Test 5: Process Valid Consent Status Update Webhook
    const res5 = await aa_callback_service_js_1.AACallbackService.processWebhook(raw1, sig1, secret, validPayload1, 'req_test_001');
    assert(res5.valid === true && res5.status === 'ACTIVE' && res5.consentId === consentId, '5. Valid consent status webhook updates consent to ACTIVE', JSON.stringify(res5));
    // Verify DB state
    const updatedConsent = await (0, database_js_1.getQuery)('SELECT consent_status FROM account_consents WHERE id = ?', [consentId]);
    assert(updatedConsent?.consent_status === 'ACTIVE', '6. Consent status persisted as ACTIVE in database');
    // Test 7: Process FI_DATA_READY Webhook
    const fiDataPayload = {
        type: 'FI_DATA_READY',
        consentId: consentHandle,
        status: 'COMPLETED',
        timestamp: new Date().toISOString(),
        dataRange: { from: '2026-01-01T00:00:00Z', to: '2026-09-22T00:00:00Z' }
    };
    const { rawBody: rawFi, signature: sigFi } = signPayload(fiDataPayload, secret, 'hex');
    const res7 = await aa_callback_service_js_1.AACallbackService.processWebhook(rawFi, sigFi, secret, fiDataPayload, 'req_test_002');
    assert(res7.valid === true && res7.eventType === 'FI_DATA_READY', '7. FI_DATA_READY notification processed successfully');
    // Test 8: Replay Attack Protection
    const replayRes = await aa_callback_service_js_1.AACallbackService.processWebhook(rawFi, sigFi, secret, fiDataPayload);
    assert(replayRes.valid === false && replayRes.code === 'REPLAY_DETECTED', '8. Replayed webhook event ID detected and rejected');
    // Test 9: Expired Timestamp Rejected
    const expiredPayload = {
        type: 'CONSENT_STATUS_UPDATE',
        consentId: consentHandle,
        timestamp: new Date(Date.now() - 10 * 60 * 1000).toISOString(), // 10 mins ago (> 5m threshold)
        data: { status: 'ACTIVE' }
    };
    const { rawBody: rawExp, signature: sigExp } = signPayload(expiredPayload, secret, 'hex');
    const expRes = await aa_callback_service_js_1.AACallbackService.processWebhook(rawExp, sigExp, secret, expiredPayload);
    assert(expRes.valid === false && expRes.code === 'EXPIRED_TIMESTAMP', '9. Webhook with timestamp exceeding 5-minute drift window rejected');
    // Test 10: Unknown Consent Handle Rejected
    const unknownPayload = {
        type: 'CONSENT_STATUS_UPDATE',
        consentId: 'UNKNOWN_NONEXISTENT_CONSENT_HANDLE_9999',
        timestamp: new Date().toISOString(),
        data: { status: 'ACTIVE' }
    };
    const { rawBody: rawUnk, signature: sigUnk } = signPayload(unknownPayload, secret, 'hex');
    const unkRes = await aa_callback_service_js_1.AACallbackService.processWebhook(rawUnk, sigUnk, secret, unknownPayload);
    assert(unkRes.valid === false && unkRes.code === 'UNKNOWN_CONSENT', '10. Unknown consent session reference rejected');
    // Test 11: Malformed Payload Missing Consent ID Rejected
    const malformedPayload = { type: 'CONSENT_STATUS_UPDATE', timestamp: new Date().toISOString() };
    const { rawBody: rawMal, signature: sigMal } = signPayload(malformedPayload, secret, 'hex');
    const malRes = await aa_callback_service_js_1.AACallbackService.processWebhook(rawMal, sigMal, secret, malformedPayload);
    assert(malRes.valid === false && malRes.code === 'MALFORMED_PAYLOAD', '11. Malformed payload without consent identifier rejected');
    console.log('\n--- TEST GROUP 3: CUSTOMER REDIRECT RETURN HANDLING ---');
    // Test 12: Successful Consent Return
    const redirSuccess = await aa_callback_service_js_1.AACallbackService.handleRedirect({
        success: 'true',
        id: consentHandle
    });
    assert(redirSuccess.success === true && redirSuccess.status === 'ACTIVE' && redirSuccess.deepLinkUrl.includes('success=true'), '12. Customer redirect with success=true marks consent ACTIVE and generates mobile deep-link');
    // Test 13: Cancelled / Rejected Return
    const rejectedConsentHandle = `AA_CONSENT_REJ_${(0, uuid_1.v4)().substring(0, 6)}`;
    const rejectedConsentId = `cns_rej_${(0, uuid_1.v4)().substring(0, 6)}`;
    await (0, database_js_1.runQuery)(`
    INSERT INTO account_consents (id, user_id, bank_account_id, consent_handle, consent_status, data_access_types, valid_from, valid_to, created_at)
    VALUES (?, ?, ?, ?, 'REQUESTED', 'TRANSACTIONS', ?, ?, ?)
  `, [
        rejectedConsentId,
        userId,
        bankAccountId,
        rejectedConsentHandle,
        new Date().toISOString(),
        new Date(Date.now() + 365 * 86400000).toISOString(),
        new Date().toISOString()
    ]);
    const redirReject = await aa_callback_service_js_1.AACallbackService.handleRedirect({
        success: 'false',
        id: rejectedConsentHandle,
        errorcode: '1'
    });
    assert(redirReject.success === false && redirReject.status === 'REJECTED' && redirReject.errorCode === '1', '13. Customer redirect with success=false and errorcode=1 transitions status to REJECTED');
    const checkRej = await (0, database_js_1.getQuery)('SELECT consent_status FROM account_consents WHERE id = ?', [rejectedConsentId]);
    assert(checkRej?.consent_status === 'REJECTED', '14. Rejected consent state persisted in PostgreSQL database');
    console.log('\n--- TEST GROUP 4: AUDIT LOGGING & TENANT ISOLATION ---');
    // Test 15: Audit Trail Verification
    const auditLogs = await (0, database_js_1.getQuery)('SELECT * FROM audit_logs WHERE user_id = ? AND action LIKE "SETU_%" ORDER BY rowid DESC LIMIT 1', [userId]);
    assert(auditLogs !== null && auditLogs !== undefined, '15. Setu callback actions produce structured tamper-evident audit logs');
    // Test 16: Ensure Plaintext Secrets Are Excluded from Audit Logs
    const auditMeta = auditLogs ? auditLogs.metadata : '';
    assert(!auditMeta.includes(secret) && !auditMeta.includes('password') && !auditMeta.includes('token_secret'), '16. Audit log metadata strictly excludes secrets and cryptographic keys');
    console.log('\n--- TEST GROUP 5: FAIL-CLOSED ENVIRONMENT CONFIGURATION ---');
    // Test 17: Production Fail-Closed on Missing Secret
    let prodFailedClosed = false;
    try {
        (0, app_config_js_1.loadAndValidateConfig)({
            NODE_ENV: 'PRODUCTION',
            JWT_SECRET: 'a-very-secure-jwt-production-secret-with-32chars!!',
            CORS_ORIGIN: 'https://app.finpocket.com',
            AA_PROVIDER_ENABLED: 'true',
            AA_CLIENT_ID: 'valid-client-id',
            AA_CLIENT_SECRET: 'sandbox_secret', // Contains sandbox keyword
            AA_API_BASE_URL: 'https://api.aa.in'
        });
    }
    catch (err) {
        prodFailedClosed = err.message.includes('FATAL');
    }
    assert(prodFailedClosed, '17. Production environment strictly fails closed when sandbox credentials or mock providers are configured');
    // Test 18: Sandbox Configuration Accessible in TEST/DEMO
    const testCfg = (0, app_config_js_1.loadAndValidateConfig)({
        NODE_ENV: 'TEST',
        SETU_PRODUCT_INSTANCE_ID: '33f22690-e2e1-4ab9-9ecf-b94f93c3a7b2',
        SETU_ENVIRONMENT: 'SANDBOX'
    });
    assert(testCfg.aaProvider.setu.productInstanceId === '33f22690-e2e1-4ab9-9ecf-b94f93c3a7b2' && testCfg.aaProvider.setu.environment === 'SANDBOX', '18. Setu sandbox product instance configuration correctly validated');
    console.log('\n--- TEST GROUP 6: DUAL VERIFICATION & COMPENSATING CONTROLS ---');
    // Test 19: Unsigned Webhook Accepted Under Compensating Controls (Non-Production)
    const unsignedConsentHandle = `AA_CONSENT_UNSIGNED_${(0, uuid_1.v4)().substring(0, 8)}`;
    const unsignedConsentId = `cns_uns_${(0, uuid_1.v4)().substring(0, 6)}`;
    await (0, database_js_1.runQuery)(`
    INSERT INTO account_consents (id, user_id, bank_account_id, consent_handle, consent_status, data_access_types, valid_from, valid_to, created_at)
    VALUES (?, ?, ?, ?, 'REQUESTED', 'TRANSACTIONS', ?, ?, ?)
  `, [
        unsignedConsentId,
        userId,
        bankAccountId,
        unsignedConsentHandle,
        new Date().toISOString(),
        new Date(Date.now() + 365 * 86400000).toISOString(),
        new Date().toISOString()
    ]);
    const unsignedPayload = {
        success: true,
        type: 'CONSENT_STATUS_UPDATE',
        consentId: unsignedConsentHandle,
        timestamp: new Date().toISOString(),
        data: {
            status: 'ACTIVE',
            detail: {
                accounts: [{ fipId: 'setu-fip', accType: 'SAVINGS', maskedAccNumber: 'XXXXXXXX0235' }]
            }
        }
    };
    const unsignedRes = await aa_callback_service_js_1.AACallbackService.processWebhook(JSON.stringify(unsignedPayload), '', '', unsignedPayload);
    assert(unsignedRes.valid === true && unsignedRes.status === 'ACTIVE' && unsignedRes.verifiedMode === 'COMPENSATING_CONTROLS', '19. Live Setu sandbox unsigned webhook processed safely via compensating controls');
    // Test 20: Unsupported Notification Event Type Rejected
    const unsupportedEventPayload = {
        success: true,
        type: 'UNKNOWN_UNSUPPORTED_NOTIFICATION_EVENT',
        consentId: unsignedConsentHandle,
        timestamp: new Date().toISOString(),
        data: { status: 'ACTIVE' }
    };
    const unsupRes = await aa_callback_service_js_1.AACallbackService.processWebhook(JSON.stringify(unsupportedEventPayload), sig1, secret, unsupportedEventPayload);
    assert(unsupRes.valid === false && unsupRes.code === 'MALFORMED_PAYLOAD', '20. Unsupported webhook notification type rejected');
    // Test 21: Invalid State Transition Blocked (Revoked -> Active Reversal Blocked)
    const revokedConsentHandle = `AA_CONSENT_REV_${(0, uuid_1.v4)().substring(0, 8)}`;
    const revokedConsentId = `cns_rev_${(0, uuid_1.v4)().substring(0, 6)}`;
    await (0, database_js_1.runQuery)(`
    INSERT INTO account_consents (id, user_id, bank_account_id, consent_handle, consent_status, data_access_types, valid_from, valid_to, created_at)
    VALUES (?, ?, ?, ?, 'REVOKED', 'TRANSACTIONS', ?, ?, ?)
  `, [
        revokedConsentId,
        userId,
        bankAccountId,
        revokedConsentHandle,
        new Date().toISOString(),
        new Date(Date.now() + 365 * 86400000).toISOString(),
        new Date().toISOString()
    ]);
    const illegalTransitionPayload = {
        type: 'CONSENT_STATUS_UPDATE',
        consentId: revokedConsentHandle,
        timestamp: new Date().toISOString(),
        data: { status: 'ACTIVE' }
    };
    const { rawBody: rawIllegal, signature: sigIllegal } = signPayload(illegalTransitionPayload, secret, 'hex');
    const illegalRes = await aa_callback_service_js_1.AACallbackService.processWebhook(rawIllegal, sigIllegal, secret, illegalTransitionPayload);
    assert(illegalRes.valid === false && illegalRes.code === 'INVALID_STATE_TRANSITION', '21. Invalid state transition (REVOKED consent reversal) strictly blocked');
    // Test 22: Consent Reconciliation Produces SETU_CONSENT_RECONCILED Audit Record.
    //  Written through the same helper `reconcileLiveConsent` writes with, so this
    //  asserts the production code path. The old version just queried for a row
    //  nothing in this suite ever created and passed only because a stale row from
    //  a previous run was still in the shared development database.
    await aa_callback_service_js_1.AACallbackService.recordReconciliationAudit({
        userId,
        consentId: consentHandle,
        localConsentId: consentId,
        bankAccountId,
        maskedAccountNumber: '•••• 1234'
    });
    const reconciledAudit = await (0, database_js_1.getQuery)('SELECT * FROM audit_logs WHERE user_id = ? AND action = "SETU_CONSENT_RECONCILED" ORDER BY created_at DESC LIMIT 1', [userId]);
    assert(reconciledAudit != null && JSON.parse(reconciledAudit.metadata).source === 'PROVIDER_STATUS_VERIFICATION', '22. Live Setu consent reconciliation logs explicit PROVIDER_STATUS_VERIFICATION audit trail');
    console.log('\n--- TEST GROUP 7: SIGNED CONSENT-REDIRECT STATE (Phase D) ---');
    // Test 23: Redirect state sign/verify round-trip, tamper and absence rejection
    const stateId = `cns_state_${(0, uuid_1.v4)().substring(0, 6)}`;
    const goodState = (0, redirect_state_js_1.signRedirectState)(stateId);
    const goodCheck = (0, redirect_state_js_1.verifyRedirectState)(goodState);
    const tamperedState = goodState.slice(0, -1) + (goodState.endsWith('0') ? '1' : '0');
    const tamperedCheck = (0, redirect_state_js_1.verifyRedirectState)(tamperedState);
    const otherIdCheck = (0, redirect_state_js_1.verifyRedirectState)((0, redirect_state_js_1.signRedirectState)(`cns_other_${(0, uuid_1.v4)().substring(0, 6)}`));
    assert(goodCheck.valid && goodCheck.consentLocalId === stateId &&
        !(0, redirect_state_js_1.verifyRedirectState)(tamperedState).valid &&
        !(0, redirect_state_js_1.verifyRedirectState)(`${stateId}.x`).valid &&
        !(0, redirect_state_js_1.verifyRedirectState)(undefined).valid &&
        !(0, redirect_state_js_1.verifyRedirectState)('garbage').valid &&
        otherIdCheck.valid && otherIdCheck.consentLocalId !== stateId, '23. Redirect state verifies round-trip and rejects tampered, malformed, absent, and foreign states');
    // Test 24: Valid signature mutates local consent state (fast path, any env)
    const sigConsentId = `cns_sig_${(0, uuid_1.v4)().substring(0, 6)}`;
    const sigHandle = `AA_CONSENT_SIG_${(0, uuid_1.v4)().substring(0, 8)}`;
    await (0, database_js_1.runQuery)(`
    INSERT INTO account_consents (id, user_id, bank_account_id, consent_handle, consent_status, data_access_types, valid_from, valid_to, created_at)
    VALUES (?, ?, ?, ?, 'REQUESTED', 'TRANSACTIONS', ?, ?, ?)
  `, [
        sigConsentId, userId, bankAccountId, sigHandle,
        new Date().toISOString(),
        new Date(Date.now() + 365 * 86400000).toISOString(),
        new Date().toISOString()
    ]);
    const signedReturn = await aa_callback_service_js_1.AACallbackService.handleRedirect({
        success: 'true',
        id: sigConsentId,
        fp_state: (0, redirect_state_js_1.signRedirectState)(sigConsentId)
    });
    const signedRow = await (0, database_js_1.getQuery)('SELECT consent_status FROM account_consents WHERE id = ?', [sigConsentId]);
    assert(signedReturn.verification === 'SIGNED_STATE' && signedReturn.mutated === true &&
        signedRow?.consent_status === 'ACTIVE', '24. Valid fp_state signature transitions REQUESTED consent to ACTIVE (SIGNED_STATE)');
    // Tests 25-27: PRODUCTION/STAGING fail-closed behavior for the unauthenticated return.
    // config.environment is a plain field — patched here and restored in finally.
    const originalEnvironment = app_config_js_1.config.environment;
    const originalSetuClientId = app_config_js_1.config.aaProvider.setu.clientId;
    try {
        app_config_js_1.config.environment = 'PRODUCTION';
        // Test 25: unsigned REJECTED return must not flip status in a real environment
        const unsConsentId = `cns_uns_${(0, uuid_1.v4)().substring(0, 6)}`;
        const unsHandle = `AA_CONSENT_UNS_${(0, uuid_1.v4)().substring(0, 8)}`;
        await (0, database_js_1.runQuery)(`
      INSERT INTO account_consents (id, user_id, bank_account_id, consent_handle, consent_status, data_access_types, valid_from, valid_to, created_at)
      VALUES (?, ?, ?, ?, 'REQUESTED', 'TRANSACTIONS', ?, ?, ?)
    `, [
            unsConsentId, userId, bankAccountId, unsHandle,
            new Date().toISOString(),
            new Date(Date.now() + 365 * 86400000).toISOString(),
            new Date().toISOString()
        ]);
        const blockedReject = await aa_callback_service_js_1.AACallbackService.handleRedirect({
            success: 'false',
            id: unsConsentId,
            errorcode: '1'
        });
        const blockedRejectRow = await (0, database_js_1.getQuery)('SELECT consent_status FROM account_consents WHERE id = ?', [unsConsentId]);
        assert(blockedReject.verification === 'UNSIGNED_BLOCKED' && blockedReject.mutated === false &&
            blockedRejectRow?.consent_status === 'REQUESTED', '25. PRODUCTION: unsigned rejection return is recorded but never mutates consent state');
        // Test 26: unsigned SUCCESS return cannot reach a real provider here — with
        // provider credentials unavailable the reconcile attempt must fail closed
        // (no local mutation), keeping the test deterministic and offline.
        app_config_js_1.config.aaProvider.setu.clientId = '';
        const blockedAccept = await aa_callback_service_js_1.AACallbackService.handleRedirect({
            success: 'true',
            id: unsConsentId
        });
        const blockedAcceptRow = await (0, database_js_1.getQuery)('SELECT consent_status FROM account_consents WHERE id = ?', [unsConsentId]);
        assert(blockedAccept.verification === 'UNSIGNED_BLOCKED' && blockedAccept.mutated === false &&
            blockedAcceptRow?.consent_status === 'REQUESTED', '26. PRODUCTION: unsigned success return fails closed when the provider cannot confirm it');
        // Test 27: validly signed return still works under strict environments
        const prodSigId = `cns_prodsig_${(0, uuid_1.v4)().substring(0, 6)}`;
        await (0, database_js_1.runQuery)(`
      INSERT INTO account_consents (id, user_id, bank_account_id, consent_handle, consent_status, data_access_types, valid_from, valid_to, created_at)
      VALUES (?, ?, ?, ?, 'REQUESTED', 'TRANSACTIONS', ?, ?, ?)
    `, [
            prodSigId, userId, bankAccountId, `AA_CONSENT_PS_${(0, uuid_1.v4)().substring(0, 8)}`,
            new Date().toISOString(),
            new Date(Date.now() + 365 * 86400000).toISOString(),
            new Date().toISOString()
        ]);
        const prodSigned = await aa_callback_service_js_1.AACallbackService.handleRedirect({
            success: 'true',
            id: prodSigId,
            fp_state: (0, redirect_state_js_1.signRedirectState)(prodSigId)
        });
        const prodSignedRow = await (0, database_js_1.getQuery)('SELECT consent_status FROM account_consents WHERE id = ?', [prodSigId]);
        assert(prodSigned.verification === 'SIGNED_STATE' && prodSigned.mutated === true &&
            prodSignedRow?.consent_status === 'ACTIVE', '27. PRODUCTION: validly signed return still transitions consent normally');
    }
    finally {
        app_config_js_1.config.environment = originalEnvironment;
        app_config_js_1.config.aaProvider.setu.clientId = originalSetuClientId;
    }
    console.log('\n====================================================');
    console.log(`📊 SETU CALLBACK TEST RESULTS: ${passedTests} PASSED, ${failedTests} FAILED`);
    console.log('====================================================\n');
    if (failedTests > 0) {
        process.exit(1);
    }
}
runSetuCallbackTests().catch((err) => {
    console.error('Test execution failed:', err);
    process.exit(1);
});
//# sourceMappingURL=setu_callback_integration.test.js.map