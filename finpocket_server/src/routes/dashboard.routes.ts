import { Router, Response } from 'express';
import { AuthRequest, authMiddleware } from '../middleware/auth.middleware.js';
import { CalculationsService } from '../services/calculations.service.js';
import { allQuery, getQuery } from '../config/database.js';

const router = Router();

router.get('/summary', authMiddleware, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId = req.user!.id;
    const safeData = await CalculationsService.calculateSafeToSpend(userId);
    const efData = await CalculationsService.analyzeEmergencyFund(userId);
    const healthData = await CalculationsService.computeHealthScore(userId);

    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();

    const expenseRow = await getQuery<{ sum: number }>(
      `SELECT SUM(amount) as sum FROM transactions WHERE user_id = ? AND type = 'EXPENSE' AND transaction_date >= ?`,
      [userId, startOfMonth]
    );
    const thisMonthSpent = expenseRow?.sum || 0;

    const incomeRow = await getQuery<{ sum: number }>(
      `SELECT SUM(amount) as sum FROM transactions WHERE user_id = ? AND type = 'INCOME' AND transaction_date >= ?`,
      [userId, startOfMonth]
    );
    // Sum of real income rows, not a hardcoded ₹55,000. `?? 0` (rather than
    // `|| 0`) matters: SUM() is NULL with no rows, but a genuine ₹0 must also
    // stay ₹0 instead of being reported as a ₹55,000 salary.
    const thisMonthIncome = incomeRow?.sum ?? 0;

    const recentTransactions = await allQuery<any>(
      `SELECT t.*, c.name as category_name, c.color as category_color, c.icon as category_icon 
       FROM transactions t 
       LEFT JOIN categories c ON t.category_id = c.id 
       WHERE t.user_id = ? 
       ORDER BY t.transaction_date DESC LIMIT 100`,
      [userId]
    );

    const goals = await allQuery<any>(
      'SELECT * FROM savings_goals WHERE user_id = ? ORDER BY created_at DESC',
      [userId]
    );

    const accounts = await allQuery<any>(
      'SELECT * FROM bank_accounts WHERE user_id = ? ORDER BY is_primary DESC',
      [userId]
    );

    res.json({
      totalBalance: safeData.totalBalance,
      availableBalance: safeData.availableBalance,
      safeToSpend: safeData.safeToSpend,
      safeToSpendBreakdown: safeData,
      thisMonth: {
        income: thisMonthIncome,
        expenses: thisMonthSpent,
        savings: Math.max(0, thisMonthIncome - thisMonthSpent),
        savingsRate: healthData.savingsRate
      },
      emergencyFund: efData,
      healthScore: healthData,
      recentTransactions,
      savingsGoals: goals,
      bankAccounts: accounts,
      isMockMode: true
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/daily-brief', authMiddleware, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId = req.user!.id;
    const safeData = await CalculationsService.calculateSafeToSpend(userId);

    const today = new Date().toISOString().split('T')[0];
    const todayBills = await allQuery<any>(
      'SELECT * FROM bills WHERE user_id = ? AND due_date = ? AND is_paid_this_cycle = 0',
      [userId, today]
    );

    res.json({
      safeToSpend: safeData.safeToSpend,
      upcomingTodayCount: todayBills.length,
      upcomingTodayBills: todayBills,
      importantInsight: `Your Safe-to-Spend estimate is ₹${safeData.safeToSpend.toLocaleString()}. ₹${safeData.upcomingMandatoryBills.toLocaleString()} is reserved for upcoming obligations.`
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
