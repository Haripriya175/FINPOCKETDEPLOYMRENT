import 'package:flutter/foundation.dart' show kIsWeb;

enum AppEnvironment {
  development,
  test,
  demo,
  staging,
  production,
}

enum LogLevel {
  debug,
  info,
  warn,
  error,
}

class AppConfig {
  /// Environment baked in at build/run time — never edited in source:
  ///
  /// ```sh
  /// flutter run --dart-define=FINPOCKET_ENV=development   # default
  /// flutter build apk --dart-define=FINPOCKET_ENV=production
  /// ```
  /// Accepts: development, test, demo, staging, production.
  static AppEnvironment environment =
      _parseEnvironment(const String.fromEnvironment('FINPOCKET_ENV', defaultValue: 'development'));

  static AppEnvironment _parseEnvironment(String raw) {
    switch (raw.trim().toLowerCase()) {
      case 'production':
        return AppEnvironment.production;
      case 'staging':
        return AppEnvironment.staging;
      case 'test':
        return AppEnvironment.test;
      case 'demo':
        return AppEnvironment.demo;
      case 'development':
        return AppEnvironment.development;
      default:
        // Unknown values fall back to development (never silently "production"):
        // a typo must not switch on production-only fail-closed checks.
        return AppEnvironment.development;
    }
  }

  static String? customApiBaseUrl;

  /// Host override for the dev backend, set at build/run time without editing
  /// source:
  ///
  /// ```sh
  /// # Android emulator (host loopback):
  /// flutter run --dart-define=FINPOCKET_API_HOST=10.0.2.2
  /// # Physical device on the same LAN:
  /// flutter run --dart-define=FINPOCKET_API_HOST=192.168.1.7
  /// # Default — requires `adb reverse tcp:3001 tcp:3001`
  /// flutter run
  /// ```
  static const String apiHostOverride =
      String.fromEnvironment('FINPOCKET_API_HOST');

  // Environment checks
  static bool get isProduction => environment == AppEnvironment.production;
  static bool get isStaging => environment == AppEnvironment.staging;
  static bool get isDemo => environment == AppEnvironment.demo;
  static bool get isTest => environment == AppEnvironment.test;
  static bool get isDevelopment => environment == AppEnvironment.development;

  /// Demo auto-login and demo fallbacks are permanently disabled
  static bool get allowDemoAutoLogin => false;

  /// Fail-closed production check for local URLs
  static String get apiBaseUrl {
    // 1. Build-time override (`--dart-define=FINPOCKET_API_HOST`) wins in
    //    EVERY environment, so release builds point directly at the deployed
    //    cloud backend without interference from stale local caches.
    if (apiHostOverride.isNotEmpty) {
      if (isProduction && _isLoopbackLike(apiHostOverride)) {
        throw StateError('Production build cannot connect to localhost or internal loopback IP addresses.');
      }
      if (apiHostOverride.startsWith('http://') || apiHostOverride.startsWith('https://')) {
        return '${apiHostOverride.replaceAll(RegExp(r'/+$'), '')}/api/v1';
      }
      return 'http://$apiHostOverride:3001/api/v1';
    }

    // 2. Runtime override (customApiBaseUrl) — ignore stale loopbacks in production
    if (customApiBaseUrl != null && customApiBaseUrl!.isNotEmpty) {
      if (isProduction && _isLoopbackLike(customApiBaseUrl!)) {
        customApiBaseUrl = null;
      } else {
        return customApiBaseUrl!;
      }
    }

    // 3. Environment defaults: Production and Staging always use the live 24/7 Render cloud backend.
    switch (environment) {
      case AppEnvironment.production:
      case AppEnvironment.staging:
        return 'https://finpocket-52hh.onrender.com/api/v1';
      case AppEnvironment.development:
      case AppEnvironment.demo:
      case AppEnvironment.test:
        if (kIsWeb) return 'https://finpocket-52hh.onrender.com/api/v1';
        // On physical devices, loopback connects to the phone itself where no server runs.
        // Defaulting to the live cloud backend ensures immediate out-of-the-box connectivity.
        return 'https://finpocket-52hh.onrender.com/api/v1';
    }
  }

  static bool _isLoopbackLike(String url) =>
      url.contains('localhost') || url.contains('127.0.0.1') || url.contains('10.0.2.2');

  // Feature Flags
  static bool featureGoogleSso = true;
  static bool featureFinancialTwin = true;
  static bool featureSpendGuard = true;
  static bool featureReceiptScanner = true;
  static bool featureSubscriptionIntelligence = true;
  static bool featureFamilySpaces = true;
  static bool featureFinancialEmergencyMode = true;
  static bool featureAiCopilot = true;
  static bool featureAnomalyRadar = true;
  static bool featureGoalAutopilot = true;

  // Logging level
  static LogLevel get loggingLevel {
    if (isProduction) return LogLevel.warn;
    return LogLevel.debug;
  }
}
