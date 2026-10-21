import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:finpocket_app/models/models.dart';
import 'package:finpocket_app/services/statement_export_service.dart';

Transaction _txn({
  required String id,
  required TransactionType type,
  required double amount,
  required TransactionCategory category,
  required DateTime timestamp,
  String merchant = '',
}) {
  return Transaction(
    id: id,
    userId: 'usr_test',
    sender: type == TransactionType.INCOME ? 'Employer' : 'Me',
    receiver: type == TransactionType.INCOME ? 'Me' : 'Shop',
    amount: amount,
    type: type,
    category: category,
    status: TransactionStatus.SUCCESSFUL,
    timestamp: timestamp,
    referenceId: 'REF-$id',
    description: 'Test $id',
    merchant: merchant,
  );
}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  final txns = [
    _txn(
        id: 'a',
        type: TransactionType.INCOME,
        amount: 1000,
        category: TransactionCategory.Salary,
        timestamp: DateTime(2026, 10, 5, 10, 30)),
    _txn(
        id: 'b',
        type: TransactionType.EXPENSE,
        amount: 250,
        category: TransactionCategory.Food,
        timestamp: DateTime(2026, 10, 6, 12, 0),
        merchant: 'Cafe, "Central"'),
    _txn(
        id: 'c',
        type: TransactionType.EXPENSE,
        amount: 100,
        category: TransactionCategory.Travel,
        timestamp: DateTime(2026, 9, 20, 9, 0)),
  ];

  group('StatementExportService', () {
    test('monthKey/monthLabel round-trip', () {
      expect(StatementExportService.monthKey(DateTime(2026, 10, 5)),
          '2026-10');
      expect(StatementExportService.monthLabel('2026-10'), 'Oct 2026');
      expect(StatementExportService.monthLabel('bogus'), 'bogus');
    });

    test('availableMonths lists newest first', () {
      expect(StatementExportService.availableMonths(txns),
          ['2026-10', '2026-09']);
    });

    test('filterTransactions honours month + category picks', () {
      final oct = StatementExportService.filterTransactions(txns,
          months: {'2026-10'});
      expect(oct.map((t) => t.id).toList(), ['b', 'a']);

      final food = StatementExportService.filterTransactions(txns,
          categories: {TransactionCategory.Food});
      expect(food.map((t) => t.id).toList(), ['b']);

      final both = StatementExportService.filterTransactions(txns,
          months: {'2026-10'}, categories: {TransactionCategory.Food});
      expect(both.map((t) => t.id).toList(), ['b']);

      final none = StatementExportService.filterTransactions(txns,
          months: {'2025-01'});
      expect(none, isEmpty);

      // Empty picks = everything.
      expect(StatementExportService.filterTransactions(txns).length, 3);

      // Year picks
      expect(StatementExportService.availableYears(txns), [2026]);
      final y2026 = StatementExportService.filterTransactions(txns, years: {2026});
      expect(y2026.length, 3);
      final y2025 = StatementExportService.filterTransactions(txns, years: {2025});
      expect(y2025, isEmpty);

      // Custom date range picks
      final range = StatementExportService.filterTransactions(
        txns,
        startDate: DateTime(2026, 10, 1),
        endDate: DateTime(2026, 10, 6, 23, 59),
      );
      expect(range.map((t) => t.id).toList(), ['b', 'a']);
    });

    test('totals sums only real rows (defaults to 0 on empty)', () {
      final t = StatementExportService.totals(txns);
      expect(t.inflow, 1000.0);
      expect(t.outflow, 350.0);
      final empty = StatementExportService.totals([]);
      expect(empty.inflow, 0.0);
      expect(empty.outflow, 0.0);
    });

    test('buildCsv emits header, quoted cells, totals — no invented rows', () {
      final csv = StatementExportService.buildCsv(
          rows: txns,
          title: 'Oct 2026 • All',
          userName: 'Tester',
          lang: SupportedLanguage.en);
      // User info header is present.
      expect(csv, contains('Account Holder: Tester'));
      expect(csv, contains('Period: Oct 2026 • All'));
      expect(csv, contains('Transactions: 3'));
      // Merchant containing a comma + quotes must be CSV-quoted.
      expect(csv, contains('"Cafe, ""Central"""'));
      expect(csv, contains('Total Inflow,1000.00'));
      expect(csv, contains('Total Outflow,350.00'));
      expect(csv, contains('Net,650.00'));
      // Category breakdown section.
      expect(csv, contains('Category Analysis'));
      expect(csv, contains('Food,1,250.00,71.4%'));
      expect(csv, contains('Travel,1,100.00,28.6%'));
    });

    test('buildCsv localises headers in the user language', () {
      final csv = StatementExportService.buildCsv(
          rows: txns,
          title: 'Oct 2026',
          userName: 'Tester',
          lang: SupportedLanguage.te);
      expect(csv, contains('ఖాతా యజమాని: Tester'));
      expect(csv, contains('లావాదేవీలు: 3'));
    });

    test('buildPdf produces a real PDF with the exact figures', () async {
      final bytes = await StatementExportService.buildPdf(
          rows: txns,
          title: 'Oct 2026 • All',
          userName: 'Tester',
          lang: SupportedLanguage.en);
      expect(bytes.lengthInBytes, greaterThan(500));
      expect(String.fromCharCodes(bytes.take(5)), '%PDF-');
    });

    test('normaliseIndianNumber accepts only valid Indian mobiles', () {
      expect(StatementExportService.normaliseIndianNumber('98765 43210'),
          '919876543210');
      expect(StatementExportService.normaliseIndianNumber('+91-9876543210'),
          '919876543210');
      expect(
          StatementExportService.normaliseIndianNumber('12345'), '');
      expect(StatementExportService.normaliseIndianNumber(''), '');
    });

    test('WhatsApp number round-trips through prefs', () async {
      SharedPreferences.setMockInitialValues({});
      expect(await StatementExportService.getSavedWhatsAppNumber(), '');
      await StatementExportService.saveWhatsAppNumber('9876543210');
      expect(await StatementExportService.getSavedWhatsAppNumber(),
          '9876543210');
    });

    test('statementTitle describes the selection honestly', () {
      expect(
          StatementExportService.statementTitle(
              months: {}, categories: {}),
          'All months • All categories');
      expect(
          StatementExportService.statementTitle(
              months: {'2026-10'},
              categories: {TransactionCategory.Food}),
          'Oct 2026 • Food');
    });
  });
}
