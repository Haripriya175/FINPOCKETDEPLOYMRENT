import 'dart:math' as math;
import '../../models/models.dart';
import '../financial_twin/twin_engine.dart';
import 'spend_guard_models.dart';

class SpendGuardEngine {
  static SpendGuardEvaluation evaluate({
    required double requestedAmount,
    required String category,
    required List<Account> accounts,
    required List<Transaction> transactions,
    required List<Bill> bills,
    required List<Goal> goals,
  }) {
    final twin = FinancialTwinEngine.generateProjection(
      accounts: accounts,
      transactions: transactions,
      bills: bills,
      goals: goals,
    );

    final currentSafe = twin.safeToSpendMonthly;
    final remainingSafe = currentSafe - requestedAmount;

    final runwayBefore = twin.runwayDays;
    final projectedLiquid = twin.currentLiquidBalance - requestedAmount;
    final runwayAfter = math.max(0, (projectedLiquid / twin.dailyBurnRate).round());
    final runwayDelta = runwayAfter - runwayBefore;

    final List<String> impactedGoals = [];
    if (requestedAmount > (twin.currentLiquidBalance * 0.15)) {
      for (final g in goals) {
        impactedGoals.add('${g.title} (may delay by ~${(requestedAmount / math.max(300, twin.safeToSpendDaily)).round()} days)');
      }
    }

    SpendGuardAffordability affordability;
    String verdictTitle;
    String explanation;
    String? recommendation;

    if (remainingSafe >= 0 && runwayAfter >= 45) {
      affordability = SpendGuardAffordability.safe;
      verdictTitle = 'Safe to Spend';
      explanation = 'This purchase is well within your discretionary spending allocation. '
          'Leaves ₹${remainingSafe.toStringAsFixed(0)} safe-to-spend for the remainder of this cycle.';
      recommendation = 'Proceed with transaction without affecting active bills or runway.';
    } else if (remainingSafe >= - (currentSafe * 0.3) && runwayAfter >= 20) {
      affordability = SpendGuardAffordability.caution;
      verdictTitle = 'Caution: Tightens Liquidity';
      explanation = 'Consumes your discretionary buffer and trims financial runway by ${runwayDelta.abs()} days. '
          'You may need to reduce weekend discretionary spending to stay on track.';
      recommendation = 'Consider delaying by 2 weeks or splitting into 2 partial installments.';
    } else {
      affordability = SpendGuardAffordability.unaffordable;
      verdictTitle = 'High Risk: Overdraft / Deficit';
      explanation = 'This purchase dips into funds required for upcoming mandatory bills (₹${twin.fixedMonthlyObligations.toStringAsFixed(0)}) '
          'or drops your emergency runway below the safe 20-day threshold.';
      recommendation = 'Highly recommended to pause this purchase or fund it from an allocated wealth goal.';
    }

    return SpendGuardEvaluation(
      requestedAmount: requestedAmount,
      category: category,
      affordability: affordability,
      currentSafeToSpend: currentSafe,
      remainingSafeToSpend: remainingSafe,
      runwayBeforeDays: runwayBefore,
      runwayAfterDays: runwayAfter,
      runwayDeltaDays: runwayDelta,
      impactedGoals: impactedGoals,
      verdictTitle: verdictTitle,
      explanation: explanation,
      recommendation: recommendation,
    );
  }
}
