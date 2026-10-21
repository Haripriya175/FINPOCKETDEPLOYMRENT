import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:flutter/foundation.dart';

/// Secure token storage backed by Android Keystore and iOS Keychain.
/// Falls back to memory-safe storage on test/desktop where secure storage is unconfigured.
class SecureTokenStorage {
  static const String _keyAccessToken = 'fp_access_token';
  static const String _keyRefreshToken = 'fp_refresh_token';
  static const String _keyBiometricEnabled = 'fp_biometric_enabled';
  static const String _keyLastSessionUser = 'fp_last_session_user';

  static const FlutterSecureStorage _storage = FlutterSecureStorage(
    aOptions: AndroidOptions(
      encryptedSharedPreferences: true,
      resetOnError: true,
    ),
    iOptions: IOSOptions(
      accessibility: KeychainAccessibility.first_unlock_this_device,
    ),
  );

  // In-memory fallback for unit/widget tests
  static final Map<String, String> _testMemoryStore = {};
  static bool isTestMode = false;

  static Future<void> saveTokens({
    required String accessToken,
    required String refreshToken,
  }) async {
    if (isTestMode) {
      _testMemoryStore[_keyAccessToken] = accessToken;
      _testMemoryStore[_keyRefreshToken] = refreshToken;
      return;
    }
    try {
      await _storage.write(key: _keyAccessToken, value: accessToken);
      await _storage.write(key: _keyRefreshToken, value: refreshToken);
    } catch (e) {
      if (!e.toString().contains('MissingPluginException')) {
        debugPrint('[SecureTokenStorage] Error writing tokens: $e');
      }
      _testMemoryStore[_keyAccessToken] = accessToken;
      _testMemoryStore[_keyRefreshToken] = refreshToken;
    }
  }

  static Future<String?> getAccessToken() async {
    if (isTestMode) return _testMemoryStore[_keyAccessToken];
    try {
      return await _storage.read(key: _keyAccessToken) ?? _testMemoryStore[_keyAccessToken];
    } catch (e) {
      return _testMemoryStore[_keyAccessToken];
    }
  }

  static Future<String?> getRefreshToken() async {
    if (isTestMode) return _testMemoryStore[_keyRefreshToken];
    try {
      return await _storage.read(key: _keyRefreshToken) ?? _testMemoryStore[_keyRefreshToken];
    } catch (e) {
      return _testMemoryStore[_keyRefreshToken];
    }
  }

  static Future<void> clearTokens() async {
    _testMemoryStore.remove(_keyAccessToken);
    _testMemoryStore.remove(_keyRefreshToken);
    if (!isTestMode) {
      try {
        await _storage.delete(key: _keyAccessToken);
        await _storage.delete(key: _keyRefreshToken);
      } catch (e) {
        if (!e.toString().contains('MissingPluginException')) {
          debugPrint('[SecureTokenStorage] Error clearing tokens: $e');
        }
      }
    }
  }

  static Future<void> saveBiometricPreference(bool enabled) async {
    if (isTestMode) {
      _testMemoryStore[_keyBiometricEnabled] = enabled.toString();
      return;
    }
    try {
      await _storage.write(key: _keyBiometricEnabled, value: enabled.toString());
    } catch (_) {
      _testMemoryStore[_keyBiometricEnabled] = enabled.toString();
    }
  }

  static Future<bool> getBiometricPreference() async {
    if (isTestMode) return _testMemoryStore[_keyBiometricEnabled] != 'false';
    try {
      final val = await _storage.read(key: _keyBiometricEnabled);
      return val != 'false';
    } catch (_) {
      return true;
    }
  }

  static const String _keyCachedUser = 'fp_cached_user';
  static const String _keyCustomApiUrl = 'fp_custom_api_url';

  static Future<void> saveLastUser(String email) async {
    _testMemoryStore[_keyLastSessionUser] = email;
    if (!isTestMode) {
      try {
        await _storage.write(key: _keyLastSessionUser, value: email);
      } catch (_) {}
    }
  }

  static Future<String?> getLastUser() async {
    if (isTestMode) return _testMemoryStore[_keyLastSessionUser];
    try {
      return await _storage.read(key: _keyLastSessionUser) ?? _testMemoryStore[_keyLastSessionUser];
    } catch (_) {
      return _testMemoryStore[_keyLastSessionUser];
    }
  }

  static Future<void> saveCachedUser(String userJson) async {
    _testMemoryStore[_keyCachedUser] = userJson;
    if (!isTestMode) {
      try {
        await _storage.write(key: _keyCachedUser, value: userJson);
      } catch (_) {}
    }
  }

  static Future<String?> getCachedUser() async {
    if (isTestMode) return _testMemoryStore[_keyCachedUser];
    try {
      return await _storage.read(key: _keyCachedUser) ?? _testMemoryStore[_keyCachedUser];
    } catch (_) {
      return _testMemoryStore[_keyCachedUser];
    }
  }

  /// Clear the cached user profile — critical for multi-account data isolation.
  static Future<void> clearCachedUser() async {
    _testMemoryStore.remove(_keyCachedUser);
    if (!isTestMode) {
      try {
        await _storage.delete(key: _keyCachedUser);
      } catch (_) {}
    }
  }

  /// Clear the last-session user email — prevents stale account hints.
  static Future<void> clearLastUser() async {
    _testMemoryStore.remove(_keyLastSessionUser);
    if (!isTestMode) {
      try {
        await _storage.delete(key: _keyLastSessionUser);
      } catch (_) {}
    }
  }

  static Future<void> saveCustomApiUrl(String url) async {
    _testMemoryStore[_keyCustomApiUrl] = url;
    if (!isTestMode) {
      try {
        await _storage.write(key: _keyCustomApiUrl, value: url);
      } catch (_) {}
    }
  }

  static Future<String?> getCustomApiUrl() async {
    if (isTestMode) return _testMemoryStore[_keyCustomApiUrl];
    try {
      return await _storage.read(key: _keyCustomApiUrl) ?? _testMemoryStore[_keyCustomApiUrl];
    } catch (_) {
      return _testMemoryStore[_keyCustomApiUrl];
    }
  }
}
