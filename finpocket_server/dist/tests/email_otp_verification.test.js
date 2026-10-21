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
const otp_service_js_1 = require("../services/otp.service.js");
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test_jwt_secret_32_characters_minimum_len!';
const app = (0, express_1.default)();
app.use(express_1.default.json());
app.use('/auth', auth_routes_js_1.default);
async function runEmailOtpSuite() {
    console.log('\n====================================================');
    console.log('📧 FINPOCKET EMAIL OTP VERIFICATION TEST SUITE');
    console.log('====================================================\n');
    await (0, database_js_1.initDatabase)();
    // Set mock nodemailer transporter to intercept outbound emails safely without real network calls
    email_service_js_1.EmailService.setMockTransporter({
        sendMail: async (mailOptions) => ({
            messageId: `mock_${Date.now()}`,
            response: '250 OK',
        }),
    });
    const server = http_1.default.createServer(app);
    await new Promise((resolve) => server.listen(0, resolve));
    const port = server.address().port;
    const baseUrl = `http://127.0.0.1:${port}`;
    try {
        // -----------------------------------------------------------------
        // TEST 1: REJECT INVALID & DISPOSABLE EMAILS
        // -----------------------------------------------------------------
        console.log('--- TEST 1: REJECT INVALID & DISPOSABLE EMAIL ---');
        const res1a = await fetch(`${baseUrl}/auth/email/send-otp`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email: 'not-an-email' }),
        });
        assert_1.strict.equal(res1a.status, 400);
        const res1b = await fetch(`${baseUrl}/auth/email/send-otp`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email: 'attacker@mailinator.com' }),
        });
        assert_1.strict.equal(res1b.status, 400);
        const body1b = await res1b.json();
        assert_1.strict.match(body1b.error, /disposable/i);
        console.log('  ✅ [PASS] 1. Malformed and disposable email domains rejected with 400');
        // -----------------------------------------------------------------
        // TEST 2: SUCCESSFUL OTP GENERATION & MOCK EMAIL DELIVERY
        // -----------------------------------------------------------------
        console.log('\n--- TEST 2: SUCCESSFUL OTP GENERATION & MOCK EMAIL DELIVERY ---');
        email_service_js_1.EmailService.clearSentMails();
        const testEmail1 = `verify_test_${Date.now()}@finpocket.test`;
        const res2 = await fetch(`${baseUrl}/auth/email/send-otp`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email: testEmail1 }),
        });
        assert_1.strict.equal(res2.status, 200);
        const body2 = await res2.json();
        assert_1.strict.equal(body2.success, true);
        assert_1.strict.equal(body2.expiresInSeconds, 300);
        assert_1.strict.equal(body2.resendCooldownSeconds, 30);
        const sentMails = email_service_js_1.EmailService.getSentMails();
        assert_1.strict.equal(sentMails.length, 1);
        assert_1.strict.equal(sentMails[0].to, testEmail1);
        assert_1.strict.match(sentMails[0].text, /5 minutes/);
        const otpMatch = sentMails[0].text.match(/\b\d{6}\b/);
        assert_1.strict.ok(otpMatch, 'Delivered email must contain 6-digit OTP');
        const sentOtp1 = otpMatch[0];
        console.log('  ✅ [PASS] 2. 6-digit OTP generated and delivered with 5-minute expiry');
        // -----------------------------------------------------------------
        // TEST 3: DATABASE PERSISTENCE & ZERO PLAINTEXT HASH CHECK
        // -----------------------------------------------------------------
        console.log('\n--- TEST 3: HASH-AT-REST STORAGE (NO PLAINTEXT OTP IN DB) ---');
        const dbRecord = await (0, database_js_1.getQuery)('SELECT * FROM otp_verifications WHERE destination = ? ORDER BY created_at DESC LIMIT 1', [testEmail1]);
        assert_1.strict.ok(dbRecord, 'Record must exist in otp_verifications');
        assert_1.strict.equal(dbRecord.destination, testEmail1);
        assert_1.strict.equal(dbRecord.purpose, 'REGISTRATION_EMAIL');
        assert_1.strict.notEqual(dbRecord.otp_hash, sentOtp1, 'DB must never store plaintext OTP');
        assert_1.strict.equal(dbRecord.otp_hash.length, 64, 'SHA-256 HMAC must be 64 hex characters');
        assert_1.strict.ok(dbRecord.salt && dbRecord.salt.length === 32, '16-byte salt must be 32 hex characters');
        console.log('  ✅ [PASS] 3. Database stores keyed HMAC-SHA256 with random salt; zero plaintext OTP');
        // -----------------------------------------------------------------
        // TEST 4: RESEND COOLDOWN ENFORCEMENT
        // -----------------------------------------------------------------
        console.log('\n--- TEST 4: RESEND COOLDOWN ENFORCEMENT (30s) ---');
        const res4 = await fetch(`${baseUrl}/auth/email/send-otp`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email: testEmail1 }),
        });
        assert_1.strict.equal(res4.status, 429);
        const body4 = await res4.json();
        assert_1.strict.match(body4.error, /Please wait/);
        assert_1.strict.ok(body4.retryAfterSeconds > 0 && body4.retryAfterSeconds <= 30);
        console.log('  ✅ [PASS] 4. Repeated send request within 30s strictly rejected with HTTP 429');
        // -----------------------------------------------------------------
        // TEST 5: INCORRECT OTP ATTEMPT COUNTER
        // -----------------------------------------------------------------
        console.log('\n--- TEST 5: INCORRECT OTP WITH ATTEMPT COUNTDOWN ---');
        const res5 = await fetch(`${baseUrl}/auth/email/verify-otp`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email: testEmail1, otp: '000000' }),
        });
        assert_1.strict.equal(res5.status, 400);
        const body5 = await res5.json();
        assert_1.strict.match(body5.error, /Invalid verification code/);
        assert_1.strict.equal(body5.remainingAttempts, 4);
        const dbRecordAfterFail = await (0, database_js_1.getQuery)('SELECT attempts FROM otp_verifications WHERE id = ?', [dbRecord.id]);
        assert_1.strict.equal(dbRecordAfterFail.attempts, 1);
        console.log('  ✅ [PASS] 5. Incorrect code rejected; attempt counter incremented safely');
        // -----------------------------------------------------------------
        // TEST 6: MAX INCORRECT ATTEMPTS LOCKOUT
        // -----------------------------------------------------------------
        console.log('\n--- TEST 6: LOCKOUT AFTER 5 INCORRECT ATTEMPTS ---');
        for (let i = 0; i < 4; i++) {
            await fetch(`${baseUrl}/auth/email/verify-otp`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email: testEmail1, otp: '111111' }),
            });
        }
        // Now attempts have reached 5; code should be locked
        const res6 = await fetch(`${baseUrl}/auth/email/verify-otp`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email: testEmail1, otp: sentOtp1 }),
        });
        assert_1.strict.ok(res6.status === 429 || res6.status === 400);
        const body6 = await res6.json();
        assert_1.strict.match(body6.error, /expired or is invalid|Too many incorrect attempts/i);
        console.log('  ✅ [PASS] 6. Code permanently locked after 5 failed attempts');
        // -----------------------------------------------------------------
        // TEST 7: SUCCESSFUL VERIFICATION & SINGLE-USE CONSUMPTION
        // -----------------------------------------------------------------
        console.log('\n--- TEST 7: SUCCESSFUL OTP VERIFICATION ---');
        const testEmail2 = `valid_verify_${Date.now()}@finpocket.test`;
        const issueRes7 = await otp_service_js_1.OtpService.issueOtp({
            destination: testEmail2,
            destinationType: 'EMAIL',
            purpose: 'REGISTRATION_EMAIL',
        });
        assert_1.strict.ok(issueRes7.otp);
        const res7 = await fetch(`${baseUrl}/auth/email/verify-otp`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email: testEmail2, otp: issueRes7.otp }),
        });
        assert_1.strict.equal(res7.status, 200);
        const body7 = await res7.json();
        assert_1.strict.equal(body7.verified, true);
        console.log('  ✅ [PASS] 7. Valid OTP successfully verified');
        // -----------------------------------------------------------------
        // TEST 8: REPLAY PROTECTION (REUSE OF CONSUMED OTP)
        // -----------------------------------------------------------------
        console.log('\n--- TEST 8: STRICT REPLAY PROTECTION ---');
        const res8 = await fetch(`${baseUrl}/auth/email/verify-otp`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email: testEmail2, otp: issueRes7.otp }),
        });
        assert_1.strict.equal(res8.status, 400);
        const body8 = await res8.json();
        assert_1.strict.match(body8.error, /expired or is invalid/i);
        console.log('  ✅ [PASS] 8. Replay attack on consumed code rejected');
        // -----------------------------------------------------------------
        // TEST 9: EXPIRED OTP REJECTION
        // -----------------------------------------------------------------
        console.log('\n--- TEST 9: EXPIRED OTP ENFORCEMENT ---');
        const testEmail3 = `expired_test_${Date.now()}@finpocket.test`;
        const issueRes9 = await otp_service_js_1.OtpService.issueOtp({
            destination: testEmail3,
            destinationType: 'EMAIL',
            purpose: 'REGISTRATION_EMAIL',
        });
        assert_1.strict.ok(issueRes9.otp);
        // Manually backdate expiration in database to simulate passage of 5 minutes
        const pastTimestamp = new Date(Date.now() - 10000).toISOString();
        await (0, database_js_1.runQuery)('UPDATE otp_verifications SET expires_at = ? WHERE destination = ?', [pastTimestamp, testEmail3]);
        const res9 = await fetch(`${baseUrl}/auth/email/verify-otp`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email: testEmail3, otp: issueRes9.otp }),
        });
        assert_1.strict.equal(res9.status, 400);
        const body9 = await res9.json();
        assert_1.strict.match(body9.error, /expired/i);
        console.log('  ✅ [PASS] 9. Expired OTP strictly rejected');
        // -----------------------------------------------------------------
        // TEST 10: SMTP FAILURE HANDLING
        // -----------------------------------------------------------------
        console.log('\n--- TEST 10: SMTP FAILURE HANDLING ---');
        email_service_js_1.EmailService.setMockTransporter({
            sendMail: async () => {
                const timeoutErr = new Error('Connection timeout');
                timeoutErr.code = 'ETIMEDOUT';
                throw timeoutErr;
            },
        });
        const failEmail = `smtp_fail_${Date.now()}@finpocket.test`;
        const resFail = await fetch(`${baseUrl}/auth/email/send-otp`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email: failEmail }),
        });
        assert_1.strict.equal(resFail.status, 500);
        const failBody = await resFail.json();
        assert_1.strict.match(failBody.error, /Failed to deliver/);
        console.log('  ✅ [PASS] 10. SMTP failure handled gracefully with HTTP 500 without crashing');
        // Restore working mock transporter for remaining tests
        email_service_js_1.EmailService.setMockTransporter({
            sendMail: async () => ({ messageId: 'mock-msg-ok' }),
        });
        // -----------------------------------------------------------------
        // TEST 11: CONCURRENT VERIFICATION RACE CONDITION
        // -----------------------------------------------------------------
        console.log('\n--- TEST 11: CONCURRENT VERIFICATION SAFETY ---');
        const testEmail4 = `concurrent_test_${Date.now()}@finpocket.test`;
        const issueRes11 = await otp_service_js_1.OtpService.issueOtp({
            destination: testEmail4,
            destinationType: 'EMAIL',
            purpose: 'REGISTRATION_EMAIL',
        });
        assert_1.strict.ok(issueRes11.otp);
        // Fire 5 concurrent verify requests with the same valid OTP
        const concurrentPromises = Array.from({ length: 5 }, () => fetch(`${baseUrl}/auth/email/verify-otp`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email: testEmail4, otp: issueRes11.otp }),
        }));
        const concurrentResults = await Promise.all(concurrentPromises);
        const statuses = concurrentResults.map((r) => r.status);
        const successCount = statuses.filter((s) => s === 200).length;
        const failureCount = statuses.filter((s) => s !== 200).length;
        assert_1.strict.equal(successCount, 1, 'Exactly one concurrent verification must succeed');
        assert_1.strict.equal(failureCount, 4, 'All subsequent concurrent verifications must fail');
        console.log('  ✅ [PASS] 11. Concurrency-safe: Exactly 1 verify succeeded, 4 rejected');
        // -----------------------------------------------------------------
        // TEST 12: DESTINATION & PURPOSE BINDING
        // -----------------------------------------------------------------
        console.log('\n--- TEST 12: DESTINATION & PURPOSE BINDING ---');
        const testEmail5 = `dest_bound_a_${Date.now()}@finpocket.test`;
        const testEmailOther = `dest_bound_b_${Date.now()}@finpocket.test`;
        const issueRes12 = await otp_service_js_1.OtpService.issueOtp({
            destination: testEmail5,
            destinationType: 'EMAIL',
            purpose: 'REGISTRATION_EMAIL',
        });
        assert_1.strict.ok(issueRes12.otp);
        // Try applying code issued for Email A to Email B
        const res12a = await fetch(`${baseUrl}/auth/email/verify-otp`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email: testEmailOther, otp: issueRes12.otp }),
        });
        assert_1.strict.equal(res12a.status, 400);
        // Try applying code with different purpose
        const res12b = await otp_service_js_1.OtpService.verifyOtp({
            destination: testEmail5,
            purpose: 'PASSWORD_RESET',
            otp: issueRes12.otp,
        });
        assert_1.strict.equal(res12b.verified, false);
        console.log('  ✅ [PASS] 12. Code strictly bound to destination and purpose');
        // -----------------------------------------------------------------
        // TEST 13: REGISTRATION GATE (UNVERIFIED EMAIL CANNOT REGISTER)
        // -----------------------------------------------------------------
        console.log('\n--- TEST 13: REGISTRATION ENFORCEMENT ---');
        const unverifiedEmail = `unverified_${Date.now()}@finpocket.test`;
        const res13a = await fetch(`${baseUrl}/auth/register`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                name: 'Unverified Tester',
                email: unverifiedEmail,
                password: 'ValidSecurePassword@123',
            }),
        });
        assert_1.strict.equal(res13a.status, 400);
        const body13a = await res13a.json();
        assert_1.strict.match(body13a.error, /verify your email address/i);
        console.log('  ✅ [PASS] 13. Registration blocked for unverified email address');
        // Now verify the email address properly
        const issueRes13 = await otp_service_js_1.OtpService.issueOtp({
            destination: unverifiedEmail,
            destinationType: 'EMAIL',
            purpose: 'REGISTRATION_EMAIL',
        });
        await fetch(`${baseUrl}/auth/email/verify-otp`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email: unverifiedEmail, otp: issueRes13.otp }),
        });
        // Registration should now succeed!
        const res13b = await fetch(`${baseUrl}/auth/register`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                name: 'Verified Tester',
                email: unverifiedEmail,
                password: 'ValidSecurePassword@123',
            }),
        });
        assert_1.strict.equal(res13b.status, 201);
        const body13b = await res13b.json();
        assert_1.strict.ok(body13b.token);
        assert_1.strict.ok(body13b.user.id);
        // Check users table in database: email_verified must be 1
        const registeredUser = await (0, database_js_1.getQuery)('SELECT email_verified FROM users WHERE id = ?', [body13b.user.id]);
        assert_1.strict.equal(registeredUser.email_verified, 1);
        console.log('  ✅ [PASS] 13b. Registration succeeds after email OTP verification; email_verified set to 1');
        // -----------------------------------------------------------------
        // TEST 14: VERIFICATION STATUS ENDPOINT
        // -----------------------------------------------------------------
        console.log('\n--- TEST 14: GET /auth/verification-status ---');
        const res14 = await fetch(`${baseUrl}/auth/verification-status`, {
            method: 'GET',
            headers: { Authorization: `Bearer ${body13b.token}` },
        });
        assert_1.strict.equal(res14.status, 200);
        const body14 = await res14.json();
        assert_1.strict.equal(body14.email, unverifiedEmail);
        assert_1.strict.equal(body14.emailVerified, true);
        console.log('  ✅ [PASS] 14. Verification status returns accurate emailVerified state');
        // -----------------------------------------------------------------
        // TEST 15: UNIVERSAL RESEND ROUTE
        // -----------------------------------------------------------------
        console.log('\n--- TEST 15: POST /auth/otp/resend ---');
        const resendEmail = `resend_${Date.now()}@finpocket.test`;
        const res15a = await fetch(`${baseUrl}/auth/otp/resend`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ destination: resendEmail, type: 'EMAIL' }),
        });
        assert_1.strict.equal(res15a.status, 200);
        const body15a = await res15a.json();
        assert_1.strict.equal(body15a.success, true);
        assert_1.strict.equal(body15a.expiresInSeconds, 300);
        // Resend within 30s cooldown should return 429
        const res15b = await fetch(`${baseUrl}/auth/otp/resend`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ destination: resendEmail, type: 'EMAIL' }),
        });
        assert_1.strict.equal(res15b.status, 429);
        console.log('  ✅ [PASS] 15. Universal resend endpoint delivers code with cooldown protection');
        console.log('\n====================================================');
        console.log('🎉 ALL EMAIL OTP VERIFICATION TESTS PASSED!');
        console.log('====================================================\n');
    }
    finally {
        server.close();
    }
}
runEmailOtpSuite().catch((err) => {
    console.error('❌ Email OTP Suite Failed:', err);
    process.exit(1);
});
//# sourceMappingURL=email_otp_verification.test.js.map