import 'package:shared_preferences/shared_preferences.dart';
import '../models/models.dart';

/// Month-by-month coaching loop for active loans.
///
/// Runs every time the app comes up and keeps nudging until every EMI is
/// cleared, then stops on its own. Each (EMI, month) pair only ever produces
/// one notification, so an open app cannot spam the notification shade.
class EmiGuidanceService {
  static const String _prefLastRunKey = 'finpocket_emi_guidance_last_run_v1';
  static const String _prefNotifiedKey = 'finpocket_emi_guidance_notified_v1';

  /// [notify] is injected (normally `AppState.addNotification`) so this service
  /// never has to import the provider.
  static Future<void> runCheckup({
    required List<EMILoan> emis,
    required void Function(AppNotification notification) notify,
  }) async {
    final active = emis.where((e) => !e.isCleared).toList();
    if (active.isEmpty) return;

    final now = DateTime.now();
    final todayKey = '${now.year}-${now.month}-${now.day}';

    final prefs = await SharedPreferences.getInstance();

    // Once-per-launch guard: the due-date reminders below are already de-duped
    // per month, this just avoids re-reading/writing prefs on every rebuild.
    final lastRun = prefs.getString(_prefLastRunKey);
    if (lastRun == todayKey) return;
    await prefs.setString(_prefLastRunKey, todayKey);

    final monthKey = '${now.year}-${now.month}';
    final notified = (prefs.getStringList(_prefNotifiedKey) ?? const [])
        .toSet();

    for (final emi in active) {
      final due = _nextDueDate(emi, now);
      final daysUntil = due.difference(DateTime(now.year, now.month, now.day)).inDays;
      final key = '${emi.id}|$monthKey';

      if (notified.contains(key)) continue;
      if (daysUntil > 7) continue;

      notify(_buildReminder(emi, daysUntil, due, active.length));
      notified.add(key);
    }

    await prefs.setStringList(_prefNotifiedKey, notified.toList());
  }

  static DateTime _nextDueDate(EMILoan emi, DateTime now) {
    var due = DateTime(now.year, now.month, emi.dueDayOfMonth);
    final startOfToday = DateTime(now.year, now.month, now.day);
    if (due.isBefore(startOfToday)) {
      due = DateTime(now.year, now.month + 1, emi.dueDayOfMonth);
    }
    return due;
  }

  static AppNotification _buildReminder(
    EMILoan emi,
    int daysUntil,
    DateTime due,
    int activeCount,
  ) {
    final dueLabel = daysUntil <= 0
        ? 'today'
        : daysUntil == 1
            ? 'tomorrow'
            : 'in $daysUntil days';
    final formattedDue = '${due.day.toString().padLeft(2, '0')}'
        '/${due.month.toString().padLeft(2, '0')}';

    final headline = daysUntil <= 1
        ? '🚨 ${emi.loanName} EMI $dueLabel'
        : '🏦 ${emi.loanName} EMI due $dueLabel';

    final body = StringBuffer()
      ..writeln('₹${emi.monthlyEMI.toStringAsFixed(0)} due on $formattedDue.')
      ..writeln('Paid ${emi.paidMonths}/${emi.totalTenureMonths} instalments · '
          '₹${emi.remainingAmount.toStringAsFixed(0)} left to clear.');

    if (daysUntil <= 2) {
      body.writeln('Make sure your balance covers it before the debit date.');
    } else {
      body.writeln(
        'Keep ₹${emi.monthlyEMI.toStringAsFixed(0)} aside now so it never bounces.',
      );
    }

    if (activeCount > 1) {
      body.writeln('$activeCount loans still running — clear the smallest first.');
    }

    return AppNotification(
      id: 'emi_${emi.id}_$daysUntil-${due.month}',
      title: headline,
      message: body.toString().trimRight(),
      type: NotificationType.emiReminder,
      timestamp: DateTime.now(),
      data: {
        'emiId': emi.id,
        'monthlyEMI': emi.monthlyEMI,
        'remainingAmount': emi.remainingAmount,
        'daysUntilDue': daysUntil,
        'dueDate': due.toIso8601String(),
      },
    );
  }
}
