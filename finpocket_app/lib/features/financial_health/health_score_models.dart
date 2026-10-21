enum HealthScoreTier {
  excellent,
  good,
  fair,
  needsWork,
}

enum HealthFactorKey {
  cashFlowStability,
  emergencyReadiness,
  debtBurden,
  savingsDiscipline,
  spendingVolatility,
}

class HealthFactor {
  final HealthFactorKey key;
  final String title;
  final double score; // 0.0 to 100.0
  final double weight; // 0.0 to 1.0 (sum = 1.0)
  final String status;
  final String summary;
  final String recommendation;

  const HealthFactor({
    required this.key,
    required this.title,
    required this.score,
    required this.weight,
    required this.status,
    required this.summary,
    required this.recommendation,
  });
}

class HealthActionItem {
  final String id;
  final String title;
  final String description;
  final int pointsGain;
  final String timeframe;
  final bool isCompleted;

  const HealthActionItem({
    required this.id,
    required this.title,
    required this.description,
    required this.pointsGain,
    required this.timeframe,
    this.isCompleted = false,
  });
}

class HealthScoreResult {
  final int totalScore; // 0 to 1000
  final HealthScoreTier tier;
  final List<HealthFactor> factors;
  final List<HealthActionItem> roadmap;
  final DateTime calculatedAt;

  const HealthScoreResult({
    required this.totalScore,
    required this.tier,
    required this.factors,
    required this.roadmap,
    required this.calculatedAt,
  });

  String get tierLabel {
    switch (tier) {
      case HealthScoreTier.excellent:
        return 'Excellent';
      case HealthScoreTier.good:
        return 'Good Standing';
      case HealthScoreTier.fair:
        return 'Fair / In Progress';
      case HealthScoreTier.needsWork:
        return 'Needs Attention';
    }
  }
}
