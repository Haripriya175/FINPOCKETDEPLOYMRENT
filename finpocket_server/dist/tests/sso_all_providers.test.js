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
async function runAllSSOSuite() {
    console.log('\n=============================================================');
    console.log('🔐 FINPOCKET MULTI-PROVIDER SSO TEST SUITE (GOOGLE, META, APPLE)');
    console.log('=============================================================\n');
    await (0, database_js_1.initDatabase)();
    const server = http_1.default.createServer(app);
    await new Promise((resolve) => server.listen(0, resolve));
    const port = server.address().port;
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
        assert_1.strict.equal(gRes1.status, 400);
        console.log('  ✅ [PASS] 1. Google rejected missing token (400)');
        console.log('\n--- TEST 2: GOOGLE SSO NEW USER CREATION ---');
        const gSub = `sub_g_${(0, uuid_1.v4)().substring(0, 8)}`;
        const gEmail = `user_g_${Date.now()}@gmail.com`;
        const gToken = `mock_gtoken:${gSub}:${gEmail}`;
        const gRes2 = await fetch(`${baseUrl}/auth/google`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ idToken: gToken, deviceName: 'Test Google Pixel' }),
        });
        const gData2 = await gRes2.json();
        assert_1.strict.equal(gRes2.status, 200);
        assert_1.strict.ok(gData2.token);
        assert_1.strict.equal(gData2.user.email, gEmail);
        assert_1.strict.equal(gData2.user.ssoProvider, 'google');
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
        assert_1.strict.equal(mRes1.status, 400);
        console.log('  ✅ [PASS] 3. Meta rejected missing access token (400)');
        console.log('\n--- TEST 4: META SSO NEW USER CREATION ---');
        const mSub = `meta_id_${(0, uuid_1.v4)().substring(0, 8)}`;
        const mEmail = `user_meta_${Date.now()}@meta.internal`;
        const mToken = `mock_metatoken:${mSub}:${mEmail}`;
        const mRes2 = await fetch(`${baseUrl}/auth/meta`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ accessToken: mToken, deviceName: 'Test Meta Quest / Phone' }),
        });
        const mData2 = await mRes2.json();
        assert_1.strict.equal(mRes2.status, 200);
        assert_1.strict.ok(mData2.token);
        assert_1.strict.equal(mData2.user.email, mEmail);
        assert_1.strict.equal(mData2.user.ssoProvider, 'meta');
        console.log('  ✅ [PASS] 4. Meta new user registered and issued JWT');
        // Verify identity persisted in database
        const metaIdentity = await (0, database_js_1.getQuery)("SELECT * FROM user_identities WHERE provider = 'meta' AND provider_subject = ?", [mSub]);
        assert_1.strict.ok(metaIdentity, 'Meta identity should be recorded in user_identities table');
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
        assert_1.strict.equal(aRes1.status, 400);
        console.log('  ✅ [PASS] 6. Apple rejected missing ID token (400)');
        console.log('\n--- TEST 7: APPLE SSO NEW USER CREATION ---');
        const aSub = `apple_id_${(0, uuid_1.v4)().substring(0, 8)}`;
        const aEmail = `user_apple_${Date.now()}@privaterelay.appleid.com`;
        const aToken = `mock_appletoken:${aSub}:${aEmail}`;
        const aRes2 = await fetch(`${baseUrl}/auth/apple`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ idToken: aToken, name: 'Apple Verified User', deviceName: 'iPhone 16 Pro' }),
        });
        const aData2 = await aRes2.json();
        assert_1.strict.equal(aRes2.status, 200);
        assert_1.strict.ok(aData2.token);
        assert_1.strict.equal(aData2.user.email, aEmail);
        assert_1.strict.equal(aData2.user.ssoProvider, 'apple');
        console.log('  ✅ [PASS] 7. Apple new user registered and issued JWT');
        // -------------------------------------------------------------
        // PART 4: SECURITY - ACCOUNT TAKEOVER PROTECTION
        // -------------------------------------------------------------
        console.log('\n--- TEST 8: ACCOUNT TAKEOVER PROTECTION (CONFLICT 409) ---');
        // If a user with this email registered via standard password, an unlinked SSO login must be blocked
        const conflictEmail = `conflict_${Date.now()}@example.com`;
        await (0, database_js_1.runQuery)(`INSERT INTO users (id, name, email, password_hash, phone_verified)
       VALUES (?, 'Existing Password User', ?, 'dummy_hash', 1)`, [`usr_pass_${(0, uuid_1.v4)().substring(0, 6)}`, conflictEmail]);
        const conflictMetaRes = await fetch(`${baseUrl}/auth/meta`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ accessToken: `mock_metatoken:meta_attacker:${conflictEmail}` }),
        });
        assert_1.strict.equal(conflictMetaRes.status, 409);
        const conflictData = await conflictMetaRes.json();
        assert_1.strict.equal(conflictData.error, 'ACCOUNT_EXISTS_UNLINKED');
        console.log('  ✅ [PASS] 8. Account takeover blocked with 409 ACCOUNT_EXISTS_UNLINKED');
        console.log('\n=============================================================');
        console.log('🎉 ALL SSO PROVIDER VALIDATION TESTS PASSED SUCCESSFULLY! (100%)');
        console.log('=============================================================\n');
    }
    finally {
        server.close();
    }
}
runAllSSOSuite().catch((err) => {
    console.error('\n❌ SSO Test Suite Failed:', err);
    process.exit(1);
});
//# sourceMappingURL=sso_all_providers.test.js.map