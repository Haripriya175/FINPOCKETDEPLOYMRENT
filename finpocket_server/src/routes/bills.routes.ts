import { Router, Response } from 'express';
import { AuthRequest, authMiddleware } from '../middleware/auth.middleware.js';
import { allQuery, getQuery, runQuery, withTransaction } from '../config/database.js';
import { v4 as uuidv4 } from 'uuid';

const router = Router();

router.get('/', authMiddleware, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId = req.user!.id;
    const bills = await allQuery('SELECT * FROM bills WHERE user_id = ? ORDER BY due_date ASC', [userId]);
    const emis = await allQuery('SELECT * FROM emis WHERE user_id = ? ORDER BY next_due_date ASC', [userId]);

    res.json({ bills, emis });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/mark-paid/:id', authMiddleware, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId = req.user!.id;
    
    await withTransaction(async () => {
      const bill = await getQuery<any>('SELECT * FROM bills WHERE id = ? AND user_id = ?', [req.params.id, userId]);
      if (!bill) {
        throw new Error('Bill not found or does not belong to the user.');
      }
      if (bill.is_paid_this_cycle === 1) {
        return; // Already paid
      }

      const primaryAcc = await getQuery<any>('SELECT * FROM bank_accounts WHERE user_id = ? AND is_primary = 1', [userId]);
      if (!primaryAcc) {
        throw new Error('Primary bank account not found.');
      }
      if (primaryAcc.available_balance < bill.amount) {
        throw new Error(`Insufficient balance to pay ${bill.name}.`);
      }

      const now = new Date().toISOString();
      await runQuery('UPDATE bills SET is_paid_this_cycle = 1, last_paid_date = ? WHERE id = ?', [now, req.params.id]);

      // Create transaction entry for the paid bill
      const txnId = `FP${Date.now().toString().substring(5)}`;
      const refId = `BBPS/${Date.now()}`;
      await runQuery(`
        INSERT INTO transactions (id, user_id, category_id, type, amount, merchant, receiver, description, reference_id, status, transaction_date)
        VALUES (?, ?, 'cat_bills', 'EXPENSE', ?, ?, ?, ?, ?, 'SUCCESSFUL', ?)
      `, [txnId, userId, bill.amount, bill.name, bill.name, `Bill Payment for ${bill.name}`, refId, now]);

      // Deduct from primary bank account
      await runQuery('UPDATE bank_accounts SET available_balance = available_balance - ?, current_balance = current_balance - ? WHERE id = ?', [bill.amount, bill.amount, primaryAcc.id]);

      // Audit trail
      await runQuery(`
        INSERT INTO audit_logs (id, user_id, action, metadata)
        VALUES (?, ?, 'BILL_PAID', ?)
      `, [uuidv4(), userId, JSON.stringify({ billId: bill.id, billName: bill.name, amount: bill.amount, referenceId: refId })]);
    });

    res.json({ success: true, message: `Bill marked as paid.` });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

export default router;
