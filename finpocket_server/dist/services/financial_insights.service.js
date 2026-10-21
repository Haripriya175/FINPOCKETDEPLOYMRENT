"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.FinancialInsightsService = void 0;
const database_js_1 = require("../config/database.js");
const calculations_service_js_1 = require("./calculations.service.js");
class FinancialInsightsService {
    /**
     * Deterministically generates data-backed insights by analyzing current and historical transactions,
     * emergency fund coverage, recurring bills, and savings progress.
     */
    static async generateInsights(userId) {
        const insights = [];
        const now = new Date();
        const currentMonthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
        const prevMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1).toISOString();
        const prevMonthEnd = currentMonthStart;
        // 1. Food Category Spending Comparison
        const currentFoodRow = await (0, database_js_1.getQuery)(`SELECT SUM(t.amount) as sum FROM transactions t
       LEFT JOIN categories c ON t.category_id = c.id
       WHERE t.user_id = ? AND t.type = 'EXPENSE' AND (c.name = 'Food' OR t.category_id = 'cat_food') AND t.transaction_date >= ?`, [userId, currentMonthStart]);
        const prevFoodRow = await (0, database_js_1.getQuery)(`SELECT SUM(t.amount) as sum FROM transactions t
       LEFT JOIN categories c ON t.category_id = c.id
       WHERE t.user_id = ? AND t.type = 'EXPENSE' AND (c.name = 'Food' OR t.category_id = 'cat_food') AND t.transaction_date >= ? AND t.transaction_date < ?`, [userId, prevMonthStart, prevMonthEnd]);
        // Real sums only — `|| 4200 / || 3680` used to invent a "+14% food
        // spending" claim for users with no food transactions at all.
        const currentFood = Number(currentFoodRow?.sum ?? 0);
        const prevFood = Number(prevFoodRow?.sum ?? 0);
        if (prevFood > 0) {
            const foodDeltaPct = Math.round(((currentFood - prevFood) / prevFood) * 100);
            if (foodDeltaPct > 5) {
                insights.push({
                    id: `ins_food_${Date.now()}`,
                    type: 'SPENDING_INCREASE',
                    title: 'Food Spending Increase',
                    explanation: `Your food spending is ${foodDeltaPct}% higher than your recent average (₹${currentFood.toLocaleString()} vs ₹${prevFood.toLocaleString()}).`,
                    supportingValues: { current: currentFood, previous: prevFood, deltaPercentage: foodDeltaPct },
                    period: 'THIS_MONTH',
                    confidence: 0.95,
                    createdAt: now.toISOString()
                });
            }
        }
        // 2. Savings Improvement Analysis
        const currentIncomeRow = await (0, database_js_1.getQuery)(`SELECT SUM(amount) as sum FROM transactions WHERE user_id = ? AND type = 'INCOME' AND transaction_date >= ?`, [userId, currentMonthStart]);
        const currentExpenseRow = await (0, database_js_1.getQuery)(`SELECT SUM(amount) as sum FROM transactions WHERE user_id = ? AND type = 'EXPENSE' AND transaction_date >= ?`, [userId, currentMonthStart]);
        const prevIncomeRow = await (0, database_js_1.getQuery)(`SELECT SUM(amount) as sum FROM transactions WHERE user_id = ? AND type = 'INCOME' AND transaction_date >= ? AND transaction_date < ?`, [userId, prevMonthStart, prevMonthEnd]);
        const prevExpenseRow = await (0, database_js_1.getQuery)(`SELECT SUM(amount) as sum FROM transactions WHERE user_id = ? AND type = 'EXPENSE' AND transaction_date >= ? AND transaction_date < ?`, [userId, prevMonthStart, prevMonthEnd]);
        // Real sums only — the old `|| 55000 - || 16020` fallbacks assumed a
        // ₹55,000 salary and ₹16,020 spend whenever the actual sums were NULL.
        const currentSavings = Math.max(0, Number(currentIncomeRow?.sum ?? 0) - Number(currentExpenseRow?.sum ?? 0));
        const prevSavings = Math.max(0, Number(prevIncomeRow?.sum ?? 0) - Number(prevExpenseRow?.sum ?? 0));
        const savingsDelta = currentSavings - prevSavings;
        if (savingsDelta > 0) {
            insights.push({
                id: `ins_savings_${Date.now()}`,
                type: 'SAVINGS_IMPROVEMENT',
                title: 'Savings Improvement',
                explanation: `Your savings increased by ₹${savingsDelta.toLocaleString()} compared with last month.`,
                supportingValues: { currentSavings, prevSavings, savingsDelta },
                period: 'THIS_MONTH',
                confidence: 0.98,
                createdAt: now.toISOString()
            });
        }
        // 3. Upcoming Commitment Pressure
        const commitments = await calculations_service_js_1.CalculationsService.calculateCommittedMoney(userId);
        if (commitments.totalCommitted > 0) {
            insights.push({
                id: `ins_commit_${Date.now()}`,
                type: 'UPCOMING_PRESSURE',
                title: 'Upcoming Financial Commitments',
                explanation: `You have ₹${commitments.totalCommitted.toLocaleString()} in committed upcoming obligations and savings allocations this cycle.`,
                supportingValues: {
                    bills: commitments.bills,
                    subscriptions: commitments.subscriptions,
                    savingsCommitment: commitments.savingsCommitment,
                    emergencyReserve: commitments.emergencyReserve,
                    totalCommitted: commitments.totalCommitted
                },
                period: 'CURRENT_CYCLE',
                confidence: 1.0,
                createdAt: now.toISOString()
            });
        }
        // 4. Emergency Fund Coverage
        const efData = await calculations_service_js_1.CalculationsService.analyzeEmergencyFund(userId);
        insights.push({
            id: `ins_ef_${Date.now()}`,
            type: 'EMERGENCY_FUND',
            title: 'Emergency Reserve Coverage',
            explanation: `Your emergency fund currently covers approximately ${efData.monthsOfCoverage} months of estimated essential expenses (Target: 6 months).`,
            supportingValues: {
                currentAmount: efData.currentAmount,
                targetAmount: efData.targetAmount,
                monthsOfCoverage: efData.monthsOfCoverage,
                essentialMonthlyExpenses: efData.essentialMonthlyExpenses
            },
            period: 'LIFETIME',
            confidence: 0.92,
            createdAt: now.toISOString()
        });
        return insights;
    }
    /**
     * Detects recurring payments & subscriptions from bills, EMIs, and recurring transactions
     */
    static async detectRecurringPayments(userId) {
        const subscriptions = [];
        // 1. Confirmed active recurring bills
        const bills = await (0, database_js_1.allQuery)('SELECT * FROM bills WHERE user_id = ? AND is_active = 1', [userId]);
        for (const b of bills) {
            const isSub = b.name.toLowerCase().includes('netflix') ||
                b.name.toLowerCase().includes('spotify') ||
                b.name.toLowerCase().includes('prime') ||
                b.name.toLowerCase().includes('canva') ||
                b.name.toLowerCase().includes('fiber') ||
                b.name.toLowerCase().includes('internet') ||
                b.name.toLowerCase().includes('rent');
            subscriptions.push({
                id: b.id,
                merchantName: b.name,
                category: b.category || 'Utilities',
                amount: b.amount,
                frequency: b.recurrence === 'YEARLY' ? 'YEARLY' : 'MONTHLY',
                annualizedAmount: b.recurrence === 'YEARLY' ? b.amount : b.amount * 12,
                confidenceLevel: isSub ? 'CONFIRMED' : 'LIKELY',
                lastBilledDate: b.last_paid_date || '',
                nextExpectedDate: b.due_date
            });
        }
        // 2. Active EMIs
        const emis = await (0, database_js_1.allQuery)('SELECT * FROM emis WHERE user_id = ?', [userId]);
        for (const e of emis) {
            subscriptions.push({
                id: e.id,
                merchantName: e.loan_name,
                category: 'EMI',
                amount: e.monthly_emi,
                frequency: 'MONTHLY',
                annualizedAmount: e.monthly_emi * 12,
                confidenceLevel: 'CONFIRMED',
                lastBilledDate: '',
                nextExpectedDate: e.next_due_date
            });
        }
        // Real-data rule: only the user's registered bills, EMIs and detected
        // recurring payments are ever listed. (A "rich UI" block that injected
        // Netflix/Spotify/Amazon Prime for anyone with fewer than 3 items was
        // removed — fabricated subscriptions are still fabrication.)
        const monthlyTotal = subscriptions.reduce((sum, s) => sum + (s.frequency === 'MONTHLY' ? s.amount : s.amount / 12), 0);
        const annualTotal = subscriptions.reduce((sum, s) => sum + s.annualizedAmount, 0);
        return {
            subscriptions,
            monthlyTotal: Math.round(monthlyTotal),
            annualTotal: Math.round(annualTotal)
        };
    }
    /**
     * Computes "What Changed This Month?" delta analysis
     */
    static async calculateWhatChanged(userId) {
        const now = new Date();
        const currentMonthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
        const prevMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1).toISOString();
        const prevMonthEnd = currentMonthStart;
        // Current month category spending
        const currentCats = await (0, database_js_1.allQuery)(`SELECT COALESCE(c.name, 'Other') as name, SUM(t.amount) as sum 
       FROM transactions t 
       LEFT JOIN categories c ON t.category_id = c.id 
       WHERE t.user_id = ? AND t.type = 'EXPENSE' AND t.transaction_date >= ?
       GROUP BY COALESCE(c.name, 'Other')`, [userId, currentMonthStart]);
        // Prev month category spending
        const prevCats = await (0, database_js_1.allQuery)(`SELECT COALESCE(c.name, 'Other') as name, SUM(t.amount) as sum 
       FROM transactions t 
       LEFT JOIN categories c ON t.category_id = c.id 
       WHERE t.user_id = ? AND t.type = 'EXPENSE' AND t.transaction_date >= ? AND t.transaction_date < ?
       GROUP BY COALESCE(c.name, 'Other')`, [userId, prevMonthStart, prevMonthEnd]);
        const prevCatMap = new Map();
        for (const p of prevCats) {
            prevCatMap.set(p.name, p.sum);
        }
        // Categories come from real rows only. This used to union in a hardcoded
        // baseline (Food 4200/3000, Shopping 3100/3900, Rent 14000/14000), so a
        // user with no Food spending this month was still reported as having spent
        // ₹4,200 — and those invented figures fed the headline insights.
        const categoryDeltas = [];
        const allCatNames = new Set([
            ...currentCats.map(c => c.name),
            ...prevCats.map(c => c.name)
        ]);
        for (const name of allCatNames) {
            const foundCurrent = currentCats.find(c => c.name === name);
            const currentAmount = foundCurrent?.sum ?? 0;
            const prevAmount = prevCatMap.get(name) ?? 0;
            const deltaAmount = currentAmount - prevAmount;
            const deltaPercentage = prevAmount > 0 ? Math.round((deltaAmount / prevAmount) * 100) : 0;
            let trend = 'UNCHANGED';
            if (deltaAmount > 50)
                trend = 'INCREASED';
            else if (deltaAmount < -50)
                trend = 'DECREASED';
            categoryDeltas.push({
                category: name,
                previousAmount: prevAmount,
                currentAmount,
                deltaAmount,
                deltaPercentage,
                trend
            });
        }
        // Real income for both months. Previously hardcoded to ₹55,000 vs ₹50,000,
        // so every user's savings delta was a fabricated ₹5,000 no matter what they
        // actually earned.
        const currentIncome = (await (0, database_js_1.getQuery)(`SELECT SUM(amount) as sum FROM transactions WHERE user_id = ? AND type = 'INCOME' AND transaction_date >= ?`, [userId, currentMonthStart]))?.sum ?? 0;
        const prevIncome = (await (0, database_js_1.getQuery)(`SELECT SUM(amount) as sum FROM transactions WHERE user_id = ? AND type = 'INCOME' AND transaction_date >= ? AND transaction_date < ?`, [userId, prevMonthStart, prevMonthEnd]))?.sum ?? 0;
        const incomeDelta = currentIncome - prevIncome;
        const currentExpenseTotal = categoryDeltas.reduce((s, c) => s + c.currentAmount, 0);
        const prevExpenseTotal = categoryDeltas.reduce((s, c) => s + c.previousAmount, 0);
        const expensesDelta = currentExpenseTotal - prevExpenseTotal;
        const currentSavings = Math.max(0, currentIncome - currentExpenseTotal);
        const prevSavings = Math.max(0, prevIncome - prevExpenseTotal);
        const savingsDelta = currentSavings - prevSavings;
        // Headline insights built from the deltas above. This used to return four
        // fixed sentences — "Food spending increased by ₹1,200 (+40%)",
        // "Shopping spending decreased by ₹800 (-21%)" — which were identical for
        // every account and true for none of them.
        const keyChanges = [];
        const biggestMove = [...categoryDeltas]
            .filter((c) => c.trend !== 'UNCHANGED')
            .sort((a, b) => Math.abs(b.deltaAmount) - Math.abs(a.deltaAmount))[0];
        if (biggestMove) {
            const direction = biggestMove.deltaAmount > 0 ? 'increased' : 'decreased';
            const pct = biggestMove.deltaPercentage
                ? ` (${biggestMove.deltaAmount > 0 ? '+' : ''}${biggestMove.deltaPercentage}%)`
                : '';
            keyChanges.push(`${biggestMove.category} spending ${direction} by ₹${Math.abs(biggestMove.deltaAmount).toLocaleString()}${pct} versus last month.`);
        }
        if (savingsDelta > 0) {
            keyChanges.push(`You kept ₹${savingsDelta.toLocaleString()} more than last month.`);
        }
        else if (savingsDelta < 0) {
            keyChanges.push(`You kept ₹${Math.abs(savingsDelta).toLocaleString()} less than last month.`);
        }
        if (expensesDelta > 0) {
            keyChanges.push(`Overall spending rose by ₹${expensesDelta.toLocaleString()} month over month.`);
        }
        else if (expensesDelta < 0) {
            keyChanges.push(`Overall spending fell by ₹${Math.abs(expensesDelta).toLocaleString()} month over month.`);
        }
        if (keyChanges.length === 0) {
            keyChanges.push('Spending is steady — no significant change from last month.');
        }
        const fmtMonth = (d) => d.toLocaleString('en-US', { month: 'long', year: 'numeric' });
        return {
            periodLabel: `${fmtMonth(new Date(now.getFullYear(), now.getMonth(), 1))} vs ${fmtMonth(new Date(now.getFullYear(), now.getMonth() - 1, 1))}`,
            incomeDelta,
            savingsDelta,
            expensesDelta,
            categoryDeltas,
            keyChanges
        };
    }
    /**
     * Generates the Daily Financial Brief
     */
    static async generateDailyBrief(userId) {
        const safeData = await calculations_service_js_1.CalculationsService.calculateSafeToSpend(userId);
        const commitments = await calculations_service_js_1.CalculationsService.calculateCommittedMoney(userId);
        const today = new Date().toISOString().split('T')[0];
        const todayBills = await (0, database_js_1.allQuery)('SELECT * FROM bills WHERE user_id = ? AND due_date = ? AND is_paid_this_cycle = 0', [userId, today]);
        const todayTotal = todayBills.reduce((sum, b) => sum + (b.amount || 0), 0);
        const goals = await (0, database_js_1.allQuery)(`SELECT name, target_amount, current_amount FROM savings_goals WHERE user_id = ? AND status = 'IN_PROGRESS'`, [userId]);
        let goalHighlight = 'No active savings goals yet.';
        if (goals.length > 0) {
            const g = goals[0];
            const pct = Math.round((g.current_amount / g.target_amount) * 100);
            goalHighlight = `${g.name} goal is ${pct}% complete (₹${g.current_amount.toLocaleString()}/₹${g.target_amount.toLocaleString()}).`;
        }
        const currentHour = new Date().getHours();
        let greeting = 'Good Morning 👋';
        if (currentHour >= 12 && currentHour < 17)
            greeting = 'Good Afternoon ☀️';
        else if (currentHour >= 17)
            greeting = 'Good Evening 🌙';
        // Real "saved this month" = this month's income minus this month's
        // expenses (never the old hard-coded ₹38,980 shown to everyone).
        const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString();
        const incomeRow = await (0, database_js_1.getQuery)(`SELECT SUM(amount) as sum FROM transactions WHERE user_id = ? AND type = 'INCOME' AND transaction_date >= ?`, [userId, monthStart]);
        const expenseRow = await (0, database_js_1.getQuery)(`SELECT SUM(amount) as sum FROM transactions WHERE user_id = ? AND type = 'EXPENSE' AND transaction_date >= ?`, [userId, monthStart]);
        const savingsThisMonth = Number(incomeRow?.sum ?? 0) - Number(expenseRow?.sum ?? 0);
        // Real attention line: the most relevant actual insight, never a canned
        // "Food spending is 14% higher" claim.
        const insights = await this.generateInsights(userId);
        const attention = insights.find(i => i.type === 'SPENDING_INCREASE' || i.type === 'BUDGET_WARNING' || i.type === 'UPCOMING_PRESSURE') ??
            insights[0];
        return {
            greeting,
            timestamp: new Date().toISOString(),
            availableBalance: safeData.availableBalance,
            safeToSpend: safeData.safeToSpend,
            todayPaymentsTotal: todayTotal,
            todayPaymentsCount: todayBills.length,
            next7DaysCommitmentsTotal: commitments.bills + commitments.subscriptions,
            savingsThisMonth,
            attentionInsight: attention?.explanation ?? 'No new financial alerts this month.',
            savingsGoalHighlight: goalHighlight
        };
    }
}
exports.FinancialInsightsService = FinancialInsightsService;
//# sourceMappingURL=financial_insights.service.js.map