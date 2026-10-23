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
const sms_service_js_1 = require("../services/sms/sms.service.js");
const mock_sms_provider_js_1 = require("../services/sms/mock_sms.provider.js");
const security_validator_js_1 = require("../utils/security.validator.js");
const turnstile_test_helper_js_1 = require("./turnstile_test_helper.js");
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test_jwt_secret_32_characters_minimum_len!';
(0, turnstile_test_helper_js_1.installTurnstileTestMock)();
const app = (0, express_1.default)();
app.use(express_1.default.json());
app.use('/auth', auth_routes_js_1.default);
async function runMobileOtpSuite() {
    console.log('\n====================================================');
    console.log('📱 FINPOCKET MOBILE SMS OTP VERIFICATION TEST SUITE');
    console.log('====================================================\n');
    await (0, database_js_1.initDatabase)();
    const mockSms = new mock_sms_provider_js_1.MockSmsProvider();
    sms_service_js_1.SmsService.setMockProvider(mockSms);
    const server = http_1.default.createServer(app);
    await new Promise((resolve) => server.listen(0, resolve));
    const port = server.address().port;
    const baseUrl = `http://127.0.0.1:${port}`;
    try {
        // -----------------------------------------------------------------
        // TEST 1: VALID INDIAN MOBILE NUMBER NORMALIZATION
        // -----------------------------------------------------------------
        console.log('--- TEST 1: VALID INDIAN MOBILE NUMBER NORMALIZATION ---');
        const validFormats = [
            '9876543210',
            '+919876543210',
            '919876543210',
            '09876543210',
            '+91 98765 43210',
            '+91-98765-43210',
            '98765-43210',
        ];
        for (const raw of validFormats) {
            const res = (0, security_validator_js_1.normalizeIndianPhoneNumber)(raw);
            assert_1.strict.equal(res.isValid, true, `Should accept valid format: ${raw}`);
            assert_1.strict.equal(res.normalized, '+919876543210');
            assert_1.strict.equal(res.raw10Digits, '9876543210');
        }
        console.log('  ✅ [PASS] 1. Valid Indian mobile numbers in multiple dialer formats normalize to +919876543210');
        // -----------------------------------------------------------------
        // TEST 2: REJECT INVALID MOBILE NUMBERS
        // -----------------------------------------------------------------
        console.log('\n--- TEST 2: REJECT INVALID MOBILE NUMBERS ---');
        const invalidNumbers = [
            '',
            'not-a-number',
            '+14155552671', // US country code
            '+447911123456', // UK country code
            '1234567890', // Indian mobile numbers do not start with 1
            '5876543210', // Indian mobile numbers do not start with 5
            '98765', // Too short
            '987654321000', // Too long
        ];
        for (const invalid of invalidNumbers) {
            const validation = (0, security_validator_js_1.normalizeIndianPhoneNumber)(invalid);
            assert_1.strict.equal(validation.isValid, false, `Should reject invalid number: ${invalid}`);
            const res = await fetch(`${baseUrl}/auth/phone/send-otp`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ phone: invalid }),
            });
            assert_1.strict.equal(res.status, 400, `API should return HTTP 400 for ${invalid}`);
        }
        console.log('  ✅ [PASS] 2. Non-Indian numbers, invalid lengths, and malformed prefixes rejected with 400');
        // -----------------------------------------------------------------
        // TEST 3: SUCCESSFUL OTP REQUEST & MOCK SMS DELIVERY
        // -----------------------------------------------------------------
        console.log('\n--- TEST 3: SUCCESSFUL OTP REQUEST & MOCK SMS DELIVERY ---');
        mockSms.clear();
        const testPhone1 = '+919876543210';
        const res3 = await fetch(`${baseUrl}/auth/phone/send-otp`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ phone: testPhone1, captchaToken: turnstile_test_helper_js_1.testTurnstileToken }),
        });
        assert_1.strict.equal(res3.status, 200);
        const body3 = await res3.json();
        assert_1.strict.equal(body3.success, true);
        assert_1.strict.equal(body3.expiresInSeconds, 300);
        assert_1.strict.equal(body3.resendCooldownSeconds, 30);
        assert_1.strict.match(body3.maskedPhone, /\+91\s+\*+3210/);
        const sentOtp1 = mockSms.getLastSentOtp(testPhone1);
        assert_1.strict.ok(sentOtp1, 'Mock SMS provider must receive OTP');
        assert_1.strict.match(sentOtp1, /^\d{6}$/, 'OTP must be 6 digits');
        console.log('  ✅ [PASS] 3. 6-digit CSPRNG OTP generated and dispatched to SMS provider');
        // -----------------------------------------------------------------
        // TEST 4: HASH-AT-REST STORAGE (NO PLAINTEXT OTP IN DB)
        // -----------------------------------------------------------------
        console.log('\n--- TEST 4: HASH-AT-REST STORAGE (NO PLAINTEXT OTP IN DB) ---');
        const dbRecord = await (0, database_js_1.getQuery)('SELECT * FROM otp_verifications WHERE destination = ? ORDER BY created_at DESC LIMIT 1', [testPhone1]);
        assert_1.strict.ok(dbRecord, 'Record must exist in otp_verifications');
        assert_1.strict.equal(dbRecord.destination, testPhone1);
        assert_1.strict.equal(dbRecord.destination_type, 'PHONE');
        assert_1.strict.equal(dbRecord.purpose, 'REGISTRATION_PHONE');
        assert_1.strict.notEqual(dbRecord.otp_hash, sentOtp1, 'DB must never store plaintext OTP');
        assert_1.strict.equal(dbRecord.otp_hash.length, 64, 'SHA-256 HMAC must be 64 hex characters');
        assert_1.strict.ok(dbRecord.salt && dbRecord.salt.length === 32, 'Salt must be 32 hex characters');
        console.log('  ✅ [PASS] 4. Database stores keyed HMAC-SHA256 with random salt; zero plaintext OTP');
        // -----------------------------------------------------------------
        // TEST 5: RESEND COOLDOWN ENFORCEMENT (30s)
        // -----------------------------------------------------------------
        console.log('\n--- TEST 5: RESEND COOLDOWN ENFORCEMENT (30s) ---');
        const res5 = await fetch(`${baseUrl}/auth/phone/send-otp`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ phone: testPhone1, captchaToken: turnstile_test_helper_js_1.testTurnstileToken }),
        });
        assert_1.strict.equal(res5.status, 429);
        const body5 = await res5.json();
        assert_1.strict.ok(body5.retryAfterSeconds > 0 && body5.retryAfterSeconds <= 30);
        console.log('  ✅ [PASS] 5. Repeated send request within 30s strictly rejected with HTTP 429');
        // -----------------------------------------------------------------
        // TEST 6: INCORRECT OTP WITH ATTEMPT COUNTER DECREMENT
        // -----------------------------------------------------------------
        console.log('\n--- TEST 6: INCORRECT OTP WITH ATTEMPT COUNTDOWN ---');
        const res6 = await fetch(`${baseUrl}/auth/phone/verify-otp`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ phone: testPhone1, otp: '000000' }),
        });
        assert_1.strict.equal(res6.status, 400);
        const body6 = await res6.json();
        assert_1.strict.equal(body6.remainingAttempts, 4);
        console.log('  ✅ [PASS] 6. Incorrect code rejected; remainingAttempts decremented safely');
        // -----------------------------------------------------------------
        // TEST 7: LOCKOUT AFTER 5 INCORRECT ATTEMPTS
        // -----------------------------------------------------------------
        console.log('\n--- TEST 7: LOCKOUT AFTER 5 INCORRECT ATTEMPTS ---');
        for (let i = 3; i >= 1; i--) {
            const res = await fetch(`${baseUrl}/auth/phone/verify-otp`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ phone: testPhone1, otp: '111111' }),
            });
            assert_1.strict.equal(res.status, 400);
            const b = await res.json();
            assert_1.strict.equal(b.remainingAttempts, i);
        }
        // 5th failed attempt: lockout
        const res7Last = await fetch(`${baseUrl}/auth/phone/verify-otp`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ phone: testPhone1, otp: '222222' }),
        });
        assert_1.strict.equal(res7Last.status, 429);
        const body7Last = await res7Last.json();
        assert_1.strict.equal(body7Last.remainingAttempts, 0);
        assert_1.strict.match(body7Last.error, /too many incorrect attempts/i);
        // Even with the original valid OTP, the locked code must now be rejected
        const res7Locked = await fetch(`${baseUrl}/auth/phone/verify-otp`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ phone: testPhone1, otp: sentOtp1 }),
        });
        assert_1.strict.ok(res7Locked.status === 429 || res7Locked.status === 400);
        const body7Locked = await res7Locked.json();
        assert_1.strict.match(body7Locked.error, /expired or is invalid|too many incorrect attempts/i);
        console.log('  ✅ [PASS] 7. Code permanently locked after 5 failed attempts');
        // -----------------------------------------------------------------
        // TEST 8: SUCCESSFUL OTP VERIFICATION
        // -----------------------------------------------------------------
        console.log('\n--- TEST 8: SUCCESSFUL OTP VERIFICATION ---');
        const testPhone2 = '+919811122233';
        await fetch(`${baseUrl}/auth/phone/send-otp`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ phone: testPhone2, captchaToken: turnstile_test_helper_js_1.testTurnstileToken }),
        });
        const sentOtp2 = mockSms.getLastSentOtp(testPhone2);
        const res8 = await fetch(`${baseUrl}/auth/phone/verify-otp`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ phone: testPhone2, otp: sentOtp2 }),
        });
        assert_1.strict.equal(res8.status, 200);
        const body8 = await res8.json();
        assert_1.strict.equal(body8.success, true);
        assert_1.strict.equal(body8.verified, true);
        const verifiedDbRecord = await (0, database_js_1.getQuery)('SELECT consumed_at FROM otp_verifications WHERE destination = ? ORDER BY created_at DESC LIMIT 1', [testPhone2]);
        assert_1.strict.ok(verifiedDbRecord.consumed_at, 'consumed_at timestamp must be set');
        console.log('  ✅ [PASS] 8. Valid OTP successfully verified and marked consumed');
        // -----------------------------------------------------------------
        // TEST 9: STRICT SINGLE-USE & REPLAY PROTECTION
        // -----------------------------------------------------------------
        console.log('\n--- TEST 9: STRICT REPLAY PROTECTION ---');
        const res9 = await fetch(`${baseUrl}/auth/phone/verify-otp`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ phone: testPhone2, otp: sentOtp2 }),
        });
        assert_1.strict.equal(res9.status, 400);
        const body9 = await res9.json();
        assert_1.strict.match(body9.error, /expired or is invalid|already been used/i);
        console.log('  ✅ [PASS] 9. Replay attack on consumed code strictly rejected');
        // -----------------------------------------------------------------
        // TEST 10: EXPIRED OTP ENFORCEMENT
        // -----------------------------------------------------------------
        console.log('\n--- TEST 10: EXPIRED OTP ENFORCEMENT ---');
        const testPhone3 = '+919833344455';
        await fetch(`${baseUrl}/auth/phone/send-otp`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ phone: testPhone3, captchaToken: turnstile_test_helper_js_1.testTurnstileToken }),
        });
        const sentOtp3 = mockSms.getLastSentOtp(testPhone3);
        // Manually backdate expiration in DB
        const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000).toISOString();
        await (0, database_js_1.runQuery)('UPDATE otp_verifications SET expires_at = ? WHERE destination = ?', [tenMinutesAgo, testPhone3]);
        const res10 = await fetch(`${baseUrl}/auth/phone/verify-otp`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ phone: testPhone3, otp: sentOtp3 }),
        });
        assert_1.strict.equal(res10.status, 400);
        const body10 = await res10.json();
        assert_1.strict.match(body10.error, /expired/i);
        console.log('  ✅ [PASS] 10. Expired OTP strictly rejected');
        // -----------------------------------------------------------------
        // TEST 11: SMS PROVIDER TIMEOUT & DELIVERY FAILURE HANDLING
        // -----------------------------------------------------------------
        console.log('\n--- TEST 11: SMS PROVIDER FAILURE HANDLING ---');
        mockSms.setSimulateFailure(true, 'Network gateway timeout');
        const testPhone4 = '+919844455566';
        const res11 = await fetch(`${baseUrl}/auth/phone/send-otp`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ phone: testPhone4, captchaToken: turnstile_test_helper_js_1.testTurnstileToken }),
        });
        assert_1.strict.equal(res11.status, 500);
        const body11 = await res11.json();
        assert_1.strict.match(body11.error, /failed to deliver/i);
        mockSms.setSimulateFailure(false);
        console.log('  ✅ [PASS] 11. SMS provider failure handled gracefully with HTTP 500 without crashing');
        // -----------------------------------------------------------------
        // TEST 12: CONCURRENT VERIFICATION SAFETY (ATOMIC RACE CONDITIONS)
        // -----------------------------------------------------------------
        console.log('\n--- TEST 12: CONCURRENT VERIFICATION SAFETY ---');
        const testPhone5 = '+919855566677';
        await fetch(`${baseUrl}/auth/phone/send-otp`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ phone: testPhone5, captchaToken: turnstile_test_helper_js_1.testTurnstileToken }),
        });
        const sentOtp5 = mockSms.getLastSentOtp(testPhone5);
        const verifyAttempts = await Promise.all([1, 2, 3, 4, 5].map(() => fetch(`${baseUrl}/auth/phone/verify-otp`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ phone: testPhone5, otp: sentOtp5 }),
        })));
        const successCount = verifyAttempts.filter((r) => r.status === 200).length;
        const failCount = verifyAttempts.filter((r) => r.status === 400).length;
        assert_1.strict.equal(successCount, 1, 'Exactly one concurrent verification must succeed');
        assert_1.strict.equal(failCount, 4, 'Remaining concurrent verifications must be rejected');
        console.log('  ✅ [PASS] 12. Concurrency-safe: Exactly 1 verify succeeded, 4 rejected');
        // -----------------------------------------------------------------
        // TEST 13: USER AND DESTINATION BINDING
        // -----------------------------------------------------------------
        console.log('\n--- TEST 13: DESTINATION & USER BINDING ---');
        const legitUserId = `usr_legit_${Date.now()}`;
        const attackerUserId = `usr_attk_${Date.now()}`;
        await (0, database_js_1.runQuery)(`INSERT INTO users (id, name, email, password_hash) VALUES (?, ?, ?, ?)`, [
            legitUserId, 'Legit Owner', `${legitUserId}@test.finpocket`, 'hash123'
        ]);
        await (0, database_js_1.runQuery)(`INSERT INTO users (id, name, email, password_hash) VALUES (?, ?, ?, ?)`, [
            attackerUserId, 'Attacker', `${attackerUserId}@test.finpocket`, 'hash123'
        ]);
        const testPhone6 = '+919866677788';
        const res13Send = await fetch(`${baseUrl}/auth/phone/send-otp`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ phone: testPhone6, userId: legitUserId, captchaToken: turnstile_test_helper_js_1.testTurnstileToken }),
        });
        assert_1.strict.equal(res13Send.status, 200);
        const sentOtp6 = mockSms.getLastSentOtp(testPhone6);
        assert_1.strict.ok(sentOtp6, 'OTP must be dispatched');
        // Attacker tries to verify User A's phone code against User B's account
        const res13IDOR = await fetch(`${baseUrl}/auth/phone/verify-otp`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ phone: testPhone6, otp: sentOtp6, userId: attackerUserId }),
        });
        assert_1.strict.equal(res13IDOR.status, 400);
        const body13IDOR = await res13IDOR.json();
        assert_1.strict.match(body13IDOR.error, /different account/i);
        // Cross-destination substitution: valid code from Phone 6 tried on Phone 7
        const testPhone7 = '+919877788899';
        const res13Cross = await fetch(`${baseUrl}/auth/phone/verify-otp`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ phone: testPhone7, otp: sentOtp6 }),
        });
        assert_1.strict.equal(res13Cross.status, 400);
        console.log('  ✅ [PASS] 13. Code strictly bound to user account and destination phone number');
        // -----------------------------------------------------------------
        // TEST 14: REGISTRATION ENFORCEMENT & VERIFICATION STATUS
        // -----------------------------------------------------------------
        console.log('\n--- TEST 14: REGISTRATION ENFORCEMENT & PHONE_VERIFIED STATUS ---');
        const regPhone = `+9198${(Date.now() % 100000000).toString().padStart(8, '0')}`;
        const regEmail = `reg_phone_test_${Date.now()}@finpocket.test`;
        await (0, database_js_1.runQuery)('DELETE FROM otp_verifications WHERE destination = ?', [regPhone]);
        // Verify email first (email is required)
        await fetch(`${baseUrl}/auth/email/send-otp`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email: regEmail, captchaToken: turnstile_test_helper_js_1.testTurnstileToken }),
        });
        const emailRecord = await (0, database_js_1.getQuery)('SELECT id FROM otp_verifications WHERE destination = ? AND purpose = ?', [regEmail, 'REGISTRATION_EMAIL']);
        await (0, database_js_1.runQuery)('UPDATE otp_verifications SET consumed_at = ? WHERE id = ?', [
            new Date().toISOString(),
            emailRecord.id,
        ]);
        // Attempt registration with unverified phone -> must be blocked
        const res14Block = await fetch(`${baseUrl}/auth/register`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                name: 'Phone User',
                email: regEmail,
                password: 'Password@12345!',
                phone: regPhone,
                captchaToken: turnstile_test_helper_js_1.testTurnstileToken,
            }),
        });
        assert_1.strict.equal(res14Block.status, 400);
        const body14Block = await res14Block.json();
        assert_1.strict.match(body14Block.error, /verify your mobile phone number/i);
        // Now send and verify phone OTP
        await fetch(`${baseUrl}/auth/phone/send-otp`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ phone: regPhone, captchaToken: turnstile_test_helper_js_1.testTurnstileToken }),
        });
        const regPhoneOtp = mockSms.getLastSentOtp(regPhone);
        const res14Verify = await fetch(`${baseUrl}/auth/phone/verify-otp`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ phone: regPhone, otp: regPhoneOtp }),
        });
        assert_1.strict.equal(res14Verify.status, 200);
        // Registration should now succeed
        const res14Success = await fetch(`${baseUrl}/auth/register`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                name: 'Phone User',
                email: regEmail,
                password: 'Password@12345!',
                phone: regPhone,
                captchaToken: turnstile_test_helper_js_1.testTurnstileToken,
            }),
        });
        assert_1.strict.equal(res14Success.status, 201);
        const body14Success = await res14Success.json();
        assert_1.strict.equal(body14Success.user.isPhoneVerified, true);
        assert_1.strict.equal(body14Success.user.isEmailVerified, true);
        // Query database to verify phone and phone_verified in users table
        const registeredUser = await (0, database_js_1.getQuery)('SELECT phone, phone_verified, email_verified FROM users WHERE id = ?', [
            body14Success.user.id,
        ]);
        assert_1.strict.equal(registeredUser.phone, regPhone);
        assert_1.strict.equal(registeredUser.phone_verified, 1);
        assert_1.strict.equal(registeredUser.email_verified, 1);
        // Check verification status endpoint
        const res14Status = await fetch(`${baseUrl}/auth/verification-status`, {
            method: 'GET',
            headers: { Authorization: `Bearer ${body14Success.token}` },
        });
        assert_1.strict.equal(res14Status.status, 200);
        const body14Status = await res14Status.json();
        assert_1.strict.equal(body14Status.phoneVerified, true);
        assert_1.strict.equal(body14Status.emailVerified, true);
        console.log('  ✅ [PASS] 14. Registration enforces phone verification; phone_verified set to 1 in DB & /verification-status');
        // -----------------------------------------------------------------
        // TEST 15: UNIVERSAL OTP RESEND FOR PHONE
        // -----------------------------------------------------------------
        console.log('\n--- TEST 15: POST /auth/otp/resend (PHONE) ---');
        const testPhone8 = `+9197${(Date.now() % 100000000).toString().padStart(8, '0')}`;
        await (0, database_js_1.runQuery)('DELETE FROM otp_verifications WHERE destination = ?', [testPhone8]);
        const res15 = await fetch(`${baseUrl}/auth/otp/resend`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ destination: testPhone8, type: 'PHONE', purpose: 'REGISTRATION_PHONE', captchaToken: turnstile_test_helper_js_1.testTurnstileToken }),
        });
        assert_1.strict.equal(res15.status, 200);
        const body15 = await res15.json();
        assert_1.strict.equal(body15.success, true);
        assert_1.strict.equal(body15.expiresInSeconds, 300);
        assert_1.strict.equal(body15.resendCooldownSeconds, 30);
        assert_1.strict.ok(mockSms.getLastSentOtp(testPhone8), 'Resend must dispatch fresh code');
        // Resend within 30s cooldown should be rejected
        const res15Cooldown = await fetch(`${baseUrl}/auth/otp/resend`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ destination: testPhone8, type: 'PHONE', purpose: 'REGISTRATION_PHONE', captchaToken: turnstile_test_helper_js_1.testTurnstileToken }),
        });
        assert_1.strict.equal(res15Cooldown.status, 429);
        console.log('  ✅ [PASS] 15. Universal resend endpoint delivers phone SMS code with cooldown protection');
        console.log('\n====================================================');
        console.log('🎉 ALL 15 MOBILE SMS OTP TESTS PASSED!');
        console.log('====================================================\n');
    }
    finally {
        server.close();
    }
}
runMobileOtpSuite().catch((err) => {
    console.error('\n❌ Mobile OTP Test Failed:', err);
    process.exit(1);
});
//# sourceMappingURL=mobile_otp_verification.test.js.map