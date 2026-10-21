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

async function runAllSSOSuite() {
  console.log('\n=============================================================');
  console.log('🔐 FINPOCKET MULTI-PROVIDER SSO TEST SUITE (GOOGLE, META, APPLE)');
  console.log('=============================================================\n');

  await initDatabase();

  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, resolve));
  const port = (server.address() as any).port;
  const baseUrl = `http://127.0.0.1:${port}`;

  try {
    // -------------------------------------------------------------
    // PART 1: GOOGLE SSO TESTS
    // -------------------------------------------------------------
    console.log('--- TEST 1: GOOGLE SSO REJECTS MISSING TOKEN ---');
    const gRes1 = await fetch(`${baseUrl}/auth/google`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    assert.equal(gRes1.status, 400);
    console.log('  ✅ [PASS] 1. Google rejected missing token (400)');

    console.log('\n--- TEST 2: GOOGLE SSO NEW USER CREATION ---');
    const gSub = `sub_g_${uuidv4().substring(0, 8)}`;
    const gEmail = `user_g_${Date.now()}@gmail.com`;
    const gToken = `mock_gtoken:${gSub}:${gEmail}`;

    const gRes2 = await fetch(`${baseUrl}/auth/google`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ idToken: gToken, deviceName: 'Test Google Pixel' }),
    });
    const gData2: any = await gRes2.json();
    assert.equal(gRes2.status, 200);
    assert.ok(gData2.token);
    assert.equal(gData2.user.email, gEmail);
    assert.equal(gData2.user.ssoProvider, 'google');
    console.log('  ✅ [PASS] 2. Google new user registered and issued JWT');

    // -------------------------------------------------------------
    // PART 2: META (FACEBOOK) SSO TESTS
    // -------------------------------------------------------------
    console.log('\n--- TEST 3: META SSO REJECTS MISSING TOKEN ---');
    const mRes1 = await fetch(`${baseUrl}/auth/meta`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    assert.equal(mRes1.status, 400);
    console.log('  ✅ [PASS] 3. Meta rejected missing access token (400)');

    console.log('\n--- TEST 4: META SSO NEW USER CREATION ---');
    const mSub = `meta_id_${uuidv4().substring(0, 8)}`;
    const mEmail = `user_meta_${Date.now()}@meta.internal`;
    const mToken = `mock_metatoken:${mSub}:${mEmail}`;

    const mRes2 = await fetch(`${baseUrl}/auth/meta`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ accessToken: mToken, deviceName: 'Test Meta Quest / Phone' }),
    });
    const mData2: any = await mRes2.json();
    assert.equal(mRes2.status, 200);
    assert.ok(mData2.token);
    assert.equal(mData2.user.email, mEmail);
    assert.equal(mData2.user.ssoProvider, 'meta');
    console.log('  ✅ [PASS] 4. Meta new user registered and issued JWT');

    // Verify identity persisted in database
    const metaIdentity = await getQuery<any>(
      "SELECT * FROM user_identities WHERE provider = 'meta' AND provider_subject = ?",
      [mSub]
    );
    assert.ok(metaIdentity, 'Meta identity should be recorded in user_identities table');
    console.log('  ✅ [PASS] 5. Meta user_identities record confirmed in database');

    // -------------------------------------------------------------
    // PART 3: APPLE SSO TESTS
    // -------------------------------------------------------------
    console.log('\n--- TEST 6: APPLE SSO REJECTS MISSING TOKEN ---');
    const aRes1 = await fetch(`${baseUrl}/auth/apple`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    assert.equal(aRes1.status, 400);
    console.log('  ✅ [PASS] 6. Apple rejected missing ID token (400)');

    console.log('\n--- TEST 7: APPLE SSO NEW USER CREATION ---');
    const aSub = `apple_id_${uuidv4().substring(0, 8)}`;
    const aEmail = `user_apple_${Date.now()}@privaterelay.appleid.com`;
    const aToken = `mock_appletoken:${aSub}:${aEmail}`;

    const aRes2 = await fetch(`${baseUrl}/auth/apple`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ idToken: aToken, name: 'Apple Verified User', deviceName: 'iPhone 16 Pro' }),
    });
    const aData2: any = await aRes2.json();
    assert.equal(aRes2.status, 200);
    assert.ok(aData2.token);
    assert.equal(aData2.user.email, aEmail);
    assert.equal(aData2.user.ssoProvider, 'apple');
    console.log('  ✅ [PASS] 7. Apple new user registered and issued JWT');

    // -------------------------------------------------------------
    // PART 4: SECURITY - ACCOUNT TAKEOVER PROTECTION
    // -------------------------------------------------------------
    console.log('\n--- TEST 8: ACCOUNT TAKEOVER PROTECTION (CONFLICT 409) ---');
    // If a user with this email registered via standard password, an unlinked SSO login must be blocked
    const conflictEmail = `conflict_${Date.now()}@example.com`;
    await runQuery(
      `INSERT INTO users (id, name, email, password_hash, phone_verified)
       VALUES (?, 'Existing Password User', ?, 'dummy_hash', 1)`,
      [`usr_pass_${uuidv4().substring(0, 6)}`, conflictEmail]
    );

    const conflictMetaRes = await fetch(`${baseUrl}/auth/meta`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ accessToken: `mock_metatoken:meta_attacker:${conflictEmail}` }),
    });
    assert.equal(conflictMetaRes.status, 409);
    const conflictData: any = await conflictMetaRes.json();
    assert.equal(conflictData.error, 'ACCOUNT_EXISTS_UNLINKED');
    console.log('  ✅ [PASS] 8. Account takeover blocked with 409 ACCOUNT_EXISTS_UNLINKED');

    console.log('\n=============================================================');
    console.log('🎉 ALL SSO PROVIDER VALIDATION TESTS PASSED SUCCESSFULLY! (100%)');
    console.log('=============================================================\n');
  } finally {
    server.close();
  }
}

runAllSSOSuite().catch((err) => {
  console.error('\n❌ SSO Test Suite Failed:', err);
  process.exit(1);
});
