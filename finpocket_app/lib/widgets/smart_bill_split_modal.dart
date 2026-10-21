import 'dart:math' as math;
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:mobile_scanner/mobile_scanner.dart';
import 'package:provider/provider.dart';
import '../providers/app_state.dart';
import '../services/external_intent_service.dart';
import '../theme/app_theme.dart';

class SmartBillSplitModal extends StatefulWidget {
  /// Bill total read from a scanned QR, when the flow started with a scan.
  final double? initialAmount;

  /// Merchant / place name read from a scanned QR.
  final String? initialTitle;

  const SmartBillSplitModal({super.key, this.initialAmount, this.initialTitle});

  static Future<void> show(
    BuildContext context, {
    double? initialAmount,
    String? initialTitle,
  }) {
    return showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      builder: (ctx) => SmartBillSplitModal(
        initialAmount: initialAmount,
        initialTitle: initialTitle,
      ),
    );
  }

  @override
  State<SmartBillSplitModal> createState() => _SmartBillSplitModalState();
}

class _SmartBillSplitModalState extends State<SmartBillSplitModal> {
  late final TextEditingController _amountController;
  late final TextEditingController _titleController;
  int _membersCount = 4;
  bool _isScannerOpen = false;
  bool _isSending = false;
  MobileScannerController? _scannerController;

  @override
  void initState() {
    super.initState();
    final scannedAmount = widget.initialAmount;
    final scannedTitle = widget.initialTitle;
    _amountController = TextEditingController(
      text: scannedAmount != null && scannedAmount > 0
          ? scannedAmount.toStringAsFixed(0)
          : '1200',
    );
    _titleController = TextEditingController(
      text: (scannedTitle != null && scannedTitle.trim().isNotEmpty)
          ? scannedTitle.trim()
          : 'Restaurant Dinner',
    );
  }

  @override
  void dispose() {
    _amountController.dispose();
    _titleController.dispose();
    _scannerController?.dispose();
    super.dispose();
  }

  double get _totalAmount => double.tryParse(_amountController.text) ?? 0.0;
  double get _perPersonShare => _membersCount > 0 ? (_totalAmount / _membersCount) : 0.0;

  void _onQrDetected(BarcodeCapture capture) {
    final barcodes = capture.barcodes;
    if (barcodes.isNotEmpty) {
      final code = barcodes.first.rawValue ?? '';
      // Check for UPI QR or amount in string (e.g. am=1500)
      final amtMatch = RegExp(r'[?&]am=([0-9.]+)').firstMatch(code);
      if (amtMatch != null) {
        final parsed = double.tryParse(amtMatch.group(1) ?? '');
        if (parsed != null && parsed > 0) {
          setState(() {
            _amountController.text = parsed.toStringAsFixed(0);
            _isScannerOpen = false;
          });
          ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(content: Text('Scanned Bill Total: ₹${parsed.toStringAsFixed(0)}')),
          );
          return;
        }
      }
      // If plain numeric
      final plainAmt = double.tryParse(code.replaceAll(RegExp(r'[^0-9.]'), ''));
      if (plainAmt != null && plainAmt > 0 && plainAmt < 100000) {
        setState(() {
          _amountController.text = plainAmt.toStringAsFixed(0);
          _isScannerOpen = false;
        });
      }
    }
  }

  /// Builds the split message and hands it to WhatsApp.
  ///
  /// The result is awaited and surfaced to the user: previously the returned
  /// bool was dropped, so a failed hand-off looked identical to a success and
  /// the only feedback the user ever saw came from the neighbouring Copy button.
  Future<void> _sendToWhatsApp() async {
    if (_isSending) return;
    setState(() => _isSending = true);

    try {
      final state = Provider.of<AppState>(context, listen: false);
      final myName = state.currentUser?.fullName.isNotEmpty == true
          ? state.currentUser!.fullName
          : 'Me';
      // Use ONLY the user's real, saved UPI ID. Fabricating `<phone>@okhdfcbank`
      // or `<name>@upi` (neither is a valid PSP handle) sends friends a pay link
      // that always fails to collect.
      final vpa = (state.currentUser?.upiId ?? '').trim();

      final total = _totalAmount.toStringAsFixed(0);
      final share = _perPersonShare.toStringAsFixed(0);
      final title = _titleController.text.trim().isNotEmpty
          ? _titleController.text.trim()
          : 'Group Expense';

      final String paySection;
      if (vpa.isNotEmpty) {
        final upiPayLink = 'upi://pay?pa=$vpa&pn=${Uri.encodeComponent(myName)}&am=$share&cu=INR&tn=${Uri.encodeComponent("Split: $title")}';
        paySection = '''
Kindly pay your share via UPI:
💳 UPI ID: $vpa
📲 Tap to Pay ₹$share: $upiPayLink
━━━━━━━━━━━━━━━━━━''';
      } else {
        paySection = '''
⚠️ Add your UPI ID in FinPocket → Receive Money to include a payment link here.
━━━━━━━━━━━━━━━━━━''';
      }

      final msg = '''🧾 Bill Split via FinPocket
━━━━━━━━━━━━━━━━━━
📍 Expense: $title
💵 Total Bill: ₹$total
👥 Split Among: $_membersCount friends
👉 Your Share: ₹$share each

$paySection''';

      if (!mounted) return;
      final opened = await ExternalIntentService.launchWhatsApp(text: msg);

      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          backgroundColor: opened ? const Color(0xFF10B981) : const Color(0xFFF59E0B),
          content: Text(
            opened
                ? 'WhatsApp opened — tap send to share the split with $_membersCount friends.'
                : 'WhatsApp is not installed. The split message was copied instead.',
          ),
        ),
      );

      if (!opened) {
        await Clipboard.setData(ClipboardData(text: msg));
      }
    } finally {
      if (mounted) setState(() => _isSending = false);
    }
  }

  @override
  Widget build(BuildContext context) {
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
                  color: const Color(0xFF10B981).withOpacity(0.15),
                  borderRadius: BorderRadius.circular(12),
                ),
                child: const Icon(Icons.document_scanner_rounded, color: Color(0xFF10B981), size: 24),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      'Smart Bill Scanner & Splitter',
                      style: TextStyle(
                        fontSize: 17,
                        fontWeight: FontWeight.w800,
                        color: isDark ? AppTheme.textPrimaryDark : AppTheme.textPrimaryLight,
                      ),
                    ),
                    Text(
                      'Scan receipt, choose members & send direct to WhatsApp',
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

          // Main body
          Expanded(
            child: SingleChildScrollView(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  // Camera Scanner Accordion
                  Container(
                    margin: const EdgeInsets.only(bottom: 14),
                    decoration: BoxDecoration(
                      color: isDark ? const Color(0xFF1E293B) : const Color(0xFFF1F5F9),
                      borderRadius: BorderRadius.circular(14),
                      border: Border.all(color: isDark ? const Color(0xFF334155) : const Color(0xFFCBD5E1)),
                    ),
                    child: Column(
                      children: [
                        ListTile(
                          dense: true,
                          leading: const Icon(Icons.camera_alt_rounded, color: AppTheme.primary, size: 20),
                          title: const Text('Scan Bill / Receipt QR', style: TextStyle(fontWeight: FontWeight.bold, fontSize: 13)),
                          subtitle: Text(
                            _isScannerOpen ? 'Point camera at receipt QR' : 'Tap to open camera scanner',
                            style: const TextStyle(fontSize: 11),
                          ),
                          trailing: Icon(
                            _isScannerOpen ? Icons.keyboard_arrow_up_rounded : Icons.keyboard_arrow_down_rounded,
                            color: AppTheme.primary,
                          ),
                          onTap: () {
                            setState(() {
                              _isScannerOpen = !_isScannerOpen;
                              if (_isScannerOpen) {
                                _scannerController = MobileScannerController();
                              } else {
                                _scannerController?.dispose();
                                _scannerController = null;
                              }
                            });
                          },
                        ),
                        if (_isScannerOpen) ...[
                          Container(
                            height: 180,
                            margin: const EdgeInsets.fromLTRB(14, 0, 14, 14),
                            decoration: BoxDecoration(
                              borderRadius: BorderRadius.circular(12),
                              border: Border.all(color: AppTheme.primary, width: 2),
                            ),
                            clipBehavior: Clip.antiAlias,
                            child: MobileScanner(
                              controller: _scannerController,
                              onDetect: _onQrDetected,
                            ),
                          ),
                        ],
                      ],
                    ),
                  ),

                  // Bill Title & Amount Inputs
                  Row(
                    children: [
                      Expanded(
                        flex: 3,
                        child: TextField(
                          controller: _titleController,
                          decoration: InputDecoration(
                            labelText: 'Bill For / Place',
                            hintText: 'e.g. Dinner, Movie',
                            prefixIcon: const Icon(Icons.receipt_long_rounded, size: 18),
                            isDense: true,
                            border: OutlineInputBorder(borderRadius: BorderRadius.circular(12)),
                          ),
                          onChanged: (_) => setState(() {}),
                        ),
                      ),
                      const SizedBox(width: 10),
                      Expanded(
                        flex: 2,
                        child: TextField(
                          controller: _amountController,
                          keyboardType: TextInputType.number,
                          decoration: InputDecoration(
                            labelText: 'Total Bill (₹)',
                            prefixIcon: const Icon(Icons.currency_rupee_rounded, size: 18),
                            isDense: true,
                            border: OutlineInputBorder(borderRadius: BorderRadius.circular(12)),
                          ),
                          onChanged: (_) => setState(() {}),
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 18),

                  // Member Counter Section ("How many members/friends?")
                  Container(
                    padding: const EdgeInsets.all(16),
                    decoration: BoxDecoration(
                      color: isDark ? const Color(0xFF1E293B) : const Color(0xFFF8FAFC),
                      borderRadius: BorderRadius.circular(16),
                      border: Border.all(color: isDark ? AppTheme.borderDark : AppTheme.borderLight),
                    ),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Row(
                          mainAxisAlignment: MainAxisAlignment.spaceBetween,
                          children: [
                            Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Text(
                                  'How Many Friends / Members?',
                                  style: TextStyle(
                                    fontSize: 14,
                                    fontWeight: FontWeight.bold,
                                    color: isDark ? AppTheme.textPrimaryDark : AppTheme.textPrimaryLight,
                                  ),
                                ),
                                const SizedBox(height: 2),
                                Text(
                                  'Split equally including you',
                                  style: TextStyle(fontSize: 11, color: isDark ? Colors.white60 : Colors.black54),
                                ),
                              ],
                            ),
                            // Stepper (- / +)
                            Row(
                              children: [
                                IconButton(
                                  style: IconButton.styleFrom(
                                    backgroundColor: isDark ? const Color(0xFF334155) : const Color(0xFFE2E8F0),
                                    padding: const EdgeInsets.all(8),
                                  ),
                                  icon: const Icon(Icons.remove_rounded, size: 16),
                                  onPressed: _membersCount > 2
                                      ? () => setState(() => _membersCount--)
                                      : null,
                                ),
                                Padding(
                                  padding: const EdgeInsets.symmetric(horizontal: 12),
                                  child: Text(
                                    '$_membersCount',
                                    style: const TextStyle(fontSize: 18, fontWeight: FontWeight.w900, color: AppTheme.primary),
                                  ),
                                ),
                                IconButton(
                                  style: IconButton.styleFrom(
                                    backgroundColor: isDark ? const Color(0xFF334155) : const Color(0xFFE2E8F0),
                                    padding: const EdgeInsets.all(8),
                                  ),
                                  icon: const Icon(Icons.add_rounded, size: 16),
                                  onPressed: _membersCount < 20
                                      ? () => setState(() => _membersCount++)
                                      : null,
                                ),
                              ],
                            ),
                          ],
                        ),
                        const SizedBox(height: 12),

                        // Quick presets chips: [2] [3] [4] [5] [6] [8] [10]
                        Wrap(
                          spacing: 8,
                          children: [2, 3, 4, 5, 6, 8, 10].map((n) {
                            final isSel = _membersCount == n;
                            return ChoiceChip(
                              label: Text('$n Members', style: TextStyle(fontSize: 11, fontWeight: isSel ? FontWeight.bold : FontWeight.normal)),
                              selected: isSel,
                              selectedColor: AppTheme.primary.withOpacity(0.2),
                              labelStyle: TextStyle(color: isSel ? AppTheme.primary : (isDark ? Colors.white70 : Colors.black87)),
                              onSelected: (_) => setState(() => _membersCount = n),
                            );
                          }).toList(),
                        ),
                      ],
                    ),
                  ),
                  const SizedBox(height: 16),

                  // Calculated Split Summary Card
                  Container(
                    padding: const EdgeInsets.all(16),
                    decoration: BoxDecoration(
                      gradient: LinearGradient(
                        colors: isDark
                            ? [const Color(0xFF064E3B).withOpacity(0.4), const Color(0xFF0F172A)]
                            : [const Color(0xFFECFDF5), const Color(0xFFF0FDF4)],
                      ),
                      borderRadius: BorderRadius.circular(16),
                      border: Border.all(color: const Color(0xFF10B981).withOpacity(0.4)),
                    ),
                    child: Column(
                      children: [
                        Row(
                          mainAxisAlignment: MainAxisAlignment.spaceBetween,
                          children: [
                            Text(
                              'Total Amount:',
                              style: TextStyle(fontSize: 13, color: isDark ? Colors.white70 : Colors.black87),
                            ),
                            Text(
                              '₹${_totalAmount.toStringAsFixed(0)}',
                              style: const TextStyle(fontSize: 15, fontWeight: FontWeight.bold),
                            ),
                          ],
                        ),
                        const SizedBox(height: 6),
                        Row(
                          mainAxisAlignment: MainAxisAlignment.spaceBetween,
                          children: [
                            Text(
                              'Number of Members:',
                              style: TextStyle(fontSize: 13, color: isDark ? Colors.white70 : Colors.black87),
                            ),
                            Text(
                              '$_membersCount friends',
                              style: const TextStyle(fontSize: 14, fontWeight: FontWeight.bold),
                            ),
                          ],
                        ),
                        const Divider(height: 20),
                        Row(
                          mainAxisAlignment: MainAxisAlignment.spaceBetween,
                          children: [
                            Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                const Text(
                                  'EACH PERSON OWES',
                                  style: TextStyle(fontSize: 10, fontWeight: FontWeight.bold, letterSpacing: 0.8, color: Color(0xFF10B981)),
                                ),
                                const SizedBox(height: 2),
                                Text(
                                  '₹${_perPersonShare.toStringAsFixed(0)}',
                                  style: const TextStyle(fontSize: 24, fontWeight: FontWeight.w900, color: Color(0xFF10B981)),
                                ),
                              ],
                            ),
                            Container(
                              padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
                              decoration: BoxDecoration(
                                color: const Color(0xFF10B981).withOpacity(0.15),
                                borderRadius: BorderRadius.circular(8),
                              ),
                              child: const Text('Equally Divided', style: TextStyle(fontSize: 11, fontWeight: FontWeight.bold, color: Color(0xFF10B981))),
                            ),
                          ],
                        ),
                      ],
                    ),
                  ),
                ],
              ),
            ),
          ),
          const SizedBox(height: 14),

          // Bottom Action: Direct Send to WhatsApp & Copy text
          Row(
            children: [
              Expanded(
                child: ElevatedButton.icon(
                  style: ElevatedButton.styleFrom(
                    backgroundColor: const Color(0xFF25D366), // WhatsApp Green
                    foregroundColor: Colors.white,
                    shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                    padding: const EdgeInsets.symmetric(vertical: 14),
                  ),
                  icon: _isSending
                      ? const SizedBox(
                          width: 18,
                          height: 18,
                          child: CircularProgressIndicator(
                            strokeWidth: 2,
                            color: Colors.white,
                          ),
                        )
                      : const Icon(Icons.share_rounded, size: 20),
                  label: Text(
                    _isSending ? 'Opening WhatsApp…' : 'Send to WhatsApp',
                    style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 14),
                  ),
                  onPressed: (_totalAmount > 0 && !_isSending) ? _sendToWhatsApp : null,
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
                tooltip: 'Copy split message',
                onPressed: () {
                  final state = Provider.of<AppState>(context, listen: false);
                  // Only use the user's real saved UPI ID — never a fabricated handle.
                  final vpa = (state.currentUser?.upiId ?? '').trim();
                  final payLine = vpa.isNotEmpty
                      ? 'Pay UPI: $vpa'
                      : 'Add your UPI ID in FinPocket → Receive Money to include a payment link.';
                  final msg = 'Bill Split: ${_titleController.text}\nTotal: ₹${_totalAmount.toStringAsFixed(0)}\n$_membersCount friends: ₹${_perPersonShare.toStringAsFixed(0)} each\n$payLine';
                  Clipboard.setData(ClipboardData(text: msg));
                  ScaffoldMessenger.of(context).showSnackBar(
                    const SnackBar(content: Text('Copied bill split message to clipboard.')),
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
