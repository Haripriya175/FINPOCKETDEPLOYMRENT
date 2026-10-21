import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../providers/app_state.dart';
import '../theme/app_theme.dart';
import '../services/local_transaction_storage_service.dart';

class LocalVaultConsentModal extends StatefulWidget {
  const LocalVaultConsentModal({super.key});

  static Future<void> show(BuildContext context) {
    return showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      builder: (ctx) => const LocalVaultConsentModal(),
    );
  }

  @override
  State<LocalVaultConsentModal> createState() => _LocalVaultConsentModalState();
}

class _LocalVaultConsentModalState extends State<LocalVaultConsentModal> {
  bool _vaultEnabled = true;
  bool _isLoading = false;

  @override
  void initState() {
    super.initState();
    _loadInitialState();
  }

  Future<void> _loadInitialState() async {
    final vaultConsent = await LocalTransactionStorageService.isVaultConsentGranted();

    if (mounted) {
      setState(() {
        _vaultEnabled = vaultConsent;
      });
    }
  }

  Future<void> _handleSmsSync() async {
    setState(() => _isLoading = true);
    final state = Provider.of<AppState>(context, listen: false);

    await LocalTransactionStorageService.setVaultConsent(true);
    await LocalTransactionStorageService.setSmsSyncConsent(true);

    final count = await state.syncBankSmsTransactions(forceRequestPermission: true);

    if (mounted) {
      setState(() {
        _isLoading = false;
        _vaultEnabled = true;
      });
      Navigator.pop(context);

      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Row(
            children: [
              const Icon(Icons.check_circle_outline, color: Colors.white, size: 20),
              const SizedBox(width: 8),
              Expanded(
                child: Text(
                  count > 0
                      ? 'Successfully synced $count bank transactions to local storage!'
                      : 'No new bank SMS found or permission not granted.',
                ),
              ),
            ],
          ),
          backgroundColor: count > 0 ? AppTheme.success : AppTheme.primaryDark,
          behavior: SnackBarBehavior.floating,
        ),
      );
    }
  }

  Future<void> _handleClearLocalVault() async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        backgroundColor: const Color(0xFF0F172A),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
        title: const Text('Clear Local Vault?', style: TextStyle(color: Colors.white, fontSize: 16, fontWeight: FontWeight.bold)),
        content: const Text(
          'This will wipe all locally stored transaction records and cached bank history from this device.',
          style: TextStyle(color: Color(0xFF94A3B8), fontSize: 13),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx, false),
            child: const Text('Cancel'),
          ),
          ElevatedButton(
            style: ElevatedButton.styleFrom(backgroundColor: AppTheme.danger),
            onPressed: () => Navigator.pop(ctx, true),
            child: const Text('Clear Storage', style: TextStyle(color: Colors.white)),
          ),
        ],
      ),
    );

    if (confirmed == true && mounted) {
      await LocalTransactionStorageService.clearLocalTransactions();
      if (!mounted) return;
      final state = Provider.of<AppState>(context, listen: false);
      await state.refreshAllData();
      if (mounted) {
        Navigator.pop(context);
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Local transaction vault cleared.')),
        );
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final state = Provider.of<AppState>(context);

    return Container(
      decoration: BoxDecoration(
        color: isDark ? const Color(0xFF0F172A) : Colors.white,
        borderRadius: const BorderRadius.vertical(top: Radius.circular(24)),
        border: Border.all(
          color: isDark ? const Color(0xFF1E293B) : const Color(0xFFE2E8F0),
        ),
      ),
      padding: EdgeInsets.only(
        left: 20,
        right: 20,
        top: 16,
        bottom: MediaQuery.of(context).padding.bottom + 20,
      ),
      child: SingleChildScrollView(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
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

            // Header
            Row(
              children: [
                Container(
                  padding: const EdgeInsets.all(10),
                  decoration: BoxDecoration(
                    color: AppTheme.primary.withOpacity(0.12),
                    borderRadius: BorderRadius.circular(12),
                  ),
                  child: const Icon(Icons.shield_rounded, color: AppTheme.primary, size: 26),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        'On-Device Bank Vault',
                        style: TextStyle(
                          fontSize: 18,
                          fontWeight: FontWeight.bold,
                          color: isDark ? Colors.white : AppTheme.textPrimaryLight,
                        ),
                      ),
                      const SizedBox(height: 2),
                      const Text(
                        '100% Private • Local-Only • Zero Cloud Leakage',
                        style: TextStyle(fontSize: 11, color: AppTheme.primary, fontWeight: FontWeight.w600),
                      ),
                    ],
                  ),
                ),
                IconButton(
                  icon: const Icon(Icons.close, size: 20),
                  onPressed: () => Navigator.pop(context),
                ),
              ],
            ),
            const SizedBox(height: 16),

            // Privacy Guarantees Box
            Container(
              padding: const EdgeInsets.all(14),
              decoration: BoxDecoration(
                color: isDark ? const Color(0xFF1E293B) : const Color(0xFFF8FAFC),
                borderRadius: BorderRadius.circular(14),
                border: Border.all(
                  color: isDark ? const Color(0xFF334155) : const Color(0xFFE2E8F0),
                ),
              ),
              child: Column(
                children: [
                  _guaranteeRow(
                    icon: Icons.lock_outline,
                    title: 'Stored Locally on Your Phone',
                    desc: 'Transactions and payment receipts are saved in on-device storage. You can view them even when offline.',
                    isDark: isDark,
                  ),
                  const Divider(color: Color(0xFF334155), height: 18),
                  _guaranteeRow(
                    icon: Icons.sms_outlined,
                    title: 'Strictly Bank & Financial SMS Only',
                    desc: 'FinPocket scans only transaction alerts (HDFC, SBI, ICICI, Axis, Paytm, UPI). Personal messages are completely ignored.',
                    isDark: isDark,
                  ),
                  const Divider(color: Color(0xFF334155), height: 18),
                  _guaranteeRow(
                    icon: Icons.cloud_off_outlined,
                    title: 'No Cloud Upload',
                    desc: 'Your parsed SMS texts and raw bank messages are never transmitted to external cloud servers.',
                    isDark: isDark,
                  ),
                ],
              ),
            ),
            const SizedBox(height: 16),

            // Toggles
            SwitchListTile(
              contentPadding: EdgeInsets.zero,
              title: Text(
                'Store Transactions Locally',
                style: TextStyle(
                  fontSize: 14,
                  fontWeight: FontWeight.w600,
                  color: isDark ? Colors.white : AppTheme.textPrimaryLight,
                ),
              ),
              subtitle: Text(
                'Keep all payment history offline in on-device vault',
                style: TextStyle(
                  fontSize: 12,
                  color: isDark ? AppTheme.textSecondaryDark : AppTheme.textSecondaryLight,
                ),
              ),
              value: _vaultEnabled,
              activeColor: AppTheme.primary,
              onChanged: (val) async {
                setState(() => _vaultEnabled = val);
                await state.setLocalVaultActive(val);
              },
            ),
            const SizedBox(height: 8),

            // Action Buttons
            SizedBox(
              width: double.infinity,
              height: 48,
              child: ElevatedButton.icon(
                style: ElevatedButton.styleFrom(
                  backgroundColor: AppTheme.primary,
                  foregroundColor: Colors.white,
                  shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                ),
                onPressed: _isLoading || state.isSmsSyncing ? null : _handleSmsSync,
                icon: _isLoading || state.isSmsSyncing
                    ? const SizedBox(
                        width: 18,
                        height: 18,
                        child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white),
                      )
                    : const Icon(Icons.sync_rounded, size: 20),
                label: Text(
                  _isLoading || state.isSmsSyncing
                      ? 'Scanning Bank SMS...'
                      : 'Grant Permission & Sync Bank SMS',
                  style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 14),
                ),
              ),
            ),
            const SizedBox(height: 10),

            Row(
              children: [
                Expanded(
                  child: OutlinedButton(
                    style: OutlinedButton.styleFrom(
                      foregroundColor: AppTheme.danger,
                      side: const BorderSide(color: Color(0xFFEF4444)),
                      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
                      padding: const EdgeInsets.symmetric(vertical: 10),
                    ),
                    onPressed: _handleClearLocalVault,
                    child: const Text('Clear Local Vault', style: TextStyle(fontSize: 12)),
                  ),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }

  Widget _guaranteeRow({
    required IconData icon,
    required String title,
    required String desc,
    required bool isDark,
  }) {
    return Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Icon(icon, color: AppTheme.primary, size: 20),
        const SizedBox(width: 10),
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                title,
                style: TextStyle(
                  fontSize: 13,
                  fontWeight: FontWeight.w600,
                  color: isDark ? Colors.white : AppTheme.textPrimaryLight,
                ),
              ),
              const SizedBox(height: 2),
              Text(
                desc,
                style: TextStyle(
                  fontSize: 11,
                  height: 1.3,
                  color: isDark ? const Color(0xFF94A3B8) : const Color(0xFF64748B),
                ),
              ),
            ],
          ),
        ),
      ],
    );
  }
}
