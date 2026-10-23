import { strict as assert } from 'assert';
import http from 'http';
import express from 'express';
import authRoutes from '../routes/auth.routes.js';
import { initDatabase, runQuery, getQuery } from '../config/database.js';
import { EmailService } from '../services/email.service.js';
import { OtpService } from '../services/otp.service.js';
import { installTurnstileTestMock, testTurnstileToken } from './turnstile_test_helper.js';

process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test_jwt_secret_32_characters_minimum_len!';
installTurnstileTestMock();

const app = express();
app.use(express.json());
app.use('/auth', authRoutes);

async function runEmailOtpSuite() {
  console.log('\n====================================================');
  console.log('📧 FINPOCKET EMAIL OTP VERIFICATION TEST SUITE');
  console.log('====================================================\n');

  await initDatabase();

  // Set mock nodemailer transporter to intercept outbound emails safely without real network calls
  EmailService.setMockTransporter({
    sendMail: async (mailOptions: any) => ({
      messageId: `mock_${Date.now()}`,
      response: '250 OK',
    }),
  } as any);

  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, resolve));
  const port = (server.address() as any).port;
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
    assert.equal(res1a.status, 400);

    const res1b = await fetch(`${baseUrl}/auth/email/send-otp`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'attacker@mailinator.com' }),
    });
    assert.equal(res1b.status, 400);
    const body1b: any = await res1b.json();
    assert.match(body1b.error, /disposable/i);
    console.log('  ✅ [PASS] 1. Malformed and disposable email domains rejected with 400');

    // -----------------------------------------------------------------
    // TEST 2: SUCCESSFUL OTP GENERATION & MOCK EMAIL DELIVERY
    // -----------------------------------------------------------------
    console.log('\n--- TEST 2: SUCCESSFUL OTP GENERATION & MOCK EMAIL DELIVERY ---');
    EmailService.clearSentMails();
    const testEmail1 = `verify_test_${Date.now()}@finpocket.test`;

    const missingCaptcha = await fetch(`${baseUrl}/auth/email/send-otp`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: testEmail1 }),
    });
    assert.equal(missingCaptcha.status, 400);

    const rejectedCaptcha = await fetch(`${baseUrl}/auth/email/send-otp`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: testEmail1, captchaToken: 'invalid-test-token' }),
    });
    assert.equal(rejectedCaptcha.status, 400);

    const configuredSecret = process.env.TURNSTILE_SECRET_KEY;
    delete process.env.TURNSTILE_SECRET_KEY;
    const missingConfiguration = await fetch(`${baseUrl}/auth/email/send-otp`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: testEmail1, captchaToken: testTurnstileToken }),
    });
    if (configuredSecret === undefined) delete process.env.TURNSTILE_SECRET_KEY;
    else process.env.TURNSTILE_SECRET_KEY = configuredSecret;
    assert.equal(missingConfiguration.status, 503);

    const res2 = await fetch(`${baseUrl}/auth/email/send-otp`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: testEmail1, captchaToken: testTurnstileToken }),
    });
    assert.equal(res2.status, 200);
    const body2: any = await res2.json();
    assert.equal(body2.success, true);
    assert.equal(body2.expiresInSeconds, 300);
    assert.equal(body2.resendCooldownSeconds, 30);

    const sentMails = EmailService.getSentMails();
    assert.equal(sentMails.length, 1);
    assert.equal(sentMails[0].to, testEmail1);
    assert.match(sentMails[0].text, /5 minutes/);
    const otpMatch = sentMails[0].text.match(/\b\d{6}\b/);
    assert.ok(otpMatch, 'Delivered email must contain 6-digit OTP');
    const sentOtp1 = otpMatch[0];
    console.log('  ✅ [PASS] 2. 6-digit OTP generated and delivered with 5-minute expiry');

    // -----------------------------------------------------------------
    // TEST 3: DATABASE PERSISTENCE & ZERO PLAINTEXT HASH CHECK
    // -----------------------------------------------------------------
    console.log('\n--- TEST 3: HASH-AT-REST STORAGE (NO PLAINTEXT OTP IN DB) ---');
    const dbRecord = await getQuery<any>(
      'SELECT * FROM otp_verifications WHERE destination = ? ORDER BY created_at DESC LIMIT 1',
      [testEmail1]
    );
    assert.ok(dbRecord, 'Record must exist in otp_verifications');
    assert.equal(dbRecord.destination, testEmail1);
    assert.equal(dbRecord.purpose, 'REGISTRATION_EMAIL');
    assert.notEqual(dbRecord.otp_hash, sentOtp1, 'DB must never store plaintext OTP');
    assert.equal(dbRecord.otp_hash.length, 64, 'SHA-256 HMAC must be 64 hex characters');
    assert.ok(dbRecord.salt && dbRecord.salt.length === 32, '16-byte salt must be 32 hex characters');
    console.log('  ✅ [PASS] 3. Database stores keyed HMAC-SHA256 with random salt; zero plaintext OTP');

    // -----------------------------------------------------------------
    // TEST 4: RESEND COOLDOWN ENFORCEMENT
    // -----------------------------------------------------------------
    console.log('\n--- TEST 4: RESEND COOLDOWN ENFORCEMENT (30s) ---');
    const res4 = await fetch(`${baseUrl}/auth/email/send-otp`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: testEmail1, captchaToken: testTurnstileToken }),
    });
    assert.equal(res4.status, 429);
    const body4: any = await res4.json();
    assert.match(body4.error, /Please wait/);
    assert.ok(body4.retryAfterSeconds > 0 && body4.retryAfterSeconds <= 30);
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
    assert.equal(res5.status, 400);
    const body5: any = await res5.json();
    assert.match(body5.error, /Invalid verification code/);
    assert.equal(body5.remainingAttempts, 4);

    const dbRecordAfterFail = await getQuery<any>(
      'SELECT attempts FROM otp_verifications WHERE id = ?',
      [dbRecord.id]
    );
    assert.equal(dbRecordAfterFail.attempts, 1);
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
    assert.ok(res6.status === 429 || res6.status === 400);
    const body6: any = await res6.json();
    assert.match(body6.error, /expired or is invalid|Too many incorrect attempts/i);
    console.log('  ✅ [PASS] 6. Code permanently locked after 5 failed attempts');

    // -----------------------------------------------------------------
    // TEST 7: SUCCESSFUL VERIFICATION & SINGLE-USE CONSUMPTION
    // -----------------------------------------------------------------
    console.log('\n--- TEST 7: SUCCESSFUL OTP VERIFICATION ---');
    const testEmail2 = `valid_verify_${Date.now()}@finpocket.test`;
    const issueRes7 = await OtpService.issueOtp({
      destination: testEmail2,
      destinationType: 'EMAIL',
      purpose: 'REGISTRATION_EMAIL',
    });
    assert.ok(issueRes7.otp);

    const res7 = await fetch(`${baseUrl}/auth/email/verify-otp`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: testEmail2, otp: issueRes7.otp }),
    });
    assert.equal(res7.status, 200);
    const body7: any = await res7.json();
    assert.equal(body7.verified, true);
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
    assert.equal(res8.status, 400);
    const body8: any = await res8.json();
    assert.match(body8.error, /expired or is invalid/i);
    console.log('  ✅ [PASS] 8. Replay attack on consumed code rejected');

    // -----------------------------------------------------------------
    // TEST 9: EXPIRED OTP REJECTION
    // -----------------------------------------------------------------
    console.log('\n--- TEST 9: EXPIRED OTP ENFORCEMENT ---');
    const testEmail3 = `expired_test_${Date.now()}@finpocket.test`;
    const issueRes9 = await OtpService.issueOtp({
      destination: testEmail3,
      destinationType: 'EMAIL',
      purpose: 'REGISTRATION_EMAIL',
    });
    assert.ok(issueRes9.otp);

    // Manually backdate expiration in database to simulate passage of 5 minutes
    const pastTimestamp = new Date(Date.now() - 10000).toISOString();
    await runQuery(
      'UPDATE otp_verifications SET expires_at = ? WHERE destination = ?',
      [pastTimestamp, testEmail3]
    );

    const res9 = await fetch(`${baseUrl}/auth/email/verify-otp`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: testEmail3, otp: issueRes9.otp }),
    });
    assert.equal(res9.status, 400);
    const body9: any = await res9.json();
    assert.match(body9.error, /expired/i);
    console.log('  ✅ [PASS] 9. Expired OTP strictly rejected');

    // -----------------------------------------------------------------
    // TEST 10: SMTP FAILURE HANDLING
    // -----------------------------------------------------------------
    console.log('\n--- TEST 10: SMTP FAILURE HANDLING ---');
    EmailService.setMockTransporter({
      sendMail: async () => {
        const timeoutErr: any = new Error('Connection timeout');
        timeoutErr.code = 'ETIMEDOUT';
        throw timeoutErr;
      },
    } as any);

    const failEmail = `smtp_fail_${Date.now()}@finpocket.test`;
    // The local .env may enable development OTP exposure. Disable that
    // development-only fallback so this case exercises fail-closed delivery.
    const previousExposeOtp = process.env.DEV_EXPOSE_OTP;
    process.env.DEV_EXPOSE_OTP = 'false';
    const resFail = await fetch(`${baseUrl}/auth/email/send-otp`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: failEmail, captchaToken: testTurnstileToken }),
    });
    if (previousExposeOtp === undefined) delete process.env.DEV_EXPOSE_OTP;
    else process.env.DEV_EXPOSE_OTP = previousExposeOtp;
    assert.equal(resFail.status, 500);
    const failBody: any = await resFail.json();
    assert.match(failBody.error, /Failed to deliver/);
    console.log('  ✅ [PASS] 10. SMTP failure handled gracefully with HTTP 500 without crashing');

    // Restore working mock transporter for remaining tests
    EmailService.setMockTransporter({
      sendMail: async () => ({ messageId: 'mock-msg-ok' }),
    } as any);

    // -----------------------------------------------------------------
    // TEST 11: CONCURRENT VERIFICATION RACE CONDITION
    // -----------------------------------------------------------------
    console.log('\n--- TEST 11: CONCURRENT VERIFICATION SAFETY ---');
    const testEmail4 = `concurrent_test_${Date.now()}@finpocket.test`;
    const issueRes11 = await OtpService.issueOtp({
      destination: testEmail4,
      destinationType: 'EMAIL',
      purpose: 'REGISTRATION_EMAIL',
    });
    assert.ok(issueRes11.otp);

    // Fire 5 concurrent verify requests with the same valid OTP
    const concurrentPromises = Array.from({ length: 5 }, () =>
      fetch(`${baseUrl}/auth/email/verify-otp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: testEmail4, otp: issueRes11.otp }),
      })
    );
    const concurrentResults = await Promise.all(concurrentPromises);
    const statuses = concurrentResults.map((r) => r.status);
    const successCount = statuses.filter((s) => s === 200).length;
    const failureCount = statuses.filter((s) => s !== 200).length;

    assert.equal(successCount, 1, 'Exactly one concurrent verification must succeed');
    assert.equal(failureCount, 4, 'All subsequent concurrent verifications must fail');
    console.log('  ✅ [PASS] 11. Concurrency-safe: Exactly 1 verify succeeded, 4 rejected');

    // -----------------------------------------------------------------
    // TEST 12: DESTINATION & PURPOSE BINDING
    // -----------------------------------------------------------------
    console.log('\n--- TEST 12: DESTINATION & PURPOSE BINDING ---');
    const testEmail5 = `dest_bound_a_${Date.now()}@finpocket.test`;
    const testEmailOther = `dest_bound_b_${Date.now()}@finpocket.test`;
    const issueRes12 = await OtpService.issueOtp({
      destination: testEmail5,
      destinationType: 'EMAIL',
      purpose: 'REGISTRATION_EMAIL',
    });
    assert.ok(issueRes12.otp);

    // Try applying code issued for Email A to Email B
    const res12a = await fetch(`${baseUrl}/auth/email/verify-otp`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: testEmailOther, otp: issueRes12.otp }),
    });
    assert.equal(res12a.status, 400);

    // Try applying code with different purpose
    const res12b = await OtpService.verifyOtp({
      destination: testEmail5,
      purpose: 'PASSWORD_RESET',
      otp: issueRes12.otp,
    });
    assert.equal(res12b.verified, false);
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
        captchaToken: testTurnstileToken,
      }),
    });
    assert.equal(res13a.status, 400);
    const body13a: any = await res13a.json();
    assert.match(body13a.error, /verify your email address/i);
    console.log('  ✅ [PASS] 13. Registration blocked for unverified email address');

    // Now verify the email address properly
    const issueRes13 = await OtpService.issueOtp({
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
        captchaToken: testTurnstileToken,
      }),
    });
    assert.equal(res13b.status, 201);
    const body13b: any = await res13b.json();
    assert.ok(body13b.token);
    assert.ok(body13b.user.id);

    // Check users table in database: email_verified must be 1
    const registeredUser = await getQuery<any>('SELECT email_verified FROM users WHERE id = ?', [body13b.user.id]);
    assert.equal(registeredUser.email_verified, 1);
    console.log('  ✅ [PASS] 13b. Registration succeeds after email OTP verification; email_verified set to 1');

    // -----------------------------------------------------------------
    // TEST 14: VERIFICATION STATUS ENDPOINT
    // -----------------------------------------------------------------
    console.log('\n--- TEST 14: GET /auth/verification-status ---');
    const res14 = await fetch(`${baseUrl}/auth/verification-status`, {
      method: 'GET',
      headers: { Authorization: `Bearer ${body13b.token}` },
    });
    assert.equal(res14.status, 200);
    const body14: any = await res14.json();
    assert.equal(body14.email, unverifiedEmail);
    assert.equal(body14.emailVerified, true);
    console.log('  ✅ [PASS] 14. Verification status returns accurate emailVerified state');

    // -----------------------------------------------------------------
    // TEST 15: UNIVERSAL RESEND ROUTE
    // -----------------------------------------------------------------
    console.log('\n--- TEST 15: POST /auth/otp/resend ---');
    const resendEmail = `resend_${Date.now()}@finpocket.test`;
    const res15a = await fetch(`${baseUrl}/auth/otp/resend`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ destination: resendEmail, type: 'EMAIL', captchaToken: testTurnstileToken }),
    });
    assert.equal(res15a.status, 200);
    const body15a: any = await res15a.json();
    assert.equal(body15a.success, true);
    assert.equal(body15a.expiresInSeconds, 300);

    // Resend within 30s cooldown should return 429
    const res15b = await fetch(`${baseUrl}/auth/otp/resend`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ destination: resendEmail, type: 'EMAIL', captchaToken: testTurnstileToken }),
    });
    assert.equal(res15b.status, 429);
    console.log('  ✅ [PASS] 15. Universal resend endpoint delivers code with cooldown protection');

    console.log('\n====================================================');
    console.log('🎉 ALL EMAIL OTP VERIFICATION TESTS PASSED!');
    console.log('====================================================\n');
  } finally {
    server.close();
  }
}

runEmailOtpSuite().catch((err) => {
  console.error('❌ Email OTP Suite Failed:', err);
  process.exit(1);
});
