import 'dart:math' as math;
import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../models/models.dart';
import '../providers/app_state.dart';
import '../theme/app_theme.dart';

class CreateGoalModal extends StatefulWidget {
  const CreateGoalModal({super.key});

  static Future<void> show(BuildContext context) {
    return showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      builder: (ctx) => const CreateGoalModal(),
    );
  }

  @override
  State<CreateGoalModal> createState() => _CreateGoalModalState();
}

class _CreateGoalModalState extends State<CreateGoalModal> {
  final _titleController = TextEditingController();
  final _targetAmountController = TextEditingController();
  final _initialDepositController = TextEditingController(text: '');
  int _targetMonths = 12;
  String _selectedCategory = '🏍️ Vehicle';

  final List<String> _categories = [
    '🏍️ Vehicle',
    '💻 Tech & Gadgets',
    '✈️ Travel & Trip',
    '💍 Wedding & Jewelry',
    '🎓 Education & Career',
    '🏠 Home & Property',
    '🎯 Milestone',
  ];

  @override
  void dispose() {
    _titleController.dispose();
    _targetAmountController.dispose();
    _initialDepositController.dispose();
    super.dispose();
  }

  double get _targetAmount => double.tryParse(_targetAmountController.text) ?? 0.0;
  double get _monthlyRequired => _targetMonths > 0 ? (_targetAmount / _targetMonths) : 0.0;

  void _saveGoal(AppState state) {
    final title = _titleController.text.trim();
    final target = _targetAmount;
    final initial = double.tryParse(_initialDepositController.text) ?? 0.0;

    if (title.isEmpty || target <= 0) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Please enter a goal title and target amount.')),
      );
      return;
    }

    if (initial > state.totalAvailableBalance) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text('Initial deposit (₹${initial.toStringAsFixed(0)}) exceeds your available balance (₹${state.totalAvailableBalance.toStringAsFixed(0)}).'),
        ),
      );
      return;
    }

    final newGoal = SavingsGoal(
      id: 'goal_${DateTime.now().millisecondsSinceEpoch}',
      userId: state.currentUser?.userId ?? 'usr_local',
      name: title,
      targetAmount: target,
      currentAmount: 0,
      targetDate: DateTime.now().add(Duration(days: _targetMonths * 30)),
      monthlyContribution: _monthlyRequired,
      category: _selectedCategory,
      status: 'IN_PROGRESS',
      createdAt: DateTime.now(),
    );

    // Create the goal empty, then fund it through the tested deposit path so the
    // balance deduction, goal persistence and server sync all stay consistent.
    // (The old inline `bankAccounts.first.availableBalance -= …` mutation was
    // never persisted or pushed to the server, so after a refresh the balance
    // returned while the goal kept the money — double-counted funds.)
    state.addSavingsGoal(newGoal);
    if (initial > 0) {
      state.depositToSavingsGoal(newGoal.id, initial);
    }

    Navigator.pop(context);
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        backgroundColor: AppTheme.success,
        content: Text('Goal "$title" created! Target: ₹${target.toStringAsFixed(0)}'),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final state = Provider.of<AppState>(context);
    final isDark = Theme.of(context).brightness == Brightness.dark;

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
                  color: const Color(0xFF0EA5E9).withOpacity(0.15),
                  borderRadius: BorderRadius.circular(12),
                ),
                child: const Text('🎯', style: TextStyle(fontSize: 20)),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      'Create Custom Savings Goal',
                      style: TextStyle(
                        fontSize: 17,
                        fontWeight: FontWeight.w800,
                        color: isDark ? AppTheme.textPrimaryDark : AppTheme.textPrimaryLight,
                      ),
                    ),
                    Text(
                      'Set custom targets beyond Emergency Shield',
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
          const SizedBox(height: 16),

          // Body form
          Expanded(
            child: SingleChildScrollView(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  TextField(
                    controller: _titleController,
                    decoration: InputDecoration(
                      labelText: 'Goal Title',
                      hintText: 'e.g. New Bike, MacBook, Europe Trip',
                      prefixIcon: const Icon(Icons.star_rounded, size: 18),
                      border: OutlineInputBorder(borderRadius: BorderRadius.circular(12)),
                    ),
                  ),
                  const SizedBox(height: 14),

                  Row(
                    children: [
                      Expanded(
                        child: TextField(
                          controller: _targetAmountController,
                          keyboardType: TextInputType.number,
                          decoration: InputDecoration(
                            labelText: 'Target Amount (₹)',
                            hintText: 'e.g. 80000',
                            prefixIcon: const Icon(Icons.currency_rupee_rounded, size: 18),
                            border: OutlineInputBorder(borderRadius: BorderRadius.circular(12)),
                          ),
                          onChanged: (_) => setState(() {}),
                        ),
                      ),
                      const SizedBox(width: 10),
                      Expanded(
                        child: TextField(
                          controller: _initialDepositController,
                          keyboardType: TextInputType.number,
                          decoration: InputDecoration(
                            labelText: 'Initial Deposit (₹)',
                            hintText: 'e.g. 1000',
                            prefixIcon: const Icon(Icons.savings_rounded, size: 18),
                            border: OutlineInputBorder(borderRadius: BorderRadius.circular(12)),
                          ),
                          onChanged: (_) => setState(() {}),
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 16),

                  // Category Chips
                  Text(
                    'Select Category',
                    style: TextStyle(
                      fontSize: 13,
                      fontWeight: FontWeight.bold,
                      color: isDark ? AppTheme.textPrimaryDark : AppTheme.textPrimaryLight,
                    ),
                  ),
                  const SizedBox(height: 8),
                  Wrap(
                    spacing: 8,
                    runSpacing: 8,
                    children: _categories.map((cat) {
                      final isSel = _selectedCategory == cat;
                      return ChoiceChip(
                        label: Text(cat, style: TextStyle(fontSize: 12, fontWeight: isSel ? FontWeight.bold : FontWeight.normal)),
                        selected: isSel,
                        selectedColor: AppTheme.primary.withOpacity(0.2),
                        onSelected: (_) => setState(() => _selectedCategory = cat),
                      );
                    }).toList(),
                  ),
                  const SizedBox(height: 16),

                  // Target Timeline Stepper (Months)
                  Row(
                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                    children: [
                      Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            'Target Timeline',
                            style: TextStyle(
                              fontSize: 13,
                              fontWeight: FontWeight.bold,
                              color: isDark ? AppTheme.textPrimaryDark : AppTheme.textPrimaryLight,
                            ),
                          ),
                          Text(
                            '$_targetMonths months from today',
                            style: TextStyle(fontSize: 11, color: isDark ? Colors.white60 : Colors.black54),
                          ),
                        ],
                      ),
                      Row(
                        children: [3, 6, 12, 24, 36].map((m) {
                          final isSel = _targetMonths == m;
                          return Padding(
                            padding: const EdgeInsets.only(left: 6),
                            child: ChoiceChip(
                              label: Text('${m}m', style: TextStyle(fontSize: 11, fontWeight: isSel ? FontWeight.bold : FontWeight.normal)),
                              selected: isSel,
                              selectedColor: AppTheme.primary.withOpacity(0.2),
                              onSelected: (_) => setState(() => _targetMonths = m),
                            ),
                          );
                        }).toList(),
                      ),
                    ],
                  ),
                  const SizedBox(height: 16),

                  // Calculation Plan Card
                  Container(
                    padding: const EdgeInsets.all(14),
                    decoration: BoxDecoration(
                      color: const Color(0xFF0EA5E9).withOpacity(isDark ? 0.12 : 0.08),
                      borderRadius: BorderRadius.circular(14),
                      border: Border.all(color: const Color(0xFF0EA5E9).withOpacity(0.3)),
                    ),
                    child: Row(
                      mainAxisAlignment: MainAxisAlignment.spaceBetween,
                      children: [
                        Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            const Text(
                              'MONTHLY SAVINGS REQUIRED',
                              style: TextStyle(
                                fontSize: 10,
                                fontWeight: FontWeight.bold,
                                letterSpacing: 0.8,
                                color: Color(0xFF0EA5E9),
                              ),
                            ),
                            const SizedBox(height: 2),
                            Text(
                              '₹${_monthlyRequired.toStringAsFixed(0)} / mo',
                              style: const TextStyle(fontSize: 20, fontWeight: FontWeight.w900, color: Color(0xFF0EA5E9)),
                            ),
                          ],
                        ),
                        Container(
                          padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
                          decoration: BoxDecoration(
                            color: const Color(0xFF0EA5E9).withOpacity(0.15),
                            borderRadius: BorderRadius.circular(8),
                          ),
                          child: Text(
                            'Target: ${_targetMonths}m',
                            style: const TextStyle(fontSize: 11, fontWeight: FontWeight.bold, color: Color(0xFF0EA5E9)),
                          ),
                        ),
                      ],
                    ),
                  ),
                ],
              ),
            ),
          ),
          const SizedBox(height: 14),

          // Submit Button
          SizedBox(
            width: double.infinity,
            child: ElevatedButton(
              style: ElevatedButton.styleFrom(
                backgroundColor: AppTheme.primary,
                foregroundColor: Colors.white,
                padding: const EdgeInsets.symmetric(vertical: 14),
                shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
              ),
              onPressed: () => _saveGoal(state),
              child: const Text('Create Goal & Start Saving', style: TextStyle(fontWeight: FontWeight.bold, fontSize: 14)),
            ),
          ),
        ],
      ),
    ),
  );
  }
}
