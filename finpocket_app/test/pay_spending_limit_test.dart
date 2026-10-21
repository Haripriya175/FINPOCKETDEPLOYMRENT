import 'dart:math';
import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:finpocket_app/config/app_config.dart';
import 'package:finpocket_app/providers/app_state.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  group('Dynamic User-Decided Pay Spending Limit & Allocation Tests', () {
    test('User has 100% control over income and spend limits across arbitrary user-defined amounts', () async {
      SharedPreferences.setMockInitialValues({});
      AppConfig.environment = AppEnvironment.test;
      final state = AppState();

      // System starts with no hardcoded assumptions:
      expect(state.userPayIncome, isNull);
      expect(state.userPaySpendLimit, isNull);
      expect(state.surplusForOtherSections, 0.0);

      // Diverse user-defined test scenarios (ranging from student micro-budgets to high-earner budgets)
      final dynamicUserScenarios = [
        // Micro-budget: e.g., college student
        {'income': 1500.0, 'spendLimit': 600.0, 'expectedSurplus': 900.0},
        // Decimals & odd amounts: e.g., daily earner
        {'income': 7349.50, 'spendLimit': 2899.25, 'expectedSurplus': 4450.25},
        // Mid-tier salaried professional
        {'income': 85400.0, 'spendLimit': 32000.0, 'expectedSurplus': 53400.0},
        // High earner / business owner
        {'income': 1250000.0, 'spendLimit': 350000.0, 'expectedSurplus': 900000.0},
        // User chooses to allocate 100% to spend (0 surplus)
        {'income': 25000.0, 'spendLimit': 25000.0, 'expectedSurplus': 0.0},
        // User chooses conservative spending (all surplus)
        {'income': 50000.0, 'spendLimit': 5000.0, 'expectedSurplus': 45000.0},
      ];

      for (final scenario in dynamicUserScenarios) {
        final double userChosenIncome = scenario['income']!;
        final double userChosenLimit = scenario['spendLimit']!;
        final double expectedSurplus = scenario['expectedSurplus']!;

        await state.setUserPayBudget(
          income: userChosenIncome,
          spendLimit: userChosenLimit,
        );

        // Assert that the app accurately reflects the user's exact chosen figures
        expect(state.userPayIncome, userChosenIncome,
            reason: 'User income must match whatever the user decides, never hardcoded');
        expect(state.userPaySpendLimit, userChosenLimit,
            reason: 'User spend limit must match whatever the user decides, never hardcoded');
        expect(
          (state.surplusForOtherSections - expectedSurplus).abs() < 0.001,
          isTrue,
          reason: 'Surplus calculation must dynamically adapt to any user amount',
        );

        // Verify persistence accurately stores the user-specified figures
        final prefs = await SharedPreferences.getInstance();
        expect(prefs.getDouble('finpocket_user_pay_income_v1'), userChosenIncome);
        expect(prefs.getDouble('finpocket_user_pay_spend_limit_v1'), userChosenLimit);
      }
    });

    test('Spend limit breach detection adapts dynamically to any user-configured threshold', () async {
      final random = Random(42);
      AppConfig.environment = AppEnvironment.test;

      // Run multiple dynamic iterations with generated random amounts
      for (int i = 0; i < 5; i++) {
        SharedPreferences.setMockInitialValues({});
        final state = AppState();

        // User dynamically decides income and limit
        final double userIncome = 1000.0 + random.nextInt(90000) + (random.nextInt(100) / 100.0);
        final double userLimit = userIncome * (0.2 + (random.nextDouble() * 0.6)); // User decides 20% - 80%

        await state.setUserPayBudget(income: userIncome, spendLimit: userLimit);

        // A payment strictly below user limit should NOT breach
        final double safeAmount = userLimit * 0.5;
        expect(
          state.wouldExceedPaySpendLimit(safeAmount),
          isFalse,
          reason: 'Amount $safeAmount is under user limit $userLimit, must not exceed',
        );

        // An exact limit amount should NOT breach (it equals the limit)
        expect(
          state.wouldExceedPaySpendLimit(userLimit),
          isFalse,
          reason: 'Amount exactly matching user limit must be allowed',
        );

        // An amount even 0.01 over the user-chosen limit MUST breach
        final double overAmount = userLimit + 0.01;
        expect(
          state.wouldExceedPaySpendLimit(overAmount),
          isTrue,
          reason: 'Amount $overAmount exceeds user limit $userLimit by 1 cent, must trigger warning',
        );

        // Clear dynamic budget
        await state.clearUserPayBudget();
        expect(state.userPayIncome, isNull);
        expect(state.userPaySpendLimit, isNull);
        expect(state.surplusForOtherSections, 0.0);
      }
    });

    test('When user chooses no spending limit, the app allows unlimited user spending freedom', () async {
      SharedPreferences.setMockInitialValues({});
      AppConfig.environment = AppEnvironment.test;
      final state = AppState();

      // User has not set any spend limit (null or 0)
      expect(state.userPaySpendLimit, isNull);

      // Arbitrary large transactions should never trigger budget limit warnings
      expect(state.wouldExceedPaySpendLimit(100.0), isFalse);
      expect(state.wouldExceedPaySpendLimit(50000.0), isFalse);
      expect(state.wouldExceedPaySpendLimit(9999999.0), isFalse);
    });
  });
}
