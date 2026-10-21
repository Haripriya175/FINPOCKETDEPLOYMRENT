import 'dart:math' as math;
import '../../models/models.dart';
import 'twin_models.dart';

class FinancialTwinEngine {
  /// Generate a complete digital twin projection from live app state
  static TwinProjection generateProjection({
    required List<Account> accounts,
    required List<Transaction> transactions,
    required List<Bill> bills,
    required List<Goal> goals,
    double emergencyFundBuffer = 25000.0,
  }) {
    // 1. Calculate Liquid Balances (Bank Accounts + Cash Wallets)
    double liquidBalance = 0.0;
    for (final acc in accounts) {
      if (acc.type.toLowerCase() != 'credit' && acc.type.toLowerCase() != 'loan') {
        liquidBalance += acc.balance;
      }
    }
    if (liquidBalance <= 0) {
      // Fallback to accounts sum if balances are zero
      liquidBalance = accounts.fold(0.0, (sum, a) => sum + (a.balance > 0 ? a.balance : 0));
    }
    // Real-data rule: no fabricated ₹45,000 baseline. Without any account
    // data the liquid balance is ₹0.

    // 2. Compute 30-day historical outflow and burn rate
    final now = DateTime.now();
    final thirtyDaysAgo = now.subtract(const Duration(days: 30));
    double recentOutflow = 0.0;
    double recentInflow = 0.0;

    for (final tx in transactions) {
      if (tx.date.isAfter(thirtyDaysAgo)) {
        if (tx.isExpense) {
          recentOutflow += tx.amount.abs();
        } else {
          recentInflow += tx.amount.abs();
        }
      }
    }

    // Real-data rule: burn rate, income and obligations are ₹0 when there is
    // no real ledger movement — never an invented ₹1,200/day, ₹300/day floor,
    // ₹18,500 bills baseline or ₹75,000 salary.
    double dailyBurnRate = recentOutflow > 0 ? (recentOutflow / 30.0) : 0.0;

    // 3. Fixed monthly obligations from bills
    double fixedMonthlyObligations = 0.0;
    for (final bill in bills) {
      if (!bill.isPaid) {
        fixedMonthlyObligations += bill.amount;
      }
    }

    // 4. Monthly income estimate
    double monthlyIncome = recentInflow;

    // 5. Runway Calculation
    final netDailyCashFlow = (monthlyIncome - fixedMonthlyObligations) / 30.0 - dailyBurnRate;
    int runwayDays;
    if (dailyBurnRate <= 0) {
      // No real spending on record: nothing is burning the balance down, so
      // the horizon cap applies when there is money, and 0 when there is none.
      runwayDays = liquidBalance > 0 ? 365 : 0;
    } else if (netDailyCashFlow >= 0) {
      // Cash flow positive: runway exceeds 1 year based on current balance
      runwayDays = math.min(365, (liquidBalance / dailyBurnRate).round());
      if (runwayDays < 90) runwayDays = 120;
    } else {
      // Burn is faster than income
      runwayDays = math.max(7, (liquidBalance / dailyBurnRate).round());
    }

    // 6. Liquidity Risk Tier
    LiquidityRiskTier riskTier;
    if (runwayDays >= 90) {
      riskTier = LiquidityRiskTier.low;
    } else if (runwayDays >= 30) {
      riskTier = LiquidityRiskTier.moderate;
    } else {
      riskTier = LiquidityRiskTier.critical;
    }

    // 7. Safe-to-Spend Calculations
    final daysInMonth = DateTime(now.year, now.month + 1, 0).day;
    final remainingDays = math.max(1, daysInMonth - now.day);
    final availableDiscretionary = math.max(0.0, liquidBalance - fixedMonthlyObligations - (emergencyFundBuffer * 0.5));
    final safeToSpendDaily = availableDiscretionary / remainingDays;
    final safeToSpendMonthly = availableDiscretionary;

    // 8. 90-Day Trajectory Forecast
    final List<CashFlowPoint> forecastPoints = [];
    double rollingBalance = liquidBalance;

    for (int day = 1; day <= 90; day++) {
      final simDate = now.add(Duration(days: day));
      double dayInflow = 0.0;
      double dayOutflow = dailyBurnRate;
      String note = '';

      // Salary on 1st or 28th
      if (simDate.day == 1 || simDate.day == 28) {
        dayInflow = monthlyIncome / (simDate.day == 1 ? 1 : 2);
        note = 'Projected Salary Credit';
      }

      // Bills due on specific days
      for (final bill in bills) {
        if (bill.dueDate.day == simDate.day) {
          dayOutflow += bill.amount;
          note = note.isEmpty ? 'Bill: ${bill.title}' : '$note | ${bill.title}';
        }
      }

      rollingBalance = rollingBalance + dayInflow - dayOutflow;

      if (day % 5 == 0 || day == 1 || day == 90 || note.isNotEmpty) {
        forecastPoints.add(CashFlowPoint(
          date: simDate,
          projectedBalance: rollingBalance,
          inflow: dayInflow,
          outflow: dayOutflow,
          note: note,
        ));
      }
    }

    return TwinProjection(
      currentLiquidBalance: liquidBalance,
      dailyBurnRate: dailyBurnRate,
      estimatedMonthlyIncome: monthlyIncome,
      fixedMonthlyObligations: fixedMonthlyObligations,
      runwayDays: runwayDays,
      riskTier: riskTier,
      safeToSpendDaily: safeToSpendDaily,
      safeToSpendMonthly: safeToSpendMonthly,
      forecastPoints: forecastPoints,
    );
  }

  /// Simulate a What-If Scenario against current financial status
  static ScenarioSimulation simulateScenario({
    required TwinProjection baseline,
    required WhatIfScenario scenario,
    required List<Goal> goals,
  }) {
    double projectedLiquid = baseline.currentLiquidBalance;
    double projectedBurn = baseline.dailyBurnRate;
    double projectedObligations = baseline.fixedMonthlyObligations;

    switch (scenario.type) {
      case ScenarioType.largePurchase:
      case ScenarioType.emergencyExpense:
        projectedLiquid -= scenario.amount;
        break;
      case ScenarioType.rentOrExpenseHike:
        projectedObligations += scenario.amount;
        projectedBurn += (scenario.amount / 30.0);
        break;
      case ScenarioType.salaryOrIncomeChange:
        // amount can be positive (raise) or negative (loss)
        // If loss, effective daily burn increases relative to inflow
        break;
      case ScenarioType.custom:
        if (scenario.isRecurring) {
          projectedObligations += scenario.amount;
        } else {
          projectedLiquid -= scenario.amount;
        }
        break;
    }

    // Recompute runway
    int projectedRunwayDays = math.max(1, (projectedLiquid / projectedBurn).round());
    int runwayDeltaDays = projectedRunwayDays - baseline.runwayDays;

    LiquidityRiskTier projectedRisk;
    if (projectedRunwayDays >= 90) {
      projectedRisk = LiquidityRiskTier.low;
    } else if (projectedRunwayDays >= 30) {
      projectedRisk = LiquidityRiskTier.moderate;
    } else {
      projectedRisk = LiquidityRiskTier.critical;
    }

    final projectedSafeToSpend = math.max(0.0, baseline.safeToSpendMonthly - scenario.amount);

    // Goal impacts
    final List<GoalImpact> affectedGoals = [];

    for (final goal in goals) {
      if (scenario.amount > (baseline.currentLiquidBalance * 0.2)) {
        // Significant purchase causes delay
        final estimatedDaysDelay = math.min(180, (scenario.amount / math.max(500, baseline.safeToSpendDaily)).round());
        final originalDate = goal.targetDate;
        final newDate = originalDate.add(Duration(days: estimatedDaysDelay));

        affectedGoals.add(GoalImpact(
          goalId: goal.id,
          goalTitle: goal.title,
          targetAmount: goal.targetAmount,
          originalTargetDate: originalDate,
          projectedTargetDate: newDate,
          delayDays: estimatedDaysDelay,
        ));
      }
    }

    // Actionable advice generation
    final List<String> advice = [];
    final isViable = projectedLiquid > (projectedObligations * 1.5) && projectedRunwayDays >= 30;

    if (isViable) {
      advice.add('Safe purchase: Your runway remains healthy at $projectedRunwayDays days.');
      if (affectedGoals.isNotEmpty) {
        advice.add('${affectedGoals.first.goalTitle} may be deferred by ~${affectedGoals.first.delayDays} days unless monthly savings are boosted.');
      } else {
        advice.add('All active financial goals remain strictly on schedule.');
      }
    } else {
      advice.add('High Risk: This purchase reduces your financial runway below the 30-day safety margin.');
      advice.add('Consider splitting into a 3-month no-cost EMI or delaying by 45 days to replenish cash buffer.');
      if (affectedGoals.isNotEmpty) {
        advice.add('Critical delay: ${affectedGoals.length} goals will be pushed back significantly.');
      }
    }

    return ScenarioSimulation(
      scenario: scenario,
      baselineRunwayDays: baseline.runwayDays,
      projectedRunwayDays: projectedRunwayDays,
      runwayDeltaDays: runwayDeltaDays,
      baselineSafeToSpend: baseline.safeToSpendMonthly,
      projectedSafeToSpend: projectedSafeToSpend,
      isViable: isViable,
      projectedRiskTier: projectedRisk,
      affectedGoals: affectedGoals,
      actionableAdvice: advice,
    );
  }
}
