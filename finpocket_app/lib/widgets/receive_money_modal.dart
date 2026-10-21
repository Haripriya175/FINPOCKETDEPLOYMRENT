import 'dart:math' as math;
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:provider/provider.dart';
import 'package:qr_flutter/qr_flutter.dart';
import '../providers/app_state.dart';
import '../services/api_service.dart';
import '../services/external_intent_service.dart';
import '../theme/app_theme.dart';

/// The actual "Receive Money" surface: my QR, my UPI ID, optional amount
/// request and the share actions.
///
/// It is deliberately a standalone widget rather than being welded to a bottom
/// sheet, so the Payments tab can host a real Receive view instead of Receive
/// only ever existing as a popup sitting on top of the Send form.
class ReceiveMoneyPanel extends StatefulWidget {
  /// Rendered in the sheet header; omit when embedded in a screen.
  final VoidCallback? onClose;

  const ReceiveMoneyPanel({super.key, this.onClose});

  @override
  State<ReceiveMoneyPanel> createState() => _ReceiveMoneyPanelState();
}

class _ReceiveMoneyPanelState extends State<ReceiveMoneyPanel> {
  final TextEditingController _amountController = TextEditingController();
  final TextEditingController _noteController = TextEditingController();
  final TextEditingController _upiController = TextEditingController();
  bool _isCustomAmount = false;
  bool _isSharing = false;
  bool _savingUpi = false;
  String? _upiError;

  @override
  void dispose() {
    _amountController.dispose();
    _noteController.dispose();
    _upiController.dispose();
    super.dispose();
  }

  /// Persists the UPI ID the user typed. This is the ID they already own in
  /// their own UPI app — we store it, we do not mint it.
  Future<void> _saveUpiId(AppState state) async {
    final candidate = _upiController.text.trim().toLowerCase();
    if (candidate.isEmpty) {
      setState(() => _upiError = 'Enter your UPI ID to receive money.');
      return;
    }
    if (!RegExp(r'^[a-z0-9.\-_]{2,256}@[a-z0-9.\-]{2,64}$').hasMatch(candidate)) {
      setState(() => _upiError = 'That is not a valid UPI ID. Example: 9876543210@okaxis');
      return;
    }

    setState(() {
      _savingUpi = true;
      _upiError = null;
    });
    try {
      final saved = await ApiService.setUpiId(candidate);
      if (!mounted) return;
      await state.applyUpiId(saved);
      if (!mounted) return;
      setState(() => _savingUpi = false);
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          backgroundColor: Color(0xFF10B981),
          content: Text('UPI ID saved. Your QR is ready.'),
        ),
      );
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _savingUpi = false;
        _upiError = e.toString().replaceFirst('Exception: ', '');
      });
    }
  }

  String _buildUpiUri({
    required String vpa,
    required String name,
    double? amount,
    String? note,
  }) {
    final buffer = StringBuffer('upi://pay?pa=$vpa&pn=${Uri.encodeComponent(name)}&cu=INR');
    if (amount != null && amount > 0) {
      buffer.write('&am=${amount.toStringAsFixed(2)}');
    }
    if (note != null && note.trim().isNotEmpty) {
      buffer.write('&tn=${Uri.encodeComponent(note.trim())}');
    }
    return buffer.toString();
  }

  /// Shares the payment request. Unlike a "copy" button this actually hands the
  /// message to WhatsApp (or SMS as a fallback) with the text prefilled.
  Future<void> _shareRequest({
    required String message,
    required String phone,
  }) async {
    if (_isSharing) return;
    setState(() => _isSharing = true);
    try {
      final opened = await ExternalIntentService.launchWhatsApp(
        text: message,
        phone: phone.isNotEmpty ? phone : null,
      );
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          backgroundColor: opened ? const Color(0xFF10B981) : const Color(0xFFF59E0B),
          duration: const Duration(seconds: 3),
          content: Text(
            opened
                ? 'WhatsApp opened — tap send to share your payment request.'
                : 'WhatsApp is not installed. The request was copied instead.',
          ),
        ),
      );
      if (!opened) {
        await Clipboard.setData(ClipboardData(text: message));
      }
    } finally {
      if (mounted) setState(() => _isSharing = false);
    }
  }

  /// Shown in place of the QR until the user has told us their real UPI ID.
  ///
  /// A QR is a promise that scanning it will pay someone. Rendering one from a
  /// made-up VPA breaks that promise the moment a stranger tries to pay you,
  /// so we show only the input until the VPA is genuine.
  Widget _buildUpiSetupField(bool isDark) {
    final borderColor = _upiError != null
        ? const Color(0xFFF59E0B)
        : (isDark ? AppTheme.borderDark : AppTheme.borderLight);

    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: isDark ? const Color(0xFF1E293B) : const Color(0xFFF8FAFC),
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: borderColor),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              const Icon(Icons.account_balance_wallet_rounded, size: 18, color: AppTheme.primary),
              const SizedBox(width: 8),
              Text(
                'Add your UPI ID',
                style: TextStyle(
                  fontSize: 13,
                  fontWeight: FontWeight.w800,
                  color: isDark ? Colors.white : const Color(0xFF0F172A),
                ),
              ),
            ],
          ),
          const SizedBox(height: 6),
          Text(
            'FinPocket does not issue UPI IDs. Enter the one from your PhonePe, '
            'Google Pay or Paytm and your QR will work with every UPI app.',
            style: TextStyle(
              fontSize: 11.5,
              height: 1.4,
              color: isDark ? AppTheme.textMutedDark : AppTheme.textSecondaryLight,
            ),
          ),
          const SizedBox(height: 12),
          TextField(
            controller: _upiController,
            enabled: !_savingUpi,
            autocorrect: false,
            keyboardType: TextInputType.emailAddress,
            textInputAction: TextInputAction.done,
            style: const TextStyle(fontSize: 14, fontWeight: FontWeight.w700),
            decoration: InputDecoration(
              hintText: '9876543210@okaxis',
              hintStyle: TextStyle(
                color: isDark ? AppTheme.textMutedDark : AppTheme.textSecondaryLight,
              ),
              isDense: true,
              filled: true,
              fillColor: isDark ? const Color(0xFF0F172A) : Colors.white,
              border: OutlineInputBorder(
                borderRadius: BorderRadius.circular(10),
                borderSide: BorderSide(color: isDark ? AppTheme.borderDark : AppTheme.borderLight),
              ),
              enabledBorder: OutlineInputBorder(
                borderRadius: BorderRadius.circular(10),
                borderSide: BorderSide(color: isDark ? AppTheme.borderDark : AppTheme.borderLight),
              ),
            ),
            onSubmitted: (_) => _saveUpiId(Provider.of<AppState>(context, listen: false)),
          ),
          if (_upiError != null) ...[
            const SizedBox(height: 8),
            Text(
              _upiError!,
              style: const TextStyle(fontSize: 11.5, color: Color(0xFFF59E0B)),
            ),
          ],
          const SizedBox(height: 12),
          SizedBox(
            height: 40,
            child: ElevatedButton(
              onPressed: _savingUpi
                  ? null
                  : () => _saveUpiId(Provider.of<AppState>(context, listen: false)),
              style: ElevatedButton.styleFrom(
                backgroundColor: AppTheme.primary,
                foregroundColor: Colors.white,
                shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
              ),
              child: _savingUpi
                  ? const SizedBox(
                      width: 16,
                      height: 16,
                      child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white),
                    )
                  : const Text('Save & create my QR',
                      style: TextStyle(fontWeight: FontWeight.bold, fontSize: 13)),
            ),
          ),
        ],
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final state = Provider.of<AppState>(context);
    final isDark = Theme.of(context).brightness == Brightness.dark;

    final userName = state.currentUser?.fullName.isNotEmpty == true
        ? state.currentUser!.fullName
        : 'FinPocket User';
    final userPhone = state.currentUser?.phone.replaceAll(RegExp(r'\D'), '') ?? '';

    final primaryBank = state.bankAccounts.isNotEmpty ? state.bankAccounts.first : null;
    final primaryBankName = primaryBank?.bankName ?? 'Bank not connected';

    // The VPA must be one the user actually owns in their own UPI app.
    //
    // This used to fabricate one — `98xxxx@okhdfcbank` (HDFC's real handle with
    // whatever number happened to be on the account) or `<name>@upi` (not a PSP
    // domain NPCI has ever issued). Every QR built from those was rejected by
    // every UPI app, because the VPA simply does not exist.
    final vpa = (state.currentUser?.upiId ?? '').trim();
    final hasVpa = vpa.isNotEmpty;

    final customAmount = double.tryParse(_amountController.text) ?? 0.0;
    final note = _noteController.text;
    final wantsAmount = _isCustomAmount && customAmount > 0;

    final upiPayload = _buildUpiUri(
      vpa: vpa,
      name: userName,
      amount: wantsAmount ? customAmount : null,
      note: _isCustomAmount && note.isNotEmpty ? note : null,
    );

    final shareMessage = wantsAmount
        ? 'Hey! Please pay ₹${customAmount.toStringAsFixed(0)} to $userName via UPI.\nUPI ID: $vpa\nDirect Pay Link: $upiPayload'
        : 'Hey! You can pay $userName using UPI.\nUPI ID: $vpa\nDirect Pay Link: $upiPayload';

    return Column(
      mainAxisSize: MainAxisSize.min,
      children: [
        if (widget.onClose != null) ...[
          // Header (only when presented as a sheet)
          Row(
            children: [
              Container(
                padding: const EdgeInsets.all(10),
                decoration: BoxDecoration(
                  color: AppTheme.primary.withOpacity(0.15),
                  borderRadius: BorderRadius.circular(12),
                ),
                child: const Icon(Icons.qr_code_2_rounded, color: AppTheme.primary, size: 24),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      'Receive Money',
                      style: TextStyle(
                        fontSize: 17,
                        fontWeight: FontWeight.w800,
                        color: isDark ? AppTheme.textPrimaryDark : AppTheme.textPrimaryLight,
                      ),
                    ),
                    Text(
                      'Show your QR — the payer scans it with any UPI app',
                      style: TextStyle(
                        fontSize: 11,
                        color: isDark ? AppTheme.textSecondaryDark : AppTheme.textSecondaryLight,
                      ),
                    ),
                  ],
                ),
              ),
              IconButton(
                icon: const Icon(Icons.close_rounded, size: 20),
                onPressed: widget.onClose,
              ),
            ],
          ),
          const SizedBox(height: 16),
        ],

        Flexible(
          child: SingleChildScrollView(
            child: Column(
              children: [
                // QR Container
                Container(
                  padding: const EdgeInsets.all(18),
                  decoration: BoxDecoration(
                    color: Colors.white,
                    borderRadius: BorderRadius.circular(20),
                    boxShadow: [
                      BoxShadow(
                        color: AppTheme.primary.withOpacity(0.12),
                        blurRadius: 18,
                        offset: const Offset(0, 6),
                      ),
                    ],
                    border: Border.all(color: const Color(0xFFE2E8F0), width: 1.5),
                  ),
                  child: Column(
                    children: [
                      Text(
                        userName,
                        style: const TextStyle(
                          fontSize: 16,
                          fontWeight: FontWeight.w800,
                          color: Color(0xFF0F172A),
                        ),
                      ),
                      const SizedBox(height: 2),
                      Text(
                        'Linked: $primaryBankName',
                        style: const TextStyle(
                          fontSize: 11,
                          fontWeight: FontWeight.w600,
                          color: Color(0xFF64748B),
                        ),
                      ),
                      const SizedBox(height: 14),
                      if (!hasVpa)
                        _buildUpiSetupField(isDark)
                      else ...[
                        SizedBox(
                          width: 210,
                          height: 210,
                          child: QrImageView(
                            data: upiPayload,
                            version: QrVersions.auto,
                            size: 210,
                            gapless: false,
                          ),
                        ),
                        const SizedBox(height: 12),
                        if (wantsAmount) ...[
                          Container(
                            padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
                            decoration: BoxDecoration(
                              color: const Color(0xFF10B981).withOpacity(0.12),
                              borderRadius: BorderRadius.circular(8),
                            ),
                            child: Text(
                              'Requesting Exactly: ₹${customAmount.toStringAsFixed(0)}',
                              style: const TextStyle(
                                fontSize: 13,
                                fontWeight: FontWeight.w800,
                                color: Color(0xFF059669),
                              ),
                            ),
                          ),
                          const SizedBox(height: 8),
                        ],
                        InkWell(
                          borderRadius: BorderRadius.circular(10),
                          onTap: () {
                            Clipboard.setData(ClipboardData(text: vpa));
                            ScaffoldMessenger.of(context).showSnackBar(
                              SnackBar(
                                content: Text('Copied UPI ID: $vpa'),
                                duration: const Duration(seconds: 2),
                              ),
                            );
                          },
                          child: Container(
                            padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
                            decoration: BoxDecoration(
                              color: const Color(0xFFF1F5F9),
                              borderRadius: BorderRadius.circular(10),
                              border: Border.all(color: const Color(0xFFCBD5E1)),
                            ),
                            child: Row(
                              mainAxisSize: MainAxisSize.min,
                              children: [
                                Text(
                                  vpa,
                                  style: const TextStyle(
                                    fontSize: 13,
                                    fontWeight: FontWeight.w700,
                                    color: Color(0xFF334155),
                                  ),
                                ),
                                const SizedBox(width: 8),
                                const Icon(Icons.copy_rounded, size: 14, color: Color(0xFF64748B)),
                              ],
                            ),
                          ),
                        ),
                      ],
                    ],
                  ),
                ),
                const SizedBox(height: 16),

                // Request specific amount
                Container(
                  padding: const EdgeInsets.all(14),
                  decoration: BoxDecoration(
                    color: isDark ? const Color(0xFF1E293B) : const Color(0xFFF8FAFC),
                    borderRadius: BorderRadius.circular(14),
                    border: Border.all(color: isDark ? AppTheme.borderDark : AppTheme.borderLight),
                  ),
                  child: Column(
                    children: [
                      Row(
                        mainAxisAlignment: MainAxisAlignment.spaceBetween,
                        children: [
                          Row(
                            children: [
                              const Text('💰', style: TextStyle(fontSize: 16)),
                              const SizedBox(width: 8),
                              Text(
                                'Request Specific Amount',
                                style: TextStyle(
                                  fontSize: 13,
                                  fontWeight: FontWeight.w700,
                                  color: isDark
                                      ? AppTheme.textPrimaryDark
                                      : AppTheme.textPrimaryLight,
                                ),
                              ),
                            ],
                          ),
                          Switch(
                            value: _isCustomAmount,
                            activeColor: AppTheme.primary,
                            onChanged: (val) {
                              setState(() {
                                _isCustomAmount = val;
                                if (!val) {
                                  _amountController.clear();
                                  _noteController.clear();
                                }
                              });
                            },
                          ),
                        ],
                      ),
                      if (_isCustomAmount) ...[
                        const SizedBox(height: 10),
                        TextField(
                          controller: _amountController,
                          keyboardType: TextInputType.number,
                          decoration: InputDecoration(
                            labelText: 'Amount (₹)',
                            hintText: 'e.g. 500',
                            prefixIcon: const Icon(Icons.currency_rupee_rounded, size: 18),
                            isDense: true,
                            border: OutlineInputBorder(borderRadius: BorderRadius.circular(10)),
                          ),
                          onChanged: (_) => setState(() {}),
                        ),
                        const SizedBox(height: 10),
                        TextField(
                          controller: _noteController,
                          decoration: InputDecoration(
                            labelText: 'Purpose / Note (optional)',
                            hintText: 'e.g. Dinner share or Rent',
                            prefixIcon: const Icon(Icons.edit_note_rounded, size: 18),
                            isDense: true,
                            border: OutlineInputBorder(borderRadius: BorderRadius.circular(10)),
                          ),
                          onChanged: (_) => setState(() {}),
                        ),
                      ],
                    ],
                  ),
                ),
              ],
            ),
          ),
        ),
        const SizedBox(height: 14),

        // Actions — worded as *requesting*, never as "sending money"
        Row(
          children: [
            Expanded(
              child: ElevatedButton.icon(
                style: ElevatedButton.styleFrom(
                  backgroundColor: const Color(0xFF25D366),
                  foregroundColor: Colors.white,
                  shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                  padding: const EdgeInsets.symmetric(vertical: 13),
                ),
                icon: _isSharing
                    ? const SizedBox(
                        width: 16,
                        height: 16,
                        child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white),
                      )
                    : const Icon(Icons.share_rounded, size: 18),
                label: Text(
                  _isSharing ? 'Opening…' : 'Share Payment Request',
                  style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 13),
                ),
                // Nothing to share until the VPA is real — a request containing a
                // fabricated UPI ID is exactly the failure we are removing.
                onPressed: (_isSharing || !hasVpa)
                    ? null
                    : () => _shareRequest(message: shareMessage, phone: userPhone),
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
              tooltip: 'Copy UPI details',
              onPressed: !hasVpa
                  ? null
                  : () {
                      Clipboard.setData(ClipboardData(text: 'UPI ID: $vpa\nPay Link: $upiPayload'));
                      ScaffoldMessenger.of(context).showSnackBar(
                        const SnackBar(content: Text('Copied payment details to clipboard.')),
                      );
                    },
            ),
          ],
        ),
      ],
    );
  }
}

/// Bottom-sheet presentation of [ReceiveMoneyPanel].
class ReceiveMoneyModal extends StatelessWidget {
  const ReceiveMoneyModal({super.key});

  static Future<void> show(BuildContext context) {
    return showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      builder: (ctx) => const ReceiveMoneyModal(),
    );
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
          Expanded(
            child: ReceiveMoneyPanel(onClose: () => Navigator.pop(context)),
          ),
        ],
      ),
    ),
  );
  }
}
