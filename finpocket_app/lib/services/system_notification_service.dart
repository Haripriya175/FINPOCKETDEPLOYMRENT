import 'dart:io';
import 'package:flutter/foundation.dart';
import 'package:flutter_local_notifications/flutter_local_notifications.dart';
import '../models/models.dart';
import '../config/app_config.dart';

/// Real operating system notification service (Android notification shade & iOS alert)
class SystemNotificationService {
  static final SystemNotificationService _instance = SystemNotificationService._internal();
  factory SystemNotificationService() => _instance;
  SystemNotificationService._internal();

  FlutterLocalNotificationsPlugin? _notificationsPlugin;
  bool _initialized = false;

  Future<void> initialize() async {
    if (_initialized) return;
    if (AppConfig.environment == AppEnvironment.test) {
      _initialized = true;
      return;
    }

    try {
      _notificationsPlugin ??= FlutterLocalNotificationsPlugin();

      const AndroidInitializationSettings androidSettings =
          AndroidInitializationSettings('@mipmap/ic_launcher');

      const DarwinInitializationSettings iosSettings = DarwinInitializationSettings(
        requestAlertPermission: true,
        requestBadgePermission: true,
        requestSoundPermission: true,
      );

      const InitializationSettings initSettings = InitializationSettings(
        android: androidSettings,
        iOS: iosSettings,
        macOS: iosSettings,
      );

      await _notificationsPlugin!.initialize(
        settings: initSettings,
        onDidReceiveNotificationResponse: (NotificationResponse response) {
          debugPrint('[SystemNotification] Notification tapped: ${response.payload}');
        },
      );

      // Request Android 13+ (API 33+) notification permissions
      if (!kIsWeb && Platform.isAndroid) {
        final androidPlugin = _notificationsPlugin!
            .resolvePlatformSpecificImplementation<AndroidFlutterLocalNotificationsPlugin>();
        await androidPlugin?.requestNotificationsPermission();
      }

      _initialized = true;
      debugPrint('[SystemNotificationService] Initialized successfully.');
    } catch (e) {
      debugPrint('[SystemNotificationService] Initialization warning: $e');
    }
  }

  /// Sends a real system notification that appears in the device's status bar,
  /// notification center, lock screen, and heads-up banner outside the app.
  Future<void> postNotification(AppNotification notification) async {
    if (AppConfig.environment == AppEnvironment.test) return;
    if (!_initialized) {
      await initialize();
    }

    try {
      final int notifId = notification.id.hashCode.abs() % 100000;

      String channelId = 'finpocket_general';
      String channelName = 'General Notifications';
      String channelDesc = 'FinPocket updates and notices';
      Importance importance = Importance.defaultImportance;
      Priority priority = Priority.defaultPriority;

      switch (notification.type) {
        case NotificationType.sms:
          channelId = 'finpocket_transactions';
          channelName = 'Banking & Transaction Receipts';
          channelDesc = 'Instant debit/credit receipts and reference IDs';
          importance = Importance.max;
          priority = Priority.high;
          break;
        case NotificationType.budgetAlert:
          channelId = 'finpocket_budgets';
          channelName = 'Budget Cap Warnings';
          channelDesc = 'Warnings when nearing or exceeding monthly spending limits';
          importance = Importance.high;
          priority = Priority.high;
          break;
        case NotificationType.dailyQuote:
          channelId = 'finpocket_motivation';
          channelName = 'Daily Savings Motivation';
          channelDesc = 'Daily financial wisdom and savings action tips';
          importance = Importance.defaultImportance;
          priority = Priority.defaultPriority;
          break;
        case NotificationType.security:
          channelId = 'finpocket_security';
          channelName = 'Security & Auth Alerts';
          channelDesc = 'PIN, login, and device protection alerts';
          importance = Importance.max;
          priority = Priority.high;
          break;
        case NotificationType.emiReminder:
          channelId = 'finpocket_emis';
          channelName = 'EMI & Loan Guidance';
          channelDesc = 'Monthly reminders and payoff coaching until your loans are cleared';
          importance = Importance.high;
          priority = Priority.high;
          break;
        case NotificationType.system:
          channelId = 'finpocket_general';
          channelName = 'General Notifications';
          channelDesc = 'FinPocket updates and notices';
          importance = Importance.defaultImportance;
          priority = Priority.defaultPriority;
          break;
      }

      final AndroidNotificationDetails androidDetails = AndroidNotificationDetails(
        channelId,
        channelName,
        channelDescription: channelDesc,
        importance: importance,
        priority: priority,
        styleInformation: BigTextStyleInformation(
          notification.message,
          contentTitle: notification.title,
          summaryText: 'FinPocket Banking Alert',
        ),
        icon: '@mipmap/ic_launcher',
        showWhen: true,
      );

      const DarwinNotificationDetails iosDetails = DarwinNotificationDetails(
        presentAlert: true,
        presentBadge: true,
        presentSound: true,
      );

      final NotificationDetails platformDetails = NotificationDetails(
        android: androidDetails,
        iOS: iosDetails,
      );

      await _notificationsPlugin?.show(
        id: notifId,
        title: notification.title,
        body: notification.message,
        notificationDetails: platformDetails,
        payload: notification.id,
      );
    } catch (e) {
      debugPrint('[SystemNotificationService] Failed to show system notification: $e');
    }
  }

  /// Cancel all active notifications on the operating system
  Future<void> cancelAllNotifications() async {
    try {
      await _notificationsPlugin?.cancelAll();
      debugPrint('[SystemNotificationService] Cancelled all active system notifications.');
    } catch (e) {
      debugPrint('[SystemNotificationService] Cancel all error: $e');
    }
  }
}
