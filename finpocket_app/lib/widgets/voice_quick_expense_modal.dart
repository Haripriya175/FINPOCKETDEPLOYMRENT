import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../models/models.dart';
import '../providers/app_state.dart';
import '../services/voice_expense_parser_service.dart';
import '../services/local_transaction_storage_service.dart';
import '../theme/app_theme.dart';

class VoiceQuickExpenseModal extends StatefulWidget {
  const VoiceQuickExpenseModal({super.key});

  static Future<void> show(BuildContext context) {
    return showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      builder: (ctx) => const VoiceQuickExpenseModal(),
    );
  }

  @override
  State<VoiceQuickExpenseModal> createState() => _VoiceQuickExpenseModalState();
}

class _VoiceQuickExpenseModalState extends State<VoiceQuickExpenseModal> with SingleTickerProviderStateMixin {
  final TextEditingController _voiceInputController = TextEditingController();
  VoiceExpenseIntent? _parsedIntent;
  final bool _isListening = false;
  bool _isSaving = false;
  late AnimationController _animController;

  final List<String> _quickSuggestions = [
    'Paid 50 rupees for chai',
    'Auto 120 rupees cash',
    'Groceries 450 rs',
    'Petrol 300 rupees cash',
    'Doctor 500 rs',
  ];

  @override
  void initState() {
    super.initState();
    _animController = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 1200),
    )..repeat(reverse: true);

    // Parse the user's real input as they type. (There is no speech-to-text
    // engine bundled, so we never fabricate a transcript — the user types or
    // pastes what they actually spent.)
    _voiceInputController.addListener(() {
      final text = _voiceInputController.text;
      final intent = VoiceExpenseParserService.parseTranscript(text);
      if (mounted) setState(() => _parsedIntent = intent);
    });
  }

  @override
  void dispose() {
    _animController.dispose();
    _voiceInputController.dispose();
    super.dispose();
  }

  void _parseVoice(String text) {
    _voiceInputController.text = text;
    final intent = VoiceExpenseParserService.parseTranscript(text);
    setState(() {
      _parsedIntent = intent;
    });
  }

  Future<void> _saveExpense() async {
    if (_isSaving) return; // guard against double-tap duplicates
    if (_parsedIntent == null || !_parsedIntent!.isValid || _parsedIntent!.amount <= 0) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Please type a valid expense and amount.')),
      );
      return;
    }

    setState(() => _isSaving = true);
    final state = Provider.of<AppState>(context, listen: false);
    final txn = Transaction(
      id: 'tx_cash_${DateTime.now().millisecondsSinceEpoch}',
      userId: state.currentUser?.userId ?? 'usr_local',
      sender: 'Cash Wallet',
      receiver: _parsedIntent!.merchant,
      amount: _parsedIntent!.amount,
      type: TransactionType.EXPENSE,
      category: _parsedIntent!.category,
      status: TransactionStatus.SUCCESSFUL,
      timestamp: DateTime.now(),
      referenceId: 'CASH_${DateTime.now().millisecondsSinceEpoch}',
      description: _parsedIntent!.description,
      paymentMethod: _parsedIntent!.paymentMethod,
      merchant: _parsedIntent!.merchant,
    );

    try {
      await LocalTransactionStorageService.addOrUpdateTransaction(txn);
      await state.refreshAllData();
    } catch (e) {
      if (mounted) {
        setState(() => _isSaving = false);
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            backgroundColor: Color(0xFFEF4444),
            content: Text('Couldn’t save the expense to your ledger. Please try again.'),
          ),
        );
      }
      return;
    }

    if (mounted) {
      Navigator.pop(context);
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          backgroundColor: AppTheme.success,
          content: Text(
            '💵 Logged ₹${_parsedIntent!.amount.toStringAsFixed(0)} for ${_parsedIntent!.merchant} (${_parsedIntent!.paymentMethod})',
          ),
        ),
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;

    return Padding(
      padding: EdgeInsets.only(bottom: MediaQuery.of(context).viewInsets.bottom),
      child: Container(
        decoration: BoxDecoration(
          color: isDark ? const Color(0xFF0F172A) : Colors.white,
          borderRadius: const BorderRadius.vertical(top: Radius.circular(24)),
          border: Border.all(color: isDark ? AppTheme.borderDark : AppTheme.borderLight),
        ),
        padding: const EdgeInsets.fromLTRB(20, 16, 20, 24),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            // Drag handle
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
                  padding: const EdgeInsets.all(10),
                  decoration: BoxDecoration(
                    color: AppTheme.primary.withOpacity(0.12),
                    shape: BoxShape.circle,
                  ),
                  child: const Icon(Icons.mic_rounded, color: AppTheme.primary, size: 24),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        'Voice Cash & Offline Ledger',
                        style: TextStyle(
                          fontSize: 16,
                          fontWeight: FontWeight.w800,
                          color: isDark ? AppTheme.textPrimaryDark : AppTheme.textPrimaryLight,
                        ),
                      ),
                      const SizedBox(height: 2),
                      Text(
                        'Type what you spent (e.g. "Auto 120 rupees cash")',
                        style: TextStyle(fontSize: 11, color: isDark ? AppTheme.textSecondaryDark : AppTheme.textSecondaryLight),
                      ),
                    ],
                  ),
                ),
              ],
            ),
            const SizedBox(height: 20),

            // Pulsing Mic Center
            Center(
              child: GestureDetector(
                onTap: () {
                  // No speech-to-text engine is bundled with the app, so we do
                  // NOT fabricate a transcript. Tell the user honestly instead
                  // of injecting a fake expense they never spoke.
                  ScaffoldMessenger.of(context).showSnackBar(
                    const SnackBar(
                      content: Text('Voice capture isn’t available yet — type your expense below (e.g. "Auto 120 rupees cash").'),
                    ),
                  );
                },
                child: AnimatedBuilder(
                  animation: _animController,
                  builder: (context, child) {
                    final scale = _isListening ? 1.0 + (_animController.value * 0.15) : 1.0;
                    return Transform.scale(
                      scale: scale,
                      child: Container(
                        width: 72,
                        height: 72,
                        decoration: BoxDecoration(
                          shape: BoxShape.circle,
                          gradient: LinearGradient(
                            colors: _isListening
                                ? [const Color(0xFFEF4444), const Color(0xFFF97316)]
                                : [AppTheme.primary, const Color(0xFF0D9488)],
                          ),
                          boxShadow: [
                            BoxShadow(
                              color: (_isListening ? Colors.red : AppTheme.primary).withOpacity(0.35),
                              blurRadius: 18,
                              spreadRadius: 3,
                            ),
                          ],
                        ),
                        child: Icon(
                          _isListening ? Icons.graphic_eq_rounded : Icons.mic_rounded,
                          color: Colors.white,
                          size: 34,
                        ),
                      ),
                    );
                  },
                ),
              ),
            ),
            const SizedBox(height: 10),
            Center(
              child: Text(
                _isListening ? '🎙️ Listening to Indian English / Hindi speech...' : 'Tap Mic or use quick phrases below',
                style: TextStyle(
                  fontSize: 11,
                  fontWeight: FontWeight.w600,
                  color: _isListening ? Colors.amber : (isDark ? AppTheme.textMutedDark : AppTheme.textSecondaryLight),
                ),
              ),
            ),
            const SizedBox(height: 16),

            // Transcript Input
            TextField(
              controller: _voiceInputController,
              onChanged: _parseVoice,
              decoration: InputDecoration(
                hintText: 'Type or speak: e.g. "Paid 80 rupees for auto"',
                hintStyle: const TextStyle(fontSize: 12),
                filled: true,
                fillColor: isDark ? AppTheme.bgInputDark : AppTheme.bgCardLightSoft,
                border: OutlineInputBorder(borderRadius: BorderRadius.circular(12), borderSide: BorderSide.none),
                prefixIcon: const Icon(Icons.record_voice_over_rounded, size: 20, color: AppTheme.primary),
                suffixIcon: IconButton(
                  icon: const Icon(Icons.clear, size: 18),
                  onPressed: () {
                    _voiceInputController.clear();
                    setState(() => _parsedIntent = null);
                  },
                ),
              ),
            ),
            const SizedBox(height: 12),

            // Quick suggestion pills
            SingleChildScrollView(
              scrollDirection: Axis.horizontal,
              child: Row(
                children: _quickSuggestions.map((s) {
                  return Padding(
                    padding: const EdgeInsets.only(right: 8),
                    child: ActionChip(
                      label: Text(s, style: const TextStyle(fontSize: 11)),
                      backgroundColor: isDark ? const Color(0xFF1E293B) : const Color(0xFFF1F5F9),
                      onPressed: () => _parseVoice(s),
                    ),
                  );
                }).toList(),
              ),
            ),
            const SizedBox(height: 16),

            // Parsed Intent Card
            if (_parsedIntent != null && _parsedIntent!.isValid) ...[
              Container(
                padding: const EdgeInsets.all(14),
                decoration: BoxDecoration(
                  color: AppTheme.primary.withOpacity(0.1),
                  borderRadius: BorderRadius.circular(14),
                  border: Border.all(color: AppTheme.primary.withOpacity(0.3)),
                ),
                child: Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [
                    Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Row(
                          children: [
                            Text(
                              '₹${_parsedIntent!.amount.toStringAsFixed(0)}',
                              style: const TextStyle(
                                fontSize: 20,
                                fontWeight: FontWeight.w900,
                                color: AppTheme.primary,
                              ),
                            ),
                            const SizedBox(width: 8),
                            Container(
                              padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                              decoration: BoxDecoration(
                                color: const Color(0x3310B981),
                                borderRadius: BorderRadius.circular(6),
                              ),
                              child: Text(
                                _parsedIntent!.paymentMethod,
                                style: const TextStyle(fontSize: 10, fontWeight: FontWeight.bold, color: AppTheme.success),
                              ),
                            ),
                          ],
                        ),
                        const SizedBox(height: 4),
                        Text(
                          'Category: ${_parsedIntent!.category.toString().split('.').last} • ${_parsedIntent!.merchant}',
                          style: TextStyle(
                            fontSize: 12,
                            fontWeight: FontWeight.w600,
                            color: isDark ? AppTheme.textPrimaryDark : AppTheme.textPrimaryLight,
                          ),
                        ),
                      ],
                    ),
                    const Icon(Icons.check_circle_rounded, color: AppTheme.success, size: 28),
                  ],
                ),
              ),
              const SizedBox(height: 16),
            ],

            SizedBox(
              width: double.infinity,
              height: 48,
              child: ElevatedButton.icon(
                style: ElevatedButton.styleFrom(
                  backgroundColor: AppTheme.primary,
                  foregroundColor: Colors.white,
                  shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                  elevation: 0,
                ),
                icon: const Icon(Icons.save_rounded, size: 20),
                label: Text(
                  _isSaving ? 'Saving…' : 'Save to Offline Cash Ledger',
                  style: const TextStyle(fontWeight: FontWeight.bold),
                ),
                onPressed: _isSaving ? null : _saveExpense,
              ),
            ),
          ],
        ),
      ),
    );
  }
}
