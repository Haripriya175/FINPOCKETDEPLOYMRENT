import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:provider/provider.dart';
import 'dart:convert';
import '../providers/app_state.dart';
import '../theme/app_theme.dart';
import '../models/models.dart';
import '../core/transaction_display.dart';
import '../services/api_service.dart';
import '../services/external_intent_service.dart';
import '../services/file_share_service.dart';
import '../services/statement_export_service.dart';
import '../services/local_transaction_storage_service.dart';
import '../services/bank_sms_parser_service.dart';
import '../widgets/local_vault_consent_modal.dart';

class TransactionsScreen extends StatefulWidget {
  const TransactionsScreen({super.key});

  @override
  State<TransactionsScreen> createState() => _TransactionsScreenState();
}

class _TransactionsScreenState extends State<TransactionsScreen> {
  String _searchQuery = '';
  TransactionCategory? _filterCategory;
  int _selectedPeriodMonths = 1;

  @override
  void initState() {
    super.initState();
    BankSmsParserService.fetchContactsMap().then((_) {
      if (mounted) setState(() {});
    });
  }

  void _showWhatChangedSheet(BuildContext context) async {
    final state = Provider.of<AppState>(context, listen: false);
    final now = DateTime.now();
    const months = [
      'January', 'February', 'March', 'April', 'May', 'June',
      'July', 'August', 'September', 'October', 'November', 'December'
    ];
    final currentMonthName = months[now.month - 1];
    final prevMonthDate = DateTime(now.year, now.month - 1, 1);
    final prevMonthName = months[prevMonthDate.month - 1];
    final periodLabel = '$currentMonthName ${now.year} vs $prevMonthName ${prevMonthDate.year}';

    // Compute dynamic real-time insights from actual device transactions
    final thisMonthTxns = state.transactions.where((t) =>
      t.timestamp.year == now.year && t.timestamp.month == now.month).toList();
    final prevMonthTxns = state.transactions.where((t) =>
      t.timestamp.year == prevMonthDate.year && t.timestamp.month == prevMonthDate.month).toList();

    double thisMonthSpent = 0;
    double thisMonthIncome = 0;
    for (final t in thisMonthTxns) {
      if (t.type == TransactionType.INCOME) {
        thisMonthIncome += t.amount;
      } else {
        thisMonthSpent += t.amount;
      }
    }

    double prevMonthSpent = 0;
    for (final t in prevMonthTxns) {
      if (t.type == TransactionType.EXPENSE) {
        prevMonthSpent += t.amount;
      }
    }

    final double spentDelta = thisMonthSpent - prevMonthSpent;
    final List<String> computedChanges = [];

    if (thisMonthTxns.isNotEmpty) {
      if (spentDelta > 0 && prevMonthSpent > 0) {
        final pct = ((spentDelta / prevMonthSpent) * 100).toStringAsFixed(0);
        computedChanges.add('Monthly spending changed by +₹${spentDelta.toStringAsFixed(0)} (+$pct%).');
      } else if (spentDelta < 0 && prevMonthSpent > 0) {
        final pct = (((-spentDelta) / prevMonthSpent) * 100).toStringAsFixed(0);
        computedChanges.add('You saved ₹${(-spentDelta).toStringAsFixed(0)} more (-$pct% spending vs previous month).');
      } else {
        computedChanges.add('Total outgoing spending this month is ₹${thisMonthSpent.toStringAsFixed(0)}.');
      }

      // Top spending category
      final Map<TransactionCategory, double> catTotals = {};
      for (final t in thisMonthTxns) {
        if (t.type == TransactionType.EXPENSE) {
          catTotals[t.category] = (catTotals[t.category] ?? 0) + t.amount;
        }
      }
      if (catTotals.isNotEmpty) {
        final topEntry = catTotals.entries.reduce((a, b) => a.value > b.value ? a : b);
        final topCatName = topEntry.key.toString().split('.').last;
        computedChanges.add('Top expense category: $topCatName at ₹${topEntry.value.toStringAsFixed(0)}.');
      }

      if (thisMonthIncome > 0) {
        final net = thisMonthIncome - thisMonthSpent;
        computedChanges.add('Net cash flow: ${net >= 0 ? "+" : "-"}₹${net.abs().toStringAsFixed(0)} with ₹${thisMonthIncome.toStringAsFixed(0)} income.');
      }

      computedChanges.add('${thisMonthTxns.length} real transactions synced in your on-device ledger.');
    } else {
      computedChanges.add('No outgoing expenses recorded yet for $currentMonthName ${now.year}.');
      computedChanges.add('Sync your bank SMS or make transfers to see live changes.');
    }

    showModalBottomSheet(
      context: context,
      backgroundColor: const Color(0xFF0F172A),
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(24)),
      ),
      builder: (ctx) => FutureBuilder<Map<String, dynamic>>(
        future: ApiService.getWhatChanged(),
        builder: (context, snapshot) {
          if (snapshot.connectionState == ConnectionState.waiting) {
            return const Padding(
              padding: EdgeInsets.all(40),
              child: Center(child: CircularProgressIndicator()),
            );
          }

          final data = snapshot.data ?? {};
          final dynamicRaw = data['keyChanges'] as List<dynamic>?;
          final keyChanges = (dynamicRaw != null && dynamicRaw.isNotEmpty)
              ? dynamicRaw
              : computedChanges;
          final displayPeriod = data['periodLabel'] ?? periodLabel;

          return Padding(
            padding: const EdgeInsets.all(24),
            child: SingleChildScrollView(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                mainAxisSize: MainAxisSize.min,
                children: [
                  Row(
                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                    children: [
                      const Expanded(
                        child: Row(
                          children: [
                            Icon(Icons.compare_arrows, color: AppTheme.primary),
                            SizedBox(width: 8),
                            Flexible(
                              child: Text(
                                'What Changed This Month?',
                                style: TextStyle(fontSize: 18, fontWeight: FontWeight.bold, color: Colors.white),
                                overflow: TextOverflow.ellipsis,
                              ),
                            ),
                          ],
                        ),
                      ),
                      IconButton(
                        icon: const Icon(Icons.close, color: Colors.white70),
                        onPressed: () => Navigator.pop(ctx),
                      ),
                    ],
                  ),
                  const SizedBox(height: 8),
                  Text(
                    displayPeriod,
                    style: const TextStyle(fontSize: 12, color: Color(0xFF94A3B8)),
                  ),
                  const SizedBox(height: 16),

                  ...keyChanges.map((k) => Container(
                    margin: const EdgeInsets.only(bottom: 10),
                    padding: const EdgeInsets.all(12),
                    decoration: BoxDecoration(
                      color: const Color(0xFF1E293B),
                      borderRadius: BorderRadius.circular(12),
                      border: Border.all(color: Colors.white10),
                    ),
                    child: Row(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        const Icon(Icons.insights, size: 16, color: AppTheme.primary),
                        const SizedBox(width: 10),
                        Expanded(
                          child: Text(
                            k.toString(),
                            style: const TextStyle(fontSize: 13, color: Colors.white, height: 1.3),
                          ),
                        ),
                      ],
                    ),
                  )),
                ],
              ),
            ),
          );
        },
      ),
    );
  }

  void _showExportStatementSheet(BuildContext context) {
    final appState = Provider.of<AppState>(context, listen: false);
    final allTxns = List<Transaction>.of(appState.transactions);
    final userName = appState.currentUser?.fullName ?? '';
    final months = StatementExportService.availableMonths(allTxns);
    final years = StatementExportService.availableYears(allTxns);
    final cats = StatementExportService.availableCategories(allTxns);

    // Filter selections
    final Set<String> selMonths = {
      if (months.contains(StatementExportService.monthKey(DateTime.now())))
        StatementExportService.monthKey(DateTime.now()),
    };
    final Set<int> selYears = {
      if (years.contains(DateTime.now().year)) DateTime.now().year,
    };
    DateTimeRange? customRange;
    String dateFilterMode = 'month'; // 'month' | 'year' | 'range' | 'all'
    final Set<TransactionCategory> selCats = {};
    String selFormat = 'pdf'; // 'pdf' | 'csv'
    final waCtrl = TextEditingController();
    bool busy = false;
    bool closed = false;

    void snack(String msg, {bool ok = true}) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(msg, style: const TextStyle(fontSize: 12)),
          backgroundColor:
              ok ? const Color(0xFF0D9488) : const Color(0xFFB91C1C),
          duration: const Duration(seconds: 4),
        ),
      );
    }

    // Prefill the last-used WhatsApp number (no setState: the controller
    // repaints the field on its own, and this may land after close).
    StatementExportService.getSavedWhatsAppNumber().then((v) {
      if (v.isNotEmpty) waCtrl.text = v;
    });

    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      backgroundColor: const Color(0xFF0F172A),
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(24)),
      ),
      builder: (ctx) {
        return StatefulBuilder(
          builder: (context, setSheetState) {
            final curMonths = dateFilterMode == 'month' ? selMonths : <String>{};
            final curYears = dateFilterMode == 'year' ? selYears : <int>{};
            final curStart = dateFilterMode == 'range' ? customRange?.start : null;
            final curEnd = dateFilterMode == 'range' && customRange != null
                ? DateTime(customRange!.end.year, customRange!.end.month, customRange!.end.day, 23, 59, 59)
                : null;

            Future<void> runExport(
                {required bool shareFile, required bool waText}) async {
              if (busy || closed) return;
              final rows = StatementExportService.filterTransactions(
                allTxns,
                months: curMonths,
                years: curYears,
                startDate: curStart,
                endDate: curEnd,
                categories: selCats,
              );
              if (rows.isEmpty) {
                snack('No transactions match this date + category selection.',
                    ok: false);
                return;
              }
              setSheetState(() => busy = true);
              try {
                final title = StatementExportService.statementTitle(
                  months: curMonths,
                  years: curYears,
                  startDate: curStart,
                  endDate: curEnd,
                  categories: selCats,
                );
                final Uint8List bytes = selFormat == 'pdf'
                    ? await StatementExportService.buildPdf(
                        rows: rows,
                        title: title,
                        userName: userName,
                        lang: appState.language)
                    : Uint8List.fromList(utf8.encode(
                        StatementExportService.buildCsv(
                            rows: rows,
                            title: title,
                            userName: userName,
                            lang: appState.language)));
                final file =
                    await StatementExportService.saveStatementFile(
                  StatementExportService.statementFileName(
                    format: selFormat,
                    months: curMonths,
                    years: curYears,
                    startDate: curStart,
                    endDate: curEnd,
                    categories: selCats,
                  ),
                  bytes,
                );
                await StatementExportService.saveWhatsAppNumber(
                    waCtrl.text.trim());
                final summary = StatementExportService.whatsAppSummary(
                    rows: rows, title: title, lang: appState.language);
                closed = true;
                if (ctx.mounted) Navigator.pop(ctx);
                if (waText) {
                  final digits =
                      StatementExportService.normaliseIndianNumber(
                          waCtrl.text.trim());
                  if (digits.isEmpty) {
                    snack('Enter a valid 10-digit WhatsApp number first.',
                        ok: false);
                    return;
                  }
                  final opened =
                      await ExternalIntentService.launchWhatsApp(
                          phone: digits, text: summary);
                  if (!opened) {
                    snack(
                        'Could not open WhatsApp — file saved at ${file.path}.',
                        ok: false);
                  }
                } else if (shareFile) {
                  // Save a copy to Downloads, then open WhatsApp directly
                  // with the file attached — no share-sheet detour.
                  await FileShareService.downloadToDownloads(file.path);
                  final digits = StatementExportService.normaliseIndianNumber(
                      waCtrl.text.trim());
                  final opened = await FileShareService.shareFileToWhatsApp(
                    filePath: file.path,
                    phone: digits.isEmpty ? null : digits,
                  );
                  if (!opened) {
                    snack(
                        'Could not open WhatsApp — file saved at ${file.path}.',
                        ok: false);
                  }
                } else {
                  // Download-only: save to app documents AND Downloads.
                  await FileShareService.downloadToDownloads(file.path);
                  final fileName = file.path.split(RegExp(r'[/\\]')).last;
                  snack(
                      '✅ Statement saved to your phone\'s Downloads folder! ($fileName)');
                }
              } catch (e) {
                snack('Could not generate the statement: $e', ok: false);
              } finally {
                if (!closed) setSheetState(() => busy = false);
              }
            }

            final preview = StatementExportService.filterTransactions(
              allTxns,
              months: curMonths,
              years: curYears,
              startDate: curStart,
              endDate: curEnd,
              categories: selCats,
            );
            final totals = StatementExportService.totals(preview);
            return Padding(
              padding: EdgeInsets.only(
                left: 24,
                right: 24,
                top: 24,
                bottom: 24 + MediaQuery.of(context).viewInsets.bottom,
              ),
              child: SafeArea(
                top: false,
                child: SingleChildScrollView(
                  child: Column(
                    mainAxisSize: MainAxisSize.min,
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Row(
                        mainAxisAlignment: MainAxisAlignment.spaceBetween,
                        children: [
                          const Expanded(
                            child: Row(
                              children: [
                                Icon(Icons.description_rounded,
                                    color: AppTheme.primary, size: 24),
                                SizedBox(width: 8),
                                Expanded(
                                  child: Text(
                                    'Download Statement',
                                    style: TextStyle(
                                        fontSize: 18,
                                        fontWeight: FontWeight.bold,
                                        color: Colors.white),
                                    overflow: TextOverflow.ellipsis,
                                  ),
                                ),
                              ],
                            ),
                          ),
                          IconButton(
                            icon: const Icon(Icons.close, color: Colors.white70),
                            onPressed: () => Navigator.pop(ctx),
                          ),
                        ],
                      ),
                      const SizedBox(height: 4),
                      const Text(
                        'A real file from your own records — pick specific date, year, month and categories.',
                        style:
                            TextStyle(fontSize: 12, color: Color(0xFF94A3B8)),
                      ),
                      const SizedBox(height: 18),
                      Row(
                        mainAxisAlignment: MainAxisAlignment.spaceBetween,
                        children: [
                          const Text(
                            'DATE FILTER',
                            style: TextStyle(
                                fontSize: 11,
                                fontWeight: FontWeight.bold,
                                color: Color(0xFF94A3B8),
                                letterSpacing: 0.5),
                          ),
                          TextButton(
                            onPressed: () => setSheetState(() {
                              selMonths.clear();
                              selYears.clear();
                              customRange = null;
                              dateFilterMode = 'all';
                            }),
                            child: const Text('Reset',
                                style: TextStyle(
                                    fontSize: 11, color: AppTheme.primary)),
                          ),
                        ],
                      ),
                      const SizedBox(height: 8),
                      SingleChildScrollView(
                        scrollDirection: Axis.horizontal,
                        child: Row(
                          children: [
                            ChoiceChip(
                              label: const Text('By Month', style: TextStyle(fontSize: 11)),
                              selected: dateFilterMode == 'month',
                              selectedColor: AppTheme.primary,
                              checkmarkColor: Colors.white,
                              backgroundColor: const Color(0xFF1E293B),
                              onSelected: (s) => setSheetState(() => dateFilterMode = 'month'),
                            ),
                            const SizedBox(width: 6),
                            ChoiceChip(
                              label: const Text('By Year', style: TextStyle(fontSize: 11)),
                              selected: dateFilterMode == 'year',
                              selectedColor: AppTheme.primary,
                              checkmarkColor: Colors.white,
                              backgroundColor: const Color(0xFF1E293B),
                              onSelected: (s) => setSheetState(() => dateFilterMode = 'year'),
                            ),
                            const SizedBox(width: 6),
                            ChoiceChip(
                              label: const Text('Specific Date / Range', style: TextStyle(fontSize: 11)),
                              selected: dateFilterMode == 'range',
                              selectedColor: AppTheme.primary,
                              checkmarkColor: Colors.white,
                              backgroundColor: const Color(0xFF1E293B),
                              onSelected: (s) => setSheetState(() => dateFilterMode = 'range'),
                            ),
                            const SizedBox(width: 6),
                            ChoiceChip(
                              label: const Text('All Time', style: TextStyle(fontSize: 11)),
                              selected: dateFilterMode == 'all',
                              selectedColor: AppTheme.primary,
                              checkmarkColor: Colors.white,
                              backgroundColor: const Color(0xFF1E293B),
                              onSelected: (s) => setSheetState(() => dateFilterMode = 'all'),
                            ),
                          ],
                        ),
                      ),
                      const SizedBox(height: 10),
                      if (dateFilterMode == 'month') ...[
                        if (months.isEmpty)
                          const Text('No months on record yet.',
                              style: TextStyle(fontSize: 12, color: Colors.white70))
                        else
                          Wrap(
                            spacing: 8,
                            runSpacing: 8,
                            children: months.map((m) {
                              final isSel = selMonths.contains(m);
                              return FilterChip(
                                label: Text(
                                  StatementExportService.monthLabel(m),
                                  style: TextStyle(
                                      fontSize: 12,
                                      color: isSel ? Colors.white : Colors.white70),
                                ),
                                selected: isSel,
                                selectedColor: AppTheme.primary,
                                checkmarkColor: Colors.white,
                                backgroundColor: const Color(0xFF1E293B),
                                side: const BorderSide(color: Color(0xFF334155)),
                                onSelected: (val) => setSheetState(() {
                                  if (val) {
                                    selMonths.add(m);
                                  } else {
                                    selMonths.remove(m);
                                  }
                                }),
                              );
                            }).toList(),
                          ),
                      ] else if (dateFilterMode == 'year') ...[
                        if (years.isEmpty)
                          const Text('No years on record yet.',
                              style: TextStyle(fontSize: 12, color: Colors.white70))
                        else
                          Wrap(
                            spacing: 8,
                            runSpacing: 8,
                            children: years.map((y) {
                              final isSel = selYears.contains(y);
                              return FilterChip(
                                label: Text(
                                  '$y',
                                  style: TextStyle(
                                      fontSize: 12,
                                      color: isSel ? Colors.white : Colors.white70),
                                ),
                                selected: isSel,
                                selectedColor: AppTheme.primary,
                                checkmarkColor: Colors.white,
                                backgroundColor: const Color(0xFF1E293B),
                                side: const BorderSide(color: Color(0xFF334155)),
                                onSelected: (val) => setSheetState(() {
                                  if (val) {
                                    selYears.add(y);
                                  } else {
                                    selYears.remove(y);
                                  }
                                }),
                              );
                            }).toList(),
                          ),
                      ] else if (dateFilterMode == 'range') ...[
                        GestureDetector(
                          onTap: () async {
                            final picked = await showDateRangePicker(
                              context: context,
                              firstDate: DateTime(2020),
                              lastDate: DateTime.now().add(const Duration(days: 365)),
                              initialDateRange: customRange ??
                                  DateTimeRange(
                                    start: DateTime.now().subtract(const Duration(days: 30)),
                                    end: DateTime.now(),
                                  ),
                              builder: (context, child) => Theme(
                                data: Theme.of(context).copyWith(
                                  colorScheme: const ColorScheme.dark(
                                    primary: AppTheme.primary,
                                    onPrimary: Colors.white,
                                    surface: Color(0xFF0F172A),
                                    onSurface: Colors.white,
                                  ),
                                ),
                                child: child!,
                              ),
                            );
                            if (picked != null) {
                              setSheetState(() => customRange = picked);
                            }
                          },
                          child: Container(
                            padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
                            decoration: BoxDecoration(
                              color: const Color(0xFF1E293B),
                              borderRadius: BorderRadius.circular(12),
                              border: Border.all(color: AppTheme.primary.withOpacity(0.5)),
                            ),
                            child: Row(
                              children: [
                                const Icon(Icons.calendar_month_rounded, color: AppTheme.primary, size: 20),
                                const SizedBox(width: 10),
                                Expanded(
                                  child: Text(
                                    customRange != null
                                        ? '${customRange!.start.day}/${customRange!.start.month}/${customRange!.start.year} – ${customRange!.end.day}/${customRange!.end.month}/${customRange!.end.year}'
                                        : 'Tap to select specific date / custom range',
                                    style: const TextStyle(fontSize: 12.5, color: Colors.white, fontWeight: FontWeight.w600),
                                  ),
                                ),
                                const Icon(Icons.edit_calendar_rounded, color: AppTheme.primary, size: 18),
                              ],
                            ),
                          ),
                        ),
                      ] else ...[
                        Container(
                          width: double.infinity,
                          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
                          decoration: BoxDecoration(
                            color: const Color(0xFF1E293B),
                            borderRadius: BorderRadius.circular(8),
                            border: Border.all(color: AppTheme.primary.withOpacity(0.3)),
                          ),
                          child: const Text(
                            '✓ All transactions included without date restriction.',
                            style: TextStyle(fontSize: 12, color: AppTheme.primary),
                          ),
                        ),
                      ],
                      const SizedBox(height: 16),
                      Row(
                        mainAxisAlignment: MainAxisAlignment.spaceBetween,
                        children: [
                          const Text(
                            'CATEGORIES (EMPTY = ALL)',
                            style: TextStyle(
                                fontSize: 11,
                                fontWeight: FontWeight.bold,
                                color: Color(0xFF94A3B8),
                                letterSpacing: 0.5),
                          ),
                          TextButton(
                            onPressed: () =>
                                setSheetState(() => selCats.clear()),
                            child: const Text('Reset',
                                style: TextStyle(
                                    fontSize: 11, color: AppTheme.primary)),
                          ),
                        ],
                      ),
                      const SizedBox(height: 8),
                      if (cats.isEmpty)
                        const Text('No categories on record yet.',
                            style: TextStyle(
                                fontSize: 12, color: Colors.white70))
                      else
                        Wrap(
                          spacing: 8,
                          runSpacing: 8,
                          children: cats.map((c) {
                            final isSel = selCats.contains(c);
                            return FilterChip(
                              label: Text(
                                c.name,
                                style: TextStyle(
                                    fontSize: 12,
                                    color: isSel
                                        ? Colors.white
                                        : Colors.white70),
                              ),
                              selected: isSel,
                              selectedColor: AppTheme.primary,
                              checkmarkColor: Colors.white,
                              backgroundColor: const Color(0xFF1E293B),
                              side: const BorderSide(
                                  color: Color(0xFF334155)),
                              onSelected: (val) => setSheetState(() {
                                if (val) {
                                  selCats.add(c);
                                } else {
                                  selCats.remove(c);
                                }
                              }),
                            );
                          }).toList(),
                        ),
                      const SizedBox(height: 16),
                      const Text(
                        'FORMAT',
                        style: TextStyle(
                            fontSize: 11,
                            fontWeight: FontWeight.bold,
                            color: Color(0xFF94A3B8),
                            letterSpacing: 0.5),
                      ),
                      const SizedBox(height: 8),
                      Row(
                        children: [
                          Expanded(
                            child: InkWell(
                              onTap: () =>
                                  setSheetState(() => selFormat = 'pdf'),
                              child: Container(
                                padding: const EdgeInsets.symmetric(
                                    vertical: 12, horizontal: 10),
                                decoration: BoxDecoration(
                                  color: selFormat == 'pdf'
                                      ? AppTheme.primary.withOpacity(0.15)
                                      : const Color(0xFF1E293B),
                                  borderRadius: BorderRadius.circular(10),
                                  border: Border.all(
                                    color: selFormat == 'pdf'
                                        ? AppTheme.primary
                                        : const Color(0xFF334155),
                                  ),
                                ),
                                child: Column(
                                  children: [
                                    Icon(Icons.picture_as_pdf,
                                        color: selFormat == 'pdf'
                                            ? AppTheme.primary
                                            : Colors.white60,
                                        size: 20),
                                    const SizedBox(height: 4),
                                    const Text('PDF Statement',
                                        style: TextStyle(
                                            fontSize: 11,
                                            fontWeight: FontWeight.bold,
                                            color: Colors.white)),
                                  ],
                                ),
                              ),
                            ),
                          ),
                          const SizedBox(width: 10),
                          Expanded(
                            child: InkWell(
                              onTap: () =>
                                  setSheetState(() => selFormat = 'csv'),
                              child: Container(
                                padding: const EdgeInsets.symmetric(
                                    vertical: 12, horizontal: 10),
                                decoration: BoxDecoration(
                                  color: selFormat == 'csv'
                                      ? const Color(0x2622C55E)
                                      : const Color(0xFF1E293B),
                                  borderRadius: BorderRadius.circular(10),
                                  border: Border.all(
                                    color: selFormat == 'csv'
                                        ? const Color(0xFF22C55E)
                                        : const Color(0xFF334155),
                                  ),
                                ),
                                child: Column(
                                  children: [
                                    Icon(Icons.table_chart,
                                        color: selFormat == 'csv'
                                            ? const Color(0xFF22C55E)
                                            : Colors.white60,
                                        size: 20),
                                    const SizedBox(height: 4),
                                    const Text('CSV / Excel',
                                        style: TextStyle(
                                            fontSize: 11,
                                            fontWeight: FontWeight.bold,
                                            color: Colors.white)),
                                  ],
                                ),
                              ),
                            ),
                          ),
                        ],
                      ),
                      const SizedBox(height: 16),
                      Container(
                        padding: const EdgeInsets.all(12),
                        decoration: BoxDecoration(
                          color: const Color(0xFF1E293B),
                          borderRadius: BorderRadius.circular(10),
                          border:
                              Border.all(color: const Color(0xFF334155)),
                        ),
                        child: Text(
                          '${preview.length} transactions selected • In ₹${totals.inflow.toStringAsFixed(0)} • Out ₹${totals.outflow.toStringAsFixed(0)}',
                          style: const TextStyle(
                              fontSize: 12, color: Colors.white),
                        ),
                      ),
                      const SizedBox(height: 12),
                      TextField(
                        controller: waCtrl,
                        keyboardType: TextInputType.phone,
                        maxLength: 12,
                        style: const TextStyle(
                            color: Colors.white, fontSize: 13),
                        decoration: const InputDecoration(
                          labelText: 'WhatsApp number (optional, 10 digits)',
                          labelStyle: TextStyle(
                              color: Color(0xFF94A3B8), fontSize: 12),
                          hintText: 'e.g. 98765 43210',
                          hintStyle: TextStyle(
                              color: Colors.white38, fontSize: 12),
                          filled: true,
                          fillColor: Color(0xFF1E293B),
                          counterText: '',
                          border: OutlineInputBorder(
                            borderRadius:
                                BorderRadius.all(Radius.circular(10)),
                            borderSide:
                                BorderSide(color: Color(0xFF334155)),
                          ),
                        ),
                      ),
                      const SizedBox(height: 18),
                      SizedBox(
                        width: double.infinity,
                        child: ElevatedButton.icon(
                          icon: busy
                              ? const SizedBox(
                                  width: 18,
                                  height: 18,
                                  child: CircularProgressIndicator(
                                      strokeWidth: 2,
                                      color: Colors.white))
                              : const Icon(Icons.download_rounded,
                                  color: Colors.white),
                          label: Text(
                              'Download ${selFormat == 'pdf' ? 'PDF' : 'CSV'} statement'),
                          style: ElevatedButton.styleFrom(
                            backgroundColor: AppTheme.primary,
                            // Material 3 defaults an ElevatedButton's
                            // foreground to colorScheme.primary, which is the
                            // same teal as this background — the label paints
                            // invisible without this.
                            foregroundColor: Colors.white,
                            padding:
                                const EdgeInsets.symmetric(vertical: 14),
                            shape: RoundedRectangleBorder(
                                borderRadius: BorderRadius.circular(12)),
                          ),
                          onPressed: busy
                              ? null
                              : () => runExport(
                                  shareFile: false, waText: false),
                        ),
                      ),
                      const SizedBox(height: 10),
                      SizedBox(
                        width: double.infinity,
                        child: OutlinedButton.icon(
                          icon: const Icon(Icons.ios_share_rounded,
                              color: Color(0xFF22C55E)),
                          label: const Text('Send to WhatsApp',
                              style: TextStyle(color: Colors.white)),
                          style: OutlinedButton.styleFrom(
                            side: const BorderSide(
                                color: Color(0xFF22C55E)),
                            padding:
                                const EdgeInsets.symmetric(vertical: 13),
                            shape: RoundedRectangleBorder(
                                borderRadius: BorderRadius.circular(12)),
                          ),
                          onPressed: busy
                              ? null
                              : () => runExport(
                                  shareFile: true, waText: false),
                        ),
                      ),
                      const SizedBox(height: 6),
                      SizedBox(
                        width: double.infinity,
                        child: TextButton.icon(
                          icon: const Icon(Icons.chat_rounded,
                              color: AppTheme.primary, size: 18),
                          label: const Text(
                            'WhatsApp me just the totals',
                            style: TextStyle(
                                color: AppTheme.primary, fontSize: 12),
                          ),
                          onPressed: busy
                              ? null
                              : () => runExport(
                                  shareFile: false, waText: true),
                        ),
                      ),
                    ],
                  ),
                ),
              ),
            );
          },
        );
      },
    ).whenComplete(() {
      closed = true;
      waCtrl.dispose();
    });
  }

  void _showReceiptSheet(BuildContext context, Transaction txn) {
    final isIncome = txn.type == TransactionType.INCOME;
    final statusKey = txn.status.toString().split('.').last;
    final statusLabel =
        statusKey.isEmpty ? statusKey : '${statusKey[0]}${statusKey.substring(1).toLowerCase()}';
    final isSuccessful = txn.status == TransactionStatus.SUCCESSFUL;
    final bankRef = transactionRefLabel(txn);

    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      backgroundColor: const Color(0xFF0F172A),
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(24)),
      ),
      builder: (ctx) => SafeArea(
        child: SingleChildScrollView(
          padding: EdgeInsets.only(
            left: 20,
            right: 20,
            top: 16,
            bottom: MediaQuery.of(ctx).viewInsets.bottom + 20,
          ),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Center(
                child: Container(
                  width: 36,
                  height: 4,
                  margin: const EdgeInsets.only(bottom: 12),
                  decoration: BoxDecoration(
                    color: Colors.grey.withOpacity(0.3),
                    borderRadius: BorderRadius.circular(2),
                  ),
                ),
              ),
              Container(
              width: 54,
              height: 54,
              decoration: BoxDecoration(
                color: isIncome ? const Color(0x2622C55E) : AppTheme.primary.withOpacity(0.15),
                shape: BoxShape.circle,
              ),
              child: Icon(
                isIncome ? Icons.check_circle_outline : Icons.receipt_long,
                color: isIncome ? const Color(0xFF22C55E) : AppTheme.primary,
                size: 30,
              ),
            ),
            const SizedBox(height: 12),
            Text(
              isSuccessful
                  ? (isIncome ? 'Payment Received' : 'Payment Successful')
                  : 'Payment $statusLabel',
              style: const TextStyle(fontSize: 18, fontWeight: FontWeight.bold, color: Colors.white),
            ),
            const SizedBox(height: 6),
            Text(
              '${isIncome ? "+" : "-"}₹${txn.amount.toStringAsFixed(2)}',
              style: TextStyle(
                fontSize: 28,
                fontWeight: FontWeight.w800,
                color: isIncome ? const Color(0xFF22C55E) : Colors.white,
              ),
            ),
            const SizedBox(height: 16),
            Container(
              padding: const EdgeInsets.all(14),
              decoration: BoxDecoration(
                color: const Color(0xFF1E293B),
                borderRadius: BorderRadius.circular(12),
                border: Border.all(color: const Color(0xFF334155)),
              ),
              child: Column(
                children: [
                  _receiptRow('From', receiptPartyLabel(txn.sender)),
                  const Divider(color: Color(0xFF334155), height: 16),
                  _receiptRow('To', receiptPartyLabel(txn.receiver)),
                  const Divider(color: Color(0xFF334155), height: 16),
                  _receiptRow('Category', txn.category.toString().split('.').last),
                  const Divider(color: Color(0xFF334155), height: 16),
                  _receiptRow('Date & Time', transactionTimeLabel(txn.timestamp)),
                  const Divider(color: Color(0xFF334155), height: 16),
                  _receiptRow(
                    bankRef != null ? 'Bank Txn ID' : 'Record ID',
                    bankRef ?? txn.id,
                  ),
                  const Divider(color: Color(0xFF334155), height: 16),
                  _receiptRow('Status', statusLabel),
                ],
              ),
            ),
            const SizedBox(height: 18),
            SizedBox(
              width: double.infinity,
              child: ElevatedButton.icon(
                icon: const Icon(Icons.share_outlined, size: 16, color: Colors.white),
                label: const Text('Share Receipt', style: TextStyle(fontSize: 12, color: Colors.white)),
                style: ElevatedButton.styleFrom(
                  backgroundColor: AppTheme.primary,
                  padding: const EdgeInsets.symmetric(vertical: 12),
                ),
                onPressed: () async {
                  // Real content to the real clipboard — the old button claimed
                  // "copied to clipboard" without copying anything, and the old
                  // "Download PDF" claimed a file was written when none was.
                  final text = transactionReceiptText(txn);
                  await Clipboard.setData(ClipboardData(text: text));
                  if (!ctx.mounted) return;
                  Navigator.pop(ctx);
                  if (!mounted) return;
                  ScaffoldMessenger.of(context).showSnackBar(
                    SnackBar(
                      content: Text(
                        bankRef != null
                            ? 'Receipt (incl. bank Txn ID $bankRef) copied to clipboard.'
                            : 'Receipt copied to clipboard.',
                      ),
                      backgroundColor: const Color(0xFF0D9488),
                    ),
                  );
                },
              ),
            ),
          ],
        ),
      ),
    ));
  }

  Widget _receiptRow(String label, String value) {
    return Row(
      mainAxisAlignment: MainAxisAlignment.spaceBetween,
      children: [
        Text(label, style: const TextStyle(fontSize: 12, color: Color(0xFF94A3B8))),
        Text(value, style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w600, color: Colors.white)),
      ],
    );
  }

  @override
  Widget build(BuildContext context) {
    final state = Provider.of<AppState>(context);
    final theme = Theme.of(context);
    final isDark = theme.brightness == Brightness.dark;
    final double savingsRate = state.thisMonthIncome > 0
        ? (((state.thisMonthIncome - state.thisMonthSpent) / state.thisMonthIncome) * 100).clamp(-100.0, 100.0)
        : 0.0;

    if (state.isChildCareActive) {
      return Scaffold(
        appBar: AppBar(title: const Text('Transactions')),
        body: Center(
          child: Padding(
            padding: const EdgeInsets.all(24),
            child: Text(
              'Detailed transactions are hidden while Child Care Mode is active for privacy and safety.',
              textAlign: TextAlign.center,
              style: TextStyle(
                color: isDark ? AppTheme.textSecondaryDark : AppTheme.textSecondaryLight,
              ),
            ),
          ),
        ),
      );
    }

    final filtered = state.transactions.where((t) {
      final q = _searchQuery.toLowerCase();
      final matchesSearch = q.isEmpty ||
          t.receiver.toLowerCase().contains(q) ||
          t.sender.toLowerCase().contains(q) ||
          transactionPartyLabel(t).toLowerCase().contains(q) ||
          t.referenceId.toLowerCase().contains(q) ||
          t.description.toLowerCase().contains(q) ||
          t.id.toLowerCase().contains(q);
      final matchesCat = _filterCategory == null || t.category == _filterCategory;
      // Period filter: keep transactions within the last N months.
      final cutoff = DateTime.now().subtract(Duration(days: _selectedPeriodMonths * 30));
      final matchesPeriod = !t.timestamp.isBefore(cutoff);
      return matchesSearch && matchesCat && matchesPeriod;
    }).toList()
      ..sort((a, b) => b.timestamp.compareTo(a.timestamp));

    return Scaffold(
      appBar: AppBar(
        title: Text(state.t('transactionsTitle')),
        actions: [
          IconButton(
            icon: Icon(
              state.isSpeaking ? Icons.volume_up_rounded : Icons.volume_up_outlined,
              color: state.isSpeaking ? AppTheme.primary : null,
            ),
            tooltip: state.isSpeaking ? state.t('readAloudStop') : state.t('readAloud'),
            onPressed: () {
              if (state.isSpeaking) {
                state.stopSpeaking();
              } else {
                state.speakHomeNarration();
              }
            },
          ),
          IconButton(
            icon: const Icon(Icons.shield_outlined, color: AppTheme.primaryLight),
            tooltip: 'On-Device Bank Vault',
            onPressed: () => LocalVaultConsentModal.show(context),
          ),
          IconButton(
            icon: const Icon(Icons.file_download_outlined, color: AppTheme.primaryLight),
            tooltip: state.t('downloadStatement'),
            onPressed: () => _showExportStatementSheet(context),
          ),
          IconButton(
            icon: const Icon(Icons.compare_arrows_rounded, color: AppTheme.primaryLight),
            tooltip: 'What Changed?',
            onPressed: () => _showWhatChangedSheet(context),
          ),
        ],
      ),
      body: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          children: [
            // Net Cash Flow Banner (Matches Web Stat Card style)
            Container(
              padding: const EdgeInsets.all(16),
              margin: const EdgeInsets.only(bottom: 12),
              decoration: BoxDecoration(
                color: isDark ? AppTheme.bgCardDark : AppTheme.bgCardLight,
                borderRadius: BorderRadius.circular(14),
                border: Border.all(
                  color: isDark ? AppTheme.borderDark : AppTheme.borderLight,
                ),
                boxShadow: [
                  BoxShadow(
                    color: Colors.black.withOpacity(isDark ? 0.2 : 0.04),
                    blurRadius: 10,
                    offset: const Offset(0, 2),
                  ),
                ],
              ),
              child: Column(
                children: [
                  Row(
                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                    children: [
                      Text(
                        state.t('netCashFlow'),
                        style: TextStyle(
                          fontSize: 11,
                          fontWeight: FontWeight.w700,
                          color: isDark ? AppTheme.textSecondaryDark : AppTheme.textSecondaryLight,
                          letterSpacing: 0.5,
                        ),
                      ),
                      TextButton.icon(
                        icon: const Icon(Icons.insights_rounded, size: 14, color: AppTheme.primary),
                        label: const Text(
                          'What Changed?',
                          style: TextStyle(fontSize: 11, color: AppTheme.primary, fontWeight: FontWeight.bold),
                        ),
                        style: TextButton.styleFrom(
                          padding: EdgeInsets.zero,
                          minimumSize: const Size(50, 20),
                          tapTargetSize: MaterialTapTargetSize.shrinkWrap,
                        ),
                        onPressed: () => _showWhatChangedSheet(context),
                      ),
                    ],
                  ),
                  const SizedBox(height: 6),
                  Row(
                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                    children: [
                      Flexible(
                        child: Text(
                          '${state.thisMonthNetCashFlow >= 0 ? "+" : ""}₹${state.thisMonthNetCashFlow.toStringAsFixed(0)}',
                          style: TextStyle(
                            fontSize: 22,
                            fontWeight: FontWeight.w800,
                            color: state.thisMonthNetCashFlow >= 0 ? AppTheme.success : AppTheme.danger,
                          ),
                          overflow: TextOverflow.ellipsis,
                        ),
                      ),
                      const SizedBox(width: 8),
                      Container(
                        padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                        decoration: BoxDecoration(
                          color: (savingsRate >= 0 ? AppTheme.success : AppTheme.danger).withOpacity(0.12),
                          borderRadius: BorderRadius.circular(8),
                        ),
                        child: Text(
                          '${savingsRate.toStringAsFixed(1)}% Savings Rate',
                          style: TextStyle(
                            fontSize: 11,
                            fontWeight: FontWeight.bold,
                            color: savingsRate >= 0 ? AppTheme.success : AppTheme.danger,
                          ),
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 10),
                  Wrap(
                    spacing: 12,
                    runSpacing: 4,
                    alignment: WrapAlignment.spaceBetween,
                    children: [
                      Text(
                        '${state.t('income')}: ₹${state.thisMonthIncome.toStringAsFixed(0)}',
                        style: TextStyle(fontSize: 11, color: isDark ? AppTheme.textSecondaryDark : AppTheme.textSecondaryLight),
                      ),
                      Text(
                        '${state.t('spent')}: ₹${state.thisMonthSpent.toStringAsFixed(0)}',
                        style: TextStyle(fontSize: 11, color: isDark ? AppTheme.textSecondaryDark : AppTheme.textSecondaryLight),
                      ),
                      Text(
                        'Net: ₹${state.thisMonthNetCashFlow.toStringAsFixed(0)}',
                        style: TextStyle(
                          fontSize: 11,
                          fontWeight: FontWeight.w600,
                          color: state.thisMonthNetCashFlow >= 0 ? AppTheme.success : AppTheme.danger,
                        ),
                      ),
                    ],
                  ),
                ],
              ),
            ),

            // On-Device Bank Vault & SMS Sync Strip
            Container(
              margin: const EdgeInsets.only(bottom: 12),
              padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
              decoration: BoxDecoration(
                color: isDark ? const Color(0xFF1E293B) : const Color(0xFFF1F5F9),
                borderRadius: BorderRadius.circular(12),
                border: Border.all(
                  color: isDark ? const Color(0xFF334155) : const Color(0xFFE2E8F0),
                ),
              ),
              child: Row(
                children: [
                  Container(
                    padding: const EdgeInsets.all(6),
                    decoration: BoxDecoration(
                      color: AppTheme.primary.withOpacity(0.12),
                      shape: BoxShape.circle,
                    ),
                    child: const Icon(Icons.shield_outlined, color: AppTheme.primary, size: 16),
                  ),
                  const SizedBox(width: 8),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Row(
                          mainAxisSize: MainAxisSize.min,
                          children: [
                            Flexible(
                              child: Text(
                                'On-Device Bank Vault',
                                maxLines: 1,
                                overflow: TextOverflow.ellipsis,
                                style: TextStyle(
                                  fontSize: 11.5,
                                  fontWeight: FontWeight.w700,
                                  color: isDark ? Colors.white : AppTheme.textPrimaryLight,
                                ),
                              ),
                            ),
                            const SizedBox(width: 5),
                            Container(
                              padding: const EdgeInsets.symmetric(horizontal: 5, vertical: 1.5),
                              decoration: BoxDecoration(
                                color: AppTheme.success.withOpacity(0.12),
                                borderRadius: BorderRadius.circular(5),
                              ),
                              child: const Text(
                                'Active',
                                style: TextStyle(fontSize: 8.5, fontWeight: FontWeight.bold, color: AppTheme.success),
                              ),
                            ),
                          ],
                        ),
                        const SizedBox(height: 2),
                        Text(
                          state.lastSmsSyncTime != null
                              ? 'Last SMS sync: ${state.lastSmsSyncTime!.hour}:${state.lastSmsSyncTime!.minute.toString().padLeft(2, '0')}'
                              : 'Real bank history stored locally on device',
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: TextStyle(
                            fontSize: 9.5,
                            color: isDark ? const Color(0xFF94A3B8) : const Color(0xFF64748B),
                          ),
                        ),
                      ],
                    ),
                  ),
                  const SizedBox(width: 6),
                  InkWell(
                    onTap: state.isSmsSyncing
                        ? null
                        : () async {
                            // Pressing "Sync SMS" is itself the opt-in to
                            // on-device import — record it so the automatic
                            // background sync is allowed from now on.
                            await LocalTransactionStorageService.setVaultConsent(true);
                            await LocalTransactionStorageService.setSmsSyncConsent(true);
                            final count = await state.syncBankSmsTransactions(forceRequestPermission: true);
                            if (context.mounted) {
                              ScaffoldMessenger.of(context).showSnackBar(
                                SnackBar(
                                  content: Text(
                                    count > 0
                                        ? 'Synced $count bank transactions to local storage!'
                                        : 'No new bank SMS found or permission not granted.',
                                  ),
                                  backgroundColor: count > 0 ? AppTheme.success : AppTheme.primaryDark,
                                  behavior: SnackBarBehavior.floating,
                                ),
                              );
                            }
                          },
                    borderRadius: BorderRadius.circular(8),
                    child: Container(
                      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 6),
                      decoration: BoxDecoration(
                        color: AppTheme.primary,
                        borderRadius: BorderRadius.circular(8),
                      ),
                      child: state.isSmsSyncing
                          ? const SizedBox(
                              width: 14,
                              height: 14,
                              child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white),
                            )
                          : const Row(
                              mainAxisSize: MainAxisSize.min,
                              children: [
                                Icon(Icons.sync_rounded, size: 13, color: Colors.white),
                                SizedBox(width: 3),
                                Text(
                                  'Sync SMS',
                                  style: TextStyle(fontSize: 10.5, fontWeight: FontWeight.bold, color: Colors.white),
                                ),
                              ],
                            ),
                    ),
                  ),
                  const SizedBox(width: 2),
                  IconButton(
                    icon: const Icon(Icons.info_outline, size: 16),
                    color: isDark ? Colors.white60 : Colors.black54,
                    padding: EdgeInsets.zero,
                    constraints: const BoxConstraints(minWidth: 24, minHeight: 24),
                    tooltip: 'Vault Privacy Info',
                    onPressed: () => LocalVaultConsentModal.show(context),
                  ),
                ],
              ),
            ),

            // Search Bar (Web Input style)
            TextField(
              decoration: InputDecoration(
                hintText: state.t('searchHint'),
                hintStyle: TextStyle(
                  color: isDark ? AppTheme.textMutedDark : AppTheme.textSecondaryLight,
                  fontSize: 13,
                ),
                prefixIcon: Icon(
                  Icons.search,
                  size: 20,
                  color: isDark ? AppTheme.textSecondaryDark : AppTheme.textSecondaryLight,
                ),
                filled: true,
                fillColor: isDark ? AppTheme.bgInputDark : AppTheme.bgCardLightSoft,
                border: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(10),
                  borderSide: BorderSide(
                    color: isDark ? AppTheme.borderDark : AppTheme.borderLight,
                  ),
                ),
                enabledBorder: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(10),
                  borderSide: BorderSide(
                    color: isDark ? AppTheme.borderDark : AppTheme.borderLight,
                  ),
                ),
                focusedBorder: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(10),
                  borderSide: const BorderSide(color: AppTheme.primary, width: 1.5),
                ),
                contentPadding: const EdgeInsets.symmetric(vertical: 12, horizontal: 16),
              ),
              onChanged: (val) => setState(() => _searchQuery = val),
            ),
            const SizedBox(height: 10),

            // Period & Category Chips
            SingleChildScrollView(
              scrollDirection: Axis.horizontal,
              child: Row(
                children: [
                  ...[1, 3, 6, 12].map((m) => Padding(
                    padding: const EdgeInsets.only(right: 6),
                    child: ChoiceChip(
                      label: Text(
                        m == 1 ? '1 Month' : m == 12 ? '1 Year' : '$m Months',
                        style: TextStyle(
                          fontSize: 11,
                          fontWeight: _selectedPeriodMonths == m ? FontWeight.bold : FontWeight.normal,
                          color: _selectedPeriodMonths == m ? Colors.white : (isDark ? AppTheme.textSecondaryDark : AppTheme.textSecondaryLight),
                        ),
                      ),
                      selected: _selectedPeriodMonths == m,
                      selectedColor: AppTheme.primary,
                      backgroundColor: isDark ? AppTheme.bgCardDark : AppTheme.bgCardLightSoft,
                      shape: RoundedRectangleBorder(
                        borderRadius: BorderRadius.circular(8),
                        side: BorderSide(
                          color: _selectedPeriodMonths == m ? AppTheme.primary : (isDark ? AppTheme.borderDark : AppTheme.borderLight),
                        ),
                      ),
                      onSelected: (sel) => setState(() => _selectedPeriodMonths = m),
                    ),
                  )),
                  const SizedBox(width: 4),
                  ChoiceChip(
                    label: Text(
                      'All Categories',
                      style: TextStyle(
                        fontSize: 11,
                        fontWeight: _filterCategory == null ? FontWeight.bold : FontWeight.normal,
                        color: _filterCategory == null ? Colors.white : (isDark ? AppTheme.textSecondaryDark : AppTheme.textSecondaryLight),
                      ),
                    ),
                    selected: _filterCategory == null,
                    selectedColor: AppTheme.primary,
                    backgroundColor: isDark ? AppTheme.bgCardDark : AppTheme.bgCardLightSoft,
                    shape: RoundedRectangleBorder(
                      borderRadius: BorderRadius.circular(8),
                      side: BorderSide(
                        color: _filterCategory == null ? AppTheme.primary : (isDark ? AppTheme.borderDark : AppTheme.borderLight),
                      ),
                    ),
                    onSelected: (selected) => setState(() => _filterCategory = null),
                  ),
                  const SizedBox(width: 6),
                  ...TransactionCategory.values.map((cat) {
                    final isSel = _filterCategory == cat;
                    return Padding(
                      padding: const EdgeInsets.only(right: 6),
                      child: ChoiceChip(
                        label: Text(
                          cat.toString().split('.').last,
                          style: TextStyle(
                            fontSize: 11,
                            fontWeight: isSel ? FontWeight.bold : FontWeight.normal,
                            color: isSel ? Colors.white : (isDark ? AppTheme.textSecondaryDark : AppTheme.textSecondaryLight),
                          ),
                        ),
                        selected: isSel,
                        selectedColor: AppTheme.primary,
                        backgroundColor: isDark ? AppTheme.bgCardDark : AppTheme.bgCardLightSoft,
                        shape: RoundedRectangleBorder(
                          borderRadius: BorderRadius.circular(8),
                          side: BorderSide(
                            color: isSel ? AppTheme.primary : (isDark ? AppTheme.borderDark : AppTheme.borderLight),
                          ),
                        ),
                        onSelected: (selected) => setState(() => _filterCategory = selected ? cat : null),
                      ),
                    );
                  }),
                ],
              ),
            ),
            const SizedBox(height: 12),

            // Transactions List
            Expanded(
              child: RefreshIndicator(
                color: AppTheme.primary,
                onRefresh: () => state.refreshAllData(),
                child: filtered.isEmpty
                    ? ListView(
                        children: [
                          const SizedBox(height: 60),
                          Center(
                            child: Column(
                              children: [
                                const Text('📋', style: TextStyle(fontSize: 36)),
                                const SizedBox(height: 10),
                                Text(
                                  'No transactions found',
                                  style: TextStyle(
                                    fontWeight: FontWeight.bold,
                                    fontSize: 14,
                                    color: isDark ? AppTheme.textPrimaryDark : AppTheme.textPrimaryLight,
                                  ),
                                ),
                                const SizedBox(height: 4),
                                Text(
                                  'Try adjusting your search or category filter.',
                                  style: TextStyle(
                                    fontSize: 12,
                                    color: isDark ? AppTheme.textSecondaryDark : AppTheme.textSecondaryLight,
                                  ),
                                ),
                              ],
                            ),
                          ),
                        ],
                      )
                    : ListView.builder(
                        itemCount: filtered.length,
                        itemBuilder: (context, index) {
                          final txn = filtered[index];
                          final isIncome = txn.type == TransactionType.INCOME;

                          return Container(
                            margin: const EdgeInsets.only(bottom: 8),
                            decoration: BoxDecoration(
                              color: isDark ? AppTheme.bgCardDark : AppTheme.bgCardLight,
                              borderRadius: BorderRadius.circular(12),
                              border: Border.all(
                                color: isDark ? AppTheme.borderDark : AppTheme.borderLight,
                              ),
                            ),
                            child: ListTile(
                              onTap: () => _showReceiptSheet(context, txn),
                              leading: Container(
                                width: 38,
                                height: 38,
                                decoration: BoxDecoration(
                                  color: isIncome
                                      ? const Color(0x1F22C55E)
                                      : const Color(0x1FEF4444),
                                  borderRadius: BorderRadius.circular(10),
                                ),
                                alignment: Alignment.center,
                                child: Text(
                                  isIncome ? '📈' : '📉',
                                  style: const TextStyle(fontSize: 16),
                                ),
                              ),
                              title: Text(
                                transactionPartyLabel(txn),
                                maxLines: 1,
                                overflow: TextOverflow.ellipsis,
                                style: TextStyle(
                                  fontWeight: FontWeight.w600,
                                  fontSize: 13,
                                  color: isDark ? AppTheme.textPrimaryDark : AppTheme.textPrimaryLight,
                                ),
                              ),
                              subtitle: Padding(
                                padding: const EdgeInsets.only(top: 2),
                                child: Column(
                                  crossAxisAlignment: CrossAxisAlignment.start,
                                  children: [
                                    Wrap(
                                      crossAxisAlignment: WrapCrossAlignment.center,
                                      spacing: 4,
                                      runSpacing: 2,
                                      children: [
                                        Text(
                                          '${transactionTimeLabel(txn.timestamp)} • ${txn.category.toString().split('.').last}',
                                          style: TextStyle(
                                            fontSize: 10.5,
                                            color: isDark ? AppTheme.textSecondaryDark : AppTheme.textSecondaryLight,
                                          ),
                                        ),
                                        if (txn.id.contains('sms') || txn.description.contains('A/c') || txn.paymentMethod == 'Bank Transfer')
                                          Container(
                                            padding: const EdgeInsets.symmetric(horizontal: 5, vertical: 1),
                                            decoration: BoxDecoration(
                                              color: AppTheme.primary.withValues(alpha: 0.12),
                                              borderRadius: BorderRadius.circular(4),
                                            ),
                                            child: const Text(
                                              'Bank SMS',
                                              style: TextStyle(fontSize: 8, fontWeight: FontWeight.bold, color: AppTheme.primary),
                                            ),
                                          ),
                                      ],
                                    ),
                                    if (transactionRefLabel(txn) != null)
                                      Padding(
                                        padding: const EdgeInsets.only(top: 1),
                                        child: Text(
                                          'Txn ID ${transactionRefLabel(txn)}',
                                          maxLines: 1,
                                          overflow: TextOverflow.ellipsis,
                                          style: TextStyle(
                                            fontSize: 9.5,
                                            letterSpacing: 0.2,
                                            color: isDark ? AppTheme.textSecondaryDark : AppTheme.textSecondaryLight,
                                          ),
                                        ),
                                      ),
                                  ],
                                ),
                              ),
                              trailing: Column(
                                mainAxisAlignment: MainAxisAlignment.center,
                                crossAxisAlignment: CrossAxisAlignment.end,
                                children: [
                                  Text(
                                    '${isIncome ? "+" : "-"}₹${txn.amount.toStringAsFixed(2)}',
                                    style: TextStyle(
                                      fontWeight: FontWeight.w700,
                                      fontSize: 13,
                                      color: isIncome ? AppTheme.success : AppTheme.danger,
                                    ),
                                  ),
                                  const SizedBox(height: 2),
                                  Container(
                                    padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 1),
                                    decoration: BoxDecoration(
                                      color: isIncome
                                          ? AppTheme.success.withOpacity(0.1)
                                          : AppTheme.danger.withOpacity(0.1),
                                      borderRadius: BorderRadius.circular(4),
                                    ),
                                    child: Text(
                                      txn.status.toString().split('.').last,
                                      style: TextStyle(
                                        fontSize: 9,
                                        fontWeight: FontWeight.bold,
                                        color: isIncome ? AppTheme.success : AppTheme.danger,
                                      ),
                                    ),
                                  ),
                                ],
                              ),
                            ),
                          );
                        },
                      ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}
