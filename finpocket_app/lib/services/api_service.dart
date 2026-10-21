import 'dart:convert';
import 'package:flutter/foundation.dart';
import 'package:http/http.dart' as http;
import 'package:shared_preferences/shared_preferences.dart';
import '../config/app_config.dart';
import '../core/auth/token_manager.dart';
import '../core/device_identity.dart';
import '../core/errors/app_error.dart';
import '../core/storage/secure_token_storage.dart';
import '../models/models.dart';

class ApiService {
  static String get baseUrl => AppConfig.apiBaseUrl;

  static String? get authToken => TokenManager.accessToken;
  static String? get refreshToken => TokenManager.refreshToken;

  /// Optional listener triggered when a session is revoked or expired and refresh fails
  static VoidCallback? get onSessionExpired => TokenManager.onSessionExpired;
  static set onSessionExpired(VoidCallback? cb) => TokenManager.onSessionExpired = cb;

  static Future<void> initToken() async {
    await TokenManager.initialize();
  }

  static Future<void> setTokens(String? token, String? refreshToken) async {
    await TokenManager.setTokens(accessToken: token, refreshToken: refreshToken);
  }

  static Future<void> setToken(String? token) async {
    await TokenManager.setTokens(accessToken: token, refreshToken: TokenManager.refreshToken);
  }

  static Future<bool> refreshAuthToken() async {
    if (refreshToken == null || refreshToken!.isEmpty) {
      throw AuthenticationError('No refresh token available');
    }
    return await TokenManager.refreshTokenSafe();
  }

  static Map<String, String> _headers({String? idempotencyKey, String? tokenOverride}) {
    final token = tokenOverride ?? authToken;
    final headers = <String, String>{
      'Content-Type': 'application/json',
      'x-device-id': DeviceIdentity.id,
      'x-request-id': 'req_${DateTime.now().millisecondsSinceEpoch}',
    };
    if (token != null && token.isNotEmpty) {
      headers['Authorization'] = 'Bearer $token';
    }
    if (idempotencyKey != null) {
      headers['Idempotency-Key'] = idempotencyKey;
    }
    return headers;
  }

  /// Low-level authenticated request handler with automatic 401 refresh token interceptor
  static Future<http.Response> _sendWithAuth(
    Future<http.Response> Function(Map<String, String> headers) requestFn,
  ) async {
    final initialHeaders = _headers();
    var response = await requestFn(initialHeaders);

    if (response.statusCode == 401 && TokenManager.refreshToken != null) {
      final refreshSuccess = await TokenManager.refreshTokenSafe();
      if (refreshSuccess) {
        // Retry original request once with fresh access token
        final retryHeaders = _headers();
        response = await requestFn(retryHeaders);
      }
    }

    return response;
  }


  // ==========================================
  // HOST DISCOVERY & AUTHENTICATION APIS
  // ==========================================

  static List<String> get _candidateHosts {
    if (kIsWeb) return ['https://finpocket-52hh.onrender.com/api/v1', 'http://localhost:3001/api/v1'];
    return [
      'https://finpocket-52hh.onrender.com/api/v1',
      'http://127.0.0.1:3001/api/v1',
      'http://localhost:3001/api/v1',
      'http://10.0.2.2:3001/api/v1',
    ];
  }

  /// Automatically discover active backend host across cloud, Wi-Fi LAN, emulator & loopback
  static Future<String> discoverHost() async {
    if (AppConfig.isProduction || AppConfig.environment == AppEnvironment.test) {
      return AppConfig.apiBaseUrl;
    }
    if (AppConfig.apiHostOverride.isNotEmpty) return AppConfig.apiBaseUrl;
    if (AppConfig.customApiBaseUrl != null && AppConfig.customApiBaseUrl!.isNotEmpty) {
      return AppConfig.customApiBaseUrl!;
    }

    final saved = await SecureTokenStorage.getCustomApiUrl();
    if (saved != null && saved.isNotEmpty) {
      // Validate that saved URL is not a dead loopback from a previous debug session
      if (!saved.contains('127.0.0.1') && !saved.contains('localhost') && !saved.contains('192.168.')) {
        AppConfig.customApiBaseUrl = saved;
        return saved;
      }
    }

    // Default to the live Render cloud backend
    AppConfig.customApiBaseUrl = AppConfig.apiBaseUrl;
    return AppConfig.apiBaseUrl;
  }

  static Future<http.Response> _postEndpoint(
    String endpoint,
    Map<String, dynamic> body, {
    Map<String, String>? headers,
  }) async {
    final payload = jsonEncode(body);
    final reqHeaders = headers ?? _headers();

    // The configured backend ALWAYS leads.
    final explicitlyConfigured = AppConfig.isProduction ||
        AppConfig.isStaging ||
        AppConfig.environment == AppEnvironment.test ||
        AppConfig.apiHostOverride.isNotEmpty ||
        (AppConfig.customApiBaseUrl?.isNotEmpty ?? false) ||
        baseUrl.startsWith('https://');

    if (explicitlyConfigured) {
      return await http
          .post(
            Uri.parse('$baseUrl$endpoint'),
            headers: reqHeaders,
            body: payload,
          )
          .timeout(const Duration(seconds: 40));
    }

    // Unconfigured dev builds: probe the candidates (cloud first, then local loopback)
    Object? lastError;
    for (final host in _candidateHosts) {
      try {
        final res = await http
            .post(
              Uri.parse('$host$endpoint'),
              headers: reqHeaders,
              body: payload,
            )
            .timeout(const Duration(seconds: 40));

        AppConfig.customApiBaseUrl = host;
        await SecureTokenStorage.saveCustomApiUrl(host);
        return res;
      } catch (e) {
        lastError = e;
      }
    }

    throw lastError ?? Exception('Unable to connect to FinPocket server');
  }

  static Future<Map<String, dynamic>> login(
    String email,
    String password, {
    String? deviceName,
  }) async {
    final response = await _postEndpoint('/auth/login', {
      'email': email.trim().toLowerCase(),
      'password': password,
      'deviceName': deviceName ?? 'Flutter Mobile App',
    });

    final data = jsonDecode(response.body);
    if (response.statusCode == 200 && data['token'] != null) {
      await setTokens(data['token'], data['refreshToken']);
      return data;
    }

    throw Exception(data['error'] ?? 'Login failed (${response.statusCode})');
  }

  static Future<Map<String, dynamic>> register(
    String name,
    String email,
    String password, {
    String? phone,
  }) async {
    final response = await _postEndpoint('/auth/register', {
      'name': name.trim(),
      'email': email.trim().toLowerCase(),
      'password': password,
      'phone': phone?.trim() ?? '',
    });

    final data = jsonDecode(response.body);
    if (response.statusCode == 201 && data['token'] != null) {
      await setTokens(data['token'], data['refreshToken']);
      return data;
    }

    throw Exception(data['error'] ?? 'Registration failed (${response.statusCode})');
  }

  static Future<http.Response> postEndpointPublic(
    String endpoint,
    Map<String, dynamic> body, {
    Map<String, String>? headers,
  }) async {
    return _postEndpoint(endpoint, body, headers: headers);
  }

  /// Federated Google Sign-In with verified ID token
  static Future<Map<String, dynamic>> googleLogin({
    required String idToken,
    String? deviceName,
  }) async {
    final response = await _postEndpoint('/auth/google', {
      'idToken': idToken,
      'deviceName': deviceName ?? 'FinPocket Mobile (Android/iOS)',
    });

    final data = jsonDecode(response.body);

    if (response.statusCode == 409 && data['error'] == 'ACCOUNT_EXISTS_UNLINKED') {
      throw AccountExistsUnlinkedError(
        email: data['email'] ?? '',
        message: data['message'] ?? 'An account with this email already exists. Please log in with your password to link your Google account.',
      );
    }

    if (response.statusCode == 200 && data['token'] != null) {
      await setTokens(data['token'], data['refreshToken']);
      return data;
    }

    throw AuthenticationError(
      data['message'] ?? data['error'] ?? 'Google authentication failed (${response.statusCode})',
      code: data['error'],
    );
  }

  /// Explicitly link Google account to currently authenticated FinPocket session
  static Future<Map<String, dynamic>> linkGoogleAccount(String idToken) async {
    final response = await _sendWithAuth((headers) => http.post(
      Uri.parse('$baseUrl/auth/google/link'),
      headers: headers,
      body: jsonEncode({'idToken': idToken}),
    ));

    final data = jsonDecode(response.body);
    if (response.statusCode == 200) {
      return data;
    }
    throw AuthenticationError(data['error'] ?? 'Failed to link Google account');
  }

  /// Explicitly unlink Google account from currently authenticated FinPocket session
  static Future<Map<String, dynamic>> unlinkGoogleAccount() async {
    final response = await _sendWithAuth((headers) => http.post(
      Uri.parse('$baseUrl/auth/google/unlink'),
      headers: headers,
      body: jsonEncode({}),
    ));

    final data = jsonDecode(response.body);
    if (response.statusCode == 200) {
      return data;
    }
    throw AuthenticationError(data['error'] ?? 'Failed to unlink Google account');
  }

  /// Query Google linked status
  static Future<Map<String, dynamic>> getGoogleLinkStatus() async {
    final response = await _sendWithAuth((headers) => http.get(
      Uri.parse('$baseUrl/auth/google/status'),
      headers: headers,
    ));

    if (response.statusCode == 200) {
      return jsonDecode(response.body);
    }
    return {'isLinked': false};
  }

  /// Query authoritative email and mobile verification status for the current session
  static Future<Map<String, dynamic>> getVerificationStatus() async {
    final response = await _sendWithAuth((headers) => http.get(
      Uri.parse('$baseUrl/auth/verification-status'),
      headers: headers,
    ));

    final data = jsonDecode(response.body);
    if (response.statusCode == 200 && data is Map<String, dynamic>) {
      return data;
    }
    throw Exception(data['error'] ?? 'Failed to retrieve verification status (${response.statusCode})');
  }

  /// Federated Meta (Facebook) Sign-In with access token
  static Future<Map<String, dynamic>> metaLogin({
    required String accessToken,
    String? deviceName,
  }) async {
    final response = await _postEndpoint('/auth/meta', {
      'accessToken': accessToken,
      'deviceName': deviceName ?? 'FinPocket Mobile (Meta SSO)',
    });

    final data = jsonDecode(response.body);

    if (response.statusCode == 409 && data['error'] == 'ACCOUNT_EXISTS_UNLINKED') {
      throw AccountExistsUnlinkedError(
        email: data['email'] ?? '',
        message: data['message'] ?? 'An account with this email already exists. Please log in with your password to link your Facebook/Meta account.',
      );
    }

    if (response.statusCode == 200 && data['token'] != null) {
      await setTokens(data['token'], data['refreshToken']);
      return data;
    }

    throw AuthenticationError(
      data['message'] ?? data['error'] ?? 'Meta authentication failed (${response.statusCode})',
      code: data['error'],
    );
  }

  /// Explicitly link Meta account
  static Future<Map<String, dynamic>> linkMetaAccount(String accessToken) async {
    final response = await _sendWithAuth((headers) => http.post(
      Uri.parse('$baseUrl/auth/meta/link'),
      headers: headers,
      body: jsonEncode({'accessToken': accessToken}),
    ));

    final data = jsonDecode(response.body);
    if (response.statusCode == 200) {
      return data;
    }
    throw AuthenticationError(data['error'] ?? 'Failed to link Meta account');
  }

  /// Explicitly unlink Meta account
  static Future<Map<String, dynamic>> unlinkMetaAccount() async {
    final response = await _sendWithAuth((headers) => http.delete(
      Uri.parse('$baseUrl/auth/meta/unlink'),
      headers: headers,
    ));

    final data = jsonDecode(response.body);
    if (response.statusCode == 200) {
      return data;
    }
    throw AuthenticationError(data['error'] ?? 'Failed to unlink Meta account');
  }

  /// Get Meta linking status
  static Future<Map<String, dynamic>> getMetaLinkStatus() async {
    final response = await _sendWithAuth((headers) => http.get(
      Uri.parse('$baseUrl/auth/meta/status'),
      headers: headers,
    ));

    if (response.statusCode == 200) {
      return jsonDecode(response.body);
    }
    return {'isLinked': false};
  }

  /// Federated Sign in with Apple with verified ID token
  static Future<Map<String, dynamic>> appleLogin({
    required String idToken,
    String? name,
    String? deviceName,
  }) async {
    final response = await _postEndpoint('/auth/apple', {
      'idToken': idToken,
      if (name != null) 'name': name,
      'deviceName': deviceName ?? 'FinPocket Mobile (Apple SSO)',
    });

    final data = jsonDecode(response.body);

    if (response.statusCode == 409 && data['error'] == 'ACCOUNT_EXISTS_UNLINKED') {
      throw AccountExistsUnlinkedError(
        email: data['email'] ?? '',
        message: data['message'] ?? 'An account with this email already exists. Please log in with your password to link your Apple ID.',
      );
    }

    if (response.statusCode == 200 && data['token'] != null) {
      await setTokens(data['token'], data['refreshToken']);
      return data;
    }

    throw AuthenticationError(
      data['message'] ?? data['error'] ?? 'Apple authentication failed (${response.statusCode})',
      code: data['error'],
    );
  }

  /// Explicitly link Apple account
  static Future<Map<String, dynamic>> linkAppleAccount(String idToken) async {
    final response = await _sendWithAuth((headers) => http.post(
      Uri.parse('$baseUrl/auth/apple/link'),
      headers: headers,
      body: jsonEncode({'idToken': idToken}),
    ));

    final data = jsonDecode(response.body);
    if (response.statusCode == 200) {
      return data;
    }
    throw AuthenticationError(data['error'] ?? 'Failed to link Apple account');
  }

  /// Explicitly unlink Apple account
  static Future<Map<String, dynamic>> unlinkAppleAccount() async {
    final response = await _sendWithAuth((headers) => http.delete(
      Uri.parse('$baseUrl/auth/apple/unlink'),
      headers: headers,
    ));

    final data = jsonDecode(response.body);
    if (response.statusCode == 200) {
      return data;
    }
    throw AuthenticationError(data['error'] ?? 'Failed to unlink Apple account');
  }

  /// Backward compatible SSO method delegating to Google federated flow
  static Future<Map<String, dynamic>> ssoLogin({
    required String provider,
    required String email,
    String? name,
    String? phone,
    String? idToken,
  }) async {
    if (provider.toLowerCase() == 'google' && idToken != null && idToken.isNotEmpty) {
      return googleLogin(idToken: idToken);
    }
    throw UnsupportedError('Only cryptographically verified Google SSO is supported.');
  }

  static Future<void> logout() async {
    try {
      if (authToken != null) {
        await http.post(
          Uri.parse('$baseUrl/auth/logout'),
          headers: _headers(),
        );
      }
    } catch (_) {}
    await TokenManager.clearSession();
  }

  static Future<Map<String, dynamic>> sendEmailOtp(String email) async {
    final response = await _postEndpoint('/auth/email/send-otp', {
      'email': email.trim().toLowerCase(),
    });
    final data = jsonDecode(response.body);
    if (response.statusCode == 200) {
      return data;
    }
    throw Exception(data['error'] ?? 'Failed to send email verification code');
  }

  static Future<Map<String, dynamic>> verifyEmailOtp(String email, String otp) async {
    final response = await _postEndpoint('/auth/email/verify-otp', {
      'email': email.trim().toLowerCase(),
      'otp': otp.trim(),
    });
    final data = jsonDecode(response.body);
    if (response.statusCode == 200) {
      return data;
    }
    throw Exception(data['error'] ?? 'Invalid verification code');
  }

  static Future<Map<String, dynamic>> forgotPassword(String email) async {
    final response = await _postEndpoint('/auth/forgot-password', {
      'email': email.trim().toLowerCase(),
    });

    final data = jsonDecode(response.body);
    if (response.statusCode == 200) {
      return data;
    }
    throw Exception(data['error'] ?? 'Forgot password request failed');
  }

  static Future<Map<String, dynamic>> resetPassword(String token, String newPassword, {String? email}) async {
    final response = await _postEndpoint('/auth/reset-password', {
      'token': token.trim(),
      'newPassword': newPassword,
      if (email != null && email.isNotEmpty) 'email': email.trim().toLowerCase(),
    });

    final data = jsonDecode(response.body);
    if (response.statusCode == 200) {
      return data;
    }
    throw Exception(data['error'] ?? 'Password reset failed');
  }

  static Future<Map<String, dynamic>> getMe() async {
    final response = await _sendWithAuth((headers) {
      return http.get(Uri.parse('$baseUrl/auth/me'), headers: headers);
    });

    if (response.statusCode == 200) {
      return jsonDecode(response.body);
    }
    throw Exception('Failed to load user profile (${response.statusCode})');
  }

  /// Server-side App PIN verification — the bcrypt digest never leaves the
  /// server, so every client PIN gate (child care, emergency lock, savings)
  /// checks against the real credential instead of a fabricated local value.
  static Future<bool> verifyAppPin(String pin) async {
    final response = await _sendWithAuth((headers) {
      return http.post(
        Uri.parse('$baseUrl/auth/pin/verify'),
        headers: headers,
        body: jsonEncode({'pin': pin}),
      );
    });
    if (response.statusCode == 200) {
      return jsonDecode(response.body)['valid'] == true;
    }
    return false;
  }

  static Future<Map<String, dynamic>> updatePin(String newPin) async {
    final response = await _sendWithAuth((headers) {
      return http.post(
        Uri.parse('$baseUrl/auth/update-pin'),
        headers: headers,
        body: jsonEncode({'newPin': newPin}),
      );
    });

    final data = jsonDecode(response.body);
    if (response.statusCode == 200) {
      return data;
    }
    throw Exception(data['error'] ?? 'Failed to update PIN');
  }

  // ==========================================
  // PHASE 2 FINANCIAL APIS
  // ==========================================

  static Future<Map<String, dynamic>> getFinancialOverview() async {
    final response = await _sendWithAuth((headers) {
      return http.get(Uri.parse('$baseUrl/financial/overview'), headers: headers);
    });
    if (response.statusCode == 200) {
      return jsonDecode(response.body);
    }
    throw Exception('Failed to load financial overview: ${response.body}');
  }

  static Future<Map<String, dynamic>> getSafeToSpend() async {
    final response = await _sendWithAuth((headers) {
      return http.get(Uri.parse('$baseUrl/financial/safe-to-spend'), headers: headers);
    });
    if (response.statusCode == 200) {
      return jsonDecode(response.body)['safeToSpend'];
    }
    throw Exception('Failed to load safe to spend');
  }

  static Future<Map<String, dynamic>> getFinancialCommitments() async {
    final response = await _sendWithAuth((headers) {
      return http.get(Uri.parse('$baseUrl/financial/commitments'), headers: headers);
    });
    if (response.statusCode == 200) {
      return jsonDecode(response.body)['commitments'];
    }
    throw Exception('Failed to load commitments');
  }

  static Future<Map<String, dynamic>> getUpcomingPayments({String period = 'all'}) async {
    final response = await _sendWithAuth((headers) {
      return http.get(Uri.parse('$baseUrl/financial/upcoming?period=$period'), headers: headers);
    });
    if (response.statusCode == 200) {
      return jsonDecode(response.body);
    }
    throw Exception('Failed to load upcoming payments');
  }

  static Future<List<dynamic>> getPendingPayments() async {
    final response = await _sendWithAuth((headers) {
      return http.get(Uri.parse('$baseUrl/financial/pending'), headers: headers);
    });
    if (response.statusCode == 200) {
      return jsonDecode(response.body)['pendingPayments'] ?? [];
    }
    throw Exception('Failed to load pending payments');
  }

  static Future<Map<String, dynamic>> getMonthlySummary({int periodMonths = 1}) async {
    final response = await _sendWithAuth((headers) {
      return http.get(Uri.parse('$baseUrl/financial/monthly-summary?periodMonths=$periodMonths'), headers: headers);
    });
    if (response.statusCode == 200) {
      return jsonDecode(response.body)['summary'];
    }
    throw Exception('Failed to load monthly summary');
  }

  static Future<List<dynamic>> getCategorySpending({int periodMonths = 1}) async {
    final response = await _sendWithAuth((headers) {
      return http.get(Uri.parse('$baseUrl/financial/spending?periodMonths=$periodMonths'), headers: headers);
    });
    if (response.statusCode == 200) {
      return jsonDecode(response.body)['categorySpending'] ?? [];
    }
    throw Exception('Failed to load category spending');
  }

  static Future<Map<String, dynamic>> getSpendingTrends() async {
    final response = await _sendWithAuth((headers) {
      return http.get(Uri.parse('$baseUrl/financial/trends'), headers: headers);
    });
    if (response.statusCode == 200) {
      return jsonDecode(response.body)['trends'];
    }
    throw Exception('Failed to load trends');
  }

  /// Per-month income/spending history (oldest → newest) plus the top
  /// spending categories, for the Analytics screen's charts.
  static Future<Map<String, dynamic>> getMonthlyHistory({int months = 8}) async {
    final response = await _sendWithAuth((headers) {
      return http.get(Uri.parse('$baseUrl/financial/monthly-history?months=$months'),
          headers: headers);
    });
    if (response.statusCode == 200) {
      return jsonDecode(response.body) as Map<String, dynamic>;
    }
    throw Exception('Failed to load spending history: ${response.body}');
  }

  static Future<Map<String, dynamic>> getWhatChanged() async {
    final response = await _sendWithAuth((headers) {
      return http.get(Uri.parse('$baseUrl/financial/what-changed'), headers: headers);
    });
    if (response.statusCode == 200) {
      return jsonDecode(response.body)['whatChanged'];
    }
    throw Exception('Failed to load what changed');
  }

  static Future<Map<String, dynamic>> getRecurringPayments() async {
    final response = await _sendWithAuth((headers) {
      return http.get(Uri.parse('$baseUrl/financial/recurring'), headers: headers);
    });
    if (response.statusCode == 200) {
      return jsonDecode(response.body);
    }
    throw Exception('Failed to load recurring subscriptions');
  }

  static Future<Map<String, dynamic>> simulateEnhancedAffordability(double amount) async {
    final response = await _sendWithAuth((headers) {
      return http.post(
        Uri.parse('$baseUrl/financial/simulate-affordability'),
        headers: headers,
        body: jsonEncode({'amount': amount}),
      );
    });
    if (response.statusCode == 200) {
      return jsonDecode(response.body)['simulation'];
    }
    throw Exception('Failed to simulate affordability');
  }

  static Future<List<dynamic>> getFinancialInsights() async {
    final response = await _sendWithAuth((headers) {
      return http.get(Uri.parse('$baseUrl/financial/insights'), headers: headers);
    });
    if (response.statusCode == 200) {
      return jsonDecode(response.body)['insights'] ?? [];
    }
    throw Exception('Failed to load insights');
  }

  static Future<Map<String, dynamic>> getDailyFinancialBrief() async {
    final response = await _sendWithAuth((headers) {
      return http.get(Uri.parse('$baseUrl/financial/daily-brief'), headers: headers);
    });
    if (response.statusCode == 200) {
      return jsonDecode(response.body)['brief'];
    }
    throw Exception('Failed to load daily brief');
  }

  // ==========================================
  // PHASE 3 ADVANCED FINANCIAL INTELLIGENCE APIS
  // ==========================================

  static Future<Map<String, dynamic>> getBudgetsSummary() async {
    final response = await _sendWithAuth((headers) {
      return http.get(Uri.parse('$baseUrl/financial/budgets/summary'), headers: headers);
    });
    if (response.statusCode == 200) {
      return jsonDecode(response.body);
    }
    throw Exception('Failed to load budgets');
  }

  static Future<Map<String, dynamic>> getCashFlowForecast({int days = 30}) async {
    final response = await _sendWithAuth((headers) {
      return http.get(Uri.parse('$baseUrl/financial/cash-flow/forecast?days=$days'), headers: headers);
    });
    if (response.statusCode == 200) {
      return jsonDecode(response.body);
    }
    throw Exception('Failed to load cash flow forecast');
  }

  static Future<List<dynamic>> getFinancialCalendar({String filter = 'month'}) async {
    final response = await _sendWithAuth((headers) {
      return http.get(Uri.parse('$baseUrl/financial/calendar?filter=$filter'), headers: headers);
    });
    if (response.statusCode == 200) {
      return jsonDecode(response.body)['events'] ?? [];
    }
    throw Exception('Failed to load financial calendar');
  }

  static Future<Map<String, dynamic>> simulateSavings({String? goalId, double extraMonthly = 3000}) async {
    final response = await _sendWithAuth((headers) {
      return http.post(
        Uri.parse('$baseUrl/financial/savings/simulate'),
        headers: headers,
        body: jsonEncode({
          if (goalId != null) 'goalId': goalId,
          'extraMonthly': extraMonthly,
        }),
      );
    });
    if (response.statusCode == 200) {
      return jsonDecode(response.body)['simulation'];
    }
    throw Exception('Failed to simulate savings');
  }

  static Future<Map<String, dynamic>> getEmergencyFundPlan() async {
    final response = await _sendWithAuth((headers) {
      return http.get(Uri.parse('$baseUrl/financial/emergency-fund/plan'), headers: headers);
    });
    if (response.statusCode == 200) {
      return jsonDecode(response.body);
    }
    throw Exception('Failed to load emergency fund plan');
  }

  static Future<List<dynamic>> getAnomalies() async {
    final response = await _sendWithAuth((headers) {
      return http.get(Uri.parse('$baseUrl/financial/anomalies'), headers: headers);
    });
    if (response.statusCode == 200) {
      return jsonDecode(response.body)['anomalies'] ?? [];
    }
    throw Exception('Failed to load anomalies');
  }

  static Future<List<dynamic>> getDuplicateTransactions() async {
    final response = await _sendWithAuth((headers) {
      return http.get(Uri.parse('$baseUrl/financial/duplicates'), headers: headers);
    });
    if (response.statusCode == 200) {
      return jsonDecode(response.body)['duplicates'] ?? [];
    }
    throw Exception('Failed to load duplicate transactions');
  }

  static Future<Map<String, dynamic>> getFinancialHealthIndicators() async {
    final response = await _sendWithAuth((headers) {
      return http.get(Uri.parse('$baseUrl/financial/health-overview'), headers: headers);
    });
    if (response.statusCode == 200) {
      return jsonDecode(response.body);
    }
    throw Exception('Failed to load financial health indicators');
  }

  static Future<Map<String, dynamic>> simulateFinancialScenario(Map<String, dynamic> params) async {
    final response = await _sendWithAuth((headers) {
      return http.post(
        Uri.parse('$baseUrl/financial/simulate'),
        headers: headers,
        body: jsonEncode(params),
      );
    });
    if (response.statusCode == 200) {
      return jsonDecode(response.body)['simulation'];
    }
    throw Exception('Failed to simulate financial scenario');
  }

  static Future<List<dynamic>> getAlerts() async {
    final response = await _sendWithAuth((headers) {
      return http.get(Uri.parse('$baseUrl/financial/alerts'), headers: headers);
    });
    if (response.statusCode == 200) {
      return jsonDecode(response.body)['alerts'] ?? [];
    }
    throw Exception('Failed to load alerts');
  }

  static Future<Map<String, dynamic>> getDailyBriefV2() async {
    final response = await _sendWithAuth((headers) {
      return http.get(Uri.parse('$baseUrl/financial/daily-brief-v2'), headers: headers);
    });
    if (response.statusCode == 200) {
      return jsonDecode(response.body)['brief'];
    }
    throw Exception('Failed to load daily brief v2');
  }

  static Future<Map<String, dynamic>> getAdvancedOverview() async {
    final response = await _sendWithAuth((headers) {
      return http.get(Uri.parse('$baseUrl/financial/advanced-overview'), headers: headers);
    });
    if (response.statusCode == 200) {
      return jsonDecode(response.body);
    }
    throw Exception('Failed to load advanced overview');
  }

  // Legacy Dashboard Fallback
  static Future<Map<String, dynamic>> getDashboardSummary() async {
    return await getFinancialOverview();
  }

  // Accounts
  static Future<List<dynamic>> getAccounts() async {
    final response = await _sendWithAuth((headers) {
      return http.get(Uri.parse('$baseUrl/accounts'), headers: headers);
    });
    if (response.statusCode == 200) {
      return jsonDecode(response.body)['accounts'] ?? [];
    }
    throw Exception('Failed to fetch accounts');
  }

  static Future<void> syncAccount(String accountId) async {
    await _sendWithAuth((headers) {
      return http.post(
        Uri.parse('$baseUrl/accounts/$accountId/sync'),
        headers: headers,
      );
    });
  }

  static Future<Map<String, dynamic>> connectMockAccount(String institutionCode) async {
    final response = await _sendWithAuth((headers) {
      return http.post(
        Uri.parse('$baseUrl/accounts/connect-mock'),
        headers: headers,
        body: jsonEncode({'institutionCode': institutionCode}),
      );
    });
    return jsonDecode(response.body);
  }

  // Transactions
  static Future<List<dynamic>> getTransactions({String? type, String? category, String? search}) async {
    final queryParams = <String, String>{};
    if (type != null && type != 'ALL') queryParams['type'] = type;
    if (category != null) queryParams['category'] = category;
    if (search != null && search.isNotEmpty) queryParams['search'] = search;

    final uri = Uri.parse('$baseUrl/transactions').replace(queryParameters: queryParams);
    final response = await _sendWithAuth((headers) {
      return http.get(uri, headers: headers);
    });
    if (response.statusCode == 200) {
      return jsonDecode(response.body)['transactions'] ?? [];
    }
    throw Exception('Failed to load transactions');
  }

  /// Pushes scanned transactions to the centralized PostgreSQL server database
  static Future<int> syncTransactions(List<Transaction> transactions) async {
    if (transactions.isEmpty) return 0;
    try {
      final payload = transactions.map((t) => {
        'id': t.id,
        'amount': t.amount,
        'type': t.type == TransactionType.INCOME ? 'INCOME' : 'EXPENSE',
        'categoryId': t.category.toString().split('.').last.toLowerCase(),
        'merchant': t.merchant ?? t.receiver,
        'sender': t.sender,
        'receiver': t.receiver,
        'description': t.description,
        'paymentMethod': t.paymentMethod,
        'referenceId': t.referenceId,
        'status': t.status.toString().split('.').last.toUpperCase(),
        'timestamp': t.timestamp.toIso8601String(),
      }).toList();

      final response = await _sendWithAuth((headers) {
        return http.post(
          Uri.parse('$baseUrl/transactions/sync'),
          headers: headers,
          body: jsonEncode({'transactions': payload}),
        );
      });
      if (response.statusCode == 200) {
        final data = jsonDecode(response.body);
        return (data['count'] as num?)?.toInt() ?? 0;
      }
      return 0;
    } catch (e) {
      debugPrint('[ApiService] syncTransactions error: $e');
      return 0;
    }
  }

  // Payments & Affordability Simulation
  static Future<Map<String, dynamic>> simulateAffordability(double amount) async {
    return await simulateEnhancedAffordability(amount);
  }

  static Future<Map<String, dynamic>> sendPayment({
    required String recipient,
    required double amount,
    required String categoryId,
    String? note,
    required String idempotencyKey,
  }) async {
    final response = await _sendWithAuth((headers) {
      final finalHeaders = Map<String, String>.from(headers);
      finalHeaders['Idempotency-Key'] = idempotencyKey;
      return http.post(
        Uri.parse('$baseUrl/payments/initiate'),
        headers: finalHeaders,
        body: jsonEncode({
          'recipient': recipient,
          'amount': amount,
          'categoryId': categoryId,
          'note': note ?? '',
        }),
      );
    });
    final data = jsonDecode(response.body);
    if (response.statusCode == 200) {
      return data['payment'];
    }
    throw Exception(data['error'] ?? 'Payment failed');
  }

  // Savings & Emergency Fund
  static Future<Map<String, dynamic>> getEmergencyFund() async {
    final response = await _sendWithAuth((headers) {
      return http.get(Uri.parse('$baseUrl/savings/emergency-fund'), headers: headers);
    });
    return jsonDecode(response.body);
  }

  static Future<void> depositEmergencyFund(double amount) async {
    final response = await _sendWithAuth((headers) {
      return http.post(
        Uri.parse('$baseUrl/savings/emergency-fund/deposit'),
        headers: headers,
        body: jsonEncode({'amount': amount}),
      );
    });
    if (response.statusCode != 200) {
      final err = jsonDecode(response.body)['error'];
      throw Exception(err ?? 'Deposit failed');
    }
  }

  static Future<void> withdrawEmergencyFund(double amount, String reason, String pin) async {
    final response = await _sendWithAuth((headers) {
      return http.post(
        Uri.parse('$baseUrl/savings/emergency-fund/withdraw'),
        headers: headers,
        body: jsonEncode({'amount': amount, 'reason': reason, 'pin': pin}),
      );
    });
    if (response.statusCode != 200) {
      final err = jsonDecode(response.body)['error'];
      throw Exception(err ?? 'Withdrawal failed');
    }
  }

  static Future<void> toggleEmergencyLock(bool isLocked) async {
    await _sendWithAuth((headers) {
      return http.post(
        Uri.parse('$baseUrl/savings/emergency-fund/toggle-lock'),
        headers: headers,
        body: jsonEncode({'isLocked': isLocked}),
      );
    });
  }

  /// Device notification centre backing store (survives reinstall).
  static Future<List<dynamic>> getNotifications({int limit = 50}) async {
    final response = await _sendWithAuth((headers) {
      return http.get(
        Uri.parse('$baseUrl/notifications?limit=$limit'),
        headers: headers,
      );
    });
    if (response.statusCode != 200) return [];
    final decoded = jsonDecode(response.body);
    final list = decoded['notifications'];
    return list is List ? list : [];
  }

  static Future<void> markServerNotificationsRead() async {
    await _sendWithAuth((headers) {
      return http.post(
        Uri.parse('$baseUrl/notifications/read-all'),
        headers: headers,
      );
    });
  }

  static Future<List<dynamic>> getGoals() async {
    final response = await _sendWithAuth((headers) {
      return http.get(Uri.parse('$baseUrl/savings/goals'), headers: headers);
    });
    return jsonDecode(response.body)['goals'] ?? [];
  }

  static Future<void> addGoal(String name, double targetAmount, DateTime targetDate, double monthlyContribution, String category) async {
    await _sendWithAuth((headers) {
      return http.post(
        Uri.parse('$baseUrl/savings/goals'),
        headers: headers,
        body: jsonEncode({
          'name': name,
          'targetAmount': targetAmount,
          'targetDate': targetDate.toIso8601String().split('T')[0],
          'monthlyContribution': monthlyContribution,
          'category': category,
        }),
      );
    });
  }

  static Future<void> addGoalFunds(String goalId, double amount) async {
    await _sendWithAuth((headers) {
      return http.post(
        Uri.parse('$baseUrl/savings/goals/$goalId/add-funds'),
        headers: headers,
        body: jsonEncode({'amount': amount}),
      );
    });
  }

  // Bills & EMI
  static Future<Map<String, dynamic>> getBills() async {
    final response = await _sendWithAuth((headers) {
      return http.get(Uri.parse('$baseUrl/bills'), headers: headers);
    });
    return jsonDecode(response.body);
  }

  static Future<void> markBillPaid(String billId) async {
    await _sendWithAuth((headers) {
      return http.post(
        Uri.parse('$baseUrl/bills/mark-paid/$billId'),
        headers: headers,
      );
    });
  }

  // AI Financial Assistant
  /// Redact obvious PII (emails, phone/account-like digit runs) from the
  /// outbound query. The Privacy Center promises "Redacts account numbers and
  /// emails before sending queries to AI Copilot" — this makes that true
  /// instead of a decorative claim. Gated on the user's persisted toggle
  /// (`fp_pii_masking`, default ON).
  static Future<String> _maskPii(String query) async {
    try {
      final prefs = await SharedPreferences.getInstance();
      if (prefs.getBool('fp_pii_masking') ?? true) {
        var masked = query;
        // Email addresses
        masked = masked.replaceAll(RegExp(r'[\w.+-]+@[\w-]+\.[\w.]+'), '[email]');
        // Long digit runs (phone numbers, account numbers) — 6+ digits
        masked = masked.replaceAll(RegExp(r'\d{6,}'), '[number]');
        return masked;
      }
    } catch (_) {}
    return query;
  }

  static Future<Map<String, dynamic>> queryAI(String query) async {
    final maskedQuery = await _maskPii(query);
    final response = await _sendWithAuth((headers) {
      return http.post(
        Uri.parse('$baseUrl/ai/query'),
        headers: headers,
        body: jsonEncode({'query': maskedQuery}),
      );
    });
    if (response.statusCode == 200) {
      return jsonDecode(response.body)['response'];
    }
    throw Exception('AI query failed');
  }

  // Security Center
  static Future<List<dynamic>> getAuditLogs() async {
    final response = await _sendWithAuth((headers) {
      return http.get(Uri.parse('$baseUrl/security/audit-logs'), headers: headers);
    });
    return jsonDecode(response.body)['logs'] ?? [];
  }

  static Future<List<dynamic>> getDevices() async {
    final response = await _sendWithAuth((headers) {
      return http.get(Uri.parse('$baseUrl/security/devices'), headers: headers);
    });
    return jsonDecode(response.body)['devices'] ?? [];
  }

  static Future<void> revokeDevice(String deviceId) async {
    await _sendWithAuth((headers) {
      return http.post(
        Uri.parse('$baseUrl/security/devices/$deviceId/revoke'),
        headers: headers,
      );
    });
  }

  static Future<void> updateLimits({double? perTxnLimit, double? dailyLimit, double? monthlyLimit}) async {
    await _sendWithAuth((headers) {
      return http.post(
        Uri.parse('$baseUrl/security/update-limits'),
        headers: headers,
        body: jsonEncode({
          'perTxnLimit': perTxnLimit,
          'dailyLimit': dailyLimit,
          'monthlyLimit': monthlyLimit,
        }),
      );
    });
  }

  // Phase 5A: Financial Provider & Consent Integration
  static Future<Map<String, dynamic>> getProviderStatus() async {
    final response = await _sendWithAuth((headers) {
      return http.get(Uri.parse('$baseUrl/provider/status'), headers: headers);
    });
    if (response.statusCode == 200) {
      return jsonDecode(response.body);
    }
    return {
      'providerType': 'ACCOUNT_AGGREGATOR',
      'activeConsentsCount': 0,
      'connectedAccountsCount': 0,
      'freshnessStatus': 'NEVER_SYNCED',
      'lastSyncTime': null,
    };
  }

  static Future<Map<String, dynamic>> requestConsent({
    required String bankAccountId,
    List<String>? dataAccessTypes,
    int? durationDays,
  }) async {
    final response = await _sendWithAuth((headers) {
      return http.post(
        Uri.parse('$baseUrl/provider/consent/request'),
        headers: headers,
        body: jsonEncode({
          'bankAccountId': bankAccountId,
          'dataAccessTypes': dataAccessTypes ?? ['TRANSACTIONS', 'BALANCES', 'PROFILE'],
          'durationDays': durationDays ?? 365,
        }),
      );
    });
    return jsonDecode(response.body);
  }

  static Future<Map<String, dynamic>> revokeConsent(String consentId) async {
    final response = await _sendWithAuth((headers) {
      return http.post(
        Uri.parse('$baseUrl/provider/consent/revoke'),
        headers: headers,
        body: jsonEncode({'consentId': consentId}),
      );
    });
    return jsonDecode(response.body);
  }

  static Future<Map<String, dynamic>> syncProviderData() async {
    final response = await _sendWithAuth((headers) {
      final finalHeaders = Map<String, String>.from(headers);
      finalHeaders['Idempotency-Key'] = 'sync_${DateTime.now().millisecondsSinceEpoch}';
      return http.post(
        Uri.parse('$baseUrl/provider/sync'),
        headers: finalHeaders,
      );
    });
    return jsonDecode(response.body);
  }

  static Future<Map<String, dynamic>> unlinkAccount(String accountId) async {
    final response = await _sendWithAuth((headers) {
      return http.post(
        Uri.parse('$baseUrl/provider/unlink'),
        headers: headers,
        body: jsonEncode({'accountId': accountId}),
      );
    });
    return jsonDecode(response.body);
  }

  /// Stores the user's own UPI ID (from their PhonePe/GPay/Paytm) so Receive
  /// can build a QR from a VPA that actually exists. Returns the saved value,
  /// or throws with the server's validation message.
  static Future<String> setUpiId(String upiId) async {
    final response = await _sendWithAuth((headers) {
      return http.put(
        Uri.parse('$baseUrl/auth/upi-id'),
        headers: headers,
        body: jsonEncode({'upiId': upiId}),
      );
    });
    final decoded = jsonDecode(response.body) as Map<String, dynamic>;
    if (response.statusCode != 200 || decoded['success'] != true) {
      throw Exception(decoded['error']?.toString() ?? 'Could not save your UPI ID.');
    }
    return decoded['upiId']?.toString() ?? '';
  }

  // Setu Account Aggregator Integration Endpoints

  /// Root of the backend (without the `/api/v1` prefix) — health probes live there.
  static String get _rootUrl => baseUrl.replaceFirst(RegExp(r'/api/v1$'), '');

  /// Asks the backend whether an Account Aggregator (Setu) integration is
  /// enabled. Used to decide between the AA consent flow and the on-device
  /// SMS importer. Never assumed — always read from the live server.
  static Future<bool> isAaEnabled() async {
    try {
      final response = await http
          .get(Uri.parse('$_rootUrl/health/ready'))
          .timeout(const Duration(seconds: 6));
      if (response.statusCode != 200) return false;
      final decoded = jsonDecode(response.body) as Map<String, dynamic>;
      return decoded['aaEnabled'] == true;
    } catch (_) {
      return false;
    }
  }

  static Future<Map<String, dynamic>> requestSetuConsent(
    String institutionCode, {
    String? mobileNumber,
  }) async {
    final response = await _sendWithAuth((headers) {
      return http.post(
        Uri.parse('$baseUrl/setu/consent/request'),
        headers: headers,
        body: jsonEncode({
          'institutionCode': institutionCode,
          if (mobileNumber != null && mobileNumber.isNotEmpty)
            'mobileNumber': mobileNumber,
        }),
      );
    });
    return jsonDecode(response.body);
  }

  static Future<Map<String, dynamic>> getSetuConsentStatus(String consentHandle) async {
    final response = await _sendWithAuth((headers) {
      return http.get(
        Uri.parse('$baseUrl/setu/consent/status/$consentHandle'),
        headers: headers,
      );
    });
    return jsonDecode(response.body);
  }

  static Future<Map<String, dynamic>> syncSetuAccount(String accountId) async {
    final response = await _sendWithAuth((headers) {
      return http.post(
        Uri.parse('$baseUrl/setu/sync/$accountId'),
        headers: headers,
      );
    });
    return jsonDecode(response.body);
  }

  // Payment Gateway (Razorpay) Endpoints
  static Future<Map<String, dynamic>> createGatewayOrder({
    required double amount,
    required String recipient,
    String? note,
  }) async {
    final response = await _sendWithAuth((headers) {
      return http.post(
        Uri.parse('$baseUrl/payments/gateway/order'),
        headers: headers,
        body: jsonEncode({
          'amount': amount,
          'currency': 'INR',
          'recipient': recipient,
          'note': note ?? 'Payment via FinPocket Gateway',
        }),
      );
    });
    return jsonDecode(response.body);
  }

  static Future<Map<String, dynamic>> verifyGatewayPayment({
    required String orderId,
    required String paymentId,
    required String signature,
    required double amount,
    required String recipient,
    String? note,
  }) async {
    final response = await _sendWithAuth((headers) {
      return http.post(
        Uri.parse('$baseUrl/payments/gateway/verify'),
        headers: headers,
        body: jsonEncode({
          'orderId': orderId,
          'paymentId': paymentId,
          'signature': signature,
          'amount': amount,
          'recipient': recipient,
          'note': note,
        }),
      );
    });
    return jsonDecode(response.body);
  }
}
