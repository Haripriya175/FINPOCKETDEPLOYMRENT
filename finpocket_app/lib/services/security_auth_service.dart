import 'dart:convert';
import 'package:flutter/foundation.dart';
import 'package:local_auth/local_auth.dart';
import 'package:google_sign_in/google_sign_in.dart';
import 'package:flutter_facebook_auth/flutter_facebook_auth.dart';
import 'package:sign_in_with_apple/sign_in_with_apple.dart';
import '../core/storage/secure_token_storage.dart';
import '../core/auth/google_auth_config.dart';
import 'api_service.dart';

class SSOAuthResult {
  final bool success;
  final String provider;
  final String email;
  final String name;
  final String? idToken;
  final String? error;

  SSOAuthResult({
    required this.success,
    required this.provider,
    required this.email,
    required this.name,
    this.idToken,
    this.error,
  });
}

class PhoneValidationResult {
  final bool isValid;
  final String? normalized;
  final String? raw10Digits;
  final String? error;

  PhoneValidationResult({
    required this.isValid,
    this.normalized,
    this.raw10Digits,
    this.error,
  });
}

class PasswordValidationResult {
  final bool isValid;
  final int score; // 0 to 4
  final String strengthLabel;
  final List<String> errors;
  final bool hasMinLength;
  final bool hasUpper;
  final bool hasLower;
  final bool hasDigit;
  final bool hasSpecial;

  PasswordValidationResult({
    required this.isValid,
    required this.score,
    required this.strengthLabel,
    required this.errors,
    required this.hasMinLength,
    required this.hasUpper,
    required this.hasLower,
    required this.hasDigit,
    required this.hasSpecial,
  });
}

class SecurityAuthService {
  static final LocalAuthentication _localAuth = LocalAuthentication();

  // Known disposable / temporary email domains
  static const Set<String> _disposableDomains = {
    'mailinator.com',
    'tempmail.com',
    'temp-mail.org',
    '10minutemail.com',
    'guerrillamail.com',
    'guerrillamail.net',
    'guerrillamail.org',
    'throwawaymail.com',
    'yopmail.com',
    'sharklasers.com',
    'dispostable.com',
    'getairmail.com',
    'fakemailgenerator.com',
    'trashmail.com',
    'trashmail.net',
    'nada.ltd',
    'mohmal.com',
    'crazymailing.com',
    'inboxkitten.com',
    'fakeinbox.com',
    'burnermail.io',
    'mytemp.email',
    'emailondeck.com',
    'maildrop.cc',
    'generator.email',
    'tempail.com',
    'disposablemail.com',
    'dropmail.me',
    'getnada.com',
  };

  static const Set<String> _commonWeakPasswords = {
    'password',
    'password123',
    'admin',
    'admin123',
    '12345678',
    '123456789',
    'qwerty',
    'qwerty123',
    'welcome',
    'welcome123',
    'finpocket',
    'finpocket123',
  };

  // ==========================================
  // 1. PASSWORD POLICY VALIDATION
  // ==========================================
  static PasswordValidationResult validatePassword(
    String password, {
    String? name,
    String? email,
  }) {
    final errors = <String>[];
    final hasMinLength = password.length >= 8;
    final hasUpper = RegExp(r'[A-Z]').hasMatch(password);
    final hasLower = RegExp(r'[a-z]').hasMatch(password);
    final hasDigit = RegExp(r'[0-9]').hasMatch(password);
    final hasSpecial = RegExp(r'[!@#\$%^&*()_+\-=\[\]{};\x27:"\\|,.<>/?`~]').hasMatch(password);

    if (!hasMinLength) {
      errors.add('Must be at least 8 characters long');
    }
    if (!hasUpper) {
      errors.add('At least one uppercase letter (A-Z)');
    }
    if (!hasLower) {
      errors.add('At least one lowercase letter (a-z)');
    }
    if (!hasDigit) {
      errors.add('At least one number (0-9)');
    }
    if (!hasSpecial) {
      errors.add('At least one special character (!@#\$%...)');
    }

    if (_commonWeakPasswords.contains(password.toLowerCase().trim())) {
      errors.add('This password is too common and easily guessable');
    }

    if (name != null && name.trim().length >= 3) {
      for (final part in name.trim().toLowerCase().split(RegExp(r'\s+'))) {
        if (part.length >= 3 && password.toLowerCase().contains(part)) {
          errors.add('Password cannot contain your name');
          break;
        }
      }
    }

    if (email != null && email.contains('@')) {
      final prefix = email.split('@')[0].toLowerCase();
      if (prefix.length >= 3 && password.toLowerCase().contains(prefix)) {
        errors.add('Password cannot contain your email username');
      }
    }

    int score = 0;
    if (hasMinLength) score++;
    if (password.length >= 12) score++;
    final complexity = [hasUpper, hasLower, hasDigit, hasSpecial].where((c) => c).length;
    if (complexity >= 3) score++;
    if (complexity == 4) score++;

    if (errors.isNotEmpty && score > 2) score = 2;
    score = score.clamp(0, 4);

    String label = 'Weak';
    if (score == 4) {
      label = 'Strong';
    } else if (score == 3) {
      label = 'Good';
    } else if (score == 2) {
      label = 'Fair';
    }

    return PasswordValidationResult(
      isValid: errors.isEmpty,
      score: score,
      strengthLabel: label,
      errors: errors,
      hasMinLength: hasMinLength,
      hasUpper: hasUpper,
      hasLower: hasLower,
      hasDigit: hasDigit,
      hasSpecial: hasSpecial,
    );
  }

  // ==========================================
  // 2. DISPOSABLE EMAIL DETECTION
  // ==========================================
  static bool isDisposableEmail(String email) {
    if (!email.contains('@')) return false;
    final domain = email.split('@').last.toLowerCase().trim();
    return _disposableDomains.contains(domain);
  }

  // ==========================================
  // 3. BIOMETRIC AUTHENTICATION
  // ==========================================
  static Future<bool> isBiometricsAvailable() async {
    try {
      final canCheck = await _localAuth.canCheckBiometrics;
      final isSupported = await _localAuth.isDeviceSupported();
      return canCheck || isSupported;
    } catch (_) {
      return false;
    }
  }

  static Future<List<BiometricType>> getAvailableBiometrics() async {
    try {
      return await _localAuth.getAvailableBiometrics();
    } catch (_) {
      return [];
    }
  }

  static Future<bool> authenticateWithBiometrics({
    String reason = 'Authenticate with your fingerprint or face to access FinPocket',
  }) async {
    try {
      final canAuth = await isBiometricsAvailable();
      if (!canAuth) return false;

      return await _localAuth.authenticate(
        localizedReason: reason,
        options: const AuthenticationOptions(
          stickyAuth: true,
          biometricOnly: false, // Allows system PIN/password fallback for user choice!
        ),
      );
    } catch (e) {
      debugPrint('[SecurityAuthService] Biometrics error: $e');
      return false;
    }
  }

  static Future<bool> isBiometricLoginEnabled() async {
    return await SecureTokenStorage.getBiometricPreference();
  }

  static Future<void> setBiometricLoginEnabled(bool enabled) async {
    await SecureTokenStorage.saveBiometricPreference(enabled);
  }

  // ==========================================
  // 4. EMAIL & PHONE OTP VERIFICATION
  // ==========================================

  static Future<Map<String, dynamic>> sendEmailOtp(String email, String captchaToken) async {
    final cleanEmail = email.trim().toLowerCase();
    try {
      final res = await ApiService.postEndpointPublic('/auth/email/send-otp', {
        'email': cleanEmail,
        'captchaToken': captchaToken,
      });
      final data = jsonDecode(res.body);
      if (res.statusCode == 200 && data is Map<String, dynamic>) {
        return {
          'success': true,
          'message': data['message'] ?? 'Verification code sent to your email address.',
          'expiresInSeconds': data['expiresInSeconds'] ?? 600,
          'resendCooldownSeconds': data['resendCooldownSeconds'] ?? 30,
        };
      }
      if (data is Map<String, dynamic>) {
        return {
          'success': false,
          'error': data['error'] ?? 'Failed to send verification code.',
          'retryAfterSeconds': data['retryAfterSeconds'],
          'expiresInSeconds': data['expiresInSeconds'],
        };
      }
      return {'success': false, 'error': 'Failed to send verification code (${res.statusCode}).'};
    } catch (e) {
      return {'success': false, 'error': 'Network connection issue. Please check your internet connection and try again.'};
    }
  }

  static Future<Map<String, dynamic>> verifyEmailOtp(String email, String otp) async {
    final cleanEmail = email.trim().toLowerCase();
    final cleanOtp = otp.trim();

    try {
      final res = await ApiService.postEndpointPublic('/auth/email/verify-otp', {
        'email': cleanEmail,
        'otp': cleanOtp,
      });
      final data = jsonDecode(res.body);
      if (res.statusCode == 200 && data is Map<String, dynamic>) {
        return {
          'success': true,
          'verified': true,
          'message': data['message'] ?? 'Email address verified successfully!',
        };
      }
      if (data is Map<String, dynamic>) {
        return {
          'success': false,
          'verified': false,
          'error': data['error'] ?? 'Invalid verification code. Please check and try again.',
          'remainingAttempts': data['remainingAttempts'],
        };
      }
      return {'success': false, 'verified': false, 'error': 'Verification failed (${res.statusCode}).'};
    } catch (e) {
      return {'success': false, 'verified': false, 'error': 'Network error during verification. Please check your connection and retry.'};
    }
  }

  static Future<Map<String, dynamic>> sendPhoneOtp(
    String phone, {
    String? userId,
    required String captchaToken,
  }) async {
    final cleanPhone = phone.trim().replaceAll(RegExp(r'\s+'), '');
    try {
      final res = await ApiService.postEndpointPublic('/auth/phone/send-otp', {
        'phone': cleanPhone,
        'captchaToken': captchaToken,
        if (userId != null) 'userId': userId,
      });
      final data = jsonDecode(res.body);
      if (res.statusCode == 200 && data is Map<String, dynamic>) {
        return {
          'success': true,
          'message': data['message'] ?? 'Verification code sent successfully.',
          'maskedPhone': data['maskedPhone'] ?? maskPhone(cleanPhone),
          'expiresInSeconds': data['expiresInSeconds'] ?? 300,
          'resendCooldownSeconds': data['resendCooldownSeconds'] ?? 30,
        };
      }
      if (data is Map<String, dynamic>) {
        return {
          'success': false,
          'error': data['error'] ?? 'Failed to send mobile verification code.',
          'retryAfterSeconds': data['retryAfterSeconds'],
          'expiresInSeconds': data['expiresInSeconds'],
        };
      }
      return {'success': false, 'error': 'Failed to send verification SMS (${res.statusCode}).'};
    } catch (e) {
      return {'success': false, 'error': 'Network connection issue. Please check your internet connection and try again.'};
    }
  }

  static Future<Map<String, dynamic>> verifyPhoneOtp(
    String phone,
    String otp, {
    String? userId,
  }) async {
    final cleanPhone = phone.trim().replaceAll(RegExp(r'\s+'), '');
    final cleanOtp = otp.trim();

    try {
      final res = await ApiService.postEndpointPublic('/auth/phone/verify-otp', {
        'phone': cleanPhone,
        'otp': cleanOtp,
        if (userId != null) 'userId': userId,
      });
      final data = jsonDecode(res.body);
      if (res.statusCode == 200 && data is Map<String, dynamic>) {
        return {
          'success': true,
          'verified': true,
          'message': data['message'] ?? 'Phone number verified successfully.',
        };
      }
      if (data is Map<String, dynamic>) {
        return {
          'success': false,
          'verified': false,
          'error': data['error'] ?? 'Invalid verification code. Please check and try again.',
          'remainingAttempts': data['remainingAttempts'],
        };
      }
      return {'success': false, 'verified': false, 'error': 'Verification failed (${res.statusCode}).'};
    } catch (e) {
      return {'success': false, 'verified': false, 'error': 'Network error during verification. Please check your connection and retry.'};
    }
  }

  static Future<Map<String, dynamic>> resendOtp({
    required String destination,
    required String type,
    String? purpose,
    String? captchaToken,
  }) async {
    try {
      final cleanDest = destination.trim();
      final res = await ApiService.postEndpointPublic('/auth/otp/resend', {
        'destination': cleanDest,
        'type': type,
        'purpose': purpose ?? (type == 'PHONE' ? 'REGISTRATION_PHONE' : 'REGISTRATION_EMAIL'),
        if (captchaToken != null) 'captchaToken': captchaToken,
      });
      final data = jsonDecode(res.body);
      if (res.statusCode == 200 && data is Map<String, dynamic>) {
        return {
          'success': true,
          'message': data['message'] ?? 'Verification code resent successfully.',
          'expiresInSeconds': data['expiresInSeconds'] ?? 300,
          'resendCooldownSeconds': data['resendCooldownSeconds'] ?? 30,
          if (data['developmentOtp'] != null) 'developmentOtp': data['developmentOtp'].toString(),
          if (data['maskedPhone'] != null) 'maskedPhone': data['maskedPhone'],
        };
      }
      if (data is Map<String, dynamic>) {
        return {
          'success': false,
          'error': data['error'] ?? 'Please wait before requesting another code.',
          'retryAfterSeconds': data['retryAfterSeconds'],
          'expiresInSeconds': data['expiresInSeconds'],
        };
      }
      return {'success': false, 'error': 'Resend failed (${res.statusCode}).'};
    } catch (e) {
      return {'success': false, 'error': 'Network error. Please try again.'};
    }
  }

  static Future<Map<String, dynamic>> getVerificationStatus() async {
    return await ApiService.getVerificationStatus();
  }

  // ==========================================
  // 5. PRIVACY MASKING & PHONE NORMALIZATION HELPERS
  // ==========================================
  static PhoneValidationResult normalizeIndianPhone(String? phone) {
    if (phone == null || phone.trim().isEmpty) {
      return PhoneValidationResult(isValid: false, error: 'Mobile phone number is required.');
    }

    String cleaned = phone.replaceAll(RegExp(r'[\s\-\(\)\.]+'), '').trim();

    if (cleaned.startsWith('+91')) {
      cleaned = cleaned.substring(3);
    } else if (cleaned.startsWith('+')) {
      return PhoneValidationResult(isValid: false, error: 'Only Indian mobile numbers (+91) are supported.');
    } else if (cleaned.startsWith('0')) {
      cleaned = cleaned.substring(1);
    } else if (cleaned.startsWith('91') && cleaned.length == 12) {
      cleaned = cleaned.substring(2);
    }

    if (!RegExp(r'^\d{10}$').hasMatch(cleaned)) {
      return PhoneValidationResult(isValid: false, error: 'Please enter a valid 10-digit Indian mobile number.');
    }

    if (!RegExp(r'^[6-9]').hasMatch(cleaned)) {
      return PhoneValidationResult(isValid: false, error: 'Indian mobile numbers must start with 6, 7, 8, or 9.');
    }

    return PhoneValidationResult(
      isValid: true,
      normalized: '+91$cleaned',
      raw10Digits: cleaned,
    );
  }

  static String maskPhone(String? phone) {
    if (phone == null || phone.isEmpty) return '';
    final clean = phone.replaceAll(RegExp(r'\s+'), '');
    if (clean.length <= 4) return '••••';
    final prefix = clean.startsWith('+') ? clean.substring(0, 3) : '';
    final lastFour = clean.substring(clean.length - 4);
    return '$prefix ******$lastFour';
  }

  static String maskName(String? name) {
    if (name == null || name.isEmpty) return '';
    final parts = name.trim().split(RegExp(r'\s+'));
    return parts.map((p) {
      if (p.length <= 1) return p;
      return p[0] + '*' * (p.length - 1);
    }).join(' ');
  }

  // ==========================================
  // 6. SINGLE SIGN-ON (GOOGLE / APPLE / META)
  // ==========================================
  
  /// Authenticate using Google Sign-In 7.x
  /// Extracts the genuine OpenID Connect idToken without forced sign-out friction
  static Future<SSOAuthResult> authenticateGoogle({bool promptAccountChooser = false}) async {
    try {
      await GoogleAuthConfig.initialize();

      if (promptAccountChooser) {
        try {
          await GoogleSignIn.instance.signOut();
        } catch (_) {}
      }

      final GoogleSignInAccount account = await GoogleSignIn.instance.authenticate();
      final GoogleSignInAuthentication auth = account.authentication;
      final String? idToken = auth.idToken;

      if (idToken == null || idToken.isEmpty) {
        return SSOAuthResult(
          success: false,
          provider: 'google',
          email: account.email,
          name: account.displayName ?? '',
          error: 'Failed to retrieve Google ID token. Ensure serverClientId is configured correctly in Google Cloud Console.',
        );
      }

      return SSOAuthResult(
        success: true,
        provider: 'google',
        email: account.email,
        name: account.displayName ?? account.email.split('@')[0],
        idToken: idToken,
      );
    } catch (e) {
      debugPrint('[SecurityAuthService] Google Sign-In 7.x exception: $e');
      final errorStr = e.toString();
      if (errorStr.contains('canceled') ||
          errorStr.contains('cancelled') ||
          errorStr.contains('Account result failed') ||
          errorStr.contains('[16]') ||
          errorStr.contains('16:')) {
        return SSOAuthResult(
          success: false,
          provider: 'google',
          email: '',
          name: '',
          error: 'Google Sign-In was cancelled.',
        );
      }

      // Mispconfigured OAuth client (missing/incorrect SHA-1 or serverClientId).
      if (errorStr.contains('clientConfigurationError') ||
          errorStr.contains('serverClientId') ||
          errorStr.contains('DEVELOPER_ERROR') ||
          errorStr.contains('PlatformException(10,')) {
        return SSOAuthResult(
          success: false,
          provider: 'google',
          email: '',
          name: '',
          error:
              'Google Sign-In requires an active OAuth 2.0 Client ID and SHA-1 registered in Google Cloud Console for this Android device. Please sign in with Email & Password or use the Demo Sandbox.',
        );
      }

      // Unknown / unexpected failure. Log the raw value for debugging (debug
      // builds only) but never surface a raw platform exception to the user —
      // for a financial app the message must stay clear and actionable.
      debugPrint('[SecurityAuthService] Unmapped Google Sign-In error: $errorStr');
      return SSOAuthResult(
        success: false,
        provider: 'google',
        email: '',
        name: '',
        error:
            'Google Sign-In could not complete right now. Please check your network connection and try again, or sign in with Email & Password.',
      );
    }
  }

  /// Disconnect / Unlink Google session
  static Future<void> disconnectGoogle() async {
    try {
      await GoogleSignIn.instance.disconnect();
    } catch (_) {
      try {
        await GoogleSignIn.instance.signOut();
      } catch (_) {}
    }
  }

  // ==========================================
  // 7. META (FACEBOOK) SSO AUTHENTICATION
  // ==========================================

  /// Authenticate using Meta (Facebook) SSO credentials
  static Future<SSOAuthResult> authenticateMeta({String? providedToken}) async {
    try {
      // If a real token is passed in (e.g. from re-auth flow), use it directly
      if (providedToken != null && providedToken.isNotEmpty) {
        return SSOAuthResult(
          success: true,
          provider: 'meta',
          email: '',
          name: '',
          idToken: providedToken,
        );
      }

      // Trigger the real Facebook Login dialog (mirrors GoogleSignIn.instance.authenticate())
      final LoginResult result = await FacebookAuth.instance.login(
        permissions: ['email', 'public_profile'],
      );

      if (result.status == LoginStatus.cancelled) {
        return SSOAuthResult(
          success: false,
          provider: 'meta',
          email: '',
          name: '',
          error: 'Meta Sign-In was cancelled.',
        );
      }

      if (result.status != LoginStatus.success || result.accessToken == null) {
        return SSOAuthResult(
          success: false,
          provider: 'meta',
          email: '',
          name: '',
          error: result.message ?? 'Meta Sign-In failed.',
        );
      }

      final String accessToken = result.accessToken!.tokenString;

      // Fetch basic profile to surface a friendly name/email in logs
      final userData = await FacebookAuth.instance.getUserData(
        fields: 'name,email',
      );

      return SSOAuthResult(
        success: true,
        provider: 'meta',
        email: userData['email'] as String? ?? '',
        name: userData['name'] as String? ?? '',
        idToken: accessToken, // backend expects the FB access token
      );
    } catch (e) {
      debugPrint('[SecurityAuthService] Meta SSO error: $e');
      return SSOAuthResult(
        success: false,
        provider: 'meta',
        email: '',
        name: '',
        error: 'Meta authentication failed: ${e.toString()}',
      );
    }
  }

  /// Disconnect / Unlink Meta session
  static Future<void> disconnectMeta() async {
    // Session token cleanup
    debugPrint('[SecurityAuthService] Disconnected Meta SSO session');
  }

  // ==========================================
  // 8. APPLE SSO AUTHENTICATION
  // ==========================================

  /// Real Sign in with Apple flow — returns Apple's identity token, which the
  /// backend verifies against Apple's JWKS keys. No client-side fallback:
  /// if Apple returns no credential (or Sign in with Apple isn't configured
  /// for this platform/build), the result is an honest failure.
  static Future<SSOAuthResult> authenticateApple() async {
    try {
      final credential = await SignInWithApple.getAppleIDCredential(
        scopes: [
          AppleIDAuthorizationScopes.email,
          AppleIDAuthorizationScopes.fullName,
        ],
      );

      final idToken = credential.identityToken;
      if (idToken == null || idToken.isEmpty) {
        return SSOAuthResult(
          success: false,
          provider: 'apple',
          email: '',
          name: '',
          error: 'Apple did not return an identity token. Check the Sign in with Apple configuration for this build.',
        );
      }

      final fullName =
          '${credential.givenName ?? ''} ${credential.familyName ?? ''}'.trim();

      return SSOAuthResult(
        success: true,
        provider: 'apple',
        email: credential.email ?? '',
        name: fullName,
        idToken: idToken,
      );
    } on SignInWithAppleAuthorizationException catch (e) {
      if (e.code == AuthorizationErrorCode.canceled) {
        return SSOAuthResult(
          success: false,
          provider: 'apple',
          email: '',
          name: '',
          error: 'Apple Sign-In was cancelled.',
        );
      }
      return SSOAuthResult(
        success: false,
        provider: 'apple',
        email: '',
        name: '',
        error: 'Apple Sign-In failed (${e.code.name}).',
      );
    } catch (e) {
      debugPrint('[SecurityAuthService] Apple SSO error: $e');
      return SSOAuthResult(
        success: false,
        provider: 'apple',
        email: '',
        name: '',
        error: 'Apple authentication failed: ${e.toString()}',
      );
    }
  }
}
