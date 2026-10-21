"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AIAssistantService = void 0;
const calculations_service_js_1 = require("./calculations.service.js");
const financial_insights_service_js_1 = require("./financial_insights.service.js");
const financial_planning_service_js_1 = require("./financial_planning.service.js");
class AIAssistantService {
    /**
     * Strictly READ-ONLY AI Financial Assistant.
     * Maps user intents directly to authoritative backend services and formats grounded, explainable answers.
     * Refuses all financial action/write/transfer requests.
     */
    static async processQuery(userId, query) {
        const q = query.toLowerCase().trim();
        // 1. PROMPT-INJECTION & ACTION REFUSAL SHIELD
        const isActionAttempt = q.includes('transfer') ||
            q.includes('send money') ||
            q.includes('pay ') ||
            q.includes('execute payment') ||
            q.includes('debit') ||
            q.includes('link') ||
            q.includes('unlink') ||
            q.includes('consent') ||
            q.includes('sync') ||
            q.includes('token') ||
            q.includes('refresh') ||
            (q.includes('balance') && (q.includes('change') || q.includes('set') || q.includes('modify') || q.includes('increase') || q.includes('update'))) ||
            (q.includes('limit') && (q.includes('disable') || q.includes('remove') || q.includes('change') || q.includes('set') || q.includes('modify'))) ||
            (q.includes('delete') || q.includes('erase') || q.includes('drop table') || q.includes('clear history')) ||
            q.includes('ignore previous') ||
            q.includes('bypass') ||
            q.includes('reset password');
        if (isActionAttempt) {
            return {
                answer: '🛡️ Action Request Refused: As a strictly read-only financial assistant, I do not have permission or capabilities to execute transfers, initiate/revoke bank consent, link/unlink accounts, alter balances, change limits, or delete financial records. All operations must be performed directly by you through the verified UI.',
                supportingData: {},
                explanation: 'Grounding: Read-only security boundary enforced. AI cannot invoke write operations, consent mutations, or background sync.',
                suggestedActions: [
                    'How much can I safely spend?',
                    'Why is my Safe-to-Spend this amount?',
                    'What payments are coming this week?'
                ],
                isExecutionRefused: true
            };
        }
        // Fetch authoritative backend state
        const safeData = await calculations_service_js_1.CalculationsService.calculateSafeToSpend(userId);
        const commitments = await calculations_service_js_1.CalculationsService.calculateCommittedMoney(userId);
        const monthlySummary = await calculations_service_js_1.CalculationsService.getMonthlySummary(userId, 1);
        const upcoming = await calculations_service_js_1.CalculationsService.getUpcomingPayments(userId, 'month');
        const goals = await calculations_service_js_1.CalculationsService.getSavingsGoalsIntelligence(userId);
        const efData = await calculations_service_js_1.CalculationsService.analyzeEmergencyFund(userId);
        const categorySpending = await calculations_service_js_1.CalculationsService.getCategorySpending(userId, 1);
        const recurring = await financial_insights_service_js_1.FinancialInsightsService.detectRecurringPayments(userId);
        const whatChanged = await financial_insights_service_js_1.FinancialInsightsService.calculateWhatChanged(userId);
        // 2. Specific Category Spending Queries (e.g. "How much did I spend on food?")
        const isCategoryQuery = /\b(food|shopping|travel|rent|bills)\b/i.test(q);
        if (isCategoryQuery && !q.includes('safe') && !q.includes('afford')) {
            const targetCat = /\bfood\b/i.test(q) ? 'Food'
                : /\bshopping\b/i.test(q) ? 'Shopping'
                    : /\btravel\b/i.test(q) ? 'Travel'
                        : /\brent\b/i.test(q) ? 'Rent'
                            : /\bbills\b/i.test(q) ? 'Bills'
                                : 'Top Category';
            const catData = categorySpending.find(c => c.name.toLowerCase() === targetCat.toLowerCase()) || categorySpending[0];
            return {
                answer: `📊 You have spent ₹${catData.amount.toLocaleString()} on ${catData.name} this month across ${catData.transactionCount} transactions (${catData.percentage}% of your total spending).`,
                supportingData: {
                    topCategory: catData.name,
                    thisMonthSpent: catData.amount
                },
                explanation: 'Grounding: Aggregated from active expense transactions in CalculationsService.getCategorySpending().',
                suggestedActions: [
                    'View all category breakdowns',
                    'What changed this month?',
                    'Check monthly budget'
                ]
            };
        }
        // 3. Safe-to-Spend breakdown & "Why is my Safe-to-Spend this amount?"
        if (q.includes('safe') || q.includes('safe to spend') || q.includes('safely spend') || (q.includes('how much') && q.includes('spend'))) {
            const answer = `Your current Safe-to-Spend is ₹${safeData.safeToSpend.toLocaleString()}.

The calculation uses:
• Available balance: ₹${safeData.availableBalance.toLocaleString()}
• Upcoming mandatory bills: -₹${safeData.upcomingMandatoryBills.toLocaleString()}
• Active EMIs: -₹${safeData.activeEmiObligations.toLocaleString()}
• Committed savings: -₹${safeData.committedSavings.toLocaleString()}
• Emergency reserve: -₹${safeData.emergencyReserveAllocation.toLocaleString()}

Formula:
₹${safeData.availableBalance.toLocaleString()} - ₹${safeData.upcomingMandatoryBills.toLocaleString()} - ₹${safeData.committedSavings.toLocaleString()} - ₹${safeData.emergencyReserveAllocation.toLocaleString()} = ₹${safeData.safeToSpend.toLocaleString()}

These values come directly from your current FinPocket financial data.`;
            return {
                answer,
                supportingData: {
                    safeToSpend: safeData.safeToSpend,
                    totalBalance: safeData.availableBalance,
                    breakdownFormula: `₹${safeData.availableBalance.toLocaleString()} - ₹${safeData.upcomingMandatoryBills.toLocaleString()} - ₹${safeData.committedSavings.toLocaleString()} - ₹${safeData.emergencyReserveAllocation.toLocaleString()} = ₹${safeData.safeToSpend.toLocaleString()}`
                },
                explanation: 'Grounding: Evaluated using CalculationsService.calculateSafeToSpend().',
                suggestedActions: [
                    'Can I afford ₹10,000?',
                    'What payments are coming this week?',
                    'View spending trends'
                ]
            };
        }
        // 4. "Can I Afford This?" Affordability Simulation
        if (q.includes('afford') || q.includes('can i buy')) {
            const match = q.match(/\d+/g);
            const requestedAmount = match ? parseFloat(match.join('')) : 10000;
            const sim = await calculations_service_js_1.CalculationsService.simulateEnhancedAffordability(userId, requestedAmount);
            const answer = sim.affordabilityStatus === 'COMFORTABLE'
                ? `✅ Yes, a purchase of ₹${requestedAmount.toLocaleString()} is financially COMFORTABLE. Your Safe-to-Spend limit is ₹${safeData.safeToSpend.toLocaleString()}. After this payment, you will retain ₹${sim.safeToSpendAfterPayment.toLocaleString()} in your discretionary buffer, and your committed bills (₹${commitments.bills.toLocaleString()}) and savings (₹${commitments.savingsCommitment.toLocaleString()}) remain intact.`
                : sim.affordabilityStatus === 'TIGHT'
                    ? `⚠️ Proceed with caution. A purchase of ₹${requestedAmount.toLocaleString()} is TIGHT. While your bank balance (₹${safeData.availableBalance.toLocaleString()}) can cover it, it exceeds your current Safe-to-Spend of ₹${safeData.safeToSpend.toLocaleString()}. This purchase will dip into funds reserved for upcoming commitments (₹${commitments.totalCommitted.toLocaleString()}).`
                    : `❌ Not recommended. ₹${requestedAmount.toLocaleString()} exceeds your available bank balance of ₹${safeData.availableBalance.toLocaleString()}.`;
            return {
                answer,
                supportingData: {
                    safeToSpend: safeData.safeToSpend,
                    totalBalance: safeData.availableBalance,
                    affordabilityStatus: sim.affordabilityStatus
                },
                explanation: 'Grounding: Calculated via CalculationsService.simulateEnhancedAffordability().',
                suggestedActions: [
                    'View Safe-to-Spend calculation',
                    'Review upcoming bills',
                    'Simulate smaller payment'
                ]
            };
        }
        // 5. "What changed this month?" / Trends
        if (q.includes('changed') || q.includes('trend') || q.includes('difference') || q.includes('compared')) {
            const bulletPoints = whatChanged.keyChanges.map(k => `• ${k}`).join('\n');
            return {
                answer: `📈 Here is what changed this month compared to last month:\n\n${bulletPoints}\n\nYour net savings delta is ${whatChanged.savingsDelta >= 0 ? '+' : ''}₹${whatChanged.savingsDelta.toLocaleString()}.`,
                supportingData: {
                    thisMonthIncome: monthlySummary.income,
                    thisMonthSpent: monthlySummary.expenses,
                    thisMonthSaved: monthlySummary.savings
                },
                explanation: 'Grounding: Computed via FinancialInsightsService.calculateWhatChanged().',
                suggestedActions: [
                    'How much did I spend on food?',
                    'How is my emergency fund?',
                    'View Safe-to-Spend breakdown'
                ]
            };
        }
        // 6. Upcoming Payments / Bills
        if (q.includes('bill') || q.includes('due') || q.includes('upcoming') || q.includes('emi') || q.includes('coming')) {
            const billList = upcoming.payments.slice(0, 4).map(p => `• ${p.name} (Due in ${p.daysRemaining} days): ₹${p.amount.toLocaleString()}`).join('\n');
            return {
                answer: `📅 You have ${upcoming.count} upcoming payments totaling ₹${upcoming.totalUpcomingAmount.toLocaleString()} this cycle:\n\n${billList}\n\nAll amounts are accounted for inside your Safe-to-Spend calculation.`,
                supportingData: {
                    upcomingBillsCount: upcoming.count,
                    safeToSpend: safeData.safeToSpend
                },
                explanation: 'Grounding: Queried active pending bills & EMIs via CalculationsService.getUpcomingPayments().',
                suggestedActions: [
                    'Why is my Safe-to-Spend this amount?',
                    'Can I afford ₹5,000?',
                    'Open Bills screen'
                ]
            };
        }
        // 7. Savings Goals & Emergency Fund
        if (q.includes('save') || q.includes('saving') || q.includes('goal') || q.includes('emergency')) {
            const goalList = goals.map(g => `• ${g.name}: ₹${g.currentAmount.toLocaleString()}/₹${g.targetAmount.toLocaleString()} (${g.progressPercentage}%) - est. ${g.estimatedCompletionMonths} months remaining`).join('\n');
            return {
                answer: `🎯 Savings Overview:

Active Goals:
${goalList}

Emergency Fund:
• Current Balance: ₹${efData.currentAmount.toLocaleString()} / ₹${efData.targetAmount.toLocaleString()} (${efData.progressPercentage}%)
• Coverage: ${efData.monthsOfCoverage} months of essential expenses
• Monthly Reserve: ₹${efData.monthlyContribution.toLocaleString()}`,
                supportingData: {
                    goalsCount: goals.length,
                    totalBalance: safeData.availableBalance
                },
                explanation: 'Grounding: Queried live savings goals and emergency fund status from CalculationsService.',
                suggestedActions: [
                    'How much do I need to save monthly?',
                    'Can I afford ₹10,000?',
                    'Lock Emergency Fund'
                ]
            };
        }
        // 8. Recurring Subscriptions
        if (q.includes('subscription') || q.includes('recurring')) {
            const subList = recurring.subscriptions.slice(0, 4).map(s => `• ${s.merchantName}: ₹${s.amount.toLocaleString()}/${s.frequency.toLowerCase()}`).join('\n');
            return {
                answer: `🔁 Recurring Subscriptions & Fixed Obligations:

${subList}

• Monthly Total: ₹${recurring.monthlyTotal.toLocaleString()}
• Annualized Total: ₹${recurring.annualTotal.toLocaleString()}`,
                supportingData: {
                    recurringTotal: recurring.monthlyTotal,
                    safeToSpend: safeData.safeToSpend
                },
                explanation: 'Grounding: Detected via FinancialInsightsService.detectRecurringPayments().',
                suggestedActions: [
                    'View upcoming bills',
                    'Why is my Safe-to-Spend this amount?'
                ]
            };
        }
        // 9. Budgets & Budget vs Actual
        if (q.includes('budget') || q.includes('overspend')) {
            const budgetSummary = await financial_planning_service_js_1.FinancialPlanningService.getBudgetSummary(userId);
            const budgetList = budgetSummary.budgets.map(b => `• ${b.categoryName}: ₹${b.spentAmount.toLocaleString()} / ₹${b.budgetAmount.toLocaleString()} (${b.utilizationPercentage}%) - [${b.status}]`).join('\n');
            return {
                answer: `📊 Monthly Budget Status (${budgetSummary.overallUtilization}% overall utilization):

${budgetList}

Total Budget: ₹${budgetSummary.totalBudget.toLocaleString()}
Total Spent: ₹${budgetSummary.totalSpent.toLocaleString()}
Remaining Budget: ₹${budgetSummary.remainingTotal.toLocaleString()}

${budgetSummary.overBudgetCategoriesCount > 0 ? `⚠️ ${budgetSummary.overBudgetCategoriesCount} categories are over budget.` : '✅ All categories are on track or within limits.'}`,
                supportingData: {
                    budgetUtilization: budgetSummary.overallUtilization,
                    thisMonthSpent: budgetSummary.totalSpent
                },
                explanation: 'Grounding: Evaluated via FinancialPlanningService.getBudgetSummary().',
                suggestedActions: [
                    'What is my 30-day forecast?',
                    'What changed this month?',
                    'View financial health overview'
                ]
            };
        }
        // 10. Cash-Flow Forecast (7, 30, 90 Days)
        if (q.includes('forecast') || q.includes('cash flow') || q.includes('future balance') || q.includes('in 30 days') || q.includes('in 7 days')) {
            const days = q.includes('7') ? 7 : q.includes('90') ? 90 : 30;
            const forecast = await financial_planning_service_js_1.FinancialPlanningService.getCashFlowForecast(userId, days);
            return {
                answer: `🔮 ${forecast.days}-Day Cash-Flow Forecast:

• Starting Available Balance: ₹${forecast.startingBalance.toLocaleString()}
• Expected Inflows (Salary): +₹${forecast.expectedInflow.toLocaleString()}
• Known Outflows (Bills & EMIs): -₹${forecast.knownOutflow.toLocaleString()}
• Estimated Discretionary Outflows: -₹${forecast.estimatedOutflow.toLocaleString()}
----------------------------------------
• Projected Ending Balance: ₹${forecast.projectedEndingBalance.toLocaleString()}

Note: ${forecast.disclaimer}`,
                supportingData: {
                    forecastBalance: forecast.projectedEndingBalance,
                    totalBalance: forecast.startingBalance
                },
                explanation: 'Grounding: Computed deterministically by FinancialPlanningService.getCashFlowForecast().',
                suggestedActions: [
                    'What is my financial calendar?',
                    'Can I afford ₹10,000?',
                    'View savings plan'
                ]
            };
        }
        // 11. Financial Calendar & Upcoming Schedule
        if (q.includes('calendar') || q.includes('schedule') || q.includes('salary date')) {
            const events = await financial_planning_service_js_1.FinancialPlanningService.getFinancialCalendar(userId, 'month');
            const eventList = events.slice(0, 5).map(e => `• ${e.date}: ${e.title} (₹${e.amount.toLocaleString()}) - [${e.status}]`).join('\n');
            return {
                answer: `🗓️ Financial Calendar Schedule:

${eventList}

All upcoming mandatory items are synchronized with your Safe-to-Spend calculation.`,
                supportingData: {
                    upcomingBillsCount: events.length
                },
                explanation: 'Grounding: Generated from FinancialPlanningService.getFinancialCalendar().',
                suggestedActions: [
                    'What is my 30-day forecast?',
                    'Why is my Safe-to-Spend ₹15,731?'
                ]
            };
        }
        // 12. Expense Anomalies & Duplicate Transaction Detection
        if (q.includes('anomaly') || q.includes('unusual') || q.includes('duplicate') || q.includes('twice')) {
            const anomalies = await financial_planning_service_js_1.FinancialPlanningService.detectAnomalies(userId);
            const duplicates = await financial_planning_service_js_1.FinancialPlanningService.detectDuplicates(userId);
            let text = '🔍 Spending Anomaly & Duplicate Advisory:\n\n';
            if (anomalies.length > 0) {
                text += `Unusual Spending:\n${anomalies.map(a => `• ${a.explanation}`).join('\n')}\n\n`;
            }
            else {
                text += '✅ No severe spending anomalies detected.\n\n';
            }
            if (duplicates.length > 0) {
                text += `Potential Duplicate Transactions:\n${duplicates.map(d => `• ${d.explanation}`).join('\n')}`;
            }
            else {
                text += '✅ No duplicate transactions detected.';
            }
            return {
                answer: text,
                supportingData: {
                    anomaliesCount: anomalies.length
                },
                explanation: 'Grounding: Evaluated via FinancialPlanningService.detectAnomalies() and detectDuplicates(). Advisory only.',
                suggestedActions: [
                    'What changed this month?',
                    'How much did I spend on food?'
                ]
            };
        }
        // 13. Financial Health Overview (8 Indicators)
        if (q.includes('health') || q.includes('score') || q.includes('indicator') || q.includes('overall status')) {
            const health = await financial_planning_service_js_1.FinancialPlanningService.getFinancialHealthIndicators(userId);
            const indList = health.indicators.map(i => `• ${i.name}: ${i.currentValue} [${i.status}] - ${i.explanation}`).join('\n');
            return {
                answer: `🏥 Financial Health Indicators:

${indList}

Summary: ${health.summaryNote}`,
                supportingData: {
                    safeToSpend: safeData.safeToSpend,
                    emergencyRunway: efData.monthsOfCoverage
                },
                explanation: 'Grounding: Compiled across 8 transparent metrics in FinancialPlanningService.getFinancialHealthIndicators().',
                suggestedActions: [
                    'What is my 30-day forecast?',
                    'Simulate savings scenario',
                    'Check monthly budget'
                ]
            };
        }
        // 14. What-If Financial & Savings Simulation
        if (q.includes('what if') || q.includes('simulate') || q.includes('what happens if')) {
            const match = q.match(/\d+/g);
            const amount = match ? parseFloat(match.join('')) : 3000;
            if (q.includes('save')) {
                const sim = await financial_planning_service_js_1.FinancialPlanningService.simulateSavingsScenario(userId, undefined, amount);
                return {
                    answer: `🎯 Savings Simulation Result:
• Goal: ${sim.goalName}
• Current Target: ₹${sim.targetAmount.toLocaleString()} (₹${sim.currentAmount.toLocaleString()} saved)
• Original Timeline: ${sim.originalCompletionMonths} months
• Simulated Timeline (+₹${amount.toLocaleString()}/mo): ${sim.simulatedCompletionMonths} months (${sim.monthsSaved} months faster!)
• Impact on Safe-to-Spend: ₹${sim.simulatedSafeToSpendImpact.toLocaleString()}

Note: This is a simulation only; no database changes were made.`,
                    supportingData: {
                        safeToSpend: sim.simulatedSafeToSpendImpact
                    },
                    explanation: 'Grounding: Calculated via FinancialPlanningService.simulateSavingsScenario().',
                    suggestedActions: [
                        'Simulate another amount',
                        'View savings plan',
                        'View Safe-to-Spend'
                    ]
                };
            }
            else {
                const sim = await financial_planning_service_js_1.FinancialPlanningService.simulateFinancialScenario(userId, { additionalExpenseAmount: amount });
                return {
                    answer: `🧪 Financial Scenario Simulation (Spending ₹${amount.toLocaleString()}):
• Starting Balance: ₹${sim.currentBalance.toLocaleString()} ➔ Projected Balance: ₹${sim.projectedBalance.toLocaleString()}
• Current Safe-to-Spend: ₹${sim.currentSafeToSpend.toLocaleString()} ➔ Projected Safe-to-Spend: ₹${sim.projectedSafeToSpend.toLocaleString()}
• Committed Obligations: ₹${sim.projectedCommitments.toLocaleString()} (Kept Safe)
${sim.warnings.length > 0 ? `\nWarnings:\n${sim.warnings.join('\n')}` : ''}

Note: This is a simulation only; your real account balances were not modified.`,
                    supportingData: {
                        safeToSpend: sim.projectedSafeToSpend,
                        totalBalance: sim.projectedBalance
                    },
                    explanation: 'Grounding: Calculated via FinancialPlanningService.simulateFinancialScenario().',
                    suggestedActions: [
                        'Can I afford ₹10,000?',
                        'What is my 30-day forecast?'
                    ]
                };
            }
        }
        // 9. Default Financial Overview Brief
        return {
            answer: `Hello! 👋 Based on your current financial records:
• Available Balance: ₹${safeData.availableBalance.toLocaleString()}
• Safe-to-Spend: ₹${safeData.safeToSpend.toLocaleString()}
• Income this month: ₹${monthlySummary.income.toLocaleString()}
• Spent this month: ₹${monthlySummary.expenses.toLocaleString()}
• Saved this month: ₹${monthlySummary.savings.toLocaleString()} (${monthlySummary.savingsRate}%)
• Upcoming commitments: ₹${commitments.totalCommitted.toLocaleString()}

How can I help you analyze your finances today?`,
            supportingData: {
                safeToSpend: safeData.safeToSpend,
                totalBalance: safeData.availableBalance,
                thisMonthSpent: monthlySummary.expenses,
                thisMonthIncome: monthlySummary.income,
                thisMonthSaved: monthlySummary.savings
            },
            explanation: 'Grounding: Calculated comprehensive snapshot across all connected accounts, bills, and savings plans.',
            suggestedActions: [
                'Why is my Safe-to-Spend ₹15,731?',
                'Can I afford ₹10,000?',
                'What payments are coming this week?',
                'What changed this month?'
            ]
        };
    }
    /**
     * Explicit Allowlisted AI Tool Dispatcher.
     * Only allows strictly read-only, user-isolated analytical tools.
     * Throws on any disallowed, destructive, or state-mutating tool request.
     */
    static async executeTool(userId, toolName, params = {}) {
        const ALLOWED_READ_ONLY_TOOLS = new Set([
            'getSafeToSpend',
            'getMonthlySummary',
            'getBudgets',
            'getCashFlowForecast',
            'getEmergencyFundPlan',
            'getSavingsGoalsIntelligence',
            'detectAnomalies',
            'detectDuplicates',
            'getFinancialHealthIndicators',
            'getUpcomingPayments',
            'getRecurringPayments'
        ]);
        if (!ALLOWED_READ_ONLY_TOOLS.has(toolName)) {
            throw new Error(`[SECURITY] AI tool execution refused: '${toolName}' is not in the authorized read-only tool allowlist.`);
        }
        switch (toolName) {
            case 'getSafeToSpend':
                return await calculations_service_js_1.CalculationsService.calculateSafeToSpend(userId);
            case 'getMonthlySummary':
                return await calculations_service_js_1.CalculationsService.getMonthlySummary(userId, Number(params.months) || 1);
            case 'getBudgets':
                return await financial_planning_service_js_1.FinancialPlanningService.getBudgetSummary(userId);
            case 'getCashFlowForecast':
                const daysParam = Number(params.days);
                const days = daysParam === 7 ? 7 : daysParam === 90 ? 90 : 30;
                return await financial_planning_service_js_1.FinancialPlanningService.getCashFlowForecast(userId, days);
            case 'getEmergencyFundPlan':
                return await financial_planning_service_js_1.FinancialPlanningService.getEmergencyFundPlan(userId);
            case 'getSavingsGoalsIntelligence':
                return await calculations_service_js_1.CalculationsService.getSavingsGoalsIntelligence(userId);
            case 'detectAnomalies':
                return await financial_planning_service_js_1.FinancialPlanningService.detectAnomalies(userId);
            case 'detectDuplicates':
                return await financial_planning_service_js_1.FinancialPlanningService.detectDuplicates(userId);
            case 'getFinancialHealthIndicators':
                return await financial_planning_service_js_1.FinancialPlanningService.getFinancialHealthIndicators(userId);
            case 'getUpcomingPayments':
                return await calculations_service_js_1.CalculationsService.getUpcomingPayments(userId, params.period || 'month');
            case 'getRecurringPayments':
                return await financial_insights_service_js_1.FinancialInsightsService.detectRecurringPayments(userId);
            default:
                throw new Error(`[SECURITY] Tool '${toolName}' execution unauthorized.`);
        }
    }
}
exports.AIAssistantService = AIAssistantService;
//# sourceMappingURL=ai.service.js.map