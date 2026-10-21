import 'package:flutter_test/flutter_test.dart';
import 'package:finpocket_app/providers/app_state.dart';
import 'package:finpocket_app/models/models.dart';
import 'package:finpocket_app/services/voice_expense_parser_service.dart';
import 'package:finpocket_app/services/receipt_splitter_service.dart';
import 'package:finpocket_app/services/subscription_radar_service.dart';
import 'package:finpocket_app/services/tts_service.dart';
import 'package:finpocket_app/services/bank_sms_parser_service.dart';

import 'package:shared_preferences/shared_preferences.dart';
import 'package:finpocket_app/config/app_config.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  setUp(() {
    SharedPreferences.setMockInitialValues({});
    AppConfig.environment = AppEnvironment.test;
  });

  group('1. Smart Impulse Guard & Real-Time Spend Impact Predictor Tests', () {
    late AppState state;

    setUp(() {
      SharedPreferences.setMockInitialValues({});
      AppConfig.environment = AppEnvironment.test;
      state = AppState();
    });

    test('Identifies safe small transactions without cooling-off trigger', () {
      final analysis = state.analyzeSpendImpact(120.0, category: TransactionCategory.Food);
      expect(analysis.severity, SpendImpactSeverity.safe);
      expect(analysis.requiresCoolingOff, isFalse);
      expect(analysis.safeToSpendAfter, lessThanOrEqualTo(analysis.currentSafeToSpend));
    });

    test('Triggers Impulse Warning & Cooling-Off on large discretionary spends', () {
      // Threshold is 1500
      final analysis = state.analyzeSpendImpact(2400.0, category: TransactionCategory.Shopping);
      expect(analysis.severity, SpendImpactSeverity.impulseWarning);
      expect(analysis.requiresCoolingOff, isTrue);
      expect(analysis.daysGoalDelayed, greaterThan(0));
      expect(analysis.message, contains('Large discretionary purchase'));
    });

    test('Correctly calculates month-end buffer drop percentage', () {
      final analysis = state.analyzeSpendImpact(5000.0, category: TransactionCategory.Entertainment);
      expect(analysis.safeToSpendDropPercent, greaterThan(0.0));
      expect(analysis.daysGoalDelayed, greaterThan(1));
    });
  });

  group('2. Autonomous UPI Round-Up Vault (Spare Change Micro-Savings) Tests', () {
    late AppState state;

    setUp(() {
      state = AppState();
    });

    test('Rounds up ₹87 to ₹90 (+₹3 spare change)', () {
      final spare = state.calculateRoundUp(87.0);
      expect(spare, 3.0);
    });

    test('Rounds up ₹341 to ₹350 (+₹9 spare change)', () {
      final spare = state.calculateRoundUp(341.0);
      expect(spare, 9.0);
    });

    test('Exact multiple of ₹10 (e.g. ₹100) generates ₹10 spare change saving', () {
      final spare = state.calculateRoundUp(100.0);
      expect(spare, 10.0);
    });

    test('Accumulates round-ups on successful payments and increments count', () async {
      final initialTotal = state.accumulatedRoundUps;
      final initialCount = state.roundUpTransactionsCount;

      final added = await state.applyRoundUpForPayment(85.0); // +5
      expect(added, 5.0);
      expect(state.accumulatedRoundUps, initialTotal + 5.0);
      expect(state.roundUpTransactionsCount, initialCount + 1);
    });

    test('Withdrawing round-up vault restores bank balance and resets vault', () async {
      await state.applyRoundUpForPayment(43.0); // +7
      final beforeWithdraw = state.accumulatedRoundUps;
      expect(beforeWithdraw, greaterThan(0));

      final balanceBefore = state.safeToSpend.safeToSpend;
      await state.withdrawRoundUpVaultToBank();

      expect(state.accumulatedRoundUps, 0.0);
      expect(state.safeToSpend.safeToSpend, balanceBefore + beforeWithdraw);
    });
  });

  group('3. Ghost Subscription & Auto-Debit Radar Tests', () {
    test('Calculates annual drain correctly for 30-day recurring mandates', () {
      final sub = GhostSubscription(
        id: 'test_sub',
        name: 'Netflix 4K',
        amount: 649.0,
        cadenceDays: 30,
        lastDebitedDate: DateTime.now().subtract(const Duration(days: 28)),
        nextEstimatedDate: DateTime.now().add(const Duration(hours: 30)),
      );

      expect(sub.isDueWithin48Hours, isTrue);
      expect(sub.annualDrain, closeTo(649.0 * 12.16, 5.0));
    });

    test('Detects due within 48 hours mandate', () {
      final now = DateTime.now();
      final subDueSoon = GhostSubscription(
        id: 'due_soon',
        name: 'Prime Video',
        amount: 299.0,
        lastDebitedDate: now.subtract(const Duration(days: 29)),
        nextEstimatedDate: now.add(const Duration(hours: 20)),
      );

      final subNotDue = GhostSubscription(
        id: 'not_due',
        name: 'Spotify',
        amount: 119.0,
        lastDebitedDate: now.subtract(const Duration(days: 10)),
        nextEstimatedDate: now.add(const Duration(days: 20)),
      );

      expect(subDueSoon.isDueWithin48Hours, isTrue);
      expect(subNotDue.isDueWithin48Hours, isFalse);
    });

    test('SubscriptionRadarService computes total annual drain', () {
      final subs = [
        GhostSubscription(
          id: '1', name: 'Netflix', amount: 649.0,
          lastDebitedDate: DateTime.now(), nextEstimatedDate: DateTime.now(),
        ),
        GhostSubscription(
          id: '2', name: 'Spotify', amount: 119.0,
          lastDebitedDate: DateTime.now(), nextEstimatedDate: DateTime.now(),
        ),
      ];
      final total = SubscriptionRadarService.calculateTotalAnnualDrain(subs);
      expect(total, greaterThan(768.0 * 12));
    });
  });

  group('4. AI Receipt Lens & Auto-Splitter Tests', () {
    test('Parses items, tax, and calculates individual friend shares', () {
      const receipt = '''
Royal Dine
Paneer Butter Masala 340.00
Butter Naan 160.00
Chicken Biryani 380.00
Lime Soda 120.00
Subtotal 1000.00
GST 50.00
''';
      final res = ReceiptSplitterService.parseAndCalculateSplit(
        rawText: receipt,
        friends: ['Me', 'Rahul', 'Priya'],
        myVpa: 'myvpa@upi',
        myName: 'Dinesh',
      );

      expect(res.subtotal, 1000.0);
      expect(res.taxesAndCharges, 50.0);
      expect(res.totalAmount, 1050.0);
      expect(res.items.length, 4);

      // Total of individual shares equals grand total
      final totalShares = res.individualShares.values.fold(0.0, (s, v) => s + v);
      expect(totalShares, closeTo(1050.0, 1.0));
    });

    test('Generates valid NPCI UPI payment deep-link with amount and note', () {
      final res = ReceiptSplitterService.parseAndCalculateSplit(
        rawText: 'Pizza 600',
        friends: ['Me', 'Rahul'],
        myVpa: 'dinesh@okaxis',
        myName: 'Dinesh',
      );

      final upiLink = res.getUpiRequestLinkFor('Rahul');
      expect(upiLink, startsWith('upi://pay?pa=dinesh@okaxis'));
      expect(upiLink, contains('am=300.00'));
      expect(upiLink, contains('cu=INR'));
    });

    test('Generates pre-formatted WhatsApp share text with item breakdown', () {
      final res = ReceiptSplitterService.parseAndCalculateSplit(
        rawText: 'Burger 200',
        friends: ['Me', 'Amit'],
        myVpa: 'dinesh@upi',
        myName: 'Dinesh',
      );

      final waText = res.getWhatsAppShareText();
      expect(waText, contains('FinPocket AI Bill Split'));
      expect(waText, contains('Amit'));
      expect(waText, contains('upi://pay'));
    });
  });

  group('5. Voice-Activated Cash & Offline Ledger Tests', () {
    test('Parses English cash expense phrase accurately', () {
      final intent = VoiceExpenseParserService.parseTranscript('Paid 50 rupees for chai');
      expect(intent.isValid, isTrue);
      expect(intent.amount, 50.0);
      expect(intent.category, TransactionCategory.Food);
      expect(intent.paymentMethod, 'CASH');
    });

    test('Parses Transport & Auto with cash specification', () {
      final intent = VoiceExpenseParserService.parseTranscript('Auto 120 rupees cash');
      expect(intent.isValid, isTrue);
      expect(intent.amount, 120.0);
      expect(intent.category, TransactionCategory.Travel);
      expect(intent.paymentMethod, 'CASH');
    });

    test('Parses Hindi / Hinglish phrases (Chai aur samosa 60 rupay)', () {
      final intent = VoiceExpenseParserService.parseTranscript('Chai aur samosa 60 rupay');
      expect(intent.isValid, isTrue);
      expect(intent.amount, 60.0);
      expect(intent.category, TransactionCategory.Food);
    });

    test('Detects online / UPI when mentioned in voice command', () {
      final intent = VoiceExpenseParserService.parseTranscript('Petrol 300 rupees UPI');
      expect(intent.isValid, isTrue);
      expect(intent.amount, 300.0);
      expect(intent.category, TransactionCategory.Travel);
      expect(intent.paymentMethod, 'UPI');
    });
  });

  group('6. Ghost / Stealth Mode (Privacy in Public) Tests', () {
    late AppState state;

    setUp(() {
      state = AppState();
    });

    test('Toggling Stealth Mode alters mask outputs', () {
      expect(state.isStealthMode, isFalse);
      expect(state.maskCurrency(25000.0), '₹25000');
      expect(state.maskText('Secret Recipient'), 'Secret Recipient');

      state.toggleStealthMode();

      expect(state.isStealthMode, isTrue);
      expect(state.maskCurrency(25000.0), '₹ ••••••');
      expect(state.maskText('Secret Recipient'), '••••••');

      state.toggleStealthMode();
      expect(state.isStealthMode, isFalse);
      expect(state.maskCurrency(25000.0), '₹25000');
    });
  });

  group('7. On-Device UPI Audio Soundbox (Pocket Soundbox) Tests', () {
    final tts = TtsService();

    test('Generates debit announcement in English and Telugu', () {
      final textEn = tts.getSoundboxNarration(
        lang: SupportedLanguage.en,
        amount: 250.0,
        party: 'Swiggy',
        isCredit: false,
      );
      expect(textEn, contains('250'));
      expect(textEn, contains('Swiggy'));
      expect(textEn, contains('paid'));

      final textTe = tts.getSoundboxNarration(
        lang: SupportedLanguage.te,
        amount: 500.0,
        party: 'రమేష్',
        isCredit: false,
      );
      expect(textTe, contains('500'));
      expect(textTe, contains('రమేష్'));
      expect(textTe, contains('చెల్లించబడ్డాయి'));
    });

    test('Generates credit announcement in Hindi and English', () {
      final textHi = tts.getSoundboxNarration(
        lang: SupportedLanguage.hi,
        amount: 1500.0,
        party: 'राहुल',
        isCredit: true,
      );
      expect(textHi, contains('1500'));
      expect(textHi, contains('राहुल'));
      expect(textHi, contains('प्राप्त हुए'));

      final textEn = tts.getSoundboxNarration(
        lang: SupportedLanguage.en,
        amount: 1500.0,
        party: 'Rahul',
        isCredit: true,
      );
      expect(textEn, contains('received'));
    });
  });

  group('8. Credit Card "Minimum Due Trap" Buster Tests', () {
    test('Calculates compound interest trap penalty and payoff months accurately', () {
      final stmt = CreditCardStatement(
        id: 'cc_test',
        bankName: 'HDFC Bank Millennia',
        cardLast4: '4821',
        totalAmountDue: 24500.0,
        minimumAmountDue: 1250.0,
        dueDate: DateTime.now().add(const Duration(days: 10)),
      );

      expect(stmt.daysRemaining, inInclusiveRange(9, 10));
      expect(stmt.trapInterestCost, greaterThan(10000.0));
      expect(stmt.monthsToPayoffMinOnly, greaterThanOrEqualTo(36));
      expect(stmt.defaultUpiVpa, contains('4821@hdfcbank'));
    });

    test('Parses real HDFC Bank Credit Card Statement SMS', () {
      const smsBody = 'Your HDFC Bank Credit Card ending 4821 statement for Oct 2026 is generated. Total Amt Due: Rs 24,500.00, Min Amt Due: Rs 1,250.00, Due Date: 25-Oct-2026. Pay now to avoid charges.';
      final parsed = BankSmsParserService.parseCreditCardStatement(
        address: 'HDFCBK',
        body: smsBody,
      );

      expect(parsed, isNotNull);
      expect(parsed!.cardLast4, '4821');
      expect(parsed.totalAmountDue, 24500.0);
      expect(parsed.minimumAmountDue, 1250.0);
      expect(parsed.bankName, contains('HDFC'));
    });

    test('Parses SBI Card Statement SMS', () {
      const smsBody = 'SBI Card ending 1098: Total Amt Due is Rs 12,800. Min Amt Due is Rs 640 payable by 20-Oct-2026. Pay easily via UPI.';
      final parsed = BankSmsParserService.parseCreditCardStatement(
        address: 'SBICRD',
        body: smsBody,
      );

      expect(parsed, isNotNull);
      expect(parsed!.cardLast4, '1098');
      expect(parsed.totalAmountDue, 12800.0);
      expect(parsed.minimumAmountDue, 640.0);
    });
  });

  group('9. No-Spend Streak & Gamification Tests', () {
    test('Computes streak tiers and level names correctly', () {
      final starter = NoSpendStreakData(currentStreak: 1);
      expect(starter.streakTier, 0);
      expect(starter.streakTierName, contains('Starter'));

      final bronze = NoSpendStreakData(currentStreak: 4);
      expect(bronze.streakTier, 1);
      expect(bronze.streakTierName, contains('Bronze'));

      final gold = NoSpendStreakData(currentStreak: 15);
      expect(gold.streakTier, 3);
      expect(gold.streakTierName, contains('Gold'));

      final legend = NoSpendStreakData(currentStreak: 35);
      expect(legend.streakTier, 4);
      expect(legend.streakTierName, contains('Legend'));
    });
  });
}

