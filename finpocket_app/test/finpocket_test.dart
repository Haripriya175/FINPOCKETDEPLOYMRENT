import 'package:flutter_test/flutter_test.dart';
import 'package:finpocket_app/config/app_config.dart';
import 'package:finpocket_app/models/models.dart';
import 'package:finpocket_app/providers/app_state.dart';
import 'package:finpocket_app/services/ai_assistant_service.dart';

import 'package:shared_preferences/shared_preferences.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  group('FinPocket Flutter Core AppState & Logic Tests', () {
    late AppState state;

    setUp(() {
      SharedPreferences.setMockInitialValues({});
      AppConfig.environment = AppEnvironment.test;
      state = AppState();
    });

    test('1. Initial user & dynamic Safe-to-Spend calculations', () {
      expect(state.currentUser?.fullName, equals('Jithendra Sureddy'));
      expect(state.totalAvailableBalance, greaterThan(0));
      expect(state.safeToSpend.safeToSpend, greaterThan(0));
      expect(state.emergencyFund.currentAmount, equals(35000.0));
    });

    test('2. Failed payment records nothing (no fabricated ledger entry)', () async {
      // No server runs under `flutter test`, so the payment API call fails.
      // The app must report failure honestly: no fake SUCCESSFUL transaction,
      // no balance mutation, no persisted ledger row.
      final initialBalance = state.totalAvailableBalance;
      final initialCount = state.transactions.length;
      final success = await state.sendPayment(
        receiver: 'Test Contact',
        amount: 500.0,
        category: TransactionCategory.Food,
      );

      expect(success, isFalse);
      expect(state.transactions.length, initialCount);
      expect(state.totalAvailableBalance, initialBalance);
    });

    test('3. Child Care Mode payment blocking', () async {
      state.enableChildCare();
      expect(state.isChildCareActive, isTrue);

      final blocked = await state.sendPayment(
        receiver: 'Should Fail',
        amount: 200.0,
        category: TransactionCategory.Food,
      );

      expect(blocked, isFalse);
    });

    test('4. Emergency Fund Lock & Unlock audit log', () async {
      expect(state.emergencyFund.isLocked, isTrue);

      await state.toggleLockEmergencyFund(false);
      expect(state.emergencyFund.isLocked, isFalse);
    });

    test('5. AI Assistant deterministic query answering', () {
      final balanceAns = AIAssistantService.ask('How much money do I have?', state);
      expect(balanceAns.contains('₹'), isTrue);

      final spendAns = AIAssistantService.ask('How much did I spend this month?', state);
      expect(spendAns.contains('₹') || spendAns.contains('month'), isTrue);
    });

    test('6. BankAccount model classifies DEMO vs CONNECTED accounts', () {
      final mockAcct = BankAccount(
        id: 'bnk_mock_1',
        bankName: 'HDFC Demo',
        accountType: 'SAVINGS',
        maskedAccountNumber: '•••• 1234',
        availableBalance: 25000.0,
        providerType: 'MOCK',
        freshnessStatus: 'CURRENT',
        lastSynced: DateTime.now(),
      );
      expect(mockAcct.isDemo, isTrue);

      final liveAcct = BankAccount(
        id: 'bnk_live_1',
        bankName: 'State Bank of India',
        accountType: 'SAVINGS',
        maskedAccountNumber: '•••• 9876',
        availableBalance: 45000.0,
        providerType: 'ACCOUNT_AGGREGATOR',
        freshnessStatus: 'CURRENT',
        lastSynced: DateTime.now(),
      );
      expect(liveAcct.isDemo, isFalse);
    });

    test('7. External provider dataset freshness values', () {
      final staleAcct = BankAccount(
        id: 'bnk_stale_1',
        bankName: 'ICICI Bank',
        accountType: 'CURRENT',
        maskedAccountNumber: '•••• 5555',
        availableBalance: 12000.0,
        providerType: 'ACCOUNT_AGGREGATOR',
        freshnessStatus: 'STALE',
        lastSynced: DateTime.now().subtract(const Duration(hours: 36)),
      );
      expect(staleAcct.freshnessStatus, equals('STALE'));
    });

    test('8. AI Assistant rejects write/mutation requests', () {
      final payAns = AIAssistantService.ask('Transfer ₹5000 to John', state);
      expect(payAns.toLowerCase().contains('read-only') || payAns.toLowerCase().contains('cannot') || payAns.toLowerCase().contains('payments tab') || payAns.toLowerCase().contains('not authorized'), isTrue);
    });
  });
}
