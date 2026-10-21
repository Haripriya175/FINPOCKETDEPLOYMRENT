import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../providers/app_state.dart';
import '../theme/app_theme.dart';
import '../models/models.dart';
import 'vault_screen.dart';
import 'security_center_screen.dart';
import 'privacy_center_screen.dart';
import '../widgets/connect_bank_modal.dart';

class ProfileScreen extends StatelessWidget {
  final Function(int) onNavigate;

  const ProfileScreen({super.key, required this.onNavigate});

  void _showLanguageDialog(BuildContext context, AppState state) {
    showDialog(
      context: context,
      builder: (ctx) => AlertDialog(
        backgroundColor: const Color(0xFF0F172A),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
        title: Text(
          state.t('language'),
          style: const TextStyle(fontWeight: FontWeight.bold, color: Colors.white, fontSize: 16),
        ),
        content: SingleChildScrollView(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              _langTile(context, state, SupportedLanguage.en, 'English', 'English'),
              _langTile(context, state, SupportedLanguage.te, 'Telugu', 'తెలుగు'),
              _langTile(context, state, SupportedLanguage.hi, 'Hindi', 'हिन्दी'),
              _langTile(context, state, SupportedLanguage.ta, 'Tamil', 'தமிழ்'),
              _langTile(context, state, SupportedLanguage.kn, 'Kannada', 'ಕನ್ನಡ'),
              _langTile(context, state, SupportedLanguage.ml, 'Malayalam', 'മലയാളം'),
              _langTile(context, state, SupportedLanguage.mr, 'Marathi', 'मराठी'),
              _langTile(context, state, SupportedLanguage.bn, 'Bengali', 'বাংলা'),
            ],
          ),
        ),
      ),
    );
  }

  Widget _langTile(BuildContext context, AppState state, SupportedLanguage lang, String name, String native) {
    final isSelected = state.language == lang;
    return ListTile(
      title: Text(
        native,
        style: TextStyle(
          fontWeight: isSelected ? FontWeight.bold : FontWeight.normal,
          color: isSelected ? AppTheme.primaryLight : Colors.white,
        ),
      ),
      subtitle: Text(name, style: const TextStyle(fontSize: 11, color: Color(0xFF94A3B8))),
      trailing: isSelected ? const Icon(Icons.check_circle_rounded, color: AppTheme.primary) : null,
      onTap: () {
        state.setLanguage(lang);
        Navigator.pop(context);
        state.speakHomeNarration();
      },
    );
  }

  @override
  Widget build(BuildContext context) {
    final state = Provider.of<AppState>(context);
    final theme = Theme.of(context);
    final isDark = theme.brightness == Brightness.dark;

    final userInitial = (state.currentUser?.fullName.isNotEmpty == true)
        ? state.currentUser!.fullName.substring(0, 1).toUpperCase()
        : 'U';

    return Scaffold(
      appBar: AppBar(title: const Text('Profile')),
      body: SingleChildScrollView(
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
        child: Column(
          children: [
            // User Profile Card (Matches Web profile.html .profile-header)
            Container(
              padding: const EdgeInsets.all(20),
              decoration: BoxDecoration(
                color: isDark ? AppTheme.bgCardDark : AppTheme.bgCardLight,
                borderRadius: BorderRadius.circular(16),
                border: Border.all(
                  color: isDark ? AppTheme.borderDark : AppTheme.borderLight,
                ),
                boxShadow: [
                  BoxShadow(
                    color: Colors.black.withOpacity(isDark ? 0.2 : 0.04),
                    blurRadius: 10,
                    offset: const Offset(0, 2),
                  ),
                ],
              ),
              child: Row(
                children: [
                  Container(
                    width: 64,
                    height: 64,
                    decoration: const BoxDecoration(
                      gradient: AppTheme.gradientPrimary,
                      shape: BoxShape.circle,
                      boxShadow: [
                        BoxShadow(
                          color: Color(0x3314B8A6),
                          blurRadius: 12,
                          offset: Offset(0, 4),
                        ),
                      ],
                    ),
                    alignment: Alignment.center,
                    child: Text(
                      userInitial,
                      style: const TextStyle(
                        fontSize: 26,
                        fontWeight: FontWeight.w800,
                        color: Colors.white,
                      ),
                    ),
                  ),
                  const SizedBox(width: 16),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Row(
                          children: [
                            Flexible(
                              child: Text(
                                state.currentUser?.fullName ?? 'User',
                                style: TextStyle(
                                  fontWeight: FontWeight.w800,
                                  fontSize: 17,
                                  color: isDark ? AppTheme.textPrimaryDark : AppTheme.textPrimaryLight,
                                ),
                                overflow: TextOverflow.ellipsis,
                              ),
                            ),
                            const SizedBox(width: 8),
                            Container(
                              padding: const EdgeInsets.symmetric(horizontal: 7, vertical: 2),
                              decoration: BoxDecoration(
                                color: AppTheme.success.withOpacity(0.15),
                                borderRadius: BorderRadius.circular(6),
                              ),
                              child: const Text(
                                'MEMBER',
                                style: TextStyle(
                                  fontSize: 10,
                                  fontWeight: FontWeight.w800,
                                  color: AppTheme.success,
                                ),
                              ),
                            ),
                          ],
                        ),
                        const SizedBox(height: 3),
                        Text(
                          state.currentUser?.email ?? 'user@finpocket.com',
                          style: TextStyle(
                            fontSize: 12,
                            color: isDark ? AppTheme.textSecondaryDark : AppTheme.textSecondaryLight,
                          ),
                        ),
                        if (state.currentUser?.phone.isNotEmpty == true)
                          Padding(
                            padding: const EdgeInsets.only(top: 2),
                            child: Text(
                              state.currentUser!.phone,
                              style: TextStyle(
                                fontSize: 11,
                                color: isDark ? AppTheme.textMutedDark : AppTheme.textSecondaryLight,
                              ),
                            ),
                          ),
                      ],
                    ),
                  ),
                ],
              ),
            ),
            const SizedBox(height: 16),

            // Navigation Links
            Container(
              decoration: BoxDecoration(
                color: isDark ? AppTheme.bgCardDark : AppTheme.bgCardLight,
                borderRadius: BorderRadius.circular(14),
                border: Border.all(
                  color: isDark ? AppTheme.borderDark : AppTheme.borderLight,
                ),
              ),
              child: Column(
                children: [
                  ListTile(
                    leading: Container(
                      width: 34,
                      height: 34,
                      decoration: BoxDecoration(
                        color: const Color(0x1F14B8A6),
                        borderRadius: BorderRadius.circular(8),
                      ),
                      alignment: Alignment.center,
                      child: const Text('💳', style: TextStyle(fontSize: 16)),
                    ),
                    title: const Text('Bills & EMI Tracker', style: TextStyle(fontSize: 13, fontWeight: FontWeight.w600)),
                    trailing: const Icon(Icons.chevron_right, size: 18),
                    onTap: () => onNavigate(4),
                  ),
                  Divider(height: 1, color: isDark ? AppTheme.borderDark : AppTheme.borderLight),
                  ListTile(
                    leading: Container(
                      width: 34,
                      height: 34,
                      decoration: BoxDecoration(
                        color: const Color(0x1F0EA5E9),
                        borderRadius: BorderRadius.circular(8),
                      ),
                      alignment: Alignment.center,
                      child: const Text('🗄️', style: TextStyle(fontSize: 16)),
                    ),
                    title: const Text('Personal Document Vault', style: TextStyle(fontSize: 13, fontWeight: FontWeight.w600)),
                    trailing: const Icon(Icons.chevron_right, size: 18),
                    onTap: () {
                      Navigator.push(
                        context,
                        MaterialPageRoute(builder: (_) => const VaultScreen()),
                      );
                    },
                  ),
                  Divider(height: 1, color: isDark ? AppTheme.borderDark : AppTheme.borderLight),
                  ListTile(
                    leading: Container(
                      width: 34,
                      height: 34,
                      decoration: BoxDecoration(
                        color: const Color(0x1FEC4899),
                        borderRadius: BorderRadius.circular(8),
                      ),
                      alignment: Alignment.center,
                      child: const Text('🛡️', style: TextStyle(fontSize: 16)),
                    ),
                    title: const Text('Child Care Mode', style: TextStyle(fontSize: 13, fontWeight: FontWeight.w600)),
                    subtitle: Text(
                      state.isChildCareActive ? 'Enabled (Payments Blocked)' : 'Disabled',
                      style: TextStyle(
                        fontSize: 11,
                        color: state.isChildCareActive ? AppTheme.danger : (isDark ? AppTheme.textSecondaryDark : AppTheme.textSecondaryLight),
                      ),
                    ),
                    trailing: const Icon(Icons.chevron_right, size: 18),
                    onTap: () => onNavigate(6),
                  ),
                ],
              ),
            ),
            const SizedBox(height: 16),

            // Settings Section
            Container(
              decoration: BoxDecoration(
                color: isDark ? AppTheme.bgCardDark : AppTheme.bgCardLight,
                borderRadius: BorderRadius.circular(14),
                border: Border.all(
                  color: isDark ? AppTheme.borderDark : AppTheme.borderLight,
                ),
              ),
              child: Column(
                children: [
                  ListTile(
                    leading: Container(
                      width: 34,
                      height: 34,
                      decoration: BoxDecoration(
                        color: const Color(0x1F3B82F6),
                        borderRadius: BorderRadius.circular(8),
                      ),
                      alignment: Alignment.center,
                      child: const Text('🔒', style: TextStyle(fontSize: 16)),
                    ),
                    title: const Text('Security Center', style: TextStyle(fontSize: 13, fontWeight: FontWeight.w600)),
                    subtitle: Text('Google SSO link, biometrics, hardware enclave', style: TextStyle(fontSize: 11, color: isDark ? AppTheme.textSecondaryDark : AppTheme.textSecondaryLight)),
                    trailing: const Icon(Icons.chevron_right, size: 18),
                    onTap: () {
                      Navigator.push(
                        context,
                        MaterialPageRoute(builder: (_) => const SecurityCenterScreen()),
                      );
                    },
                  ),
                  Divider(height: 1, color: isDark ? AppTheme.borderDark : AppTheme.borderLight),
                  ListTile(
                    leading: Container(
                      width: 34,
                      height: 34,
                      decoration: BoxDecoration(
                        color: const Color(0x1F10B981),
                        borderRadius: BorderRadius.circular(8),
                      ),
                      alignment: Alignment.center,
                      child: const Text('🛡️', style: TextStyle(fontSize: 16)),
                    ),
                    title: const Text('Privacy & Data Center', style: TextStyle(fontSize: 13, fontWeight: FontWeight.w600)),
                    subtitle: Text('Zero data broker guarantee, AI masking, export', style: TextStyle(fontSize: 11, color: isDark ? AppTheme.textSecondaryDark : AppTheme.textSecondaryLight)),
                    trailing: const Icon(Icons.chevron_right, size: 18),
                    onTap: () {
                      Navigator.push(
                        context,
                        MaterialPageRoute(builder: (_) => const PrivacyCenterScreen()),
                      );
                    },
                  ),
                  Divider(height: 1, color: isDark ? AppTheme.borderDark : AppTheme.borderLight),
                  ListTile(
                    leading: Container(
                      width: 34,
                      height: 34,
                      decoration: BoxDecoration(
                        color: const Color(0x1F14B8A6),
                        borderRadius: BorderRadius.circular(8),
                      ),
                      alignment: Alignment.center,
                      child: const Text('🌐', style: TextStyle(fontSize: 16)),
                    ),
                    title: Text(state.t('language'), style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w600)),
                    trailing: const Icon(Icons.chevron_right, size: 18),
                    onTap: () => _showLanguageDialog(context, state),
                  ),
                  Divider(height: 1, color: isDark ? AppTheme.borderDark : AppTheme.borderLight),
                  SwitchListTile(
                    secondary: Container(
                      width: 34,
                      height: 34,
                      decoration: BoxDecoration(
                        color: const Color(0x1F8B5CF6),
                        borderRadius: BorderRadius.circular(8),
                      ),
                      alignment: Alignment.center,
                      child: const Text('🔊', style: TextStyle(fontSize: 16)),
                    ),
                    title: Text(state.t('voiceGuidance'), style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w600)),
                    subtitle: Text(
                      state.t('voiceGuidanceSubtitle'),
                      style: TextStyle(fontSize: 11, color: isDark ? AppTheme.textSecondaryDark : AppTheme.textSecondaryLight),
                    ),
                    activeColor: AppTheme.primary,
                    value: state.voiceGuidanceEnabled,
                    onChanged: (val) => state.toggleVoiceGuidance(),
                  ),
                  Divider(height: 1, color: isDark ? AppTheme.borderDark : AppTheme.borderLight),
                  ListTile(
                    leading: Container(
                      width: 34,
                      height: 34,
                      decoration: BoxDecoration(
                        color: const Color(0x1F0D9488),
                        borderRadius: BorderRadius.circular(8),
                      ),
                      alignment: Alignment.center,
                      child: const Text('🗣️', style: TextStyle(fontSize: 16)),
                    ),
                    title: Text(state.t('testVoice'), style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w600)),
                    trailing: Icon(
                      state.isSpeaking ? Icons.volume_up_rounded : Icons.play_arrow_rounded,
                      color: AppTheme.primary,
                      size: 20,
                    ),
                    onTap: () {
                      if (state.isSpeaking) {
                        state.stopSpeaking();
                      } else {
                        state.speakHomeNarration();
                      }
                    },
                  ),
                  Divider(height: 1, color: isDark ? AppTheme.borderDark : AppTheme.borderLight),
                  SwitchListTile(
                    secondary: Container(
                      width: 34,
                      height: 34,
                      decoration: BoxDecoration(
                        color: const Color(0x1FF59E0B),
                        borderRadius: BorderRadius.circular(8),
                      ),
                      alignment: Alignment.center,
                      child: Text(state.themeMode == ThemeMode.dark ? '🌙' : '☀️', style: const TextStyle(fontSize: 16)),
                    ),
                    title: Text(state.t('theme'), style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w600)),
                    activeColor: AppTheme.primary,
                    value: state.themeMode == ThemeMode.dark,
                    onChanged: (val) => state.toggleTheme(),
                  ),
                ],
              ),
            ),
            const SizedBox(height: 16),

            // Connect Bank Section
            Container(
              decoration: BoxDecoration(
                color: isDark ? AppTheme.bgCardDark : AppTheme.bgCardLight,
                borderRadius: BorderRadius.circular(16),
                border: Border.all(
                  color: isDark ? AppTheme.borderDark : AppTheme.borderLight,
                ),
              ),
              child: ListTile(
                leading: Container(
                  width: 34,
                  height: 34,
                  decoration: BoxDecoration(
                    color: const Color(0x1F10B981),
                    borderRadius: BorderRadius.circular(8),
                  ),
                  alignment: Alignment.center,
                  child: const Text('🏦', style: TextStyle(fontSize: 16)),
                ),
                title: const Text('Connect Bank Account', style: TextStyle(fontSize: 13, fontWeight: FontWeight.w600)),
                subtitle: Text(
                  'Link a real bank to import transactions and balances',
                  style: TextStyle(
                    fontSize: 11,
                    color: isDark ? AppTheme.textSecondaryDark : AppTheme.textSecondaryLight,
                  ),
                ),
                trailing: const Icon(Icons.chevron_right, size: 18),
                onTap: () => _showConnectBankModal(context, state),
              ),
            ),
            const SizedBox(height: 16),

            // Logout Section
            Container(
              decoration: BoxDecoration(
                color: isDark ? AppTheme.bgCardDark : AppTheme.bgCardLight,
                borderRadius: BorderRadius.circular(16),
                border: Border.all(
                  color: isDark ? AppTheme.borderDark : AppTheme.borderLight,
                ),
              ),
              child: ListTile(
                leading: Container(
                  width: 34,
                  height: 34,
                  decoration: BoxDecoration(
                    color: AppTheme.danger.withOpacity(0.12),
                    borderRadius: BorderRadius.circular(8),
                  ),
                  alignment: Alignment.center,
                  child: const Text('🚪', style: TextStyle(fontSize: 16)),
                ),
                title: const Text(
                  'Log Out',
                  style: TextStyle(color: AppTheme.danger, fontWeight: FontWeight.w700, fontSize: 13),
                ),
                subtitle: Text(
                  'Revoke device session and securely exit',
                  style: TextStyle(fontSize: 11, color: isDark ? AppTheme.textSecondaryDark : AppTheme.textSecondaryLight),
                ),
                trailing: const Icon(Icons.chevron_right, color: AppTheme.danger, size: 18),
                onTap: () => _showLogoutDialog(context, state),
              ),
            ),
            const SizedBox(height: 18),

            // Version info
            Text('FinPocket v2.0 • Data-Driven & Secure', style: TextStyle(color: isDark ? AppTheme.textMutedDark : AppTheme.textSecondaryLight, fontSize: 11)),
            const SizedBox(height: 4),
            Text(
              'Production Architecture • PostgreSQL 18',
              style: TextStyle(color: isDark ? const Color(0xFF475569) : const Color(0xFF94A3B8), fontSize: 10),
            ),
          ],
        ),
      ),
    );
  }

  /// Opens the Connect Bank flow: registered mobile number → AA consent
  /// (when the backend has an Account Aggregator enabled) or the on-device
  /// SMS importer as a credential-free fallback.
  void _showConnectBankModal(BuildContext context, AppState state) {
    Navigator.of(context).push(
      MaterialPageRoute<void>(
        builder: (_) => const ConnectBankModal(),
      ),
    );
  }

  void _showLogoutDialog(BuildContext context, AppState state) {
    showDialog(
      context: context,
      builder: (ctx) => AlertDialog(
        backgroundColor: const Color(0xFF0F172A),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
        title: const Text(
          'Log Out?',
          style: TextStyle(fontWeight: FontWeight.bold, color: Colors.white, fontSize: 16),
        ),
        content: const Text(
          'This will revoke your active session on the backend and clear all cached tokens.',
          style: TextStyle(color: Color(0xFF94A3B8), fontSize: 13),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx),
            child: const Text('Cancel', style: TextStyle(color: Colors.white70)),
          ),
          ElevatedButton(
            key: const Key('confirm_logout_button'),
            style: ElevatedButton.styleFrom(
              backgroundColor: AppTheme.danger,
              foregroundColor: Colors.white,
              shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(8)),
            ),
            onPressed: () async {
              Navigator.pop(ctx);
              if (state.isDemoMode) {
                state.exitDemoMode();
              } else {
                await state.logout();
              }
            },
            child: const Text('Log Out'),
          ),
        ],
      ),
    );
  }
}
