import 'package:flutter_test/flutter_test.dart';
import 'package:finpocket_app/models/models.dart';
import 'package:finpocket_app/features/financial_twin/twin_engine.dart';
import 'package:finpocket_app/features/financial_twin/twin_models.dart';
import 'package:finpocket_app/features/financial_health/health_score_engine.dart';
import 'package:finpocket_app/features/spend_guard/spend_guard_engine.dart';
import 'package:finpocket_app/features/spend_guard/spend_guard_models.dart';

void main() {
  group('AI Personal Finance OS Engine Tests', () {
    late List<BankAccount> mockAccounts;
    late List<Transaction> mockTransactions;
    late List<RecurringPayment> mockBills;
    late List<SavingsGoal> mockGoals;

    setUp(() {
      final now = DateTime.now();

      mockAccounts = [
        BankAccount(
          id: 'acc_1',
          bankName: 'HDFC Bank',
          accountType: 'SAVINGS',
          maskedAccountNumber: 'XXXX1234',
          availableBalance: 85000.0,
          isPrimary: true,
          lastSynced: now,
        ),
        BankAccount(
          id: 'acc_2',
          bankName: 'ICICI Bank',
          accountType: 'SAVINGS',
          maskedAccountNumber: 'XXXX5678',
          availableBalance: 25000.0,
          isPrimary: false,
          lastSynced: now,
        ),
      ];

      mockTransactions = [
        Transaction(
          id: 'tx_1',
          userId: 'u1',
          sender: 'Employer Corp',
          receiver: 'User',
          amount: 90000.0,
          type: TransactionType.INCOME,
          category: TransactionCategory.Salary,
          status: TransactionStatus.SUCCESSFUL,
          timestamp: now.subtract(const Duration(days: 5)),
          referenceId: 'ref_inc_1',
          description: 'Monthly Salary',
        ),
        Transaction(
          id: 'tx_2',
          userId: 'u1',
          sender: 'User',
          receiver: 'Landlord',
          amount: 22000.0,
          type: TransactionType.EXPENSE,
          category: TransactionCategory.Rent,
          status: TransactionStatus.SUCCESSFUL,
          timestamp: now.subtract(const Duration(days: 4)),
          referenceId: 'ref_exp_1',
          description: 'Apartment Rent',
        ),
        Transaction(
          id: 'tx_3',
          userId: 'u1',
          sender: 'User',
          receiver: 'Supermarket',
          amount: 4500.0,
          type: TransactionType.EXPENSE,
          category: TransactionCategory.Food,
          status: TransactionStatus.SUCCESSFUL,
          timestamp: now.subtract(const Duration(days: 2)),
          referenceId: 'ref_exp_2',
          description: 'Groceries',
        ),
      ];

      mockBills = [
        RecurringPayment(
          id: 'bill_1',
          name: 'Electricity Bill',
          amount: 2500.0,
          dueDate: now.add(const Duration(days: 10)),
          category: 'Utilities',
          isPaidThisMonth: false,
        ),
        RecurringPayment(
          id: 'bill_2',
          name: 'Broadband Fiber',
          amount: 1199.0,
          dueDate: now.add(const Duration(days: 15)),
          category: 'Internet',
          isPaidThisMonth: false,
        ),
      ];

      mockGoals = [
        SavingsGoal(
          id: 'goal_1',
          userId: 'u1',
          name: 'Emergency Fund',
          targetAmount: 150000.0,
          currentAmount: 60000.0,
          targetDate: now.add(const Duration(days: 180)),
          monthlyContribution: 15000.0,
          category: 'Emergency',
          createdAt: now.subtract(const Duration(days: 90)),
        ),
      ];
    });

    test('1. Financial Twin Engine computes realistic runway and 90-day trajectory', () {
      final twin = FinancialTwinEngine.generateProjection(
        accounts: mockAccounts,
        transactions: mockTransactions,
        bills: mockBills,
        goals: mockGoals,
      );

      expect(twin.currentLiquidBalance, equals(110000.0));
      expect(twin.runwayDays, greaterThan(30));
      expect(twin.riskTier, equals(LiquidityRiskTier.low));
      expect(twin.safeToSpendMonthly, greaterThan(0));
      expect(twin.forecastPoints.length, greaterThanOrEqualTo(10));
    });

    test('2. What-If Lab Simulation accurately projects runway delta and goal impact', () {
      final baseline = FinancialTwinEngine.generateProjection(
        accounts: mockAccounts,
        transactions: mockTransactions,
        bills: mockBills,
        goals: mockGoals,
      );

      const scenario = WhatIfScenario(
        id: 'sim_phone',
        title: 'New Smartphone',
        description: 'Flagship phone purchase',
        type: ScenarioType.largePurchase,
        amount: 50000.0,
      );

      final sim = FinancialTwinEngine.simulateScenario(
        baseline: baseline,
        scenario: scenario,
        goals: mockGoals,
      );

      expect(sim.projectedRunwayDays, lessThan(sim.baselineRunwayDays));
      expect(sim.runwayDeltaDays, lessThan(0));
      expect(sim.actionableAdvice.isNotEmpty, isTrue);
      expect(sim.projectedSafeToSpend, equals(baseline.safeToSpendMonthly - 50000.0));
    });

    test('3. Financial Health Engine evaluates multi-factor health score (0-1000)', () {
      final health = FinancialHealthEngine.calculate(
        accounts: mockAccounts,
        transactions: mockTransactions,
        bills: mockBills,
        goals: mockGoals,
      );

      expect(health.totalScore, inInclusiveRange(100, 1000));
      expect(health.factors.length, equals(5));
      expect(health.roadmap.isNotEmpty, isTrue);
      expect(health.tierLabel.isNotEmpty, isTrue);
    });

    test('4. Spend Guard Engine evaluates affordability levels accurately', () {
      // Small discretionary purchase -> Safe
      final safeEval = SpendGuardEngine.evaluate(
        requestedAmount: 1500.0,
        category: 'Dining',
        accounts: mockAccounts,
        transactions: mockTransactions,
        bills: mockBills,
        goals: mockGoals,
      );
      expect(safeEval.affordability, equals(SpendGuardAffordability.safe));
      expect(safeEval.remainingSafeToSpend, greaterThan(0));

      // Massive purchase -> Unaffordable / High Risk
      final riskyEval = SpendGuardEngine.evaluate(
        requestedAmount: 120000.0,
        category: 'Luxury',
        accounts: mockAccounts,
        transactions: mockTransactions,
        bills: mockBills,
        goals: mockGoals,
      );
      expect(riskyEval.affordability, equals(SpendGuardAffordability.unaffordable));
      expect(riskyEval.remainingSafeToSpend, lessThan(0));
    });
  });
}
