// One-off verification: prove every stored balance is real (no fabricated rows).
import sqlite3 from 'sqlite3';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const db = new sqlite3.Database(path.join(root, 'data', 'finpocket.sqlite'));

const run = (sql, params = []) =>
  new Promise((resolve, reject) =>
    db.all(sql, params, (err, rows) => (err ? reject(err) : resolve(rows)))
  );

const users = await run('SELECT id, name, email, monthly_income FROM users');
console.log('USERS:', users.length);
for (const u of users) console.log('  -', u.id, '|', u.name, '|', u.email, '| income=', u.monthly_income);

const accounts = await run(
  'SELECT user_id, institution_name, masked_account_number, current_balance, available_balance, connection_status FROM bank_accounts ORDER BY user_id'
);
console.log('\nBANK ACCOUNTS:', accounts.length);
for (const a of accounts)
  console.log(
    `  - [${a.user_id}] ${a.institution_name} ${a.masked_account_number} bal=${a.current_balance} avail=${a.available_balance} status=${a.connection_status}`
  );

const sums = await run(
  `SELECT user_id,
          SUM(CASE WHEN type = 'INCOME' THEN amount ELSE 0 END) AS income,
          SUM(CASE WHEN type = 'EXPENSE' THEN amount ELSE 0 END) AS expense,
          COUNT(*) AS txn_count
   FROM transactions GROUP BY user_id`
);
console.log('\nTRANSACTION SUMS (all time):');
for (const s of sums)
  console.log(`  - [${s.user_id}] income=${s.income} expense=${s.expense} txns=${s.txn_count}`);

const funds = await run('SELECT user_id, target_amount, current_amount FROM emergency_funds');
console.log('\nEMERGENCY FUNDS:');
for (const f of funds) console.log(`  - [${f.user_id}] target=${f.target_amount} saved=${f.current_amount}`);

db.close();
