import 'dart:convert';
import 'dart:io';

import 'package:flutter/material.dart';
import 'package:path_provider/path_provider.dart';
import 'package:provider/provider.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:share_plus/share_plus.dart';

import '../providers/app_state.dart';
import '../theme/app_theme.dart';

class PrivacyCenterScreen extends StatefulWidget {
  const PrivacyCenterScreen({super.key});

  @override
  State<PrivacyCenterScreen> createState() => _PrivacyCenterScreenState();
}

class _PrivacyCenterScreenState extends State<PrivacyCenterScreen> {
  bool _piiMaskingEnabled = true;
  bool _analyticsEnabled = false;
  bool _isExporting = false;

  @override
  void initState() {
    super.initState();
    _loadPrivacyPrefs();
  }

  /// Load the persisted privacy toggles. (They were pure local widget state,
  /// so flipping one and leaving the screen silently reverted it — making the
  /// "Privacy Controls" purely decorative.)
  Future<void> _loadPrivacyPrefs() async {
    try {
      final prefs = await SharedPreferences.getInstance();
      if (!mounted) return;
      setState(() {
        _piiMaskingEnabled = prefs.getBool('fp_pii_masking') ?? true;
        _analyticsEnabled = prefs.getBool('fp_analytics_enabled') ?? false;
      });
    } catch (_) {}
  }

  Future<void> _setPiiMasking(bool val) async {
    setState(() => _piiMaskingEnabled = val);
    try {
      final prefs = await SharedPreferences.getInstance();
      await prefs.setBool('fp_pii_masking', val);
    } catch (_) {}
  }

  Future<void> _setAnalytics(bool val) async {
    setState(() => _analyticsEnabled = val);
    try {
      final prefs = await SharedPreferences.getInstance();
      await prefs.setBool('fp_analytics_enabled', val);
    } catch (_) {}
  }

  /// Writes the user's data export to a real file on disk and returns its
  /// path. The export contains only what the app already holds — never
  /// fabricated figures.
  Future<String?> _buildExportFile(AppState state) async {
    final exportData = {
      'exported_at': DateTime.now().toIso8601String(),
      'user': {
        'id': state.currentUser?.userId,
        'email': state.currentUser?.email,
        'name': state.currentUser?.fullName,
        'phone': state.currentUser?.phone,
      },
      'accounts': state.accounts
          .map((a) => {
                'id': a.id,
                'bankName': a.bankName,
                'type': a.accountType,
                'maskedAccountNumber': a.maskedAccountNumber,
                'balance': a.availableBalance,
                'providerType': a.providerType,
              })
          .toList(),
      'transactions': state.transactions
          .map((t) => {
                'id': t.id,
                'type': t.type.name,
                'amount': t.amount,
                'category': t.category.name,
                'status': t.status.name,
                'timestamp': t.timestamp.toIso8601String(),
                'referenceId': t.referenceId,
                'description': t.description,
                'paymentMethod': t.paymentMethod,
                'merchant': t.merchant,
              })
          .toList(),
      'bills_count': state.bills.length,
      'goals_count': state.goals.length,
      'emergency_fund': {
        'id': state.emergencyFund.id,
        'targetAmount': state.emergencyFund.targetAmount,
        'currentAmount': state.emergencyFund.currentAmount,
        'monthlyContribution': state.emergencyFund.monthlyContribution,
      },
    };

    final jsonString =
        const JsonEncoder.withIndent('  ').convert(exportData);
    final dir = await getApplicationDocumentsDirectory();
    final file = File(
        '${dir.path}/FinPocket-Data-Export_${DateTime.now().millisecondsSinceEpoch}.json');
    await file.writeAsString(jsonString, flush: true);
    return file.path;
  }

  Future<void> _exportUserData(AppState state) async {
    if (_isExporting) return;
    setState(() => _isExporting = true);
    try {
      final path = await _buildExportFile(state);
      if (!mounted) return;
      if (path == null) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Could not write the export file.')),
        );
        return;
      }
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Financial data exported to: $path')),
      );
      // Hand off to the share sheet so the user can forward the file
      // (WhatsApp, Drive, email...) — the file already exists on disk.
      await Share.shareXFiles([XFile(path)],
          text: 'FinPocket data export (JSON).');
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Export failed: $e')),
        );
      }
    } finally {
      if (mounted) setState(() => _isExporting = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final state = Provider.of<AppState>(context);
    final isDark = Theme.of(context).brightness == Brightness.dark;

    return Scaffold(
      backgroundColor: isDark ? AppTheme.bgDark : AppTheme.bgLight,
      appBar: AppBar(
        title: const Text('Privacy & Data Center', style: TextStyle(fontWeight: FontWeight.bold, fontSize: 18)),
        centerTitle: false,
      ),
      body: SingleChildScrollView(
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            _buildZeroDataSoldCard(isDark),
            const SizedBox(height: 16),
            _buildControlsSection(isDark),
            const SizedBox(height: 16),
            _buildDataPortabilitySection(state, isDark),
            const SizedBox(height: 24),
          ],
        ),
      ),
    );
  }

  Widget _buildZeroDataSoldCard(bool isDark) {
    return Container(
      padding: const EdgeInsets.all(18),
      decoration: BoxDecoration(
        color: isDark ? AppTheme.bgSurfaceDark : AppTheme.bgSurfaceLight,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: AppTheme.primary.withOpacity(0.3)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Row(
            children: [
              Icon(Icons.verified, color: AppTheme.primary, size: 22),
              SizedBox(width: 8),
              Text('Zero-Data-Broker Guarantee', style: TextStyle(fontWeight: FontWeight.bold, fontSize: 15)),
            ],
          ),
          const SizedBox(height: 8),
          Text(
            'FinPocket is built on a client-first privacy architecture. Your financial records, account numbers, and transaction data are never sold, rented, or shared with third-party advertising brokers.',
            style: TextStyle(fontSize: 12, color: isDark ? Colors.white70 : Colors.black87, height: 1.4),
          ),
        ],
      ),
    );
  }

  Widget _buildControlsSection(bool isDark) {
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: isDark ? AppTheme.bgSurfaceDark : AppTheme.bgSurfaceLight,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: isDark ? Colors.white12 : Colors.black12),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Text('Privacy Controls', style: TextStyle(fontWeight: FontWeight.bold, fontSize: 14)),
          const SizedBox(height: 12),
          SwitchListTile(
            contentPadding: EdgeInsets.zero,
            title: const Text('AI Local PII Masking', style: TextStyle(fontWeight: FontWeight.w600, fontSize: 13)),
            subtitle: const Text('Redacts account numbers and emails before sending queries to AI Copilot', style: TextStyle(fontSize: 11, color: Colors.grey)),
            value: _piiMaskingEnabled,
            activeColor: AppTheme.primary,
            onChanged: _setPiiMasking,
          ),
          const Divider(),
          SwitchListTile(
            contentPadding: EdgeInsets.zero,
            title: const Text('Anonymous Crash Diagnostics', style: TextStyle(fontWeight: FontWeight.w600, fontSize: 13)),
            subtitle: const Text('Send non-identifying telemetry to help improve app reliability', style: TextStyle(fontSize: 11, color: Colors.grey)),
            value: _analyticsEnabled,
            activeColor: AppTheme.primary,
            onChanged: _setAnalytics,
          ),
        ],
      ),
    );
  }

  Widget _buildDataPortabilitySection(AppState state, bool isDark) {
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: isDark ? AppTheme.bgSurfaceDark : AppTheme.bgSurfaceLight,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: isDark ? Colors.white12 : Colors.black12),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Text('Data Portability & Deletion', style: TextStyle(fontWeight: FontWeight.bold, fontSize: 14)),
          const SizedBox(height: 8),
          const Text(
            'Under data privacy regulations, you have full ownership of your financial records. You can download an offline archive at any time.',
            style: TextStyle(fontSize: 11, color: Colors.grey, height: 1.3),
          ),
          const SizedBox(height: 14),
          OutlinedButton.icon(
            style: OutlinedButton.styleFrom(
              minimumSize: const Size.fromHeight(44),
              shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
            ),
            icon: const Icon(Icons.download, size: 18),
            label: const Text('Export My Data (JSON / CSV)', style: TextStyle(fontWeight: FontWeight.bold, fontSize: 13)),
            onPressed: () => _exportUserData(state),
          ),
        ],
      ),
    );
  }
}
