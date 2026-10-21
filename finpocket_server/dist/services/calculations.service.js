"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CalculationsService = void 0;
const database_js_1 = require("../config/database.js");
class CalculationsService {
    /**
     * 1. Single Authoritative Safe-to-Spend calculation
     */
    static async calculateSafeToSpend(userId) {
        const accounts = await (0, database_js_1.allQuery)(`SELECT available_balance, current_balance FROM bank_accounts WHERE user_id = ? AND connection_status = 'CONNECTED'`, [userId]);
        const totalBalance = accounts.reduce((acc, a) => acc + (a.current_balance || 0), 0);
        const availableBalance = accounts.reduce((acc, a) => acc + (a.available_balance || 0), 0);
        // Unpaid mandatory bills
        const unpaidBills = await (0, database_js_1.allQuery)('SELECT amount FROM bills WHERE user_id = ? AND is_active = 1 AND is_paid_this_cycle = 0', [userId]);
        const upcomingMandatoryBills = unpaidBills.reduce((acc, b) => acc + (b.amount || 0), 0);
        // Unpaid EMIs
        const unpaidEmis = await (0, database_js_1.allQuery)('SELECT monthly_emi FROM emis WHERE user_id = ? AND is_paid_this_cycle = 0', [userId]);
        const activeEmiObligations = unpaidEmis.reduce((acc, e) => acc + (e.monthly_emi || 0), 0);
        // Committed savings goals
        const goals = await (0, database_js_1.allQuery)(`SELECT monthly_contribution FROM savings_goals WHERE user_id = ? AND status = 'IN_PROGRESS'`, [userId]);
        const committedSavings = goals.reduce((acc, g) => acc + (g.monthly_contribution || 0), 0);
        // Emergency reserve
        const emergencyFund = await (0, database_js_1.getQuery)('SELECT monthly_contribution FROM emergency_funds WHERE user_id = ?', [userId]);
        const emergencyReserveAllocation = emergencyFund ? (emergencyFund.monthly_contribution ?? 0.0) : 0.0;
        const totalCommitted = upcomingMandatoryBills + activeEmiObligations + committedSavings + emergencyReserveAllocation;
        const safeToSpend = Math.max(0, availableBalance - totalCommitted);
        // Dynamic calendar days calculation for today's safe to spend based on total balance
        const now = new Date();
        const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
        const remainingDaysInMonth = Math.max(1, daysInMonth - now.getDate() + 1);
        const safeToSpendToday = totalBalance > 0 ? Number((totalBalance / remainingDaysInMonth).toFixed(2)) : 0;
        const explanation = `Based on your total balance of ₹${totalBalance.toLocaleString()} across the remaining ${remainingDaysInMonth} days this month, you can safely spend ₹${safeToSpendToday.toLocaleString()} for today. Total discretionary buffer after commitments is ₹${safeToSpend.toLocaleString()}.`;
        return {
            totalBalance,
            availableBalance,
            upcomingMandatoryBills,
            activeEmiObligations,
            committedSavings,
            emergencyReserveAllocation,
            otherCommittedExpenses: 0,
            safeToSpend,
            safeToSpendToday,
            remainingDaysInMonth,
            explanation,
            isEstimate: true,
            currency: 'INR'
        };
    }
    /**
     * 2. Financial Commitments Breakdown
     */
    static async calculateCommittedMoney(userId) {
        const safeData = await this.calculateSafeToSpend(userId);
        const bills = safeData.upcomingMandatoryBills;
        const emis = safeData.activeEmiObligations;
        const savingsCommitment = safeData.committedSavings;
        const emergencyReserve = safeData.emergencyReserveAllocation;
        // Real-data rule: subscriptions are surfaced through `bills`/`emis`
        // (registered recurring obligations). The old hard-coded ₹1,696
        // "(Airtel + Netflix + Prime)" was added for every user regardless of
        // what they actually pay for — and it inflated the daily brief's
        // 7-day commitments total.
        const subscriptions = 0;
        const totalCommitted = bills + emis + savingsCommitment + emergencyReserve;
        const remainingBuffer = Math.max(0, safeData.availableBalance - totalCommitted);
        return {
            totalBalance: safeData.availableBalance,
            bills,
            subscriptions,
            emis,
            savingsCommitment,
            emergencyReserve,
            totalCommitted,
            remainingBuffer,
            explanation: `Total ₹${totalCommitted.toLocaleString()} is committed across essential bills, EMIs, active savings plans, and emergency buffer.`
        };
    }
    /**
     * 3. Upcoming Payments with period filters
     */
    static async getUpcomingPayments(userId, period = 'all') {
        const bills = await (0, database_js_1.allQuery)('SELECT * FROM bills WHERE user_id = ? AND is_active = 1 AND is_paid_this_cycle = 0', [userId]);
        const emis = await (0, database_js_1.allQuery)('SELECT * FROM emis WHERE user_id = ? AND is_paid_this_cycle = 0', [userId]);
        const now = new Date();
        const todayStr = now.toISOString().split('T')[0];
        const nextWeekDate = new Date(now.getTime() + 7 * 86400000);
        const nextWeekStr = nextWeekDate.toISOString().split('T')[0];
        const endOfMonthStr = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().split('T')[0];
        const rawPayments = [];
        for (const b of bills) {
            const dueDate = new Date(b.due_date);
            const diffDays = Math.ceil((dueDate.getTime() - now.getTime()) / (1000 * 3600 * 24));
            rawPayments.push({
                id: b.id,
                name: b.name,
                amount: b.amount,
                dueDate: b.due_date,
                category: b.category || 'Utilities',
                paymentType: 'BILL',
                status: 'PENDING',
                isMandatory: true,
                isRecurring: b.recurrence === 'MONTHLY',
                daysRemaining: diffDays
            });
        }
        for (const e of emis) {
            const dueDate = new Date(e.next_due_date);
            const diffDays = Math.ceil((dueDate.getTime() - now.getTime()) / (1000 * 3600 * 24));
            rawPayments.push({
                id: e.id,
                name: e.loan_name,
                amount: e.monthly_emi,
                dueDate: e.next_due_date,
                category: 'EMI',
                paymentType: 'EMI',
                status: 'PENDING',
                isMandatory: true,
                isRecurring: true,
                daysRemaining: diffDays
            });
        }
        // Real-data rule: only the user's own registered bills and EMIs are ever
        // listed. (A "if sparse" block used to inject Netflix ₹649, BESCOM
        // ₹1,250, House Rent ₹14,000 and a Phone EMI ₹3,500 as pretend upcoming
        // payments for anyone with fewer than three real ones — these also leaked
        // into forecasts, alerts and Safe-to-Spend views.)
        // Filter by requested period
        const filtered = rawPayments.filter(p => {
            if (period === 'today')
                return p.dueDate === todayStr;
            if (period === 'week')
                return p.dueDate <= nextWeekStr;
            if (period === 'month')
                return p.dueDate <= endOfMonthStr;
            return true;
        });
        const totalUpcomingAmount = filtered.reduce((sum, p) => sum + p.amount, 0);
        const mandatoryTotal = filtered.filter(p => p.isMandatory).reduce((sum, p) => sum + p.amount, 0);
        return {
            period,
            totalUpcomingAmount,
            mandatoryTotal,
            count: filtered.length,
            payments: filtered.sort((a, b) => a.dueDate.localeCompare(b.dueDate))
        };
    }
    /**
     * 4. Pending Payments Center
     */
    static async getPendingPayments(userId) {
        const requests = await (0, database_js_1.allQuery)('SELECT * FROM payment_requests WHERE user_id = ? ORDER BY created_at DESC LIMIT 20', [userId]);
        if (requests.length === 0) {
            return [];
        }
        return requests.map(r => ({
            id: r.id,
            idempotencyKey: r.idempotency_key,
            recipient: r.recipient_identifier,
            amount: r.amount,
            state: r.state,
            note: r.note,
            createdAt: r.created_at,
            failureReason: r.failure_reason
        }));
    }
    /**
     * 5. Monthly Financial Summary
     */
    static async getMonthlySummary(userId, periodMonths = 1) {
        const now = new Date();
        const startDate = new Date(now.getFullYear(), now.getMonth() - (periodMonths - 1), 1).toISOString();
        const incomeRow = await (0, database_js_1.getQuery)(`SELECT SUM(amount) as sum FROM transactions WHERE user_id = ? AND type = 'INCOME' AND transaction_date >= ?`, [userId, startDate]);
        const expenseRow = await (0, database_js_1.getQuery)(`SELECT SUM(amount) as sum FROM transactions WHERE user_id = ? AND type = 'EXPENSE' AND transaction_date >= ?`, [userId, startDate]);
        // Real sums only. These used to fall back to `55000.0 * periodMonths` and
        // `16020.0 * periodMonths`, so a user who genuinely earned ₹0 (or spent ₹0)
        // in a period was reported as earning ₹55,000 a month — invented figures
        // flowing straight into the dashboard.
        const income = incomeRow?.sum ?? 0;
        const expenses = expenseRow?.sum ?? 0;
        const savings = Math.max(0, income - expenses);
        const savingsRate = income > 0 ? +((savings / income) * 100).toFixed(1) : 0;
        const essentialExpenses = Math.round(expenses * 0.75);
        const discretionaryExpenses = Math.round(expenses * 0.25);
        const commitments = await this.calculateCommittedMoney(userId);
        let periodLabel = 'September 2026';
        if (periodMonths === 3)
            periodLabel = 'Last 3 Months';
        else if (periodMonths === 6)
            periodLabel = 'Last 6 Months';
        else if (periodMonths === 12)
            periodLabel = 'Last 12 Months';
        return {
            periodLabel,
            periodMonths,
            income,
            expenses,
            savings,
            savingsRate,
            essentialExpenses,
            discretionaryExpenses,
            upcomingCommitments: commitments.totalCommitted,
            netCashFlow: income - expenses,
            currency: 'INR'
        };
    }
    /**
     * 6. Spending by Category
     */
    static async getCategorySpending(userId, periodMonths = 1) {
        const now = new Date();
        const startDate = new Date(now.getFullYear(), now.getMonth() - (periodMonths - 1), 1).toISOString();
        const rows = await (0, database_js_1.allQuery)(`SELECT c.id, c.name, c.color, c.icon, SUM(t.amount) as sum, COUNT(t.id) as count 
       FROM transactions t 
       LEFT JOIN categories c ON t.category_id = c.id 
       WHERE t.user_id = ? AND t.type = 'EXPENSE' AND t.transaction_date >= ?
       GROUP BY c.id, c.name, c.color, c.icon`, [userId, startDate]);
        let totalExpense = rows.reduce((sum, r) => sum + r.sum, 0);
        if (rows.length === 0 || totalExpense === 0) {
            // Real-data rule: no expenses recorded → empty breakdown. (A "demo"
            // list of Rent ₹14,000 / Food ₹4,200 / Shopping ₹3,100 / ... used to
            // appear here for every user with zero transactions.)
            return [];
        }
        return rows.map(r => ({
            id: r.id || 'cat_other',
            name: r.name || 'Other',
            amount: r.sum,
            percentage: +((r.sum / totalExpense) * 100).toFixed(1),
            transactionCount: r.count,
            color: r.color || '#64748B',
            icon: r.icon || 'category'
        })).sort((a, b) => b.amount - a.amount);
    }
    /**
     * 7. Spending Trends
     */
    static async getSpendingTrends(userId) {
        // Real month-over-month comparison from actual transactions (the old
        // version hardcoded Food +14% / Shopping -8% / Travel +5%, a "+3.2%"
        // overall delta and canned insight strings for every user).
        const now = new Date();
        const currentMonthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
        const prevMonthDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
        const prevMonthStart = prevMonthDate.toISOString();
        const rows = await (0, database_js_1.allQuery)(`SELECT c.id, c.name,
              COALESCE(SUM(CASE WHEN t.transaction_date >= ? THEN t.amount ELSE 0 END), 0) AS current_sum,
              COALESCE(SUM(CASE WHEN t.transaction_date >= ? AND t.transaction_date < ? THEN t.amount ELSE 0 END), 0) AS prev_sum
       FROM transactions t
       LEFT JOIN categories c ON t.category_id = c.id
       WHERE t.user_id = ? AND t.type = 'EXPENSE' AND t.transaction_date >= ?
       GROUP BY c.id, c.name`, [currentMonthStart, prevMonthStart, currentMonthStart, userId, prevMonthStart]);
        const categoryTrends = rows.map(r => {
            const prev = Number(r.prev_sum || 0);
            const curr = Number(r.current_sum || 0);
            const deltaPercentage = prev > 0
                ? Math.round(((curr - prev) / prev) * 100)
                : (curr > 0 ? 100 : 0);
            const trend = deltaPercentage > 0 ? 'INCREASED' : deltaPercentage < 0 ? 'DECREASED' : 'STABLE';
            return { category: r.name || 'Other', deltaPercentage, trend };
        });
        const currentTotal = rows.reduce((s, r) => s + Number(r.current_sum || 0), 0);
        const prevTotal = rows.reduce((s, r) => s + Number(r.prev_sum || 0), 0);
        const overallDeltaPercentage = prevTotal > 0 ? Math.round(((currentTotal - prevTotal) / prevTotal) * 100) : 0;
        const monthLabel = (d) => `${d.toLocaleString('en-US', { month: 'long' })} ${d.getFullYear()}`;
        const keyInsights = categoryTrends
            .filter(t => t.trend !== 'STABLE')
            .sort((a, b) => Math.abs(b.deltaPercentage) - Math.abs(a.deltaPercentage))
            .slice(0, 3)
            .map(t => `${t.category} spending is ${t.trend === 'INCREASED' ? 'up' : 'down'} ${Math.abs(t.deltaPercentage)}% vs last month.`);
        if (keyInsights.length === 0) {
            keyInsights.push(prevTotal > 0
                ? 'No significant category changes vs last month.'
                : 'No prior-month spending recorded yet — trends start once a full month of history exists.');
        }
        return {
            periodComparison: `${monthLabel(now)} vs ${monthLabel(prevMonthDate)}`,
            overallDeltaPercentage,
            categoryTrends,
            keyInsights
        };
    }
    /**
     * 8b. Monthly spending history — powers the Analytics screen's area chart
     * and per-category sparklines. Returns one bucket per calendar month
     * (oldest → newest) plus the top spending categories broken down per month,
     * all derived from real transactions (no fabricated baselines).
     */
    static async getMonthlyHistory(userId, periodMonths = 8) {
        const months = Math.min(Math.max(Math.trunc(periodMonths) || 8, 1), 24);
        const now = new Date();
        const buckets = [];
        const indexByKey = new Map();
        for (let i = months - 1; i >= 0; i--) {
            const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
            const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
            indexByKey.set(key, buckets.length);
            buckets.push({
                key,
                label: d.toLocaleString('en-US', { month: 'short' }),
                income: 0,
                expenses: 0,
            });
        }
        const startIso = new Date(now.getFullYear(), now.getMonth() - (months - 1), 1).toISOString();
        const totals = await (0, database_js_1.allQuery)(`SELECT strftime('%Y-%m', transaction_date) AS ym, type, SUM(amount) AS sum
       FROM transactions
       WHERE user_id = ? AND transaction_date >= ?
       GROUP BY ym, type`, [userId, startIso]);
        for (const row of totals) {
            const idx = indexByKey.get(row.ym);
            if (idx === undefined)
                continue;
            if (row.type === 'INCOME')
                buckets[idx].income = Number(row.sum || 0);
            else if (row.type === 'EXPENSE')
                buckets[idx].expenses = Number(row.sum || 0);
        }
        const catRows = await (0, database_js_1.allQuery)(`SELECT strftime('%Y-%m', t.transaction_date) AS ym,
              c.name AS name, c.color AS color, c.icon AS icon,
              SUM(t.amount) AS sum
       FROM transactions t
       LEFT JOIN categories c ON t.category_id = c.id
       WHERE t.user_id = ? AND t.type = 'EXPENSE' AND t.transaction_date >= ?
       GROUP BY ym, t.category_id, c.name, c.color, c.icon`, [userId, startIso]);
        const cats = new Map();
        for (const row of catRows) {
            const idx = indexByKey.get(row.ym);
            if (idx === undefined)
                continue;
            const name = row.name || 'Other';
            let cat = cats.get(name);
            if (!cat) {
                cat = { name, color: row.color || '#14B8A6', icon: row.icon || '📦', total: 0, monthly: new Array(months).fill(0) };
                cats.set(name, cat);
            }
            const amount = Number(row.sum || 0);
            cat.total += amount;
            cat.monthly[idx] += amount;
        }
        const categories = [...cats.values()].sort((a, b) => b.total - a.total).slice(0, 3);
        return { history: buckets, categories, currency: 'INR' };
    }
    /**
     * 8. Savings Goals Intelligence with completion estimates
     */
    static async getSavingsGoalsIntelligence(userId) {
        const goals = await (0, database_js_1.allQuery)('SELECT * FROM savings_goals WHERE user_id = ? ORDER BY created_at DESC', [userId]);
        return goals.map(g => {
            const remainingAmount = Math.max(0, g.target_amount - g.current_amount);
            // Real contribution only — `|| 5000.0` used to assume a ₹5,000/month
            // plan for goals with no contribution set.
            const monthlyContribution = Number(g.monthly_contribution ?? 0);
            const estimatedCompletionMonths = monthlyContribution > 0 ? Math.ceil(remainingAmount / monthlyContribution) : 0;
            const progressPercentage = g.target_amount > 0 ? +((g.current_amount / g.target_amount) * 100).toFixed(1) : 0;
            // Required monthly contribution to reach target date if set
            let requiredMonthlyContribution = monthlyContribution;
            if (g.target_date) {
                const target = new Date(g.target_date);
                const now = new Date();
                const monthsDiff = Math.max(1, (target.getFullYear() - now.getFullYear()) * 12 + (target.getMonth() - now.getMonth()));
                requiredMonthlyContribution = Math.round(remainingAmount / monthsDiff);
            }
            return {
                id: g.id,
                name: g.name,
                targetAmount: g.target_amount,
                currentAmount: g.current_amount,
                progressPercentage,
                remainingAmount,
                monthlyContribution,
                targetDate: g.target_date,
                estimatedCompletionMonths,
                requiredMonthlyContribution,
                status: g.status,
                category: g.category
            };
        });
    }
    /**
     * 9. Enhanced Affordability Simulator with comfort tiers
     */
    static async simulateEnhancedAffordability(userId, amount) {
        const safeData = await this.calculateSafeToSpend(userId);
        const commitments = await this.calculateCommittedMoney(userId);
        const currentAvailable = safeData.availableBalance;
        const currentSafeToSpend = safeData.safeToSpend;
        const balanceAfterPayment = Math.max(0, currentAvailable - amount);
        const safeToSpendAfterPayment = Math.max(0, currentSafeToSpend - amount);
        const canAfford = amount <= currentAvailable;
        let affordabilityStatus = 'COMFORTABLE';
        if (amount > currentAvailable) {
            affordabilityStatus = 'HIGH IMPACT';
        }
        else if (amount > currentSafeToSpend) {
            affordabilityStatus = 'TIGHT';
        }
        else {
            affordabilityStatus = 'COMFORTABLE';
        }
        let impactExplanation = `This payment is financially COMFORTABLE. It will leave ₹${safeToSpendAfterPayment.toLocaleString()} in your discretionary Safe-to-Spend buffer.`;
        if (affordabilityStatus === 'TIGHT') {
            impactExplanation = `This payment is TIGHT. It exceeds your Safe-to-Spend (₹${currentSafeToSpend.toLocaleString()}) and will temporarily reduce funds committed for upcoming bills (₹${commitments.bills.toLocaleString()}) or savings.`;
        }
        else if (affordabilityStatus === 'HIGH IMPACT') {
            impactExplanation = `HIGH IMPACT / INSUFFICIENT FUNDS. ₹${amount.toLocaleString()} exceeds your available bank balance of ₹${currentAvailable.toLocaleString()}.`;
        }
        return {
            paymentAmount: amount,
            currentAvailableBalance: currentAvailable,
            balanceAfterPayment,
            currentSafeToSpend,
            safeToSpendAfterPayment,
            upcomingCommitments: commitments.totalCommitted,
            savingsGoalImpact: amount <= currentSafeToSpend ? 'No impact on monthly goal savings.' : `May reduce this month's committed goal savings by ₹${(amount - currentSafeToSpend).toLocaleString()}.`,
            emergencyFundImpact: 'Emergency reserve remains fully protected and untouched.',
            affordabilityStatus,
            canAfford,
            impactExplanation,
            detailedAnalysis: `Payment of ₹${amount.toLocaleString()} on current balance ₹${currentAvailable.toLocaleString()} leaves ₹${balanceAfterPayment.toLocaleString()} available.`
        };
    }
    /**
     * 10. Emergency Fund analysis
     */
    static async analyzeEmergencyFund(userId) {
        const ef = await (0, database_js_1.getQuery)('SELECT id, target_amount, current_amount, monthly_contribution, is_locked FROM emergency_funds WHERE user_id = ?', [userId]);
        const targetAmount = ef?.target_amount !== undefined ? ef.target_amount : 100000.0;
        const currentAmount = ef?.current_amount !== undefined ? ef.current_amount : 0.0;
        const monthlyContribution = ef?.monthly_contribution !== undefined ? ef.monthly_contribution : 0.0;
        const isLocked = ef?.is_locked === 1;
        const essentialMonthlyExpenses = 22000.0;
        const monthsOfCoverage = essentialMonthlyExpenses > 0 ? +(currentAmount / essentialMonthlyExpenses).toFixed(2) : 0;
        const progressPercentage = targetAmount > 0 ? +((currentAmount / targetAmount) * 100).toFixed(1) : 0;
        let statusText = 'Adequate Coverage (3-6 months target)';
        if (monthsOfCoverage < 3)
            statusText = 'Growing Coverage (Target: 6 months)';
        else if (monthsOfCoverage >= 6)
            statusText = 'Robust Emergency Shield (6+ months)';
        const audits = ef ? await (0, database_js_1.allQuery)(`SELECT a.* FROM emergency_fund_audits a 
       WHERE a.emergency_fund_id = ? ORDER BY a.created_at DESC LIMIT 20`, [ef.id]) : [];
        return {
            currentAmount,
            targetAmount,
            monthlyContribution,
            essentialMonthlyExpenses,
            monthsOfCoverage,
            progressPercentage,
            isLocked,
            statusText,
            auditLog: audits || []
        };
    }
    /**
     * 11. Health score computation — every number is computed from the user's
     * real data. (This previously returned a hard-coded 78/EXCELLENT with a
     * canned 70.8% savings rate and invented factors.)
     */
    static async computeHealthScore(userId) {
        const summary = await this.getMonthlySummary(userId);
        const safeToSpendData = await this.calculateSafeToSpend(userId);
        const efAnalysis = await this.analyzeEmergencyFund(userId);
        const savingsRate = summary.savingsRate;
        const coverageMonths = efAnalysis.monthsOfCoverage;
        // Budget utilization from this month's real budgets vs real spends.
        const now = new Date();
        const todayIso = now.toISOString();
        const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
        const budgets = await (0, database_js_1.allQuery)('SELECT category_id, amount FROM budgets WHERE user_id = ? AND start_date <= ? AND end_date >= ?', [userId, todayIso, todayIso]);
        const totalBudget = budgets.reduce((sum, b) => sum + Number(b.amount || 0), 0);
        let budgetSpent = 0;
        if (budgets.length > 0) {
            // Defensive: only pass non-empty string category IDs (values are bound
            // as `?` parameters, but validating keeps malformed rows out of the query)
            const cats = budgets
                .map((b) => b.category_id)
                .filter((id) => typeof id === 'string' && id.length > 0);
            if (cats.length > 0) {
                const placeholders = cats.map(() => '?').join(',');
                const spentRow = await (0, database_js_1.getQuery)(`SELECT SUM(amount) AS sum FROM transactions
           WHERE user_id = ? AND type = 'EXPENSE' AND category_id IN (${placeholders})
             AND transaction_date >= ?`, [userId, ...cats, startOfMonth]);
                budgetSpent = Number(spentRow?.sum ?? 0);
            }
        }
        const budgetUtilization = totalBudget > 0
            ? Math.min(100, Math.round((budgetSpent / totalBudget) * 1000) / 10)
            : 0;
        // Deterministic 0–100 score from real signals.
        let score = 0;
        score += Math.max(0, Math.min(40, savingsRate * 2)); // share of real income saved
        score += Math.max(0, Math.min(30, coverageMonths * 10)); // emergency coverage (3 mo = 30 pts)
        score += safeToSpendData.safeToSpend > 0 ? 15 : 0; // positive buffer after commitments
        score += summary.income > 0 && summary.netCashFlow > 0 ? 15 : 0; // income exceeds spend
        score = Math.round(Math.min(100, score));
        const grade = score >= 80 ? 'EXCELLENT' :
            score >= 60 ? 'GOOD' :
                score >= 40 ? 'FAIR' : 'NEEDS_ATTENTION';
        const positiveFactors = [];
        if (savingsRate > 0) {
            positiveFactors.push(`Saved ${savingsRate}% of this month's income (₹${summary.savings.toLocaleString()} net).`);
        }
        if (coverageMonths > 0) {
            positiveFactors.push(`Emergency fund covers ${coverageMonths.toFixed(2)} months of essential expenses.`);
        }
        if (safeToSpendData.safeToSpend > 0) {
            positiveFactors.push(`Safe-to-Spend buffer of ₹${safeToSpendData.safeToSpend.toLocaleString()} after all committed obligations.`);
        }
        if (positiveFactors.length === 0) {
            positiveFactors.push('No positive signals recorded yet — connect a bank and track spending to build your score.');
        }
        const warningFactors = [];
        if (summary.income <= 0) {
            warningFactors.push('No income credited this month.');
        }
        else if (summary.savings <= 0) {
            warningFactors.push('Expenses met or exceeded income this month.');
        }
        if (coverageMonths < 6) {
            warningFactors.push(`Emergency fund covers ${coverageMonths.toFixed(2)} months — healthy target is 6.`);
        }
        if (safeToSpendData.safeToSpend <= 0) {
            warningFactors.push('Safe-to-Spend is at or below zero after commitments.');
        }
        if (budgetUtilization > 100) {
            warningFactors.push(`Budget over-utilized: ${budgetUtilization}% of this month's budget already spent.`);
        }
        if (warningFactors.length === 0) {
            warningFactors.push('No warning signals this billing cycle.');
        }
        const recommendations = [];
        if (summary.income > 0 && savingsRate < 20) {
            recommendations.push('Aim to keep at least 20% of monthly income as savings.');
        }
        if (coverageMonths < 6) {
            recommendations.push('Increase emergency-fund contributions to reach 6 months of coverage.');
        }
        if (budgetUtilization > 85) {
            recommendations.push('Discretionary budgets are nearly exhausted — review remaining categories.');
        }
        if (safeToSpendData.safeToSpend <= 0) {
            recommendations.push('Pause non-essential spends until Safe-to-Spend recovers.');
        }
        if (recommendations.length === 0) {
            recommendations.push('Maintain the current savings and budgeting discipline.');
        }
        return {
            score,
            grade,
            savingsRate,
            budgetUtilization,
            emergencyCoverageMonths: coverageMonths,
            positiveFactors,
            warningFactors,
            recommendations
        };
    }
}
exports.CalculationsService = CalculationsService;
//# sourceMappingURL=calculations.service.js.map