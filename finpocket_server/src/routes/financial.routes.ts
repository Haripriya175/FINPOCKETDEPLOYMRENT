import { Router, Response } from 'express';
import { AuthRequest, authMiddleware } from '../middleware/auth.middleware.js';
import { CalculationsService } from '../services/calculations.service.js';
import { FinancialInsightsService } from '../services/financial_insights.service.js';
import { FinancialPlanningService } from '../services/financial_planning.service.js';
import { allQuery } from '../config/database.js';

const router = Router();

/**
 * 1. GET /overview
 * Aggregated endpoint returning the complete dashboard state in a single request
 */
router.get('/overview', authMiddleware, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId = req.user!.id;

    // Fetch all authoritative models in parallel
    const [
      safeData,
      commitments,
      monthlySummary,
      upcoming,
      pending,
      emergencyFund,
      savingsGoals,
      insights,
      dailyBrief,
      bankAccounts,
      recentTransactions
    ] = await Promise.all([
      CalculationsService.calculateSafeToSpend(userId),
      CalculationsService.calculateCommittedMoney(userId),
      CalculationsService.getMonthlySummary(userId, 1),
      CalculationsService.getUpcomingPayments(userId, 'month'),
      CalculationsService.getPendingPayments(userId),
      CalculationsService.analyzeEmergencyFund(userId),
      CalculationsService.getSavingsGoalsIntelligence(userId),
      FinancialInsightsService.generateInsights(userId),
      FinancialInsightsService.generateDailyBrief(userId),
      allQuery('SELECT * FROM bank_accounts WHERE user_id = ? ORDER BY is_primary DESC', [userId]),
      allQuery(
        `SELECT t.*, c.name as category_name, c.color as category_color, c.icon as category_icon 
         FROM transactions t 
         LEFT JOIN categories c ON t.category_id = c.id 
         WHERE t.user_id = ? 
         ORDER BY t.transaction_date DESC LIMIT 100`,
        [userId]
      )
    ]);

    res.json({
      balance: {
        totalBalance: safeData.totalBalance,
        availableBalance: safeData.availableBalance,
        currency: 'INR'
      },
      safeToSpend: safeData,
      commitments,
      thisMonth: {
        income: monthlySummary.income,
        expenses: monthlySummary.expenses,
        savings: monthlySummary.savings,
        savingsRate: monthlySummary.savingsRate
      },
      upcomingPayments: upcoming,
      pendingPayments: pending,
      emergencyFund,
      savingsGoals,
      insights: insights.slice(0, 3),
      dailyBrief,
      bankAccounts,
      recentTransactions,
      isMockMode: true
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * 2. GET /safe-to-spend
 */
router.get('/safe-to-spend', authMiddleware, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const safeData = await CalculationsService.calculateSafeToSpend(req.user!.id);
    res.json({ safeToSpend: safeData });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * 3. GET /commitments
 */
router.get('/commitments', authMiddleware, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const commitments = await CalculationsService.calculateCommittedMoney(req.user!.id);
    res.json({ commitments });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * 4. GET /upcoming
 */
router.get('/upcoming', authMiddleware, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const period = (req.query.period as 'today' | 'week' | 'month' | 'all') || 'month';
    const upcoming = await CalculationsService.getUpcomingPayments(req.user!.id, period);
    res.json(upcoming);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * 5. GET /pending
 */
router.get('/pending', authMiddleware, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const pending = await CalculationsService.getPendingPayments(req.user!.id);
    // `pendingPayments` alias: the Flutter client reads this key; `pending`
    // stays for existing consumers.
    res.json({ pending, pendingPayments: pending });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * 6. GET /monthly-summary
 */
router.get('/monthly-summary', authMiddleware, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const raw = (req.query.months ?? req.query.periodMonths) as string;
    const months = parseInt(raw) || 1;
    const summary = await CalculationsService.getMonthlySummary(req.user!.id, months);
    res.json({ summary });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * 7. GET /spending
 */
router.get('/spending', authMiddleware, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const raw = (req.query.months ?? req.query.periodMonths) as string;
    const months = parseInt(raw) || 1;
    const categories = await CalculationsService.getCategorySpending(req.user!.id, months);
    // `categorySpending` alias: the Flutter client reads this key; `categories`
    // stays for existing consumers.
    res.json({ categories, categorySpending: categories });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * 8. GET /trends
 */
router.get('/trends', authMiddleware, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const trends = await CalculationsService.getSpendingTrends(req.user!.id);
    res.json({ trends });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * 8b. GET /monthly-history — per-month income/spending series for the
 * Analytics screen (area chart + per-category sparklines).
 */
router.get('/monthly-history', authMiddleware, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const raw = (req.query.months ?? req.query.periodMonths) as string;
    const months = parseInt(raw) || 8;
    const history = await CalculationsService.getMonthlyHistory(req.user!.id, months);
    res.json(history);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * 9. GET /what-changed
 */
router.get('/what-changed', authMiddleware, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const whatChanged = await FinancialInsightsService.calculateWhatChanged(req.user!.id);
    res.json({ whatChanged });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * 10. GET /recurring
 */
router.get('/recurring', authMiddleware, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const recurring = await FinancialInsightsService.detectRecurringPayments(req.user!.id);
    res.json(recurring);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * 11. POST /simulate-affordability
 */
router.post('/simulate-affordability', authMiddleware, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { amount } = req.body;
    if (!amount || isNaN(Number(amount)) || Number(amount) <= 0) {
      res.status(400).json({ error: 'Valid positive amount is required.' });
      return;
    }

    const simulation = await CalculationsService.simulateEnhancedAffordability(req.user!.id, Number(amount));
    res.json({ simulation });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * 12. GET /insights
 */
router.get('/insights', authMiddleware, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const insights = await FinancialInsightsService.generateInsights(req.user!.id);
    res.json({ insights });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * 13. GET /daily-brief
 */
router.get('/daily-brief', authMiddleware, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const brief = await FinancialInsightsService.generateDailyBrief(req.user!.id);
    res.json({ brief });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ==========================================
// PHASE 3 ADVANCED FINANCIAL INTELLIGENCE APIS
// ==========================================

/**
 * 14. GET /budgets & /budgets/summary
 */
router.get('/budgets', authMiddleware, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const summary = await FinancialPlanningService.getBudgetSummary(req.user!.id);
    res.json(summary);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/budgets/summary', authMiddleware, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const summary = await FinancialPlanningService.getBudgetSummary(req.user!.id);
    res.json(summary);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * 15. GET /cash-flow/forecast
 */
router.get('/cash-flow/forecast', authMiddleware, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const days = parseInt(req.query.days as string) || 30;
    const validDays = (days === 7 || days === 90 ? days : 30) as 7 | 30 | 90;
    const forecast = await FinancialPlanningService.getCashFlowForecast(req.user!.id, validDays);
    res.json(forecast);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * 16. GET /calendar
 */
router.get('/calendar', authMiddleware, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const filter = (req.query.filter as any) || 'month';
    const events = await FinancialPlanningService.getFinancialCalendar(req.user!.id, filter);
    res.json({ events });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * 17. GET /savings/plan
 */
router.get('/savings/plan', authMiddleware, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const goals = await CalculationsService.getSavingsGoalsIntelligence(req.user!.id);
    res.json({ goals });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * 18. POST /savings/simulate
 */
router.post('/savings/simulate', authMiddleware, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { goalId, extraMonthly, targetMonths } = req.body;
    const extra = parseFloat(extraMonthly) || 3000;
    const result = await FinancialPlanningService.simulateSavingsScenario(req.user!.id, goalId, extra, targetMonths);
    res.json({ simulation: result });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * 19. GET /emergency-fund/plan
 */
router.get('/emergency-fund/plan', authMiddleware, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const plan = await FinancialPlanningService.getEmergencyFundPlan(req.user!.id);
    res.json(plan);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * 20. GET /anomalies
 */
router.get('/anomalies', authMiddleware, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const anomalies = await FinancialPlanningService.detectAnomalies(req.user!.id);
    res.json({ anomalies });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * 21. GET /duplicates
 */
router.get('/duplicates', authMiddleware, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const duplicates = await FinancialPlanningService.detectDuplicates(req.user!.id);
    res.json({ duplicates });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * 22. GET /health-overview
 */
router.get('/health-overview', authMiddleware, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const health = await FinancialPlanningService.getFinancialHealthIndicators(req.user!.id);
    res.json(health);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * 23. POST /simulate
 */
router.post('/simulate', authMiddleware, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const simulation = await FinancialPlanningService.simulateFinancialScenario(req.user!.id, req.body || {});
    res.json({ simulation });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * 24. GET /alerts
 */
router.get('/alerts', authMiddleware, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const alerts = await FinancialPlanningService.getAlerts(req.user!.id);
    res.json({ alerts });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * 25. GET /daily-brief-v2
 */
router.get('/daily-brief-v2', authMiddleware, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const brief = await FinancialPlanningService.getDailyBriefV2(req.user!.id);
    res.json({ brief });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * 26. GET /advanced-overview (Aggregated Single-Roundtrip Endpoint for Phase 3)
 */
router.get('/advanced-overview', authMiddleware, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId = req.user!.id;

    const [
      safeData,
      commitments,
      budgets,
      forecast30,
      calendar,
      goals,
      emergencyPlan,
      recurring,
      anomalies,
      duplicates,
      health,
      alerts,
      briefV2
    ] = await Promise.all([
      CalculationsService.calculateSafeToSpend(userId),
      CalculationsService.calculateCommittedMoney(userId),
      FinancialPlanningService.getBudgetSummary(userId),
      FinancialPlanningService.getCashFlowForecast(userId, 30),
      FinancialPlanningService.getFinancialCalendar(userId, 'month'),
      CalculationsService.getSavingsGoalsIntelligence(userId),
      FinancialPlanningService.getEmergencyFundPlan(userId),
      FinancialInsightsService.detectRecurringPayments(userId),
      FinancialPlanningService.detectAnomalies(userId),
      FinancialPlanningService.detectDuplicates(userId),
      FinancialPlanningService.getFinancialHealthIndicators(userId),
      FinancialPlanningService.getAlerts(userId),
      FinancialPlanningService.getDailyBriefV2(userId)
    ]);

    res.json({
      safeToSpend: safeData,
      commitments,
      budgets,
      forecast: forecast30,
      calendar,
      savingsGoals: goals,
      emergencyFund: emergencyPlan,
      recurring,
      anomalies,
      duplicates,
      financialHealth: health,
      alerts,
      dailyBrief: briefV2,
      isMockMode: true
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
