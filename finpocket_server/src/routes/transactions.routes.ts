import { Router, Response } from 'express';
import { AuthRequest, authMiddleware } from '../middleware/auth.middleware.js';
import { allQuery, getQuery, runQuery } from '../config/database.js';
import { v4 as uuidv4 } from 'uuid';

const router = Router();

router.get('/', authMiddleware, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId = req.user!.id;
    const { type, category, search, startDate, endDate, limit = 50 } = req.query;

    let query = `
      SELECT t.*, c.name as category_name, c.color as category_color, c.icon as category_icon 
      FROM transactions t 
      LEFT JOIN categories c ON t.category_id = c.id 
      WHERE t.user_id = ?
    `;
    const params: any[] = [userId];

    if (type && type !== 'ALL') {
      query += ' AND t.type = ?';
      params.push(type);
    }
    if (category) {
      query += ' AND (c.name = ? OR t.category_id = ?)';
      params.push(category, category);
    }
    if (search) {
      query += ' AND (t.merchant LIKE ? OR t.description LIKE ? OR t.receiver LIKE ?)';
      params.push(`%${search}%`, `%${search}%`, `%${search}%`);
    }
    if (startDate) {
      query += ' AND t.transaction_date >= ?';
      params.push(startDate);
    }
    if (endDate) {
      query += ' AND t.transaction_date <= ?';
      params.push(endDate);
    }

    query += ' ORDER BY t.transaction_date DESC LIMIT ?';
    params.push(Number(limit));

    const transactions = await allQuery(query, params);
    res.json({ transactions });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/', authMiddleware, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId = req.user!.id;
    const { amount, type, categoryId, merchant, description, paymentMethod } = req.body;

    if (!amount || amount <= 0 || !type || !['INCOME', 'EXPENSE'].includes(type)) {
      res.status(400).json({ error: 'Valid amount and type (INCOME/EXPENSE) are required.' });
      return;
    }

    const id = `FP${Date.now().toString().substring(5)}`;
    const now = new Date().toISOString();
    const refId = `MANUAL/${Date.now()}`;

    await runQuery(`
      INSERT INTO transactions (id, user_id, category_id, type, amount, merchant, sender, receiver, description, payment_method, reference_id, status, transaction_date)
      VALUES (?, ?, ?, ?, ?, ?, 'User', ?, ?, ?, ?, 'SUCCESSFUL', ?)
    `, [id, userId, categoryId || 'cat_other', type, amount, merchant || 'Manual Entry', merchant || 'Merchant', description || 'Manual Transaction', paymentMethod || 'CASH', refId, now]);

    // If expense, deduct from primary bank account
    if (type === 'EXPENSE') {
      const primaryAcc = await getQuery<any>('SELECT * FROM bank_accounts WHERE user_id = ? AND is_primary = 1', [userId]);
      if (primaryAcc) {
        await runQuery('UPDATE bank_accounts SET available_balance = available_balance - ? WHERE id = ?', [amount, primaryAcc.id]);
      }
    }

    res.status(201).json({ success: true, id, referenceId: refId });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/sync', authMiddleware, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId = req.user!.id;
    const { transactions } = req.body;

    if (!Array.isArray(transactions) || transactions.length === 0) {
      res.json({ success: true, count: 0 });
      return;
    }

    let insertedCount = 0;
    for (const t of transactions) {
      const id = t.id || `TX_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
      const amount = Number(t.amount) || 0;
      if (amount <= 0) continue;
      const type = t.type === 'INCOME' ? 'INCOME' : 'EXPENSE';
      const categoryId = t.categoryId || 'cat_other';
      const merchant = t.merchant || t.receiver || 'General';
      const sender = t.sender || 'User';
      const receiver = t.receiver || merchant;
      const description = t.description || `${type === 'INCOME' ? 'Credit' : 'Debit'}: ${merchant}`;
      const paymentMethod = t.paymentMethod || 'UPI';
      const refId = t.referenceId || id;
      const status = t.status || 'SUCCESSFUL';
      const txnDate = t.timestamp ? new Date(t.timestamp).toISOString() : new Date().toISOString();

      // Check if this transaction already exists for this user by id or reference_id
      const existing = await getQuery<any>(
        'SELECT id FROM transactions WHERE user_id = ? AND (id = ? OR (reference_id = ? AND reference_id != \'\')) LIMIT 1',
        [userId, id, refId]
      );

      if (!existing) {
        await runQuery(`
          INSERT INTO transactions (id, user_id, category_id, type, amount, merchant, sender, receiver, description, payment_method, reference_id, status, transaction_date)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, [id, userId, categoryId, type, amount, merchant, sender, receiver, description, paymentMethod, refId, status, txnDate]);
        insertedCount++;
      }
    }

    res.json({ success: true, count: insertedCount });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/categories', async (_req, res: Response): Promise<void> => {
  try {
    const categories = await allQuery('SELECT * FROM categories');
    res.json({ categories });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
