enum SpendGuardAffordability {
  safe,
  caution,
  unaffordable,
}

class SpendGuardEvaluation {
  final double requestedAmount;
  final String category;
  final SpendGuardAffordability affordability;
  final double currentSafeToSpend;
  final double remainingSafeToSpend;
  final int runwayBeforeDays;
  final int runwayAfterDays;
  final int runwayDeltaDays;
  final List<String> impactedGoals;
  final String verdictTitle;
  final String explanation;
  final String? recommendation;

  const SpendGuardEvaluation({
    required this.requestedAmount,
    required this.category,
    required this.affordability,
    required this.currentSafeToSpend,
    required this.remainingSafeToSpend,
    required this.runwayBeforeDays,
    required this.runwayAfterDays,
    required this.runwayDeltaDays,
    required this.impactedGoals,
    required this.verdictTitle,
    required this.explanation,
    this.recommendation,
  });
}
