"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const auth_middleware_js_1 = require("../middleware/auth.middleware.js");
const calculations_service_js_1 = require("../services/calculations.service.js");
const database_js_1 = require("../config/database.js");
const router = (0, express_1.Router)();
router.get('/summary', auth_middleware_js_1.authMiddleware, async (req, res) => {
    try {
        const userId = req.user.id;
        const safeData = await calculations_service_js_1.CalculationsService.calculateSafeToSpend(userId);
        const efData = await calculations_service_js_1.CalculationsService.analyzeEmergencyFund(userId);
        const healthData = await calculations_service_js_1.CalculationsService.computeHealthScore(userId);
        const now = new Date();
        const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
        const expenseRow = await (0, database_js_1.getQuery)(`SELECT SUM(amount) as sum FROM transactions WHERE user_id = ? AND type = 'EXPENSE' AND transaction_date >= ?`, [userId, startOfMonth]);
        const thisMonthSpent = expenseRow?.sum || 0;
        const incomeRow = await (0, database_js_1.getQuery)(`SELECT SUM(amount) as sum FROM transactions WHERE user_id = ? AND type = 'INCOME' AND transaction_date >= ?`, [userId, startOfMonth]);
        // Sum of real income rows, not a hardcoded ₹55,000. `?? 0` (rather than
        // `|| 0`) matters: SUM() is NULL with no rows, but a genuine ₹0 must also
        // stay ₹0 instead of being reported as a ₹55,000 salary.
        const thisMonthIncome = incomeRow?.sum ?? 0;
        const recentTransactions = await (0, database_js_1.allQuery)(`SELECT t.*, c.name as category_name, c.color as category_color, c.icon as category_icon 
       FROM transactions t 
       LEFT JOIN categories c ON t.category_id = c.id 
       WHERE t.user_id = ? 
       ORDER BY t.transaction_date DESC LIMIT 100`, [userId]);
        const goals = await (0, database_js_1.allQuery)('SELECT * FROM savings_goals WHERE user_id = ? ORDER BY created_at DESC', [userId]);
        const accounts = await (0, database_js_1.allQuery)('SELECT * FROM bank_accounts WHERE user_id = ? ORDER BY is_primary DESC', [userId]);
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
    }
    catch (err) {
        res.status(500).json({ error: err.message });
    }
});
router.get('/daily-brief', auth_middleware_js_1.authMiddleware, async (req, res) => {
    try {
        const userId = req.user.id;
        const safeData = await calculations_service_js_1.CalculationsService.calculateSafeToSpend(userId);
        const today = new Date().toISOString().split('T')[0];
        const todayBills = await (0, database_js_1.allQuery)('SELECT * FROM bills WHERE user_id = ? AND due_date = ? AND is_paid_this_cycle = 0', [userId, today]);
        res.json({
            safeToSpend: safeData.safeToSpend,
            upcomingTodayCount: todayBills.length,
            upcomingTodayBills: todayBills,
            importantInsight: `Your Safe-to-Spend estimate is ₹${safeData.safeToSpend.toLocaleString()}. ₹${safeData.upcomingMandatoryBills.toLocaleString()} is reserved for upcoming obligations.`
        });
    }
    catch (err) {
        res.status(500).json({ error: err.message });
    }
});
exports.default = router;
//# sourceMappingURL=dashboard.routes.js.map