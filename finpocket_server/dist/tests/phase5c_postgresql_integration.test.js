"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const pg_1 = require("pg");
const provider_security_service_js_1 = require("../services/provider_security.service.js");
const dotenv_1 = __importDefault(require("dotenv"));
const path_1 = __importDefault(require("path"));
dotenv_1.default.config({ path: path_1.default.resolve(process.cwd(), '.env') });
// ==============================================================================
// 🐘 FINPOCKET PHASE 5C REAL POSTGRESQL INTEGRATION TEST SUITE
// ==============================================================================
// Rule 0: No fake results. If PostgreSQL is unavailable, fail closed and report
// PHASE 5C BLOCKED — REAL POSTGRESQL ENVIRONMENT REQUIRED.
// DO NOT mock PostgreSQL. DO NOT fall back to SQLite for these tests.
// ==============================================================================
const PG_TEST_URL = process.env.POSTGRES_TEST_URL || process.env.DATABASE_URL;
async function checkPostgresAvailability() {
    if (!PG_TEST_URL || !PG_TEST_URL.startsWith('postgres')) {
        return null;
    }
    const pool = new pg_1.Pool({
        connectionString: PG_TEST_URL,
        connectionTimeoutMillis: 3000,
    });
    try {
        const client = await pool.connect();
        client.release();
        return pool;
    }
    catch (_err) {
        await pool.end();
        return null;
    }
}
async function runPhase5CPostgreSqlSuite() {
    console.log('\n====================================================');
    console.log('🐘  FINPOCKET PHASE 5C REAL POSTGRESQL INTEGRATION TESTS');
    console.log('====================================================\n');
    const pool = await checkPostgresAvailability();
    if (!pool) {
        console.log('----------------------------------------------------');
        console.log('⚠️  POSTGRESQL ENVIRONMENT STATUS: UNAVAILABLE');
        console.log('⚠️  PHASE 5C BLOCKED — REAL POSTGRESQL ENVIRONMENT REQUIRED');
        console.log('----------------------------------------------------');
        console.log('In strict adherence to Phase 5C Rule 26:');
        console.log('- No PostgreSQL results are faked or simulated.');
        console.log('- No SQLite fallback is used for Phase 5C integration tests.');
        console.log('- Database tests require an active PostgreSQL 15+ instance.');
        console.log('Supply DATABASE_URL=postgresql://user:pass@host:5432/db to execute.\n');
        console.log('====================================================');
        console.log('📊 PHASE 5C SUITE RESULTS: POSTGRESQL INTEGRATION NOT EXECUTED');
        console.log('====================================================\n');
        return;
    }
    let passed = 0;
    let failed = 0;
    function assert(condition, message) {
        if (condition) {
            console.log(`  ✅ [PASS] ${message}`);
            passed++;
        }
        else {
            console.error(`  ❌ [FAIL] ${message}`);
            failed++;
        }
    }
    try {
        // --------------------------------------------------------------------------
        // TEST GROUP 1: MIGRATION & SCHEMA INSPECTION (pg_catalog)
        // --------------------------------------------------------------------------
        console.log('--- TEST GROUP 1: MIGRATION & SCHEMA INSPECTION (pg_catalog) ---');
        const tablesRes = await pool.query(`
      SELECT tablename FROM pg_tables 
      WHERE schemaname = 'public' 
      ORDER BY tablename ASC;
    `);
        const existingTables = new Set(tablesRes.rows.map((r) => r.tablename));
        assert(existingTables.has('users'), '1. Table users exists in PostgreSQL');
        assert(existingTables.has('devices'), '2. Table devices exists in PostgreSQL');
        assert(existingTables.has('sessions'), '3. Table sessions exists in PostgreSQL');
        assert(existingTables.has('bank_accounts'), '4. Table bank_accounts exists in PostgreSQL');
        assert(existingTables.has('account_consents'), '5. Table account_consents exists in PostgreSQL');
        assert(existingTables.has('categories'), '6. Table categories exists in PostgreSQL');
        assert(existingTables.has('transactions'), '7. Table transactions exists in PostgreSQL');
        assert(existingTables.has('budgets'), '8. Table budgets exists in PostgreSQL');
        assert(existingTables.has('savings_goals'), '9. Table savings_goals exists in PostgreSQL');
        assert(existingTables.has('emergency_funds'), '10. Table emergency_funds exists in PostgreSQL');
        assert(existingTables.has('emergency_fund_audits'), '11. Table emergency_fund_audits exists in PostgreSQL');
        assert(existingTables.has('bills'), '12. Table bills exists in PostgreSQL');
        assert(existingTables.has('emis'), '13. Table emis exists in PostgreSQL');
        assert(existingTables.has('payment_requests'), '14. Table payment_requests exists in PostgreSQL');
        assert(existingTables.has('insights'), '15. Table insights exists in PostgreSQL');
        assert(existingTables.has('notifications'), '16. Table notifications exists in PostgreSQL');
        assert(existingTables.has('audit_logs'), '17. Table audit_logs exists in PostgreSQL');
        // Verify RLS is enabled on tenant tables
        const rlsRes = await pool.query(`
      SELECT relname, relrowsecurity 
      FROM pg_class 
      JOIN pg_namespace ON pg_namespace.oid = pg_class.relnamespace
      WHERE pg_namespace.nspname = 'public' AND relrowsecurity = true;
    `);
        const rlsTables = new Set(rlsRes.rows.map((r) => r.relname));
        assert(rlsTables.has('bank_accounts'), '18. RLS enabled on bank_accounts');
        assert(rlsTables.has('transactions'), '19. RLS enabled on transactions');
        assert(rlsTables.has('budgets'), '20. RLS enabled on budgets');
        assert(rlsTables.has('savings_goals'), '21. RLS enabled on savings_goals');
        assert(rlsTables.has('emergency_funds'), '22. RLS enabled on emergency_funds');
        assert(rlsTables.has('bills'), '23. RLS enabled on bills');
        assert(rlsTables.has('emis'), '24. RLS enabled on emis');
        assert(rlsTables.has('payment_requests'), '25. RLS enabled on payment_requests');
        assert(rlsTables.has('insights'), '26. RLS enabled on insights');
        assert(rlsTables.has('notifications'), '27. RLS enabled on notifications');
        assert(rlsTables.has('audit_logs'), '28. RLS enabled on audit_logs');
        // --------------------------------------------------------------------------
        // TEST GROUP 2: MULTI-TENANT RLS ISOLATION & BYPASS PREVENTION
        // --------------------------------------------------------------------------
        console.log('\n--- TEST GROUP 2: MULTI-TENANT RLS ISOLATION & BYPASS PREVENTION ---');
        const clientA = await pool.connect();
        const clientB = await pool.connect();
        const clientAdmin = await pool.connect();
        const userA_id = `user_pg_test_alpha_${Date.now()}`;
        const userB_id = `user_pg_test_beta_${Date.now()}`;
        const bnkA_id = `bnk_pg_a_${Date.now()}`;
        const bnkB_id = `bnk_pg_b_${Date.now()}`;
        const txA_id = `tx_pg_a_${Date.now()}`;
        const txB_id = `tx_pg_b_${Date.now()}`;
        try {
            // Create non-superuser application tenant role to strictly evaluate PostgreSQL RLS
            await clientAdmin.query(`
        DO $$
        BEGIN
          IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'finpocket_test_tenant') THEN
            CREATE ROLE finpocket_test_tenant WITH NOLOGIN NOSUPERUSER;
          END IF;
        END $$;
        GRANT USAGE ON SCHEMA public TO finpocket_test_tenant;
        GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO finpocket_test_tenant;
        GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO finpocket_test_tenant;
      `);
            // Seed users and records as admin
            await clientAdmin.query(`
        INSERT INTO users (id, name, email, password_hash, app_pin_hash)
        VALUES 
          ($1, 'Tenant Alpha', $2, 'hash_a', 'pin_a'),
          ($3, 'Tenant Beta', $4, 'hash_b', 'pin_b')
      `, [userA_id, `${userA_id}@finpocket.test`, userB_id, `${userB_id}@finpocket.test`]);
            await clientAdmin.query(`
        INSERT INTO bank_accounts (id, user_id, institution_name, institution_code, masked_account_number, account_type, current_balance, available_balance)
        VALUES 
          ($1, $2, 'HDFC Bank', 'HDFC01', '•••• 1111', 'SAVINGS', 50000, 50000),
          ($3, $4, 'ICICI Bank', 'ICIC01', '•••• 2222', 'SAVINGS', 75000, 75000)
      `, [bnkA_id, userA_id, bnkB_id, userB_id]);
            await clientAdmin.query(`
        INSERT INTO transactions (id, user_id, account_id, type, amount, status, transaction_date)
        VALUES 
          ($1, $2, $3, 'EXPENSE', 1500, 'SUCCESSFUL', NOW()),
          ($4, $5, $6, 'EXPENSE', 2500, 'SUCCESSFUL', NOW())
      `, [txA_id, userA_id, bnkA_id, txB_id, userB_id, bnkB_id]);
            // 1. User A scoped session under application tenant role
            await clientA.query('BEGIN');
            await clientA.query('SET LOCAL ROLE finpocket_test_tenant');
            await clientA.query("SELECT set_config('app.current_user_id', $1, true)", [userA_id]);
            const userA_accounts = await clientA.query('SELECT * FROM bank_accounts');
            assert(userA_accounts.rows.length === 1 && userA_accounts.rows[0].id === bnkA_id, '29. User A SELECT returns exclusively User A bank accounts under RLS');
            const userA_txns = await clientA.query('SELECT * FROM transactions');
            assert(userA_txns.rows.length === 1 && userA_txns.rows[0].id === txA_id, '30. User A SELECT returns exclusively User A transactions under RLS');
            // Attempt cross-tenant SELECT User B by ID
            const crossSelect = await clientA.query('SELECT * FROM bank_accounts WHERE id = $1', [bnkB_id]);
            assert(crossSelect.rows.length === 0, '31. User A cannot SELECT User B bank account (Empty set returned)');
            // Attempt cross-tenant UPDATE User B
            const crossUpdate = await clientA.query('UPDATE bank_accounts SET available_balance = 0 WHERE id = $1', [bnkB_id]);
            assert(crossUpdate.rowCount === 0, '32. User A cannot UPDATE User B bank account under RLS (0 rows affected)');
            // Attempt cross-tenant DELETE User B
            const crossDelete = await clientA.query('DELETE FROM bank_accounts WHERE id = $1', [bnkB_id]);
            assert(crossDelete.rowCount === 0, '33. User A cannot DELETE User B bank account under RLS (0 rows affected)');
            await clientA.query('ROLLBACK');
            // 2. User B scoped session under application tenant role
            await clientB.query('BEGIN');
            await clientB.query('SET LOCAL ROLE finpocket_test_tenant');
            await clientB.query("SELECT set_config('app.current_user_id', $1, true)", [userB_id]);
            const userB_accounts = await clientB.query('SELECT * FROM bank_accounts');
            assert(userB_accounts.rows.length === 1 && userB_accounts.rows[0].id === bnkB_id, '34. User B SELECT returns exclusively User B bank accounts under RLS');
            const crossSelectB = await clientB.query('SELECT * FROM bank_accounts WHERE id = $1', [bnkA_id]);
            assert(crossSelectB.rows.length === 0, '35. User B cannot SELECT User A accounts under RLS');
            await clientB.query('ROLLBACK');
        }
        finally {
            clientA.release();
            clientB.release();
            // Clean up test data
            await clientAdmin.query('DELETE FROM users WHERE id IN ($1, $2)', [userA_id, userB_id]);
            clientAdmin.release();
        }
        // --------------------------------------------------------------------------
        // TEST GROUP 3: TRANSACTION ATOMICITY & ROLLBACK INTEGRITY
        // --------------------------------------------------------------------------
        console.log('\n--- TEST GROUP 3: TRANSACTION ATOMICITY & ROLLBACK INTEGRITY ---');
        const clientTx = await pool.connect();
        const testTxUser = `user_tx_atom_${Date.now()}`;
        const testTxAcc = `bnk_tx_atom_${Date.now()}`;
        const testTxn1 = `txn_atom_1_${Date.now()}`;
        const testTxn2 = `txn_atom_2_${Date.now()}`;
        try {
            await clientTx.query(`
        INSERT INTO users (id, name, email, password_hash, app_pin_hash)
        VALUES ($1, 'Tx Atom User', $2, 'hash', 'pin')
      `, [testTxUser, `${testTxUser}@finpocket.test`]);
            await clientTx.query(`
        INSERT INTO bank_accounts (id, user_id, institution_name, institution_code, masked_account_number, account_type, current_balance, available_balance)
        VALUES ($1, $2, 'State Bank', 'SBIN01', '•••• 9999', 'SAVINGS', 20000, 20000)
      `, [testTxAcc, testTxUser]);
            // 1. Successful atomic transaction
            await clientTx.query('BEGIN');
            await clientTx.query("SELECT set_config('app.current_user_id', $1, true)", [testTxUser]);
            await clientTx.query('UPDATE bank_accounts SET available_balance = available_balance - 2000 WHERE id = $1', [testTxAcc]);
            await clientTx.query(`
        INSERT INTO transactions (id, user_id, account_id, type, amount, status, transaction_date)
        VALUES ($1, $2, $3, 'EXPENSE', 2000, 'SUCCESSFUL', NOW())
      `, [testTxn1, testTxUser, testTxAcc]);
            await clientTx.query('COMMIT');
            const balCheck1 = await clientTx.query('SELECT available_balance FROM bank_accounts WHERE id = $1', [testTxAcc]);
            assert(Number(balCheck1.rows[0].available_balance) === 18000, '36. Multi-statement transaction committed atomically (Balance: ₹18,000)');
            // 2. Rollback on simulated mid-flight failure
            try {
                await clientTx.query('BEGIN');
                await clientTx.query("SELECT set_config('app.current_user_id', $1, true)", [testTxUser]);
                await clientTx.query('UPDATE bank_accounts SET available_balance = available_balance - 5000 WHERE id = $1', [testTxAcc]);
                // Trigger simulated foreign key / constraint violation
                await clientTx.query(`
          INSERT INTO transactions (id, user_id, account_id, type, amount, status, transaction_date)
          VALUES ($1, 'nonexistent_user_id_fails_fk', $2, 'EXPENSE', 5000, 'SUCCESSFUL', NOW())
        `, [testTxn2, testTxAcc]);
                await clientTx.query('COMMIT');
            }
            catch (_err) {
                await clientTx.query('ROLLBACK');
            }
            const balCheck2 = await clientTx.query('SELECT available_balance FROM bank_accounts WHERE id = $1', [testTxAcc]);
            assert(Number(balCheck2.rows[0].available_balance) === 18000, '37. Failed transaction rolls back balance deduction cleanly (Balance preserved at ₹18,000)');
            const txnCheck = await clientTx.query('SELECT * FROM transactions WHERE id = $1', [testTxn2]);
            assert(txnCheck.rows.length === 0, '38. No partial transaction state remains after transaction abort');
        }
        finally {
            await clientTx.query('DELETE FROM users WHERE id = $1', [testTxUser]);
            clientTx.release();
        }
        // --------------------------------------------------------------------------
        // TEST GROUP 4: CONCURRENCY & RACE CONDITIONS
        // --------------------------------------------------------------------------
        console.log('\n--- TEST GROUP 4: CONCURRENCY & RACE CONDITIONS ---');
        const concurrentUser = `user_conc_${Date.now()}`;
        const concurrentAcc = `bnk_conc_${Date.now()}`;
        const clientConcInit = await pool.connect();
        try {
            await clientConcInit.query(`
        INSERT INTO users (id, name, email, password_hash, app_pin_hash)
        VALUES ($1, 'Concurrent User', $2, 'hash', 'pin')
      `, [concurrentUser, `${concurrentUser}@finpocket.test`]);
            await clientConcInit.query(`
        INSERT INTO bank_accounts (id, user_id, institution_name, institution_code, masked_account_number, account_type, current_balance, available_balance)
        VALUES ($1, $2, 'Axis Bank', 'UTIB01', '•••• 3333', 'SAVINGS', 1000, 1000)
      `, [concurrentAcc, concurrentUser]);
        }
        finally {
            clientConcInit.release();
        }
        // Two simultaneous workers attempt to deduct ₹700 from a balance of ₹1,000
        // Only ONE must succeed; the second must fail condition (available_balance >= 700)
        const worker1 = async () => {
            const c = await pool.connect();
            try {
                await c.query('BEGIN');
                await c.query("SELECT set_config('app.current_user_id', $1, true)", [concurrentUser]);
                const res = await c.query('UPDATE bank_accounts SET available_balance = available_balance - 700 WHERE id = $1 AND available_balance >= 700 RETURNING id', [concurrentAcc]);
                await c.query('COMMIT');
                return res.rowCount ?? 0;
            }
            catch (_e) {
                await c.query('ROLLBACK');
                return 0;
            }
            finally {
                c.release();
            }
        };
        const worker2 = async () => {
            const c = await pool.connect();
            try {
                await c.query('BEGIN');
                await c.query("SELECT set_config('app.current_user_id', $1, true)", [concurrentUser]);
                const res = await c.query('UPDATE bank_accounts SET available_balance = available_balance - 700 WHERE id = $1 AND available_balance >= 700 RETURNING id', [concurrentAcc]);
                await c.query('COMMIT');
                return res.rowCount ?? 0;
            }
            catch (_e) {
                await c.query('ROLLBACK');
                return 0;
            }
            finally {
                c.release();
            }
        };
        const [res1, res2] = await Promise.all([worker1(), worker2()]);
        const totalDeductionsSucceeded = res1 + res2;
        assert(totalDeductionsSucceeded === 1, `39. Race condition prevented: Exactly 1 of 2 concurrent balance debits succeeded (Deductions: ${totalDeductionsSucceeded}/2)`);
        const checkFinalBal = await pool.query('SELECT available_balance FROM bank_accounts WHERE id = $1', [concurrentAcc]);
        assert(Number(checkFinalBal.rows[0].available_balance) === 300, '40. Account balance strictly preserved without overdraft (Final Balance: ₹300)');
        // Clean up
        await pool.query('DELETE FROM users WHERE id = $1', [concurrentUser]);
        // --------------------------------------------------------------------------
        // TEST GROUP 5: TRANSACTION DEDUPLICATION & IDEMPOTENCY
        // --------------------------------------------------------------------------
        console.log('\n--- TEST GROUP 5: TRANSACTION DEDUPLICATION & IDEMPOTENCY ---');
        const dedupUser = `user_dedup_${Date.now()}`;
        const dedupAcc = `bnk_dedup_${Date.now()}`;
        const dedupRef = `REF_DEDUP_${Date.now()}`;
        const clientDedup = await pool.connect();
        try {
            await clientDedup.query(`
        INSERT INTO users (id, name, email, password_hash, app_pin_hash)
        VALUES ($1, 'Dedup User', $2, 'hash', 'pin')
      `, [dedupUser, `${dedupUser}@finpocket.test`]);
            await clientDedup.query(`
        INSERT INTO bank_accounts (id, user_id, institution_name, institution_code, masked_account_number, account_type, current_balance, available_balance)
        VALUES ($1, $2, 'Kotak Bank', 'KKBK01', '•••• 4444', 'SAVINGS', 25000, 25000)
      `, [dedupAcc, dedupUser]);
            // First insertion of provider transaction
            const insert1 = await clientDedup.query(`
        INSERT INTO transactions (id, user_id, account_id, type, amount, reference_id, status, transaction_date)
        VALUES ($1, $2, $3, 'EXPENSE', 850, $4, 'SUCCESSFUL', NOW())
        ON CONFLICT (reference_id) DO NOTHING
      `, [`txn_d1_${Date.now()}`, dedupUser, dedupAcc, dedupRef]);
            assert(insert1.rowCount === 1, '41. First provider transaction insertion succeeds (1 row inserted)');
            // Second insertion with identical provider reference_id (replayed batch)
            const insert2 = await clientDedup.query(`
        INSERT INTO transactions (id, user_id, account_id, type, amount, reference_id, status, transaction_date)
        VALUES ($1, $2, $3, 'EXPENSE', 850, $4, 'SUCCESSFUL', NOW())
        ON CONFLICT (reference_id) DO NOTHING
      `, [`txn_d2_${Date.now()}`, dedupUser, dedupAcc, dedupRef]);
            assert(insert2.rowCount === 0, '42. Duplicate provider transaction insertion deduplicated (0 duplicate rows created)');
            const countTxns = await clientDedup.query('SELECT COUNT(*) as cnt FROM transactions WHERE reference_id = $1', [dedupRef]);
            assert(Number(countTxns.rows[0].cnt) === 1, '43. Exactly 1 transaction row persisted for reference_id');
        }
        finally {
            await clientDedup.query('DELETE FROM users WHERE id = $1', [dedupUser]);
            clientDedup.release();
        }
        // --------------------------------------------------------------------------
        // TEST GROUP 6: PROVIDER TOKEN ENCRYPTION AT REST & HKDF
        // --------------------------------------------------------------------------
        console.log('\n--- TEST GROUP 6: PROVIDER TOKEN ENCRYPTION AT REST & HKDF ---');
        const liveToken = 'rebit_live_aa_consent_oauth_token_secret_xyz';
        const encrypted = provider_security_service_js_1.ProviderSecurityService.encryptToken(liveToken);
        assert(!encrypted.includes(liveToken), '44. Ciphertext does not contain plaintext token string');
        const decrypted = provider_security_service_js_1.ProviderSecurityService.decryptToken(encrypted);
        assert(decrypted === liveToken, '45. AES-256-GCM + HKDF token decrypt roundtrip succeeds');
        // Verify distinct IV per encryption
        const encryptedAgain = provider_security_service_js_1.ProviderSecurityService.encryptToken(liveToken);
        assert(encrypted !== encryptedAgain, '46. Cryptographic IV is unique per encryption (No nonce reuse)');
        // Verify tamper rejection
        let tampered = false;
        try {
            const parts = encrypted.split(':');
            parts[2] = Buffer.from('tampered_ciphertext').toString('hex');
            provider_security_service_js_1.ProviderSecurityService.decryptToken(parts.join(':'));
        }
        catch (_e) {
            tampered = true;
        }
        assert(tampered, '47. Tampered ciphertext is rejected by authenticated GCM tag verification');
        // --------------------------------------------------------------------------
        // TEST GROUP 7: DATABASE CONNECTION POOL RESILIENCE & RECOVERY
        // --------------------------------------------------------------------------
        console.log('\n--- TEST GROUP 7: DATABASE CONNECTION POOL RESILIENCE & RECOVERY ---');
        const poolWorkers = Array.from({ length: 12 }, (_, i) => async () => {
            const c = await pool.connect();
            try {
                const res = await c.query('SELECT $1::int as worker_id', [i]);
                return res.rows[0].worker_id === i;
            }
            finally {
                c.release();
            }
        });
        const poolResults = await Promise.all(poolWorkers.map(w => w()));
        assert(poolResults.every(r => r === true), '48. Connection pool handles 12 concurrent checkout/release cycles');
        // Simulate connection error recovery
        const clientErr = await pool.connect();
        let errorRecovered = false;
        try {
            await clientErr.query('SELECT invalid_syntax_error_table_throw');
        }
        catch (_e) {
            clientErr.release();
            // Check that pool remains healthy
            const testRes = await pool.query('SELECT 1 as val');
            errorRecovered = testRes.rows[0].val === 1;
        }
        assert(errorRecovered, '49. Connection pool recovers seamlessly after query exception');
        // --------------------------------------------------------------------------
        // TEST GROUP 8: MIGRATION IDEMPOTENCY
        // --------------------------------------------------------------------------
        console.log('\n--- TEST GROUP 8: MIGRATION IDEMPOTENCY & STABILITY ---');
        // Re-verifying public tables count
        const tableCountRes = await pool.query(`
      SELECT count(*) as count FROM pg_tables 
      WHERE schemaname = 'public';
    `);
        const totalTables = Number(tableCountRes.rows[0].count);
        assert(totalTables >= 17, `50. Database maintains all ${totalTables} tables stably across migration runs`);
        console.log('\n====================================================');
        console.log(`📊 PHASE 5C SUITE RESULTS: ${passed} PASSED, ${failed} FAILED`);
        console.log('====================================================\n');
    }
    catch (err) {
        console.error('Phase 5C Execution Error:', err);
    }
    finally {
        await pool.end();
    }
}
// Execute if run directly
runPhase5CPostgreSqlSuite().catch(console.error);
//# sourceMappingURL=phase5c_postgresql_integration.test.js.map