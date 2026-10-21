import { strict as assert } from 'assert';
import http from 'http';
import express from 'express';
import { v4 as uuidv4 } from 'uuid';
import authRoutes from '../routes/auth.routes.js';
import { initDatabase, runQuery, getQuery } from '../config/database.js';

process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test_jwt_secret_32_characters_minimum_len!';

const app = express();
app.use(express.json());
app.use('/auth', authRoutes);

async function runGoogleSSOSuite() {
  console.log('\n====================================================');
  console.log('🔐 FINPOCKET GOOGLE SSO & FEDERATED AUTH TEST SUITE');
  console.log('====================================================\n');

  await initDatabase();

  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, resolve));
  const port = (server.address() as any).port;
  const baseUrl = `http://127.0.0.1:${port}`;

  try {
    // 1. Missing ID token should return 400
    console.log('--- TEST 1: REJECT MISSING GOOGLE ID TOKEN ---');
    const res1 = await fetch(`${baseUrl}/auth/google`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    const body1: any = await res1.json();
    assert.equal(res1.status, 400);
    assert.equal(body1.error, 'Google ID token is required');
    console.log('  ✅ [PASS] 1. Missing Google ID token rejected with 400');

    // 2. Invalid ID token should return 401
    console.log('\n--- TEST 2: REJECT INVALID GOOGLE ID TOKEN ---');
    const res2 = await fetch(`${baseUrl}/auth/google`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ idToken: 'invalid_malformed_token_123' }),
    });
    const body2: any = await res2.json();
    assert.equal(res2.status, 401);
    assert.equal(body2.error, 'INVALID_GOOGLE_TOKEN');
    console.log('  ✅ [PASS] 2. Invalid token rejected with 401 INVALID_GOOGLE_TOKEN');

    // 3. New Google User signs in with verified mock token
    console.log('\n--- TEST 3: NEW GOOGLE USER FEDERATED SIGN-UP ---');
    const mockSubNew = `sub_google_${uuidv4().substring(0, 8)}`;
    const mockEmailNew = `googleuser_${Date.now()}@gmail.com`;
    const mockTokenNew = `mock_gtoken:${mockSubNew}:${mockEmailNew}`;

    const res3 = await fetch(`${baseUrl}/auth/google`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ idToken: mockTokenNew, deviceName: 'Google Pixel 8' }),
    });
    const body3: any = await res3.json();
    if (res3.status !== 200) {
      console.error('Test 3 Failed response body:', body3);
    }
    assert.equal(res3.status, 200);
    assert.ok(body3.token, 'FinPocket access token issued');
    assert.ok(body3.refreshToken, 'FinPocket refresh token issued');
    assert.equal(body3.isNewUser, true);
    assert.equal(body3.user.email, mockEmailNew.toLowerCase());

    // Verify identity row was created with provider=google and sub
    const identityRow = await getQuery<any>(
      'SELECT * FROM user_identities WHERE provider = ? AND provider_subject = ?',
      ['google', mockSubNew]
    );
    assert.ok(identityRow, 'Identity mapping persisted in user_identities table');
    assert.equal(identityRow.user_id, body3.user.id);
    console.log('  ✅ [PASS] 3. New Google user creates account with user_identities mapping');

    // 4. Existing Google User logs in again (should not duplicate user)
    console.log('\n--- TEST 4: EXISTING GOOGLE USER LOGIN VIA SUB ---');
    const res4 = await fetch(`${baseUrl}/auth/google`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ idToken: mockTokenNew, deviceName: 'Google Pixel 8' }),
    });
    const body4: any = await res4.json();
    assert.equal(res4.status, 200);
    assert.equal(body4.isNewUser, false);
    assert.equal(body4.user.id, body3.user.id);
    console.log('  ✅ [PASS] 4. Existing Google user logs in via sub without duplicate');

    // 5. SECURITY DEFENSE: Prevent Account Takeover
    // Existing password user with email 'victim@example.com'.
    // Google sign in arrives with same email but new/unlinked sub -> MUST RETURN 409!
    console.log('\n--- TEST 5: PREVENT SILENT ACCOUNT TAKEOVER ON MATCHING EMAIL ---');
    const victimEmail = `victim_${Date.now()}@gmail.com`;
    const victimUserId = `usr_${uuidv4().substring(0, 8)}`;
    await runQuery(
      "INSERT INTO users (id, name, email, password_hash) VALUES (?, 'Victim User', ?, 'hashed_pass_xyz')",
      [victimUserId, victimEmail]
    );

    const unlinkedSub = `sub_google_${uuidv4().substring(0, 8)}`;
    const takeoverAttemptToken = `mock_gtoken:${unlinkedSub}:${victimEmail}`;

    const res5 = await fetch(`${baseUrl}/auth/google`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ idToken: takeoverAttemptToken }),
    });
    const body5: any = await res5.json();
    assert.equal(res5.status, 409, 'Must return 409 Conflict');
    assert.equal(body5.error, 'ACCOUNT_EXISTS_UNLINKED');
    console.log('  ✅ [PASS] 5. Silent account takeover blocked with 409 ACCOUNT_EXISTS_UNLINKED');

    // 6. Explicit Account Linking: User authenticates with FinPocket session first, then links
    console.log('\n--- TEST 6: EXPLICIT GOOGLE ACCOUNT LINKING ---');
    const linkRes = await fetch(`${baseUrl}/auth/google/link`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${body3.token}`,
      },
      body: JSON.stringify({ idToken: mockTokenNew }),
    });
    const linkBody: any = await linkRes.json();
    assert.equal(linkRes.status, 200);
    assert.equal(linkBody.success, true);
    console.log('  ✅ [PASS] 6. Authenticated user explicitly links Google account');

    // 7. Check Google Status endpoint
    console.log('\n--- TEST 7: GET GOOGLE LINKED STATUS ---');
    const statusRes = await fetch(`${baseUrl}/auth/google/status`, {
      headers: { Authorization: `Bearer ${body3.token}` },
    });
    const statusBody: any = await statusRes.json();
    assert.equal(statusRes.status, 200);
    assert.equal(statusBody.isLinked, true);
    assert.equal(statusBody.linkedEmail, mockEmailNew.toLowerCase());
    console.log('  ✅ [PASS] 7. Google linked status correctly reports linked state');

    // 8. Explicit Google Unlink
    console.log('\n--- TEST 8: EXPLICIT GOOGLE ACCOUNT UNLINK ---');
    const unlinkRes = await fetch(`${baseUrl}/auth/google/unlink`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${body3.token}` },
    });
    const unlinkBody: any = await unlinkRes.json();
    assert.equal(unlinkRes.status, 200);
    assert.equal(unlinkBody.success, true);

    const statusAfterUnlink = await fetch(`${baseUrl}/auth/google/status`, {
      headers: { Authorization: `Bearer ${body3.token}` },
    });
    const statusAfterBody: any = await statusAfterUnlink.json();
    assert.equal(statusAfterBody.isLinked, false);
    console.log('  ✅ [PASS] 8. Google account successfully unlinked');

    console.log('\n====================================================');
    console.log('🎉 ALL GOOGLE SSO & FEDERATED TESTS PASSED (8/8)');
    console.log('====================================================\n');
  } finally {
    server.close();
  }
}

runGoogleSSOSuite().catch(err => {
  console.error('Test Suite Failed:', err);
  process.exit(1);
});
