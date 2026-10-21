import 'dart:io';
import 'dart:typed_data';

import 'package:flutter/services.dart' show rootBundle;
import 'package:path_provider/path_provider.dart';
import 'package:pdf/pdf.dart' as pw;
import 'package:pdf/widgets.dart' as pw;
import 'package:shared_preferences/shared_preferences.dart';

import '../models/models.dart';
import '../l10n/translations.dart';

/// Builds real, downloadable transaction statements from the user's own
/// records (server + on-device SMS mirror), with category-wise analysis and
/// language-aware labels.
///
/// Nothing here invents money: every row comes from a [Transaction] the app
/// already holds. An empty selection produces an empty statement, never a
/// fabricated one.
class StatementExportService {
  static const String _waNumberKey = 'finpocket_whatsapp_number_v1';

  /// `yyyy-MM` key for a date, e.g. `2026-10`.
  static String monthKey(DateTime d) =>
      '${d.year}-${d.month.toString().padLeft(2, '0')}';

  static const _monthNames = [
    'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
    'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
  ];

  /// `Oct 2026` label for a `yyyy-MM` key.
  static String monthLabel(String key) {
    final parts = key.split('-');
    if (parts.length != 2) return key;
    final y = int.tryParse(parts[0]) ?? 0;
    final m = int.tryParse(parts[1]) ?? 0;
    if (y <= 0 || m < 1 || m > 12) return key;
    return '${_monthNames[m - 1]} $y';
  }

  /// Distinct months present in [txns], newest first.
  static List<String> availableMonths(List<Transaction> txns) {
    final set = <String>{};
    for (final t in txns) {
      set.add(monthKey(t.timestamp));
    }
    final list = set.toList()..sort((a, b) => b.compareTo(a));
    return list;
  }

  /// Distinct calendar years present in [txns], newest first.
  static List<int> availableYears(List<Transaction> txns) {
    final set = <int>{};
    for (final t in txns) {
      set.add(t.timestamp.year);
    }
    final list = set.toList()..sort((a, b) => b.compareTo(a));
    return list;
  }

  /// Distinct categories present in [txns], in enum order.
  static List<TransactionCategory> availableCategories(
      List<Transaction> txns) {
    final set = <TransactionCategory>{};
    for (final t in txns) {
      set.add(t.category);
    }
    return TransactionCategory.values.where(set.contains).toList();
  }

  /// Applies the user's month, year, date range, and category picks.
  /// Empty sets / null dates mean "no restriction".
  static List<Transaction> filterTransactions(
    List<Transaction> txns, {
    Set<String> months = const {},
    Set<TransactionCategory> categories = const {},
    Set<int> years = const {},
    DateTime? startDate,
    DateTime? endDate,
  }) {
    final rows = txns.where((t) {
      if (startDate != null && t.timestamp.isBefore(startDate)) {
        return false;
      }
      if (endDate != null && t.timestamp.isAfter(endDate)) {
        return false;
      }
      if (years.isNotEmpty && !years.contains(t.timestamp.year)) {
        return false;
      }
      if (months.isNotEmpty && !months.contains(monthKey(t.timestamp))) {
        return false;
      }
      if (categories.isNotEmpty && !categories.contains(t.category)) {
        return false;
      }
      return true;
    }).toList()
      ..sort((a, b) => b.timestamp.compareTo(a.timestamp));
    return rows;
  }

  static double _inflow(List<Transaction> rows) => rows
      .where((t) => t.type == TransactionType.INCOME)
      .fold(0.0, (s, t) => s + t.amount);

  static double _outflow(List<Transaction> rows) => rows
      .where((t) => t.type == TransactionType.EXPENSE)
      .fold(0.0, (s, t) => s + t.amount);

  /// Public totals for preview lines: (inflow, outflow).
  static ({double inflow, double outflow}) totals(List<Transaction> rows) =>
      (inflow: _inflow(rows), outflow: _outflow(rows));

  static String counterpartyOf(Transaction t) {
    final m = (t.merchant ?? '').trim();
    if (m.isNotEmpty) return m;
    if (t.type == TransactionType.INCOME) {
      final s = t.sender.trim();
      return s.isEmpty ? 'Unknown sender' : s;
    }
    final r = t.receiver.trim();
    return r.isEmpty ? 'Unknown receiver' : r;
  }

  static String _csvCell(String v) {
    if (v.contains(',') || v.contains('"') || v.contains('\n')) {
      return '"${v.replaceAll('"', '""')}"';
    }
    return v;
  }

  /// Category breakdown: sorted by spend descending.
  static List<({TransactionCategory category, int count, double amount})>
      categoryBreakdown(List<Transaction> rows) {
    final map = <TransactionCategory, ({int count, double amount})>{};
    for (final t in rows.where((t) => t.type == TransactionType.EXPENSE)) {
      final cur = map[t.category] ?? (count: 0, amount: 0.0);
      map[t.category] = (
        count: cur.count + 1,
        amount: cur.amount + t.amount,
      );
    }
    final list = map.entries
        .map((e) => (category: e.key, count: e.value.count, amount: e.value.amount))
        .toList()
      ..sort((a, b) => b.amount.compareTo(a.amount));
    return list;
  }

  /// The category with the highest total spend (null if no expenses).
  static TransactionCategory? topCategory(List<Transaction> rows) {
    final breakdown = categoryBreakdown(rows);
    return breakdown.isEmpty ? null : breakdown.first.category;
  }

  /// The calendar day with the highest total outflow.
  static DateTime? mostExpensiveDay(List<Transaction> rows) {
    final byDay = <String, double>{};
    for (final t in rows.where((t) => t.type == TransactionType.EXPENSE)) {
      final key = '${t.timestamp.year}-${t.timestamp.month}-${t.timestamp.day}';
      byDay[key] = (byDay[key] ?? 0.0) + t.amount;
    }
    if (byDay.isEmpty) return null;
    final maxKey = _maxKey(byDay);
    final parts = maxKey.split('-');
    return DateTime(
        int.parse(parts[0]), int.parse(parts[1]), int.parse(parts[2]));
  }

  static String _maxKey(Map<String, double> m) {
    return m.entries.reduce((a, b) => a.value >= b.value ? a : b).key;
  }

  /// Average daily outflow across days that had expenses.
  static double dailyAverageOutflow(List<Transaction> rows) {
    final days = <String>{};
    double total = 0.0;
    for (final t in rows.where((t) => t.type == TransactionType.EXPENSE)) {
      days.add('${t.timestamp.year}-${t.timestamp.month}-${t.timestamp.day}');
      total += t.amount;
    }
    return days.isEmpty ? 0.0 : total / days.length;
  }

  /// The single largest expense.
  static Transaction? highestSingleExpense(List<Transaction> rows) {
    final expenses = rows.where((t) => t.type == TransactionType.EXPENSE).toList();
    if (expenses.isEmpty) return null;
    expenses.sort((a, b) => b.amount.compareTo(a.amount));
    return expenses.first;
  }

  /// Localized label for [key] in the user's language.
  static String tr(SupportedLanguage lang, String key) =>
      Translations.tr(lang, key);

  /// Real CSV content (UTF-8 with BOM so Excel opens the ₹ sign correctly).
  static String buildCsv({
    required List<Transaction> rows,
    required String title,
    required String userName,
    required SupportedLanguage lang,
  }) {
    final b = StringBuffer();

    // User info header — clearly states whose data this is.
    b.writeln('${tr(lang, 'stmtAccountHolder')}: $userName');
    b.writeln('${tr(lang, 'stmtPeriod')}: $title');
    b.writeln('${tr(lang, 'stmtTransactions')}: ${rows.length}');
    b.writeln('');

    // Transactions table.
    b.writeln([
      tr(lang, 'stmtDate'),
      tr(lang, 'stmtType'),
      tr(lang, 'stmtAmount'),
      tr(lang, 'stmtCategory'),
      tr(lang, 'stmtCounterparty'),
      tr(lang, 'stmtDescription'),
      tr(lang, 'stmtReferenceId'),
      tr(lang, 'stmtPaymentMethod'),
      tr(lang, 'stmtStatus'),
    ].join(','));

    for (final t in rows) {
      final d = t.timestamp;
      final date =
          '${d.year}-${d.month.toString().padLeft(2, '0')}-${d.day.toString().padLeft(2, '0')} '
          '${d.hour.toString().padLeft(2, '0')}:${d.minute.toString().padLeft(2, '0')}';
      b.writeln([
        date,
        t.type.name,
        t.amount.toStringAsFixed(2),
        t.category.name,
        _csvCell(counterpartyOf(t)),
        _csvCell(t.description),
        _csvCell(t.referenceId),
        _csvCell(t.paymentMethod),
        t.status.name,
      ].join(','));
    }

    // Totals.
    final inflow = _inflow(rows);
    final outflow = _outflow(rows);
    b.writeln('');
    b.writeln('${tr(lang, 'stmtTotalInflow')},${inflow.toStringAsFixed(2)}');
    b.writeln('${tr(lang, 'stmtTotalOutflow')},${outflow.toStringAsFixed(2)}');
    b.writeln('${tr(lang, 'stmtNet')},${(inflow - outflow).toStringAsFixed(2)}');

    // Category breakdown.
    final breakdown = categoryBreakdown(rows);
    if (breakdown.isNotEmpty) {
      b.writeln('');
      b.writeln(tr(lang, 'stmtCategoryAnalysis'));
      b.writeln(
          '${tr(lang, 'stmtCategory')},${tr(lang, 'stmtCount')},${tr(lang, 'stmtAmount')},${tr(lang, 'stmtShare')}');
      for (final row in breakdown) {
        final share = outflow > 0
            ? '${((row.amount / outflow) * 100).toStringAsFixed(1)}%'
            : '0.0%';
        b.writeln(
            '${row.category.name},${row.count},${row.amount.toStringAsFixed(2)},$share');
      }
    }

    return '﻿${b.toString()}';
  }

  /// Real PDF statement with category analysis, localized in the user's
  /// language. Uses the bundled Noto Sans font so all 8 scripts render.
  static Future<Uint8List> buildPdf({
    required List<Transaction> rows,
    required String title,
    required String userName,
    required SupportedLanguage lang,
  }) async {
    // Load Noto Sans for full script coverage.
    final fontData =
        await rootBundle.load('assets/fonts/NotoSans-Regular.ttf');
    final notoSans = pw.Font.ttf(fontData);
    final theme = pw.ThemeData.withFont(base: notoSans);

    final inflow = _inflow(rows);
    final outflow = _outflow(rows);
    final breakdown = categoryBreakdown(rows);
    final topCat = topCategory(rows);
    final expDay = mostExpensiveDay(rows);
    final dailyAvg = dailyAverageOutflow(rows);
    final highestExp = highestSingleExpense(rows);

    final doc = pw.Document();
    doc.addPage(
      pw.MultiPage(
        pageFormat: pw.PdfPageFormat.a4.landscape,
        margin: const pw.EdgeInsets.all(28),
        theme: theme,
        header: (ctx) => pw.Column(
          crossAxisAlignment: pw.CrossAxisAlignment.start,
          children: [
            pw.Text(tr(lang, 'stmtTitle'),
                style: pw.TextStyle(
                    fontSize: 16,
                    fontWeight: pw.FontWeight.bold)),
            pw.SizedBox(height: 2),
            pw.Text(title, style: const pw.TextStyle(fontSize: 10)),
            pw.Text(
                '${tr(lang, 'stmtAccountHolder')}: ${userName.isEmpty ? 'FinPocket user' : userName}  |  ${tr(lang, 'stmtGenerated')}: ${DateTime.now().toString().substring(0, 16)}',
                style: const pw.TextStyle(fontSize: 9)),
            pw.SizedBox(height: 8),
          ],
        ),
        footer: (ctx) => pw.Text(
          '${tr(lang, 'stmtPage')} ${ctx.pageNumber}/${ctx.pagesCount}  |  ${tr(lang, 'stmtFooter')}',
          style: const pw.TextStyle(fontSize: 8),
        ),
        build: (ctx) => [
          pw.TableHelper.fromTextArray(
            headers: [
              tr(lang, 'stmtDate'),
              tr(lang, 'stmtType'),
              tr(lang, 'stmtAmount'),
              tr(lang, 'stmtCategory'),
              tr(lang, 'stmtCounterparty'),
              tr(lang, 'stmtReferenceId'),
              tr(lang, 'stmtStatus'),
            ],
            data: [
              for (final t in rows)
                [
                  t.timestamp.toString().substring(0, 16),
                  t.type.name,
                  t.amount.toStringAsFixed(2),
                  t.category.name,
                  counterpartyOf(t),
                  t.referenceId.isEmpty ? '-' : t.referenceId,
                  t.status.name,
                ],
            ],
            headerStyle: pw.TextStyle(
                fontSize: 8, fontWeight: pw.FontWeight.bold),
            cellStyle: const pw.TextStyle(fontSize: 7.5),
            cellAlignment: pw.Alignment.centerLeft,
          ),
          pw.SizedBox(height: 12),
          // Totals row.
          pw.Row(
            mainAxisAlignment: pw.MainAxisAlignment.end,
            children: [
              pw.Text(
                  '${tr(lang, 'stmtTotalInflow')}: Rs.${inflow.toStringAsFixed(2)}   |   ${tr(lang, 'stmtTotalOutflow')}: Rs.${outflow.toStringAsFixed(2)}   |   ${tr(lang, 'stmtNet')}: Rs.${(inflow - outflow).toStringAsFixed(2)}',
                  style: pw.TextStyle(
                      fontSize: 10, fontWeight: pw.FontWeight.bold)),
            ],
          ),
          pw.SizedBox(height: 16),
          // Category analysis section.
          pw.Text(tr(lang, 'stmtCategoryAnalysis'),
              style:
                  pw.TextStyle(fontSize: 13, fontWeight: pw.FontWeight.bold)),
          pw.SizedBox(height: 6),
          if (breakdown.isNotEmpty) ...[
            pw.TableHelper.fromTextArray(
              headers: [
                tr(lang, 'stmtCategory'),
                tr(lang, 'stmtCount'),
                tr(lang, 'stmtAmount'),
                tr(lang, 'stmtShare'),
              ],
              data: [
                for (final row in breakdown)
                  [
                    row.category.name,
                    '${row.count}',
                    'Rs.${row.amount.toStringAsFixed(2)}',
                    outflow > 0
                        ? '${((row.amount / outflow) * 100).toStringAsFixed(1)}%'
                        : '0.0%',
                  ],
              ],
              headerStyle: pw.TextStyle(
                  fontSize: 8, fontWeight: pw.FontWeight.bold),
              cellStyle: const pw.TextStyle(fontSize: 7.5),
            ),
            pw.SizedBox(height: 10),
          ],
          // Insights.
          pw.Text(tr(lang, 'stmtCategoryAnalysis'),
              style:
                  pw.TextStyle(fontSize: 13, fontWeight: pw.FontWeight.bold)),
          pw.SizedBox(height: 4),
          if (topCat != null)
            pw.Text(
                '• ${tr(lang, 'stmtTopCategory')}: ${topCat.name} (Rs.${breakdown.first.amount.toStringAsFixed(2)})'),
          if (expDay != null)
            pw.Text(
                '• ${tr(lang, 'stmtMostExpensiveDay')}: ${expDay.toString().substring(0, 10)}'),
          pw.Text(
              '• ${tr(lang, 'stmtDailyAvg')}: Rs.${dailyAvg.toStringAsFixed(2)}'),
          if (highestExp != null)
            pw.Text(
                '• ${tr(lang, 'stmtHighestExpense')}: Rs.${highestExp.amount.toStringAsFixed(2)} (${counterpartyOf(highestExp)})'),
        ],
      ),
    );
    return doc.save();
  }

  /// Saves [content] under app documents and returns the file.
  static Future<File> saveStatementFile(
      String fileName, List<int> bytes) async {
    final dir = await getApplicationDocumentsDirectory();
    final safe = fileName.replaceAll(RegExp(r'[^A-Za-z0-9._-]'), '_');
    final file = File('${dir.path}/$safe');
    await file.writeAsBytes(bytes, flush: true);
    return file;
  }

  static String statementFileName({
    required String format, // 'csv' | 'pdf'
    Set<String> months = const {},
    Set<TransactionCategory> categories = const {},
    Set<int> years = const {},
    DateTime? startDate,
    DateTime? endDate,
  }) {
    String timeScope = 'all-time';
    if (startDate != null && endDate != null) {
      final s = '${startDate.year}${startDate.month.toString().padLeft(2, '0')}${startDate.day.toString().padLeft(2, '0')}';
      final e = '${endDate.year}${endDate.month.toString().padLeft(2, '0')}${endDate.day.toString().padLeft(2, '0')}';
      timeScope = s == e ? s : '${s}_to_$e';
    } else if (years.isNotEmpty) {
      timeScope = 'year_${(years.toList()..sort()).join('_')}';
    } else if (months.isNotEmpty) {
      timeScope = (months.toList()..sort()).join('_');
    }
    final c = categories.isEmpty
        ? 'all-categories'
        : categories.map((e) => e.name).join('_');
    final stamp = DateTime.now()
        .toIso8601String()
        .substring(0, 16)
        .replaceAll(':', '')
        .replaceAll('T', '_');
    return 'FinPocket-Statement_${timeScope}_${c}_$stamp.$format';
  }

  static String statementTitle({
    Set<String> months = const {},
    Set<TransactionCategory> categories = const {},
    Set<int> years = const {},
    DateTime? startDate,
    DateTime? endDate,
  }) {
    String timeScope = 'All months';
    if (startDate != null && endDate != null) {
      final s = '${startDate.day} ${_monthNames[startDate.month - 1]} ${startDate.year}';
      final e = '${endDate.day} ${_monthNames[endDate.month - 1]} ${endDate.year}';
      timeScope = s == e ? s : '$s – $e';
    } else if (years.isNotEmpty) {
      timeScope = (years.toList()..sort()).map((y) => '$y').join(', ');
    } else if (months.isNotEmpty) {
      timeScope = (months.toList()..sort()).map(monthLabel).join(', ');
    }
    final c = categories.isEmpty
        ? 'All categories'
        : categories.map((e) => e.name).join(', ');
    return '$timeScope • $c';
  }

  /// Short text summary for the WhatsApp hand-off (totals + category insight,
  /// localized). The full history rides along as the attached file.
  static String whatsAppSummary({
    required List<Transaction> rows,
    required String title,
    required SupportedLanguage lang,
  }) {
    final inflow = _inflow(rows);
    final outflow = _outflow(rows);
    final topCat = topCategory(rows);
    final catLine = topCat != null
        ? '\n${tr(lang, 'stmtTopCategory')}: ${topCat.name} (Rs.${breakdownOf(rows).amount.toStringAsFixed(2)})'
        : '';
    return '${tr(lang, 'stmtWhatsappSummary')} — $title\n'
        '${tr(lang, 'stmtTxnCount')}: ${rows.length}\n'
        '${tr(lang, 'stmtInflow')}: ₹${inflow.toStringAsFixed(2)}\n'
        '${tr(lang, 'stmtOutflow')}: ₹${outflow.toStringAsFixed(2)}\n'
        '${tr(lang, 'stmtNetShort')}: ₹${(inflow - outflow).toStringAsFixed(2)}'
        '$catLine\n'
        '${tr(lang, 'stmtFullHistory')}';
  }

  static ({TransactionCategory category, int count, double amount})
      breakdownOf(List<Transaction> rows) {
    final b = categoryBreakdown(rows);
    if (b.isEmpty) return (category: TransactionCategory.Other, count: 0, amount: 0.0);
    return b.first;
  }

  static Future<String> getSavedWhatsAppNumber() async {
    try {
      final prefs = await SharedPreferences.getInstance();
      return prefs.getString(_waNumberKey) ?? '';
    } catch (_) {
      return '';
    }
  }

  static Future<void> saveWhatsAppNumber(String digits) async {
    try {
      final prefs = await SharedPreferences.getInstance();
      await prefs.setString(_waNumberKey, digits);
    } catch (_) {}
  }

  /// Normalises an Indian mobile number to `91XXXXXXXXXX` for wa.me links.
  /// Returns '' when the input is not a valid 10-digit Indian number.
  static String normaliseIndianNumber(String raw) {
    var d = raw.replaceAll(RegExp(r'\D'), '');
    if (d.length == 12 && d.startsWith('91')) return d;
    if (d.length == 11 && d.startsWith('0')) d = d.substring(1);
    if (RegExp(r'^[6-9]\d{9}$').hasMatch(d)) return '91$d';
    return '';
  }
}
