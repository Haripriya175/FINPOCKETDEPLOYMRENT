import 'package:flutter/foundation.dart';
import 'package:url_launcher/url_launcher.dart';

/// Thin, defensive wrapper around OS-level app intents.
///
/// Every helper follows the same contract:
///  * returns `true` only when the target app actually opened
///  * never throws to the caller
///  * falls through a prioritised list of handlers instead of trusting
///    `canLaunchUrl()` alone (which lies on Android 11+ when the target
///    package is not listed under `<queries>` in AndroidManifest.xml).
class ExternalIntentService {
  /// Opens WhatsApp with [text] prefilled, optionally targeting [phone].
  ///
  /// Order of attempts:
  ///   1. `whatsapp://send`      -> native app, lands straight in the chat
  ///   2. `https://api.whatsapp.com/send` -> app link / browser handoff
  ///   3. `sms:`                  -> last-resort escape hatch so the user can
  ///                                  still forward the message somewhere.
  static Future<bool> launchWhatsApp({
    required String text,
    String? phone,
    String? prefillTo,
  }) async {
    final cleanPhone = (phone ?? prefillTo)?.replaceAll(RegExp(r'\D'), '') ?? '';
    final encoded = Uri.encodeComponent(text);

    final List<Uri> candidates = [
      if (cleanPhone.isNotEmpty) Uri.parse('whatsapp://send?phone=$cleanPhone&text=$encoded'),
      Uri.parse('whatsapp://send?text=$encoded'),
      if (cleanPhone.isNotEmpty)
        Uri.parse('https://api.whatsapp.com/send?phone=$cleanPhone&text=$encoded'),
      Uri.parse('https://api.whatsapp.com/send?text=$encoded'),
    ];

    final opened = await _tryLaunchAll(candidates);
    if (opened) return true;

    debugPrint('[ExternalIntentService] WhatsApp unavailable, falling back to SMS.');
    return launchSms(body: text, phone: phone);
  }

  /// Opens the default messaging app with [body] prefilled.
  static Future<bool> launchSms({required String body, String? phone}) async {
    final cleanPhone = phone?.replaceAll(RegExp(r'\D'), '') ?? '';
    final encoded = Uri.encodeComponent(body);

    final List<Uri> candidates = [
      if (cleanPhone.isNotEmpty) Uri.parse('sms:$cleanPhone?body=$encoded'),
      Uri.parse('sms:?body=$encoded'),
      if (cleanPhone.isNotEmpty) Uri.parse('smsto:$cleanPhone?body=$encoded'),
      Uri.parse('smsto:?body=$encoded'),
    ];

    return _tryLaunchAll(candidates);
  }

  /// Opens an arbitrary `https`/custom-scheme URI (UPI apps, banking apps, maps).
  static Future<bool> launchExternalUrl(Uri uri, {String? fallbackUrl}) async {
    final candidates = <Uri>[
      uri,
      if (fallbackUrl != null) Uri.parse(fallbackUrl),
    ];
    return _tryLaunchAll(candidates);
  }

  /// Attempts each candidate URI in order, returning true on the first
  /// successful hand-off. Failures are swallowed so one broken handler never
  /// blocks the rest of the chain.
  static Future<bool> _tryLaunchAll(List<Uri> candidates) async {
    for (final uri in candidates) {
      try {
        final ok = await launchUrl(uri, mode: LaunchMode.externalApplication);
        if (ok) return true;
      } catch (e) {
        debugPrint('[ExternalIntentService] Failed to launch $uri -> $e');
      }
    }
    return false;
  }
}
