import 'dart:math' as math;
import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../models/models.dart';
import '../providers/app_state.dart';
import '../theme/app_theme.dart';

class EmiManagerModal extends StatefulWidget {
  const EmiManagerModal({super.key});

  static Future<void> show(BuildContext context) {
    return showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      builder: (ctx) => const EmiManagerModal(),
    );
  }

  @override
  State<EmiManagerModal> createState() => _EmiManagerModalState();
}

class _EmiManagerModalState extends State<EmiManagerModal> {
  final _nameController = TextEditingController();
  final _emiAmountController = TextEditingController();
  final _remainingAmountController = TextEditingController();
  final _tenureController = TextEditingController(text: '12');
  final _dueDayController = TextEditingController(text: '5');
  bool _isAdding = false;

  @override
  void dispose() {
    _nameController.dispose();
    _emiAmountController.dispose();
    _remainingAmountController.dispose();
    _tenureController.dispose();
    _dueDayController.dispose();
    super.dispose();
  }

  void _saveEmi(AppState state) {
    final name = _nameController.text.trim();
    final emiAmt = double.tryParse(_emiAmountController.text) ?? 0.0;
    final remainingAmt = double.tryParse(_remainingAmountController.text) ?? (emiAmt * 12);
    final tenure = int.tryParse(_tenureController.text) ?? 12;
    final dueDay = int.tryParse(_dueDayController.text) ?? 5;

    if (name.isEmpty || emiAmt <= 0) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Please enter loan name and monthly EMI amount.')),
      );
      return;
    }

    final newEmi = EMILoan(
      id: 'emi_${DateTime.now().millisecondsSinceEpoch}',
      loanName: name,
      totalAmount: remainingAmt,
      monthlyEMI: emiAmt,
      totalTenureMonths: tenure,
      paidMonths: 0,
      remainingAmount: remainingAmt,
      interestRate: 13.5,
      nextDueDate: DateTime(DateTime.now().year, DateTime.now().month, dueDay.clamp(1, 28)),
      isPaidThisMonth: false,
    );

    state.addEmiLoan(newEmi);

    // Start the monthly coaching loop immediately rather than waiting for the
    // next app launch — the user should see what they just opted into.
    state.addNotification(
      AppNotification(
        id: 'emi_added_${DateTime.now().millisecondsSinceEpoch}',
        title: '🏦 EMI guidance started: $name',
        message:
            '₹${newEmi.monthlyEMI.toStringAsFixed(0)} due on day $dueDay for '
            '${newEmi.totalTenureMonths} months. You have ${newEmi.remainingTenureMonths} '
            'instalments left — FinPocket will remind you every month until ₹${newEmi.remainingAmount.toStringAsFixed(0)} is fully cleared.',
        type: NotificationType.emiReminder,
        timestamp: DateTime.now(),
        data: {'emiId': newEmi.id, 'monthlyEMI': newEmi.monthlyEMI},
      ),
    );

    setState(() {
      _isAdding = false;
      _nameController.clear();
      _emiAmountController.clear();
      _remainingAmountController.clear();
    });

    if (!mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        backgroundColor: AppTheme.success,
        content: Text('Added $name EMI. Monthly guidance is now active!'),
      ),
    );
  }

  Future<void> _confirmRemoveEmi(AppState state, EMILoan emi) async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        backgroundColor: const Color(0xFF0F172A),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
        title: const Text('Remove this loan?',
            style: TextStyle(color: Colors.white, fontSize: 15)),
        content: Text(
          '${emi.loanName} will no longer appear in your monthly guidance.',
          style: const TextStyle(color: Colors.white70, fontSize: 13),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx, false),
            child: const Text('Keep',
                style: TextStyle(color: Colors.white60, fontWeight: FontWeight.bold)),
          ),
          ElevatedButton(
            style: ElevatedButton.styleFrom(backgroundColor: const Color(0xFFEF4444)),
            onPressed: () => Navigator.pop(ctx, true),
            child: const Text('Remove', style: TextStyle(color: Colors.white)),
          ),
        ],
      ),
    );
    if (confirmed != true) return;
    state.removeEmiLoan(emi.id);
  }

  @override
  Widget build(BuildContext context) {
    final state = Provider.of<AppState>(context);
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final emis = state.emis;
    final activeEmis = state.activeEmis;
    final clearedEmis = emis.where((e) => e.isCleared).toList();

    final totalMonthlyEmi = emis.fold(0.0, (sum, e) => sum + e.monthlyEMI);
    final totalRemainingDebt = emis.fold(0.0, (sum, e) => sum + e.remainingAmount);

    final double keyboardHeight = MediaQuery.of(context).viewInsets.bottom;
    final double screenHeight = MediaQuery.of(context).size.height;
    final double sheetHeight = keyboardHeight > 0
        ? math.max(280.0, screenHeight - keyboardHeight - 16)
        : screenHeight * 0.90;

    return Padding(
      padding: EdgeInsets.only(bottom: keyboardHeight),
      child: Container(
        height: sheetHeight,
        decoration: BoxDecoration(
          color: isDark ? const Color(0xFF0F172A) : Colors.white,
          borderRadius: const BorderRadius.vertical(top: Radius.circular(24)),
          border: Border.all(color: isDark ? AppTheme.borderDark : AppTheme.borderLight),
        ),
      padding: const EdgeInsets.fromLTRB(20, 16, 20, 20),
      child: Column(
        children: [
          // Drag handle
          Center(
            child: Container(
              width: 40,
              height: 4,
              margin: const EdgeInsets.only(bottom: 14),
              decoration: BoxDecoration(
                color: Colors.grey.withOpacity(0.3),
                borderRadius: BorderRadius.circular(2),
              ),
            ),
          ),

          // Header
          Row(
            children: [
              Container(
                padding: const EdgeInsets.all(10),
                decoration: BoxDecoration(
                  color: const Color(0xFFF59E0B).withOpacity(0.15),
                  borderRadius: BorderRadius.circular(12),
                ),
                child: const Text('💳', style: TextStyle(fontSize: 20)),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      'EMI & Debt Freedom Guide',
                      style: TextStyle(
                        fontSize: 17,
                        fontWeight: FontWeight.w800,
                        color: isDark ? AppTheme.textPrimaryDark : AppTheme.textPrimaryLight,
                      ),
                    ),
                    Text(
                      'Monthly step-by-step guidance until you clear all loans',
                      style: TextStyle(fontSize: 11, color: isDark ? AppTheme.textSecondaryDark : AppTheme.textSecondaryLight),
                    ),
                  ],
                ),
              ),
              IconButton(
                icon: const Icon(Icons.close_rounded, size: 20),
                onPressed: () => Navigator.pop(context),
              ),
            ],
          ),
          const SizedBox(height: 14),

          // Scrollable body
          Expanded(
            child: SingleChildScrollView(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  // Debt Overview Card
                  Container(
                    padding: const EdgeInsets.all(16),
                    decoration: BoxDecoration(
                      gradient: LinearGradient(
                        colors: isDark
                            ? [const Color(0xFF78350F).withOpacity(0.3), const Color(0xFF1E293B)]
                            : [const Color(0xFFFEF3C7), const Color(0xFFFFFBEB)],
                      ),
                      borderRadius: BorderRadius.circular(16),
                      border: Border.all(color: const Color(0xFFF59E0B).withOpacity(0.4)),
                    ),
                    child: Row(
                      mainAxisAlignment: MainAxisAlignment.spaceBetween,
                      children: [
                        Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(
                              'MONTHLY EMI COMMITMENT',
                              style: TextStyle(
                                fontSize: 10,
                                fontWeight: FontWeight.bold,
                                letterSpacing: 0.8,
                                color: isDark ? const Color(0xFFFBBF24) : const Color(0xFFB45309),
                              ),
                            ),
                            const SizedBox(height: 2),
                            Text(
                              '₹${totalMonthlyEmi.toStringAsFixed(0)} / mo',
                              style: TextStyle(
                                fontSize: 20,
                                fontWeight: FontWeight.w900,
                                color: isDark ? const Color(0xFFFBBF24) : const Color(0xFF92400E),
                              ),
                            ),
                          ],
                        ),
                        Column(
                          crossAxisAlignment: CrossAxisAlignment.end,
                          children: [
                            Text(
                              'TOTAL REMAINING DEBT',
                              style: TextStyle(
                                fontSize: 10,
                                fontWeight: FontWeight.bold,
                                letterSpacing: 0.8,
                                color: isDark ? Colors.white60 : Colors.black54,
                              ),
                            ),
                            const SizedBox(height: 2),
                            Text(
                              '₹${totalRemainingDebt.toStringAsFixed(0)}',
                              style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w800),
                            ),
                          ],
                        ),
                      ],
                    ),
                  ),
                  const SizedBox(height: 14),

                  // Monthly Smart Prepayment Strategy Guide
                  Container(
                    padding: const EdgeInsets.all(14),
                    decoration: BoxDecoration(
                      color: const Color(0xFF10B981).withOpacity(isDark ? 0.12 : 0.08),
                      borderRadius: BorderRadius.circular(14),
                      border: Border.all(color: const Color(0xFF10B981).withOpacity(0.3)),
                    ),
                    child: Row(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        const Text('🎯', style: TextStyle(fontSize: 18)),
                        const SizedBox(width: 10),
                        Expanded(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text(
                                activeEmis.isEmpty
                                    ? 'Monthly Debt Freedom Roadmap'
                                    : 'Monthly Debt Freedom Roadmap · ${activeEmis.length} active loan${activeEmis.length == 1 ? '' : 's'}',
                                style: const TextStyle(
                                  fontSize: 13,
                                  fontWeight: FontWeight.bold,
                                  color: Color(0xFF10B981),
                                ),
                              ),
                              const SizedBox(height: 6),
                              if (activeEmis.isEmpty)
                                Text(
                                  clearedEmis.isEmpty
                                      ? 'You currently have no recorded active EMIs. Keep it up! Add any smartphone or loan EMI below and FinPocket will coach you every month until it is cleared.'
                                      : '🎉 ${clearedEmis.length} loan${clearedEmis.length == 1 ? ' is' : 's are'} fully cleared. Keep the streak going.',
                                  style: TextStyle(
                                    fontSize: 11.5,
                                    color: isDark ? Colors.white70 : Colors.black87,
                                    height: 1.35,
                                  ),
                                )
                              else
                                ...activeEmis.map((e) {
                                  final done = e.totalTenureMonths > 0
                                      ? (e.paidMonths / e.totalTenureMonths).clamp(0.0, 1.0)
                                      : 0.0;
                                  final step = e.isPaidThisMonth
                                      ? '✅ Paid this month — next instalment day ${e.dueDayOfMonth}'
                                      : e.daysUntilDue <= 2
                                          ? '⏰ ₹${e.monthlyEMI.toStringAsFixed(0)} due ${e.daysUntilDue == 0 ? 'today' : e.daysUntilDue == 1 ? 'tomorrow' : 'in ${e.daysUntilDue} days'}'
                                          : '📌 ₹${e.monthlyEMI.toStringAsFixed(0)} due on day ${e.dueDayOfMonth} · ${e.daysUntilDue} days left';
                                  return Padding(
                                    padding: const EdgeInsets.only(top: 8),
                                    child: Column(
                                      crossAxisAlignment: CrossAxisAlignment.start,
                                      children: [
                                        Text(
                                          '${e.loanName} · ${e.remainingTenureMonths} month${e.remainingTenureMonths == 1 ? '' : 's'} left',
                                          style: const TextStyle(
                                            fontSize: 12,
                                            fontWeight: FontWeight.w700,
                                          ),
                                        ),
                                        const SizedBox(height: 3),
                                        ClipRRect(
                                          borderRadius: BorderRadius.circular(3),
                                          child: LinearProgressIndicator(
                                            value: done,
                                            minHeight: 5,
                                            backgroundColor: Colors.white12,
                                            valueColor: const AlwaysStoppedAnimation<Color>(Color(0xFF10B981)),
                                          ),
                                        ),
                                        const SizedBox(height: 4),
                                        Text(
                                          '$step · ₹${e.remainingAmount.toStringAsFixed(0)} left to clear',
                                          style: TextStyle(
                                            fontSize: 10.5,
                                            color: isDark ? Colors.white60 : Colors.black54,
                                          ),
                                        ),
                                      ],
                                    ),
                                  );
                                }),
                            ],
                          ),
                        ),
                      ],
                    ),
                  ),
                  const SizedBox(height: 18),

                  // Add EMI Form Toggle / Fields
                  if (_isAdding) ...[
                    Container(
                      padding: const EdgeInsets.all(16),
                      decoration: BoxDecoration(
                        color: isDark ? const Color(0xFF1E293B) : const Color(0xFFF1F5F9),
                        borderRadius: BorderRadius.circular(16),
                        border: Border.all(color: AppTheme.primary.withOpacity(0.3)),
                      ),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Row(
                            mainAxisAlignment: MainAxisAlignment.spaceBetween,
                            children: [
                              const Text(
                                'Add Active EMI / Loan',
                                style: TextStyle(fontSize: 14, fontWeight: FontWeight.bold),
                              ),
                              IconButton(
                                icon: const Icon(Icons.close, size: 18),
                                onPressed: () => setState(() => _isAdding = false),
                              ),
                            ],
                          ),
                          const SizedBox(height: 10),
                          TextField(
                            controller: _nameController,
                            decoration: InputDecoration(
                              labelText: 'Loan / Item Name',
                              hintText: 'e.g. iPhone 15 EMI, Bike Loan',
                              isDense: true,
                              border: OutlineInputBorder(borderRadius: BorderRadius.circular(10)),
                            ),
                          ),
                          const SizedBox(height: 10),
                          Row(
                            children: [
                              Expanded(
                                child: TextField(
                                  controller: _emiAmountController,
                                  keyboardType: TextInputType.number,
                                  decoration: InputDecoration(
                                    labelText: 'Monthly EMI (₹)',
                                    hintText: 'e.g. 2499',
                                    isDense: true,
                                    border: OutlineInputBorder(borderRadius: BorderRadius.circular(10)),
                                  ),
                                ),
                              ),
                              const SizedBox(width: 10),
                              Expanded(
                                child: TextField(
                                  controller: _remainingAmountController,
                                  keyboardType: TextInputType.number,
                                  decoration: InputDecoration(
                                    labelText: 'Remaining Debt (₹)',
                                    hintText: 'e.g. 15000',
                                    isDense: true,
                                    border: OutlineInputBorder(borderRadius: BorderRadius.circular(10)),
                                  ),
                                ),
                              ),
                            ],
                          ),
                          const SizedBox(height: 10),
                          Row(
                            children: [
                              Expanded(
                                child: TextField(
                                  controller: _dueDayController,
                                  keyboardType: TextInputType.number,
                                  decoration: InputDecoration(
                                    labelText: 'Due Day (1-31)',
                                    hintText: 'e.g. 5',
                                    isDense: true,
                                    border: OutlineInputBorder(borderRadius: BorderRadius.circular(10)),
                                  ),
                                ),
                              ),
                              const SizedBox(width: 10),
                              Expanded(
                                child: TextField(
                                  controller: _tenureController,
                                  keyboardType: TextInputType.number,
                                  decoration: InputDecoration(
                                    labelText: 'Months Left',
                                    hintText: 'e.g. 6',
                                    isDense: true,
                                    border: OutlineInputBorder(borderRadius: BorderRadius.circular(10)),
                                  ),
                                ),
                              ),
                            ],
                          ),
                          const SizedBox(height: 12),
                          SizedBox(
                            width: double.infinity,
                            child: ElevatedButton(
                              style: ElevatedButton.styleFrom(
                                backgroundColor: AppTheme.primary,
                                foregroundColor: Colors.white,
                                padding: const EdgeInsets.symmetric(vertical: 12),
                                shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
                              ),
                              onPressed: () => _saveEmi(state),
                              child: const Text('Save & Track EMI', style: TextStyle(fontWeight: FontWeight.bold)),
                            ),
                          ),
                        ],
                      ),
                    ),
                    const SizedBox(height: 16),
                  ],

                  // Action Button to show form if not adding
                  if (!_isAdding) ...[
                    OutlinedButton.icon(
                      style: OutlinedButton.styleFrom(
                        padding: const EdgeInsets.symmetric(vertical: 12, horizontal: 16),
                        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                        side: const BorderSide(color: AppTheme.primary),
                      ),
                      icon: const Icon(Icons.add_rounded, color: AppTheme.primary),
                      label: const Text('Track New EMI or Loan', style: TextStyle(fontWeight: FontWeight.bold, color: AppTheme.primary)),
                      onPressed: () => setState(() => _isAdding = true),
                    ),
                    const SizedBox(height: 16),
                  ],

                  // Active EMIs List
                  Text(
                    'Active EMIs (${emis.length})',
                    style: TextStyle(
                      fontSize: 15,
                      fontWeight: FontWeight.bold,
                      color: isDark ? AppTheme.textPrimaryDark : AppTheme.textPrimaryLight,
                    ),
                  ),
                  const SizedBox(height: 10),

                  if (emis.isEmpty) ...[
                    Container(
                      padding: const EdgeInsets.all(20),
                      alignment: Alignment.center,
                      child: Text(
                        'No active EMIs tracked. Tap "Track New EMI" to set up your loan guide.',
                        textAlign: TextAlign.center,
                        style: TextStyle(fontSize: 12, color: isDark ? Colors.white54 : Colors.black45),
                      ),
                    ),
                  ] else ...[
                    ...emis.map((emi) {
                      return Container(
                        margin: const EdgeInsets.only(bottom: 12),
                        padding: const EdgeInsets.all(16),
                        decoration: BoxDecoration(
                          color: isDark ? AppTheme.bgCardDark : AppTheme.bgCardLight,
                          borderRadius: BorderRadius.circular(16),
                          border: Border.all(color: isDark ? AppTheme.borderDark : AppTheme.borderLight),
                        ),
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Row(
                              mainAxisAlignment: MainAxisAlignment.spaceBetween,
                              children: [
                                Flexible(
                                  child: Text(
                                    emi.loanName,
                                    style: const TextStyle(fontSize: 14, fontWeight: FontWeight.bold),
                                    overflow: TextOverflow.ellipsis,
                                  ),
                                ),
                                Container(
                                  padding: const EdgeInsets.symmetric(horizontal: 7, vertical: 2),
                                  decoration: BoxDecoration(
                                    color: (emi.isCleared
                                            ? const Color(0xFF8B5CF6)
                                            : emi.isPaidThisMonth
                                                ? const Color(0xFF10B981)
                                                : const Color(0xFFF59E0B)).withOpacity(0.15),
                                    borderRadius: BorderRadius.circular(6),
                                  ),
                                  child: Text(
                                    emi.isCleared
                                        ? 'Cleared 🎉'
                                        : emi.isPaidThisMonth
                                            ? 'Paid this Month'
                                            : 'Due on Day ${emi.dueDayOfMonth}',
                                    style: TextStyle(
                                      fontSize: 10,
                                      fontWeight: FontWeight.bold,
                                      color: emi.isCleared
                                          ? const Color(0xFF8B5CF6)
                                          : emi.isPaidThisMonth
                                              ? const Color(0xFF10B981)
                                              : const Color(0xFFD97706),
                                    ),
                                  ),
                                ),
                              ],
                            ),
                            const SizedBox(height: 8),
                            Row(
                              mainAxisAlignment: MainAxisAlignment.spaceBetween,
                              children: [
                                Text(
                                  'Monthly: ₹${emi.monthlyEMI.toStringAsFixed(0)}',
                                  style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w700, color: AppTheme.primary),
                                ),
                                Text(
                                  '${emi.remainingTenureMonths} months left (₹${emi.remainingAmount.toStringAsFixed(0)})',
                                  style: TextStyle(fontSize: 12, color: isDark ? Colors.white60 : Colors.black54),
                                ),
                              ],
                            ),
                            const SizedBox(height: 10),
                            Row(
                              children: [
                                Expanded(
                                  child: OutlinedButton(
                                    style: OutlinedButton.styleFrom(
                                      padding: const EdgeInsets.symmetric(vertical: 8),
                                      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(8)),
                                    ),
                                    onPressed: () {
                                      state.toggleEmiPaidStatus(emi.id);
                                    },
                                    child: Text(
                                      emi.isPaidThisMonth ? 'Mark Unpaid' : 'Mark Paid for This Month',
                                      style: const TextStyle(fontSize: 12, fontWeight: FontWeight.bold),
                                    ),
                                  ),
                                ),
                                const SizedBox(width: 8),
                                IconButton(
                                  tooltip: 'Remove loan',
                                  visualDensity: VisualDensity.compact,
                                  icon: Icon(Icons.delete_outline_rounded,
                                      size: 18, color: isDark ? Colors.white38 : Colors.black26),
                                  onPressed: () => _confirmRemoveEmi(state, emi),
                                ),
                              ],
                            ),
                          ],
                        ),
                      );
                    }),
                  ],
                ],
              ),
            ),
          ),
        ],
      ),
    ),
  );
  }
}
