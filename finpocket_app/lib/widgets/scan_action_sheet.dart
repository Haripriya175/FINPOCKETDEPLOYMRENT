import 'package:flutter/material.dart';
import '../theme/app_theme.dart';
import 'smart_bill_split_modal.dart';

/// What the user chose to do with a freshly scanned code.
enum ScanAction { pay, splitBill, cancel }

class ScanDecision {
  final ScanAction action;

  /// Raw payload from the scanner, only meaningful for [ScanAction.pay].
  final String payload;
  const ScanDecision(this.action, this.payload);
}

/// Shown immediately after every successful scan.
///
/// The scanner no longer drops the user straight into Send Money: it asks what
/// the code is for. Choosing "Split bill" opens the splitter with the scanned
/// total and place already filled in, ready to pick the number of members and
/// push the request to WhatsApp.
class ScanActionSheet {
  static Future<ScanDecision> ask(BuildContext context, String scanned) async {
    final amount = _extractAmount(scanned);
    final place = _extractPlace(scanned);

    final action = await showModalBottomSheet<ScanAction>(
      context: context,
      backgroundColor: Colors.transparent,
      isScrollControlled: true,
      builder: (ctx) {
        final isDark = Theme.of(ctx).brightness == Brightness.dark;
        return SafeArea(
          child: Container(
            decoration: BoxDecoration(
              color: isDark ? const Color(0xFF0F172A) : Colors.white,
              borderRadius: const BorderRadius.vertical(top: Radius.circular(24)),
              border: Border.all(
                color: isDark ? AppTheme.borderDark : AppTheme.borderLight,
              ),
            ),
            padding: const EdgeInsets.fromLTRB(20, 12, 20, 20),
            child: Column(
              mainAxisSize: MainAxisSize.min,
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
                Text(
                  'Scan complete',
                  textAlign: TextAlign.center,
                  style: TextStyle(
                    fontSize: 16,
                    fontWeight: FontWeight.w800,
                    color: isDark ? AppTheme.textPrimaryDark : AppTheme.textPrimaryLight,
                  ),
                ),
                const SizedBox(height: 4),
                Text(
                  'What would you like to do with it?',
                  textAlign: TextAlign.center,
                  style: TextStyle(
                    fontSize: 12,
                    color: isDark ? AppTheme.textSecondaryDark : AppTheme.textSecondaryLight,
                  ),
                ),
                const SizedBox(height: 14),

                // Scanned payload preview
                Container(
                  padding: const EdgeInsets.all(12),
                  decoration: BoxDecoration(
                    color: isDark ? const Color(0xFF1E293B) : const Color(0xFFF1F5F9),
                    borderRadius: BorderRadius.circular(12),
                  ),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      if (amount != null)
                        Padding(
                          padding: const EdgeInsets.only(bottom: 4),
                          child: Text(
                            '₹${amount.toStringAsFixed(0)}',
                            style: const TextStyle(
                              fontSize: 22,
                              fontWeight: FontWeight.w900,
                              color: AppTheme.primary,
                            ),
                          ),
                        ),
                      Text(
                        scanned,
                        maxLines: 2,
                        overflow: TextOverflow.ellipsis,
                        style: TextStyle(
                          fontSize: 11,
                          color: isDark ? Colors.white60 : Colors.black54,
                        ),
                      ),
                    ],
                  ),
                ),
                const SizedBox(height: 16),

                // Split bill — the primary path
                ElevatedButton.icon(
                  style: ElevatedButton.styleFrom(
                    backgroundColor: const Color(0xFF10B981),
                    foregroundColor: Colors.white,
                    padding: const EdgeInsets.symmetric(vertical: 14),
                    shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                  ),
                  icon: const Icon(Icons.groups_rounded, size: 20),
                  label: const Text(
                    'Split bill with friends',
                    style: TextStyle(fontWeight: FontWeight.bold, fontSize: 14),
                  ),
                  onPressed: () => Navigator.pop(ctx, ScanAction.splitBill),
                ),
                const SizedBox(height: 8),

                OutlinedButton.icon(
                  style: OutlinedButton.styleFrom(
                    padding: const EdgeInsets.symmetric(vertical: 14),
                    side: BorderSide(
                      color: isDark ? AppTheme.borderDark : AppTheme.borderLight,
                    ),
                    shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                  ),
                  icon: const Icon(Icons.near_me_rounded, size: 18, color: AppTheme.primary),
                  label: const Text(
                    'Pay this QR',
                    style: TextStyle(
                      fontWeight: FontWeight.bold,
                      fontSize: 14,
                      color: AppTheme.primary,
                    ),
                  ),
                  onPressed: () => Navigator.pop(ctx, ScanAction.pay),
                ),
                const SizedBox(height: 8),

                TextButton(
                  onPressed: () => Navigator.pop(ctx, ScanAction.cancel),
                  child: Text(
                    'Cancel',
                    style: TextStyle(
                      color: isDark ? Colors.white60 : Colors.black45,
                      fontSize: 13,
                    ),
                  ),
                ),
              ],
            ),
          ),
        );
      },
    );
    if (!context.mounted) return const ScanDecision(ScanAction.cancel, '');

    switch (action) {
      case ScanAction.splitBill:
        await SmartBillSplitModal.show(
          context,
          initialAmount: amount,
          initialTitle: place,
        );
        return const ScanDecision(ScanAction.cancel, '');
      case ScanAction.pay:
        return ScanDecision(ScanAction.pay, scanned);
      case ScanAction.cancel:
      case null:
        return const ScanDecision(ScanAction.cancel, '');
    }
  }

  /// Pulls a rupee amount out of a UPI payload (`am=`, `amount=`) or a bare
  /// numeric code, so the splitter opens pre-filled instead of blank.
  static double? _extractAmount(String scanned) {
    final paramMatch =
        RegExp(r'[?&](?:am|amount)=([0-9]+(?:\.[0-9]+)?)').firstMatch(scanned);
    if (paramMatch != null) {
      final v = double.tryParse(paramMatch.group(1) ?? '');
      if (v != null && v > 0) return v;
    }
    final bare = double.tryParse(scanned.replaceAll(RegExp(r'[^0-9.]'), ''));
    if (bare != null && bare > 0 && bare < 1000000) return bare;
    return null;
  }

  /// Best-effort merchant/place label for the splitter title.
  static String _extractPlace(String scanned) {
    final nameMatch = RegExp(r'[?&](?:pn|payee|name)=([^&]+)').firstMatch(scanned);
    if (nameMatch != null) {
      final raw = nameMatch.group(1) ?? '';
      String decoded;
      try {
        decoded = Uri.decodeComponent(raw);
      } catch (_) {
        decoded = raw;
      }
      if (decoded.trim().isNotEmpty) return decoded.trim();
    }
    return 'Group Expense';
  }
}
