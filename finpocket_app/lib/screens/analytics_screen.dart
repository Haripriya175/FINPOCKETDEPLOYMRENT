import 'dart:math' as math;

import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../models/models.dart';
import '../providers/app_state.dart';
import '../services/api_service.dart';
import '../theme/app_theme.dart';
import 'transactions_screen.dart';

/// Spending Analytics — a visual breakdown of where the money goes.
///
/// Deliberately additive: reached from a single icon on the Home app bar and
/// styled with the app's own theme tokens (dark cards, teal accents) so the
/// rest of FinPocket's UI is untouched.
///
/// Data comes from `GET /financial/monthly-history` — one bucket per calendar
/// month plus per-category monthly totals — so every point on the charts is a
/// real sum of the user's transactions.
class AnalyticsScreen extends StatefulWidget {
  const AnalyticsScreen({super.key});

  @override
  State<AnalyticsScreen> createState() => _AnalyticsScreenState();
}

class _AnalyticsScreenState extends State<AnalyticsScreen> {
  late Future<Map<String, dynamic>> _history;

  @override
  void initState() {
    super.initState();
    _history = ApiService.getMonthlyHistory(months: 8);
  }

  void _retry() {
    setState(() => _history = ApiService.getMonthlyHistory(months: 8));
  }

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;

    return Scaffold(
      backgroundColor: isDark ? AppTheme.bgDark : AppTheme.bgLight,
      appBar: AppBar(
        title: const Text('Analytics'),
        centerTitle: true,
      ),
      body: FutureBuilder<Map<String, dynamic>>(
        future: _history,
        builder: (context, snap) {
          if (snap.connectionState != ConnectionState.done) {
            return const Center(
              child: CircularProgressIndicator(color: AppTheme.primary),
            );
          }
          if (snap.hasError || !snap.hasData) {
            return _StatusView(
              isDark: isDark,
              icon: Icons.cloud_off_rounded,
              title: 'Could not load analytics',
              message: 'Check your connection and try again.',
              onRetry: _retry,
            );
          }
          final data = snap.data!;
          final history = (data['history'] as List<dynamic>? ?? [])
              .map((e) => _MonthPoint.fromJson(e as Map<String, dynamic>))
              .toList();
          final categories = (data['categories'] as List<dynamic>? ?? [])
              .map((e) => _CategorySeries.fromJson(e as Map<String, dynamic>))
              .toList();
          if (history.isEmpty) {
            return _StatusView(
              isDark: isDark,
              icon: Icons.insights_rounded,
              title: 'No spending history yet',
              message: 'Once expenses start flowing in, your spending curve '
                  'and category trends appear here.',
              onRetry: _retry,
            );
          }
          return _buildBody(context, isDark, history, categories);
        },
      ),
    );
  }

  Widget _buildBody(
    BuildContext context,
    bool isDark,
    List<_MonthPoint> history,
    List<_CategorySeries> categories,
  ) {
    final state = Provider.of<AppState>(context);
    final last = history.last;
    final prev = history.length > 1 ? history[history.length - 2] : null;

    // Share of this month's income that has been spent (the headline %).
    final spentPct = last.income > 0 ? (last.expenses / last.income) * 100 : null;
    // Month-over-month change in spending, for the delta chip.
    final deltaPct = (prev != null && prev.expenses > 0)
        ? ((last.expenses - prev.expenses) / prev.expenses) * 100
        : null;

    final cardDecoration = BoxDecoration(
      color: isDark ? AppTheme.bgCardDark : AppTheme.bgCardLight,
      borderRadius: BorderRadius.circular(16),
      border: Border.all(color: isDark ? AppTheme.borderDark : AppTheme.borderLight),
      boxShadow: const [
        BoxShadow(color: Color(0x14000000), blurRadius: 10, offset: Offset(0, 4)),
      ],
    );

    final expenses =
        history.map((p) => p.expenses).toList(growable: false);

    return ListView(
      padding: const EdgeInsets.all(16),
      children: [
        // ==========================================
        // SPENDING OVERVIEW (headline area chart)
        // ==========================================
        Container(
          padding: const EdgeInsets.all(16),
          decoration: cardDecoration,
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        const Text(
                          'Spending Overview',
                          style: TextStyle(
                            fontSize: 16,
                            fontWeight: FontWeight.w700,
                            color: Colors.white,
                          ),
                        ),
                        const SizedBox(height: 2),
                        Text(
                          'Last update: ${_lastUpdateLabel(DateTime.now())}',
                          style: const TextStyle(
                              fontSize: 10, color: Color(0xFF64748B)),
                        ),
                      ],
                    ),
                  ),
                  Column(
                    crossAxisAlignment: CrossAxisAlignment.end,
                    children: [
                      Text(
                        spentPct != null
                            ? '${spentPct.round()}%'
                            : AnalyticsScreenStateUtils.rupees(last.expenses),
                        style: TextStyle(
                          fontSize: 26,
                          fontWeight: FontWeight.w800,
                          color: _pctColor(spentPct),
                          letterSpacing: -0.5,
                        ),
                      ),
                      Text(
                        spentPct != null ? 'of income spent' : 'spent this month',
                        style: const TextStyle(
                            fontSize: 9, color: Color(0xFF64748B)),
                      ),
                    ],
                  ),
                ],
              ),
              const SizedBox(height: 14),
              SizedBox(
                height: 156,
                width: double.infinity,
                child: CustomPaint(
                  painter: AreaChartPainter(
                    values: expenses,
                    labels: history.map((p) => p.label).toList(),
                    accent: AppTheme.primary,
                  ),
                ),
              ),
              if (deltaPct != null) ...[
                const SizedBox(height: 10),
                Container(
                  padding:
                      const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                  decoration: BoxDecoration(
                    color: (deltaPct > 0 ? const Color(0xFFF87171) : AppTheme.primary)
                        .withOpacity(0.12),
                    borderRadius: BorderRadius.circular(20),
                  ),
                  child: Text(
                    '${deltaPct > 0 ? '▲' : '▼'} ${deltaPct.abs().toStringAsFixed(1)}% vs last month',
                    style: TextStyle(
                      fontSize: 10,
                      fontWeight: FontWeight.w700,
                      color: deltaPct > 0 ? const Color(0xFFF87171) : AppTheme.primary,
                    ),
                  ),
                ),
              ],
            ],
          ),
        ),

        // ==========================================
        // TOP CATEGORY CARDS (sparklines)
        // ==========================================
        if (categories.isNotEmpty) ...[
          const SizedBox(height: 16),
          Row(
            children: [
              for (var i = 0; i < math.min(2, categories.length); i++) ...[
                if (i > 0) const SizedBox(width: 12),
                Expanded(
                  child: _CategoryCard(
                    category: categories[i],
                    lastMonthTotal: last.expenses,
                    overallTotal: expenses.fold(0.0, (s, v) => s + v),
                    decoration: cardDecoration,
                  ),
                ),
              ],
            ],
          ),
        ],

        // ==========================================
        // SPENDING TRANSACTIONS
        // ==========================================
        const SizedBox(height: 16),
        Container(
          padding: const EdgeInsets.all(16),
          decoration: cardDecoration,
          child: Builder(
            builder: (context) {
              final recent = state.transactions
                  .where((t) => t.isExpense)
                  .toList()
                ..sort((a, b) => b.timestamp.compareTo(a.timestamp));
              final top = recent.take(5).toList();
              return Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    children: [
                      const Expanded(
                        child: Text(
                          'Spending Transactions',
                          style: TextStyle(
                            fontSize: 15,
                            fontWeight: FontWeight.w700,
                            color: Colors.white,
                          ),
                        ),
                      ),
                      GestureDetector(
                        onTap: () {
                          Navigator.push(
                            context,
                            MaterialPageRoute(
                                builder: (_) => const TransactionsScreen()),
                          );
                        },
                        child: const Text(
                          'See all',
                          style: TextStyle(
                            fontSize: 12,
                            fontWeight: FontWeight.w700,
                            color: AppTheme.primary,
                          ),
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 6),
                  if (top.isEmpty)
                    const Padding(
                      padding: EdgeInsets.symmetric(vertical: 12),
                      child: Text(
                        'No spending recorded yet.',
                        style:
                            TextStyle(fontSize: 12, color: Color(0xFF64748B)),
                      ),
                    )
                  else
                    for (final txn in top) _TransactionRow(txn: txn),
                ],
              );
            },
          ),
        ),
        const SizedBox(height: 24),
      ],
    );
  }

  static Color _pctColor(double? pct) {
    if (pct == null) return Colors.white;
    if (pct < 70) return AppTheme.primary;
    if (pct < 90) return const Color(0xFFF59E0B);
    return const Color(0xFFF87171);
  }

  static String _lastUpdateLabel(DateTime t) {
    final h = t.hour % 12 == 0 ? 12 : t.hour % 12;
    final ampm = t.hour < 12 ? 'am' : 'pm';
    final mm = t.minute.toString().padLeft(2, '0');
    return '${t.day}/${t.month}/${t.year} at $h.$mm $ampm';
  }
}

// =============================================================================
// Data models
// =============================================================================

class _MonthPoint {
  final String label;
  final double income;
  final double expenses;

  const _MonthPoint(
      {required this.label, required this.income, required this.expenses});

  factory _MonthPoint.fromJson(Map<String, dynamic> j) => _MonthPoint(
        label: (j['label'] ?? '').toString(),
        income: (j['income'] as num? ?? 0).toDouble(),
        expenses: (j['expenses'] as num? ?? 0).toDouble(),
      );
}

class _CategorySeries {
  final String name;
  final String hexColor;
  final String icon;
  final double total;
  final List<double> monthly;

  const _CategorySeries({
    required this.name,
    required this.hexColor,
    required this.icon,
    required this.total,
    required this.monthly,
  });

  factory _CategorySeries.fromJson(Map<String, dynamic> j) =>
      _CategorySeries(
        name: (j['name'] ?? 'Other').toString(),
        hexColor: (j['color'] ?? '#14B8A6').toString(),
        icon: (j['icon'] ?? '📦').toString(),
        total: (j['total'] as num? ?? 0).toDouble(),
        monthly: (j['monthly'] as List<dynamic>? ?? [])
            .map((e) => (e as num).toDouble())
            .toList(),
      );

  Color get color {
    var hex = hexColor.replaceFirst('#', '').replaceFirst('0x', '');
    if (hex.length == 6) hex = 'FF$hex';
    final value = int.tryParse(hex, radix: 16);
    return value == null ? AppTheme.primary : Color(value);
  }
}

// =============================================================================
// Widgets
// =============================================================================

class _CategoryCard extends StatelessWidget {
  final _CategorySeries category;
  final double lastMonthTotal;
  final double overallTotal;
  final BoxDecoration decoration;

  const _CategoryCard({
    required this.category,
    required this.lastMonthTotal,
    required this.overallTotal,
    required this.decoration,
  });

  @override
  Widget build(BuildContext context) {
    final thisMonth =
        category.monthly.isNotEmpty ? category.monthly.last : 0.0;
    double sharePct;
    if (lastMonthTotal > 0) {
      sharePct = (thisMonth / lastMonthTotal) * 100;
    } else {
      sharePct = overallTotal > 0 ? (category.total / overallTotal) * 100 : 0;
    }
    final accent = category.color;

    return Container(
      padding: const EdgeInsets.all(14),
      decoration: decoration,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Expanded(
                child: Text(
                  category.name,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: const TextStyle(
                    fontSize: 13,
                    fontWeight: FontWeight.w700,
                    color: Colors.white,
                  ),
                ),
              ),
              Container(
                padding:
                    const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                decoration: BoxDecoration(
                  color: accent.withOpacity(0.15),
                  borderRadius: BorderRadius.circular(20),
                ),
                child: Text(
                  'Monthly',
                  style: TextStyle(
                    fontSize: 8.5,
                    fontWeight: FontWeight.w700,
                    color: accent,
                  ),
                ),
              ),
            ],
          ),
          const SizedBox(height: 4),
          SizedBox(
            height: 48,
            width: double.infinity,
            child: CustomPaint(
              painter: SparklinePainter(
                values: category.monthly,
                accent: accent,
              ),
            ),
          ),
          Row(
            crossAxisAlignment: CrossAxisAlignment.end,
            children: [
              Text(
                '${sharePct.round()}%',
                style: const TextStyle(
                  fontSize: 20,
                  fontWeight: FontWeight.w800,
                  color: Colors.white,
                  letterSpacing: -0.5,
                ),
              ),
              const Spacer(),
              Flexible(
                child: Text(
                  AnalyticsScreenStateUtils.rupees(
                      thisMonth > 0 ? thisMonth : category.total),
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  textAlign: TextAlign.right,
                  style: const TextStyle(
                    fontSize: 11,
                    fontWeight: FontWeight.w600,
                    color: Color(0xFF94A3B8),
                  ),
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }
}

class _TransactionRow extends StatelessWidget {
  final Transaction txn;

  const _TransactionRow({required this.txn});

  static const Map<String, String> _categoryEmoji = {
    'Food': '🍽️',
    'Shopping': '🛍️',
    'Travel': '🚕',
    'Bills': '🧾',
    'Education': '📚',
    'Entertainment': '🎬',
    'Health': '🏥',
    'Rent': '🏠',
    'EMI': '💳',
    'Investment': '📈',
    'Savings': '🏦',
    'Salary': '💰',
    'Other': '📦',
  };

  static const List<String> _monthNames = [
    'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
    'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
  ];

  @override
  Widget build(BuildContext context) {
    final emoji = _categoryEmoji[txn.category.name] ?? '📦';
    final d = txn.timestamp;
    final dateLabel =
        '${d.day} ${_monthNames[d.month - 1]} ${d.year}';
    final amountLabel =
        '${txn.isExpense ? '-' : '+'}${AnalyticsScreenStateUtils.rupees(txn.amount)}';

    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 6),
      child: Row(
        children: [
          Container(
            width: 36,
            height: 36,
            decoration: BoxDecoration(
              color: AppTheme.primary.withOpacity(0.12),
              borderRadius: BorderRadius.circular(10),
            ),
            alignment: Alignment.center,
            child: Text(emoji, style: const TextStyle(fontSize: 15)),
          ),
          const SizedBox(width: 10),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  txn.description.isNotEmpty
                      ? txn.description
                      : txn.merchant ?? txn.category.name,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: const TextStyle(
                    fontSize: 12.5,
                    fontWeight: FontWeight.w600,
                    color: Colors.white,
                  ),
                ),
                const SizedBox(height: 1),
                Text(
                  dateLabel,
                  style: const TextStyle(
                      fontSize: 10, color: Color(0xFF64748B)),
                ),
              ],
            ),
          ),
          const SizedBox(width: 8),
          Text(
            amountLabel,
            style: TextStyle(
              fontSize: 13,
              fontWeight: FontWeight.w700,
              color: txn.isExpense
                  ? const Color(0xFFF87171)
                  : AppTheme.primary,
            ),
          ),
        ],
      ),
    );
  }
}

/// Shared ₹ formatting with Indian-style thousands separators (1,23,456).
class AnalyticsScreenStateUtils {
  static String rupees(double v) {
    final sign = v < 0 ? '-' : '';
    final s = v.abs().round().toString();
    if (s.length <= 3) return '$sign₹$s';
    final parts = <String>[s.substring(s.length - 3)];
    var rest = s.substring(0, s.length - 3);
    while (rest.length > 2) {
      parts.insert(0, rest.substring(rest.length - 2));
      rest = rest.substring(0, rest.length - 2);
    }
    if (rest.isNotEmpty) parts.insert(0, rest);
    return '$sign₹${parts.join(',')}';
  }
}

class _StatusView extends StatelessWidget {
  final bool isDark;
  final IconData icon;
  final String title;
  final String message;
  final VoidCallback? onRetry;

  const _StatusView({
    required this.isDark,
    required this.icon,
    required this.title,
    required this.message,
    this.onRetry,
  });

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(32),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(icon, size: 46, color: const Color(0xFF334155)),
            const SizedBox(height: 14),
            Text(
              title,
              textAlign: TextAlign.center,
              style: const TextStyle(
                fontSize: 15,
                fontWeight: FontWeight.w700,
                color: Colors.white,
              ),
            ),
            const SizedBox(height: 6),
            Text(
              message,
              textAlign: TextAlign.center,
              style: const TextStyle(fontSize: 12, color: Color(0xFF94A3B8)),
            ),
            if (onRetry != null) ...[
              const SizedBox(height: 18),
              TextButton.icon(
                onPressed: onRetry,
                icon: const Icon(Icons.refresh_rounded,
                    size: 18, color: AppTheme.primary),
                label: const Text(
                  'Retry',
                  style: TextStyle(
                      color: AppTheme.primary, fontWeight: FontWeight.w700),
                ),
              ),
            ],
          ],
        ),
      ),
    );
  }
}

// =============================================================================
// Painters (charts drawn by hand — no external chart package)
// =============================================================================

/// Smooth monthly spending area chart with grid lines, compact ₹ axis labels
/// and a glowing marker + tooltip on the most recent month.
class AreaChartPainter extends CustomPainter {
  final List<double> values;
  final List<String> labels;
  final Color accent;

  AreaChartPainter({
    required this.values,
    required this.labels,
    required this.accent,
  });

  @override
  void paint(Canvas canvas, Size size) {
    if (values.isEmpty) return;

    const leftPad = 42.0, rightPad = 12.0, topPad = 30.0, bottomPad = 20.0;
    final chartW = size.width - leftPad - rightPad;
    final chartH = size.height - topPad - bottomPad;
    if (chartW <= 0 || chartH <= 0) return;

    final maxV = values.reduce(math.max);
    final niceMax = _niceCeil(maxV <= 0 ? 1.0 : maxV);

    final pts = <Offset>[
      for (var i = 0; i < values.length; i++)
        Offset(
          leftPad +
              (values.length == 1
                  ? chartW / 2
                  : chartW * i / (values.length - 1)),
          topPad + chartH * (1 - (values[i] / niceMax)),
        ),
    ];

    // Grid lines + compact ₹ labels on the left.
    final gridPaint = Paint()
      ..color = const Color(0x14FFFFFF)
      ..strokeWidth = 1;
    const labelStyle =
        TextStyle(fontSize: 8.5, color: Color(0xFF64748B));
    for (var g = 0; g <= 4; g++) {
      final y = topPad + chartH * g / 4;
      canvas.drawLine(Offset(leftPad, y), Offset(size.width - rightPad, y), gridPaint);
      _paintText(
        canvas,
        _compact(niceMax * (1 - g / 4)),
        Offset(2, y - 5.5),
        labelStyle,
      );
    }

    // Smooth line + gradient-filled area beneath it.
    final line = _smoothPath(pts);
    final area = Path.from(line)
      ..lineTo(pts.last.dx, topPad + chartH)
      ..lineTo(pts.first.dx, topPad + chartH)
      ..close();
    canvas.drawPath(
      area,
      Paint()
        ..shader = LinearGradient(
          begin: Alignment.topCenter,
          end: Alignment.bottomCenter,
          colors: [accent.withOpacity(0.38), accent.withOpacity(0.02)],
        ).createShader(Offset.zero & size),
    );
    canvas.drawPath(
      line,
      Paint()
        ..color = accent
        ..style = PaintingStyle.stroke
        ..strokeWidth = 2.4
        ..strokeCap = StrokeCap.round,
    );

    // Marker + tooltip on the latest month.
    final m = pts.last;
    canvas.drawCircle(m, 11, Paint()..color = accent.withOpacity(0.18));
    canvas.drawCircle(
      m,
      5,
      Paint()
        ..color = Colors.white
        ..style = PaintingStyle.stroke
        ..strokeWidth = 2,
    );
    canvas.drawCircle(m, 2.8, Paint()..color = accent);

    final tip = _compact(values.last);
    final tp = TextPainter(
      text: TextSpan(
        text: tip,
        style: const TextStyle(
          fontSize: 10,
          fontWeight: FontWeight.w700,
          color: Colors.white,
        ),
      ),
      textDirection: TextDirection.ltr,
    )..layout();
    final bw = tp.width + 16, bh = 21.0;
    var bx = (m.dx - bw / 2).clamp(leftPad, size.width - rightPad - bw);
    final by = (m.dy - bh - 12).clamp(0.0, size.height - bh);
    final rrect =
        RRect.fromRectAndRadius(Rect.fromLTWH(bx, by, bw, bh), const Radius.circular(6));
    canvas.drawRRect(rrect, Paint()..color = const Color(0xFF0B1220));
    canvas.drawRRect(
      rrect,
      Paint()
        ..color = accent.withOpacity(0.6)
        ..style = PaintingStyle.stroke
        ..strokeWidth = 1,
    );
    tp.paint(canvas, Offset(bx + 8, by + 4.5));

    // Month labels under each point.
    for (var i = 0; i < labels.length && i < pts.length; i++) {
      final lp = TextPainter(
        text: TextSpan(text: labels[i], style: labelStyle),
        textDirection: TextDirection.ltr,
      )..layout();
      lp.paint(canvas, Offset(pts[i].dx - lp.width / 2, size.height - 13));
    }
  }

  /// Rounds a maximum value up to a friendly axis ceiling (1 / 2 / 2.5 / 5 × 10ⁿ).
  static double _niceCeil(double v) {
    final exp = (math.log(v) / math.ln10).floor();
    final pow10 = math.pow(10, exp).toDouble();
    final f = v / pow10;
    final nice = f <= 1
        ? 1.0
        : f <= 2
            ? 2.0
            : f <= 2.5
                ? 2.5
                : f <= 5
                    ? 5.0
                    : 10.0;
    return nice * pow10;
  }

  /// Quadratic-smoothed polyline through the points (midpoint control
  /// points), which reads like the hand-drawn curve in mockups without the
  /// overshoot of full cubic splines.
  static Path _smoothPath(List<Offset> pts) {
    final path = Path()..moveTo(pts.first.dx, pts.first.dy);
    for (var i = 0; i < pts.length - 1; i++) {
      final p0 = pts[i], p1 = pts[i + 1];
      final midX = (p0.dx + p1.dx) / 2;
      path.cubicTo(midX, p0.dy, midX, p1.dy, p1.dx, p1.dy);
    }
    return path;
  }

  static String _compact(double v) {
    if (v >= 100000) return '₹${(v / 100000).toStringAsFixed(1)}L';
    if (v >= 1000) {
      return '₹${(v / 1000).toStringAsFixed(v >= 10000 ? 0 : 1)}k';
    }
    return '₹${v.round()}';
  }

  static void _paintText(
      Canvas canvas, String text, Offset at, TextStyle style) {
    final tp = TextPainter(
      text: TextSpan(text: text, style: style),
      textDirection: TextDirection.ltr,
    )..layout();
    tp.paint(canvas, at);
  }

  @override
  bool shouldRepaint(covariant AreaChartPainter old) =>
      old.values != values || old.labels != labels || old.accent != accent;
}

/// Tiny category trend line for the summary cards — same smoothing as the
/// big chart, with a marker dot on the latest month.
class SparklinePainter extends CustomPainter {
  final List<double> values;
  final Color accent;

  SparklinePainter({required this.values, required this.accent});

  @override
  void paint(Canvas canvas, Size size) {
    if (values.isEmpty || size.width <= 0 || size.height <= 0) return;

    const pad = 5.0;
    final w = size.width - pad * 2;
    final h = size.height - pad * 2;
    final maxV = values.reduce(math.max);
    final scale = maxV <= 0 ? 1.0 : maxV;

    final pts = <Offset>[
      for (var i = 0; i < values.length; i++)
        Offset(
          pad + (values.length == 1 ? w / 2 : w * i / (values.length - 1)),
          pad + h * (1 - (values[i] / scale)),
        ),
    ];

    final line = AreaChartPainter._smoothPath(pts);
    final area = Path.from(line)
      ..lineTo(pts.last.dx, pad + h)
      ..lineTo(pts.first.dx, pad + h)
      ..close();
    canvas.drawPath(
      area,
      Paint()
        ..shader = LinearGradient(
          begin: Alignment.topCenter,
          end: Alignment.bottomCenter,
          colors: [accent.withOpacity(0.30), accent.withOpacity(0.0)],
        ).createShader(Offset.zero & size),
    );
    canvas.drawPath(
      line,
      Paint()
        ..color = accent
        ..style = PaintingStyle.stroke
        ..strokeWidth = 1.8
        ..strokeCap = StrokeCap.round,
    );

    final m = pts.last;
    canvas.drawCircle(m, 6, Paint()..color = accent.withOpacity(0.20));
    canvas.drawCircle(m, 3, Paint()..color = accent);
  }

  @override
  bool shouldRepaint(covariant SparklinePainter old) =>
      old.values != values || old.accent != accent;
}
