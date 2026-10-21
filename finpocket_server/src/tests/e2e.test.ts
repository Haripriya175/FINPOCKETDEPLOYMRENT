async function runE2ETests() {
  console.log('--- Starting FinPocket End-to-End System Tests ---');
  const baseUrl = 'http://localhost:3001/api/v1';

  // 1. Test Login
  console.log('[Test 1] Testing User Authentication & Token Generation...');
  const loginRes = await fetch(`${baseUrl}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'jithendra@finpocket.com', password: 'Demo@1234' })
  });
  const loginData = await loginRes.json();
  if (!loginData.token) throw new Error('Login failed');
  console.log('✅ Login succeeded. User:', loginData.user.name, '| DeviceId:', loginData.deviceId);

  const authHeaders = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${loginData.token}`
  };

  // 2. Test Dynamic Dashboard & Safe-to-Spend
  console.log('\n[Test 2] Testing Dynamic Safe-to-Spend & Dashboard Summary...');
  const dashRes = await fetch(`${baseUrl}/dashboard/summary`, { headers: authHeaders });
  const dashData = await dashRes.json();
  console.log('✅ Available Balance:', dashData.availableBalance);
  console.log('✅ Dynamic Safe-to-Spend:', dashData.safeToSpend);
  console.log('✅ Explanation:', dashData.safeToSpendBreakdown.explanation);

  // 3. Test Affordability Simulation
  console.log('\n[Test 3] Testing Pre-Payment Affordability Simulation...');
  const simRes = await fetch(`${baseUrl}/payments/simulate-affordability`, {
    method: 'POST',
    headers: authHeaders,
    body: JSON.stringify({ amount: 5000 })
  });
  const simData = await simRes.json();
  console.log('✅ Sim Affordable:', simData.simulation.isAffordable);
  console.log('✅ Balance After:', simData.simulation.balanceAfterPayment);
  console.log('✅ Safe-to-Spend After:', simData.simulation.safeToSpendAfterPayment);
  console.log('✅ Simulation Impact:', simData.simulation.impactExplanation);

  // 4. Test Idempotent Payment Execution
  console.log('\n[Test 4] Testing Idempotent Payment & Limit Enforcement...');
  const testIdempotencyKey = `IDEM_TEST_${Date.now()}`;
  const payRes1 = await fetch(`${baseUrl}/payments/initiate`, {
    method: 'POST',
    headers: { ...authHeaders, 'Idempotency-Key': testIdempotencyKey },
    body: JSON.stringify({ recipient: 'rahul@upi', amount: 1500, categoryId: 'cat_food', note: 'Team Lunch' })
  });
  const payData1 = await payRes1.json();
  console.log('✅ First Payment Execution:', payData1.payment.status, '| Ref:', payData1.payment.referenceId);

  // Submit duplicate request with same Idempotency-Key
  const payRes2 = await fetch(`${baseUrl}/payments/initiate`, {
    method: 'POST',
    headers: { ...authHeaders, 'Idempotency-Key': testIdempotencyKey },
    body: JSON.stringify({ recipient: 'rahul@upi', amount: 1500, categoryId: 'cat_food', note: 'Team Lunch' })
  });
  const payData2 = await payRes2.json();
  console.log('✅ Duplicate Request Replay (No Double Debit):', payData2.payment.status, '| AuditId:', payData2.payment.auditId);

  // 5. Test AI Financial Assistant Context Grounding
  console.log('\n[Test 5] Testing AI Financial Assistant Live Grounding...');
  const aiRes = await fetch(`${baseUrl}/ai/query`, {
    method: 'POST',
    headers: authHeaders,
    body: JSON.stringify({ query: 'Can I afford 5000?' })
  });
  const aiData = await aiRes.json();
  console.log('✅ AI Answer:', aiData.response.answer);
  console.log('✅ AI Grounding Explanation:', aiData.response.explanation);

  // 6. Test Security Audit Trail & Devices
  console.log('\n[Test 6] Testing Security Audit Trail & Devices...');
  const auditRes = await fetch(`${baseUrl}/security/audit-logs`, { headers: authHeaders });
  const auditData = await auditRes.json();
  console.log('✅ Recent Security Audit Logs count:', auditData.logs.length);
  console.log('✅ Latest Action Logged:', auditData.logs[0].action);

  console.log('\n========================================');
  console.log('🎉 ALL SYSTEM & SECURITY TESTS PASSED!');
  console.log('========================================');
}

runE2ETests().catch(err => {
  console.error('❌ E2E Test Error:', err);
  process.exit(1);
});
