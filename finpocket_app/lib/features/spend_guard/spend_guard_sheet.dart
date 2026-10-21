import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../../providers/app_state.dart';
import '../../theme/app_theme.dart';
import 'spend_guard_models.dart';
import 'spend_guard_engine.dart';

class SpendGuardSheet extends StatefulWidget {
  final double? initialAmount;
  final String? initialCategory;

  const SpendGuardSheet({
    super.key,
    this.initialAmount,
    this.initialCategory,
  });

  static Future<void> show(BuildContext context, {double? initialAmount, String? initialCategory}) {
    return showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      builder: (ctx) => SpendGuardSheet(
        initialAmount: initialAmount,
        initialCategory: initialCategory,
      ),
    );
  }

  @override
  State<SpendGuardSheet> createState() => _SpendGuardSheetState();
}

class _SpendGuardSheetState extends State<SpendGuardSheet> {
  late TextEditingController _amountCtrl;
  String _selectedCategory = 'Shopping';
  double _amount = 3500.0;

  final List<String> _categories = [
    'Shopping',
    'Tech & Electronics',
    'Dining & Going Out',
    'Travel & Vacations',
    'Entertainment',
    'Personal Care',
    'Other Discretionary',
  ];

  @override
  void initState() {
    super.initState();
    _amount = widget.initialAmount ?? 3500.0;
    _selectedCategory = widget.initialCategory ?? 'Shopping';
    _amountCtrl = TextEditingController(text: _amount.toInt().toString());
  }

  @override
  void dispose() {
    _amountCtrl.dispose();
    super.dispose();
  }

  void _addAmount(double increment) {
    setState(() {
      _amount += increment;
      _amountCtrl.text = _amount.toInt().toString();
    });
  }

  @override
  Widget build(BuildContext context) {
    final state = Provider.of<AppState>(context);
    final isDark = Theme.of(context).brightness == Brightness.dark;

    final evaluation = SpendGuardEngine.evaluate(
      requestedAmount: _amount,
      category: _selectedCategory,
      accounts: state.accounts,
      transactions: state.transactions,
      bills: state.bills,
      goals: state.goals,
    );

    final Color verdictColor;
    final IconData verdictIcon;
    switch (evaluation.affordability) {
      case SpendGuardAffordability.safe:
        verdictColor = AppTheme.accentGreen;
        verdictIcon = Icons.verified_user_outlined;
        break;
      case SpendGuardAffordability.caution:
        verdictColor = Colors.amber;
        verdictIcon = Icons.warning_amber_rounded;
        break;
      case SpendGuardAffordability.unaffordable:
        verdictColor = AppTheme.accentRed;
        verdictIcon = Icons.block_outlined;
        break;
    }

    return Container(
      padding: EdgeInsets.only(
        left: 20,
        right: 20,
        top: 20,
        bottom: MediaQuery.of(context).viewInsets.bottom + 24,
      ),
      decoration: BoxDecoration(
        color: isDark ? AppTheme.bgSurfaceDark : AppTheme.bgSurfaceLight,
        borderRadius: const BorderRadius.vertical(top: Radius.circular(24)),
      ),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              const Row(
                children: [
                  Icon(Icons.security, color: AppTheme.primary, size: 22),
                  SizedBox(width: 8),
                  Text('Spend Guard Affordability', style: TextStyle(fontWeight: FontWeight.bold, fontSize: 17)),
                ],
              ),
              IconButton(
                icon: const Icon(Icons.close, size: 20),
                onPressed: () => Navigator.pop(context),
              ),
            ],
          ),
          const SizedBox(height: 6),
          Text(
            'Check real-time impact on your Safe-to-Spend runway before you pay.',
            style: TextStyle(fontSize: 12, color: isDark ? Colors.white60 : Colors.black54),
          ),
          const SizedBox(height: 16),
          TextField(
            controller: _amountCtrl,
            keyboardType: TextInputType.number,
            style: const TextStyle(fontSize: 24, fontWeight: FontWeight.bold),
            decoration: InputDecoration(
              prefixText: '₹ ',
              labelText: 'Purchase Amount',
              border: OutlineInputBorder(borderRadius: BorderRadius.circular(12)),
            ),
            onChanged: (val) {
              final parsed = double.tryParse(val);
              if (parsed != null && parsed >= 0) {
                setState(() {
                  _amount = parsed;
                });
              }
            },
          ),
          const SizedBox(height: 10),
          SingleChildScrollView(
            scrollDirection: Axis.horizontal,
            child: Row(
              children: [
                _buildQuickAddChip('+₹500', 500),
                _buildQuickAddChip('+₹2,000', 2000),
                _buildQuickAddChip('+₹5,000', 5000),
                _buildQuickAddChip('+₹20,000', 20000),
              ],
            ),
          ),
          const SizedBox(height: 12),
          DropdownButtonFormField<String>(
            value: _selectedCategory,
            decoration: InputDecoration(
              labelText: 'Category',
              isDense: true,
              border: OutlineInputBorder(borderRadius: BorderRadius.circular(12)),
            ),
            items: _categories.map((c) => DropdownMenuItem(value: c, child: Text(c, style: const TextStyle(fontSize: 13)))).toList(),
            onChanged: (val) {
              if (val != null) setState(() => _selectedCategory = val);
            },
          ),
          const SizedBox(height: 16),
          // Evaluation Verdict Container
          Container(
            padding: const EdgeInsets.all(16),
            decoration: BoxDecoration(
              color: verdictColor.withOpacity(0.10),
              borderRadius: BorderRadius.circular(14),
              border: Border.all(color: verdictColor.withOpacity(0.4)),
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    Icon(verdictIcon, color: verdictColor, size: 22),
                    const SizedBox(width: 8),
                    Text(
                      evaluation.verdictTitle,
                      style: TextStyle(color: verdictColor, fontWeight: FontWeight.bold, fontSize: 15),
                    ),
                  ],
                ),
                const SizedBox(height: 8),
                Text(
                  evaluation.explanation,
                  style: TextStyle(fontSize: 12, color: isDark ? Colors.white70 : Colors.black87, height: 1.3),
                ),
                if (evaluation.recommendation != null) ...[
                  const SizedBox(height: 8),
                  Text(
                    'Guidance: ${evaluation.recommendation}',
                    style: TextStyle(fontSize: 11, color: verdictColor, fontWeight: FontWeight.w600),
                  ),
                ],
              ],
            ),
          ),
          const SizedBox(height: 18),
          ElevatedButton(
            style: ElevatedButton.styleFrom(
              backgroundColor: AppTheme.primary,
              padding: const EdgeInsets.symmetric(vertical: 14),
              shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
            ),
            onPressed: () => Navigator.pop(context),
            child: const Text('Confirm & Close', style: TextStyle(color: Colors.white, fontWeight: FontWeight.bold)),
          ),
        ],
      ),
    );
  }

  Widget _buildQuickAddChip(String label, double amount) {
    return Padding(
      padding: const EdgeInsets.only(right: 8),
      child: ActionChip(
        label: Text(label, style: const TextStyle(fontSize: 11)),
        onPressed: () => _addAmount(amount),
      ),
    );
  }
}
