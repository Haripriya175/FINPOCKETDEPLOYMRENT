// One-time cleanup: users whose monthly_income is still the old schema
// default (55000) never actually told us their salary — signup never sets
// that column. Zero it so forecasts/health never spend a fabricated number.
// The demo user (usr_fp_882910) is seeded explicitly and is left untouched.
import sqlite3 from 'sqlite3';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const db = new sqlite3.Database(path.join(root, 'data', 'finpocket.sqlite'));

const affected = await new Promise((resolve, reject) =>
  db.run(
    `UPDATE users SET monthly_income = 0.00
     WHERE monthly_income = 55000.00 AND id != 'usr_fp_882910'`,
    function (err) {
      if (err) reject(err);
      else resolve(this.changes);
    }
  )
);

console.log(`[cleanup] Reset fabricated ₹55,000 default income on ${affected} user(s).`);

// Second fabrication: emergency_funds.monthly_contribution defaulted to
// ₹5,000/month for every signup (the user never opted into that commitment,
// and it silently shrank Safe-to-Spend by ₹5,000). Demo fixture is explicit.
const efAffected = await new Promise((resolve, reject) =>
  db.run(
    `UPDATE emergency_funds SET monthly_contribution = 0.00
     WHERE monthly_contribution = 5000.00 AND user_id != 'usr_fp_882910'`,
    function (err) {
      if (err) reject(err);
      else resolve(this.changes);
    }
  )
);

console.log(`[cleanup] Reset fabricated ₹5,000/month emergency-fund commitment on ${efAffected} row(s).`);

const rows = await new Promise((resolve, reject) =>
  db.all('SELECT id, name, email, monthly_income FROM users', (err, r) => (err ? reject(err) : resolve(r)))
);
for (const u of rows) {
  console.log(`  - ${u.id} | ${u.name} | income=${u.monthly_income}`);
}

db.close();
