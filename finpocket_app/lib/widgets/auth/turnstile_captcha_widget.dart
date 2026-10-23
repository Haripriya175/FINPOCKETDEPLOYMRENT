import 'dart:convert';

import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:webview_flutter/webview_flutter.dart';
import '../../config/app_config.dart';

class TurnstileCaptchaWidget extends StatefulWidget {
  final String siteKey;
  final ValueChanged<String?> onTokenChanged;

  const TurnstileCaptchaWidget({
    super.key,
    required this.siteKey,
    required this.onTokenChanged,
  });

  @override
  State<TurnstileCaptchaWidget> createState() => TurnstileCaptchaWidgetState();
}

class TurnstileCaptchaWidgetState extends State<TurnstileCaptchaWidget> {
  WebViewController? _controller;
  String? _token;
  String? _error;
  bool _loading = true;

  String? get token => _token;

  @override
  void initState() {
    super.initState();
    _initializeWidget();
  }

  Future<void> _initializeWidget() async {
    _setToken(null);
    if (widget.siteKey.trim().isEmpty) {
      setState(() {
        _loading = false;
        _error = 'Security verification is not configured. Set TURNSTILE_SITE_KEY and rebuild.';
      });
      return;
    }
    if (kIsWeb || defaultTargetPlatform == TargetPlatform.windows || defaultTargetPlatform == TargetPlatform.linux) {
      setState(() {
        _loading = false;
        _error = 'Turnstile registration is supported in the Android and iOS apps.';
      });
      return;
    }

    setState(() {
      _loading = true;
      _error = null;
    });

    try {
      final controller = WebViewController();
      await controller.setJavaScriptMode(JavaScriptMode.unrestricted);
      if (!mounted) return;
      await controller.addJavaScriptChannel(
        'FinPocketTurnstile',
        onMessageReceived: (message) => _setToken(message.message),
      );
      if (!mounted) return;
      await controller.setNavigationDelegate(
        NavigationDelegate(
          onPageFinished: (_) {
            if (mounted && _token == null && _error == null) {
              setState(() => _loading = false);
            }
          },
          onWebResourceError: (error) {
            if (error.isForMainFrame == true && mounted) {
              setState(() {
                _loading = false;
                _error = 'The security check could not be loaded. Check your connection and retry.';
              });
            }
          },
        ),
      );
      if (!mounted) return;
      setState(() => _controller = controller);
      final challengeOrigin = Uri.parse(AppConfig.apiBaseUrl).origin;
      await controller.loadHtmlString(_challengeHtml(widget.siteKey), baseUrl: challengeOrigin);
    } catch (_) {
      if (mounted) {
        setState(() {
          _loading = false;
          _error = 'The security check could not be loaded. Check your connection and retry.';
        });
      }
    }
  }

  String _challengeHtml(String siteKey) {
    final encodedSiteKey = jsonEncode(siteKey);
    return '''
<!doctype html>
<html lang="en">
<head>
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <script src="https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit" async defer></script>
  <style>body{margin:0;background:transparent;font-family:Arial,sans-serif;color:#94a3b8}#captcha{min-height:65px}</style>
</head>
<body>
  <div id="captcha" aria-label="Cloudflare security verification"></div>
  <script>
    window.addEventListener('load', function () {
      if (!window.turnstile) {
        FinPocketTurnstile.postMessage('error');
        return;
      }
      var widgetId = window.turnstile.render('#captcha', {
        sitekey: $encodedSiteKey,
        action: 'signup',
        callback: function (token) { FinPocketTurnstile.postMessage(token); },
        'expired-callback': function () { FinPocketTurnstile.postMessage('expired'); },
        'error-callback': function () { FinPocketTurnstile.postMessage('error'); }
      });
      window.resetFinPocketTurnstile = function () { window.turnstile.reset(widgetId); };
    });
  </script>
</body>
</html>
''';
  }

  void _setToken(String? value) {
    if (!mounted) return;
    if (value == 'error') {
      setState(() {
        _token = null;
        _loading = false;
        _error = 'The security check could not be completed. Retry it or check your connection.';
      });
      widget.onTokenChanged(null);
      return;
    }
    if (value == 'expired') {
      setState(() {
        _token = null;
        _loading = false;
        _error = 'The security check expired. Please complete it again.';
      });
      widget.onTokenChanged(null);
      return;
    }
    _token = value;
    setState(() {
      _loading = false;
      _error = null;
    });
    widget.onTokenChanged(value);
  }

  Future<void> refreshCaptcha() async {
    _setToken(null);
    final controller = _controller;
    if (controller == null) {
      await _initializeWidget();
      return;
    }
    try {
      await controller.runJavaScript(
        'if (window.resetFinPocketTurnstile) { window.resetFinPocketTurnstile(); }',
      );
      if (mounted) {
        setState(() {
          _loading = false;
          _error = null;
        });
      }
    } catch (_) {
      await _initializeWidget();
    }
  }

  @override
  Widget build(BuildContext context) {
    final unavailable = _controller == null || _error != null;
    return Semantics(
      label: 'Cloudflare security verification',
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          if (!unavailable)
            SizedBox(
              height: 100,
              child: WebViewWidget(controller: _controller!),
            ),
          if (_loading)
            const Padding(
              padding: EdgeInsets.all(12),
              child: Semantics(
                liveRegion: true,
                label: 'Loading security verification',
                child: Row(
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: [
                    SizedBox(height: 18, width: 18, child: CircularProgressIndicator(strokeWidth: 2)),
                    SizedBox(width: 10),
                    Text('Loading security check…'),
                  ],
                ),
              ),
            ),
          if (_error != null)
            Padding(
              padding: const EdgeInsets.symmetric(vertical: 8),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Semantics(liveRegion: true, child: Text(_error!)),
                  TextButton(
                    onPressed: refreshCaptcha,
                    child: const Text('Retry security check'),
                  ),
                ],
              ),
            ),
          if (_token != null)
            const Semantics(
              liveRegion: true,
              label: 'Security check complete',
              child: Text('Security check complete.'),
            ),
        ],
      ),
    );
  }
}
