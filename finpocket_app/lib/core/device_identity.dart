import 'dart:math';

import 'package:shared_preferences/shared_preferences.dart';

/// Persistent per-install device identifier sent to the backend as the
/// `x-device-id` header.
///
/// This used to be one hardcoded literal (`flutter_client_secure_device`)
/// shared by every install, which made the server's device/session ledger
/// unable to tell clients apart (and let any client impersonate any device).
/// Each install now generates its own id once and reuses it across launches.
class DeviceIdentity {
  static const String _prefsKey = 'finpocket_device_id';
  static String? _cached;

  /// Stable id for this install. Call [init] once at startup before the first
  /// request; if a request somehow happens earlier, a fresh id is generated,
  /// cached, and persisted in the background (whichever runs first wins, so
  /// the value never flips mid-session).
  static String get id {
    final cached = _cached;
    if (cached != null) return cached;
    final generated = _generate();
    _cached = generated;
    _persistAsync(generated);
    return generated;
  }

  /// Loads the persisted id, or creates and stores one on first launch.
  static Future<void> init() async {
    if (_cached != null) return;
    try {
      final prefs = await SharedPreferences.getInstance();
      _cached = prefs.getString(_prefsKey) ?? _generate();
      await prefs.setString(_prefsKey, _cached!);
    } catch (_) {
      // Storage unavailable (tests, restricted environments): a per-session id
      // still keeps the header valid; it just won't persist.
      _cached ??= _generate();
    }
  }

  static Future<void> _persistAsync(String value) async {
    try {
      final prefs = await SharedPreferences.getInstance();
      await prefs.setString(_prefsKey, value);
    } catch (_) {}
  }

  static String _generate() {
    final rnd = Random.secure();
    final bytes = List<int>.generate(16, (_) => rnd.nextInt(256));
    final hex = bytes.map((b) => b.toRadixString(16).padLeft(2, '0')).join();
    return 'fp_$hex';
  }
}
