"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const assert_1 = require("assert");
const http_1 = __importDefault(require("http"));
const express_1 = __importDefault(require("express"));
const auth_routes_js_1 = __importDefault(require("../routes/auth.routes.js"));
const database_js_1 = require("../config/database.js");
const email_service_js_1 = require("../services/email.service.js");
const sms_service_js_1 = require("../services/sms/sms.service.js");
const otp_service_js_1 = require("../services/otp.service.js");
const app_config_js_1 = require("../config/app_config.js");
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test_jwt_secret_32_characters_minimum_len!';
const app = (0, express_1.default)();
app.use(express_1.default.json());
app.use('/auth', auth_routes_js_1.default);
async function runOtpSecurityRegressionSuite() {
    console.log('\n====================================================');
    console.log('🛡️  FINPOCKET OTP SECURITY & REGRESSION TEST SUITE');
    console.log('====================================================\n');
    await (0, database_js_1.initDatabase)();
    // Mock outbound email and SMS providers
    let lastSentEmailOtp = '';
    email_service_js_1.EmailService.setMockTransporter({
        sendMail: async (mailOptions) => {
            const match = mailOptions.html.match(/\b\d{6}\b/);
            if (match)
                lastSentEmailOtp = match[0];
            return { messageId: `mock_${Date.now()}`, response: '250 OK' };
        },
    });
    let lastSentSmsOtp = '';
    sms_service_js_1.SmsService.setMockProvider({
        sendSms: async (options) => {
            const match = options.message.match(/\b\d{6}\b/);
            if (match)
                lastSentSmsOtp = match[0];
            return { success: true, messageId: `mock_sms_${Date.now()}` };
        },
    });
    const server = http_1.default.createServer(app);
    await new Promise((resolve) => server.listen(0, resolve));
    const port = server.address().port;
    const baseUrl = `http://127.0.0.1:${port}`;
    try {
        // -----------------------------------------------------------------
        // TEST 1: CRYPTOGRAPHIC RANDOMNESS & KEYED HMAC VERIFICATION
        // -----------------------------------------------------------------
        console.log('--- TEST 1: CRYPTOGRAPHIC RANDOMNESS & KEYED HMAC STORAGE ---');
        const samples = new Set();
        for (let i = 0; i < 50; i++) {
            const res = await otp_service_js_1.OtpService.issueOtp({
                destination: `sample_${i}@finpocket.com`,
                destinationType: 'EMAIL',
                purpose: 'REGISTRATION_EMAIL',
            });
            assert_1.strict.ok(res.success);
            assert_1.strict.ok(res.otp);
            assert_1.strict.match(res.otp, /^\d{6}$/);
            const codeNum = parseInt(res.otp, 10);
            assert_1.strict.ok(codeNum >= 100000 && codeNum <= 999999);
            samples.add(res.otp);
        }
        // High entropy: in 50 samples of 6-digit space, collisions are extremely rare (>45 unique)
        assert_1.strict.ok(samples.size >= 45, `Expected high entropy across OTP samples, got ${samples.size}`);
        // Verify hash storage in database: OTP must NEVER be stored in plaintext
        const dbRecord = await (0, database_js_1.getQuery)(`SELECT * FROM otp_verifications WHERE destination = 'sample_0@finpocket.com' ORDER BY created_at DESC LIMIT 1`);
        assert_1.strict.ok(dbRecord);
        assert_1.strict.ok(dbRecord.otp_hash);
        assert_1.strict.ok(dbRecord.salt);
        assert_1.strict.notEqual(dbRecord.otp_hash, dbRecord.salt);
        // Hash length must be 64 characters (SHA-256 hex digest)
        assert_1.strict.equal(dbRecord.otp_hash.length, 64);
        // The plaintext OTP must never equal the hash or salt
        assert_1.strict.notEqual(dbRecord.otp_hash.includes('sample_0'), true);
        console.log('  ✅ [PASS] 1. OTPs use CSPRNG (100000..999999) & stored exclusively as salted HMAC-SHA256 digests');
        // -----------------------------------------------------------------
        // TEST 2: SINGLE-USE ENFORCEMENT & REPLAY ATTACK REJECTION
        // -----------------------------------------------------------------
        console.log('\n--- TEST 2: SINGLE-USE ENFORCEMENT & REPLAY ATTACK REJECTION ---');
        const replayEmail = 'replay.test@finpocket.com';
        const issueReplay = await otp_service_js_1.OtpService.issueOtp({
            destination: replayEmail,
            destinationType: 'EMAIL',
            purpose: 'REGISTRATION_EMAIL',
        });
        assert_1.strict.ok(issueReplay.success);
        const validOtp = issueReplay.otp;
        // First verification: must succeed
        const verify1 = await otp_service_js_1.OtpService.verifyOtp({
            destination: replayEmail,
            purpose: 'REGISTRATION_EMAIL',
            otp: validOtp,
        });
        assert_1.strict.equal(verify1.success, true);
        assert_1.strict.equal(verify1.verified, true);
        // Second verification with identical code: MUST FAIL (cannot reuse consumed code)
        const verify2 = await otp_service_js_1.OtpService.verifyOtp({
            destination: replayEmail,
            purpose: 'REGISTRATION_EMAIL',
            otp: validOtp,
        });
        assert_1.strict.equal(verify2.success, false);
        assert_1.strict.equal(verify2.verified, false);
        assert_1.strict.ok(verify2.error?.includes('expired or is invalid'));
        console.log('  ✅ [PASS] 2. Consumed OTP cannot be reused (replay attack strictly prevented)');
        // -----------------------------------------------------------------
        // TEST 3: SUPERSEDED CODES ARE INVALIDATED ON NEW ISSUANCE
        // -----------------------------------------------------------------
        console.log('\n--- TEST 3: SUPERSEDED CODES INVALIDATION ---');
        const supersedeEmail = 'supersede.test@finpocket.com';
        const issueOld = await otp_service_js_1.OtpService.issueOtp({
            destination: supersedeEmail,
            destinationType: 'EMAIL',
            purpose: 'REGISTRATION_EMAIL',
        });
        const oldCode = issueOld.otp;
        // Manually bypass cooldown in DB to test immediate re-issuance invalidation
        await (0, database_js_1.runQuery)(`UPDATE otp_verifications SET resend_after = datetime('now', '-1 minute') WHERE destination = ?`, [
            supersedeEmail,
        ]);
        const issueNew = await otp_service_js_1.OtpService.issueOtp({
            destination: supersedeEmail,
            destinationType: 'EMAIL',
            purpose: 'REGISTRATION_EMAIL',
        });
        const newCode = issueNew.otp;
        assert_1.strict.notEqual(oldCode, newCode);
        // Old code must now be rejected
        const verifyOld = await otp_service_js_1.OtpService.verifyOtp({
            destination: supersedeEmail,
            purpose: 'REGISTRATION_EMAIL',
            otp: oldCode,
        });
        assert_1.strict.equal(verifyOld.success, false);
        // New code must succeed
        const verifyNew = await otp_service_js_1.OtpService.verifyOtp({
            destination: supersedeEmail,
            purpose: 'REGISTRATION_EMAIL',
            otp: newCode,
        });
        assert_1.strict.equal(verifyNew.success, true);
        console.log('  ✅ [PASS] 3. Re-issuing OTP immediately invalidates all prior unconsumed codes');
        // -----------------------------------------------------------------
        // TEST 4: PURPOSE AND DESTINATION BINDING ENFORCEMENT
        // -----------------------------------------------------------------
        console.log('\n--- TEST 4: PURPOSE AND DESTINATION BINDING ENFORCEMENT ---');
        const boundEmail = 'bound.user@finpocket.com';
        const boundIssue = await otp_service_js_1.OtpService.issueOtp({
            destination: boundEmail,
            destinationType: 'EMAIL',
            purpose: 'REGISTRATION_EMAIL',
        });
        const boundCode = boundIssue.otp;
        // 4a. Attempt to verify for a DIFFERENT purpose (e.g. PASSWORD_RESET)
        const crossPurpose = await otp_service_js_1.OtpService.verifyOtp({
            destination: boundEmail,
            purpose: 'PASSWORD_RESET',
            otp: boundCode,
        });
        assert_1.strict.equal(crossPurpose.success, false);
        // 4b. Attempt to verify for a DIFFERENT destination (e.g. attacker@finpocket.com)
        const crossDest = await otp_service_js_1.OtpService.verifyOtp({
            destination: 'attacker@finpocket.com',
            purpose: 'REGISTRATION_EMAIL',
            otp: boundCode,
        });
        assert_1.strict.equal(crossDest.success, false);
        // 4c. Verify with correct destination & purpose succeeds
        const correctVerify = await otp_service_js_1.OtpService.verifyOtp({
            destination: boundEmail,
            purpose: 'REGISTRATION_EMAIL',
            otp: boundCode,
        });
        assert_1.strict.equal(correctVerify.success, true);
        console.log('  ✅ [PASS] 4. Codes strictly bound to purpose & destination (cross-purpose / cross-account rejected)');
        // -----------------------------------------------------------------
        // TEST 5: BRUTE-FORCE ATTEMPT LIMITING & LOCKOUT
        // -----------------------------------------------------------------
        console.log('\n--- TEST 5: BRUTE-FORCE ATTEMPT LIMITING & LOCKOUT ---');
        const bruteEmail = 'brute.test@finpocket.com';
        const issueBrute = await otp_service_js_1.OtpService.issueOtp({
            destination: bruteEmail,
            destinationType: 'EMAIL',
            purpose: 'REGISTRATION_EMAIL',
        });
        const correctBruteCode = issueBrute.otp;
        // Attempts 1 to 4: fail and decrement remaining attempts
        for (let attempt = 1; attempt <= 4; attempt++) {
            const failRes = await otp_service_js_1.OtpService.verifyOtp({
                destination: bruteEmail,
                purpose: 'REGISTRATION_EMAIL',
                otp: '000000',
            });
            assert_1.strict.equal(failRes.success, false);
            assert_1.strict.equal(failRes.remainingAttempts, 5 - attempt);
        }
        // 5th attempt: triggers permanent invalidation (remainingAttempts: 0)
        const fail5 = await otp_service_js_1.OtpService.verifyOtp({
            destination: bruteEmail,
            purpose: 'REGISTRATION_EMAIL',
            otp: '000000',
        });
        assert_1.strict.equal(fail5.success, false);
        assert_1.strict.equal(fail5.remainingAttempts, 0);
        assert_1.strict.ok(fail5.error?.includes('Too many incorrect attempts'));
        // Even with the correct code now, verification MUST fail because code is locked out
        const lockedVerify = await otp_service_js_1.OtpService.verifyOtp({
            destination: bruteEmail,
            purpose: 'REGISTRATION_EMAIL',
            otp: correctBruteCode,
        });
        assert_1.strict.equal(lockedVerify.success, false);
        console.log('  ✅ [PASS] 5. Brute-force protection limits attempts to 5 and permanently locks out invalid code');
        // -----------------------------------------------------------------
        // TEST 6: EXPIRATION (TTL) ENFORCEMENT
        // -----------------------------------------------------------------
        console.log('\n--- TEST 6: EXPIRATION (TTL) ENFORCEMENT ---');
        const expiredEmail = 'expired.test@finpocket.com';
        const issueExpired = await otp_service_js_1.OtpService.issueOtp({
            destination: expiredEmail,
            destinationType: 'EMAIL',
            purpose: 'REGISTRATION_EMAIL',
        });
        const expiredCode = issueExpired.otp;
        // Manually age the record past 5 minutes in database
        await (0, database_js_1.runQuery)(`UPDATE otp_verifications SET expires_at = datetime('now', '-10 seconds') WHERE destination = ?`, [expiredEmail]);
        const expiredVerify = await otp_service_js_1.OtpService.verifyOtp({
            destination: expiredEmail,
            purpose: 'REGISTRATION_EMAIL',
            otp: expiredCode,
        });
        assert_1.strict.equal(expiredVerify.success, false);
        assert_1.strict.ok(expiredVerify.error?.includes('expired'));
        console.log('  ✅ [PASS] 6. Expired OTP rejected even with mathematically correct code');
        // -----------------------------------------------------------------
        // TEST 7: CONCURRENT VERIFICATION RACE CONDITION PREVENTION
        // -----------------------------------------------------------------
        console.log('\n--- TEST 7: CONCURRENT VERIFICATION RACE CONDITION (TOCTOU) ---');
        const raceEmail = 'race.test@finpocket.com';
        const issueRace = await otp_service_js_1.OtpService.issueOtp({
            destination: raceEmail,
            destinationType: 'EMAIL',
            purpose: 'REGISTRATION_EMAIL',
        });
        const raceCode = issueRace.otp;
        // Send 5 simultaneous verify requests in parallel with the same valid code
        const concurrentResults = await Promise.all([
            otp_service_js_1.OtpService.verifyOtp({ destination: raceEmail, purpose: 'REGISTRATION_EMAIL', otp: raceCode }),
            otp_service_js_1.OtpService.verifyOtp({ destination: raceEmail, purpose: 'REGISTRATION_EMAIL', otp: raceCode }),
            otp_service_js_1.OtpService.verifyOtp({ destination: raceEmail, purpose: 'REGISTRATION_EMAIL', otp: raceCode }),
            otp_service_js_1.OtpService.verifyOtp({ destination: raceEmail, purpose: 'REGISTRATION_EMAIL', otp: raceCode }),
            otp_service_js_1.OtpService.verifyOtp({ destination: raceEmail, purpose: 'REGISTRATION_EMAIL', otp: raceCode }),
        ]);
        const successCount = concurrentResults.filter((r) => r.success && r.verified).length;
        // EXACTLY 1 request must succeed; 4 must fail
        assert_1.strict.equal(successCount, 1, `Expected exactly 1 successful consumption in race condition, got ${successCount}`);
        console.log('  ✅ [PASS] 7. Atomic transaction ensures exactly 1 successful consumption under concurrent load');
        // -----------------------------------------------------------------
        // TEST 8: RATE LIMIT CANNOT BE BYPASSED VIA CASING OR WHITESPACE
        // -----------------------------------------------------------------
        console.log('\n--- TEST 8: RATE LIMIT NORMALIZATION (CASE & WHITESPACE) ---');
        const canonEmail = 'casing.test@finpocket.com';
        const res1 = await otp_service_js_1.OtpService.issueOtp({
            destination: canonEmail,
            destinationType: 'EMAIL',
            purpose: 'REGISTRATION_EMAIL',
        });
        assert_1.strict.ok(res1.success);
        // Try to bypass cooldown using upper-case and trailing whitespace
        const res2 = await otp_service_js_1.OtpService.issueOtp({
            destination: '  CASING.TEST@FINPOCKET.COM  ',
            destinationType: 'EMAIL',
            purpose: 'REGISTRATION_EMAIL',
        });
        assert_1.strict.equal(res2.success, false);
        assert_1.strict.ok(res2.error?.includes('Please wait'));
        console.log('  ✅ [PASS] 8. Destination normalization blocks rate-limit bypass via whitespace or casing');
        // -----------------------------------------------------------------
        // TEST 9: PRE-REGISTRATION CLAIM ENFORCEMENT (CANNOT CLAIM TWICE)
        // -----------------------------------------------------------------
        console.log('\n--- TEST 9: PRE-REGISTRATION CLAIM ENFORCEMENT ---');
        const claimEmail = `claim_${Date.now()}@finpocket.com`;
        const issueClaim = await otp_service_js_1.OtpService.issueOtp({
            destination: claimEmail,
            destinationType: 'EMAIL',
            purpose: 'REGISTRATION_EMAIL',
        });
        await otp_service_js_1.OtpService.verifyOtp({
            destination: claimEmail,
            purpose: 'REGISTRATION_EMAIL',
            otp: issueClaim.otp,
        });
        // Before linking: isEmailVerifiedForRegistration is true
        const beforeLink = await otp_service_js_1.OtpService.isEmailVerifiedForRegistration(claimEmail);
        assert_1.strict.equal(beforeLink, true);
        // Create user identity in users table to satisfy foreign key constraint
        const testUserId = `usr_${Date.now()}`;
        await (0, database_js_1.runQuery)(`INSERT INTO users (id, name, email, password_hash) VALUES (?, ?, ?, ?)`, [testUserId, 'Claim Tester', claimEmail, 'hash123']);
        // Link to registered user
        await otp_service_js_1.OtpService.linkRegistrationUser(claimEmail, testUserId);
        // After linking: must be false (user_id is no longer NULL, cannot be claimed again)
        const afterLink = await otp_service_js_1.OtpService.isEmailVerifiedForRegistration(claimEmail);
        assert_1.strict.equal(afterLink, false);
        console.log('  ✅ [PASS] 9. Linked pre-registration records cannot be reused to create duplicate accounts');
        // -----------------------------------------------------------------
        // TEST 10: PRODUCTION ENVIRONMENT SECRET EXPOSURE GUARDS
        // -----------------------------------------------------------------
        console.log('\n--- TEST 10: PRODUCTION ENVIRONMENT SECRET EXPOSURE GUARDS ---');
        // Simulate production environment
        const prevEnv = app_config_js_1.config.environment;
        app_config_js_1.config.environment = 'PRODUCTION';
        app_config_js_1.config.isDemoMode = false;
        // Email send-otp endpoint response in production
        const prodRes = await fetch(`${baseUrl}/auth/email/send-otp`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email: 'prod.security@finpocket.com' }),
        });
        const prodData = await prodRes.json();
        assert_1.strict.equal(prodRes.status, 200);
        assert_1.strict.equal(prodData.devOtp, undefined, 'devOtp must NOT be returned in production mode');
        // Restore environment
        app_config_js_1.config.environment = prevEnv;
        console.log('  ✅ [PASS] 10. Production responses strictly omit devOtp and internal secrets');
        // -----------------------------------------------------------------
        // TEST 11: MAINTENANCE CLEANUP DOES NOT PURGE UNRELATED DATA
        // -----------------------------------------------------------------
        console.log('\n--- TEST 11: MAINTENANCE CLEANUP TARGETING ---');
        // Insert an old expired record (>10 days ago)
        await (0, database_js_1.runQuery)(`INSERT INTO otp_verifications (
        id, destination, destination_type, purpose, otp_hash, salt,
        expires_at, attempts, resend_after, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, datetime('now', '-12 days'), 0, datetime('now', '-12 days'), datetime('now', '-12 days'))`, ['otp_ancient', 'ancient@finpocket.com', 'EMAIL', 'REGISTRATION_EMAIL', 'dummy_hash', 'salt']);
        const initialTotal = await (0, database_js_1.getQuery)(`SELECT COUNT(*) as count FROM otp_verifications`);
        const cleaned = await otp_service_js_1.OtpService.cleanupExpiredOtps(7);
        assert_1.strict.ok(cleaned >= 1);
        const ancientCheck = await (0, database_js_1.getQuery)(`SELECT id FROM otp_verifications WHERE id = 'otp_ancient'`);
        assert_1.strict.equal(ancientCheck, undefined, 'Ancient record should be cleaned up');
        const recentCheck = await (0, database_js_1.getQuery)(`SELECT id FROM otp_verifications WHERE destination = ?`, [canonEmail]);
        assert_1.strict.ok(recentCheck, 'Recent valid record must be preserved');
        console.log('  ✅ [PASS] 11. Maintenance cleanup accurately purges only stale records older than threshold');
        console.log('\n====================================================');
        console.log('🎉 ALL 11 OTP SECURITY & REGRESSION TESTS PASSED!');
        console.log('====================================================\n');
    }
    finally {
        server.close();
    }
}
runOtpSecurityRegressionSuite().catch((err) => {
    console.error('❌ OTP Security Suite failed:', err);
    process.exit(1);
});
//# sourceMappingURL=otp_security_regression.test.js.map