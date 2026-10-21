import 'dart:math' as math;
import '../../models/models.dart';
import 'health_score_models.dart';

class FinancialHealthEngine {
  static HealthScoreResult calculate({
    required List<Account> accounts,
    required List<Transaction> transactions,
    required List<Bill> bills,
    required List<Goal> goals,
  }) {
    // 1. Calculate liquid savings and monthly obligations
    double liquidBalance = 0.0;
    for (final acc in accounts) {
      if (acc.type.toLowerCase() != 'credit' && acc.type.toLowerCase() != 'loan') {
        liquidBalance += acc.balance;
      }
    }
    if (liquidBalance <= 0) {
      liquidBalance = accounts.fold(0.0, (sum, a) => sum + (a.balance > 0 ? a.balance : 0));
    }
    // Real-data rule: no fabricated fallback. Without any account data the
    // liquid balance is ₹0 rather than an invented ₹35,000.

    double fixedMonthlyBills = bills.where((b) => !b.isPaid).fold(0.0, (sum, b) => sum + b.amount);
    // Real-data rule: no fabricated fallback. Without any unpaid bills the
    // obligations are ₹0 rather than an invented ₹15,000.

    // 2. Thirty day historical cash-flow
    final now = DateTime.now();
    final thirtyDaysAgo = now.subtract(const Duration(days: 30));
    double recentInflow = 0.0;
    double recentOutflow = 0.0;
    final List<double> dailyExpenses = [];

    for (final tx in transactions) {
      if (tx.date.isAfter(thirtyDaysAgo)) {
        if (tx.isExpense) {
          recentOutflow += tx.amount.abs();
          dailyExpenses.add(tx.amount.abs());
        } else {
          recentInflow += tx.amount.abs();
        }
      }
    }

    // Real-data rule: income and spend default to ₹0 and reflect only real
    // ledger movement. No assumed ₹65,000 salary or ₹20,000 lifestyle spend.
    final monthlyIncome = recentInflow;
    final monthlyExpense = recentOutflow;

    // Factor 1: Cash Flow Stability (Weight 0.25)
    final expenseRatio = monthlyExpense / math.max(1.0, monthlyIncome);
    double cashFlowScore = 75.0;
    String cashFlowSummary = 'Healthy operating margin';
    String cashFlowRec = 'Maintain monthly discretionary spend below 60% of income.';
    if (expenseRatio <= 0.6) {
      cashFlowScore = 95.0;
      cashFlowSummary = 'Exceptional surplus margin';
    } else if (expenseRatio <= 0.8) {
      cashFlowScore = 80.0;
      cashFlowSummary = 'Good balance with steady buffer';
    } else if (expenseRatio <= 1.0) {
      cashFlowScore = 55.0;
      cashFlowSummary = 'Tight margins; living close to paycheck';
      cashFlowRec = 'Trim non-essential subscriptions to create a safety margin.';
    } else {
      cashFlowScore = 30.0;
      cashFlowSummary = 'Deficit spending detected';
      cashFlowRec = 'Expenses exceed income. Review high-outflow categories immediately.';
    }

    // Factor 2: Emergency Readiness (Weight 0.25)
    final monthsCovered = liquidBalance / math.max(1000.0, monthlyExpense);
    double emergencyScore = 60.0;
    String emergencySummary = '1-2 months of living expenses covered';
    String emergencyRec = 'Gradually build up to a 6-month liquid cushion.';
    if (monthsCovered >= 6.0) {
      emergencyScore = 98.0;
      emergencySummary = 'Fully resilient 6+ months reserves';
      emergencyRec = 'Excellent safety net. Surplus funds can be routed to wealth goals.';
    } else if (monthsCovered >= 3.0) {
      emergencyScore = 82.0;
      emergencySummary = 'Solid 3-5 months reserves';
      emergencyRec = 'Target 1 additional month of living expenses to reach top tier.';
    } else if (monthsCovered >= 1.0) {
      emergencyScore = 55.0;
      emergencySummary = 'Vulnerable to sudden economic shocks';
      emergencyRec = 'Prioritize allocating ₹5,000/month to an emergency liquid fund.';
    } else {
      emergencyScore = 25.0;
      emergencySummary = 'Less than 1 month of living expenses saved';
      emergencyRec = 'Immediate priority: build an initial ₹25,000 emergency buffer.';
    }

    // Factor 3: Debt Burden (Weight 0.20)
    final debtRatio = fixedMonthlyBills / math.max(1.0, monthlyIncome);
    double debtScore = 85.0;
    String debtSummary = 'Low debt-to-income ratio';
    String debtRec = 'Keep debt commitments under 30% of income.';
    if (debtRatio <= 0.25) {
      debtScore = 95.0;
      debtSummary = 'Very low debt commitments (<25%)';
    } else if (debtRatio <= 0.40) {
      debtScore = 75.0;
      debtSummary = 'Moderate fixed obligations (25-40%)';
      debtRec = 'Avoid acquiring new revolving credit or high-interest EMIs.';
    } else {
      debtScore = 40.0;
      debtSummary = 'Heavy fixed debt load (>40%)';
      debtRec = 'Focus on accelerated debt pay-down using the avalanche method.';
    }

    // Factor 4: Savings Discipline (Weight 0.15)
    double savingsScore = 70.0;
    String savingsSummary = 'Goals are being funded';
    String savingsRec = 'Set up automated transfers to reach savings milestones faster.';
    if (goals.isNotEmpty) {
      final totalSaved = goals.fold(0.0, (sum, g) => sum + g.currentAmount);
      final totalTarget = goals.fold(0.0, (sum, g) => sum + g.targetAmount);
      final ratio = totalTarget > 0 ? (totalSaved / totalTarget) : 0.5;
      savingsScore = (ratio * 100.0).clamp(40.0, 95.0);
      savingsSummary = '${(ratio * 100).toInt()}% towards aggregate goal milestones';
    }

    // Factor 5: Spending Volatility (Weight 0.15)
    double volatilityScore = 80.0;
    String volatilitySummary = 'Stable daily transaction patterns';
    String volatilityRec = 'Avoid large unplanned weekend spikes.';
    if (dailyExpenses.length > 5) {
      final avg = dailyExpenses.reduce((a, b) => a + b) / dailyExpenses.length;
      final variance = dailyExpenses.map((x) => math.pow(x - avg, 2)).reduce((a, b) => a + b) / dailyExpenses.length;
      final stdDev = math.sqrt(variance);
      if (stdDev < (avg * 0.5)) {
        volatilityScore = 90.0;
        volatilitySummary = 'Highly disciplined daily spending';
      } else if (stdDev < avg) {
        volatilityScore = 72.0;
        volatilitySummary = 'Moderate spending fluctuations';
      } else {
        volatilityScore = 45.0;
        volatilitySummary = 'High volatility; frequent erratic purchases';
        volatilityRec = 'Implement a weekly allowance rule to smooth out spending.';
      }
    }

    // Calculate Aggregate 0-1000 Score
    final weightedSum = (cashFlowScore * 0.25) +
        (emergencyScore * 0.25) +
        (debtScore * 0.20) +
        (savingsScore * 0.15) +
        (volatilityScore * 0.15);
    final totalScore = (weightedSum * 10).round().clamp(100, 1000);

    HealthScoreTier tier;
    if (totalScore >= 800) {
      tier = HealthScoreTier.excellent;
    } else if (totalScore >= 650) {
      tier = HealthScoreTier.good;
    } else if (totalScore >= 500) {
      tier = HealthScoreTier.fair;
    } else {
      tier = HealthScoreTier.needsWork;
    }

    // Build Roadmap
    final List<HealthActionItem> roadmap = [
      HealthActionItem(
        id: 'act_emergency',
        title: 'Reinforce Liquid Safety Buffer',
        description: 'Deposit ₹10,000 into a liquid savings vault to extend runway by 14 days.',
        pointsGain: 35,
        timeframe: 'Next 30 Days',
      ),
      HealthActionItem(
        id: 'act_bill',
        title: 'Automate Next Month Bills',
        description: 'Enable auto-pay on utility and card bills to prevent late charges and credit score impact.',
        pointsGain: 20,
        timeframe: 'This Week',
      ),
      HealthActionItem(
        id: 'act_sub',
        title: 'Cancel Inactive Recurring Subscriptions',
        description: 'Review recurring charges to prune unused memberships, reclaiming up to ₹1,800/mo.',
        pointsGain: 15,
        timeframe: 'Immediate',
      ),
      HealthActionItem(
        id: 'act_goal',
        title: 'Boost Target Goal SIP',
        description: 'Increase monthly contribution to your primary savings goal by 10%.',
        pointsGain: 25,
        timeframe: 'Next Paycheck',
      ),
    ];

    final factors = [
      HealthFactor(
        key: HealthFactorKey.cashFlowStability,
        title: 'Cash-Flow Stability',
        score: cashFlowScore,
        weight: 0.25,
        status: cashFlowScore >= 80 ? 'Optimal' : (cashFlowScore >= 60 ? 'Fair' : 'Attention'),
        summary: cashFlowSummary,
        recommendation: cashFlowRec,
      ),
      HealthFactor(
        key: HealthFactorKey.emergencyReadiness,
        title: 'Emergency Readiness',
        score: emergencyScore,
        weight: 0.25,
        status: emergencyScore >= 80 ? 'Optimal' : (emergencyScore >= 60 ? 'Fair' : 'Attention'),
        summary: emergencySummary,
        recommendation: emergencyRec,
      ),
      HealthFactor(
        key: HealthFactorKey.debtBurden,
        title: 'Debt & Commitments',
        score: debtScore,
        weight: 0.20,
        status: debtScore >= 80 ? 'Optimal' : (debtScore >= 60 ? 'Fair' : 'Attention'),
        summary: debtSummary,
        recommendation: debtRec,
      ),
      HealthFactor(
        key: HealthFactorKey.savingsDiscipline,
        title: 'Savings Discipline',
        score: savingsScore,
        weight: 0.15,
        status: savingsScore >= 75 ? 'Optimal' : (savingsScore >= 55 ? 'Fair' : 'Attention'),
        summary: savingsSummary,
        recommendation: savingsRec,
      ),
      HealthFactor(
        key: HealthFactorKey.spendingVolatility,
        title: 'Discretionary Consistency',
        score: volatilityScore,
        weight: 0.15,
        status: volatilityScore >= 75 ? 'Optimal' : (volatilityScore >= 55 ? 'Fair' : 'Attention'),
        summary: volatilitySummary,
        recommendation: volatilityRec,
      ),
    ];

    return HealthScoreResult(
      totalScore: totalScore,
      tier: tier,
      factors: factors,
      roadmap: roadmap,
      calculatedAt: now,
    );
  }
}
