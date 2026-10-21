import 'dart:math' as math;
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:provider/provider.dart';
import '../providers/app_state.dart';
import '../services/external_intent_service.dart';
import '../services/receipt_splitter_service.dart';
import '../theme/app_theme.dart';

class ReceiptSplitterModal extends StatefulWidget {
  const ReceiptSplitterModal({super.key});

  static Future<void> show(BuildContext context) {
    return showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      builder: (ctx) => const ReceiptSplitterModal(),
    );
  }

  @override
  State<ReceiptSplitterModal> createState() => _ReceiptSplitterModalState();
}

class _ReceiptSplitterModalState extends State<ReceiptSplitterModal> {
  // Start with only "Me" — the old code seeded fake friends "Rahul" and
  // "Priya", which got included in every split and UPI request by default.
  final List<String> _friends = ['Me'];
  final TextEditingController _friendInputController = TextEditingController();
  final TextEditingController _ocrTextController = TextEditingController();
  final Map<String, List<String>> _itemAssignments = {};
  ReceiptSplitResult? _splitResult;
  String? _selectedTemplate;
  bool _isSharing = false;

  @override
  void initState() {
    super.initState();
    // Start EMPTY. The old code auto-loaded a fabricated "restaurant receipt"
    // so it looked like real OCR output before the user entered anything.
    _ocrTextController.text = '';
    _recalculate();
    _ocrTextController.addListener(_recalculate);
  }

  @override
  void dispose() {
    _friendInputController.dispose();
    _ocrTextController.dispose();
    super.dispose();
  }

  void _recalculate() {
    final state = Provider.of<AppState>(context, listen: false);
    final myName = state.currentUser?.fullName.split(' ').first ?? 'Me';
    // Use only the user's real saved UPI ID. The old fallback `myupi@axis`
    // (and phone-derived handles) are not valid PSP VPAs, so every generated
    // `upi://pay` link would fail to collect.
    final realVpa = (state.currentUser?.upiId ?? '').trim();
    final myVpa = realVpa.isNotEmpty ? realVpa : '';

    final res = ReceiptSplitterService.parseAndCalculateSplit(
      rawText: _ocrTextController.text,
      friends: _friends,
      myVpa: myVpa,
      myName: myName,
      customAssignments: _itemAssignments,
    );
    setState(() {
      _splitResult = res;
    });
  }

  void _addFriend() {
    final name = _friendInputController.text.trim();
    if (name.isNotEmpty && !_friends.contains(name)) {
      setState(() {
        _friends.add(name);
        _friendInputController.clear();
      });
      _recalculate();
    }
  }

  void _toggleFriendForItem(String itemId, String friend) {
    final current = List<String>.from(_itemAssignments[itemId] ?? _friends);
    if (current.contains(friend)) {
      if (current.length > 1) {
        current.remove(friend);
      }
    } else {
      current.add(friend);
    }
    _itemAssignments[itemId] = current;
    _recalculate();
  }

  Future<void> _shareToWhatsApp() async {
    if (_isSharing) return;
    final result = _splitResult;
    if (result == null || result.items.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Enter some receipt items first.')),
      );
      return;
    }
    setState(() => _isSharing = true);
    final messenger = ScaffoldMessenger.of(context);
    final text = result.getWhatsAppShareText();
    // Actually open WhatsApp (the old button only copied to clipboard and
    // claimed it had shared).
    final opened = await ExternalIntentService.launchWhatsApp(text: text);
    if (!opened) {
      // WhatsApp unavailable — fall back to clipboard so nothing is lost.
      await Clipboard.setData(ClipboardData(text: text));
    }
    if (mounted) {
      setState(() => _isSharing = false);
      messenger.showSnackBar(
        SnackBar(
          backgroundColor: opened ? const Color(0xFF10B981) : const Color(0xFFF59E0B),
          content: Text(
            opened
                ? 'WhatsApp opened — tap send to share the split.'
                : 'WhatsApp not installed. Split copied to clipboard instead.',
          ),
        ),
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;

    final double keyboardHeight = MediaQuery.of(context).viewInsets.bottom;
    final double screenHeight = MediaQuery.of(context).size.height;
    final double sheetHeight = keyboardHeight > 0
        ? math.max(280.0, screenHeight - keyboardHeight - 16)
        : screenHeight * 0.88;

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
        crossAxisAlignment: CrossAxisAlignment.start,
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

          Row(
            children: [
              Container(
                padding: const EdgeInsets.all(10),
                decoration: BoxDecoration(
                  color: const Color(0x2638BDF8),
                  borderRadius: BorderRadius.circular(12),
                ),
                child: const Icon(Icons.receipt_long_rounded, color: Color(0xFF38BDF8), size: 24),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      'Bill Splitter',
                      style: TextStyle(
                        fontSize: 16,
                        fontWeight: FontWeight.w800,
                        color: isDark ? AppTheme.textPrimaryDark : AppTheme.textPrimaryLight,
                      ),
                    ),
                    const SizedBox(height: 2),
                    Text(
                      'Enter items, tap to assign, share via WhatsApp & UPI',
                      style: TextStyle(fontSize: 11, color: isDark ? AppTheme.textSecondaryDark : AppTheme.textSecondaryLight),
                    ),
                  ],
                ),
              ),
            ],
          ),
          const SizedBox(height: 14),

          // Real receipt text input (there is no OCR engine bundled, so the
          // user pastes or types the receipt). The old version auto-loaded a
          // fabricated "scanned receipt" and had no way to enter real text.
          TextField(
            controller: _ocrTextController,
            maxLines: 4,
            minLines: 2,
            decoration: InputDecoration(
              labelText: 'Receipt items (one per line)',
              hintText: 'e.g.\nPaneer Butter Masala 340\nButter Naan 160\nCGST 25\nGrand Total 400',
              border: OutlineInputBorder(borderRadius: BorderRadius.circular(12)),
            ),
          ),
          const SizedBox(height: 8),

          // Clearly-labeled samples to try the splitter (never auto-loaded,
          // never presented as the user's own scanned receipt).
          SingleChildScrollView(
            scrollDirection: Axis.horizontal,
            child: Row(
              children: [
                Padding(
                  padding: const EdgeInsets.only(right: 8),
                  child: Text(
                    'Try a sample:',
                    style: TextStyle(fontSize: 11, color: isDark ? AppTheme.textMutedDark : AppTheme.textSecondaryLight),
                  ),
                ),
                ...ReceiptSplitterService.sampleReceipts.keys.map((title) {
                  final isSelected = _selectedTemplate == title;
                  return Padding(
                    padding: const EdgeInsets.only(right: 8),
                    child: ChoiceChip(
                      label: Text(title, style: TextStyle(fontSize: 11, fontWeight: isSelected ? FontWeight.bold : FontWeight.normal)),
                      selected: isSelected,
                      selectedColor: AppTheme.primary.withOpacity(0.2),
                      onSelected: (val) {
                        if (val) {
                          setState(() {
                            _selectedTemplate = title;
                            _ocrTextController.text = ReceiptSplitterService.sampleReceipts[title]!;
                            _itemAssignments.clear();
                          });
                          _recalculate();
                        }
                      },
                    ),
                  );
                }).toList(),
              ],
            ),
          ),
          const SizedBox(height: 12),

          // Friend Management Row
          Row(
            children: [
              Expanded(
                child: SingleChildScrollView(
                  scrollDirection: Axis.horizontal,
                  child: Row(
                    children: _friends.map((f) {
                      return Padding(
                        padding: const EdgeInsets.only(right: 6),
                        child: Chip(
                          label: Text(f, style: const TextStyle(fontSize: 11, fontWeight: FontWeight.bold)),
                          backgroundColor: f == 'Me' ? AppTheme.primary.withOpacity(0.18) : (isDark ? const Color(0xFF1E293B) : const Color(0xFFE2E8F0)),
                          deleteIcon: f != 'Me' ? const Icon(Icons.close, size: 14) : null,
                          onDeleted: f != 'Me'
                              ? () {
                                  setState(() => _friends.remove(f));
                                  _recalculate();
                                }
                              : null,
                        ),
                      );
                    }).toList(),
                  ),
                ),
              ),
              IconButton(
                icon: const Icon(Icons.person_add_alt_1_rounded, size: 20, color: AppTheme.primary),
                tooltip: 'Add friend to split',
                onPressed: () {
                  showDialog(
                    context: context,
                    builder: (ctx) => AlertDialog(
                      title: const Text('Add Friend', style: TextStyle(fontSize: 15, fontWeight: FontWeight.bold)),
                      content: TextField(
                        controller: _friendInputController,
                        autofocus: true,
                        decoration: const InputDecoration(hintText: 'Enter name (e.g. Ananya)'),
                      ),
                      actions: [
                        TextButton(onPressed: () => Navigator.pop(ctx), child: const Text('Cancel')),
                        ElevatedButton(
                          onPressed: () {
                            _addFriend();
                            Navigator.pop(ctx);
                          },
                          child: const Text('Add'),
                        ),
                      ],
                    ),
                  );
                },
              ),
            ],
          ),
          const Divider(height: 20),

          // Items & Split List
          Expanded(
            child: _splitResult == null
                ? const Center(child: CircularProgressIndicator())
                : _splitResult!.items.isEmpty
                    ? Center(
                        child: Padding(
                          padding: const EdgeInsets.all(20),
                          child: Column(
                            mainAxisAlignment: MainAxisAlignment.center,
                            children: [
                              Icon(Icons.receipt_long_outlined, size: 40, color: isDark ? AppTheme.textMutedDark : AppTheme.textSecondaryLight),
                              const SizedBox(height: 12),
                              Text(
                                'No receipt items yet',
                                style: TextStyle(fontSize: 14, fontWeight: FontWeight.bold, color: isDark ? AppTheme.textPrimaryDark : AppTheme.textPrimaryLight),
                              ),
                              const SizedBox(height: 6),
                              Text(
                                'Type or paste your receipt above (one item per line), or tap a sample to try the splitter.',
                                textAlign: TextAlign.center,
                                style: TextStyle(fontSize: 12, height: 1.4, color: isDark ? AppTheme.textSecondaryDark : AppTheme.textSecondaryLight),
                              ),
                            ],
                          ),
                        ),
                      )
                    : ListView(
                    children: [
                      Text(
                        'Tap items to assign who shared:',
                        style: TextStyle(fontSize: 11, fontWeight: FontWeight.bold, color: isDark ? AppTheme.textMutedDark : AppTheme.textSecondaryLight),
                      ),
                      const SizedBox(height: 8),

                      ..._splitResult!.items.map((item) {
                        final assigned = item.assignedTo.isEmpty ? _friends : item.assignedTo;

                        return Container(
                          margin: const EdgeInsets.only(bottom: 8),
                          padding: const EdgeInsets.all(10),
                          decoration: BoxDecoration(
                            color: isDark ? AppTheme.bgCardDarkHover : AppTheme.bgCardLightSoft,
                            borderRadius: BorderRadius.circular(10),
                          ),
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Row(
                                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                                children: [
                                  Expanded(
                                    child: Text(
                                      item.name,
                                      style: TextStyle(
                                        fontSize: 12.5,
                                        fontWeight: FontWeight.bold,
                                        color: isDark ? AppTheme.textPrimaryDark : AppTheme.textPrimaryLight,
                                      ),
                                    ),
                                  ),
                                  Text(
                                    '₹${item.price.toStringAsFixed(0)}',
                                    style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w800, color: AppTheme.primary),
                                  ),
                                ],
                              ),
                              const SizedBox(height: 6),
                              Wrap(
                                spacing: 4,
                                children: _friends.map((f) {
                                  final isAssigned = assigned.contains(f);
                                  return FilterChip(
                                    label: Text(f, style: TextStyle(fontSize: 10, color: isAssigned ? Colors.white : null)),
                                    selected: isAssigned,
                                    selectedColor: AppTheme.primary,
                                    showCheckmark: false,
                                    visualDensity: VisualDensity.compact,
                                    onSelected: (_) => _toggleFriendForItem(item.id, f),
                                  );
                                }).toList(),
                              ),
                            ],
                          ),
                        );
                      }),
                      const SizedBox(height: 12),

                      // Final individual breakdown card
                      Container(
                        padding: const EdgeInsets.all(14),
                        decoration: BoxDecoration(
                          color: const Color(0x1F10B981),
                          borderRadius: BorderRadius.circular(12),
                          border: Border.all(color: const Color(0x4D10B981)),
                        ),
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Row(
                              mainAxisAlignment: MainAxisAlignment.spaceBetween,
                              children: [
                                const Text(
                                  '💰 Split Summary (with Tax)',
                                  style: TextStyle(fontSize: 13, fontWeight: FontWeight.bold, color: AppTheme.success),
                                ),
                                Text(
                                  'Total: ₹${_splitResult!.totalAmount.toStringAsFixed(0)}',
                                  style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w900, color: AppTheme.success),
                                ),
                              ],
                            ),
                            const Divider(height: 16),
                            ..._friends.map((f) {
                              final share = _splitResult!.individualShares[f] ?? 0.0;
                              return Padding(
                                padding: const EdgeInsets.symmetric(vertical: 3),
                                child: Row(
                                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                                  children: [
                                    Text(
                                      f == 'Me' ? '👤 My Share:' : '👤 $f owes you:',
                                      style: TextStyle(
                                        fontSize: 12,
                                        fontWeight: f == 'Me' ? FontWeight.w600 : FontWeight.bold,
                                        color: isDark ? AppTheme.textPrimaryDark : AppTheme.textPrimaryLight,
                                      ),
                                    ),
                                    Text(
                                      '₹${share.toStringAsFixed(0)}',
                                      style: TextStyle(
                                        fontSize: 13,
                                        fontWeight: FontWeight.w800,
                                        color: f == 'Me' ? (isDark ? AppTheme.textPrimaryDark : AppTheme.textPrimaryLight) : AppTheme.primary,
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
          const SizedBox(height: 12),

          // Actions: Share on WhatsApp & Copy UPI links
          Row(
            children: [
              Expanded(
                child: ElevatedButton.icon(
                  style: ElevatedButton.styleFrom(
                    backgroundColor: const Color(0xFF25D366), // WhatsApp Green
                    foregroundColor: Colors.white,
                    shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                    padding: const EdgeInsets.symmetric(vertical: 13),
                  ),
                  icon: _isSharing
                      ? const SizedBox(
                          width: 18,
                          height: 18,
                          child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white),
                        )
                      : const Icon(Icons.share_rounded, size: 18),
                  label: const Text('Share on WhatsApp', style: TextStyle(fontWeight: FontWeight.bold, fontSize: 13)),
                  onPressed: (_splitResult == null || _splitResult!.items.isEmpty || _isSharing)
                      ? null
                      : _shareToWhatsApp,
                ),
              ),
              const SizedBox(width: 8),
              IconButton(
                style: IconButton.styleFrom(
                  backgroundColor: AppTheme.primary.withOpacity(0.12),
                  padding: const EdgeInsets.all(12),
                  shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                ),
                icon: const Icon(Icons.copy_rounded, color: AppTheme.primary, size: 20),
                tooltip: 'Copy text to clipboard',
                onPressed: (_splitResult == null || _splitResult!.items.isEmpty)
                    ? null
                    : () {
                        Clipboard.setData(ClipboardData(text: _splitResult!.getWhatsAppShareText()));
                        ScaffoldMessenger.of(context).showSnackBar(
                          const SnackBar(content: Text('Copied bill split to clipboard.')),
                        );
                      },
              ),
            ],
          ),
        ],
      ),
    ),
  );
  }
}
