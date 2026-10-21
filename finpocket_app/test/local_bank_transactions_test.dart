import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:finpocket_app/models/models.dart';
import 'package:finpocket_app/services/local_transaction_storage_service.dart';
import 'package:finpocket_app/services/bank_sms_parser_service.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  setUp(() {
    SharedPreferences.setMockInitialValues({});
  });

  group('Local Transaction Storage Tests', () {
    test('1. Local vault consent defaults and toggles correctly', () async {
      expect(await LocalTransactionStorageService.isVaultConsentGranted(), false);

      await LocalTransactionStorageService.setVaultConsent(true);
      expect(await LocalTransactionStorageService.isVaultConsentGranted(), true);

      await LocalTransactionStorageService.setSmsSyncConsent(true);
      expect(await LocalTransactionStorageService.isSmsSyncConsentGranted(), true);
    });

    test('2. Transactions save, load, and deduplicate locally without loss', () async {
      final initialTxns = await LocalTransactionStorageService.loadLocalTransactions();
      expect(initialTxns, isEmpty);

      final txn1 = Transaction(
        id: 'tx_local_101',
        userId: 'usr_local',
        sender: 'User',
        receiver: 'Starbucks Coffee',
        amount: 350.0,
        type: TransactionType.EXPENSE,
        category: TransactionCategory.Food,
        status: TransactionStatus.SUCCESSFUL,
        timestamp: DateTime(2026, 10, 8, 14, 30),
        referenceId: 'UPI/20261008/101',
        description: 'Payment to Starbucks Coffee',
      );

      await LocalTransactionStorageService.addOrUpdateTransaction(txn1);

      final loaded = await LocalTransactionStorageService.loadLocalTransactions();
      expect(loaded.length, 1);
      expect(loaded.first.id, 'tx_local_101');
      expect(loaded.first.receiver, 'Starbucks Coffee');
      expect(loaded.first.amount, 350.0);

      // Adding the same transaction should update, not duplicate
      final txn1Updated = Transaction(
        id: 'tx_local_101',
        userId: 'usr_local',
        sender: 'User',
        receiver: 'Starbucks Reserve',
        amount: 380.0,
        type: TransactionType.EXPENSE,
        category: TransactionCategory.Food,
        status: TransactionStatus.SUCCESSFUL,
        timestamp: DateTime(2026, 10, 8, 14, 35),
        referenceId: 'UPI/20261008/101',
        description: 'Payment to Starbucks Reserve',
      );

      await LocalTransactionStorageService.addOrUpdateTransaction(txn1Updated);
      final loadedAfterUpdate = await LocalTransactionStorageService.loadLocalTransactions();
      expect(loadedAfterUpdate.length, 1);
      expect(loadedAfterUpdate.first.receiver, 'Starbucks Reserve');
      expect(loadedAfterUpdate.first.amount, 380.0);
    });

    test('3. Merge remote and local transactions preserves local additions', () async {
      final localTxn = Transaction(
        id: 'tx_local_only',
        userId: 'usr_local',
        sender: 'User',
        receiver: 'Local Grocery',
        amount: 520.0,
        type: TransactionType.EXPENSE,
        category: TransactionCategory.Food,
        status: TransactionStatus.SUCCESSFUL,
        timestamp: DateTime(2026, 10, 8, 10, 0),
        referenceId: 'REF_LOCAL_99',
        description: 'Grocery store offline payment',
      );

      await LocalTransactionStorageService.addOrUpdateTransaction(localTxn);

      final serverTxns = [
        Transaction(
          id: 'tx_server_1',
          userId: 'usr_local',
          sender: 'Employer Corp',
          receiver: 'User',
          amount: 55000.0,
          type: TransactionType.INCOME,
          category: TransactionCategory.Salary,
          status: TransactionStatus.SUCCESSFUL,
          timestamp: DateTime(2026, 10, 1, 9, 0),
          referenceId: 'REF_SRV_1',
          description: 'Monthly Salary',
        ),
      ];

      final merged = await LocalTransactionStorageService.mergeWithLocalTransactions(serverTxns);
      expect(merged.length, 2);
      expect(merged.any((t) => t.id == 'tx_local_only'), isTrue);
      expect(merged.any((t) => t.id == 'tx_server_1'), isTrue);
    });
  });

  group('Bank SMS Parser Tests', () {
    test('1. Parses HDFC Bank debit SMS with amount, merchant, and account', () {
      const smsBody = 'Dear Customer, Rs.1499.00 has been debited from your A/c ending 4821 at Amazon Pay on 08-OCT-26. Avl Bal: INR 48,250.00. Ref: 261008982312';
      final parsed = BankSmsParserService.parseSms(
        address: 'VK-HDFCBK',
        body: smsBody,
      );

      expect(parsed, isNotNull);
      expect(parsed!.bankName, 'HDFC Bank');
      expect(parsed.transaction.amount, 1499.0);
      expect(parsed.transaction.type, TransactionType.EXPENSE);
      expect(parsed.transaction.category, TransactionCategory.Shopping);
      expect(parsed.maskedAccount, '•••• 4821');
      expect(parsed.availableBalanceAfter, 48250.0);
      expect(parsed.transaction.referenceId, '261008982312');
    });

    test('2. Parses State Bank of India credit SMS with salary income', () {
      const smsBody = 'Your A/c ending with XX1042 has been credited by Rs 55,000.00 on 01/10/2026 by Salary payroll. Avail Bal is Rs 82,410.00 -SBI';
      final parsed = BankSmsParserService.parseSms(
        address: 'AD-SBINB',
        body: smsBody,
      );

      expect(parsed, isNotNull);
      expect(parsed!.bankName, 'State Bank of India');
      expect(parsed.transaction.amount, 55000.0);
      expect(parsed.transaction.type, TransactionType.INCOME);
      expect(parsed.transaction.category, TransactionCategory.Salary);
      expect(parsed.maskedAccount, '•••• 1042');
      expect(parsed.availableBalanceAfter, 82410.0);
    });

    test('3. Parses ICICI Bank dining expense correctly', () {
      const smsBody = 'INR 850.00 spent on ICICI Bank Card ending 9012 at Swiggy on 08-Oct-26. Avl Limit: INR 1,25,000.00.';
      final parsed = BankSmsParserService.parseSms(
        address: 'VM-ICICIB',
        body: smsBody,
      );

      expect(parsed, isNotNull);
      expect(parsed!.bankName, 'ICICI Bank');
      expect(parsed.transaction.amount, 850.0);
      expect(parsed.transaction.type, TransactionType.EXPENSE);
      expect(parsed.transaction.category, TransactionCategory.Food);
      expect(parsed.maskedAccount, '•••• 9012');
    });

    test('4. Safely ignores non-transactional messages (OTPs, personal SMS)', () {
      const otpSms = 'Your FinPocket verification OTP is 482910. Do not share this OTP with anyone.';
      final parsedOtp = BankSmsParserService.parseSms(
        address: 'VM-FINPCK',
        body: otpSms,
      );
      expect(parsedOtp, isNull);

      const personalSms = 'Hey bro, are we meeting for lunch at 1 PM today?';
      final parsedPersonal = BankSmsParserService.parseSms(
        address: '+919876543210',
        body: personalSms,
      );
      expect(parsedPersonal, isNull);
    });

    test('5. Credit SMS names WHO sent the money, not "Me (Bank Account)"', () {
      const smsBody =
          'Rs.2,500.00 credited to a/c XX4821 from Ramesh Kumar via UPI Ref 431234567890 on 08-OCT-26. Avl Bal: INR 50,750.00';
      final parsed = BankSmsParserService.parseSms(
        address: 'VK-HDFCBK',
        body: smsBody,
      );

      expect(parsed, isNotNull);
      expect(parsed!.transaction.type, TransactionType.INCOME);
      expect(parsed.transaction.sender, 'Ramesh Kumar');
      expect(parsed.transaction.receiver, 'Me (HDFC Bank)');
      expect(parsed.transaction.referenceId, '431234567890');
      expect(parsed.availableBalanceAfter, 50750.0);
    });

    test('6. Salary credit names the payer, and never an amount as a person', () {
      const smsBody =
          'Your A/c ending with XX1042 has been credited by Rs 55,000.00 on 01/10/2026 by Salary payroll. Avail Bal is Rs 82,410.00 -SBI';
      final parsed = BankSmsParserService.parseSms(
        address: 'VM-SBIINB',
        body: smsBody,
      );

      expect(parsed, isNotNull);
      expect(parsed!.transaction.type, TransactionType.INCOME);
      // The first "by" is followed by the amount — that must be rejected and
      // the real payer taken instead.
      expect(parsed.transaction.sender, 'Salary payroll');
      expect(parsed.transaction.sender.contains('55,000'), isFalse);
      expect(parsed.transaction.category, TransactionCategory.Salary);
    });

    test('7. Credit without a named sender falls back honestly', () {
      const smsBody =
          'Rs.1,000.00 has been credited to your A/c ending 4821. Avl Bal: INR 51,750.00. Ref: 99887766';
      final parsed = BankSmsParserService.parseSms(
        address: 'VK-HDFCBK',
        body: smsBody,
      );

      expect(parsed, isNotNull);
      expect(parsed!.transaction.type, TransactionType.INCOME);
      expect(parsed.transaction.sender, 'Bank Deposit / Transfer');
      expect(parsed.transaction.referenceId, '99887766');
    });

    // Real bodies from the user's own handset (Indian Bank, sender ID
    // *-INDBNK-S) — the bank the old four-bank picker did not contain.
    test('8. Indian Bank debit names the payee even when it ends with .RRN', () {
      const smsBody =
          'Sent Rs.10.00 from A/c *7735 on 08-10-26 to Impact Guru Technology Venture.RRN '
          '628168613199.Avl Bal Rs.151.00.Not you?SMS BLOCK to 9289592895-Indian Bank';
      final parsed = BankSmsParserService.parseSms(
        address: 'AX-INDBNK-S',
        body: smsBody,
      );

      expect(parsed, isNotNull);
      expect(parsed!.bankName, 'Indian Bank');
      expect(parsed.transaction.type, TransactionType.EXPENSE);
      expect(parsed.transaction.receiver, 'Impact Guru Technology Venture');
      expect(parsed.transaction.referenceId, '628168613199');
      expect(parsed.availableBalanceAfter, 151.0);
    });

    test('9. Indian Bank credit names the payer and mirrors the real balance', () {
      const smsBody =
          'Your A/c *7735 is credited with Rs.2.00 on 09-10-26 by Mr Sureddy Dinesh Reddy. '
          'RRN 188091254108. Available balance is Rs. 154.00 - Indian Bank';
      final parsed = BankSmsParserService.parseSms(
        address: 'VM-INDBNK-S',
        body: smsBody,
      );

      expect(parsed, isNotNull);
      expect(parsed!.bankName, 'Indian Bank');
      expect(parsed.transaction.type, TransactionType.INCOME);
      expect(parsed.transaction.sender, 'Mr Sureddy Dinesh Reddy');
      expect(parsed.transaction.receiver, 'Me (Indian Bank)');
      expect(parsed.transaction.referenceId, '188091254108');
      expect(parsed.availableBalanceAfter, 154.0);
    });

    test('10. Strictly rejects Meesho loan offer SMS (JM-MEESHO-P)', () {
      const meeshoSms =
          'Get a personal loan of Rs. 3,000 on Meesho sent directly to your bank account. Check your offer now: https://ltl.sh/1z15jfkk5d6';
      final parsed = BankSmsParserService.parseSms(
        address: 'JM-MEESHO-P',
        body: meeshoSms,
      );

      // Must be null — NOT an official bank, has -P promotional suffix, marketing loan phrasing, and shortener link!
      expect(parsed, isNull);
    });

    test('11. Rejects promotional DLT senders and marketing loan ads', () {
      // E-commerce & marketing senders with -P
      expect(
        BankSmsParserService.parseSms(
          address: 'VK-FLPKRT-P',
          body: 'Pre-approved loan of Rs. 50,000 credited to wallet. Claim now: bit.ly/test',
        ),
        isNull,
      );

      // Non-bank sender claiming personal loan
      expect(
        BankSmsParserService.parseSms(
          address: 'AD-BAJAJF-P',
          body: 'Congratulations! Instant personal loan of Rs. 1,00,000 approved. Apply now.',
        ),
        isNull,
      );

      // Random mobile number sending transaction claim
      expect(
        BankSmsParserService.parseSms(
          address: '+919876543210',
          body: 'Sent Rs. 3000 to your bank account. Check offer.',
        ),
        isNull,
      );
    });

    test('12. LocalTransactionStorageService cleans and purges old spam transactions', () {
      final badTxn = Transaction(
        id: 'tx_sms_SMS_1792062335664_3000',
        userId: 'usr_local',
        sender: 'Me (Bank Account)',
        receiver: 'Bank Account',
        amount: 3000.0,
        type: TransactionType.EXPENSE,
        category: TransactionCategory.EMI,
        status: TransactionStatus.SUCCESSFUL,
        timestamp: DateTime.now(),
        referenceId: 'SMS_1792062335664_3000',
        description: 'Bank Account A/c Debit: Bank Account',
        paymentMethod: 'Bank Transfer',
      );

      expect(LocalTransactionStorageService.isInvalidOrSpamTransaction(badTxn), isTrue);

      final realTxn = Transaction(
        id: 'tx_sms_188091254108',
        userId: 'usr_local',
        sender: 'Mr Sureddy Dinesh Reddy',
        receiver: 'Me (Indian Bank)',
        amount: 2.0,
        type: TransactionType.INCOME,
        category: TransactionCategory.Other,
        status: TransactionStatus.SUCCESSFUL,
        timestamp: DateTime.now(),
        referenceId: '188091254108',
        description: 'Indian Bank •••• 7735 Credit: Mr Sureddy Dinesh Reddy',
        paymentMethod: 'UPI',
      );

      expect(LocalTransactionStorageService.isInvalidOrSpamTransaction(realTxn), isFalse);
    });

    test('13. Parses Indian Bank P2P debit to UPI VPA handle (7382224476ptyes)', () {
      const smsBody =
          'Sent Rs.500.00 from A/c *7735 on 14-10-26 to 7382224476ptyes.RRN 450278654384.Avl Bal Rs.23.00.Not you?SMS BLOCK to 9289592895-Indian Bank';
      final parsed = BankSmsParserService.parseSms(
        address: 'VM-INDBNK-S',
        body: smsBody,
      );

      expect(parsed, isNotNull);
      expect(parsed!.bankName, 'Indian Bank');
      expect(parsed.transaction.amount, 500.0);
      expect(parsed.transaction.type, TransactionType.EXPENSE);
      expect(parsed.transaction.receiver, '7382224476ptyes');
      expect(parsed.transaction.referenceId, '450278654384');
      expect(parsed.availableBalanceAfter, 23.0);
    });

    test('14. Parses Indian Bank P2P credit by mobile-linked account (9XXXXXX43210)', () {
      const smsBody =
          'Your a/c. XXXX7735 is credited by Rs. 1.00 on 14-10-26 by a/c linked to mobile 9XXXXXX43210 (IMPS Ref no. 628718993953). -IndianBank';
      final parsed = BankSmsParserService.parseSms(
        address: 'VM-INDBNK-S',
        body: smsBody,
      );

      expect(parsed, isNotNull);
      expect(parsed!.bankName, 'Indian Bank');
      expect(parsed.transaction.amount, 1.0);
      expect(parsed.transaction.type, TransactionType.INCOME);
      expect(parsed.transaction.sender.toLowerCase(), contains('mobile 9xxxxxx43210'));
      expect(parsed.transaction.referenceId, '628718993953');
    });
  });
}
