import 'dart:math' as math;
import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:shared_preferences/shared_preferences.dart';
import '../providers/app_state.dart';
import '../theme/app_theme.dart';
import 'emi_manager_modal.dart';

/// One-time financial profile questionnaire.
///
/// Asks for income, essential monthly commitments and — crucially — whether the
/// user has running EMIs. The answers feed real behaviour:
///  * essential spend sets the minimum-budget floor used by the payment guard
///  * a "yes" to EMIs drops the user straight into the EMI tracker, which then
///    coaches them every month until the loan is cleared.
class FinancialProfileOnboardingModal extends StatefulWidget {
  const FinancialProfileOnboardingModal({super.key});

  static const String completionFlagKey = 'finpocket_profile_onboarded_v1';

  static Future<void> showIfNeeded(BuildContext context) async {
    final prefs = await SharedPreferences.getInstance();
    if (prefs.getBool(completionFlagKey) == true) return;
    if (!context.mounted) return;
    await showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      isDismissible: false,
      enableDrag: false,
      builder: (_) => const FinancialProfileOnboardingModal(),
    );
  }

  @override
  State<FinancialProfileOnboardingModal> createState() =>
      _FinancialProfileOnboardingModalState();
}

class _FinancialProfileOnboardingModalState
    extends State<FinancialProfileOnboardingModal> {
  int _step = 0;
  final _incomeController = TextEditingController();
  final _essentialsController = TextEditingController();
  bool? _hasEmis;
  bool _saving = false;

  @override
  void dispose() {
    _incomeController.dispose();
    _essentialsController.dispose();
    super.dispose();
  }

  double get _income => double.tryParse(_incomeController.text) ?? 0;
  double get _essentials => double.tryParse(_essentialsController.text) ?? 0;

  bool get _canContinue {
    switch (_step) {
      case 0:
        return _income > 0;
      case 1:
        return _essentials >= 0 && _essentialsController.text.isNotEmpty;
      case 2:
        return _hasEmis != null;
      default:
        return true;
    }
  }

  Future<void> _finish() async {
    setState(() => _saving = true);
    final state = Provider.of<AppState>(context, listen: false);

    // Essentials become the hard floor: paying below it is what the payment
    // guard warns about, so derive it from what the user says they must cover.
    if (_essentials > 0) {
      await state.setMinimumBudgetFloor(_essentials);
    }

    try {
      final prefs = await SharedPreferences.getInstance();
      await prefs.setBool(FinancialProfileOnboardingModal.completionFlagKey, true);
    } catch (_) {}

    if (!mounted) return;
    setState(() => _saving = false);
    Navigator.pop(context);

    if (_hasEmis == true) {
      // Pick up exactly where the answer points: tracking the loans.
      await Future.delayed(const Duration(milliseconds: 350));
      if (mounted) await EmiManagerModal.show(context);
    }
  }

  Future<void> _next() async {
    if (_step < 2) {
      setState(() => _step++);
      return;
    }
    await _finish();
  }

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;

    // Push the sheet above the keyboard with padding, and shrink its height to
    // the remaining visible area. This keeps the income field fully visible
    // when the keyboard is open — the sheet sits entirely above the keyboard
    // instead of being covered by it.
    final double keyboardHeight = MediaQuery.of(context).viewInsets.bottom;
    final double screenHeight = MediaQuery.of(context).size.height;
    final double sheetHeight = keyboardHeight > 0
        ? math.max(280.0, screenHeight - keyboardHeight - 16)
        : screenHeight * 0.82;

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
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Center(
            child: Container(
              width: 40,
              height: 4,
              margin: const EdgeInsets.only(bottom: 16),
              decoration: BoxDecoration(
                color: Colors.grey.withOpacity(0.3),
                borderRadius: BorderRadius.circular(2),
              ),
            ),
          ),
          Row(
            children: [
              Container(
                padding: const EdgeInsets.all(9),
                decoration: BoxDecoration(
                  color: AppTheme.primary.withOpacity(0.15),
                  borderRadius: BorderRadius.circular(11),
                ),
                child: const Icon(Icons.account_balance_wallet_rounded,
                    color: AppTheme.primary, size: 22),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      'Set up your money profile',
                      style: TextStyle(
                        fontSize: 16,
                        fontWeight: FontWeight.w800,
                        color: isDark ? AppTheme.textPrimaryDark : AppTheme.textPrimaryLight,
                      ),
                    ),
                    Text(
                      'Three quick questions — used to protect your budget',
                      style: TextStyle(
                        fontSize: 11,
                        color: isDark ? AppTheme.textSecondaryDark : AppTheme.textSecondaryLight,
                      ),
                    ),
                  ],
                ),
              ),
            ],
          ),
          const SizedBox(height: 14),
          Row(
            children: List.generate(3, (i) {
              return Expanded(
                child: Container(
                  height: 4,
                  margin: EdgeInsets.only(right: i == 2 ? 0 : 6),
                  decoration: BoxDecoration(
                    color: i <= _step
                        ? AppTheme.primary
                        : (isDark ? const Color(0xFF1E293B) : const Color(0xFFE2E8F0)),
                    borderRadius: BorderRadius.circular(2),
                  ),
                ),
              );
            }),
          ),
          const SizedBox(height: 20),
          Expanded(
            child: SingleChildScrollView(
              child: _buildStep(isDark),
            ),
          ),
          const SizedBox(height: 16),
          Row(
            children: [
              if (_step > 0)
                TextButton(
                  onPressed: () => setState(() => _step--),
                  child: Text('Back',
                      style: TextStyle(
                          color: isDark ? Colors.white60 : Colors.black45)),
                ),
              const Spacer(),
              Expanded(
                flex: 2,
                child: ElevatedButton(
                  style: ElevatedButton.styleFrom(
                    backgroundColor: AppTheme.primary,
                    foregroundColor: Colors.white,
                    padding: const EdgeInsets.symmetric(vertical: 13),
                    shape: RoundedRectangleBorder(
                        borderRadius: BorderRadius.circular(12)),
                  ),
                  onPressed: (_canContinue && !_saving) ? _next : null,
                  child: Text(
                    _saving
                        ? 'Saving…'
                        : _step == 2
                            ? 'Finish setup'
                            : 'Continue',
                    style: const TextStyle(
                        fontWeight: FontWeight.bold, fontSize: 14),
                  ),
                ),
              ),
            ],
          ),
        ],
      ),
    ),
  );
  }

  Widget _buildStep(bool isDark) {
    final titleStyle = TextStyle(
      fontSize: 15,
      fontWeight: FontWeight.w800,
      color: isDark ? AppTheme.textPrimaryDark : AppTheme.textPrimaryLight,
    );
    final hintStyle = TextStyle(
      fontSize: 12,
      height: 1.4,
      color: isDark ? AppTheme.textSecondaryDark : AppTheme.textSecondaryLight,
    );

    switch (_step) {
      case 0:
        return Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text('What is your monthly take-home income?', style: titleStyle),
            const SizedBox(height: 6),
            Text(
              'We use this to size your safe-to-spend limit and savings targets.',
              style: hintStyle,
            ),
            const SizedBox(height: 18),
            TextField(
              controller: _incomeController,
              keyboardType: TextInputType.number,
              autofocus: true,
              decoration: InputDecoration(
                labelText: 'Monthly income (₹)',
                hintText: 'e.g. 55000',
                prefixIcon: const Icon(Icons.currency_rupee_rounded, size: 18),
                isDense: true,
                border:
                    OutlineInputBorder(borderRadius: BorderRadius.circular(12)),
              ),
              onChanged: (_) => setState(() {}),
            ),
          ],
        );

      case 1:
        return Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text('How much must you spend every month?', style: titleStyle),
            const SizedBox(height: 6),
            Text(
              'Rent, groceries, utilities, fees — the non-negotiables. This becomes '
              'your minimum budget: FinPocket warns you before a payment drops you '
              'below it.',
              style: hintStyle,
            ),
            const SizedBox(height: 18),
            TextField(
              controller: _essentialsController,
              keyboardType: TextInputType.number,
              autofocus: true,
              decoration: InputDecoration(
                labelText: 'Essential monthly spend (₹)',
                hintText: 'e.g. 22000',
                prefixIcon:
                    const Icon(Icons.home_rounded, size: 18),
                isDense: true,
                border:
                    OutlineInputBorder(borderRadius: BorderRadius.circular(12)),
              ),
              onChanged: (_) => setState(() {}),
            ),
            if (_essentials > 0 && _income > 0) ...[
              const SizedBox(height: 14),
              Container(
                padding: const EdgeInsets.all(11),
                decoration: BoxDecoration(
                  color: AppTheme.primary.withOpacity(0.10),
                  borderRadius: BorderRadius.circular(11),
                  border: Border.all(color: AppTheme.primary.withOpacity(0.35)),
                ),
                child: Text(
                  'That leaves ₹${(_income - _essentials).clamp(0, double.infinity).toStringAsFixed(0)} '
                  'for savings, EMIs and discretionary spending.',
                  style: const TextStyle(fontSize: 12, color: AppTheme.primary),
                ),
              ),
            ],
          ],
        );

      default:
        return Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text('Do you have any EMIs or loans running?', style: titleStyle),
            const SizedBox(height: 6),
            Text(
              'Car, home, personal loan, education loan, credit card EMI — anything '
              'with a monthly instalment.',
              style: hintStyle,
            ),
            const SizedBox(height: 18),
            _optionTile(
              isDark: isDark,
              selected: _hasEmis == true,
              icon: Icons.account_balance_rounded,
              title: 'Yes, I have EMIs',
              subtitle:
                  'Track them here and get guided every month until they are cleared.',
              onTap: () => setState(() => _hasEmis = true),
            ),
            const SizedBox(height: 10),
            _optionTile(
              isDark: isDark,
              selected: _hasEmis == false,
              icon: Icons.check_circle_outline_rounded,
              title: 'No, debt free',
              subtitle: 'We will keep it that way with budget alerts.',
              onTap: () => setState(() => _hasEmis = false),
            ),
          ],
        );
    }
  }

  Widget _optionTile({
    required bool isDark,
    required bool selected,
    required IconData icon,
    required String title,
    required String subtitle,
    required VoidCallback onTap,
  }) {
    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(13),
      child: Container(
        padding: const EdgeInsets.all(14),
        decoration: BoxDecoration(
          color: selected
              ? AppTheme.primary.withOpacity(0.10)
              : (isDark ? const Color(0xFF1E293B) : const Color(0xFFF8FAFC)),
          borderRadius: BorderRadius.circular(13),
          border: Border.all(
            color: selected
                ? AppTheme.primary
                : (isDark ? AppTheme.borderDark : AppTheme.borderLight),
            width: selected ? 1.6 : 1,
          ),
        ),
        child: Row(
          children: [
            Icon(
              icon,
              color: selected ? AppTheme.primary : (isDark ? Colors.white54 : Colors.black38),
              size: 24,
            ),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    title,
                    style: TextStyle(
                      fontSize: 13.5,
                      fontWeight: FontWeight.w700,
                      color: isDark ? AppTheme.textPrimaryDark : AppTheme.textPrimaryLight,
                    ),
                  ),
                  const SizedBox(height: 3),
                  Text(subtitle, style: hint11(isDark)),
                ],
              ),
            ),
            if (selected)
              const Icon(Icons.check_circle_rounded,
                  color: AppTheme.primary, size: 20),
          ],
        ),
      ),
    );
  }

  TextStyle hint11(bool isDark) => TextStyle(
        fontSize: 11,
        height: 1.35,
        color: isDark ? AppTheme.textSecondaryDark : AppTheme.textSecondaryLight,
      );
}
