enum LiquidityRiskTier {
  low,
  moderate,
  critical,
}

class CashFlowPoint {
  final DateTime date;
  final double projectedBalance;
  final double inflow;
  final double outflow;
  final String note;

  const CashFlowPoint({
    required this.date,
    required this.projectedBalance,
    this.inflow = 0.0,
    this.outflow = 0.0,
    this.note = '',
  });

  bool get isDeficit => projectedBalance < 0;
}

class GoalImpact {
  final String goalId;
  final String goalTitle;
  final double targetAmount;
  final DateTime originalTargetDate;
  final DateTime projectedTargetDate;
  final int delayDays;

  const GoalImpact({
    required this.goalId,
    required this.goalTitle,
    required this.targetAmount,
    required this.originalTargetDate,
    required this.projectedTargetDate,
    required this.delayDays,
  });
}

class TwinProjection {
  final double currentLiquidBalance;
  final double dailyBurnRate;
  final double estimatedMonthlyIncome;
  final double fixedMonthlyObligations;
  final int runwayDays;
  final LiquidityRiskTier riskTier;
  final double safeToSpendDaily;
  final double safeToSpendMonthly;
  final List<CashFlowPoint> forecastPoints;

  const TwinProjection({
    required this.currentLiquidBalance,
    required this.dailyBurnRate,
    required this.estimatedMonthlyIncome,
    required this.fixedMonthlyObligations,
    required this.runwayDays,
    required this.riskTier,
    required this.safeToSpendDaily,
    required this.safeToSpendMonthly,
    required this.forecastPoints,
  });

  double get runwayMonths => (runwayDays / 30.0);
}

enum ScenarioType {
  largePurchase,
  rentOrExpenseHike,
  salaryOrIncomeChange,
  emergencyExpense,
  custom,
}

class WhatIfScenario {
  final String id;
  final String title;
  final String description;
  final ScenarioType type;
  final double amount;
  final bool isRecurring;
  final int occurrences;
  final String category;

  const WhatIfScenario({
    required this.id,
    required this.title,
    required this.description,
    required this.type,
    required this.amount,
    this.isRecurring = false,
    this.occurrences = 1,
    this.category = 'General',
  });
}

class ScenarioSimulation {
  final WhatIfScenario scenario;
  final int baselineRunwayDays;
  final int projectedRunwayDays;
  final int runwayDeltaDays;
  final double baselineSafeToSpend;
  final double projectedSafeToSpend;
  final bool isViable;
  final LiquidityRiskTier projectedRiskTier;
  final List<GoalImpact> affectedGoals;
  final List<String> actionableAdvice;

  const ScenarioSimulation({
    required this.scenario,
    required this.baselineRunwayDays,
    required this.projectedRunwayDays,
    required this.runwayDeltaDays,
    required this.baselineSafeToSpend,
    required this.projectedSafeToSpend,
    required this.isViable,
    required this.projectedRiskTier,
    required this.affectedGoals,
    required this.actionableAdvice,
  });
}
