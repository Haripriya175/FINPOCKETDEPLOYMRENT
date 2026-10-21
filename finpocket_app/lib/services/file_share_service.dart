import 'package:flutter/foundation.dart' show debugPrint;
import 'package:flutter/services.dart';

/// Thin wrapper around the native `com.finpocket/share` MethodChannel.
///
/// Opens WhatsApp directly with a file attached (no share-sheet detour),
/// and saves a copy to the device Downloads folder.
class FileShareService {
  static const MethodChannel _channel = MethodChannel('com.finpocket/share');

  /// Opens WhatsApp directly with [filePath] attached. When [phone] is a
  /// valid 10-digit Indian number, the app targets WhatsApp specifically.
  ///
  /// Returns true if the share intent was dispatched (WhatsApp opened, or
  /// the system share sheet as fallback).
  static Future<bool> shareFileToWhatsApp({
    required String filePath,
    String? phone,
  }) async {
    try {
      final result = await _channel.invokeMethod<bool>('shareFileToWhatsApp', {
        'filePath': filePath,
        'phone': phone ?? '',
      });
      return result ?? false;
    } on PlatformException catch (e) {
      debugPrint('[FileShareService] share failed: ${e.message}');
      return false;
    } catch (e) {
      debugPrint('[FileShareService] share error: $e');
      return false;
    }
  }

  /// Copies [filePath] into the device Downloads folder so it appears in
  /// the Downloads app and Files browser.
  static Future<String?> downloadToDownloads(String filePath) async {
    try {
      final result = await _channel.invokeMethod<String>('downloadToDownloads', {
        'filePath': filePath,
      });
      return result;
    } on PlatformException catch (e) {
      debugPrint('[FileShareService] download failed: ${e.message}');
      return null;
    } catch (e) {
      debugPrint('[FileShareService] download error: $e');
      return null;
    }
  }
}
