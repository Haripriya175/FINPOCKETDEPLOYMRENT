import 'dart:convert';

import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:finpocket_app/config/app_config.dart';
import 'package:finpocket_app/providers/app_state.dart';

String _todayKey() {
  final now = DateTime.now();
  return '${now.year}-${now.month.toString().padLeft(2, '0')}-${now.day.toString().padLeft(2, '0')}';
}

String _keyDaysAgo(int days) {
  final d = DateTime.now().subtract(Duration(days: days));
  return '${d.year}-${d.month.toString().padLeft(2, '0')}-${d.day.toString().padLeft(2, '0')}';
}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  group('Snapchat-style daily streak', () {
    test('fresh start counts day 1 with no pre-unlocked badges', () async {
      SharedPreferences.setMockInitialValues({});
      AppConfig.environment = AppEnvironment.test;
      final state = AppState();
      await state.loadGamificationData();

      // No fabricated seed: 0/0, nothing unlocked.
      expect(state.streakData.currentStreak, 0);
      expect(state.streakData.bestStreak, 0);
      expect(state.streakData.unlockedBadgeIds, isEmpty);

      await state.evaluateDailyStreak();
      expect(state.streakData.currentStreak, 1);
      expect(state.streakData.bestStreak, 1);
      expect(state.streakData.lastEvaluatedDate, _todayKey());
      // Today's honest check-in badge is earned; the old gifted
      // 'roundup_master' (zero round-ups) is never pre-unlocked.
      // (In the test env the demo emergency fund also earns
      // 'fortress_builder' through the same real rule.)
      expect(state.streakData.unlockedBadgeIds, contains('impulse_shield'));
      expect(
          state.streakData.unlockedBadgeIds, isNot(contains('roundup_master')));

      // Same-day re-evaluation is a no-op.
      await state.evaluateDailyStreak();
      expect(state.streakData.currentStreak, 1);
      expect(state.streakData.totalDisciplinedDays, 1);
    });

    test('a fully-missed day resets the streak to 0 (then today counts)',
        () async {
      SharedPreferences.setMockInitialValues({
        'fp_streak_data': jsonEncode({
          'currentStreak': 5,
          'bestStreak': 9,
          'lastEvaluatedDate': _keyDaysAgo(3),
          'totalDisciplinedDays': 12,
          'unlockedBadgeIds': ['impulse_shield', 'streak_3'],
        }),
      });
      AppConfig.environment = AppEnvironment.test;
      final state = AppState();
      await state.loadGamificationData();
      expect(state.streakData.currentStreak, 5);

      await state.evaluateDailyStreak();
      // Missed days broke it; today starts a new streak at 1.
      expect(state.streakData.currentStreak, 1);
      // Best record survives a lost streak.
      expect(state.streakData.bestStreak, 9);
      expect(state.streakData.lastEvaluatedDate, _todayKey());
      // The user is told the streak was lost.
      expect(
          state.notifications
              .where((n) => (n.data?['kind'] ?? '') == 'streak_lost')
              .length,
          1);
    });

    test('consecutive day extends the streak and unlocks milestones',
        () async {
      SharedPreferences.setMockInitialValues({
        'fp_streak_data': jsonEncode({
          'currentStreak': 6,
          'bestStreak': 6,
          'lastEvaluatedDate': _keyDaysAgo(1),
          'totalDisciplinedDays': 6,
          'unlockedBadgeIds': ['impulse_shield', 'streak_3'],
        }),
      });
      AppConfig.environment = AppEnvironment.test;
      final state = AppState();
      await state.loadGamificationData();

      await state.evaluateDailyStreak();
      expect(state.streakData.currentStreak, 7);
      expect(state.streakData.bestStreak, 7);
      // 7-day milestone award unlocked; no loss notice for a kept streak.
      expect(state.streakData.unlockedBadgeIds, contains('budget_zen'));
      expect(
          state.notifications
              .where((n) => (n.data?['kind'] ?? '') == 'streak_lost')
              .isEmpty,
          isTrue);
    });
  });
}
