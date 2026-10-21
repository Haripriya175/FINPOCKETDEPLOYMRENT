import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../providers/app_state.dart';
import '../models/models.dart';
import '../theme/app_theme.dart';
import 'analytics_screen.dart';
import 'financial_planning_screen.dart';
import 'notifications_screen.dart';
import '../features/financial_twin/what_if_lab_screen.dart';
import '../features/financial_health/health_score_screen.dart';
import '../features/financial_health/health_score_engine.dart';
import '../features/spend_guard/spend_guard_sheet.dart';
import '../widgets/qr_scanner_modal.dart';
import '../widgets/smart_bill_split_modal.dart';
import '../widgets/emi_manager_modal.dart';
import '../widgets/credit_card_trap_modal.dart';
import '../widgets/gamification_streak_modal.dart';
import '../services/tts_service.dart';
import '../core/transaction_display.dart';

class HomeScreen extends StatefulWidget {
  final Function(int, [String?, String?]) onTabChange;
  final VoidCallback onOpenSend;

  const HomeScreen({
    super.key,
    required this.onTabChange,
    required this.onOpenSend,
  });

  @override
  State<HomeScreen> createState() => _HomeScreenState();
}

class _HomeScreenState extends State<HomeScreen> {
  bool _hideBalance = false;

  void _showSafeToSpendCalculation(
    BuildContext context,
    SafeToSpendData data,
    CommittedMoneyData commitments,
  ) {
    final isDark = Theme.of(context).brightness == Brightness.dark;

    showModalBottomSheet(
      context: context,
      backgroundColor: isDark ? AppTheme.bgSurfaceDark : AppTheme.bgSurfaceLight,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(24)),
      ),
      builder: (ctx) => Padding(
        padding: const EdgeInsets.all(24),
        child: SingleChildScrollView(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            mainAxisSize: MainAxisSize.min,
            children: [
              Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  Expanded(
                    child: Row(
                      children: [
                        Container(
                          width: 32,
                          height: 32,
                          decoration: BoxDecoration(
                            color: AppTheme.primary.withOpacity(0.15),
                            borderRadius: BorderRadius.circular(8),
                          ),
                          child: const Icon(
                            Icons.calculate_outlined,
                            color: AppTheme.primary,
                            size: 18,
                          ),
                        ),
                        const SizedBox(width: 10),
                        Flexible(
                          child: Text(
                            'Safe to Spend Breakdown',
                            style: TextStyle(
                              fontSize: 17,
                              fontWeight: FontWeight.w700,
                              color: isDark ? AppTheme.textPrimaryDark : AppTheme.textPrimaryLight,
                            ),
                            overflow: TextOverflow.ellipsis,
                          ),
                        ),
                      ],
                    ),
                  ),
                  IconButton(
                    icon: Icon(
                      Icons.close,
                      color: isDark ? AppTheme.textSecondaryDark : AppTheme.textSecondaryLight,
                    ),
                    onPressed: () => Navigator.pop(ctx),
                  ),
                ],
              ),
              const SizedBox(height: 8),
              Text(
                'Authoritative daily spend allocation calculated directly from your total balance divided over the remaining days of this month, helping you maintain financial discipline every single day.',
                style: TextStyle(
                  fontSize: 12,
                  color: isDark ? AppTheme.textSecondaryDark : AppTheme.textSecondaryLight,
                  height: 1.4,
                ),
              ),
              const SizedBox(height: 16),

              // Highlight Box: Safe to Spend for Today
              Container(
                padding: const EdgeInsets.all(16),
                decoration: BoxDecoration(
                  gradient: AppTheme.gradientPrimary,
                  borderRadius: BorderRadius.circular(16),
                  boxShadow: const [
                    BoxShadow(
                      color: Color(0x3314B8A6),
                      blurRadius: 12,
                      offset: Offset(0, 4),
                    ),
                  ],
                ),
                child: Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [
                    Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        const Text(
                          'SAFE TO SPEND FOR TODAY',
                          style: TextStyle(
                            fontSize: 11,
                            fontWeight: FontWeight.w700,
                            color: Colors.white70,
                            letterSpacing: 0.5,
                          ),
                        ),
                        const SizedBox(height: 4),
                        Text(
                          '₹${data.safeToSpendToday.toStringAsFixed(2)}',
                          style: const TextStyle(
                            fontSize: 26,
                            fontWeight: FontWeight.w900,
                            color: Colors.white,
                          ),
                        ),
                      ],
                    ),
                    Container(
                      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
                      decoration: BoxDecoration(
                        color: Colors.black.withOpacity(0.2),
                        borderRadius: BorderRadius.circular(10),
                      ),
                      child: Text(
                        '${data.remainingDaysInMonth} days left',
                        style: const TextStyle(
                          fontSize: 12,
                          color: Colors.white,
                          fontWeight: FontWeight.w600,
                        ),
                      ),
                    ),
                  ],
                ),
              ),
              const SizedBox(height: 20),

              _calcRow(
                'Total Available Balance',
                '₹${data.totalBalance.toStringAsFixed(0)}',
                isPositive: true,
                isDark: isDark,
              ),
              _calcRow(
                'Remaining Days This Month',
                '${data.remainingDaysInMonth} days',
                isPositive: true,
                isDark: isDark,
              ),
              _calcRow(
                'Daily Allocation Formula',
                '₹${data.totalBalance.toStringAsFixed(0)} ÷ ${data.remainingDaysInMonth} days',
                isPositive: true,
                isDark: isDark,
              ),

              Divider(
                color: isDark ? AppTheme.borderDark : AppTheme.borderLight,
                height: 24,
              ),

              const Text(
                'Monthly Commitments Overview',
                style: TextStyle(fontSize: 13, fontWeight: FontWeight.bold),
              ),
              const SizedBox(height: 10),

              _calcRow(
                'Upcoming Mandatory Bills',
                '- ₹${data.upcomingMandatoryBills.toStringAsFixed(0)}',
                isPositive: false,
                isDark: isDark,
              ),
              _calcRow(
                'Active EMI Obligations',
                '- ₹${data.activeEmiObligations.toStringAsFixed(0)}',
                isPositive: false,
                isDark: isDark,
              ),
              _calcRow(
                'Committed Savings Goals',
                '- ₹${data.committedSavings.toStringAsFixed(0)}',
                isPositive: false,
                isDark: isDark,
              ),
              _calcRow(
                'Emergency Reserve Allocation',
                '- ₹${data.emergencyReserveAllocation.toStringAsFixed(0)}',
                isPositive: false,
                isDark: isDark,
              ),

              Divider(
                color: isDark ? AppTheme.borderDark : AppTheme.borderLight,
                height: 24,
              ),
              Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  Text(
                    'Month Discretionary Buffer',
                    style: TextStyle(
                      fontSize: 14,
                      fontWeight: FontWeight.w600,
                      color: isDark ? AppTheme.textPrimaryDark : AppTheme.textPrimaryLight,
                    ),
                  ),
                  Text(
                    '₹${data.safeToSpend.toStringAsFixed(0)}',
                    style: TextStyle(
                      fontSize: 16,
                      fontWeight: FontWeight.bold,
                      color: isDark ? AppTheme.textPrimaryDark : AppTheme.textPrimaryLight,
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 14),
              Container(
                padding: const EdgeInsets.all(12),
                decoration: BoxDecoration(
                  color: isDark ? const Color(0x0DFFFFFF) : const Color(0x080F172A),
                  borderRadius: BorderRadius.circular(12),
                  border: Border.all(
                    color: isDark ? AppTheme.borderDark : AppTheme.borderLight,
                  ),
                ),
                child: Row(
                  children: [
                    const Icon(Icons.info_outline, color: AppTheme.primary, size: 16),
                    const SizedBox(width: 8),
                    Expanded(
                      child: Text(
                        'Based strictly on your total balance of ₹${data.totalBalance.toStringAsFixed(0)}, you can spend ₹${data.safeToSpendToday.toStringAsFixed(2)} today without exceeding your balance before month end.',
                        style: TextStyle(
                          fontSize: 11,
                          color: isDark ? AppTheme.textSecondaryDark : AppTheme.textSecondaryLight,
                          height: 1.3,
                        ),
                      ),
                    ),
                  ],
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _calcRow(String label, String value, {required bool isPositive, required bool isDark}) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 6),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          Text(
            label,
            style: TextStyle(
              fontSize: 13,
              color: isDark ? const Color(0xFFCBD5E1) : const Color(0xFF334155),
            ),
          ),
          Text(
            value,
            style: TextStyle(
              fontSize: 13,
              fontWeight: FontWeight.w600,
              color: isPositive ? AppTheme.success : AppTheme.danger,
            ),
          ),
        ],
      ),
    );
  }

  void _showAudioTourSheet(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;

    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      backgroundColor: isDark ? AppTheme.bgSurfaceDark : AppTheme.bgSurfaceLight,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(24)),
      ),
      builder: (ctx) {
        return StatefulBuilder(
          builder: (ctx, setSheetState) {
            final activeState = Provider.of<AppState>(ctx);
            final currentPersona = activeState.ttsVoicePersona;

            return SafeArea(
              child: Padding(
                padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 20),
                child: SingleChildScrollView(
                  child: Column(
                    mainAxisSize: MainAxisSize.min,
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      // Header
                      Row(
                        children: [
                          Container(
                            width: 38,
                            height: 38,
                            decoration: BoxDecoration(
                              gradient: const LinearGradient(
                                colors: [AppTheme.primary, Color(0xFF8B5CF6)],
                              ),
                              borderRadius: BorderRadius.circular(10),
                            ),
                            child: const Icon(Icons.record_voice_over_rounded, color: Colors.white, size: 20),
                          ),
                          const SizedBox(width: 12),
                          Expanded(
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Text(
                                  'FinPocket Voice Tour',
                                  style: TextStyle(
                                    fontSize: 18,
                                    fontWeight: FontWeight.bold,
                                    color: isDark ? AppTheme.textPrimaryDark : AppTheme.textPrimaryLight,
                                  ),
                                ),
                                Text(
                                  'Features, Balance & Daily Spend Guide',
                                  style: TextStyle(
                                    fontSize: 12,
                                    color: isDark ? AppTheme.textSecondaryDark : AppTheme.textSecondaryLight,
                                  ),
                                ),
                              ],
                            ),
                          ),
                          IconButton(
                            icon: const Icon(Icons.close_rounded, size: 20),
                            onPressed: () => Navigator.pop(ctx),
                          ),
                        ],
                      ),
                      const SizedBox(height: 16),

                      // Balance & Safe Spend Info Card
                      Container(
                        padding: const EdgeInsets.all(14),
                        decoration: BoxDecoration(
                          color: isDark ? const Color(0xFF1E293B) : const Color(0xFFF1F5F9),
                          borderRadius: BorderRadius.circular(14),
                          border: Border.all(
                            color: isDark ? const Color(0xFF334155) : const Color(0xFFE2E8F0),
                          ),
                        ),
                        child: Row(
                          children: [
                            Expanded(
                              child: Column(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: [
                                  Text(
                                    'TOTAL BALANCE',
                                    style: TextStyle(
                                      fontSize: 10,
                                      fontWeight: FontWeight.w700,
                                      letterSpacing: 0.5,
                                      color: isDark ? Colors.white60 : Colors.black54,
                                    ),
                                  ),
                                  const SizedBox(height: 2),
                                  Text(
                                    '₹${activeState.totalAvailableBalance.toStringAsFixed(0)}',
                                    style: const TextStyle(
                                      fontSize: 16,
                                      fontWeight: FontWeight.w800,
                                      color: Color(0xFF10B981),
                                    ),
                                  ),
                                ],
                              ),
                            ),
                            Container(width: 1, height: 32, color: Colors.grey.withOpacity(0.3)),
                            const SizedBox(width: 14),
                            Expanded(
                              child: Column(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: [
                                  Text(
                                    'SAFE TO SPEND TODAY',
                                    style: TextStyle(
                                      fontSize: 10,
                                      fontWeight: FontWeight.w700,
                                      letterSpacing: 0.5,
                                      color: isDark ? Colors.white60 : Colors.black54,
                                    ),
                                  ),
                                  const SizedBox(height: 2),
                                  Text(
                                    '₹${activeState.safeToSpend.safeToSpendToday.toStringAsFixed(0)}',
                                    style: const TextStyle(
                                      fontSize: 16,
                                      fontWeight: FontWeight.w800,
                                      color: AppTheme.primary,
                                    ),
                                  ),
                                ],
                              ),
                            ),
                          ],
                        ),
                      ),
                      const SizedBox(height: 18),

                      // Select Voice Persona
                      Text(
                        'Choose Voice Persona',
                        style: TextStyle(
                          fontSize: 14,
                          fontWeight: FontWeight.w700,
                          color: isDark ? AppTheme.textPrimaryDark : AppTheme.textPrimaryLight,
                        ),
                      ),
                      const SizedBox(height: 10),
                      Wrap(
                        spacing: 8,
                        runSpacing: 8,
                        children: [
                          _buildPersonaChip(
                            label: '🎙️ Native Speaker (సహజ ప్రాంతీయ గొంతు)',
                            persona: TtsVoicePersona.nativeRegional,
                            current: currentPersona,
                            isDark: isDark,
                            onTap: () async {
                              await activeState.setTtsVoicePersona(TtsVoicePersona.nativeRegional);
                              setSheetState(() {});
                            },
                          ),
                          _buildPersonaChip(
                            label: '💼 Financial Advisor (ప్రొఫెషనల్ అడ్వైజర్)',
                            persona: TtsVoicePersona.financialAdvisor,
                            current: currentPersona,
                            isDark: isDark,
                            onTap: () async {
                              await activeState.setTtsVoicePersona(TtsVoicePersona.financialAdvisor);
                              setSheetState(() {});
                            },
                          ),
                          _buildPersonaChip(
                            label: '🤝 Friendly Guide (స్నేహపూర్వక గైడ్)',
                            persona: TtsVoicePersona.friendlyGuide,
                            current: currentPersona,
                            isDark: isDark,
                            onTap: () async {
                              await activeState.setTtsVoicePersona(TtsVoicePersona.friendlyGuide);
                              setSheetState(() {});
                            },
                          ),
                          _buildPersonaChip(
                            label: '📢 Clear Soundbox (స్పష్టమైన సౌండ్‌బాక్స్)',
                            persona: TtsVoicePersona.soundboxVoice,
                            current: currentPersona,
                            isDark: isDark,
                            onTap: () async {
                              await activeState.setTtsVoicePersona(TtsVoicePersona.soundboxVoice);
                              setSheetState(() {});
                            },
                          ),
                        ],
                      ),
                      const SizedBox(height: 18),

                      // 📢 On-Device UPI Pocket Soundbox Toggle
                      Container(
                        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
                        decoration: BoxDecoration(
                          color: isDark ? const Color(0xFF1E293B) : const Color(0xFFF1F5F9),
                          borderRadius: BorderRadius.circular(14),
                          border: Border.all(
                            color: isDark ? const Color(0xFF334155) : const Color(0xFFE2E8F0),
                          ),
                        ),
                        child: Row(
                          children: [
                            Container(
                              padding: const EdgeInsets.all(8),
                              decoration: BoxDecoration(
                                color: const Color(0xFF10B981).withOpacity(0.15),
                                shape: BoxShape.circle,
                              ),
                              child: const Icon(Icons.campaign_rounded, color: Color(0xFF10B981), size: 20),
                            ),
                            const SizedBox(width: 12),
                            Expanded(
                              child: Column(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: [
                                  const Text(
                                    '📢 UPI Pocket Soundbox',
                                    style: TextStyle(fontSize: 13, fontWeight: FontWeight.bold),
                                  ),
                                  Text(
                                    activeState.isSoundboxEnabled
                                        ? 'Active: Announces debits & credits aloud'
                                        : 'Disabled: Silent transactions',
                                    style: TextStyle(
                                      fontSize: 11,
                                      color: isDark ? Colors.white60 : Colors.black54,
                                    ),
                                  ),
                                ],
                              ),
                            ),
                            Switch.adaptive(
                              value: activeState.isSoundboxEnabled,
                              activeColor: const Color(0xFF10B981),
                              onChanged: (val) async {
                                await activeState.toggleSoundbox();
                                setSheetState(() {});
                                if (activeState.isSoundboxEnabled) {
                                  // Honest confirmation — never a fabricated transaction.
                                  await activeState.announceSoundboxActivated();
                                }
                              },
                            ),
                          ],
                        ),
                      ),
                      const SizedBox(height: 18),

                      // Audio Action Controls (Original Position)
                      if (activeState.isSpeaking) ...[
                        SizedBox(
                          width: double.infinity,
                          child: ElevatedButton.icon(
                            style: ElevatedButton.styleFrom(
                              backgroundColor: const Color(0xFFEF4444),
                              foregroundColor: Colors.white,
                              padding: const EdgeInsets.symmetric(vertical: 14),
                              shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                            ),
                            icon: const Icon(Icons.stop_rounded),
                            label: Text('Stop Audio (${activeState.currentSpeakingTopic ?? "Speaking"})', style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 15)),
                            onPressed: () async {
                              await activeState.stopSpeaking();
                              setSheetState(() {});
                            },
                          ),
                        ),
                      ] else ...[
                        SizedBox(
                          width: double.infinity,
                          child: ElevatedButton.icon(
                            style: ElevatedButton.styleFrom(
                              backgroundColor: AppTheme.primary,
                              foregroundColor: Colors.white,
                              padding: const EdgeInsets.symmetric(vertical: 14),
                              shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                            ),
                            icon: const Icon(Icons.play_circle_filled_rounded),
                            label: const Text('Play Full Audio Walkthrough', style: TextStyle(fontWeight: FontWeight.bold, fontSize: 15)),
                            onPressed: () {
                              Navigator.pop(ctx);
                              activeState.speakFeaturesExplanation();
                            },
                          ),
                        ),
                        const SizedBox(height: 10),
                        SizedBox(
                          width: double.infinity,
                          child: OutlinedButton.icon(
                            style: OutlinedButton.styleFrom(
                              padding: const EdgeInsets.symmetric(vertical: 12),
                              shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                              side: BorderSide(color: AppTheme.primary.withOpacity(0.5)),
                            ),
                            icon: const Icon(Icons.volume_up_rounded, size: 18, color: AppTheme.primary),
                            label: const Text('Quick Balance Briefing Only', style: TextStyle(fontWeight: FontWeight.w600, fontSize: 14, color: AppTheme.primary)),
                            onPressed: () {
                              Navigator.pop(ctx);
                              activeState.speakHomeNarration();
                            },
                          ),
                        ),
                      ],
                      const SizedBox(height: 20),

                      // ==========================================
                      // INDIVIDUAL FEATURE VOICE GUIDES
                      // ==========================================
                      Row(
                        mainAxisAlignment: MainAxisAlignment.spaceBetween,
                        children: [
                          Text(
                            'Hear About Any Specific Feature',
                            style: TextStyle(
                              fontSize: 14,
                              fontWeight: FontWeight.w700,
                              color: isDark ? AppTheme.textPrimaryDark : AppTheme.textPrimaryLight,
                            ),
                          ),
                          Text(
                            'Tap 🔊 to listen',
                            style: TextStyle(
                              fontSize: 11,
                              color: isDark ? Colors.white60 : Colors.black54,
                            ),
                          ),
                        ],
                      ),
                      const SizedBox(height: 10),
                      ..._buildFeatureVoiceList(context, activeState, isDark, setSheetState),
                      const SizedBox(height: 10),
                    ],
                  ),
                ),
              ),
            );
          },
        );
      },
    );
  }

  List<Widget> _buildFeatureVoiceList(
    BuildContext context,
    AppState activeState,
    bool isDark,
    StateSetter setSheetState,
  ) {
    final features = [
      {
        'key': 'safe_to_spend',
        'icon': '🎯',
        'title': 'Safe-to-Spend & Daily Limit',
        'desc': 'Today’s safe spending limit without touching bills or savings',
        'color': const Color(0xFF3B82F6),
      },
      {
        'key': 'spend_guard',
        'icon': '🛡️',
        'title': 'Spend Guard (Impulse Shield)',
        'desc': '60-second reflection pause on large unbudgeted UPI spends',
        'color': const Color(0xFF10B981),
      },
      {
        'key': 'round_up',
        'icon': '🪙',
        'title': 'Autonomous Round-Up Vault',
        'desc': 'Auto-sweeps spare change from UPI into micro-savings',
        'color': const Color(0xFFF59E0B),
      },
      {
        'key': 'subscriptions',
        'icon': '📡',
        'title': 'Ghost Subscription Radar',
        'desc': '3-day advance notice before OTT & auto-debits renewal',
        'color': const Color(0xFF8B5CF6),
      },
      {
        'key': 'bill_splitter',
        'icon': '🍽️',
        'title': 'Smart Bill Splitter',
        'desc': 'Divides dining & group bills and creates WhatsApp UPI links',
        'color': const Color(0xFFEC4899),
      },
      {
        'key': 'what_if_lab',
        'icon': '🔬',
        'title': 'What-If Lab (Financial Twin)',
        'desc': 'Simulates salary changes, EMIs & inflation 12 months ahead',
        'color': const Color(0xFF06B6D4),
      },
      {
        'key': 'emergency_fund',
        'icon': '🛡️',
        'title': 'Emergency Shield',
        'desc': '3-6 months buffer to stay financially resilient without debt',
        'color': const Color(0xFF14B8A6),
      },
      {
        'key': 'document_vault',
        'icon': '🗄️',
        'title': 'Personal Document Vault',
        'desc': 'Hardware-encrypted storage for Aadhaar, PAN, Salary Slips & ITC',
        'color': const Color(0xFF6366F1),
      },
      {
        'key': 'stealth_mode',
        'icon': '👁️',
        'title': 'Stealth Privacy Mode',
        'desc': '1-tap balance masking in public transport and crowded places',
        'color': const Color(0xFF64748B),
      },
      {
        'key': 'soundbox',
        'icon': '📢',
        'title': 'UPI Pocket Soundbox',
        'desc': 'Zero-delay voice confirmation for sent & received UPI payments',
        'color': const Color(0xFF10B981),
      },
    ];

    return features.map((f) {
      final key = f['key'] as String;
      final isPlayingThis = activeState.isSpeaking && activeState.currentSpeakingTopic == key;
      final tint = f['color'] as Color;

      return Container(
        margin: const EdgeInsets.only(bottom: 8),
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
        decoration: BoxDecoration(
          color: isPlayingThis
              ? tint.withOpacity(0.14)
              : (isDark ? const Color(0xFF1E293B) : const Color(0xFFF8FAFC)),
          borderRadius: BorderRadius.circular(12),
          border: Border.all(
            color: isPlayingThis
                ? tint
                : (isDark ? const Color(0xFF334155) : const Color(0xFFE2E8F0)),
            width: isPlayingThis ? 1.6 : 1.0,
          ),
        ),
        child: Row(
          children: [
            Container(
              width: 36,
              height: 36,
              decoration: BoxDecoration(
                color: tint.withOpacity(0.15),
                borderRadius: BorderRadius.circular(8),
              ),
              alignment: Alignment.center,
              child: Text(f['icon'] as String, style: const TextStyle(fontSize: 16)),
            ),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    f['title'] as String,
                    style: TextStyle(
                      fontSize: 12.5,
                      fontWeight: FontWeight.bold,
                      color: isPlayingThis
                          ? tint
                          : (isDark ? AppTheme.textPrimaryDark : AppTheme.textPrimaryLight),
                    ),
                  ),
                  const SizedBox(height: 2),
                  Text(
                    f['desc'] as String,
                    style: TextStyle(
                      fontSize: 11,
                      color: isDark ? Colors.white60 : Colors.black54,
                    ),
                  ),
                ],
              ),
            ),
            const SizedBox(width: 8),
            IconButton(
              icon: Icon(
                isPlayingThis ? Icons.stop_circle_rounded : Icons.volume_up_rounded,
                color: isPlayingThis ? Colors.redAccent : tint,
                size: 24,
              ),
              tooltip: isPlayingThis ? 'Stop Audio' : 'Listen to ${f['title']}',
              onPressed: () async {
                if (isPlayingThis) {
                  await activeState.stopSpeaking();
                } else {
                  await activeState.speakFeatureTopic(key);
                }
                setSheetState(() {});
              },
            ),
          ],
        ),
      );
    }).toList();
  }

  Widget _buildPersonaChip({
    required String label,
    required TtsVoicePersona persona,
    required TtsVoicePersona current,
    required bool isDark,
    required VoidCallback onTap,
  }) {
    final isSelected = persona == current;
    return GestureDetector(
      onTap: onTap,
      child: AnimatedContainer(
        duration: const Duration(milliseconds: 200),
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
        decoration: BoxDecoration(
          color: isSelected
              ? AppTheme.primary.withOpacity(0.18)
              : (isDark ? const Color(0xFF1E293B) : const Color(0xFFF1F5F9)),
          borderRadius: BorderRadius.circular(10),
          border: Border.all(
            color: isSelected ? AppTheme.primary : (isDark ? const Color(0xFF334155) : const Color(0xFFE2E8F0)),
            width: isSelected ? 1.8 : 1.0,
          ),
        ),
        child: Text(
          label,
          style: TextStyle(
            fontSize: 12,
            fontWeight: isSelected ? FontWeight.bold : FontWeight.w500,
            color: isSelected
                ? AppTheme.primary
                : (isDark ? Colors.white70 : Colors.black87),
          ),
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final state = Provider.of<AppState>(context);
    final theme = Theme.of(context);
    final isDark = theme.brightness == Brightness.dark;
    final isMasked = _hideBalance || state.isChildCareActive || state.isStealthMode;
    final userFirstName = state.currentUser?.fullName.split(" ").first ?? "User";

    final emProgress = state.emergencyFund.targetAmount > 0
        ? (state.emergencyFund.currentAmount / state.emergencyFund.targetAmount).clamp(0.0, 1.0)
        : 0.0;

    return Scaffold(
      appBar: AppBar(
        titleSpacing: 12,
        title: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            Container(
              width: 32,
              height: 32,
              decoration: BoxDecoration(
                gradient: AppTheme.gradientPrimary,
                borderRadius: BorderRadius.circular(8),
                boxShadow: const [
                  BoxShadow(
                    color: Color(0x3314B8A6),
                    blurRadius: 6,
                    offset: Offset(0, 2),
                  ),
                ],
              ),
              alignment: Alignment.center,
              child: const Text('💰', style: TextStyle(fontSize: 16)),
            ),
            const SizedBox(width: 8),
            Flexible(
              child: ShaderMask(
                shaderCallback: (bounds) => AppTheme.gradientPrimary.createShader(bounds),
                child: const Text(
                  'FinPocket',
                  overflow: TextOverflow.ellipsis,
                  style: TextStyle(
                    fontWeight: FontWeight.w800,
                    fontSize: 18,
                    color: Colors.white,
                    letterSpacing: -0.3,
                  ),
                ),
              ),
            ),
          ],
        ),
        actions: [
          // Read Aloud / Voice Guidance (Speaks in Telugu, Hindi, Tamil, Kannada, etc.)
          Container(
            margin: const EdgeInsets.only(right: 5),
            width: 34,
            height: 34,
            decoration: BoxDecoration(
              color: state.isSpeaking
                  ? AppTheme.primary.withOpacity(0.25)
                  : (isDark ? AppTheme.bgCardDark : AppTheme.bgCardLightSoft),
              borderRadius: BorderRadius.circular(8),
              border: Border.all(
                color: state.isSpeaking ? AppTheme.primary : (isDark ? AppTheme.borderDark : AppTheme.borderLight),
                width: state.isSpeaking ? 1.5 : 1.0,
              ),
            ),
            child: IconButton(
              padding: EdgeInsets.zero,
              icon: Icon(
                state.isSpeaking ? Icons.volume_up_rounded : Icons.record_voice_over_rounded,
                size: 18,
                color: state.isSpeaking ? AppTheme.primary : (isDark ? Colors.white70 : Colors.black87),
              ),
              tooltip: state.isSpeaking ? 'Tap to Stop Tour' : 'Voice Tour & Audio Briefing',
              onPressed: () {
                if (state.isSpeaking) {
                  state.stopSpeaking();
                } else {
                  _showAudioTourSheet(context);
                }
              },
            ),
          ),
          // Stealth Mode / Privacy Toggle (Balances Hidden in Public)
          Container(
            margin: const EdgeInsets.only(right: 5),
            width: 34,
            height: 34,
            decoration: BoxDecoration(
              color: state.isStealthMode
                  ? const Color(0x336366F1)
                  : (isDark ? AppTheme.bgCardDark : AppTheme.bgCardLightSoft),
              borderRadius: BorderRadius.circular(8),
              border: Border.all(
                color: state.isStealthMode ? const Color(0xFF6366F1) : (isDark ? AppTheme.borderDark : AppTheme.borderLight),
                width: state.isStealthMode ? 1.5 : 1.0,
              ),
            ),
            child: IconButton(
              padding: EdgeInsets.zero,
              icon: Icon(
                state.isStealthMode ? Icons.visibility_off_rounded : Icons.visibility_rounded,
                size: 18,
                color: state.isStealthMode ? const Color(0xFF818CF8) : (isDark ? Colors.white70 : Colors.black87),
              ),
              tooltip: state.isStealthMode ? 'Stealth Mode ON (Balances Hidden)' : 'Stealth Mode OFF (Tap to Hide Balances)',
              onPressed: () {
                state.toggleStealthMode();
                ScaffoldMessenger.of(context).showSnackBar(
                  SnackBar(
                    duration: const Duration(seconds: 2),
                    backgroundColor: state.isStealthMode ? const Color(0xFF4F46E5) : AppTheme.primary,
                    content: Text(
                      state.isStealthMode
                          ? '🔒 Stealth Mode Active: Sensitive balances masked in public.'
                          : '👁️ Stealth Mode Off: Real balances displayed.',
                    ),
                  ),
                );
              },
            ),
          ),
          // Theme Toggle (Matches Web .theme-toggle-dashboard)
          Container(
            margin: const EdgeInsets.only(right: 5),
            width: 34,
            height: 34,
            decoration: BoxDecoration(
              color: isDark ? AppTheme.bgCardDark : AppTheme.bgCardLightSoft,
              borderRadius: BorderRadius.circular(8),
              border: Border.all(
                color: isDark ? AppTheme.borderDark : AppTheme.borderLight,
              ),
            ),
            child: IconButton(
              padding: EdgeInsets.zero,
              icon: Text(
                state.themeMode == ThemeMode.dark ? '🌙' : '☀️',
                style: const TextStyle(fontSize: 14),
              ),
              tooltip: state.t('theme'),
              onPressed: () => state.toggleTheme(),
            ),
          ),
          // Notifications Bell with Unread Badge
          Container(
            margin: const EdgeInsets.only(right: 5),
            width: 34,
            height: 34,
            decoration: BoxDecoration(
              color: isDark ? AppTheme.bgCardDark : AppTheme.bgCardLightSoft,
              borderRadius: BorderRadius.circular(8),
              border: Border.all(
                color: isDark ? AppTheme.borderDark : AppTheme.borderLight,
              ),
            ),
            child: Stack(
              clipBehavior: Clip.none,
              alignment: Alignment.center,
              children: [
                IconButton(
                  padding: EdgeInsets.zero,
                  icon: Icon(
                    Icons.notifications_outlined,
                    size: 18,
                    color: isDark ? Colors.white70 : Colors.black87,
                  ),
                  tooltip: 'Notifications',
                  onPressed: () {
                    Navigator.push(
                      context,
                      MaterialPageRoute(
                        builder: (_) => const NotificationsScreen(),
                      ),
                    );
                  },
                ),
                if (state.unreadNotificationCount > 0)
                  Positioned(
                    top: 2,
                    right: 2,
                    child: Container(
                      padding: const EdgeInsets.all(3),
                      decoration: const BoxDecoration(
                        color: Color(0xFFEF4444),
                        shape: BoxShape.circle,
                      ),
                      constraints: const BoxConstraints(
                        minWidth: 13,
                        minHeight: 13,
                      ),
                      child: Text(
                        state.unreadNotificationCount > 9 ? '9+' : '${state.unreadNotificationCount}',
                        textAlign: TextAlign.center,
                        style: const TextStyle(
                          color: Colors.white,
                          fontSize: 7.5,
                          fontWeight: FontWeight.bold,
                        ),
                      ),
                    ),
                  ),
              ],
            ),
          ),
          // AI Assistant (Ask FinPocket)
          Container(
            margin: const EdgeInsets.only(right: 10),
            width: 34,
            height: 34,
            decoration: BoxDecoration(
              color: isDark ? AppTheme.bgCardDark : AppTheme.bgCardLightSoft,
              borderRadius: BorderRadius.circular(8),
              border: Border.all(
                color: isDark ? AppTheme.borderDark : AppTheme.borderLight,
              ),
            ),
            child: IconButton(
              padding: EdgeInsets.zero,
              icon: const Text('💡', style: TextStyle(fontSize: 14)),
              tooltip: state.t('navAssistant'),
              onPressed: () => widget.onTabChange(7),
            ),
          ),
        ],
      ),
      body: RefreshIndicator(
        color: AppTheme.primary,
        onRefresh: () => state.refreshAllData(),
        child: SingleChildScrollView(
          physics: const AlwaysScrollableScrollPhysics(),
          padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              // Top Greeting Section (Localized greeting)
              Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          () {
                            final h = DateTime.now().hour;
                            final gKey = h < 12 ? 'greetingMorning' : (h < 17 ? 'greetingAfternoon' : 'greetingEvening');
                            return '${state.t(gKey)}, $userFirstName!';
                          }(),
                          style: TextStyle(
                            fontSize: 19,
                            fontWeight: FontWeight.w800,
                            color: isDark ? AppTheme.textPrimaryDark : AppTheme.textPrimaryLight,
                          ),
                          overflow: TextOverflow.ellipsis,
                        ),
                        const SizedBox(height: 2),
                        Text(
                          state.t('safeToSpendSubtitle'),
                          style: TextStyle(
                            fontSize: 12,
                            color: isDark ? AppTheme.textSecondaryDark : AppTheme.textSecondaryLight,
                          ),
                        ),
                      ],
                    ),
                  ),
                  if (state.isDemoMode)
                    Container(
                      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                      decoration: BoxDecoration(
                        color: AppTheme.primary.withOpacity(0.12),
                        borderRadius: BorderRadius.circular(6),
                        border: Border.all(color: AppTheme.primary.withOpacity(0.3)),
                      ),
                      child: const Text(
                        'DEMO',
                        style: TextStyle(
                          fontSize: 10,
                          fontWeight: FontWeight.w700,
                          color: AppTheme.primary,
                          letterSpacing: 0.5,
                        ),
                      ),
                    ),
                ],
              ),
              const SizedBox(height: 14),

              // 🎯 No-Spend Streak Gamification Banner
              GestureDetector(
                onTap: () => GamificationStreakModal.show(context),
                child: Container(
                  margin: const EdgeInsets.only(bottom: 12),
                  padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
                  decoration: BoxDecoration(
                    gradient: LinearGradient(
                      colors: isDark
                          ? [const Color(0xFF78350F).withOpacity(0.4), const Color(0xFF1E1B4B).withOpacity(0.4)]
                          : [const Color(0xFFFEF3C7), const Color(0xFFEFF6FF)],
                    ),
                    borderRadius: BorderRadius.circular(12),
                    border: Border.all(
                      color: const Color(0xFFF59E0B).withOpacity(0.4),
                      width: 1.2,
                    ),
                  ),
                  child: Row(
                    children: [
                      const Text('🔥', style: TextStyle(fontSize: 20)),
                      const SizedBox(width: 10),
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Row(
                              children: [
                                Flexible(
                                  child: Text(
                                    state.streakData.currentStreak == 0
                                        ? 'Start your streak 🔥'
                                        : '${state.streakData.currentStreak}-Day Budget Streak',
                                    style: const TextStyle(
                                      fontSize: 13,
                                      fontWeight: FontWeight.bold,
                                    ),
                                    overflow: TextOverflow.ellipsis,
                                  ),
                                ),
                                const SizedBox(width: 6),
                                Container(
                                  padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                                  decoration: BoxDecoration(
                                    color: const Color(0xFFF59E0B).withOpacity(0.2),
                                    borderRadius: BorderRadius.circular(6),
                                  ),
                                  child: Text(
                                    state.streakData.streakTierName,
                                    style: const TextStyle(
                                      fontSize: 10,
                                      fontWeight: FontWeight.bold,
                                      color: Color(0xFFD97706),
                                    ),
                                  ),
                                ),
                              ],
                            ),
                            Text(
                              state.streakData.currentStreak == 0
                                  ? 'Open FinPocket daily — miss a day and it restarts • Tap to view awards'
                                  : 'Stayed within Safe-to-Spend limit • Tap to view badges',
                              style: TextStyle(
                                fontSize: 11,
                                color: isDark ? Colors.white60 : Colors.black54,
                              ),
                            ),
                          ],
                        ),
                      ),
                      const Icon(Icons.arrow_forward_ios_rounded, size: 14, color: Color(0xFFF59E0B)),
                    ],
                  ),
                ),
              ),

              // 💳 Active Credit Card "Minimum Due Trap" Alert Card
              if (state.creditCardStatements.any((c) => !c.isPaid)) ...[
                Builder(
                  builder: (ctx) {
                    final unpaidCard = state.creditCardStatements.firstWhere((c) => !c.isPaid);
                    return GestureDetector(
                      onTap: () => CreditCardTrapModal.show(context, unpaidCard),
                      child: Container(
                        margin: const EdgeInsets.only(bottom: 12),
                        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
                        decoration: BoxDecoration(
                          gradient: LinearGradient(
                            colors: isDark
                                ? [const Color(0xFF450A0A).withOpacity(0.45), const Color(0xFF1E293B)]
                                : [const Color(0xFFFEF2F2), const Color(0xFFFFFFFF)],
                          ),
                          borderRadius: BorderRadius.circular(14),
                          border: Border.all(
                            color: const Color(0xFFEF4444).withOpacity(0.4),
                            width: 1.2,
                          ),
                        ),
                        child: Row(
                          children: [
                            Container(
                              padding: const EdgeInsets.all(8),
                              decoration: BoxDecoration(
                                color: const Color(0xFFEF4444).withOpacity(0.15),
                                shape: BoxShape.circle,
                              ),
                              child: const Icon(Icons.credit_card_rounded, color: Color(0xFFEF4444), size: 18),
                            ),
                            const SizedBox(width: 12),
                            Expanded(
                              child: Column(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: [
                                  Row(
                                    children: [
                                      Flexible(
                                        child: Text(
                                          '${unpaidCard.bankName} CC (•••• ${unpaidCard.cardLast4})',
                                          style: const TextStyle(fontSize: 13, fontWeight: FontWeight.bold),
                                          overflow: TextOverflow.ellipsis,
                                        ),
                                      ),
                                      const SizedBox(width: 6),
                                      Container(
                                        padding: const EdgeInsets.symmetric(horizontal: 5, vertical: 1.5),
                                        decoration: BoxDecoration(
                                          color: const Color(0xFFEF4444).withOpacity(0.2),
                                          borderRadius: BorderRadius.circular(4),
                                        ),
                                        child: Text(
                                          'Due in ${unpaidCard.daysRemaining}d',
                                          style: const TextStyle(fontSize: 10, fontWeight: FontWeight.bold, color: Color(0xFFEF4444)),
                                        ),
                                      ),
                                    ],
                                  ),
                                  const SizedBox(height: 2),
                                  Text(
                                    'Total: ₹${unpaidCard.totalAmountDue.toStringAsFixed(0)} • Save ₹${unpaidCard.trapInterestCost.toStringAsFixed(0)} min due trap',
                                    maxLines: 1,
                                    overflow: TextOverflow.ellipsis,
                                    style: TextStyle(
                                      fontSize: 11,
                                      color: isDark ? const Color(0xFFFCA5A5) : const Color(0xFFDC2626),
                                      fontWeight: FontWeight.w500,
                                    ),
                                  ),
                                ],
                              ),
                            ),
                            Container(
                              padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
                              decoration: BoxDecoration(
                                color: const Color(0xFFEF4444),
                                borderRadius: BorderRadius.circular(8),
                              ),
                              child: const Text(
                                'Bust Trap',
                                style: TextStyle(color: Colors.white, fontSize: 11, fontWeight: FontWeight.bold),
                              ),
                            ),
                          ],
                        ),
                      ),
                    );
                  },
                ),
              ],
              const SizedBox(height: 6),

              // ==========================================
              // HERO STATS GRID (Adapting Web's 4 stat cards)
              // ==========================================

              // 1. Total Balance Card (Hero Web Card style)
              _buildStatCard(
                context: context,
                isDark: isDark,
                iconText: '💰',
                iconBgColor: const Color(0x1F14B8A6),
                label: state.t('totalBalance').toUpperCase(),
                value: isMasked ? '₹ ••••••' : '₹${state.totalAvailableBalance.toStringAsFixed(2)}',
                valueColor: isDark ? AppTheme.textPrimaryDark : AppTheme.textPrimaryLight,
                trailing: IconButton(
                  padding: EdgeInsets.zero,
                  constraints: const BoxConstraints(),
                  icon: Icon(
                    isMasked ? Icons.visibility_off : Icons.visibility,
                    size: 18,
                    color: isDark ? AppTheme.textSecondaryDark : AppTheme.textSecondaryLight,
                  ),
                  onPressed: () {
                    if (!state.isChildCareActive) {
                      setState(() => _hideBalance = !_hideBalance);
                    }
                  },
                ),
                subtext: state.isBalanceSmsMirrored &&
                        state.smsBalanceSourceShort.isNotEmpty
                    ? state.smsBalanceSourceShort
                    : state.t('availableBalance'),
              ),
              const SizedBox(height: 12),

              // 2. Safe to Spend Card
              _buildStatCard(
                context: context,
                isDark: isDark,
                iconText: '🎯',
                iconBgColor: const Color(0x1F3B82F6),
                label: state.t('safeToSpend').toUpperCase(),
                value: isMasked ? '₹ ••••••' : '₹${state.safeToSpend.safeToSpendToday.toStringAsFixed(2)}',
                valueColor: AppTheme.primary,
                trailing: Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    IconButton(
                      icon: Icon(
                        state.isSpeaking && state.currentSpeakingTopic == 'safe_to_spend'
                            ? Icons.volume_up_rounded
                            : Icons.volume_up_outlined,
                        size: 18,
                        color: state.isSpeaking && state.currentSpeakingTopic == 'safe_to_spend'
                            ? AppTheme.primary
                            : (isDark ? Colors.white70 : Colors.black54),
                      ),
                      tooltip: 'Listen to Safe-to-Spend voice guide',
                      padding: EdgeInsets.zero,
                      constraints: const BoxConstraints(),
                      onPressed: () => state.speakFeatureTopic('safe_to_spend'),
                    ),
                    const SizedBox(width: 8),
                    InkWell(
                      onTap: () => _showSafeToSpendCalculation(
                        context,
                        state.safeToSpend,
                        state.commitments,
                      ),
                      child: Row(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          Text(
                            state.t('breakdown'),
                            style: const TextStyle(
                              fontSize: 12,
                              color: AppTheme.primary,
                              fontWeight: FontWeight.w600,
                            ),
                          ),
                          const Icon(Icons.chevron_right, size: 16, color: AppTheme.primary),
                        ],
                      ),
                    ),
                  ],
                ),
                subtext: state
                    .t('safeToSpendBasis')
                    .replaceAll('{amount}', state.safeToSpend.safeToSpendToday.toStringAsFixed(2))
                    .replaceAll('{balance}', state.safeToSpend.totalBalance.toStringAsFixed(0))
                    .replaceAll('{days}', state.safeToSpend.remainingDaysInMonth.toString()),
              ),
              const SizedBox(height: 12),

              // 3. 2-Column Row: Total Income & Total Expenses
              Row(
                children: [
                  Expanded(
                    child: _buildMiniStatCard(
                      isDark: isDark,
                      iconText: '📈',
                      iconBgColor: const Color(0x1F22C55E),
                      label: state.t('income').toUpperCase(),
                      value: isMasked ? '₹ ••••' : '₹${state.thisMonthIncome.toStringAsFixed(0)}',
                      valueColor: AppTheme.success,
                    ),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: _buildMiniStatCard(
                      isDark: isDark,
                      iconText: '📉',
                      iconBgColor: const Color(0x1FEF4444),
                      label: state.t('spent').toUpperCase(),
                      value: isMasked ? '₹ ••••' : '₹${state.thisMonthSpent.toStringAsFixed(0)}',
                      valueColor: AppTheme.danger,
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 12),

              // 📊 Live Analytics & Spending Trends Card
              GestureDetector(
                onTap: () {
                  Navigator.push(
                    context,
                    MaterialPageRoute(builder: (_) => const AnalyticsScreen()),
                  );
                },
                child: Container(
                  margin: const EdgeInsets.only(bottom: 12),
                  padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
                  decoration: BoxDecoration(
                    gradient: LinearGradient(
                      colors: isDark
                          ? [const Color(0xFF0F2027), const Color(0xFF1E293B)]
                          : [const Color(0xFFEFF6FF), const Color(0xFFF0FDF4)],
                    ),
                    borderRadius: BorderRadius.circular(14),
                    border: Border.all(
                      color: AppTheme.primary.withOpacity(0.35),
                      width: 1.2,
                    ),
                    boxShadow: [
                      BoxShadow(
                        color: AppTheme.primary.withOpacity(0.08),
                        blurRadius: 8,
                        offset: const Offset(0, 3),
                      ),
                    ],
                  ),
                  child: Row(
                    children: [
                      Container(
                        width: 40,
                        height: 40,
                        decoration: BoxDecoration(
                          color: AppTheme.primary.withOpacity(0.18),
                          borderRadius: BorderRadius.circular(10),
                        ),
                        alignment: Alignment.center,
                        child: const Icon(
                          Icons.insights_rounded,
                          color: AppTheme.primary,
                          size: 22,
                        ),
                      ),
                      const SizedBox(width: 12),
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Row(
                              children: [
                                Text(
                                  'Live Analytics & Trends',
                                  style: TextStyle(
                                    fontSize: 13.5,
                                    fontWeight: FontWeight.bold,
                                    color: isDark ? AppTheme.textPrimaryDark : AppTheme.textPrimaryLight,
                                  ),
                                ),
                                const SizedBox(width: 6),
                                Container(
                                  padding: const EdgeInsets.symmetric(horizontal: 5, vertical: 1.5),
                                  decoration: BoxDecoration(
                                    color: AppTheme.primary.withOpacity(0.2),
                                    borderRadius: BorderRadius.circular(4),
                                  ),
                                  child: const Text(
                                    'LIVE',
                                    style: TextStyle(
                                      fontSize: 9,
                                      fontWeight: FontWeight.w900,
                                      color: AppTheme.primary,
                                      letterSpacing: 0.5,
                                    ),
                                  ),
                                ),
                              ],
                            ),
                            const SizedBox(height: 2),
                            Text(
                              'Interactive spending curve, category trends & history',
                              style: TextStyle(
                                fontSize: 11,
                                color: isDark ? AppTheme.textSecondaryDark : AppTheme.textSecondaryLight,
                              ),
                            ),
                          ],
                        ),
                      ),
                      const Icon(
                        Icons.arrow_forward_ios_rounded,
                        size: 14,
                        color: AppTheme.primary,
                      ),
                    ],
                  ),
                ),
              ),

              // Auto-Debit Radar Alert Banner (48-Hour advance warning)
              Builder(
                builder: (context) {
                  final dueSoon = state.ghostSubscriptions.where((s) => s.isDueWithin48Hours).toList();
                  if (dueSoon.isEmpty) return const SizedBox.shrink();
                  final first = dueSoon.first;
                  return Container(
                    margin: const EdgeInsets.only(bottom: 12),
                    padding: const EdgeInsets.all(12),
                    decoration: BoxDecoration(
                      color: const Color(0x26F59E0B),
                      borderRadius: BorderRadius.circular(12),
                      border: Border.all(color: const Color(0x66F59E0B)),
                    ),
                    child: Row(
                      children: [
                        const Text('⚠️', style: TextStyle(fontSize: 20)),
                        const SizedBox(width: 10),
                        Expanded(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text(
                                'Auto-Debit Radar: ${first.name}',
                                style: const TextStyle(fontSize: 12.5, fontWeight: FontWeight.bold, color: Color(0xFFFBBF24)),
                              ),
                              const SizedBox(height: 2),
                              Text(
                                '₹${first.amount.toStringAsFixed(0)} scheduled in ~${first.hoursUntilDue}h. Ensure bank balance.',
                                style: TextStyle(fontSize: 11, color: isDark ? AppTheme.textSecondaryDark : AppTheme.textSecondaryLight),
                              ),
                            ],
                          ),
                        ),
                      ],
                    ),
                  );
                },
              ),

              // Autonomous Round-Up Micro-Vault Hero Card
              Container(
                margin: const EdgeInsets.only(bottom: 14),
                padding: const EdgeInsets.all(14),
                decoration: BoxDecoration(
                  gradient: LinearGradient(
                    colors: isDark
                        ? [const Color(0xFF1E293B), const Color(0xFF0F172A)]
                        : [const Color(0xFFF0FDF4), const Color(0xFFDCFCE7)],
                  ),
                  borderRadius: BorderRadius.circular(14),
                  border: Border.all(color: AppTheme.success.withOpacity(0.3)),
                ),
                child: Row(
                  children: [
                    Container(
                      width: 44,
                      height: 44,
                      decoration: BoxDecoration(
                        color: AppTheme.success.withOpacity(0.18),
                        shape: BoxShape.circle,
                      ),
                      alignment: Alignment.center,
                      child: const Text('🪙', style: TextStyle(fontSize: 22)),
                    ),
                    const SizedBox(width: 12),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Row(
                            children: [
                              Flexible(
                                child: Text(
                                  'Round-Up Vault',
                                  style: TextStyle(fontSize: 13, fontWeight: FontWeight.bold, color: isDark ? AppTheme.textPrimaryDark : AppTheme.textPrimaryLight),
                                  overflow: TextOverflow.ellipsis,
                                ),
                              ),
                              const SizedBox(width: 6),
                              Container(
                                padding: const EdgeInsets.symmetric(horizontal: 5, vertical: 1),
                                decoration: BoxDecoration(
                                  color: (state.roundUpSavingsEnabled ? AppTheme.success : AppTheme.warning).withOpacity(0.2),
                                  borderRadius: BorderRadius.circular(4),
                                ),
                                child: Text(
                                  state.roundUpSavingsEnabled ? 'ACTIVE' : 'PAUSED',
                                  style: TextStyle(
                                    fontSize: 8,
                                    fontWeight: FontWeight.w900,
                                    color: state.roundUpSavingsEnabled ? AppTheme.success : AppTheme.warning,
                                  ),
                                ),
                              ),
                            ],
                          ),
                          const SizedBox(height: 3),
                          Text(
                            isMasked ? '₹ ••••' : '₹${state.accumulatedRoundUps.toStringAsFixed(0)} saved from ${state.roundUpTransactionsCount} purchases',
                            style: TextStyle(fontSize: 11, color: isDark ? AppTheme.textSecondaryDark : AppTheme.textSecondaryLight),
                          ),
                        ],
                      ),
                    ),
                    TextButton(
                      style: TextButton.styleFrom(
                        visualDensity: VisualDensity.compact,
                        backgroundColor: AppTheme.success.withOpacity(0.15),
                        foregroundColor: AppTheme.success,
                        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
                        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(8)),
                      ),
                      onPressed: state.accumulatedRoundUps <= 0
                          ? null
                          : () async {
                              final messenger = ScaffoldMessenger.of(context);
                              await state.withdrawRoundUpVaultToBank();
                              if (context.mounted) {
                                messenger.showSnackBar(
                                  const SnackBar(
                                    backgroundColor: Color(0xFF10B981),
                                    content: Text('Withdrew Round-Up savings into available bank balance!'),
                                  ),
                                );
                              }
                            },
                      child: const Text('Withdraw', style: TextStyle(fontSize: 11, fontWeight: FontWeight.bold)),
                    ),
                  ],
                ),
              ),

              // Daily Savings Spark / Motivation (Guaranteed Non-Repeating)
              _buildDailyMotivationCard(context, state, isDark),

              // ==========================================
              // QUICK ACTIONS
              // ==========================================
              _buildSectionHeader(
                title: state.t('quickActions'),
                isDark: isDark,
              ),
              const SizedBox(height: 10),
              Row(
                children: [
                  Expanded(
                    child: _buildQuickActionButton(
                      isDark: isDark,
                      iconText: '📲',
                      label: state.t('receive'),
                      // Receive is a destination of its own, not a popup on
                      // top of the Send form.
                      onTap: () => widget.onTabChange(1, null, 'receive'),
                    ),
                  ),
                  const SizedBox(width: 10),
                  Expanded(
                    child: _buildQuickActionButton(
                      isDark: isDark,
                      iconText: '💸',
                      label: state.t('send'),
                      onTap: widget.onOpenSend,
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 10),
              Row(
                children: [
                  Expanded(
                    child: _buildQuickActionButton(
                      isDark: isDark,
                      iconText: '🛡️',
                      label: 'Spend Guard',
                      onTap: () => SpendGuardSheet.show(context),
                    ),
                  ),
                  const SizedBox(width: 10),
                  Expanded(
                    child: _buildQuickActionButton(
                      isDark: isDark,
                      iconText: '🔬',
                      label: 'What-If Lab',
                      onTap: () {
                        Navigator.push(
                          context,
                          MaterialPageRoute(builder: (_) => const WhatIfLabScreen()),
                        );
                      },
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 10),
              Row(
                children: [
                  Expanded(
                    child: _buildQuickActionButton(
                      isDark: isDark,
                      iconText: '📷',
                      label: state.t('scan'),
                      onTap: () async {
                        final scanned = await QrScannerModal.show(context);
                        if (scanned != null && scanned.isNotEmpty) {
                          widget.onTabChange(1, scanned);
                        }
                      },
                    ),
                  ),
                  const SizedBox(width: 10),
                  Expanded(
                    child: _buildQuickActionButton(
                      isDark: isDark,
                      iconText: '🏆',
                      label: state.t('savingGoalsTitle'),
                      onTap: () => widget.onTabChange(3), // Savings tab
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 10),
              Row(
                children: [
                  Expanded(
                    child: _buildQuickActionButton(
                      isDark: isDark,
                      iconText: '🍽️',
                      label: 'Bill Splitter',
                      onTap: () => SmartBillSplitModal.show(context),
                    ),
                  ),
                  const SizedBox(width: 10),
                  Expanded(
                    child: _buildQuickActionButton(
                      isDark: isDark,
                      iconText: '🏦',
                      label: 'EMI Manager',
                      onTap: () => EmiManagerModal.show(context),
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 20),

              // ==========================================
              // FINANCIAL HEALTH SCORE 2.0 HERO CARD
              // ==========================================
              Builder(
                builder: (context) {
                  final healthResult = FinancialHealthEngine.calculate(
                    accounts: state.accounts,
                    transactions: state.transactions,
                    bills: state.bills,
                    goals: state.goals,
                  );
                  return InkWell(
                    onTap: () {
                      Navigator.push(
                        context,
                        MaterialPageRoute(builder: (_) => const FinancialHealthScreen()),
                      );
                    },
                    borderRadius: BorderRadius.circular(14),
                    child: Container(
                      padding: const EdgeInsets.all(14),
                      decoration: BoxDecoration(
                        color: isDark ? AppTheme.bgCardDark : AppTheme.bgCardLight,
                        borderRadius: BorderRadius.circular(14),
                        border: Border.all(
                          color: isDark ? AppTheme.borderDark : AppTheme.borderLight,
                        ),
                      ),
                      child: Row(
                        children: [
                          Container(
                            width: 44,
                            height: 44,
                            decoration: BoxDecoration(
                              color: AppTheme.primary.withOpacity(0.12),
                              borderRadius: BorderRadius.circular(10),
                            ),
                            alignment: Alignment.center,
                            child: Text(
                              '${healthResult.totalScore}',
                              style: const TextStyle(fontWeight: FontWeight.w900, color: AppTheme.primary, fontSize: 15),
                            ),
                          ),
                          const SizedBox(width: 12),
                          Expanded(
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Row(
                                  children: [
                                    Flexible(
                                      child: Text(
                                        'Financial Health 2.0',
                                        style: TextStyle(
                                          fontSize: 13,
                                          fontWeight: FontWeight.w700,
                                          color: isDark ? AppTheme.textPrimaryDark : AppTheme.textPrimaryLight,
                                        ),
                                        overflow: TextOverflow.ellipsis,
                                      ),
                                    ),
                                    const SizedBox(width: 6),
                                    Container(
                                      padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                                      decoration: BoxDecoration(
                                        color: AppTheme.accentGreen.withOpacity(0.12),
                                        borderRadius: BorderRadius.circular(6),
                                      ),
                                      child: Text(
                                        healthResult.tierLabel,
                                        style: const TextStyle(fontSize: 10, color: AppTheme.accentGreen, fontWeight: FontWeight.bold),
                                      ),
                                    ),
                                  ],
                                ),
                                const SizedBox(height: 2),
                                Text(
                                  'Tap for component breakdown & score boost roadmap',
                                  style: TextStyle(
                                    fontSize: 11,
                                    color: isDark ? AppTheme.textSecondaryDark : AppTheme.textSecondaryLight,
                                  ),
                                ),
                              ],
                            ),
                          ),
                          Icon(
                            Icons.chevron_right,
                            size: 18,
                            color: isDark ? AppTheme.textSecondaryDark : AppTheme.textSecondaryLight,
                          ),
                        ],
                      ),
                    ),
                  );
                },
              ),
              const SizedBox(height: 12),

              // ==========================================
              // FINANCIAL INTELLIGENCE & PLANNING BANNER
              // ==========================================
              InkWell(
                onTap: () {
                  Navigator.push(
                    context,
                    MaterialPageRoute(builder: (_) => const FinancialPlanningScreen()),
                  );
                },
                borderRadius: BorderRadius.circular(14),
                child: Container(
                  padding: const EdgeInsets.all(14),
                  decoration: BoxDecoration(
                    color: isDark ? AppTheme.bgCardDark : AppTheme.bgCardLight,
                    borderRadius: BorderRadius.circular(14),
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
                        width: 42,
                        height: 42,
                        decoration: BoxDecoration(
                          gradient: AppTheme.gradientPrimary,
                          borderRadius: BorderRadius.circular(10),
                        ),
                        child: const Center(
                          child: Text('📊', style: TextStyle(fontSize: 20)),
                        ),
                      ),
                      const SizedBox(width: 12),
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(
                              'Financial Intelligence & Budgets',
                              style: TextStyle(
                                fontSize: 13,
                                fontWeight: FontWeight.w700,
                                color: isDark ? AppTheme.textPrimaryDark : AppTheme.textPrimaryLight,
                              ),
                            ),
                            const SizedBox(height: 2),
                            Text(
                              '30d Forecast • Budget Sandbox • Smart Alerts',
                              style: TextStyle(
                                fontSize: 11,
                                color: isDark ? AppTheme.textSecondaryDark : AppTheme.textSecondaryLight,
                              ),
                            ),
                          ],
                        ),
                      ),
                      Icon(
                        Icons.chevron_right,
                        size: 18,
                        color: isDark ? AppTheme.textSecondaryDark : AppTheme.textSecondaryLight,
                      ),
                    ],
                  ),
                ),
              ),
              const SizedBox(height: 24),

              // ==========================================
              // RECENT TRANSACTIONS (Matches Web .dashboard-section)
              // ==========================================
              _buildSectionHeader(
                title: state.t('recentTransactions'),
                isDark: isDark,
                trailingText: '${state.t('viewAll')} →',
                onTrailingTap: () => widget.onTabChange(2), // History tab
              ),
              const SizedBox(height: 10),
              Container(
                decoration: BoxDecoration(
                  color: isDark ? AppTheme.bgCardDark : AppTheme.bgCardLight,
                  borderRadius: BorderRadius.circular(14),
                  border: Border.all(
                    color: isDark ? AppTheme.borderDark : AppTheme.borderLight,
                  ),
                ),
                padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
                child: state.transactions.isEmpty
                    ? _buildEmptyState(
                        isDark: isDark,
                        iconText: '📋',
                        title: state.t('noTransactions'),
                        subtitle: state.t('safeToSpendSubtitle'),
                      )
                    : Column(
                        children: state.transactions.take(4).map((txn) {
                          final isIncome = txn.type == TransactionType.INCOME;
                          return _buildWebTransactionItem(
                            isDark: isDark,
                            title: transactionPartyLabel(txn),
                            subtitle:
                                '${transactionTimeLabel(txn.timestamp)} • ${txn.category.toString().split('.').last}',
                            amountText: '${isIncome ? "+" : "-"}₹${txn.amount.toStringAsFixed(2)}',
                            isIncome: isIncome,
                          );
                        }).toList(),
                      ),
              ),
              const SizedBox(height: 24),

              // ==========================================
              // SAVING GOALS & EMERGENCY SHIELD (Matches Web)
              // ==========================================
              _buildSectionHeader(
                title: state.t('savingGoalsTitle'),
                isDark: isDark,
                trailingText: '${state.t('viewAll')} →',
                onTrailingTap: () => widget.onTabChange(3),
              ),
              const SizedBox(height: 10),
              Container(
                decoration: BoxDecoration(
                  color: isDark ? AppTheme.bgCardDark : AppTheme.bgCardLight,
                  borderRadius: BorderRadius.circular(14),
                  border: Border.all(
                    color: isDark ? AppTheme.borderDark : AppTheme.borderLight,
                  ),
                ),
                padding: const EdgeInsets.all(16),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    // Emergency Fund Shield row
                    Row(
                      mainAxisAlignment: MainAxisAlignment.spaceBetween,
                      children: [
                        Expanded(
                          child: Row(
                            children: [
                              Container(
                                width: 36,
                                height: 36,
                                decoration: BoxDecoration(
                                  color: const Color(0x1F14B8A6),
                                  borderRadius: BorderRadius.circular(8),
                                ),
                                child: const Center(
                                  child: Text('🛡️', style: TextStyle(fontSize: 18)),
                                ),
                              ),
                              const SizedBox(width: 10),
                              Expanded(
                                child: Column(
                                  crossAxisAlignment: CrossAxisAlignment.start,
                                  children: [
                                    Text(
                                      state.t('emergencyShield'),
                                      style: TextStyle(
                                        fontWeight: FontWeight.w700,
                                        fontSize: 13,
                                        color: isDark ? AppTheme.textPrimaryDark : AppTheme.textPrimaryLight,
                                      ),
                                      overflow: TextOverflow.ellipsis,
                                    ),
                                    Text(
                                      state.t('essentialReserve'),
                                      style: TextStyle(
                                        fontSize: 11,
                                        color: isDark ? AppTheme.textSecondaryDark : AppTheme.textSecondaryLight,
                                      ),
                                      overflow: TextOverflow.ellipsis,
                                    ),
                                  ],
                                ),
                              ),
                            ],
                          ),
                        ),
                        const SizedBox(width: 8),
                        Container(
                          padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                          decoration: BoxDecoration(
                            color: state.emergencyFund.isLocked
                                ? AppTheme.warning.withOpacity(0.15)
                                : AppTheme.success.withOpacity(0.15),
                            borderRadius: BorderRadius.circular(6),
                          ),
                          child: Text(
                            state.emergencyFund.isLocked ? '🔒 ${state.t('locked')}' : '🔓 ${state.t('unlocked')}',
                            style: TextStyle(
                              fontSize: 10,
                              fontWeight: FontWeight.w700,
                              color: state.emergencyFund.isLocked ? AppTheme.warning : AppTheme.success,
                            ),
                          ),
                        ),
                      ],
                    ),
                    const SizedBox(height: 12),
                    Row(
                      mainAxisAlignment: MainAxisAlignment.spaceBetween,
                      children: [
                        Text(
                          isMasked
                              ? '₹ •••••'
                              : '₹${state.emergencyFund.currentAmount.toStringAsFixed(0)} / ₹${state.emergencyFund.targetAmount.toStringAsFixed(0)}',
                          style: TextStyle(
                            fontSize: 13,
                            fontWeight: FontWeight.w600,
                            color: isDark ? AppTheme.textPrimaryDark : AppTheme.textPrimaryLight,
                          ),
                        ),
                        Text(
                          '${(emProgress * 100).toInt()}%',
                          style: const TextStyle(
                            fontSize: 12,
                            color: AppTheme.primary,
                            fontWeight: FontWeight.w700,
                          ),
                        ),
                      ],
                    ),
                    const SizedBox(height: 6),
                    ClipRRect(
                      borderRadius: BorderRadius.circular(4),
                      child: LinearProgressIndicator(
                        value: emProgress,
                        backgroundColor: isDark ? const Color(0xFF0F172A) : const Color(0xFFE2E8F0),
                        valueColor: const AlwaysStoppedAnimation<Color>(AppTheme.primary),
                        minHeight: 6,
                      ),
                    ),

                    if (state.savingsGoals.isNotEmpty) ...[
                      const SizedBox(height: 16),
                      Divider(color: isDark ? AppTheme.borderDark : AppTheme.borderLight),
                      const SizedBox(height: 12),
                      ...state.savingsGoals.take(2).map((goal) {
                        final pct = goal.targetAmount > 0
                            ? (goal.currentAmount / goal.targetAmount).clamp(0.0, 1.0)
                            : 0.0;
                        return Padding(
                          padding: const EdgeInsets.only(bottom: 12),
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Row(
                                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                                children: [
                                  Text(
                                    goal.name,
                                    style: TextStyle(
                                      fontSize: 12,
                                      fontWeight: FontWeight.w600,
                                      color: isDark ? AppTheme.textPrimaryDark : AppTheme.textPrimaryLight,
                                    ),
                                  ),
                                  Text(
                                    '${(pct * 100).round()}%',
                                    style: const TextStyle(
                                      fontSize: 11,
                                      fontWeight: FontWeight.w700,
                                      color: AppTheme.accentBlue,
                                    ),
                                  ),
                                ],
                              ),
                              const SizedBox(height: 4),
                              ClipRRect(
                                borderRadius: BorderRadius.circular(3),
                                child: LinearProgressIndicator(
                                  value: pct,
                                  backgroundColor: isDark ? const Color(0xFF0F172A) : const Color(0xFFE2E8F0),
                                  valueColor: const AlwaysStoppedAnimation<Color>(AppTheme.accentBlue),
                                  minHeight: 5,
                                ),
                              ),
                            ],
                          ),
                        );
                      }),
                    ],
                  ],
                ),
              ),
              const SizedBox(height: 24),

              // ==========================================
              // UPCOMING COMMITMENTS SECTION
              // ==========================================
              if (state.upcomingPayments.isNotEmpty) ...[
                _buildSectionHeader(
                  title: 'Upcoming Commitments',
                  isDark: isDark,
                  trailingText: 'Total: ₹${state.upcomingPayments.fold(0.0, (s, p) => s + p.amount).toStringAsFixed(0)}',
                ),
                const SizedBox(height: 10),
                Container(
                  decoration: BoxDecoration(
                    color: isDark ? AppTheme.bgCardDark : AppTheme.bgCardLight,
                    borderRadius: BorderRadius.circular(14),
                    border: Border.all(
                      color: isDark ? AppTheme.borderDark : AppTheme.borderLight,
                    ),
                  ),
                  padding: const EdgeInsets.all(12),
                  child: Column(
                    children: state.upcomingPayments.take(3).map((u) {
                      return Padding(
                        padding: const EdgeInsets.symmetric(vertical: 6),
                        child: Row(
                          mainAxisAlignment: MainAxisAlignment.spaceBetween,
                          children: [
                            Row(
                              children: [
                                Container(
                                  width: 32,
                                  height: 32,
                                  decoration: BoxDecoration(
                                    color: AppTheme.primary.withOpacity(0.12),
                                    borderRadius: BorderRadius.circular(8),
                                  ),
                                  child: Icon(
                                    u.paymentType == 'SUBSCRIPTION'
                                        ? Icons.subscriptions_outlined
                                        : Icons.receipt_outlined,
                                    size: 16,
                                    color: AppTheme.primary,
                                  ),
                                ),
                                const SizedBox(width: 10),
                                Column(
                                  crossAxisAlignment: CrossAxisAlignment.start,
                                  children: [
                                    Text(
                                      u.name,
                                      style: TextStyle(
                                        fontSize: 12,
                                        fontWeight: FontWeight.w600,
                                        color: isDark ? AppTheme.textPrimaryDark : AppTheme.textPrimaryLight,
                                      ),
                                    ),
                                    Text(
                                      u.dueDate,
                                      style: TextStyle(
                                        fontSize: 10,
                                        color: isDark ? AppTheme.textSecondaryDark : AppTheme.textSecondaryLight,
                                      ),
                                    ),
                                  ],
                                ),
                              ],
                            ),
                            Text(
                              '₹${u.amount.toStringAsFixed(0)}',
                              style: TextStyle(
                                fontSize: 13,
                                fontWeight: FontWeight.w700,
                                color: isDark ? AppTheme.textPrimaryDark : AppTheme.textPrimaryLight,
                              ),
                            ),
                          ],
                        ),
                      );
                    }).toList(),
                  ),
                ),
                const SizedBox(height: 20),
              ],
            ],
          ),
        ),
      ),
    );
  }

  // ========================================================
  // REUSABLE WEB-ALIGNED HELPER WIDGETS
  // ========================================================

  Widget _buildSectionHeader({
    required String title,
    required bool isDark,
    String? trailingText,
    VoidCallback? onTrailingTap,
  }) {
    return Row(
      mainAxisAlignment: MainAxisAlignment.spaceBetween,
      children: [
        Text(
          title,
          style: TextStyle(
            fontSize: 15,
            fontWeight: FontWeight.w700,
            color: isDark ? AppTheme.textPrimaryDark : AppTheme.textPrimaryLight,
          ),
        ),
        if (trailingText != null)
          InkWell(
            onTap: onTrailingTap,
            child: Text(
              trailingText,
              style: const TextStyle(
                fontSize: 12,
                fontWeight: FontWeight.w600,
                color: AppTheme.primary,
              ),
            ),
          ),
      ],
    );
  }

  Widget _buildStatCard({
    required BuildContext context,
    required bool isDark,
    required String iconText,
    required Color iconBgColor,
    required String label,
    required String value,
    required Color valueColor,
    Widget? trailing,
    required String subtext,
  }) {
    return Container(
      padding: const EdgeInsets.all(18),
      decoration: BoxDecoration(
        color: isDark ? AppTheme.bgCardDark : AppTheme.bgCardLight,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(
          color: isDark ? AppTheme.borderDark : AppTheme.borderLight,
        ),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withOpacity(isDark ? 0.25 : 0.04),
            blurRadius: 10,
            offset: const Offset(0, 3),
          ),
        ],
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Expanded(
                child: Row(
                  children: [
                    Container(
                      width: 38,
                      height: 38,
                      decoration: BoxDecoration(
                        color: iconBgColor,
                        borderRadius: BorderRadius.circular(10),
                      ),
                      alignment: Alignment.center,
                      child: Text(iconText, style: const TextStyle(fontSize: 18)),
                    ),
                    const SizedBox(width: 10),
                    Expanded(
                      child: Text(
                        label,
                        style: TextStyle(
                          fontSize: 11,
                          fontWeight: FontWeight.w700,
                          color: isDark ? AppTheme.textSecondaryDark : AppTheme.textSecondaryLight,
                          letterSpacing: 0.5,
                        ),
                        overflow: TextOverflow.ellipsis,
                      ),
                    ),
                  ],
                ),
              ),
              if (trailing != null) ...[
                const SizedBox(width: 8),
                trailing,
              ],
            ],
          ),
          const SizedBox(height: 12),
          Text(
            value,
            style: TextStyle(
              fontSize: 26,
              fontWeight: FontWeight.w800,
              color: valueColor,
              letterSpacing: -0.5,
            ),
          ),
          const SizedBox(height: 4),
          Text(
            subtext,
            style: TextStyle(
              fontSize: 11,
              color: isDark ? AppTheme.textMutedDark : AppTheme.textSecondaryLight,
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildMiniStatCard({
    required bool isDark,
    required String iconText,
    required Color iconBgColor,
    required String label,
    required String value,
    required Color valueColor,
  }) {
    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: isDark ? AppTheme.bgCardDark : AppTheme.bgCardLight,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(
          color: isDark ? AppTheme.borderDark : AppTheme.borderLight,
        ),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Container(
                width: 32,
                height: 32,
                decoration: BoxDecoration(
                  color: iconBgColor,
                  borderRadius: BorderRadius.circular(8),
                ),
                alignment: Alignment.center,
                child: Text(iconText, style: const TextStyle(fontSize: 15)),
              ),
              const SizedBox(width: 8),
              Expanded(
                child: Text(
                  label,
                  style: TextStyle(
                    fontSize: 10,
                    fontWeight: FontWeight.w700,
                    color: isDark ? AppTheme.textSecondaryDark : AppTheme.textSecondaryLight,
                    letterSpacing: 0.4,
                  ),
                  overflow: TextOverflow.ellipsis,
                ),
              ),
            ],
          ),
          const SizedBox(height: 10),
          Text(
            value,
            style: TextStyle(
              fontSize: 18,
              fontWeight: FontWeight.w800,
              color: valueColor,
              letterSpacing: -0.3,
            ),
            overflow: TextOverflow.ellipsis,
          ),
        ],
      ),
    );
  }

  Widget _buildQuickActionButton({
    required bool isDark,
    required String iconText,
    required String label,
    required VoidCallback onTap,
  }) {
    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(10),
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 12),
        decoration: BoxDecoration(
          color: isDark ? const Color(0x1F14B8A6) : const Color(0x1414B8A6),
          border: Border.all(
            color: isDark ? AppTheme.borderDark : AppTheme.borderLight,
          ),
          borderRadius: BorderRadius.circular(10),
        ),
        child: Row(
          children: [
            Container(
              width: 32,
              height: 32,
              decoration: BoxDecoration(
                gradient: AppTheme.gradientPrimary,
                borderRadius: BorderRadius.circular(8),
              ),
              alignment: Alignment.center,
              child: Text(iconText, style: const TextStyle(fontSize: 14)),
            ),
            const SizedBox(width: 10),
            Expanded(
              child: Text(
                label,
                style: TextStyle(
                  fontSize: 12,
                  fontWeight: FontWeight.w600,
                  color: isDark ? AppTheme.textPrimaryDark : AppTheme.textPrimaryLight,
                ),
                overflow: TextOverflow.ellipsis,
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildWebTransactionItem({
    required bool isDark,
    required String title,
    required String subtitle,
    required String amountText,
    required bool isIncome,
  }) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 8),
      child: Row(
        children: [
          Container(
            width: 38,
            height: 38,
            decoration: BoxDecoration(
              color: isIncome ? const Color(0x1F22C55E) : const Color(0x1FEF4444),
              borderRadius: BorderRadius.circular(10),
            ),
            alignment: Alignment.center,
            child: Text(
              isIncome ? '📈' : '📉',
              style: const TextStyle(fontSize: 16),
            ),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  title,
                  style: TextStyle(
                    fontWeight: FontWeight.w600,
                    fontSize: 13,
                    color: isDark ? AppTheme.textPrimaryDark : AppTheme.textPrimaryLight,
                  ),
                  overflow: TextOverflow.ellipsis,
                ),
                const SizedBox(height: 2),
                Text(
                  subtitle,
                  style: TextStyle(
                    fontSize: 11,
                    color: isDark ? AppTheme.textSecondaryDark : AppTheme.textSecondaryLight,
                  ),
                  overflow: TextOverflow.ellipsis,
                ),
              ],
            ),
          ),
          Text(
            amountText,
            style: TextStyle(
              fontWeight: FontWeight.w700,
              fontSize: 13,
              color: isIncome ? AppTheme.success : AppTheme.danger,
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildEmptyState({
    required bool isDark,
    required String iconText,
    required String title,
    required String subtitle,
  }) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 24, horizontal: 16),
      child: Center(
        child: Column(
          children: [
            Text(iconText, style: const TextStyle(fontSize: 32)),
            const SizedBox(height: 8),
            Text(
              title,
              style: TextStyle(
                fontSize: 13,
                fontWeight: FontWeight.w600,
                color: isDark ? AppTheme.textPrimaryDark : AppTheme.textPrimaryLight,
              ),
            ),
            const SizedBox(height: 4),
            Text(
              subtitle,
              textAlign: TextAlign.center,
              style: TextStyle(
                fontSize: 11,
                color: isDark ? AppTheme.textSecondaryDark : AppTheme.textSecondaryLight,
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildDailyMotivationCard(BuildContext context, AppState state, bool isDark) {
    final quote = state.todayMotivationQuote;
    if (quote == null) return const SizedBox.shrink();

    return Container(
      margin: const EdgeInsets.only(bottom: 20),
      decoration: BoxDecoration(
        gradient: LinearGradient(
          colors: isDark
              ? [const Color(0xFF0D2424), const Color(0xFF132F38)]
              : [const Color(0xFFE6FFFA), const Color(0xFFF0FDF4)],
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
        ),
        borderRadius: BorderRadius.circular(16),
        border: Border.all(
          color: isDark ? const Color(0xFF14B8A6).withOpacity(0.35) : const Color(0xFF14B8A6).withOpacity(0.4),
          width: 1.2,
        ),
        boxShadow: [
          BoxShadow(
            color: const Color(0xFF14B8A6).withOpacity(isDark ? 0.08 : 0.05),
            blurRadius: 10,
            offset: const Offset(0, 3),
          ),
        ],
      ),
      padding: const EdgeInsets.all(16),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Container(
                padding: const EdgeInsets.all(6),
                decoration: BoxDecoration(
                  color: const Color(0xFF14B8A6).withOpacity(0.2),
                  shape: BoxShape.circle,
                ),
                child: const Text('💡', style: TextStyle(fontSize: 16)),
              ),
              const SizedBox(width: 10),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      'DAILY SAVINGS SPARK',
                      style: TextStyle(
                        fontSize: 10,
                        fontWeight: FontWeight.w800,
                        letterSpacing: 0.8,
                        color: isDark ? const Color(0xFF2DD4BF) : const Color(0xFF0D9488),
                      ),
                    ),
                    Text(
                      'Guaranteed unique • Never repeated',
                      style: TextStyle(
                        fontSize: 9,
                        color: isDark ? AppTheme.textMutedDark : AppTheme.textMutedLight,
                      ),
                    ),
                  ],
                ),
              ),
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                decoration: BoxDecoration(
                  color: isDark ? const Color(0xFF1E293B) : Colors.white,
                  borderRadius: BorderRadius.circular(6),
                  border: Border.all(
                    color: isDark ? const Color(0xFF334155) : const Color(0xFFE2E8F0),
                  ),
                ),
                child: const Text(
                  'Daily Wisdom',
                  style: TextStyle(
                    fontSize: 9.5,
                    fontWeight: FontWeight.w700,
                    color: Color(0xFF14B8A6),
                  ),
                ),
              ),
              const SizedBox(width: 6),
              Material(
                color: Colors.transparent,
                child: InkWell(
                  borderRadius: BorderRadius.circular(20),
                  onTap: () => state.shuffleDailyMotivationQuote(),
                  child: Container(
                    padding: const EdgeInsets.all(5),
                    decoration: BoxDecoration(
                      color: isDark ? const Color(0xFF1E293B) : Colors.white,
                      shape: BoxShape.circle,
                      border: Border.all(
                        color: isDark ? const Color(0xFF334155) : const Color(0xFFE2E8F0),
                      ),
                    ),
                    child: const Icon(Icons.refresh_rounded, size: 14, color: Color(0xFF14B8A6)),
                  ),
                ),
              ),
            ],
          ),
          const SizedBox(height: 12),
          Text(
            '"${quote.quote}"',
            style: TextStyle(
              fontSize: 13,
              fontStyle: FontStyle.italic,
              fontWeight: FontWeight.w600,
              height: 1.4,
              color: isDark ? AppTheme.textPrimaryDark : AppTheme.textPrimaryLight,
            ),
          ),
          const SizedBox(height: 4),
          Align(
            alignment: Alignment.centerRight,
            child: Text(
              '— ${quote.author}',
              style: TextStyle(
                fontSize: 11,
                fontWeight: FontWeight.w700,
                color: isDark ? const Color(0xFF2DD4BF) : const Color(0xFF0F766E),
              ),
            ),
          ),
          const SizedBox(height: 10),
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 8),
            decoration: BoxDecoration(
              color: isDark ? Colors.black.withOpacity(0.25) : Colors.white.withOpacity(0.85),
              borderRadius: BorderRadius.circular(8),
              border: Border.all(
                color: isDark ? Colors.white.withOpacity(0.06) : Colors.black.withOpacity(0.05),
              ),
            ),
            child: Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Text('🎯', style: TextStyle(fontSize: 12)),
                const SizedBox(width: 8),
                Expanded(
                  child: Text(
                    quote.actionTip,
                    style: TextStyle(
                      fontSize: 11,
                      fontWeight: FontWeight.w500,
                      color: isDark ? AppTheme.textSecondaryDark : AppTheme.textSecondaryLight,
                    ),
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
