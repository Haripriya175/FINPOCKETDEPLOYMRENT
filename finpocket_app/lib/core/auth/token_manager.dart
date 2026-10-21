import 'dart:async';
import 'dart:convert';
import 'package:flutter/foundation.dart';
import 'package:http/http.dart' as http;
import '../storage/secure_token_storage.dart';
import '../../config/app_config.dart';
import '../device_identity.dart';

class TokenManager {
  static String? _accessToken;
  static String? _refreshToken;
  static DateTime? _accessTokenExpiresAt;
  static bool _isRefreshing = false;

  static final List<Completer<bool>> _refreshWaiters = [];

  static String? get accessToken => _accessToken;
  static String? get refreshToken => _refreshToken;
  static bool get hasTokens => _accessToken != null && _accessToken!.isNotEmpty;

  static VoidCallback? onSessionExpired;

  /// Initialize tokens securely from hardware-backed storage at startup
  static Future<void> initialize() async {
    _accessToken = await SecureTokenStorage.getAccessToken();
    _refreshToken = await SecureTokenStorage.getRefreshToken();
    if (_accessToken != null) {
      _parseTokenExpiry(_accessToken!);
    }
  }

  static void _parseTokenExpiry(String token) {
    try {
      final parts = token.split('.');
      if (parts.length == 3) {
        final normalized = base64Url.normalize(parts[1]);
        final payloadString = utf8.decode(base64Url.decode(normalized));
        final payload = jsonDecode(payloadString);
        if (payload['exp'] != null) {
          _accessTokenExpiresAt = DateTime.fromMillisecondsSinceEpoch(
            (payload['exp'] as int) * 1000,
          );
        }
      }
    } catch (_) {
      // If parsing fails, fall back to null
      _accessTokenExpiresAt = null;
    }
  }

  static bool get isTokenExpiredOrNearExpiry {
    if (_accessToken == null) return true;
    if (_accessTokenExpiresAt == null) return false;
    // Consider token expired if within 60 seconds of expiration
    return DateTime.now().isAfter(
      _accessTokenExpiresAt!.subtract(const Duration(seconds: 60)),
    );
  }

  /// Store tokens securely and update internal state
  static Future<void> setTokens({
    required String? accessToken,
    required String? refreshToken,
  }) async {
    _accessToken = accessToken;
    _refreshToken = refreshToken;

    if (accessToken != null && refreshToken != null) {
      _parseTokenExpiry(accessToken);
      await SecureTokenStorage.saveTokens(
        accessToken: accessToken,
        refreshToken: refreshToken,
      );
    } else {
      _accessTokenExpiresAt = null;
      await SecureTokenStorage.clearTokens();
    }
  }

  /// Thread-safe token refresh with concurrent call deduplication
  static Future<bool> refreshTokenSafe() async {
    if (_refreshToken == null || _refreshToken!.isEmpty) {
      await clearSession();
      return false;
    }

    if (_isRefreshing) {
      final completer = Completer<bool>();
      _refreshWaiters.add(completer);
      return completer.future;
    }

    _isRefreshing = true;

    try {
      final url = Uri.parse('${AppConfig.apiBaseUrl}/auth/refresh');
      final response = await http.post(
        url,
        headers: {
          'Content-Type': 'application/json',
          'x-device-id': DeviceIdentity.id,
          'x-request-id': 'req_ref_${DateTime.now().millisecondsSinceEpoch}',
        },
        body: jsonEncode({'refreshToken': _refreshToken}),
      ).timeout(const Duration(seconds: 12));

      if (response.statusCode == 200) {
        final data = jsonDecode(response.body);
        final newAccessToken = data['token'] as String?;
        final newRefreshToken = (data['refreshToken'] as String?) ?? _refreshToken;

        if (newAccessToken != null) {
          await setTokens(
            accessToken: newAccessToken,
            refreshToken: newRefreshToken,
          );
          _resolveWaiters(true);
          return true;
        }
      }

      // If refresh failed (401 / revoked token), invalidate local session
      await clearSession();
      _resolveWaiters(false);
      onSessionExpired?.call();
      return false;
    } catch (e) {
      debugPrint('[TokenManager] Token refresh network error: $e');
      _resolveWaiters(false);
      return false;
    } finally {
      _isRefreshing = false;
    }
  }

  static void _resolveWaiters(bool success) {
    for (final waiter in _refreshWaiters) {
      if (!waiter.isCompleted) {
        waiter.complete(success);
      }
    }
    _refreshWaiters.clear();
  }

  /// Invalidate tokens and notify listeners
  static Future<void> clearSession() async {
    _accessToken = null;
    _refreshToken = null;
    _accessTokenExpiresAt = null;
    await SecureTokenStorage.clearTokens();
  }
}
