"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const auth_middleware_js_1 = require("../middleware/auth.middleware.js");
const calculations_service_js_1 = require("../services/calculations.service.js");
const financial_insights_service_js_1 = require("../services/financial_insights.service.js");
const financial_planning_service_js_1 = require("../services/financial_planning.service.js");
const database_js_1 = require("../config/database.js");
const router = (0, express_1.Router)();
/**
 * 1. GET /overview
 * Aggregated endpoint returning the complete dashboard state in a single request
 */
router.get('/overview', auth_middleware_js_1.authMiddleware, async (req, res) => {
    try {
        const userId = req.user.id;
        // Fetch all authoritative models in parallel
        const [safeData, commitments, monthlySummary, upcoming, pending, emergencyFund, savingsGoals, insights, dailyBrief, bankAccounts, recentTransactions] = await Promise.all([
            calculations_service_js_1.CalculationsService.calculateSafeToSpend(userId),
            calculations_service_js_1.CalculationsService.calculateCommittedMoney(userId),
            calculations_service_js_1.CalculationsService.getMonthlySummary(userId, 1),
            calculations_service_js_1.CalculationsService.getUpcomingPayments(userId, 'month'),
            calculations_service_js_1.CalculationsService.getPendingPayments(userId),
            calculations_service_js_1.CalculationsService.analyzeEmergencyFund(userId),
            calculations_service_js_1.CalculationsService.getSavingsGoalsIntelligence(userId),
            financial_insights_service_js_1.FinancialInsightsService.generateInsights(userId),
            financial_insights_service_js_1.FinancialInsightsService.generateDailyBrief(userId),
            (0, database_js_1.allQuery)('SELECT * FROM bank_accounts WHERE user_id = ? ORDER BY is_primary DESC', [userId]),
            (0, database_js_1.allQuery)(`SELECT t.*, c.name as category_name, c.color as category_color, c.icon as category_icon 
         FROM transactions t 
         LEFT JOIN categories c ON t.category_id = c.id 
         WHERE t.user_id = ? 
         ORDER BY t.transaction_date DESC LIMIT 100`, [userId])
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
    }
    catch (err) {
        res.status(500).json({ error: err.message });
    }
});
/**
 * 2. GET /safe-to-spend
 */
router.get('/safe-to-spend', auth_middleware_js_1.authMiddleware, async (req, res) => {
    try {
        const safeData = await calculations_service_js_1.CalculationsService.calculateSafeToSpend(req.user.id);
        res.json({ safeToSpend: safeData });
    }
    catch (err) {
        res.status(500).json({ error: err.message });
    }
});
/**
 * 3. GET /commitments
 */
router.get('/commitments', auth_middleware_js_1.authMiddleware, async (req, res) => {
    try {
        const commitments = await calculations_service_js_1.CalculationsService.calculateCommittedMoney(req.user.id);
        res.json({ commitments });
    }
    catch (err) {
        res.status(500).json({ error: err.message });
    }
});
/**
 * 4. GET /upcoming
 */
router.get('/upcoming', auth_middleware_js_1.authMiddleware, async (req, res) => {
    try {
        const period = req.query.period || 'month';
        const upcoming = await calculations_service_js_1.CalculationsService.getUpcomingPayments(req.user.id, period);
        res.json(upcoming);
    }
    catch (err) {
        res.status(500).json({ error: err.message });
    }
});
/**
 * 5. GET /pending
 */
router.get('/pending', auth_middleware_js_1.authMiddleware, async (req, res) => {
    try {
        const pending = await calculations_service_js_1.CalculationsService.getPendingPayments(req.user.id);
        // `pendingPayments` alias: the Flutter client reads this key; `pending`
        // stays for existing consumers.
        res.json({ pending, pendingPayments: pending });
    }
    catch (err) {
        res.status(500).json({ error: err.message });
    }
});
/**
 * 6. GET /monthly-summary
 */
router.get('/monthly-summary', auth_middleware_js_1.authMiddleware, async (req, res) => {
    try {
        const raw = (req.query.months ?? req.query.periodMonths);
        const months = parseInt(raw) || 1;
        const summary = await calculations_service_js_1.CalculationsService.getMonthlySummary(req.user.id, months);
        res.json({ summary });
    }
    catch (err) {
        res.status(500).json({ error: err.message });
    }
});
/**
 * 7. GET /spending
 */
router.get('/spending', auth_middleware_js_1.authMiddleware, async (req, res) => {
    try {
        const raw = (req.query.months ?? req.query.periodMonths);
        const months = parseInt(raw) || 1;
        const categories = await calculations_service_js_1.CalculationsService.getCategorySpending(req.user.id, months);
        // `categorySpending` alias: the Flutter client reads this key; `categories`
        // stays for existing consumers.
        res.json({ categories, categorySpending: categories });
    }
    catch (err) {
        res.status(500).json({ error: err.message });
    }
});
/**
 * 8. GET /trends
 */
router.get('/trends', auth_middleware_js_1.authMiddleware, async (req, res) => {
    try {
        const trends = await calculations_service_js_1.CalculationsService.getSpendingTrends(req.user.id);
        res.json({ trends });
    }
    catch (err) {
        res.status(500).json({ error: err.message });
    }
});
/**
 * 8b. GET /monthly-history — per-month income/spending series for the
 * Analytics screen (area chart + per-category sparklines).
 */
router.get('/monthly-history', auth_middleware_js_1.authMiddleware, async (req, res) => {
    try {
        const raw = (req.query.months ?? req.query.periodMonths);
        const months = parseInt(raw) || 8;
        const history = await calculations_service_js_1.CalculationsService.getMonthlyHistory(req.user.id, months);
        res.json(history);
    }
    catch (err) {
        res.status(500).json({ error: err.message });
    }
});
/**
 * 9. GET /what-changed
 */
router.get('/what-changed', auth_middleware_js_1.authMiddleware, async (req, res) => {
    try {
        const whatChanged = await financial_insights_service_js_1.FinancialInsightsService.calculateWhatChanged(req.user.id);
        res.json({ whatChanged });
    }
    catch (err) {
        res.status(500).json({ error: err.message });
    }
});
/**
 * 10. GET /recurring
 */
router.get('/recurring', auth_middleware_js_1.authMiddleware, async (req, res) => {
    try {
        const recurring = await financial_insights_service_js_1.FinancialInsightsService.detectRecurringPayments(req.user.id);
        res.json(recurring);
    }
    catch (err) {
        res.status(500).json({ error: err.message });
    }
});
/**
 * 11. POST /simulate-affordability
 */
router.post('/simulate-affordability', auth_middleware_js_1.authMiddleware, async (req, res) => {
    try {
        const { amount } = req.body;
        if (!amount || isNaN(Number(amount)) || Number(amount) <= 0) {
            res.status(400).json({ error: 'Valid positive amount is required.' });
            return;
        }
        const simulation = await calculations_service_js_1.CalculationsService.simulateEnhancedAffordability(req.user.id, Number(amount));
        res.json({ simulation });
    }
    catch (err) {
        res.status(500).json({ error: err.message });
    }
});
/**
 * 12. GET /insights
 */
router.get('/insights', auth_middleware_js_1.authMiddleware, async (req, res) => {
    try {
        const insights = await financial_insights_service_js_1.FinancialInsightsService.generateInsights(req.user.id);
        res.json({ insights });
    }
    catch (err) {
        res.status(500).json({ error: err.message });
    }
});
/**
 * 13. GET /daily-brief
 */
router.get('/daily-brief', auth_middleware_js_1.authMiddleware, async (req, res) => {
    try {
        const brief = await financial_insights_service_js_1.FinancialInsightsService.generateDailyBrief(req.user.id);
        res.json({ brief });
    }
    catch (err) {
        res.status(500).json({ error: err.message });
    }
});
// ==========================================
// PHASE 3 ADVANCED FINANCIAL INTELLIGENCE APIS
// ==========================================
/**
 * 14. GET /budgets & /budgets/summary
 */
router.get('/budgets', auth_middleware_js_1.authMiddleware, async (req, res) => {
    try {
        const summary = await financial_planning_service_js_1.FinancialPlanningService.getBudgetSummary(req.user.id);
        res.json(summary);
    }
    catch (err) {
        res.status(500).json({ error: err.message });
    }
});
router.get('/budgets/summary', auth_middleware_js_1.authMiddleware, async (req, res) => {
    try {
        const summary = await financial_planning_service_js_1.FinancialPlanningService.getBudgetSummary(req.user.id);
        res.json(summary);
    }
    catch (err) {
        res.status(500).json({ error: err.message });
    }
});
/**
 * 15. GET /cash-flow/forecast
 */
router.get('/cash-flow/forecast', auth_middleware_js_1.authMiddleware, async (req, res) => {
    try {
        const days = parseInt(req.query.days) || 30;
        const validDays = (days === 7 || days === 90 ? days : 30);
        const forecast = await financial_planning_service_js_1.FinancialPlanningService.getCashFlowForecast(req.user.id, validDays);
        res.json(forecast);
    }
    catch (err) {
        res.status(500).json({ error: err.message });
    }
});
/**
 * 16. GET /calendar
 */
router.get('/calendar', auth_middleware_js_1.authMiddleware, async (req, res) => {
    try {
        const filter = req.query.filter || 'month';
        const events = await financial_planning_service_js_1.FinancialPlanningService.getFinancialCalendar(req.user.id, filter);
        res.json({ events });
    }
    catch (err) {
        res.status(500).json({ error: err.message });
    }
});
/**
 * 17. GET /savings/plan
 */
router.get('/savings/plan', auth_middleware_js_1.authMiddleware, async (req, res) => {
    try {
        const goals = await calculations_service_js_1.CalculationsService.getSavingsGoalsIntelligence(req.user.id);
        res.json({ goals });
    }
    catch (err) {
        res.status(500).json({ error: err.message });
    }
});
/**
 * 18. POST /savings/simulate
 */
router.post('/savings/simulate', auth_middleware_js_1.authMiddleware, async (req, res) => {
    try {
        const { goalId, extraMonthly, targetMonths } = req.body;
        const extra = parseFloat(extraMonthly) || 3000;
        const result = await financial_planning_service_js_1.FinancialPlanningService.simulateSavingsScenario(req.user.id, goalId, extra, targetMonths);
        res.json({ simulation: result });
    }
    catch (err) {
        res.status(500).json({ error: err.message });
    }
});
/**
 * 19. GET /emergency-fund/plan
 */
router.get('/emergency-fund/plan', auth_middleware_js_1.authMiddleware, async (req, res) => {
    try {
        const plan = await financial_planning_service_js_1.FinancialPlanningService.getEmergencyFundPlan(req.user.id);
        res.json(plan);
    }
    catch (err) {
        res.status(500).json({ error: err.message });
    }
});
/**
 * 20. GET /anomalies
 */
router.get('/anomalies', auth_middleware_js_1.authMiddleware, async (req, res) => {
    try {
        const anomalies = await financial_planning_service_js_1.FinancialPlanningService.detectAnomalies(req.user.id);
        res.json({ anomalies });
    }
    catch (err) {
        res.status(500).json({ error: err.message });
    }
});
/**
 * 21. GET /duplicates
 */
router.get('/duplicates', auth_middleware_js_1.authMiddleware, async (req, res) => {
    try {
        const duplicates = await financial_planning_service_js_1.FinancialPlanningService.detectDuplicates(req.user.id);
        res.json({ duplicates });
    }
    catch (err) {
        res.status(500).json({ error: err.message });
    }
});
/**
 * 22. GET /health-overview
 */
router.get('/health-overview', auth_middleware_js_1.authMiddleware, async (req, res) => {
    try {
        const health = await financial_planning_service_js_1.FinancialPlanningService.getFinancialHealthIndicators(req.user.id);
        res.json(health);
    }
    catch (err) {
        res.status(500).json({ error: err.message });
    }
});
/**
 * 23. POST /simulate
 */
router.post('/simulate', auth_middleware_js_1.authMiddleware, async (req, res) => {
    try {
        const simulation = await financial_planning_service_js_1.FinancialPlanningService.simulateFinancialScenario(req.user.id, req.body || {});
        res.json({ simulation });
    }
    catch (err) {
        res.status(500).json({ error: err.message });
    }
});
/**
 * 24. GET /alerts
 */
router.get('/alerts', auth_middleware_js_1.authMiddleware, async (req, res) => {
    try {
        const alerts = await financial_planning_service_js_1.FinancialPlanningService.getAlerts(req.user.id);
        res.json({ alerts });
    }
    catch (err) {
        res.status(500).json({ error: err.message });
    }
});
/**
 * 25. GET /daily-brief-v2
 */
router.get('/daily-brief-v2', auth_middleware_js_1.authMiddleware, async (req, res) => {
    try {
        const brief = await financial_planning_service_js_1.FinancialPlanningService.getDailyBriefV2(req.user.id);
        res.json({ brief });
    }
    catch (err) {
        res.status(500).json({ error: err.message });
    }
});
/**
 * 26. GET /advanced-overview (Aggregated Single-Roundtrip Endpoint for Phase 3)
 */
router.get('/advanced-overview', auth_middleware_js_1.authMiddleware, async (req, res) => {
    try {
        const userId = req.user.id;
        const [safeData, commitments, budgets, forecast30, calendar, goals, emergencyPlan, recurring, anomalies, duplicates, health, alerts, briefV2] = await Promise.all([
            calculations_service_js_1.CalculationsService.calculateSafeToSpend(userId),
            calculations_service_js_1.CalculationsService.calculateCommittedMoney(userId),
            financial_planning_service_js_1.FinancialPlanningService.getBudgetSummary(userId),
            financial_planning_service_js_1.FinancialPlanningService.getCashFlowForecast(userId, 30),
            financial_planning_service_js_1.FinancialPlanningService.getFinancialCalendar(userId, 'month'),
            calculations_service_js_1.CalculationsService.getSavingsGoalsIntelligence(userId),
            financial_planning_service_js_1.FinancialPlanningService.getEmergencyFundPlan(userId),
            financial_insights_service_js_1.FinancialInsightsService.detectRecurringPayments(userId),
            financial_planning_service_js_1.FinancialPlanningService.detectAnomalies(userId),
            financial_planning_service_js_1.FinancialPlanningService.detectDuplicates(userId),
            financial_planning_service_js_1.FinancialPlanningService.getFinancialHealthIndicators(userId),
            financial_planning_service_js_1.FinancialPlanningService.getAlerts(userId),
            financial_planning_service_js_1.FinancialPlanningService.getDailyBriefV2(userId)
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
    }
    catch (err) {
        res.status(500).json({ error: err.message });
    }
});
exports.default = router;
//# sourceMappingURL=financial.routes.js.map