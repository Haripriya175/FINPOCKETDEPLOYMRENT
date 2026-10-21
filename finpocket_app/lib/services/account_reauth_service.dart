import 'dart:convert';

import 'api_service.dart';
import 'security_auth_service.dart';

/// Re-verifies the signed-in FinPocket account before a sensitive action —
/// today: changing the Vault PIN.
///
/// Deliberately **dry**: it proves that whoever holds the phone right now
/// still controls the account, without touching the signed-in session. No
/// token is stored, no cached user is replaced, nothing is logged.
class AccountReauthService {
  const AccountReauthService._();

  /// Verifies [password] against the account [email] server-side.
  ///
  /// Returns null on success, otherwise a user-facing error message.
  static Future<String?> verifyPassword({
    required String email,
    required String password,
  }) async {
    try {
      final response = await ApiService.postEndpointPublic('/auth/login', {
        'email': email.trim().toLowerCase(),
        'password': password,
        'deviceName': 'FinPocket re-verification',
      });
      final data = jsonDecode(response.body) as Map<String, dynamic>;

      if (response.statusCode != 200 || data['token'] == null) {
        return 'Account verification failed: ${data['error'] ?? 'check your password.'}';
      }

      final verifiedEmail =
          (data['user']?['email'] ?? '').toString().trim().toLowerCase();
      if (verifiedEmail != email.trim().toLowerCase()) {
        return 'That login belongs to a different account.';
      }
      return null; // verified — and the live session was left untouched
    } catch (_) {
      return 'Could not reach FinPocket to verify your account. Check your connection and try again.';
    }
  }

  /// Runs Google sign-in and verifies the resulting ID token server-side.
  ///
  /// Returns null on success, otherwise a user-facing error message.
  /// [expectedEmail] ties the check to the profile in use: signing in with a
  /// different Google account does not count as verification.
  static Future<String?> verifyGoogle({required String expectedEmail}) async {
    final result =
        await SecurityAuthService.authenticateGoogle(promptAccountChooser: true);

    if (!result.success) {
      final error = result.error ?? '';
      if (error.contains('cancel')) return 'cancelled';
      return error.isEmpty ? 'Google verification was not completed.' : error;
    }

    final idToken = result.idToken;
    if (idToken == null || idToken.isEmpty) {
      return 'No Google ID token received.';
    }
    if (result.email.trim().toLowerCase() !=
        expectedEmail.trim().toLowerCase()) {
      return 'Sign in with the same Google account that owns this FinPocket profile.';
    }

    try {
      final response = await ApiService.postEndpointPublic('/auth/google', {
        'idToken': idToken,
      });
      final data = jsonDecode(response.body) as Map<String, dynamic>;
      if (response.statusCode != 200 || data['token'] == null) {
        return 'Account verification failed (${data['error'] ?? response.statusCode}).';
      }
      return null;
    } catch (_) {
      return 'Could not reach FinPocket to verify your account. Check your connection and try again.';
    }
  }
}
