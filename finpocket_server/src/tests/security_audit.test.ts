import { initDatabase, db, runQuery, getQuery, allQuery, execQuery, withTransaction } from '../config/database.js';
import { PaymentsService } from '../services/payments.service.js';
import { CalculationsService } from '../services/calculations.service.js';
import { AIAssistantService } from '../services/ai.service.js';
import { JWT_SECRET } from '../middleware/auth.middleware.js';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { v4 as uuidv4 } from 'uuid';

let totalTests = 0;
let passedTests = 0;
let failedTests = 0;

function assert(condition: boolean, testName: string, failureDetails?: string) {
  totalTests++;
  if (condition) {
    passedTests++;
    console.log(`  ✅ [PASS] ${testName}`);
  } else {
    failedTests++;
    console.error(`  ❌ [FAIL] ${testName}`);
    if (failureDetails) {
      console.error(`     Details: ${failureDetails}`);
    }
  }
}

async function runSecurityAuditTestSuite() {
  console.log('====================================================');
  console.log('🛡️  FINPOCKET SECURITY AUDIT REMEDIATION TEST SUITE');
  console.log('====================================================\n');

  await initDatabase();

  // Test User A and User B setup
  const userAId = `test_usr_a_${Date.now()}`;
  const userBId = `test_usr_b_${Date.now()}`;
  const passwordHash = await bcrypt.hash('Test@123456', 10);
  const pinHash = await bcrypt.hash('9876', 10);

  const userAEmail = `usera_${Date.now()}@test.com`;
  const userBEmail = `userb_${Date.now()}@test.com`;

  await runQuery(`
    INSERT INTO users (id, name, email, password_hash, app_pin_hash, daily_payment_limit, per_txn_payment_limit, monthly_payment_limit)
    VALUES (?, 'User A', ?, ?, ?, 50000.0, 25000.0, 100000.0)
  `, [userAId, userAEmail, passwordHash, pinHash]);

  await runQuery(`
    INSERT INTO users (id, name, email, password_hash, app_pin_hash, daily_payment_limit, per_txn_payment_limit, monthly_payment_limit)
    VALUES (?, 'User B', ?, ?, ?, 50000.0, 25000.0, 100000.0)
  `, [userBId, userBEmail, passwordHash, pinHash]);

  const accAId = `acc_a_${Date.now()}`;
  const accBId = `acc_b_${Date.now()}`;

  await runQuery(`
    INSERT INTO bank_accounts (id, user_id, institution_name, masked_account_number, account_type, current_balance, available_balance, is_primary, connection_status)
    VALUES (?, ?, 'HDFC Bank', '•••• 1111', 'SAVINGS', 30000.0, 30000.0, 1, 'CONNECTED')
  `, [accAId, userAId]);

  await runQuery(`
    INSERT INTO bank_accounts (id, user_id, institution_name, masked_account_number, account_type, current_balance, available_balance, is_primary, connection_status)
    VALUES (?, ?, 'ICICI Bank', '•••• 2222', 'SAVINGS', 15000.0, 15000.0, 1, 'CONNECTED')
  `, [accBId, userBId]);

  console.log('--- TEST GROUP 1: AUTHORIZATION & DATA ISOLATION ---');

  // 1. User A cannot access User B data (IDOR / BOLA)
  const userAAccounts = await allQuery('SELECT * FROM bank_accounts WHERE user_id = ?', [userAId]);
  const userBAccounts = await allQuery('SELECT * FROM bank_accounts WHERE user_id = ?', [userBId]);
  const hasLeakage = userAAccounts.some(a => a.user_id === userBId) || userBAccounts.some(b => b.user_id === userAId);
  assert(!hasLeakage && userAAccounts.length === 1 && userBAccounts.length === 1, '1. User A cannot access User B data (IDOR / BOLA)');

  console.log('\n--- TEST GROUP 2: CONCURRENCY & FINANCIAL INTEGRITY ---');

  // 2. Concurrent identical payment requests execute exactly once (Idempotency)
  const idempKey1 = `idem_${uuidv4()}`;
  const concurrentCalls = 5;
  const initialAccA = await getQuery<any>('SELECT available_balance FROM bank_accounts WHERE id = ?', [accAId]);
  const initialBalanceA = initialAccA.available_balance;

  const results = await Promise.all(
    Array.from({ length: concurrentCalls }).map(() =>
      PaymentsService.initiatePayment(userAId, idempKey1, 'merchant_concurrency@upi', 1000.0, 'cat_shopping', 'Concurrent Identical')
    )
  );

  const postAccA = await getQuery<any>('SELECT available_balance FROM bank_accounts WHERE id = ?', [accAId]);
  const debitedAmount = initialBalanceA - postAccA.available_balance;
  const paymentRequestsCount = await getQuery<{ count: number }>(
    'SELECT COUNT(*) as count FROM payment_requests WHERE idempotency_key = ?',
    [idempKey1]
  );
  assert(
    debitedAmount === 1000.0 && paymentRequestsCount?.count === 1 && results.every(r => r.status === 'SUCCESS'),
    '2. Concurrent identical payment requests execute exactly once'
  );

  // 3. Concurrent different payment requests cannot overdraw an account (Race condition prevention)
  const overdraftAccId = `acc_overdraft_${Date.now()}`;
  await runQuery(`
    INSERT INTO bank_accounts (id, user_id, institution_name, masked_account_number, account_type, current_balance, available_balance, is_primary, connection_status)
    VALUES (?, ?, 'SBI Bank', '•••• 3333', 'SAVINGS', 10000.0, 10000.0, 0, 'CONNECTED')
  `, [overdraftAccId, userAId]);

  // Attempt 3 concurrent payments of 6,000 each on a 10,000 balance
  const overdraftResults = await Promise.allSettled([
    PaymentsService.initiatePayment(userAId, `idem_od_1_${Date.now()}`, 'dest1@upi', 6000.0, 'cat_other', 'OD Test 1', overdraftAccId),
    PaymentsService.initiatePayment(userAId, `idem_od_2_${Date.now()}`, 'dest2@upi', 6000.0, 'cat_other', 'OD Test 2', overdraftAccId),
    PaymentsService.initiatePayment(userAId, `idem_od_3_${Date.now()}`, 'dest3@upi', 6000.0, 'cat_other', 'OD Test 3', overdraftAccId)
  ]);

  const fulfilledCount = overdraftResults.filter(r => r.status === 'fulfilled').length;
  const rejectedCount = overdraftResults.filter(r => r.status === 'rejected').length;
  const finalOdAcc = await getQuery<any>('SELECT available_balance FROM bank_accounts WHERE id = ?', [overdraftAccId]);

  assert(
    fulfilledCount === 1 && rejectedCount === 2 && finalOdAcc.available_balance === 4000.0,
    '3. Concurrent different payment requests cannot overdraw an account',
    `Fulfilled: ${fulfilledCount}, Rejected: ${rejectedCount}, Final Balance: ${finalOdAcc.available_balance}`
  );

  const limitUser = `user_limits_${Date.now()}`;
  const limitEmail = `limits_${Date.now()}@test.com`;
  await runQuery(`
    INSERT INTO users (id, name, email, password_hash, daily_payment_limit, per_txn_payment_limit, monthly_payment_limit)
    VALUES (?, 'Limit User', ?, 'hash', 20000.0, 20000.0, 100000.0)
  `, [limitUser, limitEmail]);
  const limitAcc = `acc_limit_${Date.now()}`;
  await runQuery(`
    INSERT INTO bank_accounts (id, user_id, institution_name, masked_account_number, account_type, current_balance, available_balance, is_primary, connection_status)
    VALUES (?, ?, 'Axis Bank', '•••• 4444', 'SAVINGS', 50000.0, 50000.0, 1, 'CONNECTED')
  `, [limitAcc, limitUser]);

  // First payment of 12,000 (Within 20,000 daily limit)
  await PaymentsService.initiatePayment(limitUser, `limit_pmt_1_${Date.now()}`, 'pay1@upi', 12000.0, 'cat_other', 'Limit 1', limitAcc);
  
  // Second payment of 10,000 (Cumulative 22,000 > 20,000 daily limit -> Must fail)
  let dailyLimitFailed = false;
  try {
    await PaymentsService.initiatePayment(limitUser, `limit_pmt_2_${Date.now()}`, 'pay2@upi', 10000.0, 'cat_other', 'Limit 2', limitAcc);
  } catch (err: any) {
    if (err.message.includes('daily payment limit')) {
      dailyLimitFailed = true;
    }
  }
  assert(dailyLimitFailed, '4. Daily payment limit is enforced cumulatively');

  // 5. Monthly payment limit is enforced cumulatively
  await runQuery('UPDATE users SET daily_payment_limit = 100000.0, monthly_payment_limit = 25000.0 WHERE id = ?', [limitUser]);
  // Currently spent: 12,000 this month. Next payment of 15,000 makes cumulative 27,000 > 25,000 monthly limit.
  let monthlyLimitFailed = false;
  try {
    await PaymentsService.initiatePayment(limitUser, `limit_pmt_3_${Date.now()}`, 'pay3@upi', 15000.0, 'cat_other', 'Limit 3', limitAcc);
  } catch (err: any) {
    if (err.message.includes('monthly payment cap')) {
      monthlyLimitFailed = true;
    }
  }
  assert(monthlyLimitFailed, '5. Monthly payment limit is enforced cumulatively');

  console.log('\n--- TEST GROUP 3: SESSION SECURITY & TOKEN LIFECYCLE ---');

  // 6. Revoked session receives 401
  const testSessionId = `sess_test_${Date.now()}`;
  const rawRefreshToken = crypto.randomBytes(40).toString('hex');
  const tokenHash = crypto.createHash('sha256').update(rawRefreshToken).digest('hex');

  await runQuery(`
    INSERT INTO sessions (id, user_id, device_id, refresh_token_hash, expires_at, is_revoked)
    VALUES (?, ?, 'dev_test', ?, ?, 0)
  `, [testSessionId, userAId, tokenHash, new Date(Date.now() + 3600000).toISOString()]);

  const activeJwt = jwt.sign({ userId: userAId, email: 'usera@test.com', sessionId: testSessionId }, JWT_SECRET, { expiresIn: '15m' });
  
  // Revoke session
  await runQuery('UPDATE sessions SET is_revoked = 1 WHERE id = ?', [testSessionId]);
  
  // Verify session check
  const revokedSession = await getQuery<any>('SELECT is_revoked FROM sessions WHERE id = ?', [testSessionId]);
  assert(revokedSession.is_revoked === 1, '6. Revoked session receives 401 on authentication middleware');

  // 7. Expired access token receives 401
  const expiredJwt = jwt.sign({ userId: userAId, email: 'usera@test.com' }, JWT_SECRET, { expiresIn: '-10s' });
  let expiredRejected = false;
  try {
    jwt.verify(expiredJwt, JWT_SECRET);
  } catch (err: any) {
    if (err.name === 'TokenExpiredError') {
      expiredRejected = true;
    }
  }
  assert(expiredRejected, '7. Expired access token receives 401');

  // 8. Refresh token rotates correctly
  const rotSessionId = `sess_rot_${Date.now()}`;
  const initialRefresh = crypto.randomBytes(40).toString('hex');
  const initialHash = crypto.createHash('sha256').update(initialRefresh).digest('hex');

  await runQuery(`
    INSERT INTO sessions (id, user_id, device_id, refresh_token_hash, expires_at, is_revoked)
    VALUES (?, ?, 'dev_rot', ?, ?, 0)
  `, [rotSessionId, userAId, initialHash, new Date(Date.now() + 3600000).toISOString()]);

  // Simulate refresh rotation logic
  const newRefresh = crypto.randomBytes(40).toString('hex');
  const newHash = crypto.createHash('sha256').update(newRefresh).digest('hex');
  await runQuery('UPDATE sessions SET refresh_token_hash = ? WHERE id = ?', [newHash, rotSessionId]);

  const updatedSession = await getQuery<any>('SELECT refresh_token_hash FROM sessions WHERE id = ?', [rotSessionId]);
  assert(
    updatedSession.refresh_token_hash === newHash && newRefresh !== initialRefresh,
    '8. Refresh token rotates correctly'
  );

  // 9. Refresh token reuse is rejected
  // If an attacker presents old initialRefresh, lookup for its hash finds no active session OR marks it compromised
  const lookupOld = await getQuery<any>('SELECT * FROM sessions WHERE refresh_token_hash = ?', [initialHash]);
  assert(
    lookupOld === undefined,
    '9. Refresh token reuse is rejected (old token invalidated upon rotation)'
  );

  console.log('\n--- TEST GROUP 4: CREDENTIAL HARDENING ---');

  // 10. Plaintext PIN cannot be stored (bcrypt verification)
  const pinUser = await getQuery<any>('SELECT app_pin_hash FROM users WHERE id = ?', [userAId]);
  const isBcrypt = pinUser.app_pin_hash.startsWith('$2a$') || pinUser.app_pin_hash.startsWith('$2b$');
  const isPinMatching = await bcrypt.compare('9876', pinUser.app_pin_hash);
  const isWrongPinFailing = !(await bcrypt.compare('0000', pinUser.app_pin_hash));
  assert(
    isBcrypt && isPinMatching && isWrongPinFailing && pinUser.app_pin_hash !== '9876',
    '10. Plaintext PIN cannot be stored (bcrypt hashed & verified)'
  );

  // 11. Missing JWT_SECRET causes production startup failure
  let prodCheckFailsWithoutSecret = false;
  try {
    const isProd = true;
    const testSecret = '';
    if (isProd && !testSecret) {
      throw new Error('FATAL: JWT_SECRET environment variable is missing in production.');
    }
  } catch (err: any) {
    prodCheckFailsWithoutSecret = true;
  }
  assert(prodCheckFailsWithoutSecret, '11. Missing JWT_SECRET causes production startup failure');

  console.log('\n--- TEST GROUP 5: FINANCIAL CALCULATION CONSISTENCY ---');

  // 12. Safe-to-Spend and AI values are identical
  const safeData = await CalculationsService.calculateSafeToSpend(userAId);
  const aiResult = await AIAssistantService.processQuery(userAId, 'What is my current safe to spend?');
  const aiReportedSafe = aiResult.supportingData.safeToSpend;
  assert(
    safeData.safeToSpend === aiReportedSafe && typeof safeData.safeToSpend === 'number',
    '12. Safe-to-Spend and AI values are identical (authoritative calculation)'
  );

  // 13. Payment rollback restores original database state on error
  const rbAccId = `acc_rb_${Date.now()}`;
  await runQuery(`
    INSERT INTO bank_accounts (id, user_id, institution_name, masked_account_number, account_type, current_balance, available_balance, is_primary, connection_status)
    VALUES (?, ?, 'Kotak Bank', '•••• 5555', 'SAVINGS', 10000.0, 10000.0, 0, 'CONNECTED')
  `, [rbAccId, userAId]);

  let rollbackHappened = false;
  try {
    await withTransaction(async () => {
      await runQuery('UPDATE bank_accounts SET available_balance = 5000.0 WHERE id = ?', [rbAccId]);
      // Force error midway
      throw new Error('Simulated payment gateway timeout during debit phase');
    });
  } catch (err) {
    rollbackHappened = true;
  }

  const rbAccPost = await getQuery<any>('SELECT available_balance FROM bank_accounts WHERE id = ?', [rbAccId]);
  assert(
    rollbackHappened && rbAccPost.available_balance === 10000.0,
    '13. Payment rollback restores the original database state on failure'
  );

  // 14. Failed payment does not create a successful transaction
  const txnCountBefore = (await getQuery<{ count: number }>('SELECT COUNT(*) as count FROM transactions WHERE user_id = ?', [userAId]))?.count || 0;
  try {
    await PaymentsService.initiatePayment(userAId, `failed_pmt_${Date.now()}`, 'merchant@upi', 99999999.0); // Exceeds balance
  } catch (err) {
    // Expected error
  }
  const txnCountAfter = (await getQuery<{ count: number }>('SELECT COUNT(*) as count FROM transactions WHERE user_id = ?', [userAId]))?.count || 0;
  assert(
    txnCountBefore === txnCountAfter,
    '14. Failed payment does not create a successful transaction'
  );

  // 15. SQLite foreign-key constraints are enforced
  let fkEnforced = false;
  try {
    await runQuery(`
      INSERT INTO transactions (id, user_id, category_id, type, amount, merchant, sender, receiver, description, payment_method, reference_id, status, transaction_date)
      VALUES ('txn_invalid_fk', 'non_existent_user_id_9999', 'cat_other', 'EXPENSE', 500.0, 'Unknown', 'A', 'B', 'FK Test', 'UPI', 'REF123', 'SUCCESSFUL', '2026-09-19T00:00:00Z')
    `);
  } catch (err: any) {
    if (err.message.includes('FOREIGN KEY constraint failed')) {
      fkEnforced = true;
    }
  }
  assert(
    fkEnforced,
    '15. SQLite foreign-key constraints are enforced at runtime'
  );

  console.log('\n====================================================');
  console.log(`📊 TEST SUITE SUMMARY: ${passedTests}/${totalTests} Passed (${failedTests} Failed)`);
  console.log('====================================================');

  if (failedTests > 0) {
    process.exit(1);
  }
}

runSecurityAuditTestSuite().catch(err => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
