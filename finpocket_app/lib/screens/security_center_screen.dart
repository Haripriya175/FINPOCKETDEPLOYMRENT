import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../providers/app_state.dart';
import '../theme/app_theme.dart';
import '../core/storage/secure_token_storage.dart';
import '../services/security_auth_service.dart';

class SecurityCenterScreen extends StatefulWidget {
  const SecurityCenterScreen({super.key});

  @override
  State<SecurityCenterScreen> createState() => _SecurityCenterScreenState();
}

class _SecurityCenterScreenState extends State<SecurityCenterScreen> {
  bool _biometricEnabled = false;
  bool _isLoading = false;

  @override
  void initState() {
    super.initState();
    _loadPreferences();
    // Load the real device/session list from the backend. (This section used to
    // render a hardcoded "Current Mobile Device" row and a revoke button that
    // only showed a success message without doing anything.)
    WidgetsBinding.instance.addPostFrameCallback((_) {
      Provider.of<AppState>(context, listen: false).fetchSecurityData();
    });
  }

  Future<void> _loadPreferences() async {
    final bio = await SecureTokenStorage.getBiometricPreference();
    setState(() {
      _biometricEnabled = bio;
    });
  }

  Future<void> _toggleBiometrics(bool value) async {
    if (value) {
      final canAuth = await SecurityAuthService.isBiometricsAvailable();
      if (!canAuth && mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Biometric hardware not enrolled or available on this device.')),
        );
        return;
      }
      final authenticated = await SecurityAuthService.authenticateWithBiometrics(
        reason: 'Verify biometric enrollment for FinPocket',
      );
      if (!authenticated) return;
    }

    await SecureTokenStorage.saveBiometricPreference(value);
    setState(() {
      _biometricEnabled = value;
    });
  }

  Future<void> _handleGoogleLinkToggle(AppState state) async {
    setState(() {
      _isLoading = true;
    });

    try {
      if (state.currentUser?.isGoogleLinked == true) {
        // Unlink
        final success = await state.unlinkGoogleAccount();
        if (mounted) {
          ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(content: Text(success ? 'Google account unlinked successfully.' : 'Failed to unlink Google account.')),
          );
        }
      } else {
        // Link
        final success = await state.linkGoogleAccount();
        if (mounted) {
          ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(content: Text(success ? 'Google account linked successfully!' : (state.authError ?? 'Failed to link Google account.'))),
          );
        }
      }
    } finally {
      if (mounted) {
        setState(() {
          _isLoading = false;
        });
      }
    }
  }

  Future<void> _handleMetaLinkToggle(AppState state) async {
    setState(() {
      _isLoading = true;
    });

    try {
      if (state.currentUser?.isMetaLinked == true) {
        // Unlink
        final success = await state.unlinkMetaAccount();
        if (mounted) {
          ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(content: Text(success ? 'Meta (Facebook) account unlinked successfully.' : 'Failed to unlink Meta account.')),
          );
        }
      } else {
        // Link
        final success = await state.linkMetaAccount();
        if (mounted) {
          ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(content: Text(success ? 'Meta (Facebook) account linked successfully!' : (state.authError ?? 'Failed to link Meta account.'))),
          );
        }
      }
    } finally {
      if (mounted) {
        setState(() {
          _isLoading = false;
        });
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final state = Provider.of<AppState>(context);
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final isGoogleLinked = state.currentUser?.isGoogleLinked ?? false;
    final isMetaLinked = state.currentUser?.isMetaLinked ?? false;

    return Scaffold(
      backgroundColor: isDark ? AppTheme.bgDark : AppTheme.bgLight,
      appBar: AppBar(
        title: const Text('Security Center', style: TextStyle(fontWeight: FontWeight.bold, fontSize: 18)),
        centerTitle: false,
      ),
      body: SingleChildScrollView(
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            _buildEnclaveCard(isDark),
            const SizedBox(height: 16),
            _buildIdentitySection(state, isGoogleLinked, isMetaLinked, isDark),
            const SizedBox(height: 16),
            _buildBiometricSection(isDark),
            const SizedBox(height: 16),
            _buildSessionManagementSection(state, isDark),
            const SizedBox(height: 24),
          ],
        ),
      ),
    );
  }

  Widget _buildEnclaveCard(bool isDark) {
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: isDark ? AppTheme.bgSurfaceDark : AppTheme.bgSurfaceLight,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: AppTheme.success.withOpacity(0.3)),
      ),
      child: Row(
        children: [
          Container(
            padding: const EdgeInsets.all(10),
            decoration: BoxDecoration(
              color: AppTheme.success.withOpacity(0.12),
              shape: BoxShape.circle,
            ),
            child: const Icon(Icons.lock_clock_outlined, color: AppTheme.success, size: 24),
          ),
          const SizedBox(width: 14),
          const Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text('Hardware Enclave Active', style: TextStyle(fontWeight: FontWeight.bold, fontSize: 14)),
                SizedBox(height: 2),
                Text(
                  'Tokens protected via Android Keystore / iOS Keychain. Tokens never stored in plaintext.',
                  style: TextStyle(fontSize: 11, color: Colors.grey, height: 1.3),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildIdentitySection(AppState state, bool isGoogleLinked, bool isMetaLinked, bool isDark) {
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
          const Text('Federated Identity Providers', style: TextStyle(fontWeight: FontWeight.bold, fontSize: 15)),
          const SizedBox(height: 12),
          // Google Account
          Row(
            children: [
              Container(
                width: 38,
                height: 38,
                decoration: BoxDecoration(
                  color: Colors.white,
                  borderRadius: BorderRadius.circular(8),
                  border: Border.all(color: Colors.grey.withOpacity(0.3)),
                ),
                child: const Center(
                  child: Text('G', style: TextStyle(fontWeight: FontWeight.bold, fontSize: 20, color: Colors.red)),
                ),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    const Text('Google Account', style: TextStyle(fontWeight: FontWeight.bold, fontSize: 13)),
                    Text(
                      isGoogleLinked ? 'Linked & cryptographically verified' : 'Not linked',
                      style: TextStyle(fontSize: 11, color: isGoogleLinked ? AppTheme.success : Colors.grey),
                    ),
                  ],
                ),
              ),
              ElevatedButton(
                style: ElevatedButton.styleFrom(
                  backgroundColor: isGoogleLinked ? AppTheme.danger.withOpacity(0.12) : AppTheme.primary,
                  foregroundColor: isGoogleLinked ? AppTheme.danger : Colors.white,
                  elevation: 0,
                  padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
                  shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(8)),
                ),
                onPressed: _isLoading ? null : () => _handleGoogleLinkToggle(state),
                child: _isLoading
                    ? const SizedBox(width: 14, height: 14, child: CircularProgressIndicator(strokeWidth: 2))
                    : Text(isGoogleLinked ? 'Unlink' : 'Link', style: const TextStyle(fontSize: 12, fontWeight: FontWeight.bold)),
              ),
            ],
          ),
          const SizedBox(height: 14),
          Divider(color: isDark ? Colors.white10 : Colors.black12, height: 1),
          const SizedBox(height: 14),
          // Meta (Facebook) Account
          Row(
            children: [
              Container(
                width: 38,
                height: 38,
                decoration: BoxDecoration(
                  color: const Color(0xFF1877F2),
                  borderRadius: BorderRadius.circular(8),
                ),
                child: const Center(
                  child: Icon(Icons.facebook, color: Colors.white, size: 24),
                ),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    const Text('Meta (Facebook) Account', style: TextStyle(fontWeight: FontWeight.bold, fontSize: 13)),
                    Text(
                      isMetaLinked ? 'Linked & verified (App: 1952085422418539)' : 'Not linked (App ID: 1952085422418539)',
                      style: TextStyle(fontSize: 11, color: isMetaLinked ? AppTheme.success : Colors.grey),
                    ),
                  ],
                ),
              ),
              ElevatedButton(
                style: ElevatedButton.styleFrom(
                  backgroundColor: isMetaLinked ? AppTheme.danger.withOpacity(0.12) : const Color(0xFF1877F2),
                  foregroundColor: isMetaLinked ? AppTheme.danger : Colors.white,
                  elevation: 0,
                  padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
                  shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(8)),
                ),
                onPressed: _isLoading ? null : () => _handleMetaLinkToggle(state),
                child: _isLoading
                    ? const SizedBox(width: 14, height: 14, child: CircularProgressIndicator(strokeWidth: 2))
                    : Text(isMetaLinked ? 'Unlink' : 'Link', style: const TextStyle(fontSize: 12, fontWeight: FontWeight.bold)),
              ),
            ],
          ),
        ],
      ),
    );
  }

  Widget _buildBiometricSection(bool isDark) {
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: isDark ? AppTheme.bgSurfaceDark : AppTheme.bgSurfaceLight,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: isDark ? Colors.white12 : Colors.black12),
      ),
      child: Row(
        children: [
          const Icon(Icons.fingerprint, color: AppTheme.primary, size: 24),
          const SizedBox(width: 12),
          const Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text('Biometric Authentication', style: TextStyle(fontWeight: FontWeight.bold, fontSize: 14)),
                SizedBox(height: 2),
                Text('Unlock FinPocket with Fingerprint or Face ID', style: TextStyle(fontSize: 11, color: Colors.grey)),
              ],
            ),
          ),
          const SizedBox(width: 8),
          Switch(
            value: _biometricEnabled,
            activeColor: AppTheme.primary,
            onChanged: _toggleBiometrics,
          ),
        ],
      ),
    );
  }

  Widget _buildSessionManagementSection(AppState state, bool isDark) {
    final devices = state.devices;
    final muted = isDark ? Colors.grey : Colors.grey.shade600;

    // Build the row for the current device plus every other active session the
    // backend reported. (This used to be a single hardcoded "Current Mobile
    // Device" row with no real session data behind it.)
    final otherDevices = devices.where((d) => d['is_current'] != true && d['isCurrent'] != true).toList();

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
          const Text('Active Device Sessions', style: TextStyle(fontWeight: FontWeight.bold, fontSize: 14)),
          const SizedBox(height: 10),
          Row(
            children: [
              const Icon(Icons.smartphone, size: 20, color: Colors.grey),
              const SizedBox(width: 10),
              const Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text('This Device', style: TextStyle(fontWeight: FontWeight.bold, fontSize: 12)),
                    Text('Last active: Just now • Session active', style: TextStyle(fontSize: 10, color: Colors.grey)),
                  ],
                ),
              ),
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                decoration: BoxDecoration(
                  color: AppTheme.success.withOpacity(0.12),
                  borderRadius: BorderRadius.circular(10),
                ),
                child: const Text('THIS DEVICE', style: TextStyle(color: AppTheme.success, fontSize: 10, fontWeight: FontWeight.bold)),
              ),
            ],
          ),

          // Other sessions — real data, or an honest empty state.
          if (devices.isEmpty)
            Padding(
              padding: const EdgeInsets.only(top: 12),
              child: Text(
                'No other active sessions found. New sign-ins will appear here.',
                style: TextStyle(fontSize: 11, color: muted, height: 1.3),
              ),
            )
          else
            ...otherDevices.map(
              (d) => Padding(
                padding: const EdgeInsets.only(top: 12),
                child: Row(
                  children: [
                    Icon(Icons.devices, size: 20, color: muted),
                    const SizedBox(width: 10),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            d['device_name']?.toString() ?? d['name']?.toString() ?? 'Unknown device',
                            style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 12),
                          ),
                          Text(
                            'Last active: ${d['last_active']?.toString() ?? d['lastActive']?.toString() ?? 'Recently'}',
                            style: TextStyle(fontSize: 10, color: muted),
                          ),
                        ],
                      ),
                    ),
                    TextButton(
                      onPressed: () => _revokeOneDevice(state, d['id']?.toString()),
                      child: const Text('Revoke', style: TextStyle(color: AppTheme.danger, fontSize: 12, fontWeight: FontWeight.bold)),
                    ),
                  ],
                ),
              ),
            ),

          const SizedBox(height: 16),
          OutlinedButton.icon(
            style: OutlinedButton.styleFrom(
              foregroundColor: AppTheme.danger,
              side: const BorderSide(color: AppTheme.danger),
              shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
              padding: const EdgeInsets.symmetric(vertical: 10),
            ),
            icon: const Icon(Icons.logout, size: 16),
            label: Text(
              otherDevices.isEmpty ? 'No Other Sessions to Revoke' : 'Revoke All Other Device Sessions (${otherDevices.length})',
              style: const TextStyle(fontSize: 12, fontWeight: FontWeight.bold),
            ),
            onPressed: otherDevices.isEmpty
                ? null
                : () => _revokeAllOtherDevices(state, otherDevices),
          ),
        ],
      ),
    );
  }

  Future<void> _revokeOneDevice(AppState state, String? deviceId) async {
    if (deviceId == null || deviceId.isEmpty) return;
    final messenger = ScaffoldMessenger.of(context);
    await state.revokeDevice(deviceId);
    messenger.showSnackBar(
      const SnackBar(backgroundColor: Color(0xFF10B981), content: Text('Session revoked.')),
    );
  }

  Future<void> _revokeAllOtherDevices(AppState state, List<dynamic> otherDevices) async {
    final messenger = ScaffoldMessenger.of(context);
    int revoked = 0;
    for (final d in otherDevices) {
      final id = d['id']?.toString();
      if (id != null && id.isNotEmpty) {
        await state.revokeDevice(id);
        revoked++;
      }
    }
    messenger.showSnackBar(
      SnackBar(
        backgroundColor: const Color(0xFF10B981),
        content: Text('Revoked $revoked other device session${revoked == 1 ? '' : 's'}.'),
      ),
    );
  }
}
