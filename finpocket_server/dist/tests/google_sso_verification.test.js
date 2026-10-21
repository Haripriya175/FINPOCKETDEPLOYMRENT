"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const assert_1 = require("assert");
const http_1 = __importDefault(require("http"));
const express_1 = __importDefault(require("express"));
const uuid_1 = require("uuid");
const auth_routes_js_1 = __importDefault(require("../routes/auth.routes.js"));
const database_js_1 = require("../config/database.js");
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test_jwt_secret_32_characters_minimum_len!';
const app = (0, express_1.default)();
app.use(express_1.default.json());
app.use('/auth', auth_routes_js_1.default);
async function runGoogleSSOSuite() {
    console.log('\n====================================================');
    console.log('🔐 FINPOCKET GOOGLE SSO & FEDERATED AUTH TEST SUITE');
    console.log('====================================================\n');
    await (0, database_js_1.initDatabase)();
    const server = http_1.default.createServer(app);
    await new Promise((resolve) => server.listen(0, resolve));
    const port = server.address().port;
    const baseUrl = `http://127.0.0.1:${port}`;
    try {
        // 1. Missing ID token should return 400
        console.log('--- TEST 1: REJECT MISSING GOOGLE ID TOKEN ---');
        const res1 = await fetch(`${baseUrl}/auth/google`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({}),
        });
        const body1 = await res1.json();
        assert_1.strict.equal(res1.status, 400);
        assert_1.strict.equal(body1.error, 'Google ID token is required');
        console.log('  ✅ [PASS] 1. Missing Google ID token rejected with 400');
        // 2. Invalid ID token should return 401
        console.log('\n--- TEST 2: REJECT INVALID GOOGLE ID TOKEN ---');
        const res2 = await fetch(`${baseUrl}/auth/google`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ idToken: 'invalid_malformed_token_123' }),
        });
        const body2 = await res2.json();
        assert_1.strict.equal(res2.status, 401);
        assert_1.strict.equal(body2.error, 'INVALID_GOOGLE_TOKEN');
        console.log('  ✅ [PASS] 2. Invalid token rejected with 401 INVALID_GOOGLE_TOKEN');
        // 3. New Google User signs in with verified mock token
        console.log('\n--- TEST 3: NEW GOOGLE USER FEDERATED SIGN-UP ---');
        const mockSubNew = `sub_google_${(0, uuid_1.v4)().substring(0, 8)}`;
        const mockEmailNew = `googleuser_${Date.now()}@gmail.com`;
        const mockTokenNew = `mock_gtoken:${mockSubNew}:${mockEmailNew}`;
        const res3 = await fetch(`${baseUrl}/auth/google`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ idToken: mockTokenNew, deviceName: 'Google Pixel 8' }),
        });
        const body3 = await res3.json();
        if (res3.status !== 200) {
            console.error('Test 3 Failed response body:', body3);
        }
        assert_1.strict.equal(res3.status, 200);
        assert_1.strict.ok(body3.token, 'FinPocket access token issued');
        assert_1.strict.ok(body3.refreshToken, 'FinPocket refresh token issued');
        assert_1.strict.equal(body3.isNewUser, true);
        assert_1.strict.equal(body3.user.email, mockEmailNew.toLowerCase());
        // Verify identity row was created with provider=google and sub
        const identityRow = await (0, database_js_1.getQuery)('SELECT * FROM user_identities WHERE provider = ? AND provider_subject = ?', ['google', mockSubNew]);
        assert_1.strict.ok(identityRow, 'Identity mapping persisted in user_identities table');
        assert_1.strict.equal(identityRow.user_id, body3.user.id);
        console.log('  ✅ [PASS] 3. New Google user creates account with user_identities mapping');
        // 4. Existing Google User logs in again (should not duplicate user)
        console.log('\n--- TEST 4: EXISTING GOOGLE USER LOGIN VIA SUB ---');
        const res4 = await fetch(`${baseUrl}/auth/google`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ idToken: mockTokenNew, deviceName: 'Google Pixel 8' }),
        });
        const body4 = await res4.json();
        assert_1.strict.equal(res4.status, 200);
        assert_1.strict.equal(body4.isNewUser, false);
        assert_1.strict.equal(body4.user.id, body3.user.id);
        console.log('  ✅ [PASS] 4. Existing Google user logs in via sub without duplicate');
        // 5. SECURITY DEFENSE: Prevent Account Takeover
        // Existing password user with email 'victim@example.com'.
        // Google sign in arrives with same email but new/unlinked sub -> MUST RETURN 409!
        console.log('\n--- TEST 5: PREVENT SILENT ACCOUNT TAKEOVER ON MATCHING EMAIL ---');
        const victimEmail = `victim_${Date.now()}@gmail.com`;
        const victimUserId = `usr_${(0, uuid_1.v4)().substring(0, 8)}`;
        await (0, database_js_1.runQuery)("INSERT INTO users (id, name, email, password_hash) VALUES (?, 'Victim User', ?, 'hashed_pass_xyz')", [victimUserId, victimEmail]);
        const unlinkedSub = `sub_google_${(0, uuid_1.v4)().substring(0, 8)}`;
        const takeoverAttemptToken = `mock_gtoken:${unlinkedSub}:${victimEmail}`;
        const res5 = await fetch(`${baseUrl}/auth/google`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ idToken: takeoverAttemptToken }),
        });
        const body5 = await res5.json();
        assert_1.strict.equal(res5.status, 409, 'Must return 409 Conflict');
        assert_1.strict.equal(body5.error, 'ACCOUNT_EXISTS_UNLINKED');
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
        const linkBody = await linkRes.json();
        assert_1.strict.equal(linkRes.status, 200);
        assert_1.strict.equal(linkBody.success, true);
        console.log('  ✅ [PASS] 6. Authenticated user explicitly links Google account');
        // 7. Check Google Status endpoint
        console.log('\n--- TEST 7: GET GOOGLE LINKED STATUS ---');
        const statusRes = await fetch(`${baseUrl}/auth/google/status`, {
            headers: { Authorization: `Bearer ${body3.token}` },
        });
        const statusBody = await statusRes.json();
        assert_1.strict.equal(statusRes.status, 200);
        assert_1.strict.equal(statusBody.isLinked, true);
        assert_1.strict.equal(statusBody.linkedEmail, mockEmailNew.toLowerCase());
        console.log('  ✅ [PASS] 7. Google linked status correctly reports linked state');
        // 8. Explicit Google Unlink
        console.log('\n--- TEST 8: EXPLICIT GOOGLE ACCOUNT UNLINK ---');
        const unlinkRes = await fetch(`${baseUrl}/auth/google/unlink`, {
            method: 'POST',
            headers: { Authorization: `Bearer ${body3.token}` },
        });
        const unlinkBody = await unlinkRes.json();
        assert_1.strict.equal(unlinkRes.status, 200);
        assert_1.strict.equal(unlinkBody.success, true);
        const statusAfterUnlink = await fetch(`${baseUrl}/auth/google/status`, {
            headers: { Authorization: `Bearer ${body3.token}` },
        });
        const statusAfterBody = await statusAfterUnlink.json();
        assert_1.strict.equal(statusAfterBody.isLinked, false);
        console.log('  ✅ [PASS] 8. Google account successfully unlinked');
        console.log('\n====================================================');
        console.log('🎉 ALL GOOGLE SSO & FEDERATED TESTS PASSED (8/8)');
        console.log('====================================================\n');
    }
    finally {
        server.close();
    }
}
runGoogleSSOSuite().catch(err => {
    console.error('Test Suite Failed:', err);
    process.exit(1);
});
//# sourceMappingURL=google_sso_verification.test.js.map