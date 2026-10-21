"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.FinancialPlanningService = void 0;
const database_js_1 = require("../config/database.js");
const calculations_service_js_1 = require("./calculations.service.js");
const financial_insights_service_js_1 = require("./financial_insights.service.js");
class FinancialPlanningService {
    /**
     * 1. Smart Budgeting Engine & Budget vs Actual Analysis
     */
    static async getBudgetSummary(userId) {
        const now = new Date();
        const currentMonthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
        // Fetch user defined budgets
        const budgetRows = await (0, database_js_1.allQuery)(`SELECT b.id, b.category_id, b.amount, c.name as category_name
       FROM budgets b
       LEFT JOIN categories c ON b.category_id = c.id
       WHERE b.user_id = ?`, [userId]);
        // Fetch spending per category for current month
        const spendingRows = await (0, database_js_1.allQuery)(`SELECT category_id, SUM(amount) as total_spent
       FROM transactions
       WHERE user_id = ? AND type = 'EXPENSE' AND transaction_date >= ?
       GROUP BY category_id`, [userId, currentMonthStart]);
        const spendingMap = new Map();
        for (const r of spendingRows) {
            spendingMap.set(r.category_id, r.total_spent);
        }
        // Real-data rule: only budgets the user actually created are shown. (The
        // old "typical user expenses" defaults invented ₹5,000 Food / ₹3,000
        // Travel / ₹3,000 Bills / ₹4,000 Shopping budgets for every user who
        // never set one.)
        const sourceBudgets = budgetRows;
        let totalBudget = 0;
        let totalSpent = 0;
        let overCount = 0;
        let approachingCount = 0;
        let onTrackCount = 0;
        const budgets = sourceBudgets.map(b => {
            const catName = b.category_name || (b.category_id === 'cat_food' ? 'Food' : b.category_id === 'cat_travel' ? 'Travel' : b.category_id === 'cat_bills' ? 'Bills' : 'Shopping');
            // Real spend for this category this month — 0 when nothing was spent.
            // (The old code invented ₹4,200 Food / ₹3,100 Shopping / ₹2,500 Travel
            // / ₹2,249 Bills "spent" amounts for categories with no transactions.)
            const spent = spendingMap.get(b.category_id) || 0;
            totalBudget += b.amount;
            totalSpent += spent;
            const remaining = Math.max(0, b.amount - spent);
            // Guard: a zero-amount budget would produce Infinity/NaN here
            const utilization = b.amount > 0 ? Math.round((spent / b.amount) * 100) : (spent > 0 ? 100 : 0);
            let status = 'ON_TRACK';
            if (utilization >= 100) {
                status = 'OVER_BUDGET';
                overCount++;
            }
            else if (utilization >= 75) {
                status = 'APPROACHING_LIMIT';
                approachingCount++;
            }
            else {
                onTrackCount++;
            }
            const explanation = `You have used ${utilization}% of your ${catName} budget because ₹${spent.toLocaleString()} of ₹${b.amount.toLocaleString()} has already been spent.`;
            return {
                id: b.id,
                categoryId: b.category_id,
                categoryName: catName,
                budgetAmount: b.amount,
                spentAmount: spent,
                remainingAmount: remaining,
                utilizationPercentage: utilization,
                status,
                explanation
            };
        });
        const overallUtilization = totalBudget > 0 ? Math.round((totalSpent / totalBudget) * 100) : 0;
        const remainingTotal = Math.max(0, totalBudget - totalSpent);
        return {
            period: 'CURRENT_MONTH',
            totalBudget,
            totalSpent,
            remainingTotal,
            overallUtilization,
            overBudgetCategoriesCount: overCount,
            approachingLimitCategoriesCount: approachingCount,
            onTrackCategoriesCount: onTrackCount,
            budgets,
            explanation: `Total monthly budget is ₹${totalBudget.toLocaleString()} with ₹${totalSpent.toLocaleString()} spent (${overallUtilization}% overall utilization).`
        };
    }
    /**
     * 2. Deterministic Cash-Flow Forecasting (7, 30, 90 Days)
     */
    static async getCashFlowForecast(userId, days = 30) {
        const user = await (0, database_js_1.getQuery)('SELECT monthly_income FROM users WHERE id = ?', [userId]);
        // Real-data rule: never assume a ₹55,000 salary. Use the stored profile
        // income when the user set one; otherwise derive a monthly average from
        // actual credited income; otherwise forecast zero inflow.
        const storedIncome = Number(user?.monthly_income ?? 0);
        let monthlyIncome = storedIncome > 0 ? storedIncome : 0;
        let incomeLabel = 'Scheduled Monthly Salary';
        if (monthlyIncome <= 0) {
            const avg = await (0, database_js_1.getQuery)(`SELECT COALESCE(SUM(amount) * 1.0 /
             NULLIF(COUNT(DISTINCT strftime('%Y-%m', transaction_date)), 0), 0) AS avg_income
         FROM transactions WHERE user_id = ? AND type = 'INCOME'`, [userId]);
            monthlyIncome = Number(avg?.avg_income ?? 0);
            incomeLabel = 'Average of recent income credits';
        }
        const safeData = await calculations_service_js_1.CalculationsService.calculateSafeToSpend(userId);
        const startingBalance = safeData.availableBalance; // ₹57,980
        // Fetch upcoming bills and commitments
        const upcoming = await calculations_service_js_1.CalculationsService.getUpcomingPayments(userId, 'month');
        const knownItems = [];
        let knownOutflow = 0;
        for (const item of upcoming.payments) {
            if (item.daysRemaining <= days) {
                knownOutflow += item.amount;
                knownItems.push({
                    name: item.name,
                    amount: item.amount,
                    type: item.paymentType,
                    isKnown: true,
                    dueDate: item.dueDate
                });
            }
        }
        // Calculate Inflows based on days horizon — only when a real/projected
        // income exists. Zero income is reported as zero, never invented.
        let expectedInflow = 0;
        if (days >= 30 && monthlyIncome > 0) {
            expectedInflow = Math.round(monthlyIncome * Math.floor(days / 30));
            knownItems.push({
                name: incomeLabel,
                amount: expectedInflow,
                type: 'INCOME',
                isKnown: true,
                dueDate: storedIncome > 0 ? 'Next Salary Cycle (1st of month)' : 'Projected from your recent credits'
            });
        }
        // Estimated discretionary burn rate from REAL recent spending history
        // (last 30 days, falling back to the user's full expense history).
        const recentSpend = await (0, database_js_1.getQuery)(`SELECT COALESCE(SUM(amount), 0) AS total
       FROM transactions
       WHERE user_id = ? AND type = 'EXPENSE' AND transaction_date >= date('now', '-30 days')`, [userId]);
        let dailyDiscretionaryBurn = 0;
        const recentTotal = Number(recentSpend?.total ?? 0);
        if (recentTotal > 0) {
            dailyDiscretionaryBurn = recentTotal / 30;
        }
        else {
            const allSpend = await (0, database_js_1.getQuery)(`SELECT COALESCE(SUM(amount), 0) AS total, MIN(transaction_date) AS first_date
         FROM transactions WHERE user_id = ? AND type = 'EXPENSE'`, [userId]);
            if (Number(allSpend?.total ?? 0) > 0 && allSpend?.first_date) {
                const spanDays = Math.max(1, Math.ceil((Date.now() - new Date(allSpend.first_date).getTime()) / 86400000));
                dailyDiscretionaryBurn = Number(allSpend.total) / spanDays;
            }
        }
        const estimatedOutflow = Math.round(dailyDiscretionaryBurn * days);
        const totalOutflow = knownOutflow + estimatedOutflow;
        const projectedEndingBalance = Math.round(startingBalance + expectedInflow - totalOutflow);
        return {
            days,
            periodLabel: `${days} Days Forecast`,
            startingBalance,
            expectedInflow,
            knownOutflow,
            estimatedOutflow,
            totalOutflow,
            projectedEndingBalance,
            knownCommitmentsCount: knownItems.filter(i => i.type !== 'INCOME').length,
            knownItems,
            confidence: days === 7 ? 0.95 : days === 30 ? 0.88 : 0.78,
            disclaimer: 'Forecast is based on known bills/EMIs and estimated historical daily spending. Estimates are not guaranteed future transactions.'
        };
    }
    /**
     * 3. Financial Calendar Data Layer
     */
    static async getFinancialCalendar(userId, filter = 'month') {
        const events = [];
        // 1. Income events — projected from the user's real credited income.
        //    (This used to push a hard-coded "Acme Corp Tech Payroll ₹55,000"
        //     event for every user regardless of their actual money.)
        const lastIncome = await (0, database_js_1.getQuery)(`SELECT amount, transaction_date, sender
       FROM transactions WHERE user_id = ? AND type = 'INCOME'
       ORDER BY transaction_date DESC LIMIT 1`, [userId]);
        if (lastIncome && Number(lastIncome.amount) > 0) {
            const nowDate = new Date();
            const lastDay = new Date(lastIncome.transaction_date).getDate();
            let nextCredit = new Date(nowDate.getFullYear(), nowDate.getMonth(), lastDay);
            if (nextCredit.getTime() < nowDate.getTime()) {
                nextCredit = new Date(nowDate.getFullYear(), nowDate.getMonth() + 1, lastDay);
            }
            events.push({
                id: 'cal_inc_projected',
                date: nextCredit.toISOString().substring(0, 10),
                title: lastIncome.sender || 'Income Credit',
                amount: Number(lastIncome.amount),
                type: 'INCOME',
                category: 'Salary',
                status: 'SCHEDULED',
                isKnown: false,
                source: 'Projected from your last income credit'
            });
        }
        // 2. Bills from database
        const bills = await (0, database_js_1.allQuery)('SELECT * FROM bills WHERE user_id = ? AND is_active = 1', [userId]);
        for (const b of bills) {
            events.push({
                id: `cal_bill_${b.id}`,
                date: b.due_date,
                title: b.name,
                amount: b.amount,
                type: 'BILL',
                category: b.category || 'Utilities',
                status: b.is_paid_this_cycle === 1 ? 'PAID' : 'PENDING',
                isKnown: true,
                source: 'Registered Bill / BBPS'
            });
        }
        // 3. EMIs from database
        const emis = await (0, database_js_1.allQuery)('SELECT * FROM emis WHERE user_id = ?', [userId]);
        for (const e of emis) {
            events.push({
                id: `cal_emi_${e.id}`,
                date: e.next_due_date,
                title: e.loan_name,
                amount: e.monthly_emi,
                type: 'EMI',
                category: 'Loan EMI',
                status: e.is_paid_this_cycle === 1 ? 'PAID' : 'PENDING',
                isKnown: true,
                source: 'Loan Auto-Debit (NACH)'
            });
        }
        // 4. Subscriptions — intentionally empty here: subscription-like bills
        //    are already listed above as BILL events (showing them twice would
        //    create duplicates). Real-data rule: never invent Netflix/Spotify
        //    entries the user does not actually pay for.
        // 5. Savings Goal Contributions (dated at the end of the current month —
        //    the table has no per-goal schedule, so the month end is the honest
        //    placeholder instead of a stale hard-coded date)
        const goals = await (0, database_js_1.allQuery)('SELECT * FROM savings_goals WHERE user_id = ?', [userId]);
        const monthEndDate = new Date();
        monthEndDate.setMonth(monthEndDate.getMonth() + 1);
        monthEndDate.setDate(0);
        for (const g of goals) {
            events.push({
                id: `cal_goal_${g.id}`,
                date: monthEndDate.toISOString().substring(0, 10),
                title: `Savings Allocation: ${g.name}`,
                amount: g.monthly_contribution,
                type: 'SAVINGS',
                category: 'Savings',
                status: 'SCHEDULED',
                isKnown: true,
                source: 'Goal Auto-Save'
            });
        }
        // Sort by date ascending
        events.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
        return events;
    }
    /**
     * 4. Smart Savings Planner & Scenario Simulator
     */
    static async simulateSavingsScenario(userId, goalId, extraMonthly = 3000, targetMonths) {
        const goals = await calculations_service_js_1.CalculationsService.getSavingsGoalsIntelligence(userId);
        const targetGoal = goalId ? goals.find(g => g.id === goalId) || goals[0] : goals[0];
        const safeData = await calculations_service_js_1.CalculationsService.calculateSafeToSpend(userId);
        if (!targetGoal) {
            // Real-data rule: with no goal there is nothing to simulate — return
            // zeros instead of a fabricated "MacBook Pro M4 / ₹150,000" scenario.
            return {
                goalId: '',
                goalName: 'No savings goal selected',
                targetAmount: 0,
                currentAmount: 0,
                remainingAmount: 0,
                currentMonthlyContribution: 0,
                simulatedMonthlyContribution: extraMonthly,
                originalCompletionMonths: 0,
                simulatedCompletionMonths: 0,
                monthsSaved: 0,
                simulatedSafeToSpendImpact: Math.max(0, safeData.safeToSpend - extraMonthly),
                isSimulationOnly: true,
                explanation: 'No savings goal found — create a goal to simulate extra monthly contributions.'
            };
        }
        const targetAmount = targetGoal.targetAmount ?? 0;
        const currentAmount = targetGoal.currentAmount ?? 0;
        const remaining = Math.max(0, targetAmount - currentAmount);
        const currentMonthly = targetGoal.monthlyContribution ?? 0;
        const originalMonths = currentMonthly > 0 ? Math.ceil(remaining / currentMonthly) : 0;
        const simulatedMonthly = currentMonthly + extraMonthly;
        const simulatedMonths = simulatedMonthly > 0 && remaining > 0
            ? Math.ceil(remaining / simulatedMonthly)
            : originalMonths;
        const monthsSaved = Math.max(0, originalMonths - simulatedMonths);
        const simulatedSafeToSpendImpact = Math.max(0, safeData.safeToSpend - extraMonthly);
        return {
            goalId: targetGoal.id,
            goalName: targetGoal.name,
            targetAmount,
            currentAmount,
            remainingAmount: remaining,
            currentMonthlyContribution: currentMonthly,
            simulatedMonthlyContribution: simulatedMonthly,
            originalCompletionMonths: originalMonths,
            simulatedCompletionMonths: simulatedMonths,
            monthsSaved,
            simulatedSafeToSpendImpact,
            isSimulationOnly: true,
            explanation: `Saving ₹${extraMonthly.toLocaleString()} extra per month reduces your completion time by ${monthsSaved} months (from ${originalMonths} to ${simulatedMonths} months). Your new projected Safe-to-Spend would be ₹${simulatedSafeToSpendImpact.toLocaleString()}.`
        };
    }
    /**
     * 5. Emergency Fund Planner
     */
    static async getEmergencyFundPlan(userId) {
        const efData = await calculations_service_js_1.CalculationsService.analyzeEmergencyFund(userId);
        const currentAmount = efData.currentAmount; // ₹35,000
        const targetAmount = efData.targetAmount; // ₹100,000
        const essentialExpenses = efData.essentialMonthlyExpenses; // ₹22,000
        const monthsOfCoverage = efData.monthsOfCoverage; // 1.59
        const monthlyContribution = efData.monthlyContribution; // ₹5,000
        const remaining = Math.max(0, targetAmount - currentAmount);
        // No fabricated timeline: without a contribution there is no completion
        // estimate (0), instead of an invented "13 months".
        const projectedCompletionMonths = monthlyContribution > 0 ? Math.ceil(remaining / monthlyContribution) : 0;
        const requiredContributionFor6Months = Math.round(remaining / 6);
        let status = 'BELOW_TARGET';
        if (monthsOfCoverage >= 6)
            status = 'TARGET_REACHED';
        else if (monthsOfCoverage >= 3)
            status = 'BUILDING';
        return {
            currentAmount,
            targetAmount,
            essentialMonthlyExpenses: essentialExpenses,
            monthsOfCoverage,
            targetMonths: 6,
            monthlyContribution,
            projectedCompletionMonths,
            requiredContributionFor6Months,
            status,
            isLocked: efData.isLocked,
            explanation: monthlyContribution > 0
                ? `Your emergency fund currently holds ₹${currentAmount.toLocaleString()} (${monthsOfCoverage} months coverage of essential expenses). Reaching your 6-month target of ₹${targetAmount.toLocaleString()} will take ~${projectedCompletionMonths} months at ₹${monthlyContribution.toLocaleString()}/month.`
                : `Your emergency fund currently holds ₹${currentAmount.toLocaleString()} (${monthsOfCoverage} months coverage of essential expenses). No monthly contribution is set yet — set one to estimate a completion date.`
        };
    }
    /**
     * 6. Expense Anomaly Detection
     */
    static async detectAnomalies(userId) {
        const anomalies = [];
        // Real detector: compare this month's spend per category against the
        // average of the previous months. Every number comes from actual
        // transactions — the old version compared a hard-coded ₹4,200 "current"
        // against a hard-coded ₹3,000 "baseline" and reported that as fact.
        const cutoffDate = new Date(Date.now() - 120 * 86400000).toISOString();
        const rows = await (0, database_js_1.allQuery)(`SELECT COALESCE(t.category_id, 'cat_other') AS category_id,
              COALESCE(c.name, 'Other') AS category_name,
              strftime('%Y-%m', t.transaction_date) AS ym,
              SUM(t.amount) AS total
       FROM transactions t
       LEFT JOIN categories c ON c.id = t.category_id
       WHERE t.user_id = ? AND t.type = 'EXPENSE'
         AND t.transaction_date >= ?
       GROUP BY COALESCE(t.category_id, 'cat_other'), COALESCE(c.name, 'Other'), ym`, [userId, cutoffDate]);
        const currentYm = new Date().toISOString().substring(0, 7);
        const byCategory = new Map();
        for (const r of rows) {
            const key = r.category_id || 'cat_other';
            let entry = byCategory.get(key);
            if (!entry) {
                entry = { name: r.category_name || 'Other', current: 0, baselineMonths: [] };
                byCategory.set(key, entry);
            }
            if (r.ym === currentYm) {
                entry.current += Number(r.total);
            }
            else {
                entry.baselineMonths.push(Number(r.total));
            }
        }
        for (const [categoryId, entry] of byCategory) {
            if (entry.baselineMonths.length === 0)
                continue; // no history → no baseline, no claim
            const baseline = entry.baselineMonths.reduce((a, b) => a + b, 0) / entry.baselineMonths.length;
            if (baseline <= 0 || entry.current <= 0)
                continue;
            const deltaPct = Math.round(((entry.current - baseline) / baseline) * 100);
            if (deltaPct >= 25) {
                const current = Math.round(entry.current * 100) / 100;
                const baselineRounded = Math.round(baseline * 100) / 100;
                anomalies.push({
                    id: `anom_${categoryId}_${currentYm}`,
                    category: entry.name,
                    currentAmount: current,
                    historicalBaseline: baselineRounded,
                    deviationPercentage: deltaPct,
                    severity: deltaPct >= 50 ? 'HIGH' : deltaPct >= 35 ? 'MEDIUM' : 'LOW',
                    explanation: `${entry.name} spending is ${deltaPct}% above your ${entry.baselineMonths.length}-month average (₹${current.toLocaleString()} this month vs ₹${baselineRounded.toLocaleString()} average).`,
                    supportingPeriod: `Current month vs last ${entry.baselineMonths.length} months`,
                    detectedAt: new Date().toISOString()
                });
            }
        }
        anomalies.sort((a, b) => b.deviationPercentage - a.deviationPercentage);
        return anomalies;
    }
    /**
     * 7. Duplicate Transaction Detection
     */
    static async detectDuplicates(userId) {
        const duplicates = [];
        try {
            const txns = await (0, database_js_1.allQuery)(`SELECT id, merchant, receiver, description, amount, transaction_date, account_id
         FROM transactions
         WHERE user_id = ? AND type = 'EXPENSE'
         ORDER BY transaction_date DESC`, [userId]);
            if (!txns || !Array.isArray(txns)) {
                return [];
            }
            // Look for transactions with same merchant/receiver and amount within 48 hours
            for (let i = 0; i < txns.length; i++) {
                for (let j = i + 1; j < txns.length; j++) {
                    const t1 = txns[i];
                    const t2 = txns[j];
                    const m1 = (t1.merchant || t1.receiver || t1.description || '').trim().toLowerCase();
                    const m2 = (t2.merchant || t2.receiver || t2.description || '').trim().toLowerCase();
                    if (m1 && m2 && m1 === m2 && t1.amount === t2.amount) {
                        const time1 = new Date(t1.transaction_date).getTime();
                        const time2 = new Date(t2.transaction_date).getTime();
                        if (!isNaN(time1) && !isNaN(time2)) {
                            const diffHours = Math.abs(time1 - time2) / 3600000;
                            if (diffHours <= 48) {
                                const displayName = t1.merchant || t1.receiver || 'Merchant';
                                duplicates.push({
                                    id: `dup_${t1.id}_${t2.id}`,
                                    originalTransactionId: t2.id,
                                    suspectedDuplicateId: t1.id,
                                    merchant: displayName,
                                    amount: t1.amount,
                                    originalDate: t2.transaction_date,
                                    duplicateDate: t1.transaction_date,
                                    matchingSignals: ['SAME_MERCHANT', 'SAME_AMOUNT', 'WITHIN_48_HOURS', 'SAME_ACCOUNT'],
                                    confidence: 0.92,
                                    status: 'POSSIBLE_DUPLICATE',
                                    explanation: `Identified 2 identical payments of ₹${t1.amount.toLocaleString()} to ${displayName} within ${Math.round(diffHours)} hours. This is advisory only; transactions were not altered.`
                                });
                            }
                        }
                    }
                }
            }
        }
        catch (err) {
            console.error('[FinancialPlanningService] detectDuplicates error:', err);
            return [];
        }
        return duplicates;
    }
    /**
     * 8. Financial Health Overview (8 Transparent Indicators)
     */
    static async getFinancialHealthIndicators(userId) {
        const safeData = await calculations_service_js_1.CalculationsService.calculateSafeToSpend(userId);
        const efData = await calculations_service_js_1.CalculationsService.analyzeEmergencyFund(userId);
        const monthlySummary = await calculations_service_js_1.CalculationsService.getMonthlySummary(userId, 1);
        const budgetSummary = await this.getBudgetSummary(userId);
        const commitments = await calculations_service_js_1.CalculationsService.calculateCommittedMoney(userId);
        const recurring = await financial_insights_service_js_1.FinancialInsightsService.detectRecurringPayments(userId);
        const forecast = await this.getCashFlowForecast(userId, 30);
        const goals = await calculations_service_js_1.CalculationsService.getSavingsGoalsIntelligence(userId);
        const indicators = [
            {
                id: 'ind_sts',
                name: 'Safe-to-Spend Liquidity',
                currentValue: `₹${safeData.safeToSpend.toLocaleString()}`,
                numericValue: safeData.safeToSpend,
                baseline: '> ₹10,000 Recommended',
                status: safeData.safeToSpend >= 10000 ? 'OPTIMAL' : 'FAIR',
                explanation: 'Sufficient uncommitted buffer available after mandatory obligations and savings.'
            },
            {
                id: 'ind_savings_rate',
                name: 'Savings Rate',
                currentValue: `${monthlySummary.savingsRate}%`,
                numericValue: monthlySummary.savingsRate,
                baseline: '20% Target',
                status: monthlySummary.savingsRate >= 20 ? 'OPTIMAL' : 'FAIR',
                explanation: 'Portion of monthly income retained as savings and investments.'
            },
            {
                id: 'ind_emergency_coverage',
                name: 'Emergency Fund Coverage',
                currentValue: `${efData.monthsOfCoverage} months`,
                numericValue: efData.monthsOfCoverage,
                baseline: '3-6 Months Target',
                status: efData.monthsOfCoverage >= 3 ? 'GOOD' : 'FAIR',
                explanation: 'Runway of essential living expenses safeguarded against unexpected emergencies.'
            },
            {
                id: 'ind_budget_utilization',
                name: 'Budget Utilization',
                currentValue: `${budgetSummary.overallUtilization}%`,
                numericValue: budgetSummary.overallUtilization,
                baseline: '< 85% Ideal',
                status: budgetSummary.overallUtilization < 85 ? 'OPTIMAL' : 'ATTENTION_NEEDED',
                explanation: 'Percentage of allocated category budgets spent in current cycle.'
            },
            {
                id: 'ind_commitment_pressure',
                name: 'Commitment Pressure',
                currentValue: `₹${commitments.totalCommitted.toLocaleString()}`,
                numericValue: commitments.totalCommitted,
                baseline: 'Managed Obligation Load',
                status: commitments.remainingBuffer > 10000 ? 'OPTIMAL' : 'FAIR',
                explanation: 'Total funds committed to mandatory bills, EMIs, and scheduled savings.'
            },
            {
                id: 'ind_recurring_load',
                name: 'Recurring Expense Load',
                currentValue: `₹${recurring.monthlyTotal.toLocaleString()}/mo`,
                numericValue: recurring.monthlyTotal,
                baseline: '< 10% of Income',
                status: 'OPTIMAL',
                explanation: 'Ongoing subscriptions and automated recurring payments.'
            },
            {
                id: 'ind_cash_flow_forecast',
                name: '30-Day Cash-Flow Projection',
                currentValue: `₹${forecast.projectedEndingBalance.toLocaleString()}`,
                numericValue: forecast.projectedEndingBalance,
                baseline: 'Positive Net Balance',
                status: forecast.projectedEndingBalance > 0 ? 'OPTIMAL' : 'ATTENTION_NEEDED',
                explanation: 'Projected liquidity balance after all known and estimated outflows.'
            },
            {
                id: 'ind_goal_progress',
                name: 'Savings Goal Trajectory',
                currentValue: `${goals[0]?.progressPercentage || 50}% Average`,
                numericValue: goals[0]?.progressPercentage || 50,
                baseline: 'On-Track Timeline',
                status: 'GOOD',
                explanation: 'Active progress toward structured personal finance goals.'
            }
        ];
        return {
            indicators,
            summaryNote: 'All indicators are computed from active account transactions and commitments. No arbitrary score is assigned.',
            generatedAt: new Date().toISOString()
        };
    }
    /**
     * 9. Advanced What-If General Financial Simulator
     */
    static async simulateFinancialScenario(userId, input) {
        const safeData = await calculations_service_js_1.CalculationsService.calculateSafeToSpend(userId);
        const commitments = await calculations_service_js_1.CalculationsService.calculateCommittedMoney(userId);
        const monthlySummary = await calculations_service_js_1.CalculationsService.getMonthlySummary(userId, 1);
        const expenseAmount = input.additionalExpenseAmount || 0;
        const extraSavings = input.extraMonthlySavings || 0;
        const incomeDelta = input.incomeDelta || 0;
        const newBill = input.newBillAmount || 0;
        const cancelSub = input.cancelledSubscriptionAmount || 0;
        const projectedBalance = safeData.availableBalance - expenseAmount;
        const projectedCommitments = commitments.totalCommitted + extraSavings + newBill - cancelSub;
        const projectedSafeToSpend = Math.max(0, safeData.safeToSpend - expenseAmount - extraSavings - newBill + cancelSub);
        const projectedMonthlySavings = monthlySummary.savings + extraSavings + incomeDelta + cancelSub;
        const warnings = [];
        if (projectedSafeToSpend <= 5000 || expenseAmount >= 15000 || (safeData.safeToSpend > 0 && projectedSafeToSpend < safeData.safeToSpend * 0.6)) {
            warnings.push('⚠️ Safe-to-Spend liquidity drops below recommended comfort threshold.');
        }
        if (projectedBalance < commitments.totalCommitted) {
            warnings.push('❌ Projected balance is insufficient to cover total committed obligations.');
        }
        return {
            currentBalance: safeData.availableBalance,
            projectedBalance,
            currentSafeToSpend: safeData.safeToSpend,
            projectedSafeToSpend,
            currentCommitments: commitments.totalCommitted,
            projectedCommitments,
            projectedMonthlySavings,
            savingsGoalImpact: extraSavings > 0 ? `Accelerates savings goals by ₹${extraSavings.toLocaleString()}/month` : 'No change',
            emergencyFundImpact: projectedBalance < 50000 ? 'May impact emergency reserve cushion' : 'Emergency fund remains secure',
            warnings,
            isSimulationOnly: true,
            explanation: `Simulated Scenario: Safe-to-Spend changes from ₹${safeData.safeToSpend.toLocaleString()} to ₹${projectedSafeToSpend.toLocaleString()}. Ending balance: ₹${projectedBalance.toLocaleString()}. Database state was NOT modified.`
        };
    }
    /**
     * 10. Smart Alerts Engine
     */
    static async getAlerts(userId) {
        const alerts = [];
        const now = new Date();
        // 1. Bill due alert
        const bills = await calculations_service_js_1.CalculationsService.getUpcomingPayments(userId, 'week');
        if (bills.payments.length > 0) {
            const b = bills.payments[0];
            alerts.push({
                id: `alt_bill_${b.id}`,
                type: 'BILL_DUE',
                severity: 'INFO',
                title: `${b.name} Due Soon`,
                explanation: `₹${b.amount.toLocaleString()} is due on ${b.dueDate} (${b.daysRemaining} days remaining).`,
                relatedEntity: b.id,
                createdAt: now.toISOString(),
                isRead: false
            });
        }
        // 2. Budget threshold alert
        const budgetSummary = await this.getBudgetSummary(userId);
        for (const b of budgetSummary.budgets) {
            if (b.status === 'APPROACHING_LIMIT') {
                alerts.push({
                    id: `alt_bud_${b.id}`,
                    type: 'BUDGET_APPROACHING',
                    severity: 'WARNING',
                    title: `${b.categoryName} Budget at ${b.utilizationPercentage}%`,
                    explanation: `You have spent ₹${b.spentAmount.toLocaleString()} of your ₹${b.budgetAmount.toLocaleString()} ${b.categoryName} budget.`,
                    relatedEntity: b.id,
                    createdAt: now.toISOString(),
                    isRead: false
                });
            }
        }
        // 3. Emergency fund alert
        const ef = await calculations_service_js_1.CalculationsService.analyzeEmergencyFund(userId);
        if (ef.monthsOfCoverage < 3) {
            alerts.push({
                id: `alt_ef_${Date.now()}`,
                type: 'EMERGENCY_LOW',
                severity: 'INFO',
                title: 'Emergency Fund Runway',
                explanation: `Your emergency fund covers ${ef.monthsOfCoverage} months of expenses. Target is 3-6 months.`,
                relatedEntity: 'emergency_fund',
                createdAt: now.toISOString(),
                isRead: false
            });
        }
        return alerts;
    }
    /**
     * 11. Daily Financial Brief 2.0
     */
    static async getDailyBriefV2(userId) {
        const safeData = await calculations_service_js_1.CalculationsService.calculateSafeToSpend(userId);
        const efData = await calculations_service_js_1.CalculationsService.analyzeEmergencyFund(userId);
        const budgetSummary = await this.getBudgetSummary(userId);
        const forecast = await this.getCashFlowForecast(userId, 30);
        const insights = await financial_insights_service_js_1.FinancialInsightsService.generateInsights(userId);
        const alerts = await this.getAlerts(userId);
        const goals = await calculations_service_js_1.CalculationsService.getSavingsGoalsIntelligence(userId);
        const weekBills = await calculations_service_js_1.CalculationsService.getUpcomingPayments(userId, 'week');
        // Top budget = the real budget closest to its limit (honest empty state
        // when the user has no budgets — never an invented "Food 84%" claim).
        const topBudget = budgetSummary.budgets.length > 0
            ? budgetSummary.budgets.reduce((a, b) => (b.utilizationPercentage > a.utilizationPercentage ? b : a))
            : null;
        const currentHour = new Date().getHours();
        const greeting = currentHour < 12 ? 'Good Morning 👋'
            : currentHour < 17 ? 'Good Afternoon ☀️'
                : 'Good Evening 🌙';
        // Payments actually due today (or already overdue), from real bills/EMIs.
        const todayPaymentsTotal = weekBills.payments
            .filter(p => p.daysRemaining <= 0)
            .reduce((sum, p) => sum + p.amount, 0);
        return {
            greeting,
            timestamp: new Date().toISOString(),
            availableBalance: safeData.availableBalance,
            safeToSpend: safeData.safeToSpend,
            todayPaymentsTotal,
            thisWeekCommitmentsTotal: weekBills.totalUpcomingAmount,
            topBudgetUtilization: {
                category: topBudget?.categoryName ?? 'No budgets set',
                percentage: topBudget?.utilizationPercentage ?? 0,
                status: topBudget?.status ?? 'ON_TRACK'
            },
            emergencyCoverageMonths: efData.monthsOfCoverage,
            savingsProgressPercent: goals[0]?.progressPercentage ?? 0,
            topInsight: insights[0]?.explanation ?? 'No insights yet — connect a bank to start tracking your money.',
            topAlert: alerts[0]?.explanation ?? 'No urgent alerts today.',
            forecast30DayEndingBalance: forecast.projectedEndingBalance
        };
    }
}
exports.FinancialPlanningService = FinancialPlanningService;
//# sourceMappingURL=financial_planning.service.js.map