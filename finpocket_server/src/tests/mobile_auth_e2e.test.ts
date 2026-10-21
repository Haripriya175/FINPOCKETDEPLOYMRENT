import http from 'http';

function makeRequest(options: http.RequestOptions, body?: any): Promise<{ statusCode: number; body: any; headers: http.IncomingHttpHeaders }> {
  return new Promise((resolve, reject) => {
    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        let parsed = data;
        try {
          parsed = JSON.parse(data);
        } catch (_) {}
        resolve({ statusCode: res.statusCode || 0, body: parsed, headers: res.headers });
      });
    });
    req.on('error', reject);
    if (body) {
      req.write(typeof body === 'string' ? body : JSON.stringify(body));
    }
    req.end();
  });
}

async function runMobileAuthE2E() {
  console.log('\n====================================================');
  console.log('📱 FINPOCKET MOBILE AUTHENTICATION E2E TEST');
  console.log('====================================================\n');

  const testEmail = `flutter_mobile_user_${Date.now()}@finpocket.test`;
  const testPassword = 'MobileAuthSecure@2026';
  const testName = 'Flutter Mobile Test User';

  // 1. Health check
  console.log('1. Checking backend health...');
  const healthRes = await makeRequest({
    hostname: 'localhost',
    port: 3001,
    path: '/health/ready',
    method: 'GET'
  });
  if (healthRes.statusCode !== 200) {
    throw new Error(`Health check failed: ${JSON.stringify(healthRes.body)}`);
  }
  console.log('   ✅ Backend is READY with PostgreSQL connected.');

  // 2. Register user
  console.log('2. Testing Registration (POST /api/v1/auth/register)...');
  const regRes = await makeRequest({
    hostname: 'localhost',
    port: 3001,
    path: '/api/v1/auth/register',
    method: 'POST',
    headers: { 'Content-Type': 'application/json' }
  }, {
    name: testName,
    email: testEmail,
    password: testPassword,
    phone: '+91 9123456780'
  });

  if (regRes.statusCode !== 201 || !regRes.body.token || !regRes.body.refreshToken) {
    throw new Error(`Registration failed: ${JSON.stringify(regRes.body)}`);
  }
  console.log('   ✅ Registered successfully. User ID:', regRes.body.user.id);
  console.log('   ✅ Received Access Token & Refresh Token pair.');

  const initialToken = regRes.body.token;
  const initialRefreshToken = regRes.body.refreshToken;

  // 3. Access protected financial API
  console.log('3. Accessing Protected API (GET /api/v1/financial/overview)...');
  const overviewRes = await makeRequest({
    hostname: 'localhost',
    port: 3001,
    path: '/api/v1/financial/overview',
    method: 'GET',
    headers: { 'Authorization': `Bearer ${initialToken}` }
  });

  if (overviewRes.statusCode !== 200 || !overviewRes.body.safeToSpend) {
    throw new Error(`Protected API request failed: ${JSON.stringify(overviewRes.body)}`);
  }
  console.log('   ✅ Protected financial overview loaded successfully.');

  // 4. Token Refresh
  console.log('4. Testing Token Refresh (POST /api/v1/auth/refresh)...');
  const refreshRes = await makeRequest({
    hostname: 'localhost',
    port: 3001,
    path: '/api/v1/auth/refresh',
    method: 'POST',
    headers: { 'Content-Type': 'application/json' }
  }, {
    refreshToken: initialRefreshToken
  });

  if (refreshRes.statusCode !== 200 || !refreshRes.body.token) {
    throw new Error(`Token refresh failed: ${JSON.stringify(refreshRes.body)}`);
  }
  console.log('   ✅ Token rotated successfully. Received new Access Token.');
  const newAccessToken = refreshRes.body.token;

  // 5. Test Access with New Access Token
  console.log('5. Accessing Protected API with Rotated Token...');
  const meRes = await makeRequest({
    hostname: 'localhost',
    port: 3001,
    path: '/api/v1/auth/me',
    method: 'GET',
    headers: { 'Authorization': `Bearer ${newAccessToken}` }
  });

  if (meRes.statusCode !== 200 || meRes.body.user.email !== testEmail) {
    throw new Error(`Profile fetch with rotated token failed: ${JSON.stringify(meRes.body)}`);
  }
  console.log('   ✅ Fetched user profile with new access token.');

  // 6. Logout / Session Revocation
  console.log('6. Testing Logout (POST /api/v1/auth/logout)...');
  const logoutRes = await makeRequest({
    hostname: 'localhost',
    port: 3001,
    path: '/api/v1/auth/logout',
    method: 'POST',
    headers: { 'Authorization': `Bearer ${newAccessToken}` }
  });

  if (logoutRes.statusCode !== 200) {
    throw new Error(`Logout failed: ${JSON.stringify(logoutRes.body)}`);
  }
  console.log('   ✅ Server revoked session successfully.');

  // 7. Verify Rejected Access After Logout
  console.log('7. Verifying Protected Route Rejects Revoked Token...');
  const rejectedRes = await makeRequest({
    hostname: 'localhost',
    port: 3001,
    path: '/api/v1/financial/overview',
    method: 'GET',
    headers: { 'Authorization': `Bearer ${newAccessToken}` }
  });

  if (rejectedRes.statusCode !== 401) {
    throw new Error(`Expected 401 after logout, got ${rejectedRes.statusCode}: ${JSON.stringify(rejectedRes.body)}`);
  }
  console.log('   ✅ Revoked session is strictly rejected with 401 Unauthorized.');

  // 8. Test Login Again
  console.log('8. Testing Login (POST /api/v1/auth/login)...');
  const loginRes = await makeRequest({
    hostname: 'localhost',
    port: 3001,
    path: '/api/v1/auth/login',
    method: 'POST',
    headers: { 'Content-Type': 'application/json' }
  }, {
    email: testEmail,
    password: testPassword,
    deviceName: 'Flutter Mobile Pixel 8'
  });

  if (loginRes.statusCode !== 200 || !loginRes.body.token) {
    throw new Error(`Login failed: ${JSON.stringify(loginRes.body)}`);
  }
  console.log('   ✅ Login successful. New session established.');

  // 9. Test Invalid Password Failure
  console.log('9. Testing Login Rejection on Bad Password...');
  const badLoginRes = await makeRequest({
    hostname: 'localhost',
    port: 3001,
    path: '/api/v1/auth/login',
    method: 'POST',
    headers: { 'Content-Type': 'application/json' }
  }, {
    email: testEmail,
    password: 'IncorrectPassword999',
    deviceName: 'Flutter Mobile'
  });

  if (badLoginRes.statusCode !== 401) {
    throw new Error(`Expected 401 for bad password, got: ${badLoginRes.statusCode}`);
  }
  console.log('   ✅ Invalid credentials rejected with 401 Unauthorized.');

  console.log('\n====================================================');
  console.log('🎉 ALL MOBILE AUTHENTICATION E2E FLOWS PASSED!');
  console.log('====================================================\n');
}

runMobileAuthE2E().catch((err) => {
  console.error('❌ E2E Test Failed:', err);
  process.exit(1);
});
