import dotenv from 'dotenv';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { initDatabase, getQuery, runQuery } from './src/config/database.js';
import { ConsentService } from './src/services/consent.service.js';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });

async function createOneLiveConsent() {
  await initDatabase();

  const clientId = process.env.SETU_CLIENT_ID;
  const clientSecret = process.env.SETU_CLIENT_SECRET;
  const productInstanceId = process.env.SETU_PRODUCT_INSTANCE_ID || '33f22690-e2e1-4ab9-9ecf-b94f93c3a7b2';
  const apiBaseUrl = process.env.SETU_API_BASE_URL || 'https://fiu-sandbox.setu.co';
  const redirectBase = process.env.SETU_REDIRECT_BASE_URL || 'https://moisten-scrutiny-amulet.ngrok-free.dev';

  const rawVua = process.env.SETU_TEST_VUA || process.env.VUA;
  const rawPhone = process.env.VUA_MOBILE_NUMBER || process.env.SETU_TEST_PHONE_NUMBER;

  let resolvedVua = '';
  if (rawVua && rawVua.trim().length > 0) {
    const trimmed = rawVua.trim();
    resolvedVua = trimmed.includes('@') ? trimmed : `${trimmed}@onemoney`;
  } else if (rawPhone && rawPhone.trim().length > 0) {
    const trimmed = rawPhone.trim();
    resolvedVua = trimmed.includes('@') ? trimmed : `${trimmed}@onemoney`;
  }

  if (!resolvedVua) {
    console.error('ERROR: No reachable test mobile number or VUA found in local .env.');
    console.error('Please set VUA_MOBILE_NUMBER=<your_10_digit_number> in finpocket_server/.env');
    process.exit(1);
  }

  // 1. Resolve or create test user and bank account
  let user = await getQuery<any>('SELECT id, name FROM users LIMIT 1');
  if (!user) {
    const newUserId = `usr_live_${uuidv4().substring(0, 8)}`;
    await runQuery(`
      INSERT INTO users (id, name, email, password_hash)
      VALUES (?, 'FinPocket Live Tester', ?, 'hash123')
    `, [newUserId, `${newUserId}@finpocket.app`]);
    user = { id: newUserId, name: 'FinPocket Live Tester' };
  }

  const bankAccountId = `bnk_setu_${uuidv4().substring(0, 8)}`;
  const now = new Date().toISOString();
  await runQuery(`
    INSERT INTO bank_accounts (id, user_id, institution_name, institution_code, masked_account_number, account_type, current_balance, available_balance, is_primary, connection_status, provider_type, last_synced_at)
    VALUES (?, ?, 'Setu Partner Bank', 'SETU', '•••• 0235', 'SAVINGS', 50000.0, 50000.0, 0, 'PENDING', 'SETU_AA_SANDBOX', ?)
  `, [bankAccountId, user.id, now]);

  // 2. Pre-create local consent record in PENDING state
  const tempHandle = `AA_LIVE_INIT_${uuidv4()}`;
  const localConsent = await ConsentService.requestConsent(user.id, bankAccountId, tempHandle, 365, 'REQUESTED');

  await runQuery(`
    INSERT INTO audit_logs (id, user_id, action, metadata)
    VALUES (?, ?, 'SETU_CONSENT_INITIATED', ?)
  `, [
    uuidv4(),
    user.id,
    JSON.stringify({
      localConsentId: localConsent.id,
      bankAccountId,
      provider: 'SETU_AA_SANDBOX',
      vuaSuffix: resolvedVua.includes('@') ? `@${resolvedVua.split('@')[1]}` : ''
    })
  ]);

  try {
    // 3. Get OAuth Token
    const authRes = await fetch('https://uat.setu.co/api/v2/auth/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ clientID: clientId, secret: clientSecret })
    });

    if (!authRes.ok) {
      throw new Error(`Authentication failed with HTTP ${authRes.status}`);
    }

    const authData = await authRes.json() as any;
    const token = authData.data?.token || authData.token;

    if (!token) {
      throw new Error('Failed to obtain token from auth response.');
    }

    // 4. Dispatch Create Consent to Setu
    const redirectUrl = `${redirectBase}/api/v1/setu/redirect`;
    const fromDate = new Date(Date.now() - 90 * 86400000).toISOString().split('.')[0] + 'Z';
    const toDate = new Date().toISOString().split('.')[0] + 'Z';

    const consentPayload = {
      vua: resolvedVua,
      dataRange: { from: fromDate, to: toDate },
      consentDuration: { unit: 'MONTH', value: '12' },
      dataLife: { unit: 'DAY', value: 0 },
      redirectUrl
    };

    const consentRes = await fetch(`${apiBaseUrl}/v2/consents`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
        'x-product-instance-id': productInstanceId
      },
      body: JSON.stringify(consentPayload)
    });

    const status = consentRes.status;
    const text = await consentRes.text();
    let data: any = {};
    try {
      data = JSON.parse(text);
    } catch {
      throw new Error(`Raw response: ${text}`);
    }

    if (status === 201 && (data.id || data.url)) {
      // Update local consent record with authoritative Setu consent ID
      await runQuery(
        'UPDATE account_consents SET consent_handle = ?, consent_status = "PENDING" WHERE id = ?',
        [data.id, localConsent.id]
      );

      console.log('--- SETU_CONSENT_SUCCESS ---');
      console.log('Consent ID:', data.id);
      console.log('Local Tracking ID:', localConsent.id);
      console.log('Status:', data.status || 'PENDING');
      console.log('Trace ID:', data.traceId || 'N/A');
      console.log('Webview URL:', data.url || data.redirectUrl);
    } else {
      throw new Error(`Consent creation failed with HTTP ${status}: ${data.errorMsg || data.message || JSON.stringify(data)}`);
    }
  } catch (err: any) {
    // Rollback / mark failed on provider error
    await runQuery('UPDATE account_consents SET consent_status = "FAILED" WHERE id = ?', [localConsent.id]);
    await runQuery('UPDATE bank_accounts SET connection_status = "FAILED" WHERE id = ?', [bankAccountId]);
    console.error('Failed to create Setu consent:', err.message);
    process.exit(1);
  }
}

createOneLiveConsent();
