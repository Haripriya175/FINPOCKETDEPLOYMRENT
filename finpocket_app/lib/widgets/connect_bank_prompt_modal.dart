import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:shared_preferences/shared_preferences.dart';
import '../providers/app_state.dart';
import '../theme/app_theme.dart';
import 'connect_bank_modal.dart';

/// One-time post-login question: "Do you want to connect your bank?"
///
/// Shown after [FinancialProfileOnboardingModal] has closed so the two
/// onboarding sheets never stack. Answering "Connect Bank" opens the real
/// flow (registered mobile → AA consent or on-device SMS importer);
/// "Not now" keeps the user at zero accounts — a valid state that is never
/// replaced with a fake wallet.
class ConnectBankPromptModal {
  static const String promptFlagKey = 'finpocket_connect_bank_prompted_v1';

  static Future<void> showIfNeeded(BuildContext context) async {
    bool prompted = true;
    try {
      final prefs = await SharedPreferences.getInstance();
      prompted = prefs.getBool(promptFlagKey) ?? false;
      if (prompted) return;
    } catch (_) {
      return; // Without prefs we can't guarantee "once only" — stay quiet.
    }
    if (!context.mounted) return;

    // Only users without any connected bank are asked; anyone who already
    // linked a real account never sees this again.
    final state = Provider.of<AppState>(context, listen: false);
    if (state.bankAccounts.isNotEmpty) {
      try {
        final prefs = await SharedPreferences.getInstance();
        await prefs.setBool(promptFlagKey, true);
      } catch (_) {}
      return;
    }

    final connect = await showDialog<bool>(
      context: context,
      builder: (ctx) {
        final isDark = Theme.of(ctx).brightness == Brightness.dark;
        return AlertDialog(
          backgroundColor: isDark ? AppTheme.bgSurfaceDark : AppTheme.bgSurfaceLight,
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
          title: Row(
            children: [
              Container(
                padding: const EdgeInsets.all(8),
                decoration: BoxDecoration(
                  color: AppTheme.primary.withOpacity(0.15),
                  borderRadius: BorderRadius.circular(10),
                ),
                child: const Icon(Icons.account_balance_rounded, color: AppTheme.primary, size: 22),
              ),
              const SizedBox(width: 10),
              const Expanded(
                child: Text(
                  'Connect your bank?',
                  style: TextStyle(fontSize: 16, fontWeight: FontWeight.w800),
                ),
              ),
            ],
          ),
          content: const Text(
            'See your real balance and transactions. FinPocket reads what your '
            'bank sends — new accounts start at ₹0 and we never invent numbers.',
            style: TextStyle(fontSize: 13, color: Color(0xFF94A3B8), height: 1.45),
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.pop(ctx, false),
              child: Text(
                'Not now',
                style: TextStyle(color: isDark ? Colors.white60 : Colors.black45),
              ),
            ),
            ElevatedButton(
              style: ElevatedButton.styleFrom(
                backgroundColor: AppTheme.primary,
                foregroundColor: Colors.white,
                shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
              ),
              onPressed: () => Navigator.pop(ctx, true),
              child: const Text('Connect Bank', style: TextStyle(fontWeight: FontWeight.bold)),
            ),
          ],
        );
      },
    );

    try {
      final prefs = await SharedPreferences.getInstance();
      await prefs.setBool(promptFlagKey, true);
    } catch (_) {}

    if (connect == true && context.mounted) {
      Navigator.of(context).push(
        MaterialPageRoute<void>(
          builder: (_) => const ConnectBankModal(),
        ),
      );
    }
  }
}
