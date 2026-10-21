import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../providers/app_state.dart';
import '../theme/app_theme.dart';
import '../services/ai_assistant_service.dart';

class AIAssistantScreen extends StatefulWidget {
  const AIAssistantScreen({super.key});

  @override
  State<AIAssistantScreen> createState() => _AIAssistantScreenState();
}

class _AIAssistantScreenState extends State<AIAssistantScreen> {
  final _inputController = TextEditingController();
  bool _isTyping = false;
  final List<Map<String, String>> _messages = [];
  bool _initializedGreeting = false;

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    if (!_initializedGreeting) {
      _initializedGreeting = true;
      final state = Provider.of<AppState>(context, listen: false);
      final userName = state.currentUser?.fullName.split(' ').first ?? 'there';
      // Build the Safe-to-Spend chip from the user's live figure, not a seed.
      _refreshSuggestedChips(state);
      _messages.add({
        'sender': 'AI',
        'text': 'Hello $userName! I am your FinPocket AI Financial Assistant. I can explain your spending, verify if you can afford a purchase, analyze bills, and project savings goals using your real account data.',
        'explanation': 'Grounding: Connected directly to your authenticated financial records and Safe-to-Spend engine.',
      });
    }
  }

  List<String> _suggestedChips = [
    'What is my budget?',
    'How much money will I have in 30 days?',
    'What if I save ₹3,000 more every month?',
    'What is on my financial calendar?',
    'Can I afford ₹10,000?',
    'How long can my emergency fund support me?',
  ];

  /// Build the "Why is my Safe-to-Spend …?" chip from the user's LIVE figure.
  /// (It was hardcoded to the ₹15,731 demo seed, so every real user was told
  /// their Safe-to-Spend was that number regardless of their actual balance.)
  void _refreshSuggestedChips(AppState state) {
    final safe = state.safeToSpend.safeToSpend;
    final chip = 'Why is my Safe-to-Spend ₹${safe.toStringAsFixed(0)}?';
    setState(() {
      // Replace any previous dynamic safe-to-spend chip, then add the fresh one.
      _suggestedChips.removeWhere((c) => c.startsWith('Why is my Safe-to-Spend'));
      _suggestedChips.insert(4, chip);
    });
  }

  void _sendMessage([String? preset]) async {
    final text = preset ?? _inputController.text;
    if (text.trim().isEmpty) return;

    final state = Provider.of<AppState>(context, listen: false);

    setState(() {
      _messages.add({'sender': 'USER', 'text': text});
      if (preset == null) _inputController.clear();
      _isTyping = true;
    });

    try {
      final res = await AIAssistantService.askAsync(text, state);
      if (!mounted) return; // screen may have been disposed (e.g. tab switch)
      setState(() {
        _messages.add({
          'sender': 'AI',
          'text': res.answer,
          if (res.explanation != null) 'explanation': res.explanation!,
        });
        if (res.suggestedActions.isNotEmpty) {
          _suggestedChips = res.suggestedActions;
        }
      });
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _messages.add({
          'sender': 'AI',
          'text': 'Could not process query. Please check network connection.',
        });
      });
    } finally {
      if (mounted) {
        setState(() {
          _isTyping = false;
        });
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final state = Provider.of<AppState>(context);
    final health = AIAssistantService.getHealthScore(state);
    final theme = Theme.of(context);
    final isDark = theme.brightness == Brightness.dark;

    return Scaffold(
      appBar: AppBar(title: const Text('Ask FinPocket AI')),
      body: Column(
        children: [
          // Financial Health Widget
          Container(
            margin: const EdgeInsets.all(12),
            padding: const EdgeInsets.all(14),
            decoration: AppTheme.cardDecoration(context),
            child: Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                Row(
                  children: [
                    Container(
                      width: 40,
                      height: 40,
                      decoration: BoxDecoration(
                        color: AppTheme.primaryLight.withOpacity(0.12),
                        borderRadius: BorderRadius.circular(10),
                      ),
                      child: const Icon(Icons.speed, color: AppTheme.primaryLight, size: 22),
                    ),
                    const SizedBox(width: 12),
                    Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        const Text('Financial Health Score', style: TextStyle(fontSize: 12, color: Color(0xFF94A3B8))),
                        const SizedBox(height: 2),
                        Text('${health.score}/100 • ${health.grade}', style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 16, color: AppTheme.primaryLight)),
                      ],
                    ),
                  ],
                ),
              ],
            ),
          ),

          // Suggested Questions Chips
          SingleChildScrollView(
            scrollDirection: Axis.horizontal,
            padding: const EdgeInsets.symmetric(horizontal: 12),
            child: Row(
              children: _suggestedChips.map((q) {
                return Padding(
                  padding: const EdgeInsets.only(right: 6),
                  child: ActionChip(
                    backgroundColor: isDark ? AppTheme.bgCardDark : AppTheme.bgCardLight,
                    side: BorderSide(color: isDark ? AppTheme.borderDark : AppTheme.borderLight),
                    label: Text(q, style: TextStyle(fontSize: 11, color: isDark ? const Color(0xFFCBD5E1) : const Color(0xFF334155))),
                    onPressed: () => _sendMessage(q),
                  ),
                );
              }).toList(),
            ),
          ),
          const SizedBox(height: 8),

          // Chat Messages
          Expanded(
            child: ListView.builder(
              padding: const EdgeInsets.all(12),
              itemCount: _messages.length,
              itemBuilder: (ctx, idx) {
                final m = _messages[idx];
                final isUser = m['sender'] == 'USER';

                return Align(
                  alignment: isUser ? Alignment.centerRight : Alignment.centerLeft,
                  child: Container(
                    margin: const EdgeInsets.symmetric(vertical: 4),
                    padding: const EdgeInsets.all(12),
                    constraints: BoxConstraints(maxWidth: MediaQuery.of(context).size.width * 0.8),
                    decoration: BoxDecoration(
                      color: isUser ? AppTheme.primary : (isDark ? AppTheme.bgCardDark : AppTheme.bgCardLight),
                      borderRadius: BorderRadius.circular(14),
                      border: isUser ? null : Border.all(color: isDark ? AppTheme.borderDark : AppTheme.borderLight),
                    ),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          m['text'] ?? '',
                          style: TextStyle(
                            color: isUser ? Colors.white : (isDark ? const Color(0xFFE2E8F0) : const Color(0xFF0F172A)),
                            fontSize: 13,
                          ),
                        ),
                        if (m['explanation'] != null && !isUser) ...[
                          const SizedBox(height: 6),
                          Container(
                            padding: const EdgeInsets.all(6),
                            decoration: BoxDecoration(
                              color: Colors.black26,
                              borderRadius: BorderRadius.circular(6),
                            ),
                            child: Text(
                              m['explanation']!,
                              style: const TextStyle(fontSize: 10, color: Color(0xFF94A3B8), fontStyle: FontStyle.italic),
                            ),
                          ),
                        ],
                      ],
                    ),
                  ),
                );
              },
            ),
          ),

          if (_isTyping)
            const Padding(
              padding: EdgeInsets.symmetric(vertical: 6),
              child: Text('AI is analyzing your financial data...', style: TextStyle(fontSize: 11, color: Color(0xFF94A3B8), fontStyle: FontStyle.italic)),
            ),

          // Message Input Field
          Container(
            padding: const EdgeInsets.all(12),
            decoration: BoxDecoration(
              color: isDark ? AppTheme.bgSurfaceDark : AppTheme.bgSurfaceLight,
              border: Border(top: BorderSide(color: isDark ? AppTheme.borderDark : AppTheme.borderLight)),
            ),
            child: Row(
              children: [
                Expanded(
                  child: TextField(
                    controller: _inputController,
                    decoration: InputDecoration(
                      hintText: 'Ask anything about your money...',
                      hintStyle: const TextStyle(fontSize: 13, color: Color(0xFF64748B)),
                      border: OutlineInputBorder(borderRadius: BorderRadius.circular(24), borderSide: BorderSide.none),
                      filled: true,
                      fillColor: isDark ? AppTheme.bgCardDark : Colors.white,
                      contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
                    ),
                    onSubmitted: (val) => _sendMessage(),
                  ),
                ),
                const SizedBox(width: 8),
                CircleAvatar(
                  backgroundColor: AppTheme.primary,
                  child: IconButton(
                    icon: const Icon(Icons.send, color: Colors.white, size: 18),
                    onPressed: () => _sendMessage(),
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}
