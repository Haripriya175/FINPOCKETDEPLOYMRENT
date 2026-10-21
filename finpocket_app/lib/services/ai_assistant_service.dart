import '../models/models.dart';
import '../providers/app_state.dart';
import 'api_service.dart';
import '../features/financial_twin/twin_engine.dart';
import '../features/spend_guard/spend_guard_engine.dart';

class AIQueryResult {
  final String answer;
  final String? explanation;
  final List<String> suggestedActions;

  AIQueryResult({
    required this.answer,
    this.explanation,
    this.suggestedActions = const [],
  });
}

class AIAssistantService {
  static FinancialHealthScore getHealthScore(AppState state) {
    int score = 50;
    List<String> positive = [];
    List<String> warning = [];

    // Emergency Fund check
    final emProgress = state.emergencyFund.targetAmount > 0
        ? state.emergencyFund.currentAmount / state.emergencyFund.targetAmount
        : 0.0;

    if (emProgress >= 0.3) {
      score += 20;
      positive.add('Emergency Fund is ${(emProgress * 100).round()}% funded and protected.');
    } else {
      warning.add('Target growing emergency fund to 3-6 months of expenses.');
    }

    // Bills check
    final unpaid = state.bills.where((b) => !b.isPaidThisMonth).length;
    if (unpaid == 0) {
      score += 15;
      positive.add('All recurring obligations and EMIs are up-to-date.');
    } else {
      warning.add('$unpaid bills due soon this month.');
    }

    // Safe-to-Spend check
    if (state.safeToSpend.safeToSpend > 10000) {
      score += 10;
      positive.add('Healthy Safe-to-Spend liquidity buffer.');
    }

    // Goals check
    if (state.savingsGoals.isNotEmpty) {
      score += 10;
      positive.add('Active progress towards ${state.savingsGoals.length} structured savings goals.');
    }

    final finalScore = score.clamp(10, 95);
    final grade = finalScore >= 80
        ? 'EXCELLENT'
        : finalScore >= 65
            ? 'GOOD'
            : finalScore >= 50
                ? 'FAIR'
                : 'NEEDS_ATTENTION';

    return FinancialHealthScore(
      score: finalScore,
      grade: grade,
      positiveFactors: positive,
      warningFactors: warning,
    );
  }

  static String ask(String query, AppState state) => askLocal(query, state);

  static Future<AIQueryResult> askAsync(String query, AppState state) async {
    try {
      final res = await ApiService.queryAI(query);
      final rawActions = res['suggestedActions'] as List<dynamic>? ?? [];
      return AIQueryResult(
        answer: res['answer'] ?? 'Here is your financial summary.',
        explanation: res['explanation'],
        suggestedActions: rawActions.map((e) => e.toString()).toList(),
      );
    } catch (e) {
      // Fallback to local intelligent reasoner
      final localAnswer = askLocal(query, state);
      return AIQueryResult(
        answer: localAnswer,
        explanation: 'Grounding: Calculated locally from synced account data.',
        suggestedActions: ['Can I afford ₹5,000?', 'How much did I spend this month?'],
      );
    }
  }

  static String askLocal(String query, AppState state) {
    final q = query.toLowerCase().trim();

    if (q.contains('transfer') || q.contains('pay') || q.contains('send money') || q.contains('unlink') || q.contains('revoke') || q.contains('delete')) {
      return 'The AI Assistant is strictly read-only and cannot execute payments or mutate financial state. Please use the Payments tab to authenticate and simulate payments.';
    }

    if (q.contains('runway') || q.contains('how long') || q.contains('digital twin')) {
      final twin = FinancialTwinEngine.generateProjection(
        accounts: state.accounts,
        transactions: state.transactions,
        bills: state.bills,
        goals: state.goals,
      );
      return 'Your Financial Digital Twin projects a runway of ${twin.runwayDays} days (~${twin.runwayMonths.toStringAsFixed(1)} months) with a daily burn rate of ₹${twin.dailyBurnRate.toStringAsFixed(0)}/day. Liquidity risk tier: ${twin.riskTier.name.toUpperCase()}.';
    }

    if (q.contains('afford') || q.contains('can i spend') || q.contains('can i buy')) {
      final numRegex = RegExp(r'(\d[\d,]*)');
      final match = numRegex.firstMatch(q.replaceAll('₹', ''));
      if (match != null) {
        final rawNum = match.group(1)?.replaceAll(',', '');
        final amount = double.tryParse(rawNum ?? '');
        if (amount != null && amount > 0) {
          final eval = SpendGuardEngine.evaluate(
            requestedAmount: amount,
            category: 'General',
            accounts: state.accounts,
            transactions: state.transactions,
            bills: state.bills,
            goals: state.goals,
          );
          return 'Spend Guard Verdict: ${eval.verdictTitle.toUpperCase()} for ₹${amount.toInt()}.\n${eval.explanation} Remaining Safe-to-Spend: ₹${eval.remainingSafeToSpend.toStringAsFixed(0)}.';
        }
      }
      return 'Your current Safe-to-Spend estimate is ₹${state.safeToSpend.safeToSpend.toStringAsFixed(0)} (Available balance: ₹${state.totalAvailableBalance.toStringAsFixed(0)} minus upcoming commitments).';
    }

    if (q.contains('balance') || q.contains('how much money') || q.contains('total')) {
      return 'Your total available balance across ${state.bankAccounts.length} bank accounts is ₹${state.totalAvailableBalance.toStringAsFixed(2)}. In addition, you have ₹${state.emergencyFund.currentAmount.toStringAsFixed(2)} in your Emergency Fund.';
    }

    if (q.contains('spend') || q.contains('spent') || q.contains('expense')) {
      return 'This month you have spent ₹${state.thisMonthSpent.toStringAsFixed(2)}. Your largest expenses are Rent, Bills, and Food.';
    }

    if (q.contains('emergency') || q.contains('fund')) {
      return 'Your Emergency Fund holds ₹${state.emergencyFund.currentAmount.toStringAsFixed(2)} out of your ₹${state.emergencyFund.targetAmount.toStringAsFixed(2)} target. Status: ${state.emergencyFund.isLocked ? "🔒 LOCKED" : "🔓 Unlocked"}.';
    }

    if (q.contains('bill') || q.contains('due')) {
      final unpaid = state.bills.where((b) => !b.isPaidThisMonth).length;
      return 'You have $unpaid unpaid bills due this cycle totaling ₹${state.safeToSpend.upcomingMandatoryBills.toStringAsFixed(0)}.';
    }

    return 'I can help answer questions about your Safe-to-Spend limit, monthly expenses, emergency fund, bills, and affordability!';
  }
}
