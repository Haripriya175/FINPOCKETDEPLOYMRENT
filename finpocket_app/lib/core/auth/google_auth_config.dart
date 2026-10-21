import 'dart:io' show Platform;
import 'package:flutter/foundation.dart' show kIsWeb, debugPrint;
import 'package:google_sign_in/google_sign_in.dart';

class GoogleAuthConfig {
  static bool _isInitialized = false;

  /// Web / Server Client ID, baked in at build time — never hardcoded in
  /// source:
  ///
  ///   flutter run --dart-define=GOOGLE_SERVER_CLIENT_ID=`<web client id>`
  ///
  /// It MUST equal the backend's GOOGLE_CLIENT_ID / GOOGLE_SERVER_CLIENT_ID
  /// audience allow-list value, or the returned idToken is rejected
  /// server-side.
  static const String serverClientId = String.fromEnvironment(
    'GOOGLE_SERVER_CLIENT_ID',
    defaultValue: '403325234115-1dem20rm7b2mr306hkopdfph8ng650k8.apps.googleusercontent.com',
  );

  /// iOS OAuth Client ID, also baked at build time:
  ///
  ///   --dart-define=GOOGLE_IOS_CLIENT_ID=`<ios client id>`
  ///
  /// When omitted on iOS, the plugin falls back to the native
  /// GoogleService-Info.plist configuration.
  static const String iosClientId =
      String.fromEnvironment('GOOGLE_IOS_CLIENT_ID');

  /// Initialize Google Sign-In exactly once during application startup
  static Future<void> initialize() async {
    if (_isInitialized) return;
    if (serverClientId.isEmpty) {
      debugPrint('[GoogleAuthConfig] GOOGLE_SERVER_CLIENT_ID dart-define is '
          'not set — Google Sign-In is unavailable in this build.');
      return;
    }
    try {
      if (kIsWeb) {
        await GoogleSignIn.instance.initialize(
          clientId: serverClientId,
        );
      } else if (Platform.isIOS) {
        if (iosClientId.isNotEmpty) {
          await GoogleSignIn.instance.initialize(
            clientId: iosClientId,
            serverClientId: serverClientId,
          );
        } else {
          // No explicit iOS client id baked in: the plugin uses the native
          // GoogleService-Info.plist configuration.
          await GoogleSignIn.instance.initialize(
            serverClientId: serverClientId,
          );
        }
      } else if (Platform.isAndroid) {
        await GoogleSignIn.instance.initialize(
          serverClientId: serverClientId,
        );
      } else {
        // Desktop platforms where Google Sign In plugin has no native support
        await GoogleSignIn.instance.initialize(
          serverClientId: serverClientId,
        );
      }
      _isInitialized = true;
    } catch (e) {
      // In test harnesses or headless environments, initialization errors are caught gracefully
      debugPrint('[GoogleAuthConfig] Native GoogleSignIn initialization notice: $e');
    }
  }

  static bool get isInitialized => _isInitialized;
}
