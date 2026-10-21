import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../providers/app_state.dart';
import '../theme/app_theme.dart';

class GamificationStreakModal extends StatelessWidget {
  const GamificationStreakModal({super.key});

  static void show(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      backgroundColor: isDark ? AppTheme.bgSurfaceDark : AppTheme.bgSurfaceLight,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(24)),
      ),
      builder: (ctx) => const GamificationStreakModal(),
    );
  }

  @override
  Widget build(BuildContext context) {
    final state = Provider.of<AppState>(context);
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final streak = state.streakData;
    final badges = state.badges;

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
                    width: 42,
                    height: 42,
                    decoration: BoxDecoration(
                      gradient: const LinearGradient(
                        colors: [Color(0xFFF59E0B), Color(0xFFEF4444)],
                      ),
                      borderRadius: BorderRadius.circular(12),
                    ),
                    child: const Center(
                      child: Text('🔥', style: TextStyle(fontSize: 22)),
                    ),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          'No-Spend Streak & Milestones',
                          style: TextStyle(
                            fontSize: 17,
                            fontWeight: FontWeight.bold,
                            color: isDark ? AppTheme.textPrimaryDark : AppTheme.textPrimaryLight,
                          ),
                        ),
                        Text(
                          streak.streakTierName,
                          style: const TextStyle(
                            fontSize: 12,
                            fontWeight: FontWeight.w600,
                            color: Color(0xFFF59E0B),
                          ),
                        ),
                      ],
                    ),
                  ),
                  IconButton(
                    icon: const Icon(Icons.close_rounded),
                    onPressed: () => Navigator.pop(context),
                  ),
                ],
              ),
              const SizedBox(height: 18),

              // The Snapchat rule, stated honestly.
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
                decoration: BoxDecoration(
                  color: const Color(0xFFF59E0B).withOpacity(0.1),
                  borderRadius: BorderRadius.circular(12),
                ),
                child: Row(
                  children: [
                    const Text('📌', style: TextStyle(fontSize: 16)),
                    const SizedBox(width: 8),
                    Expanded(
                      child: Text(
                        'Open FinPocket every day to keep the flame alive. Miss even one day and the streak restarts at 0 — milestone awards below are yours to keep.',
                        style: TextStyle(
                          fontSize: 11.5,
                          height: 1.35,
                          color: isDark ? const Color(0xFFE2E8F0) : const Color(0xFF475569),
                        ),
                      ),
                    ),
                  ],
                ),
              ),
              const SizedBox(height: 14),

              // Streak Flame Highlight Card
              Container(
                padding: const EdgeInsets.all(18),
                decoration: BoxDecoration(
                  gradient: LinearGradient(
                    colors: isDark
                        ? [const Color(0xFF78350F), const Color(0xFF1E1B4B)]
                        : [const Color(0xFFFEF3C7), const Color(0xFFEFF6FF)],
                    begin: Alignment.topLeft,
                    end: Alignment.bottomRight,
                  ),
                  borderRadius: BorderRadius.circular(18),
                  border: Border.all(
                    color: const Color(0xFFF59E0B).withOpacity(0.5),
                    width: 1.5,
                  ),
                ),
                child: Row(
                  children: [
                    Container(
                      width: 58,
                      height: 58,
                      decoration: BoxDecoration(
                        color: const Color(0xFFF59E0B).withOpacity(0.2),
                        shape: BoxShape.circle,
                      ),
                      child: Center(
                        child: Text(
                          '${streak.currentStreak}',
                          style: const TextStyle(
                            fontSize: 26,
                            fontWeight: FontWeight.w900,
                            color: Color(0xFFF59E0B),
                          ),
                        ),
                      ),
                    ),
                    const SizedBox(width: 16),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          const Text(
                            'Days Consecutive Discipline',
                            style: TextStyle(fontSize: 14, fontWeight: FontWeight.bold),
                          ),
                          const SizedBox(height: 4),
                          Text(
                            streak.currentStreak == 0
                                ? (streak.bestStreak > 0
                                    ? 'Streak lost — you missed a day. Open the app daily to rebuild it (best record: ${streak.bestStreak} days).'
                                    : 'No streak yet — open FinPocket every day to start your first one.')
                                : 'You stayed strictly within your daily Safe-to-Spend limit for ${streak.currentStreak} days in a row! Best record: ${streak.bestStreak} days.',
                            style: TextStyle(
                              fontSize: 12,
                              height: 1.3,
                              color: isDark ? const Color(0xFFE2E8F0) : const Color(0xFF475569),
                            ),
                          ),
                        ],
                      ),
                    ),
                  ],
                ),
              ),
              const SizedBox(height: 20),

              // Unlocked Badges Section
              Text(
                'Milestone Badges (${badges.where((b) => b.isUnlocked).length}/${badges.length})',
                style: TextStyle(
                  fontSize: 15,
                  fontWeight: FontWeight.bold,
                  color: isDark ? AppTheme.textPrimaryDark : AppTheme.textPrimaryLight,
                ),
              ),
              const SizedBox(height: 12),

              ...badges.map((badge) {
                return Container(
                  margin: const EdgeInsets.only(bottom: 10),
                  padding: const EdgeInsets.all(12),
                  decoration: BoxDecoration(
                    color: badge.isUnlocked
                        ? (isDark ? const Color(0xFF1E293B) : const Color(0xFFF8FAFC))
                        : (isDark ? const Color(0xFF0F172A).withOpacity(0.5) : const Color(0xFFF1F5F9).withOpacity(0.6)),
                    borderRadius: BorderRadius.circular(14),
                    border: Border.all(
                      color: badge.isUnlocked
                          ? (isDark ? const Color(0xFF334155) : const Color(0xFFE2E8F0))
                          : Colors.transparent,
                    ),
                  ),
                  child: Row(
                    children: [
                      Container(
                        width: 44,
                        height: 44,
                        decoration: BoxDecoration(
                          color: badge.isUnlocked
                              ? const Color(0xFF6366F1).withOpacity(0.15)
                              : Colors.grey.withOpacity(0.1),
                          borderRadius: BorderRadius.circular(12),
                        ),
                        child: Center(
                          child: Text(
                            badge.icon,
                            style: TextStyle(
                              fontSize: 22,
                              color: badge.isUnlocked ? null : Colors.grey,
                            ),
                          ),
                        ),
                      ),
                      const SizedBox(width: 14),
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Row(
                              children: [
                                Text(
                                  badge.title,
                                  style: TextStyle(
                                    fontSize: 14,
                                    fontWeight: FontWeight.bold,
                                    color: badge.isUnlocked
                                        ? (isDark ? AppTheme.textPrimaryDark : AppTheme.textPrimaryLight)
                                        : Colors.grey,
                                  ),
                                ),
                                const SizedBox(width: 6),
                                if (badge.isUnlocked)
                                  const Icon(Icons.check_circle_rounded, color: Color(0xFF10B981), size: 14),
                              ],
                            ),
                            const SizedBox(height: 2),
                            Text(
                              badge.description,
                              style: TextStyle(
                                fontSize: 11.5,
                                color: badge.isUnlocked
                                    ? (isDark ? Colors.white60 : Colors.black54)
                                    : Colors.grey,
                              ),
                            ),
                          ],
                        ),
                      ),
                      if (!badge.isUnlocked)
                        const Icon(Icons.lock_outline_rounded, size: 18, color: Colors.grey),
                    ],
                  ),
                );
              }),
              const SizedBox(height: 10),
            ],
          ),
        ),
      ),
    );
  }
}
