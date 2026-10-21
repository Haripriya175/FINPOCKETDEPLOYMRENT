import 'dart:async';
import 'dart:convert';
import 'dart:math' as math;
import 'package:flutter/material.dart';
import 'package:flutter/foundation.dart' show kDebugMode;
import 'package:flutter/services.dart';
import 'package:shared_preferences/shared_preferences.dart';
import '../models/models.dart';
import '../l10n/translations.dart';
import '../services/api_service.dart';
import '../services/secure_vault_service.dart';
import '../services/tts_service.dart';
import '../services/security_auth_service.dart';
import '../services/daily_motivation_service.dart';
import '../services/system_notification_service.dart';
import '../widgets/sms_notification_overlay.dart';
import '../config/app_config.dart';
import '../core/errors/app_error.dart';
import '../services/local_transaction_storage_service.dart';
import '../services/bank_sms_parser_service.dart';
import '../services/subscription_radar_service.dart';
import '../services/emi_guidance_service.dart';
import '../core/storage/secure_token_storage.dart';

enum SpendImpactSeverity {
  safe,
  moderate,
  highImpact,
  impulseWarning,
}

class SpendImpactAnalysis {
  final double currentSafeToSpend;
  final double safeToSpendAfter;
  final double safeToSpendDropPercent;
  final int daysGoalDelayed;
  final String primaryGoalName;
  final SpendImpactSeverity severity;
  final String message;
  final bool requiresCoolingOff;

  SpendImpactAnalysis({
    required this.currentSafeToSpend,
    required this.safeToSpendAfter,
    required this.safeToSpendDropPercent,
    required this.daysGoalDelayed,
    required this.primaryGoalName,
    required this.severity,
    required this.message,
    required this.requiresCoolingOff,
  });
}

class SafeToSpendData {
  final double totalBalance;
  final double availableBalance;
  final double upcomingMandatoryBills;
  final double activeEmiObligations;
  final double committedSavings;
  final double emergencyReserveAllocation;
  final double safeToSpend;
  final double safeToSpendToday;
  final int remainingDaysInMonth;
  final String explanation;

  SafeToSpendData({
    this.totalBalance = 0.0,
    this.availableBalance = 0.0,
    this.upcomingMandatoryBills = 0.0,
    this.activeEmiObligations = 0.0,
    this.committedSavings = 0.0,
    this.emergencyReserveAllocation = 0.0,
    this.safeToSpend = 0.0,
    double? safeToSpendToday,
    int? remainingDaysInMonth,
    this.explanation = '',
  })  : remainingDaysInMonth = remainingDaysInMonth ??
            math.max(1, DateTime(DateTime.now().year, DateTime.now().month + 1, 0).day - DateTime.now().day + 1),
        safeToSpendToday = safeToSpendToday ??
            (totalBalance > 0
                ? (totalBalance /
                    math.max(1, DateTime(DateTime.now().year, DateTime.now().month + 1, 0).day - DateTime.now().day + 1))
                : 0.0);
}

class CommittedMoneyData {
  final double totalBalance;
  final double bills;
  final double subscriptions;
  final double emis;
  final double savingsCommitment;
  final double emergencyReserve;
  final double totalCommitted;
  final double remainingBuffer;
  final String explanation;

  CommittedMoneyData({
    this.totalBalance = 0.0,
    this.bills = 0.0,
    this.subscriptions = 0.0,
    this.emis = 0.0,
    this.savingsCommitment = 0.0,
    this.emergencyReserve = 0.0,
    this.totalCommitted = 0.0,
    this.remainingBuffer = 0.0,
    this.explanation = '',
  });
}

class DailyFinancialBriefData {
  final String greeting;
  final double availableBalance;
  final double safeToSpend;
  final double todayPaymentsTotal;
  final int todayPaymentsCount;
  final double next7DaysCommitmentsTotal;
  final double savingsThisMonth;
  final String attentionInsight;
  final String savingsGoalHighlight;

  DailyFinancialBriefData({
    this.greeting = 'Welcome back',
    this.availableBalance = 0.0,
    this.safeToSpend = 0.0,
    this.todayPaymentsTotal = 0.0,
    this.todayPaymentsCount = 0,
    this.next7DaysCommitmentsTotal = 0.0,
    this.savingsThisMonth = 0.0,
    this.attentionInsight = '',
    this.savingsGoalHighlight = '',
  });
}

class FinancialInsightData {
  final String id;
  final String type;
  final String title;
  final String explanation;
  final Map<String, dynamic> supportingValues;
  final double confidence;

  FinancialInsightData({
    required this.id,
    required this.type,
    required this.title,
    required this.explanation,
    this.supportingValues = const {},
    this.confidence = 0.95,
  });
}

class UpcomingPaymentData {
  final String id;
  final String name;
  final double amount;
  final String dueDate;
  final String category;
  final String paymentType;
  final bool isMandatory;
  final bool isRecurring;
  final int daysRemaining;

  UpcomingPaymentData({
    required this.id,
    required this.name,
    required this.amount,
    required this.dueDate,
    required this.category,
    required this.paymentType,
    this.isMandatory = true,
    this.isRecurring = true,
    this.daysRemaining = 0,
  });
}

class PendingPaymentData {
  final String id;
  final String recipient;
  final double amount;
  final String state;
  final String? note;
  final String createdAt;

  PendingPaymentData({
    required this.id,
    required this.recipient,
    required this.amount,
    required this.state,
    this.note,
    required this.createdAt,
  });
}

class AppState extends ChangeNotifier {
  AppState() {
    _setupAuthListener();
    _initDemoDefaultsIfAllowed();
    _initAsync();
  }

  void _setupAuthListener() {
    ApiService.onSessionExpired = () {
      _currentUser = null;
      _isDemoMode = false;
      _authError = 'Session expired. Please login again.';
      notifyListeners();
    };
  }

  void _initDemoDefaultsIfAllowed() {
    if (AppConfig.isDemo || AppConfig.environment == AppEnvironment.test) {
      // Seed demo fixtures for local UI preview and test harnesses
      _currentUser = User(
        userId: 'usr_fp_882910',
        fullName: 'Jithendra Sureddy',
        email: 'jithendra@finpocket.com',
        phone: '+91 98765 43210',
        createdAt: '2026-01-10T10:00:00Z',
      );
      _safeToSpend = SafeToSpendData(
        totalBalance: 57980.0,
        availableBalance: 57980.0,
        upcomingMandatoryBills: 2249.0,
        activeEmiObligations: 0.0,
        committedSavings: 35000.0,
        emergencyReserveAllocation: 5000.0,
        safeToSpend: 15731.0,
        explanation: 'Demo seed calculation initialized.',
      );
      _emergencyFund = EmergencyFund(
        id: 'emf_demo',
        userId: 'usr_fp_882910',
        targetAmount: 100000.0,
        currentAmount: 35000.0,
        isLocked: true,
        auditLog: [],
      );
      _documents.clear();
      _documents.addAll([
        DocumentItem(
          id: 'doc_aadhaar',
          name: 'Aadhaar National Identity',
          documentType: 'Aadhaar Card',
          maskedNumber: 'XXXX-XXXX-9842',
          fileType: 'image/png',
          uploadDate: DateTime.now().subtract(const Duration(days: 45)),
          isEncrypted: true,
        ),
        DocumentItem(
          id: 'doc_pan',
          name: 'Income Tax PAN Card',
          documentType: 'PAN Card',
          maskedNumber: 'ABCDE9842F',
          fileType: 'image/png',
          uploadDate: DateTime.now().subtract(const Duration(days: 30)),
          isEncrypted: true,
        ),
      ]);
      _isDemoMode = true;
    }
  }

  Future<void> _initAsync() async {
    if (AppConfig.environment == AppEnvironment.test) {
      _isAuthChecking = false;
      return;
    }

    _isAuthChecking = true;
    notifyListeners();

    // Debug-only local-storage health check. SharedPreferences is on the
    // critical path of every login (the pre-login data wipe), so a dead
    // platform channel there is indistinguishable from a bad password unless
    // we report it explicitly.
    if (kDebugMode) {
      unawaited(Future.delayed(const Duration(seconds: 3), () async {
        try {
          final prefs = await SharedPreferences.getInstance();
          debugPrint(
              '[AppState] Diag: SharedPreferences healthy (${prefs.getKeys().length} keys).');
        } catch (e) {
          debugPrint('[AppState] Diag: SharedPreferences UNAVAILABLE -> $e');
        }
      }));
    }

    try {
      await ApiService.initToken();
      await ApiService.discoverHost();
      // The credit-alert dedup memory must exist before the first
      // refreshAllData below, or every app start would re-alert old credits.
      await _loadNotifiedCreditIds();
      if (ApiService.authToken != null) {
        try {
          final meData = await ApiService.getMe();
          if (meData['user'] != null) {
            _currentUser = User.fromJson(meData['user']);
            await SecureTokenStorage.saveCachedUser(jsonEncode(meData['user']));
            _isDemoMode = false;
            await refreshAllData();
          }
        } catch (e) {
          debugPrint('[AppState] Stored session validation warning: $e');
          // If offline or momentary network hiccup, restore from cached user profile
          final cachedUserJson = await SecureTokenStorage.getCachedUser();
          if (cachedUserJson != null) {
            try {
              _currentUser = User.fromJson(jsonDecode(cachedUserJson));
              _isDemoMode = false;
            } catch (_) {}
          }
          // Only clear session on verified HTTP 401 unauthenticated
          if (e.toString().contains('401') || e.toString().contains('unauthorized')) {
            await ApiService.logout();
            _currentUser = null;
          }
        }
      } else {
        // Token was null in memory: check if cached session exists
        final cachedUserJson = await SecureTokenStorage.getCachedUser();
        if (cachedUserJson != null && (AppConfig.isDemo || AppConfig.environment == AppEnvironment.development)) {
          try {
            _currentUser = User.fromJson(jsonDecode(cachedUserJson));
            _isDemoMode = false;
          } catch (_) {}
        } else if (AppConfig.allowDemoAutoLogin && AppConfig.isDemo) {
          _isDemoMode = true;
        } else if (!AppConfig.isDemo && AppConfig.environment != AppEnvironment.test) {
          _currentUser = null;
          _isDemoMode = false;
        }
      }
      await _loadStoredNotifications();
      await _loadMinimumBudgetFloor();
      await _loadPersistedGoals();
      await _loadPersistedEmis();
      await _loadPersistedDocuments();
      await _runEmiGuidanceCheckup();
      await _checkDailyMotivationQuote();
      // The quote must change every day on its own, even if the app stays
      // open across midnight: a cheap 1-minute watcher re-runs the daily
      // check only when the calendar day actually rolls over.
      _lastQuoteDateStr = _todayKey();
      _quoteDateTimer?.cancel();
      _quoteDateTimer = Timer.periodic(const Duration(minutes: 1), (_) {
        _watchQuoteDate();
      });
      await SystemNotificationService().initialize();
      await SystemNotificationService().cancelAllNotifications();

      // Pre-fetch device contacts map so P2P payments resolve to real person names
      unawaited(BankSmsParserService.fetchContactsMap().then((_) => notifyListeners()));

      // Load local on-device bank transactions vault
      final localTxns = await LocalTransactionStorageService.loadLocalTransactions();
      if (localTxns.isNotEmpty) {
        _transactions = localTxns;
      }
      _lastSmsSyncTime = await LocalTransactionStorageService.getLastSmsSyncTime();

      // Load Stealth Mode, Round-Ups & Ghost Subscriptions
      await loadGhostSubscriptions();
      try {
        final prefs = await SharedPreferences.getInstance();
        _isStealthMode = prefs.getBool('fp_stealth_mode') ?? false;
        _accumulatedRoundUps = prefs.getDouble('fp_roundups_total') ?? 0.0;
        _roundUpTransactionsCount = prefs.getInt('fp_roundups_count') ?? 0;
        _roundUpSavingsEnabled = prefs.getBool('fp_roundups_enabled') ?? true;
        _isSoundboxEnabled = prefs.getBool('fp_soundbox_enabled') ?? true;
        // Restore Child Care (payment-blocking) safety mode across restarts.
        _childCare.enabled = prefs.getBool('fp_childcare_enabled') ?? false;
        // User pay budget & spending limit
        _userPayIncome = prefs.getDouble(_prefPayIncomeKey);
        _userPaySpendLimit = prefs.getDouble(_prefPaySpendLimitKey);
        await loadCreditCardStatements();
        await loadGamificationData();
        // Opening the app counts as today's check-in for the daily streak.
        await evaluateDailyStreak();
      } catch (_) {}

      // Balance the bank itself last stated in an SMS on this device. Loaded
      // first so the Total Balance card is already real on the first frame for
      // users whose money lives in a bank that never linked via AA.
      await _loadSmsReportedBalance();
      _applySmsBalanceOverlay();

      // Automatic silent bank-SMS sync so the salary/credit heads-up fires
      // without the user having to open History. Consent-gated; a no-op for
      // users who never enabled SMS import (and skipped entirely in tests).
      // May bail out here if the session is not restored yet — refreshAllData
      // retries it as soon as the session is live.
      _ensureFreshSmsMirror();
      _smsAutoSyncTimer?.cancel();
      _smsAutoSyncTimer = Timer.periodic(const Duration(minutes: 10), (_) {
        unawaited(_silentSmsSyncIfConsented());
      });

      // Event-driven sync: a native inbox observer pings Dart the moment a
      // bank SMS arrives, so a fresh transaction (and its credit heads-up)
      // appears automatically — the user never presses "Sync SMS".
      if (AppConfig.environment != AppEnvironment.test) {
        unawaited(_watchIncomingBankSms());
      }
    } catch (e) {
      // Startup must never die with an unhandled exception: one unavailable
      // plugin would otherwise take out every later init step (and the whole
      // first-run experience) instead of degrading gracefully.
      debugPrint('[AppState] Startup init warning: $e');
    } finally {
      _isAuthChecking = false;
      notifyListeners();
    }
  }

  // Theme & Language
  ThemeMode _themeMode = ThemeMode.dark;
  ThemeMode get themeMode => _themeMode;

  SupportedLanguage _language = SupportedLanguage.en;
  SupportedLanguage get language => _language;

  // Auth State
  User? _currentUser;
  User? get currentUser => _currentUser;

  /// Applies a freshly-saved real UPI ID so the Receive QR updates immediately
  /// instead of waiting for the next full refresh.
  Future<void> applyUpiId(String upiId) async {
    if (_currentUser == null || upiId.isEmpty) return;
    _currentUser = _currentUser!.copyWith(upiId: upiId);
    notifyListeners();
  }
  bool _isDemoMode = false;
  bool get isDemoMode => _isDemoMode;

  bool _isAuthChecking = true;
  bool get isAuthChecking => _isAuthChecking;

  String? _authError;
  String? get authError => _authError;

  String? _unlinkedEmailForLinking;
  String? get unlinkedEmailForLinking => _unlinkedEmailForLinking;
  void clearUnlinkedEmail() {
    _unlinkedEmailForLinking = null;
    notifyListeners();
  }

  bool get isAuthenticated => _currentUser != null && !_isDemoMode;
  bool get hasAccess => _currentUser != null || _isDemoMode;

  // Loading, Caching & Error state
  bool _isLoading = false;
  bool get isLoading => _isLoading;

  bool _isLoaded = false;
  bool get isLoaded => _isLoaded;

  bool _isCached = false;
  bool get isCached => _isCached;

  bool _hasError = false;
  bool get hasError => _hasError;

  String? _errorMessage;
  String? get errorMessage => _errorMessage;

  DateTime? _lastSynced;
  DateTime? get lastSynced => _lastSynced;

  // Authoritative Financial Models
  SafeToSpendData _safeToSpend = SafeToSpendData();
  SafeToSpendData get safeToSpend => _safeToSpend;

  CommittedMoneyData _commitments = CommittedMoneyData();
  CommittedMoneyData get commitments => _commitments;

  DailyFinancialBriefData _dailyBrief = DailyFinancialBriefData();
  DailyFinancialBriefData get dailyBrief => _dailyBrief;

  List<FinancialInsightData> _insights = [];
  List<FinancialInsightData> get insights => _insights;

  List<UpcomingPaymentData> _upcomingPayments = [];
  List<UpcomingPaymentData> get upcomingPayments => _upcomingPayments;

  List<PendingPaymentData> _pendingPayments = [];
  List<PendingPaymentData> get pendingPayments => _pendingPayments;

  // Child Care Mode
  final ChildCareSettings _childCare = ChildCareSettings();
  ChildCareSettings get childCare => _childCare;
  bool get isChildCareActive => _childCare.enabled;

  // Bank Accounts
  List<BankAccount> _bankAccounts = [];
  List<BankAccount> get bankAccounts => _bankAccounts;

  // Transactions
  List<Transaction> _transactions = [];
  List<Transaction> get transactions => _transactions;

  // Local Vault & Bank SMS Sync State
  bool _isSmsSyncing = false;
  bool get isSmsSyncing => _isSmsSyncing;

  DateTime? _lastSmsSyncTime;
  DateTime? get lastSmsSyncTime => _lastSmsSyncTime;

  bool _isLocalVaultActive = true;
  bool get isLocalVaultActive => _isLocalVaultActive;

  // 1. Ghost / Stealth Mode (Privacy Screen in Public)
  bool _isStealthMode = false;
  bool get isStealthMode => _isStealthMode;

  void toggleStealthMode() async {
    _isStealthMode = !_isStealthMode;
    notifyListeners();
    try {
      final prefs = await SharedPreferences.getInstance();
      await prefs.setBool('fp_stealth_mode', _isStealthMode);
    } catch (_) {}
  }

  String maskCurrency(double amount) {
    if (_isStealthMode) return '₹ ••••••';
    return '₹${amount.toStringAsFixed(0)}';
  }

  String maskText(String text) {
    if (_isStealthMode) return '••••••';
    return text;
  }

  // 2. Smart Impulse Guard & Spend Impact Predictor
  bool _impulseGuardEnabled = true;
  double _impulseThreshold = 1500.0;
  bool get impulseGuardEnabled => _impulseGuardEnabled;
  double get impulseThreshold => _impulseThreshold;

  void setImpulseGuard({bool? enabled, double? threshold}) {
    if (enabled != null) _impulseGuardEnabled = enabled;
    if (threshold != null) _impulseThreshold = threshold;
    notifyListeners();
  }

  SpendImpactAnalysis analyzeSpendImpact(double amount, {TransactionCategory? category}) {
    final currentSafe = _safeToSpend.safeToSpend > 0 ? _safeToSpend.safeToSpend : totalAvailableBalance;
    final afterSafe = math.max(0.0, currentSafe - amount);
    final dropPercent = currentSafe > 0 ? ((amount / currentSafe) * 100).clamp(0.0, 100.0) : 100.0;

    String goalName = _savingsGoals.isNotEmpty ? _savingsGoals.first.title : 'Emergency Reserve';
    final estimatedDailySavings = math.max(50.0, currentSafe / 60);
    final daysDelayed = (amount / estimatedDailySavings).round();

    final isDiscretionary = category == TransactionCategory.Shopping ||
        category == TransactionCategory.Entertainment;

    SpendImpactSeverity severity = SpendImpactSeverity.safe;
    String message = 'Safe to spend within your current budget buffer.';
    bool coolingOff = false;

    if (amount >= _impulseThreshold && isDiscretionary) {
      severity = SpendImpactSeverity.impulseWarning;
      coolingOff = true;
      message = 'Large discretionary purchase! Drops safety buffer by ${dropPercent.toStringAsFixed(0)}% and delays "$goalName" by ~$daysDelayed days.';
    } else if (dropPercent > 50 || amount > currentSafe) {
      severity = SpendImpactSeverity.highImpact;
      message = 'High impact spend! Dips deeply into planned funds. Delays "$goalName" by ~$daysDelayed days.';
    } else if (dropPercent > 20) {
      severity = SpendImpactSeverity.moderate;
      message = 'Noticeable impact on safe-to-spend buffer (-${dropPercent.toStringAsFixed(0)}%).';
    }

    return SpendImpactAnalysis(
      currentSafeToSpend: currentSafe,
      safeToSpendAfter: afterSafe,
      safeToSpendDropPercent: dropPercent,
      daysGoalDelayed: daysDelayed,
      primaryGoalName: goalName,
      severity: severity,
      message: message,
      requiresCoolingOff: coolingOff && _impulseGuardEnabled,
    );
  }

  // 3. Autonomous UPI Round-Up Vault (Spare Change Micro-Savings)
  bool _roundUpSavingsEnabled = true;
  final int _roundUpStep = 10;
  double _accumulatedRoundUps = 0.0;
  int _roundUpTransactionsCount = 0;

  bool get roundUpSavingsEnabled => _roundUpSavingsEnabled;
  int get roundUpStep => _roundUpStep;
  double get accumulatedRoundUps => _accumulatedRoundUps;
  int get roundUpTransactionsCount => _roundUpTransactionsCount;

  Future<void> toggleRoundUpSavings(bool enabled) async {
    _roundUpSavingsEnabled = enabled;
    notifyListeners();
    // Persist the toggle — without this it silently reverted to ON after every
    // app restart, so a user who turned Round-Ups off kept seeing them on.
    try {
      final prefs = await SharedPreferences.getInstance();
      await prefs.setBool('fp_roundups_enabled', enabled);
    } catch (_) {}
  }

  double calculateRoundUp(double amount) {
    if (!_roundUpSavingsEnabled || amount <= 0) return 0.0;
    final nextMultiple = (amount / _roundUpStep).ceil() * _roundUpStep;
    final diff = nextMultiple == amount ? _roundUpStep.toDouble() : (nextMultiple - amount);
    return diff;
  }

  Future<double> applyRoundUpForPayment(double amount) async {
    if (!_roundUpSavingsEnabled || amount <= 0) return 0.0;
    final spare = calculateRoundUp(amount);
    _accumulatedRoundUps += spare;
    _roundUpTransactionsCount += 1;
    notifyListeners();
    try {
      final prefs = await SharedPreferences.getInstance();
      await prefs.setDouble('fp_roundups_total', _accumulatedRoundUps);
      await prefs.setInt('fp_roundups_count', _roundUpTransactionsCount);
    } catch (_) {}
    return spare;
  }

  Future<void> withdrawRoundUpVaultToBank() async {
    if (_accumulatedRoundUps <= 0) return;
    final amount = _accumulatedRoundUps;
    _accumulatedRoundUps = 0.0;
    _safeToSpend = SafeToSpendData(
      totalBalance: _safeToSpend.totalBalance + amount,
      availableBalance: _safeToSpend.availableBalance + amount,
      upcomingMandatoryBills: _safeToSpend.upcomingMandatoryBills,
      activeEmiObligations: _safeToSpend.activeEmiObligations,
      committedSavings: _safeToSpend.committedSavings,
      emergencyReserveAllocation: _safeToSpend.emergencyReserveAllocation,
      safeToSpend: _safeToSpend.safeToSpend + amount,
      explanation: 'Withdrew Round-Up micro-savings into available bank balance.',
    );
    notifyListeners();
    try {
      final prefs = await SharedPreferences.getInstance();
      await prefs.setDouble('fp_roundups_total', 0.0);
    } catch (_) {}
  }

  // 4. Ghost Subscription & Auto-Debit Radar
  List<GhostSubscription> _ghostSubscriptions = [];
  List<GhostSubscription> get ghostSubscriptions => _ghostSubscriptions;

  Future<void> loadGhostSubscriptions() async {
    _ghostSubscriptions = await SubscriptionRadarService.detectSubscriptions(transactions: _transactions);
    notifyListeners();
  }

  Future<void> removeGhostSubscription(String id) async {
    _ghostSubscriptions = await SubscriptionRadarService.deleteSubscription(id);
    notifyListeners();
  }

  // 5. On-Device UPI Audio Soundbox (Paytm / PhonePe Soundbox Style)
  bool _isSoundboxEnabled = true;
  bool get isSoundboxEnabled => _isSoundboxEnabled;

  Future<void> toggleSoundbox() async {
    _isSoundboxEnabled = !_isSoundboxEnabled;
    notifyListeners();
    try {
      final prefs = await SharedPreferences.getInstance();
      await prefs.setBool('fp_soundbox_enabled', _isSoundboxEnabled);
    } catch (_) {}
  }

  Future<void> announceSoundbox({
    required double amount,
    required String party,
    required bool isCredit,
  }) async {
    if (!_isSoundboxEnabled) return;
    try {
      HapticFeedback.heavyImpact();
    } catch (_) {}
    final text = _ttsService.getSoundboxNarration(
      lang: _language,
      amount: amount,
      party: party,
      isCredit: isCredit,
    );
    _isSpeaking = true;
    notifyListeners();
    await _ttsService.speak(text, _language);
    _isSpeaking = false;
    notifyListeners();
  }

  /// Honest confirmation spoken when the user turns the Pocket Soundbox on.
  /// (The old code narrated a fabricated "₹250 Swiggy debit" as if a real
  /// transaction had just happened.)
  Future<void> announceSoundboxActivated() async {
    try {
      HapticFeedback.lightImpact();
    } catch (_) {}
    await _ttsService.speak(t('soundboxActivated'), _language);
  }

  // 6. Credit Card Statements & "Minimum Due Trap" Buster
  List<CreditCardStatement> _creditCardStatements = [];
  List<CreditCardStatement> get creditCardStatements => _creditCardStatements;

  Future<void> loadCreditCardStatements() async {
    try {
      final prefs = await SharedPreferences.getInstance();
      final savedStr = prefs.getString('fp_credit_cards');
      if (savedStr != null && savedStr.isNotEmpty) {
        final decoded = jsonDecode(savedStr) as List<dynamic>;
        // Drop the two cards the app used to auto-seed on first launch. Phones
        // that ran an older build still have them in storage, and they render
        // beside the user's real HDFC account as a duplicate bank carrying an
        // invented ₹24,500 balance. Persisting the cleaned list so the key can
        // never resurrect them.
        const legacySeededFakes = {'cc_hdfc_4821', 'cc_sbi_1098'};
        _creditCardStatements = decoded
            .map((e) => CreditCardStatement.fromJson(e as Map<String, dynamic>))
            .where((c) => !legacySeededFakes.contains(c.id))
            .toList();
        await _saveCreditCards();
      } else {
        // No cards on file. This used to seed a fake "HDFC Bank Millennia
        // ₹24,500 due" and "SBI SimplyCLICK ₹12,800" for every new install,
        // which then showed up next to the user's real HDFC account as a
        // duplicate bank with a contradictory balance. Cards appear here only
        // once the user adds one.
        _creditCardStatements = [];
        await _saveCreditCards();
      }
    } catch (e) {
      debugPrint('[AppState] Error loading credit cards: $e');
    }
    notifyListeners();
  }

  Future<void> _saveCreditCards() async {
    try {
      final prefs = await SharedPreferences.getInstance();
      final encoded = jsonEncode(_creditCardStatements.map((e) => e.toJson()).toList());
      await prefs.setString('fp_credit_cards', encoded);
    } catch (_) {}
  }

  Future<void> markCreditCardPaid(String id) async {
    final idx = _creditCardStatements.indexWhere((c) => c.id == id);
    if (idx != -1) {
      final stmt = _creditCardStatements[idx];
      _creditCardStatements[idx] = CreditCardStatement(
        id: stmt.id,
        bankName: stmt.bankName,
        cardLast4: stmt.cardLast4,
        totalAmountDue: stmt.totalAmountDue,
        minimumAmountDue: stmt.minimumAmountDue,
        dueDate: stmt.dueDate,
        statementDate: stmt.statementDate,
        aprRate: stmt.aprRate,
        isPaid: true,
        paymentVpa: stmt.paymentVpa,
      );
      await _saveCreditCards();
      notifyListeners();
      await announceSoundbox(
        amount: stmt.totalAmountDue,
        party: '${stmt.bankName} Credit Card',
        isCredit: false,
      );
    }
  }

  Future<void> addCreditCardStatement(CreditCardStatement stmt) async {
    final existingIdx = _creditCardStatements.indexWhere(
      (c) => c.cardLast4 == stmt.cardLast4 && c.bankName == stmt.bankName,
    );
    if (existingIdx != -1) {
      _creditCardStatements[existingIdx] = stmt;
    } else {
      _creditCardStatements.add(stmt);
    }
    await _saveCreditCards();
    notifyListeners();
  }

  // 7. No-Spend Streak & Gamification Milestones
  NoSpendStreakData _streakData = NoSpendStreakData();
  NoSpendStreakData get streakData => _streakData;

  List<GamificationBadge> _badges = [];
  List<GamificationBadge> get badges => _badges;

  Future<void> loadGamificationData() async {
    try {
      final prefs = await SharedPreferences.getInstance();
      final savedStreak = prefs.getString('fp_streak_data');
      if (savedStreak != null) {
        _streakData = NoSpendStreakData.fromJson(jsonDecode(savedStreak));
      } else {
        // Real-data rule: a fresh streak starts at 0 with no badges — never
        // a prefabricated 4-day streak with pre-unlocked awards.
        _streakData = NoSpendStreakData();
      }

      _badges = [
        GamificationBadge(
          id: 'impulse_shield',
          title: 'Impulse Shield',
          description: 'Stayed strictly below Safe-to-Spend limit without impulse purchases.',
          icon: '🛡️',
          isUnlocked: _streakData.unlockedBadgeIds.contains('impulse_shield'),
        ),
        GamificationBadge(
          id: 'weekend_warrior',
          title: 'Weekend Warrior',
          description: 'Zero discretionary impulse spending over Saturday and Sunday.',
          icon: '⚡',
          isUnlocked: _streakData.unlockedBadgeIds.contains('weekend_warrior'),
        ),
        GamificationBadge(
          id: 'roundup_master',
          title: 'Round-Up Titan',
          description: 'Accumulated ₹100+ in autonomous UPI spare-change micro-savings.',
          icon: '🪙',
          isUnlocked: _streakData.unlockedBadgeIds.contains('roundup_master') || _accumulatedRoundUps >= 100,
        ),
        GamificationBadge(
          id: 'budget_zen',
          title: 'Budget Zen (7-Day Streak)',
          description: 'Maintained 7 consecutive disciplined days without overspending.',
          icon: '💎',
          isUnlocked: _streakData.unlockedBadgeIds.contains('budget_zen') || _streakData.bestStreak >= 7,
        ),
        GamificationBadge(
          id: 'streak_3',
          title: 'Streak Spark (3 Days)',
          description: 'Kept the daily streak alive for 3 days in a row.',
          icon: '🌱',
          isUnlocked: _streakData.unlockedBadgeIds.contains('streak_3') || _streakData.bestStreak >= 3,
        ),
        GamificationBadge(
          id: 'streak_14',
          title: 'Fortnight Flame (14 Days)',
          description: 'Kept the daily streak alive for 14 days in a row.',
          icon: '🔥',
          isUnlocked: _streakData.unlockedBadgeIds.contains('streak_14') || _streakData.bestStreak >= 14,
        ),
        GamificationBadge(
          id: 'streak_30',
          title: 'Monthly Master (30 Days)',
          description: 'Kept the daily streak alive for a full 30 days.',
          icon: '🏆',
          isUnlocked: _streakData.unlockedBadgeIds.contains('streak_30') || _streakData.bestStreak >= 30,
        ),
        GamificationBadge(
          id: 'streak_60',
          title: 'Diamond Discipline (60 Days)',
          description: 'Kept the daily streak alive for 60 days in a row.',
          icon: '💠',
          isUnlocked: _streakData.unlockedBadgeIds.contains('streak_60') || _streakData.bestStreak >= 60,
        ),
        GamificationBadge(
          id: 'streak_100',
          title: 'Century Legend (100 Days)',
          description: 'Kept the daily streak alive for 100 days in a row.',
          icon: '👑',
          isUnlocked: _streakData.unlockedBadgeIds.contains('streak_100') || _streakData.bestStreak >= 100,
        ),
        GamificationBadge(
          id: 'fortress_builder',
          title: 'Fortress Builder',
          description: 'Built a 25%+ funded emergency safety fund.',
          icon: '🏰',
          isUnlocked: _streakData.unlockedBadgeIds.contains('fortress_builder') || _emergencyFund.currentAmount > 10000,
        ),
      ];
    } catch (e) {
      debugPrint('[AppState] Error loading gamification data: $e');
    }
    notifyListeners();
  }

  /// Snapchat-style daily streak: every calendar day the user opens the app
  /// (and stays within Safe-to-Spend) extends the streak by one. A single
  /// fully-missed calendar day breaks it back to 0 — there is no catch-up.
  /// Milestone awards unlock at 3 / 7 / 14 / 30 / 60 / 100 days.
  static const Map<String, int> _streakMilestones = {
    'streak_3': 3,
    'budget_zen': 7,
    'streak_14': 14,
    'streak_30': 30,
    'streak_60': 60,
    'streak_100': 100,
  };

  Future<void> evaluateDailyStreak() async {
    final now = DateTime.now();
    final today = _todayKey();
    if (_streakData.lastEvaluatedDate == today) return;

    // Missed-day detection: any calendar day strictly between the last
    // evaluation and today that was never evaluated breaks the streak.
    int newStreak = _streakData.currentStreak;
    bool lostStreak = false;
    final last = DateTime.tryParse(_streakData.lastEvaluatedDate);
    if (last == null) {
      // No history (e.g. first run after the fabricated seed was removed).
      newStreak = 0;
    } else {
      final gap = DateTime(now.year, now.month, now.day)
          .difference(DateTime(last.year, last.month, last.day))
          .inDays;
      if (gap > 1 && newStreak > 0) {
        newStreak = 0;
        lostStreak = true;
      }
    }

    final isWithinBudget = _safeToSpend.safeToSpend >= 0;
    int newBest = _streakData.bestStreak;
    int newTotal = _streakData.totalDisciplinedDays;
    final unlocked = List<String>.from(_streakData.unlockedBadgeIds);

    if (isWithinBudget) {
      newStreak += 1;
      newTotal += 1;
      if (newStreak > newBest) newBest = newStreak;
      if (!unlocked.contains('impulse_shield')) unlocked.add('impulse_shield');
      _streakMilestones.forEach((id, days) {
        if (newStreak >= days && !unlocked.contains(id)) unlocked.add(id);
      });
      if (_accumulatedRoundUps >= 100 && !unlocked.contains('roundup_master')) unlocked.add('roundup_master');
      if (_emergencyFund.currentAmount >= 10000 && !unlocked.contains('fortress_builder')) unlocked.add('fortress_builder');
    } else {
      if (newStreak > 0) lostStreak = true;
      newStreak = 0;
    }

    _streakData = NoSpendStreakData(
      currentStreak: newStreak,
      bestStreak: newBest,
      lastEvaluatedDate: today,
      totalDisciplinedDays: newTotal,
      unlockedBadgeIds: unlocked,
    );

    try {
      final prefs = await SharedPreferences.getInstance();
      await prefs.setString('fp_streak_data', jsonEncode(_streakData.toJson()));
    } catch (_) {}

    if (lostStreak) {
      addNotification(
        AppNotification(
          id: 'streak_lost_${now.millisecondsSinceEpoch}',
          title: '🔥 Daily streak lost',
          message: 'You missed a day, so the streak restarted at 0 — open FinPocket every day to build it back up and win milestone awards.',
          type: NotificationType.system,
          timestamp: now,
          data: const {'kind': 'streak_lost'},
        ),
      );
    }

    await loadGamificationData();
  }

  // Emergency Fund
  EmergencyFund _emergencyFund = EmergencyFund(
    id: 'emf_default',
    userId: '',
    targetAmount: 0.0,
    currentAmount: 0.0,
    isLocked: false,
    auditLog: [],
  );
  EmergencyFund get emergencyFund => _emergencyFund;

  // Savings Goals
  List<SavingsGoal> _savingsGoals = [];
  List<SavingsGoal> get savingsGoals => _savingsGoals;

  // Convenience aliases for Financial OS features
  List<BankAccount> get accounts => _bankAccounts;
  List<SavingsGoal> get goals => _savingsGoals;

  // Bills & EMI
  final List<RecurringPayment> _bills = [];
  List<RecurringPayment> get bills => _bills;

  // EMIs are persisted locally: they drive a month-by-month guidance loop and
  // must survive an app restart, which previously they did not.
  final List<EMILoan> _emis = [];
  List<EMILoan> get emis => _emis;

  /// EMIs that still need guiding — the loop stops once this is empty.
  List<EMILoan> get activeEmis => _emis.where((e) => !e.isCleared).toList();

  static const String _prefEmisKey = 'finpocket_emis_v1';
  static const String _prefGoalsKey = 'finpocket_savings_goals_v1';

  void addEmiLoan(EMILoan emi) {
    _emis.add(emi);
    _persistEmis();
    notifyListeners();
  }

  void removeEmiLoan(String emiId) {
    _emis.removeWhere((e) => e.id == emiId);
    _persistEmis();
    notifyListeners();
  }

  void toggleEmiPaidStatus(String emiId) {
    final idx = _emis.indexWhere((e) => e.id == emiId);
    if (idx != -1) {
      final old = _emis[idx];
      _emis[idx] = EMILoan(
        id: old.id,
        loanName: old.loanName,
        totalAmount: old.totalAmount,
        monthlyEMI: old.monthlyEMI,
        totalTenureMonths: old.totalTenureMonths,
        paidMonths: old.isPaidThisMonth ? math.max(0, old.paidMonths - 1) : old.paidMonths + 1,
        remainingAmount: old.isPaidThisMonth ? old.remainingAmount + old.monthlyEMI : math.max(0, old.remainingAmount - old.monthlyEMI),
        interestRate: old.interestRate,
        nextDueDate: old.nextDueDate,
        isPaidThisMonth: !old.isPaidThisMonth,
      );
      _persistEmis();
      notifyListeners();
      _maybeCelebrateClearedEmi(idx);
    }
  }

  /// Fires a one-off congratulation the moment the last EMI is cleared.
  void _maybeCelebrateClearedEmi(int index) {
    final emi = _emis[index];
    if (!emi.isCleared || activeEmis.isNotEmpty) return;
    addNotification(
      AppNotification(
        id: 'emi_cleared_${DateTime.now().millisecondsSinceEpoch}',
        title: '🎉 All EMIs cleared!',
        message:
            'Your ₹${emi.monthlyEMI.toStringAsFixed(0)} ${emi.loanName} is fully paid. '
            'Redirect that amount to your savings goals from next month.',
        type: NotificationType.system,
        timestamp: DateTime.now(),
      ),
    );
  }

  Future<void> _persistEmis() async {
    try {
      final prefs = await SharedPreferences.getInstance();
      await prefs.setStringList(
        _prefEmisKey,
        _emis.map((e) => jsonEncode(e.toJson())).toList(),
      );
    } catch (e) {
      debugPrint('[AppState] Failed persisting EMIs: $e');
    }
  }

  Future<void> _loadPersistedEmis() async {
    try {
      final prefs = await SharedPreferences.getInstance();
      final raw = prefs.getStringList(_prefEmisKey) ?? const [];
      final parsed = raw
          .map((s) => EMILoan.fromJson(jsonDecode(s) as Map<String, dynamic>))
          .toList();
      if (parsed.isNotEmpty) {
        _emis
          ..clear()
          ..addAll(parsed);
      }
    } catch (e) {
      debugPrint('[AppState] Failed loading EMIs: $e');
    }
  }

  Future<void> _persistGoals() async {
    try {
      final prefs = await SharedPreferences.getInstance();
      await prefs.setStringList(
        _prefGoalsKey,
        _savingsGoals.map((g) => jsonEncode(g.toJson())).toList(),
      );
    } catch (e) {
      debugPrint('[AppState] Failed persisting savings goals: $e');
    }
  }

  Future<void> _loadPersistedGoals() async {
    try {
      final prefs = await SharedPreferences.getInstance();
      final raw = prefs.getStringList(_prefGoalsKey) ?? const [];
      final parsed = raw
          .map((s) => SavingsGoal.fromJson(jsonDecode(s) as Map<String, dynamic>))
          .toList();
      if (parsed.isNotEmpty) {
        _savingsGoals
          ..clear()
          ..addAll(parsed);
      }
    } catch (e) {
      debugPrint('[AppState] Failed loading savings goals: $e');
    }
  }

  void addSavingsGoal(SavingsGoal goal) {
    _savingsGoals.add(goal);
    _persistGoals();
    notifyListeners();
    _pushGoalToServer(goal);
  }

  bool depositToSavingsGoal(String goalId, double amount) {
    if (amount <= 0 || amount > totalAvailableBalance) return false;
    final idx = _savingsGoals.indexWhere((g) => g.id == goalId);
    if (idx != -1) {
      final old = _savingsGoals[idx];
      old.currentAmount += amount;
      if (old.currentAmount >= old.targetAmount) {
        old.status = 'COMPLETED';
      }
      if (_bankAccounts.isNotEmpty) {
        _bankAccounts[0].availableBalance = math.max(0, _bankAccounts[0].availableBalance - amount);
      }
      _persistGoals();
      notifyListeners();
      _pushGoalFundsToServer(goalId, amount);
      return true;
    }
    return false;
  }

  /// Best-effort server sync for a locally created goal. The local copy is
  /// already durable, so a network failure must never roll the UI back.
  Future<void> _pushGoalToServer(SavingsGoal goal) async {
    try {
      await ApiService.addGoal(
        goal.name,
        goal.targetAmount,
        goal.targetDate,
        goal.monthlyContribution,
        goal.category,
      );
    } catch (e) {
      debugPrint('[AppState] Goal create not synced to server: $e');
    }
  }

  Future<void> _pushGoalFundsToServer(String goalId, double amount) async {
    try {
      await ApiService.addGoalFunds(goalId, amount);
    } catch (e) {
      debugPrint('[AppState] Goal deposit not synced to server: $e');
    }
  }

  // Documents (Secure Vault)
  final List<DocumentItem> _documents = [];
  List<DocumentItem> get documents => _documents;

  // Notifications & Motivation System
  static const String _prefNotificationsKey = 'finpocket_app_notifications_v1';
  static const String _prefMinBudgetKey = 'finpocket_min_budget_floor_v1';

  /// User-configured minimum balance floor; 0 means "derive from bill due".
  double _minBudgetFloorOverride = 0;
  final List<AppNotification> _notifications = [];
  List<AppNotification> get notifications => List.unmodifiable(_notifications);
  int get unreadNotificationCount => _notifications.where((n) => !n.isRead).length;

  SavingsQuote? _todayMotivationQuote;
  SavingsQuote? get todayMotivationQuote => _todayMotivationQuote;

  Future<void> _loadStoredNotifications() async {
    try {
      final prefs = await SharedPreferences.getInstance();
      final rawList = prefs.getStringList(_prefNotificationsKey);
      if (rawList != null && rawList.isNotEmpty) {
        _notifications.clear();
        for (final str in rawList) {
          try {
            final parsed = AppNotification.fromJson(jsonDecode(str) as Map<String, dynamic>);
            _notifications.add(parsed);
          } catch (_) {}
        }
        notifyListeners();
      }
    } catch (e) {
      debugPrint('[AppState] Failed loading stored notifications: $e');
    }
  }

  /// Pulls alerts raised outside this device (server-side anomaly screening)
  /// into the local notification centre. Existing local entries win, and an
  /// incoming item whose title+message already exists locally is skipped so the
  /// same event never appears twice.
  Future<void> _syncServerNotifications() async {
    try {
      final raw = await ApiService.getNotifications();
      if (raw.isEmpty) return;

      final knownIds = _notifications.map((n) => n.id).toSet();
      final knownContent =
          _notifications.map((n) => '${n.title} ${n.message}').toSet();
      var changed = false;

      for (final item in raw) {
        if (item is! Map) continue;
        final id = item['id']?.toString() ?? '';
        final title = item['title']?.toString() ?? 'Alert';
        final body = item['body']?.toString() ?? '';
        if (id.isEmpty || knownIds.contains(id)) continue;
        if (knownContent.contains('$title $body')) continue;

        _notifications.add(AppNotification(
          id: id,
          title: title,
          message: body,
          type: _notificationTypeFrom(item['type']?.toString()),
          timestamp: DateTime.tryParse(item['created_at']?.toString() ?? '') ??
              DateTime.now(),
          isRead: item['is_read'] == true || item['is_read'] == 1,
        ));
        changed = true;
      }

      if (!changed) return;
      _notifications.sort((a, b) => b.timestamp.compareTo(a.timestamp));
      if (_notifications.length > 50) {
        _notifications.removeRange(50, _notifications.length);
      }
      _persistNotifications();
      notifyListeners();
    } catch (e) {
      debugPrint('[AppState] Server notification sync failed: $e');
    }
  }

  NotificationType _notificationTypeFrom(String? raw) {
    switch (raw) {
      case 'sms':
        return NotificationType.sms;
      case 'budgetAlert':
        return NotificationType.budgetAlert;
      case 'dailyQuote':
        return NotificationType.dailyQuote;
      case 'security':
        return NotificationType.security;
      case 'emiReminder':
        return NotificationType.emiReminder;
      default:
        return NotificationType.system;
    }
  }

  /// Runs the month-by-month EMI coaching loop. Safe to call often — the
  /// service de-duplicates per launch and per (EMI, month).
  Future<void> _runEmiGuidanceCheckup() async {
    try {
      await EmiGuidanceService.runCheckup(
        emis: _emis,
        notify: (notification) => addNotification(notification),
      );
    } catch (e) {
      debugPrint('[AppState] EMI guidance checkup failed: $e');
    }
  }

  Future<void> _loadMinimumBudgetFloor() async {
    try {
      final prefs = await SharedPreferences.getInstance();
      _minBudgetFloorOverride = prefs.getDouble(_prefMinBudgetKey) ?? 0.0;
    } catch (e) {
      debugPrint('[AppState] Failed loading minimum budget floor: $e');
    }
  }

  Future<void> _persistNotifications() async {
    try {
      final prefs = await SharedPreferences.getInstance();
      final stringList = _notifications.take(50).map((n) => jsonEncode(n.toJson())).toList();
      await prefs.setStringList(_prefNotificationsKey, stringList);
    } catch (e) {
      debugPrint('[AppState] Failed persisting notifications: $e');
    }
  }

  void addNotification(AppNotification notification, {BuildContext? overlayContext}) {
    _notifications.insert(0, notification);
    _persistNotifications();
    notifyListeners();
    if (overlayContext != null) {
      SmsNotificationOverlay.show(overlayContext, notification);
    }
    // Real system notification (status bar, lockscreen, heads-up outside the app)
    SystemNotificationService().postNotification(notification);
  }

  // ─── Unusual transaction detection ────────────────────────────────────────

  /// Guards against the same anomaly being announced twice: the Payments screen
  /// and the ledger both evaluate every payment, and a user should see one
  /// alert per event, not two.
  String? _lastUnusualKey;
  DateTime? _lastUnusualAt;

  /// Pure heuristic — no side effects. Returns a human-readable reason when a
  /// payment looks wrong, otherwise `null`.
  String? evaluateUnusualTransaction({
    required String recipient,
    required double amount,
  }) {
    if (amount <= 0) return null;

    final totalBal = totalAvailableBalance;
    final now = DateTime.now();

    // Relative check needs a meaningful absolute size too, otherwise a small
    // balance makes every ordinary payment look anomalous.
    final isLargeRelative = totalBal > 0 && amount >= 1000 && (amount / totalBal) > 0.5;
    final isAbsoluteLarge = amount >= 20000;
    final recentSameRecipient = _transactions
        .where((t) =>
            t.receiver.toLowerCase().contains(recipient.toLowerCase()) &&
            t.timestamp.isAfter(now.subtract(const Duration(hours: 24))))
        .length;
    final isRepeatedTransfer = recentSameRecipient >= 3;

    if (isLargeRelative) {
      return 'Payment is more than half of your total balance.';
    }
    if (isAbsoluteLarge) {
      return 'Unusually large payment of ₹${amount.toStringAsFixed(0)}.';
    }
    if (isRepeatedTransfer) {
      return 'Transferred to $recipient 3+ times in the last 24 hours.';
    }
    return null;
  }

  /// Runs the heuristic and, when it trips, raises the alert through every
  /// channel available on-device: the in-app notification centre, the floating
  /// HUD banner, and the OS notification shade. The alert carries a
  /// `channels: [app, whatsapp, sms]` payload so the UI can offer one-tap
  /// escalation.
  ///
  /// Returns the reason (already announced) or `null` when nothing was wrong.
  String? flagUnusualTransaction({
    required String recipient,
    required double amount,
    BuildContext? overlayContext,
  }) {
    final reason = evaluateUnusualTransaction(
      recipient: recipient,
      amount: amount,
    );
    if (reason == null) return null;

    final key = '$recipient|$amount';
    final at = _lastUnusualAt;
    if (_lastUnusualKey == key &&
        at != null &&
        DateTime.now().difference(at).inSeconds < 10) {
      // Already announced moments ago for this exact payment.
      return reason;
    }
    _lastUnusualKey = key;
    _lastUnusualAt = DateTime.now();

    addNotification(
      AppNotification(
        id: 'unusual_${DateTime.now().millisecondsSinceEpoch}',
        title: '🚨 Unusual Transaction Detected',
        message: reason,
        type: NotificationType.security,
        timestamp: DateTime.now(),
        data: {
          'recipient': recipient,
          'amount': amount,
          'reason': reason,
          'channels': ['app', 'whatsapp', 'sms'],
        },
      ),
      overlayContext: overlayContext,
    );
    return reason;
  }

  void markAllNotificationsAsRead() {
    for (final n in _notifications) {
      n.isRead = true;
    }
    _persistNotifications();
    notifyListeners();
    // Best-effort: keep the server-side copy in sync so a reinstall does not
    // resurface everything as unread.
    ApiService.markServerNotificationsRead().catchError((e) {
      debugPrint('[AppState] Failed syncing read state to server: $e');
      return null;
    });
  }

  void clearAllNotifications() {
    _notifications.clear();
    _persistNotifications();
    notifyListeners();
  }

  Future<void> _checkDailyMotivationQuote() async {
    try {
      final res = await DailyMotivationService.checkAndDeliverDailyQuote();
      final quote = res['quote'] as SavingsQuote;
      _todayMotivationQuote = quote;
      _lastQuoteDateStr = _todayKey();
      notifyListeners();
    } catch (e) {
      debugPrint('[AppState] Daily motivation check notice: $e');
    }
  }

  Future<void> shuffleDailyMotivationQuote() async {
    try {
      final next = await DailyMotivationService.getNextQuote();
      _todayMotivationQuote = next;
      notifyListeners();
    } catch (e) {
      debugPrint('[AppState] Shuffle daily motivation quote notice: $e');
    }
  }

  double _getCategoryBudgetCap(TransactionCategory category) {
    switch (category) {
      case TransactionCategory.Food:
        return 5000.0;
      case TransactionCategory.Travel:
        return 3000.0;
      case TransactionCategory.Bills:
        return 3000.0;
      case TransactionCategory.Shopping:
        return 4000.0;
      case TransactionCategory.Entertainment:
        return 2000.0;
      default:
        return 3000.0;
    }
  }

  /// Saves a document to the Personal Document Vault.
  ///
  /// The list entry persisted in SharedPreferences holds only low-sensitivity
  /// metadata (type, masked number, dates). The FULL number, holder details
  /// and the scanned image are sealed into an AES-256-GCM blob by
  /// [SecureVaultService] — so the vault must already be unlocked with the
  /// user's PIN, otherwise this throws and NOTHING is added to the list (we
  /// never record a document we failed to encrypt).
  Future<bool> addDocument({
    required String name,
    required String documentType,
    String? documentNumber,
    String? holderName,
    String? dateOfBirth,
    String? gender,
    Uint8List? imageBytes,
    DateTime? expiryDate,
  }) async {
    final id = 'doc_${DateTime.now().millisecondsSinceEpoch}';
    final number = (documentNumber != null && documentNumber.trim().isNotEmpty)
        ? documentNumber.trim()
        : null;
    final hasImage = imageBytes != null && imageBytes.isNotEmpty;

    // Seal the real contents FIRST — if encryption fails we must not add a
    // list entry claiming a document exists.
    await SecureVaultService.instance.sealBlob(
      id: id,
      documentType: documentType,
      fullNumber: number,
      holderName: holderName,
      dateOfBirth: dateOfBirth,
      gender: gender,
      expiryDate: expiryDate,
      imageBytes: imageBytes,
    );

    String masked = '•••• ••••';
    if (number != null) {
      final clean = number.replaceAll(RegExp(r'[^0-9A-Za-z]'), '');
      if (clean.length > 4) {
        masked = 'XXXX-XXXX-${clean.substring(clean.length - 4)}';
      } else {
        masked = 'XXXX-XXXX-$clean';
      }
    }

    final newDoc = DocumentItem(
      id: id,
      name: name,
      documentType: documentType,
      maskedNumber: masked,
      expiryDate: expiryDate,
      fileType: hasImage ? 'image/jpeg' : 'text/plain',
      uploadDate: DateTime.now(),
      isEncrypted: true,
      hasImage: hasImage,
    );

    _documents.insert(0, newDoc);
    notifyListeners();
    _persistDocuments();
    return true;
  }

  /// Removes a document from the list AND destroys its encrypted blob, so no
  /// ciphertext is left behind after a delete.
  Future<void> deleteDocument(String id) async {
    _documents.removeWhere((d) => d.id == id);
    notifyListeners();
    _persistDocuments();
    try {
      await SecureVaultService.instance.deleteBlob(id);
    } catch (e) {
      debugPrint('[AppState] Failed deleting vault blob: $e');
    }
  }

  /// Persist vault document metadata. (Documents added via `addDocument` were
  /// never saved, so every uploaded document silently vanished on app restart.)
  Future<void> _persistDocuments() async {
    try {
      final prefs = await SharedPreferences.getInstance();
      await prefs.setStringList(
        'fp_vault_docs',
        _documents
            .where((d) => !d.id.startsWith('doc_aadhaar') && !d.id.startsWith('doc_pan') && !d.id.startsWith('doc_passport'))
            .map((d) => jsonEncode(d.toJson()))
            .toList(),
      );
    } catch (e) {
      debugPrint('[AppState] Failed persisting vault documents: $e');
    }
  }

  Future<void> _loadPersistedDocuments() async {
    try {
      final prefs = await SharedPreferences.getInstance();
      final raw = prefs.getStringList('fp_vault_docs') ?? const [];
      final parsed = raw
          .map((s) => DocumentItem.fromJson(jsonDecode(s) as Map<String, dynamic>))
          .toList();
      if (parsed.isNotEmpty) {
        // Insert user documents after the demo seed entries (which are only
        // present in demo mode) without duplicating any already-loaded doc.
        final existingIds = _documents.map((d) => d.id).toSet();
        for (final doc in parsed) {
          if (!existingIds.contains(doc.id)) _documents.add(doc);
        }
      }
    } catch (e) {
      debugPrint('[AppState] Failed loading vault documents: $e');
    }
  }

  // Audit Logs & Security
  List<dynamic> _auditLogs = [];
  List<dynamic> get auditLogs => _auditLogs;

  List<dynamic> _devices = [];
  List<dynamic> get devices => _devices;

  // Dynamic Calculated Getters
  double get totalAvailableBalance => _safeToSpend.availableBalance;

  /// The amount the user must never let their balance fall below.
  ///
  /// Explicitly set values win; otherwise it defaults to the mandatory bills
  /// still owed this cycle, so a floor exists even before the user configures
  /// one. Used by the pre-payment guard to warn before money leaves rather
  /// than after the account is already overdrawn.
  double get minimumBudgetFloor {
    if (_minBudgetFloorOverride > 0) return _minBudgetFloorOverride;
    return _safeToSpend.upcomingMandatoryBills;
  }

  bool get hasCustomMinimumBudget => _minBudgetFloorOverride > 0;

  /// Whether paying [amount] would leave the account under [minimumBudgetFloor].
  bool wouldCrossMinimumBudget(double amount) {
    if (amount <= 0) return false;
    final floor = minimumBudgetFloor;
    if (floor <= 0) return false;
    if (amount > totalAvailableBalance) return true;
    return (totalAvailableBalance - amount) < floor;
  }

  Future<void> setMinimumBudgetFloor(double value) async {
    _minBudgetFloorOverride = value < 0 ? 0 : value;
    try {
      final prefs = await SharedPreferences.getInstance();
      await prefs.setDouble(_prefMinBudgetKey, _minBudgetFloorOverride);
    } catch (e) {
      debugPrint('[AppState] Failed persisting minimum budget floor: $e');
    }
    notifyListeners();
  }

  double get totalSavings => _emergencyFund.currentAmount + _savingsGoals.fold(0.0, (sum, g) => sum + g.currentAmount);

  // ─── User-Configured Pay Spending Limit & Allocation ───────────────────
  static const String _prefPayIncomeKey = 'finpocket_user_pay_income_v1';
  static const String _prefPaySpendLimitKey = 'finpocket_user_pay_spend_limit_v1';

  double? _userPayIncome;
  double? _userPaySpendLimit;

  double? get userPayIncome => _userPayIncome;
  double? get userPaySpendLimit => _userPaySpendLimit;

  /// Amount designated to be transferred to other sections (Savings, Emergency Fund, Vault, etc.)
  double get surplusForOtherSections {
    if (_userPayIncome != null && _userPaySpendLimit != null) {
      final surplus = _userPayIncome! - _userPaySpendLimit!;
      return surplus > 0 ? surplus : 0.0;
    }
    return 0.0;
  }

  /// Whether paying [amount] would exceed the user's configured pay spending limit for this month
  bool wouldExceedPaySpendLimit(double amount) {
    if (_userPaySpendLimit == null || _userPaySpendLimit! <= 0) return false;
    return (thisMonthSpent + amount) > _userPaySpendLimit!;
  }

  /// Remaining amount the user can spend this month before hitting their pay limit
  double get remainingPaySpendBudget {
    if (_userPaySpendLimit == null) return 0.0;
    final rem = _userPaySpendLimit! - thisMonthSpent;
    return rem > 0 ? rem : 0.0;
  }

  /// Percentage of the pay spending limit that has been used up so far this month
  double get paySpendUsagePercent {
    if (_userPaySpendLimit == null || _userPaySpendLimit! <= 0) return 0.0;
    return (thisMonthSpent / _userPaySpendLimit!).clamp(0.0, 1.0);
  }

  Future<void> setUserPayBudget({
    required double income,
    required double spendLimit,
  }) async {
    _userPayIncome = income > 0 ? income : null;
    _userPaySpendLimit = spendLimit > 0 ? spendLimit : null;
    try {
      final prefs = await SharedPreferences.getInstance();
      if (_userPayIncome != null) {
        await prefs.setDouble(_prefPayIncomeKey, _userPayIncome!);
      } else {
        await prefs.remove(_prefPayIncomeKey);
      }
      if (_userPaySpendLimit != null) {
        await prefs.setDouble(_prefPaySpendLimitKey, _userPaySpendLimit!);
      } else {
        await prefs.remove(_prefPaySpendLimitKey);
      }
    } catch (e) {
      debugPrint('[AppState] Failed persisting user pay budget: $e');
    }
    notifyListeners();
  }

  Future<void> clearUserPayBudget() async {
    _userPayIncome = null;
    _userPaySpendLimit = null;
    try {
      final prefs = await SharedPreferences.getInstance();
      await prefs.remove(_prefPayIncomeKey);
      await prefs.remove(_prefPaySpendLimitKey);
    } catch (_) {}
    notifyListeners();
  }

  double get thisMonthSpent => _transactions
      .where((t) => t.type == TransactionType.EXPENSE && t.timestamp.month == DateTime.now().month && t.timestamp.year == DateTime.now().year)
      .fold(0.0, (sum, t) => sum + t.amount);

  double get thisMonthIncome => _transactions
      .where((t) => t.type == TransactionType.INCOME && t.timestamp.month == DateTime.now().month && t.timestamp.year == DateTime.now().year)
      .fold(0.0, (sum, t) => sum + t.amount);

  double get thisMonthSaved => thisMonthIncome > thisMonthSpent ? thisMonthIncome - thisMonthSpent : 0.0;
  double get thisMonthNetCashFlow => thisMonthIncome - thisMonthSpent;

  // Translation helper
  String t(String key) => Translations.tr(_language, key);

  void setLanguage(SupportedLanguage lang) {
    _language = lang;
    notifyListeners();
  }

  final TtsService _ttsService = TtsService();
  bool _voiceGuidanceEnabled = false;
  bool _isSpeaking = false;

  bool get voiceGuidanceEnabled => _voiceGuidanceEnabled;
  bool get isSpeaking => _isSpeaking;

  void toggleVoiceGuidance() {
    _voiceGuidanceEnabled = !_voiceGuidanceEnabled;
    notifyListeners();
    if (_voiceGuidanceEnabled) {
      speakHomeNarration();
    } else {
      stopSpeaking();
    }
  }

  Future<void> speakHomeNarration() async {
    final name = _currentUser?.fullName.split(' ').first ?? 'User';
    final text = _ttsService.getHomeNarration(
      lang: _language,
      balance: totalAvailableBalance,
      safeToSpend: _safeToSpend.safeToSpendToday,
      remainingDays: _safeToSpend.remainingDaysInMonth,
      emergencyFund: _emergencyFund.currentAmount,
      name: name,
    );
    _isSpeaking = true;
    notifyListeners();
    await _ttsService.speak(text, _language);
    _isSpeaking = false;
    notifyListeners();
  }

  Future<void> speakPaymentNarration() async {
    final text = _ttsService.getPaymentNarration(
      lang: _language,
      balance: totalAvailableBalance,
    );
    _isSpeaking = true;
    notifyListeners();
    await _ttsService.speak(text, _language);
    _isSpeaking = false;
    notifyListeners();
  }

  Future<void> speakPaymentSuccessNarration(double amount, String recipient) async {
    final text = _ttsService.getPaymentSuccessNarration(
      lang: _language,
      amount: amount,
      recipient: recipient,
    );
    _isSpeaking = true;
    notifyListeners();
    await _ttsService.speak(text, _language);
    _isSpeaking = false;
    notifyListeners();
  }

  Future<void> speakSavingsNarration() async {
    final text = _ttsService.getSavingsNarration(
      lang: _language,
      current: _emergencyFund.currentAmount,
      target: _emergencyFund.targetAmount,
      isLocked: _emergencyFund.isLocked,
    );
    _isSpeaking = true;
    notifyListeners();
    await _ttsService.speak(text, _language);
    _isSpeaking = false;
    notifyListeners();
  }

  Future<void> speakVaultNarration() async {
    final text = _ttsService.getVaultNarration(
      lang: _language,
      docCount: _documents.length,
    );
    _isSpeaking = true;
    notifyListeners();
    await _ttsService.speak(text, _language);
    _isSpeaking = false;
    notifyListeners();
  }

  TtsVoicePersona get ttsVoicePersona => _ttsService.currentPersona;

  Future<void> setTtsVoicePersona(TtsVoicePersona persona) async {
    await _ttsService.setVoicePersona(persona);
    notifyListeners();
  }

  String? _currentSpeakingTopic;
  String? get currentSpeakingTopic => _currentSpeakingTopic;

  Future<void> speakFeatureTopic(String topicKey) async {
    if (_isSpeaking && _currentSpeakingTopic == topicKey) {
      await stopSpeaking();
      return;
    }
    await _ttsService.stop();
    _currentSpeakingTopic = topicKey;
    _isSpeaking = true;
    notifyListeners();

    final text = _ttsService.getSingleFeatureExplanation(
      featureKey: topicKey,
      lang: _language,
      balance: totalAvailableBalance,
      safeToSpend: _safeToSpend.safeToSpend,
    );
    await _ttsService.speak(text, _language);
    _isSpeaking = false;
    _currentSpeakingTopic = null;
    notifyListeners();
  }

  Future<void> speakFeaturesExplanation() async {
    final name = _currentUser?.fullName.split(' ').first ?? 'User';
    final text = _ttsService.getFeaturesExplanation(
      lang: _language,
      balance: totalAvailableBalance,
      safeToSpend: _safeToSpend.safeToSpend,
      name: name,
    );
    _currentSpeakingTopic = 'all_features';
    _isSpeaking = true;
    notifyListeners();
    await _ttsService.speak(text, _language);
    _isSpeaking = false;
    _currentSpeakingTopic = null;
    notifyListeners();
  }

  Future<void> stopSpeaking() async {
    await _ttsService.stop();
    _isSpeaking = false;
    _currentSpeakingTopic = null;
    notifyListeners();
  }

  void toggleTheme() {
    _themeMode = _themeMode == ThemeMode.dark ? ThemeMode.light : ThemeMode.dark;
    notifyListeners();
  }

  void clearAuthError() {
    _authError = null;
    notifyListeners();
  }

  static String _sanitizeAuthError(dynamic e) {
    final str = e.toString();
    // Never surface this to a user, but never lose it either: without the raw
    // text in the debug log every auth failure collapses to the same generic
    // banner and becomes impossible to diagnose.
    if (kDebugMode) debugPrint('[AppState] Auth failure (raw): $str');

    // Authored, human-readable messages (ours or our backend's) are safe to
    // show verbatim and must never be scrubbed by the pattern heuristics below.
    if (e is AppError && e.message.trim().isNotEmpty) {
      return e.message.trim();
    }

    // A platform channel that never connected means the local persistence
    // layer is unavailable. This is an on-device fault, not a credential
    // problem, so say so instead of blaming the user's login attempt.
    if (str.contains('channel-error') || str.contains('SharedPreferencesApi')) {
      return 'FinPocket could not read this device\'s local storage. Please force-close the app and reopen it, then try again.';
    }

    if (str.contains('SocketException') ||
        str.contains('Connection refused') ||
        str.contains('ClientException') ||
        str.contains('Failed host lookup') ||
        str.contains('Connection timed out') ||
        str.contains('TimeoutException') ||
        str.contains('Future not completed') ||
        str.contains('errno = 111')) {
      return 'Unable to reach the FinPocket server. Please check your connection and try again, or explore Demo Sandbox.';
    }
    if (str.contains('clientConfigurationError') ||
        str.contains('serverClientId') ||
        str.contains('GoogleSignInException')) {
      return 'Google Sign-In requires OAuth configuration in Google Cloud Console for this device. Please sign in with Email & Password or use the Demo Sandbox.';
    }
    // Never surface raw Dart exception internals (e.g. "TimeoutException after
    // 0:00:02.000000: Future not completed") to the user. Keep known-safe,
    // human-readable messages; otherwise fall back to a generic notice.
    final cleaned = str.replaceAll('Exception:', '').trim();
    final looksRaw = RegExp(r'(Exception|Error)\b|0:00:\d|Future not completed|#[0-9]+')
        .hasMatch(cleaned);
    if (looksRaw || cleaned.isEmpty) {
      return 'Something went wrong. Please try again.';
    }
    return cleaned;
  }

  void _initDemoData() {
    _safeToSpend = SafeToSpendData(
      totalBalance: 57980.0,
      availableBalance: 57980.0,
      upcomingMandatoryBills: 2249.0,
      activeEmiObligations: 0.0,
      committedSavings: 35000.0,
      emergencyReserveAllocation: 5000.0,
      safeToSpend: 15731.0,
      explanation: 'Demo seed calculation initialized.',
    );
    _emergencyFund = EmergencyFund(
      id: 'emf_demo',
      userId: _currentUser?.userId ?? 'usr_demo',
      targetAmount: 100000.0,
      currentAmount: 35000.0,
      isLocked: true,
      auditLog: [],
    );

    // Seed distinct bank accounts with their own real-looking individual balances
    _bankAccounts = [
      BankAccount(
        id: 'bnk_demo_hdfc',
        bankName: 'HDFC Bank',
        accountType: 'SALARY',
        maskedAccountNumber: '•••• 4821',
        availableBalance: 38250.0,
        isPrimary: true,
        providerType: 'MOCK',
        freshnessStatus: 'CURRENT',
        lastSynced: DateTime.now(),
      ),
      BankAccount(
        id: 'bnk_demo_sbi',
        bankName: 'State Bank of India',
        accountType: 'SAVINGS',
        maskedAccountNumber: '•••• 7302',
        availableBalance: 14730.0,
        isPrimary: false,
        providerType: 'MOCK',
        freshnessStatus: 'CURRENT',
        lastSynced: DateTime.now().subtract(const Duration(minutes: 47)),
      ),
      BankAccount(
        id: 'bnk_demo_icici',
        bankName: 'ICICI Bank',
        accountType: 'CURRENT',
        maskedAccountNumber: '•••• 0956',
        availableBalance: 5000.0,
        isPrimary: false,
        providerType: 'MOCK',
        freshnessStatus: 'STALE',
        lastSynced: DateTime.now().subtract(const Duration(hours: 3, minutes: 12)),
      ),
    ];

    // Seed realistic custom savings goals (beyond emergency shield)
    final now = DateTime.now();
    _savingsGoals = [
      SavingsGoal(
        id: 'goal_demo_bike',
        userId: _currentUser?.userId ?? 'usr_demo',
        name: 'Royal Enfield Meteor 350',
        targetAmount: 200000.0,
        currentAmount: 42000.0,
        targetDate: now.add(const Duration(days: 365)),
        monthlyContribution: 8000.0,
        category: '🏍️ Vehicle',
        status: 'IN_PROGRESS',
        createdAt: now.subtract(const Duration(days: 90)),
      ),
      SavingsGoal(
        id: 'goal_demo_laptop',
        userId: _currentUser?.userId ?? 'usr_demo',
        name: 'MacBook Pro M3',
        targetAmount: 150000.0,
        currentAmount: 25500.0,
        targetDate: now.add(const Duration(days: 240)),
        monthlyContribution: 12500.0,
        category: '💻 Electronics',
        status: 'IN_PROGRESS',
        createdAt: now.subtract(const Duration(days: 45)),
      ),
      SavingsGoal(
        id: 'goal_demo_goa',
        userId: _currentUser?.userId ?? 'usr_demo',
        name: 'Goa Trip (December)',
        targetAmount: 35000.0,
        currentAmount: 18000.0,
        targetDate: now.add(const Duration(days: 80)),
        monthlyContribution: 5500.0,
        category: '✈️ Travel',
        status: 'IN_PROGRESS',
        createdAt: now.subtract(const Duration(days: 30)),
      ),
    ];
  }


  // ==========================================
  // AUTHENTICATION FLOWS
  // ==========================================

  Future<bool> login(String email, String password) async {
    _isLoading = true;
    _authError = null;
    notifyListeners();

    try {
      // Defense-in-depth: wipe any previous user's cached data before
      // fetching the new user's. Covers force-kills that skip logout.
      await clearAllLocalUserData();

      final res = await ApiService.login(email, password);
      if (res['user'] != null) {
        _currentUser = User.fromJson(res['user']);
        await SecureTokenStorage.saveCachedUser(jsonEncode(res['user']));
        await SecureTokenStorage.saveLastUser(email);
        _isDemoMode = false;
        await refreshAllData();
        return true;
      }
      _authError = 'Invalid server response';
      return false;
    } catch (e) {
      _authError = _sanitizeAuthError(e);
      return false;
    } finally {
      _isLoading = false;
      notifyListeners();
    }
  }

  /// Federated Google Sign-In with cryptographic ID token validation
  Future<bool> loginWithGoogle({bool promptAccountChooser = false}) async {
    _isLoading = true;
    _authError = null;
    _unlinkedEmailForLinking = null;
    notifyListeners();

    try {
      // Defense-in-depth: wipe any previous user's cached data before
      // fetching the new user's. Covers force-kills that skip logout.
      await clearAllLocalUserData();

      final googleResult = await SecurityAuthService.authenticateGoogle(
        promptAccountChooser: promptAccountChooser,
      );

      if (!googleResult.success) {
        if (googleResult.error == 'Google Sign-In was cancelled.' ||
            googleResult.error?.contains('canceled') == true ||
            googleResult.error?.contains('cancelled') == true) {
          _isLoading = false;
          _authError = null;
          notifyListeners();
          return false;
        }
        _authError = googleResult.error ?? 'Google Sign-In was not completed.';
        return false;
      }

      if (googleResult.idToken == null || googleResult.idToken!.isEmpty) {
        _authError = 'No valid Google ID token received from authentication provider.';
        return false;
      }

      final res = await ApiService.googleLogin(
        idToken: googleResult.idToken!,
      );

      if (res['user'] != null) {
        _currentUser = User.fromJson(res['user']);
        await SecureTokenStorage.saveCachedUser(jsonEncode(res['user']));
        await SecureTokenStorage.saveLastUser(_currentUser!.email);
        _isDemoMode = false;
        await refreshAllData();
        return true;
      }

      _authError = 'Google authentication response invalid.';
      return false;
    } on AccountExistsUnlinkedError catch (e) {
      _unlinkedEmailForLinking = e.email;
      _authError = e.message;
      return false;
    } catch (e) {
      _authError = _sanitizeAuthError(e);
      return false;
    } finally {
      _isLoading = false;
      notifyListeners();
    }
  }

  /// Backward compatible wrapper
  Future<bool> loginWithSSO(
    String provider, {
    required String email,
    String? name,
    String? phone,
    String? idToken,
  }) async {
    final prov = provider.toLowerCase();
    if (prov == 'google') {
      return loginWithGoogle();
    } else if (prov == 'facebook' || prov == 'meta') {
      if (idToken != null && idToken.isNotEmpty) {
        return loginWithMeta(accessToken: idToken);
      }
      // No credential supplied by the caller: run the real Facebook login
      // dialog. Fabricating a provider token client-side (the old
      // 'mock_metatoken:…' fallback) is what production must never see.
      return loginWithMeta();
    } else if (prov == 'apple') {
      return loginWithApple(idToken: idToken, name: name);
    }
    _authError = 'Unsupported SSO provider: $provider';
    return false;
  }

  /// Explicitly link Google to currently logged-in account
  Future<bool> linkGoogleAccount() async {
    _isLoading = true;
    _authError = null;
    notifyListeners();

    try {
      final googleResult = await SecurityAuthService.authenticateGoogle(
        promptAccountChooser: true,
      );

      if (!googleResult.success || googleResult.idToken == null) {
        _authError = googleResult.error ?? 'Failed to authenticate with Google';
        return false;
      }

      final res = await ApiService.linkGoogleAccount(googleResult.idToken!);
      if (res['success'] == true) {
        if (_currentUser != null) {
          _currentUser = _currentUser!.copyWith(ssoProvider: 'google');
        }
        notifyListeners();
        return true;
      }
      return false;
    } catch (e) {
      _authError = _sanitizeAuthError(e);
      return false;
    } finally {
      _isLoading = false;
      notifyListeners();
    }
  }

  /// Explicitly unlink Google from current account
  Future<bool> unlinkGoogleAccount() async {
    _isLoading = true;
    _authError = null;
    notifyListeners();

    try {
      final res = await ApiService.unlinkGoogleAccount();
      if (res['success'] == true) {
        await SecurityAuthService.disconnectGoogle();
        if (_currentUser != null) {
          _currentUser = _currentUser!.copyWith(ssoProvider: null);
        }
        notifyListeners();
        return true;
      }
      return false;
    } catch (e) {
      _authError = _sanitizeAuthError(e);
      return false;
    } finally {
      _isLoading = false;
      notifyListeners();
    }
  }

  /// Federated Meta (Facebook) Sign-In
  Future<bool> loginWithMeta({String? accessToken}) async {
    _isLoading = true;
    _authError = null;
    _unlinkedEmailForLinking = null;
    notifyListeners();

    try {
      String? token = accessToken;
      if (token == null || token.isEmpty) {
        final authResult = await SecurityAuthService.authenticateMeta();
        if (!authResult.success || authResult.idToken == null) {
          _authError = authResult.error ?? 'Meta authentication did not return a credential.';
          return false;
        }
        token = authResult.idToken;
      }

      final res = await ApiService.metaLogin(accessToken: token!);

      if (res['user'] != null) {
        _currentUser = User.fromJson(res['user']);
        _isDemoMode = false;
        await refreshAllData();
        return true;
      }

      _authError = 'Meta authentication response invalid.';
      return false;
    } on AccountExistsUnlinkedError catch (e) {
      _unlinkedEmailForLinking = e.email;
      _authError = e.message;
      return false;
    } catch (e) {
      _authError = _sanitizeAuthError(e);
      return false;
    } finally {
      _isLoading = false;
      notifyListeners();
    }
  }

  /// Explicitly link Meta (Facebook) to currently logged-in account
  Future<bool> linkMetaAccount({String? accessToken}) async {
    _isLoading = true;
    _authError = null;
    notifyListeners();

    try {
      String? token = accessToken;
      if (token == null || token.isEmpty) {
        final authResult = await SecurityAuthService.authenticateMeta();
        if (!authResult.success || authResult.idToken == null) {
          _authError = authResult.error ?? 'Failed to authenticate with Meta';
          return false;
        }
        token = authResult.idToken;
      }

      final res = await ApiService.linkMetaAccount(token!);
      if (res['success'] == true) {
        if (_currentUser != null) {
          _currentUser = _currentUser!.copyWith(ssoProvider: 'meta');
        }
        notifyListeners();
        return true;
      }
      return false;
    } catch (e) {
      _authError = _sanitizeAuthError(e);
      return false;
    } finally {
      _isLoading = false;
      notifyListeners();
    }
  }

  /// Explicitly unlink Meta (Facebook) from current account
  Future<bool> unlinkMetaAccount() async {
    _isLoading = true;
    _authError = null;
    notifyListeners();

    try {
      final res = await ApiService.unlinkMetaAccount();
      if (res['success'] == true) {
        await SecurityAuthService.disconnectMeta();
        if (_currentUser != null) {
          _currentUser = _currentUser!.copyWith(ssoProvider: null);
        }
        notifyListeners();
        return true;
      }
      return false;
    } catch (e) {
      _authError = _sanitizeAuthError(e);
      return false;
    } finally {
      _isLoading = false;
      notifyListeners();
    }
  }

  /// Federated Sign in with Apple
  Future<bool> loginWithApple({String? idToken, String? name}) async {
    _isLoading = true;
    _authError = null;
    _unlinkedEmailForLinking = null;
    notifyListeners();

    try {
      // Real credential source: when no idToken was supplied by the caller,
      // run the actual Sign in with Apple flow — never fabricate one (the old
      // 'mock_appletoken:…' fallback).
      String? token = idToken;
      String? resolvedName = name;
      if (token == null || token.isEmpty) {
        final authResult = await SecurityAuthService.authenticateApple();
        if (!authResult.success || authResult.idToken == null) {
          _authError = authResult.error ?? 'Apple authentication did not return a credential.';
          return false;
        }
        token = authResult.idToken!;
        if (resolvedName == null || resolvedName.isEmpty) {
          resolvedName = authResult.name.isNotEmpty ? authResult.name : null;
        }
      }

      final res = await ApiService.appleLogin(idToken: token, name: resolvedName);

      if (res['user'] != null) {
        _currentUser = User.fromJson(res['user']);
        _isDemoMode = false;
        await refreshAllData();
        return true;
      }

      _authError = 'Apple authentication response invalid.';
      return false;
    } on AccountExistsUnlinkedError catch (e) {
      _unlinkedEmailForLinking = e.email;
      _authError = e.message;
      return false;
    } catch (e) {
      _authError = _sanitizeAuthError(e);
      return false;
    } finally {
      _isLoading = false;
      notifyListeners();
    }
  }

  /// Biometric unlock strictly verifying existing secure session without hardcoded bypasses
  Future<bool> loginWithBiometrics() async {
    _isLoading = true;
    _authError = null;
    notifyListeners();

    try {
      final authenticated = await SecurityAuthService.authenticateWithBiometrics(
        reason: 'Scan your fingerprint or face to securely unlock FinPocket',
      );

      if (!authenticated) {
        _authError = 'Biometric scan was cancelled or not recognized. Please enter your password.';
        return false;
      }

      await ApiService.initToken();
      await ApiService.discoverHost();

      // 1. Check if an active authenticated token exists in secure storage
      if (ApiService.authToken != null) {
        try {
          final data = await ApiService.getMe();
          if (data['user'] != null) {
            _currentUser = User.fromJson(data['user']);
            await SecureTokenStorage.saveCachedUser(jsonEncode(data['user']));
            _isDemoMode = false;
            await refreshAllData();
            return true;
          }
        } catch (_) {
          // If offline or momentary connection issue, fall through to cached user
        }
      }

      // 2. Check cached secure user session
      final cachedUserJson = await SecureTokenStorage.getCachedUser();
      if (cachedUserJson != null) {
        try {
          _currentUser = User.fromJson(jsonDecode(cachedUserJson));
          _isDemoMode = false;
          await refreshAllData();
          return true;
        } catch (_) {}
      }

      // No active session in secure storage: user must log in once with credentials
      _authError = 'No active session found. Please sign in with your email & password or Google account once to enable biometric unlock.';
      return false;
    } catch (e) {
      _authError = _sanitizeAuthError(e);
      return false;
    } finally {
      _isLoading = false;
      notifyListeners();
    }
  }


  Future<bool> register(String name, String email, String password, {String? phone}) async {
    _isLoading = true;
    _authError = null;
    notifyListeners();

    try {
      // Defense-in-depth: wipe any previous user's cached data
      await clearAllLocalUserData();

      final res = await ApiService.register(name, email, password, phone: phone);
      if (res['user'] != null) {
        _currentUser = User.fromJson(res['user']);
        _isDemoMode = false;
        await refreshAllData();
        return true;
      }
      _authError = 'Registration failed';
      return false;
    } catch (e) {
      if (AppConfig.isDemo) {
        // Fallback gracefully for Demo Sandbox when backend server is offline
        _isDemoMode = true;
        _currentUser = User(
          userId: 'usr_${DateTime.now().millisecondsSinceEpoch}',
          fullName: name,
          email: email,
          phone: phone ?? '+91 98765 43210',
          createdAt: DateTime.now().toIso8601String(),
        );
        _initDemoData();
        return true;
      }
      _authError = _sanitizeAuthError(e);
      return false;
    } finally {
      _isLoading = false;
      notifyListeners();
    }
  }

  /// Refresh authoritative verification status (email & mobile) from backend
  Future<Map<String, dynamic>?> refreshVerificationStatus() async {
    if (_isDemoMode || _currentUser == null) return null;
    try {
      final status = await SecurityAuthService.getVerificationStatus();
      if (_currentUser != null && status['emailVerified'] != null) {
        _currentUser = _currentUser!.copyWith(
          emailVerified: status['emailVerified'] == true,
          phoneVerified: status['phoneVerified'] == true,
        );
        notifyListeners();
      }
      return status;
    } catch (e) {
      debugPrint('[AppState] refreshVerificationStatus error: $e');
      return null;
    }
  }

  /// ──────────────────────────────────────────────────────────────────────
  /// ACCOUNT ISOLATION
  /// Every piece of user-specific data cached on the device must be wiped when
  /// the account changes, otherwise the next login inherits the previous user's
  /// money, history and settings. This is the single source of truth for that
  /// wipe — logout AND login both call it (login is the defense-in-depth path
  /// for force-kills that skip logout entirely).
  /// ──────────────────────────────────────────────────────────────────────
  static Future<void> clearAllLocalUserData() async {
    // 1. Locally cached bank transactions (the primary leak vector).
    //
    // Each stage is isolated on purpose: a local-storage fault must never
    // abort an authentication attempt. The wipe still runs as far as it can,
    // and the caller is told about it through the debug log instead of a
    // misleading "Something went wrong" login failure.
    try {
      await LocalTransactionStorageService.clearLocalTransactions();
    } catch (e) {
      debugPrint('[AppState] clearLocalTransactions error: $e');
    }

    // 2. Secure-storage: cached user profile + last-session email.
    try {
      await SecureTokenStorage.clearCachedUser();
      await SecureTokenStorage.clearLastUser();
    } catch (e) {
      debugPrint('[AppState] clearSecureStorage error: $e');
    }

    // 3. SharedPreferences: every user-scoped key the app persists.
    try {
      final prefs = await SharedPreferences.getInstance();
      final keysToRemove = <String>[
        // SMS-reported bank balance overlay
        'finpocket_sms_reported_balance_v1',
        'finpocket_sms_reported_balance_bank_v1',
        'finpocket_sms_reported_balance_at_v1',
        // Financial products
        'finpocket_emis_v1',
        'finpocket_savings_goals_v1',
        'fp_credit_cards',
        'finpocket_min_budget_floor_v1',
        // Gamification & notifications
        'fp_streak_data',
        'finpocket_app_notifications_v1',
        'finpocket_notified_credit_ids_v1',
        // Round-up vault
        'fp_roundups_total',
        'fp_roundups_count',
        // Preferences that describe a person, not the device
        'fp_stealth_mode',
        'fp_soundbox_enabled',
        // User-specific app state
        'finpocket_whatsapp_number_v1',
        'fp_ghost_subscriptions',
        'finpocket_profile_onboarded_v1',
        'finpocket_user_pay_income_v1',
        'finpocket_user_pay_spend_limit_v1',
      ];
      for (final key in keysToRemove) {
        await prefs.remove(key);
      }
    } catch (e) {
      debugPrint('[AppState] clearAllLocalUserData prefs error: $e');
    }
  }

  Future<void> logout() async {
    _isLoading = true;
    notifyListeners();

    try {
      await ApiService.logout();
    } catch (e) {
      debugPrint('[AppState] Logout error notice: $e');
    } finally {
      // Wipe every trace of this user's data from the device BEFORE dropping
      // the in-memory state, so a fast login can never read stale rows.
      await clearAllLocalUserData();

      _currentUser = null;
      _isDemoMode = false;
      _transactions.clear();
      _bankAccounts.clear();
      _savingsGoals.clear();
      _auditLogs.clear();
      _devices.clear();
      _safeToSpend = SafeToSpendData();
      _commitments = CommittedMoneyData();
      _dailyBrief = DailyFinancialBriefData();
      _insights.clear();
      _upcomingPayments.clear();
      _pendingPayments.clear();
      _isBalanceSmsMirrored = false;
      _smsReportedBalance = null;
      _smsReportedBank = null;
      _smsReportedAt = null;
      _accumulatedRoundUps = 0.0;
      _roundUpTransactionsCount = 0;
      _minBudgetFloorOverride = 0.0;
      _isLoaded = false;
      _isCached = false;
      _hasError = false;
      _errorMessage = null;
      _isLoading = false;
      notifyListeners();
    }
  }

  void enterDemoMode() {
    if (AppConfig.isProduction) {
      debugPrint('[AppState] Demo mode is strictly disabled in production builds.');
      return;
    }
    _isDemoMode = true;
    _currentUser = User(
      userId: 'usr_fp_sandbox',
      fullName: 'Demo Sandbox User',
      email: 'sandbox@finpocket.app',
      phone: '+91 98765 43210',
      createdAt: '2026-01-10T10:00:00Z',
    );
    _initDemoData();
    notifyListeners();
  }


  void exitDemoMode() {
    _isDemoMode = false;
    _currentUser = null;
    // Demo data is fabricated — wipe it so it can never leak into a real account.
    clearAllLocalUserData();
    notifyListeners();
  }

  Future<Map<String, dynamic>> forgotPassword(String email) async {
    _isLoading = true;
    _authError = null;
    notifyListeners();

    try {
      return await ApiService.forgotPassword(email);
    } catch (e) {
      _authError = _sanitizeAuthError(e);
      rethrow;
    } finally {
      _isLoading = false;
      notifyListeners();
    }
  }

  Future<bool> resetPassword(String token, String newPassword, {String? email}) async {
    _isLoading = true;
    _authError = null;
    notifyListeners();

    try {
      final res = await ApiService.resetPassword(token, newPassword, email: email);
      return res['success'] == true;
    } catch (e) {
      _authError = _sanitizeAuthError(e);
      return false;
    } finally {
      _isLoading = false;
      notifyListeners();
    }
  }

  // Refresh All Data from Authoritative Backend API
  Future<void> refreshAllData() async {
    _isLoading = true;
    _hasError = false;
    _errorMessage = null;
    notifyListeners();

    try {
      final overview = await ApiService.getFinancialOverview();

      // 1. Safe to Spend & Commitments
      final s = overview['safeToSpend'];
      if (s != null) {
        final totBal = (s['totalBalance'] as num?)?.toDouble() ?? 0.0;
        final sToday = (s['safeToSpendToday'] as num?)?.toDouble();
        final remDays = (s['remainingDaysInMonth'] as num?)?.toInt();
        _safeToSpend = SafeToSpendData(
          totalBalance: totBal,
          availableBalance: (s['availableBalance'] as num?)?.toDouble() ?? 0.0,
          upcomingMandatoryBills: (s['upcomingMandatoryBills'] as num?)?.toDouble() ?? 0.0,
          activeEmiObligations: (s['activeEmiObligations'] as num?)?.toDouble() ?? 0.0,
          committedSavings: (s['committedSavings'] as num?)?.toDouble() ?? 0.0,
          emergencyReserveAllocation: (s['emergencyReserveAllocation'] as num?)?.toDouble() ?? 0.0,
          safeToSpend: (s['safeToSpend'] as num?)?.toDouble() ?? 0.0,
          safeToSpendToday: sToday,
          remainingDaysInMonth: remDays,
          explanation: s['explanation']?.toString() ?? '',
        );
      }

      final c = overview['commitments'];
      if (c != null) {
        _commitments = CommittedMoneyData(
          totalBalance: (c['totalBalance'] as num?)?.toDouble() ?? 0.0,
          bills: (c['bills'] as num?)?.toDouble() ?? 0.0,
          subscriptions: (c['subscriptions'] as num?)?.toDouble() ?? 0.0,
          emis: (c['emis'] as num?)?.toDouble() ?? 0.0,
          savingsCommitment: (c['savingsCommitment'] as num?)?.toDouble() ?? 0.0,
          emergencyReserve: (c['emergencyReserve'] as num?)?.toDouble() ?? 0.0,
          totalCommitted: (c['totalCommitted'] as num?)?.toDouble() ?? 0.0,
          remainingBuffer: (c['remainingBuffer'] as num?)?.toDouble() ?? 0.0,
          explanation: c['explanation']?.toString() ?? '',
        );
      }

      // 2. Daily Brief
      final db = overview['dailyBrief'];
      if (db != null) {
        _dailyBrief = DailyFinancialBriefData(
          greeting: db['greeting']?.toString() ?? 'Welcome back',
          availableBalance: (db['availableBalance'] as num?)?.toDouble() ?? 0.0,
          safeToSpend: (db['safeToSpend'] as num?)?.toDouble() ?? 0.0,
          todayPaymentsTotal: (db['todayPaymentsTotal'] as num?)?.toDouble() ?? 0.0,
          todayPaymentsCount: (db['todayPaymentsCount'] as num?)?.toInt() ?? 0,
          next7DaysCommitmentsTotal: (db['next7DaysCommitmentsTotal'] as num?)?.toDouble() ?? 0.0,
          savingsThisMonth: (db['savingsThisMonth'] as num?)?.toDouble() ?? 0.0,
          attentionInsight: db['attentionInsight']?.toString() ?? '',
          savingsGoalHighlight: db['savingsGoalHighlight']?.toString() ?? '',
        );
      }

      // 3. Insights
      final rawInsights = overview['insights'] as List<dynamic>? ?? [];
      _insights = rawInsights.map((i) => FinancialInsightData(
        id: i['id']?.toString() ?? '',
        type: i['type']?.toString() ?? 'GENERAL',
        title: i['title']?.toString() ?? 'Insight',
        explanation: i['explanation']?.toString() ?? '',
        supportingValues: i['supportingValues'] as Map<String, dynamic>? ?? {},
        confidence: (i['confidence'] as num?)?.toDouble() ?? 0.95,
      )).toList();

      // 4. Upcoming Payments
      final rawUpcoming = overview['upcomingPayments']?['payments'] as List<dynamic>? ?? [];
      _upcomingPayments = rawUpcoming.map((u) => UpcomingPaymentData(
        id: u['id']?.toString() ?? '',
        name: u['name']?.toString() ?? 'Payment',
        amount: (u['amount'] as num?)?.toDouble() ?? 0.0,
        dueDate: u['dueDate']?.toString() ?? '',
        category: u['category']?.toString() ?? 'Bills',
        paymentType: u['paymentType']?.toString() ?? 'BILL',
        isMandatory: u['isMandatory'] == true,
        isRecurring: u['isRecurring'] == true,
        daysRemaining: (u['daysRemaining'] as num?)?.toInt() ?? 0,
      )).toList();

      // 5. Pending Payments
      final rawPending = overview['pendingPayments'] as List<dynamic>? ?? [];
      _pendingPayments = rawPending.map((p) => PendingPaymentData(
        id: p['id']?.toString() ?? '',
        recipient: p['recipient']?.toString() ?? 'Recipient',
        amount: (p['amount'] as num?)?.toDouble() ?? 0.0,
        state: p['state']?.toString() ?? 'PENDING',
        note: p['note']?.toString(),
        createdAt: p['createdAt']?.toString() ?? '',
      )).toList();

      // 6. Savings Goals — merged, never replaced.
      //    The old code overwrote the list outright, so every goal the user had
      //    created on-device silently vanished on the next pull-to-refresh.
      final rawGoals = overview['savingsGoals'] as List<dynamic>? ?? [];
      final serverGoals = rawGoals
          .whereType<Map<dynamic, dynamic>>()
          .map(_goalFromServer)
          .toList();

      if (serverGoals.isNotEmpty) {
        final merged = <String, SavingsGoal>{};
        for (final local in _savingsGoals) {
          merged[local.id] = local;
        }
        for (final remote in serverGoals) {
          final existing = merged[remote.id];
          if (existing == null) {
            merged[remote.id] = remote;
          } else {
            // Server is authoritative for target/metadata; progress takes the
            // higher of the two so an unsynced local deposit is never lost.
            merged[remote.id] = SavingsGoal(
              id: remote.id,
              userId: remote.userId,
              name: remote.name,
              targetAmount: remote.targetAmount,
              currentAmount:
                  math.max(existing.currentAmount, remote.currentAmount),
              targetDate: remote.targetDate,
              monthlyContribution: remote.monthlyContribution,
              category: remote.category,
              status: (math.max(existing.currentAmount, remote.currentAmount) >=
                      remote.targetAmount)
                  ? 'COMPLETED'
                  : 'IN_PROGRESS',
              createdAt: existing.createdAt,
            );
          }
        }
        _savingsGoals = merged.values.toList();
        _persistGoals();
      }

      // 7. Emergency Fund
      final ef = overview['emergencyFund'];
      if (ef != null) {
        List<EmergencyFundAudit> audits = List<EmergencyFundAudit>.from(_emergencyFund.auditLog);
        final rawAudits = (ef['auditLog'] ?? ef['audits']) as List<dynamic>?;
        if (rawAudits != null && rawAudits.isNotEmpty) {
          audits = rawAudits.map((a) => EmergencyFundAudit(
            id: a['id']?.toString() ?? '',
            action: a['action']?.toString() ?? 'DEPOSIT',
            amount: (a['amount'] as num?)?.toDouble(),
            timestamp: DateTime.tryParse(a['created_at']?.toString() ?? '') ?? DateTime.now(),
            reason: a['reason']?.toString() ?? '',
          )).toList();
        }
        _emergencyFund = EmergencyFund(
          id: 'emf_authoritative',
          userId: _currentUser?.userId ?? '',
          targetAmount: (ef['targetAmount'] as num?)?.toDouble() ?? 0.0,
          currentAmount: (ef['currentAmount'] as num?)?.toDouble() ?? 0.0,
          isLocked: ef['isLocked'] == true,
          monthlyContribution: (ef['monthlyContribution'] as num?)?.toDouble() ?? 0.0,
          auditLog: audits,
        );
      }

      // 8. Recent Transactions
      final rawTxns = overview['recentTransactions'] as List<dynamic>?;
      List<Transaction>? txnsBeforeSync;
      if (rawTxns != null) {
        txnsBeforeSync = List<Transaction>.of(_transactions);
        final serverTxns = rawTxns.map((t) => Transaction.fromJson(t as Map<String, dynamic>)).toList();
        _transactions = await LocalTransactionStorageService.mergeWithLocalTransactions(serverTxns);
      }

      // 9. Accounts — real bank balances.
      //    Priority: GET /accounts (authoritative AA/PSU DTO) -> overview.bankAccounts
      //    -> legacy overview.accounts. The old code only read 'accounts', which the
      //    server never sends, so real logins always showed an empty account list.
      await _loadBankAccounts(overview);

      // Mirror the balance the bank last printed by SMS when the server has no
      // account to report — done before the heads-up so alerts quote it.
      _applySmsBalanceOverlay();

      // Salary/credit heads-up — evaluated after balances & Safe-to-Spend are
      // refreshed so the summary quotes post-credit figures. Fires once per
      // newly revealed credit, including AA-synced statement inflows.
      if (txnsBeforeSync != null) {
        _notifyNewCredits(txnsBeforeSync, _transactions);
      }

      _isLoaded = true;
      _isCached = false;
      _lastSynced = DateTime.now();
      await _runEmiGuidanceCheckup();
      await _syncServerNotifications();
      await _checkDailyMotivationQuote();
      // Every successful refresh counts as today's streak check-in; the
      // guard inside makes this a no-op when today was already evaluated.
      await evaluateDailyStreak();
    } catch (e) {
      debugPrint('[AppState] Error refreshing overview from server: $e');
      _hasError = true;
      _errorMessage = 'Unable to load financial data from server.';
      if (_isLoaded) {
        _isCached = true;
      }
    } finally {
      // Runs on success *and* failure: if the server reported no account
      // balance, show what the bank itself last stated in an SMS.
      _applySmsBalanceOverlay();
      _isLoading = false;
      notifyListeners();
      // The session is live by now — this is where the on-device SMS mirror
      // gets its first real chance to run when init() raced session restore.
      _ensureFreshSmsMirror();
    }
  }

  /// Loads real bank balances from the backend.
  ///
  /// Never invents a balance: if the server cannot be reached the existing
  /// `_bankAccounts` list is left untouched rather than being replaced with
  /// zeros or demo numbers.
  Future<void> _loadBankAccounts(Map<String, dynamic> overview) async {
    List<dynamic>? fromApi;
    try {
      fromApi = await ApiService.getAccounts();
    } catch (e) {
      debugPrint('[AppState] getAccounts() unavailable, using overview payload: $e');
    }

    final fromOverview =
        (overview['bankAccounts'] as List<dynamic>?) ??
        (overview['accounts'] as List<dynamic>?);

    final raw = (fromApi != null && fromApi.isNotEmpty) ? fromApi : fromOverview;
    if (raw == null || raw.isEmpty) return;

    final parsed = <BankAccount>[];
    for (final a in raw) {
      if (a is! Map) continue;
      final acct = _bankAccountFromJson(a);
      if (acct != null) parsed.add(acct);
    }
    if (parsed.isNotEmpty) _bankAccounts = parsed;
  }

  /// Normalises both shapes the backend emits:
  ///  * `GET /accounts` camelCase DTO (`institutionName`, `availableBalance`, `lastSyncedAt`)
  ///  * `/financial/overview` raw `bank_accounts` rows (`institution_name`, `available_balance`, `last_synced_at`)
  BankAccount? _bankAccountFromJson(Map<dynamic, dynamic> a) {
    num? pick(List<String> keys) {
      for (final k in keys) {
        final v = a[k];
        if (v is num) return v;
        if (v is String) {
          final parsed = num.tryParse(v);
          if (parsed != null) return parsed;
        }
      }
      return null;
    }

    String pickStr(List<String> keys) {
      for (final k in keys) {
        final v = a[k];
        if (v != null && v.toString().isNotEmpty) return v.toString();
      }
      return '';
    }

    String orElse(String value, String fallback) =>
        value.isEmpty ? fallback : value;

    final id = pickStr(['id', 'accountId', 'account_id']);
    final balance = pick([
      'availableBalance',
      'available_balance',
      'currentBalance',
      'current_balance',
      'balance',
    ]);
    if (id.isEmpty || balance == null) return null;

    final isPrimaryRaw = a['isPrimary'] ?? a['is_primary'];
    final lastSyncedRaw = pickStr(['lastSyncedAt', 'last_synced_at']);

    return BankAccount(
      id: id,
      bankName: orElse(
        pickStr(['institutionName', 'institution_name', 'bankName', 'bank_name']),
        'Bank Account',
      ),
      accountType:
          orElse(pickStr(['accountType', 'account_type']), 'SAVINGS'),
      maskedAccountNumber: orElse(
        pickStr(['maskedAccountNumber', 'masked_account_number']),
        '•••• 0000',
      ),
      availableBalance: balance.toDouble(),
      isPrimary: isPrimaryRaw == true || isPrimaryRaw == 1,
      providerType: orElse(pickStr(['providerType', 'provider_type']), 'UNKNOWN'),
      freshnessStatus:
          orElse(pickStr(['freshnessStatus', 'freshness_status']), 'CURRENT'),
      lastSynced: DateTime.tryParse(lastSyncedRaw) ?? DateTime.now(),
    );
  }

  /// Maps a `/financial/overview.savingsGoals` row (camelCase from the server)
  /// into a [SavingsGoal], tolerating both camelCase and snake_case keys.
  SavingsGoal _goalFromServer(Map<dynamic, dynamic> g) {
    String pickStr(List<String> keys) {
      for (final k in keys) {
        final v = g[k];
        if (v != null && v.toString().isNotEmpty) return v.toString();
      }
      return '';
    }

    num pickNum(List<String> keys) {
      for (final k in keys) {
        final v = g[k];
        if (v is num) return v;
        if (v is String) {
          final p = num.tryParse(v);
          if (p != null) return p;
        }
      }
      return 0;
    }

    String orElse(String value, String fallback) =>
        value.isEmpty ? fallback : value;

    return SavingsGoal(
      id: pickStr(['id', 'goal_id']),
      userId: orElse(pickStr(['userId', 'user_id']), _currentUser?.userId ?? ''),
      name: orElse(pickStr(['name', 'title']), 'Goal'),
      targetAmount: pickNum(['targetAmount', 'target_amount']).toDouble(),
      currentAmount: pickNum(['currentAmount', 'current_amount']).toDouble(),
      targetDate:
          DateTime.tryParse(pickStr(['targetDate', 'target_date'])) ??
              DateTime.now().add(const Duration(days: 90)),
      monthlyContribution:
          pickNum(['monthlyContribution', 'monthly_contribution']).toDouble(),
      category: orElse(pickStr(['category']), 'GENERAL'),
      status: orElse(pickStr(['status']), 'IN_PROGRESS'),
      createdAt: DateTime.tryParse(pickStr(['createdAt', 'created_at'])) ??
          DateTime.now(),
    );
  }

  // Payment Simulation & Execution
  Future<Map<String, dynamic>> simulateAffordability(double amount) async {
    try {
      return await ApiService.simulateEnhancedAffordability(amount);
    } catch (e) {
      return {
        'currentAvailableBalance': totalAvailableBalance,
        'paymentAmount': amount,
        'balanceAfterPayment': totalAvailableBalance - amount,
        'currentSafeToSpend': safeToSpend.safeToSpend,
        'safeToSpendAfterPayment': safeToSpend.safeToSpend - amount,
        'isAffordable': amount <= totalAvailableBalance,
        'affordabilityStatus': amount <= safeToSpend.safeToSpend ? 'COMFORTABLE' : amount <= totalAvailableBalance ? 'TIGHT' : 'HIGH IMPACT',
        'impactExplanation': 'Payment of ₹${amount.toStringAsFixed(0)} leaves ₹${(totalAvailableBalance - amount).toStringAsFixed(0)} available.',
      };
    }
  }

  Future<bool> sendPayment({
    required String receiver,
    required double amount,
    required TransactionCategory category,
    String? note,
    BuildContext? overlayContext,
  }) async {
    if (_childCare.enabled && _childCare.paymentBlocked) {
      return false;
    }
    if (amount <= 0 || amount > totalAvailableBalance) return false;

    bool paymentSucceeded = false;
    String refId = 'UPI/${DateTime.now().millisecondsSinceEpoch}';

    try {
      final idempotencyKey = 'IDEM_${DateTime.now().millisecondsSinceEpoch}_${receiver.replaceAll(" ", "_")}';
      final res = await ApiService.sendPayment(
        recipient: receiver,
        amount: amount,
        categoryId: _categoryToId(category),
        note: note,
        idempotencyKey: idempotencyKey,
      );
      if (res['payment'] != null && res['payment']['referenceId'] != null) {
        refId = res['payment']['referenceId'];
      }
      await refreshAllData();
      paymentSucceeded = true;
    } catch (e) {
      // Real-data rule: a payment that could not be executed is reported as a
      // failure. (A debug-only branch used to insert a SUCCESSFUL ledger row,
      // persist it to the local store and silently deduct balances whenever
      // the API errored — fabricated money movement.)
      debugPrint('[AppState] Payment execution failed — returning failure, nothing recorded: $e');
    }

    if (paymentSucceeded) {
      if (overlayContext != null && !overlayContext.mounted) return paymentSucceeded;

      // 1. Transaction Receipt Notification. With no connected account there
      //    is no real account to name — the old fallback invented a
      //    "FinPocket Primary Wallet" as the debit source (a dummy wallet
      //    this app must never claim exists).
      final bankInfo = _bankAccounts.isNotEmpty
          ? '${_bankAccounts[0].bankName} A/c ${_bankAccounts[0].maskedAccountNumber}'
          : null;
      final balAfter = math.max(0, totalAvailableBalance);

      final smsNotif = AppNotification(
        id: 'sms_${DateTime.now().millisecondsSinceEpoch}',
        title: bankInfo != null
            ? '₹${amount.toStringAsFixed(2)} Debited from $bankInfo'
            : '₹${amount.toStringAsFixed(2)} Paid to $receiver',
        message: 'Paid to $receiver. Ref: $refId. Available Bal: ₹${balAfter.toStringAsFixed(2)}. -FinPocket${bankInfo != null ? ' Bank Alert' : ''}',
        type: NotificationType.sms,
        timestamp: DateTime.now(),
        data: {
          'amount': amount,
          'receiver': receiver,
          'referenceId': refId,
          'sourceAccount': bankInfo,
          'balanceAfter': balAfter,
        },
      );
      addNotification(smsNotif, overlayContext: overlayContext);

      // 2. Unusual-transaction sweep. Lives here rather than only in the
      //    Payments screen so every ledger debit — however it was initiated —
      //    is checked, and the 10s de-dup prevents a double alert when the
      //    screen runs the same check afterwards.
      flagUnusualTransaction(
        recipient: receiver,
        amount: amount,
        overlayContext: overlayContext,
      );

      // 3. Budget Cap Threshold Check & Warning Notification
      final cap = _getCategoryBudgetCap(category);
      final catName = category.toString().split('.').last;
      final currentCatSpent = _transactions
          .where((t) => t.category == category && t.type == TransactionType.EXPENSE)
          .fold<double>(0.0, (sum, t) => sum + t.amount);
      final pct = cap > 0 ? ((currentCatSpent / cap) * 100).round() : 0;

      if (currentCatSpent >= cap) {
        final alertNotif = AppNotification(
          id: 'budget_exceeded_${DateTime.now().millisecondsSinceEpoch}',
          title: '⚠️ Budget Cap Exceeded: $catName',
          message: 'You have spent ₹${currentCatSpent.toStringAsFixed(0)} of ₹${cap.toStringAsFixed(0)} ($pct%) on $catName! You have exceeded your spending limit—stop non-essential spending.',
          type: NotificationType.budgetAlert,
          timestamp: DateTime.now(),
          data: {
            'category': catName,
            'spent': currentCatSpent,
            'cap': cap,
            'utilization': pct,
          },
        );
        addNotification(alertNotif, overlayContext: overlayContext);
      } else if (pct >= 80) {
        final alertNotif = AppNotification(
          id: 'budget_warning_${DateTime.now().millisecondsSinceEpoch}',
          title: '⚠️ Near Budget Cap: $catName',
          message: 'You have used $pct% (₹${currentCatSpent.toStringAsFixed(0)} / ₹${cap.toStringAsFixed(0)}) of your $catName budget cap. You are near your limit—curb further spending.',
          type: NotificationType.budgetAlert,
          timestamp: DateTime.now(),
          data: {
            'category': catName,
            'spent': currentCatSpent,
            'cap': cap,
            'utilization': pct,
          },
        );
        addNotification(alertNotif, overlayContext: overlayContext);
      }

      // 3. Autonomous Round-Up spare change accumulation
      await applyRoundUpForPayment(amount);

      // 4. On-Device UPI Soundbox audio announcement
      announceSoundbox(amount: amount, party: receiver, isCredit: false);

      // 5. Evaluate No-Spend Streak & Gamification Milestones
      evaluateDailyStreak();

      return true;
    }
    return false;
  }

  /// Ids of credits already heads-up'd, persisted so a restart (or the
  /// startup refresh racing the notification restore) never re-alerts them.
  static const String _keyNotifiedCredits = 'finpocket_notified_credit_ids_v1';
  final Set<String> _notifiedCreditIds = {};
  Timer? _smsAutoSyncTimer;

  /// The quote flips on its own at midnight while the app is open — the user
  /// never has to tap refresh. This remembers the date the current quote was
  /// picked for; the watcher below re-runs the check only when the day rolls.
  Timer? _quoteDateTimer;
  String? _lastQuoteDateStr;

  static String _todayKey() {
    final now = DateTime.now();
    return '${now.year}-${now.month.toString().padLeft(2, '0')}-${now.day.toString().padLeft(2, '0')}';
  }

  void _watchQuoteDate() {
    try {
      if (_lastQuoteDateStr != _todayKey()) {
        unawaited(_checkDailyMotivationQuote());
      }
    } catch (_) {}
  }

  Future<void> _loadNotifiedCreditIds() async {
    try {
      final prefs = await SharedPreferences.getInstance();
      _notifiedCreditIds.addAll(prefs.getStringList(_keyNotifiedCredits) ?? const []);
    } catch (_) {}
  }

  Future<void> _persistNotifiedCreditIds() async {
    try {
      final prefs = await SharedPreferences.getInstance();
      // Bounded: the 24 h alerting window makes very old ids irrelevant.
      final ids = _notifiedCreditIds.toList();
      await prefs.setStringList(
        _keyNotifiedCredits,
        ids.length > 200 ? ids.sublist(ids.length - 200) : ids,
      );
    } catch (_) {}
  }

  // --- Balance mirrored from the user's own bank SMS ---------------------
  //
  // The bank prints the account balance in every transaction SMS
  // ("Avl Bal INR 48,250.00"). That figure is real data belonging to a real
  // account, so it is what the Total Balance card shows when the server has
  // no linked account to report (SMS-only users). It is NEVER invented,
  // NEVER raised by local activity, and any server-reported balance wins.
  static const String _keySmsBalance = 'finpocket_sms_reported_balance_v1';
  static const String _keySmsBalanceBank = 'finpocket_sms_reported_balance_bank_v1';
  static const String _keySmsBalanceAt = 'finpocket_sms_reported_balance_at_v1';

  double? _smsReportedBalance;
  String? _smsReportedBank;
  DateTime? _smsReportedAt;

  bool get hasSmsReportedBalance =>
      _smsReportedBalance != null && _smsReportedBalance! > 0;

  /// True when the balance on screen IS the SMS mirror (the server had no
  /// linked account to report) — drives the honest source line on the card.
  bool _isBalanceSmsMirrored = false;
  bool get isBalanceSmsMirrored => _isBalanceSmsMirrored;

  /// Compact provenance for the balance card: "HDFC Bank · via SMS 10:12".
  String get smsBalanceSourceShort {
    final bank = (_smsReportedBank == null || _smsReportedBank!.isEmpty)
        ? 'Your bank'
        : _smsReportedBank!;
    final at = _smsReportedAt;
    if (at == null) return '$bank · via SMS';
    String two(int v) => v.toString().padLeft(2, '0');
    return '$bank · via SMS ${two(at.hour)}:${two(at.minute)}';
  }

  /// Honest provenance line for the balance card, e.g.
  /// "HDFC Bank · as reported by SMS, 09 Oct 10:12".
  String get smsBalanceSourceLabel {
    final bal = _smsReportedBalance;
    if (bal == null || bal <= 0) return '';
    final bank = (_smsReportedBank == null || _smsReportedBank!.isEmpty)
        ? 'Your bank'
        : _smsReportedBank!;
    final at = _smsReportedAt;
    if (at == null) return '$bank · as reported by SMS';
    String two(int v) => v.toString().padLeft(2, '0');
    return '$bank · as reported by SMS, '
        '${two(at.day)} ${_monthShort(at.month)} ${at.year} '
        '${two(at.hour)}:${two(at.minute)}';
  }

  static String _monthShort(int m) {
    const names = [
      'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
      'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
    ];
    return (m >= 1 && m <= 12) ? names[m - 1] : '';
  }

  Future<void> _loadSmsReportedBalance() async {
    try {
      final prefs = await SharedPreferences.getInstance();
      final bal = prefs.getDouble(_keySmsBalance);
      if (bal == null || bal <= 0) return;
      _smsReportedBalance = bal;
      _smsReportedBank = prefs.getString(_keySmsBalanceBank);
      final at = prefs.getInt(_keySmsBalanceAt);
      if (at != null && at > 0) {
        _smsReportedAt = DateTime.fromMillisecondsSinceEpoch(at);
      }
    } catch (_) {}
  }

  Future<void> _persistSmsReportedBalance() async {
    try {
      final prefs = await SharedPreferences.getInstance();
      final bal = _smsReportedBalance;
      if (bal == null || bal <= 0) return;
      await prefs.setDouble(_keySmsBalance, bal);
      await prefs.setString(_keySmsBalanceBank, _smsReportedBank ?? '');
      final at = _smsReportedAt;
      if (at != null) {
        await prefs.setInt(_keySmsBalanceAt, at.millisecondsSinceEpoch);
      }
    } catch (_) {}
  }

  /// Surfaces the SMS-reported balance in Safe-to-Spend/Total Balance **only**
  /// when the server has no account balance to show. Uses the server's own
  /// formula (`max(0, available − committed)`) against the commitment figures
  /// already loaded, so nothing about the money is estimated.
  void _applySmsBalanceOverlay() {
    final sms = _smsReportedBalance;
    if (sms == null || sms <= 0) return;
    // Real linked-account data always wins over the SMS mirror.
    if (_safeToSpend.availableBalance > 0 &&
        _safeToSpend.availableBalance != sms) {
      _isBalanceSmsMirrored = false;
      return;
    }

    final committed = _safeToSpend.upcomingMandatoryBills +
        _safeToSpend.activeEmiObligations +
        _safeToSpend.committedSavings +
        _safeToSpend.emergencyReserveAllocation;
    final safe = sms - committed > 0 ? sms - committed : 0.0;

    final at = _smsReportedAt;
    String when = '';
    if (at != null) {
      String two(int v) => v.toString().padLeft(2, '0');
      when = ' on ${two(at.day)} ${_monthShort(at.month)} ${at.year} '
          '${two(at.hour)}:${two(at.minute)}';
    }

    _safeToSpend = SafeToSpendData(
      totalBalance: sms,
      availableBalance: sms,
      upcomingMandatoryBills: _safeToSpend.upcomingMandatoryBills,
      activeEmiObligations: _safeToSpend.activeEmiObligations,
      committedSavings: _safeToSpend.committedSavings,
      emergencyReserveAllocation: _safeToSpend.emergencyReserveAllocation,
      safeToSpend: safe,
      explanation:
          'Mirrored from the balance ${_smsReportedBank ?? 'your bank'} last '
          'reported by SMS$when — your real account balance, not a FinPocket '
          'estimate. Committed bills, EMIs and savings are subtracted as usual.',
    );
    _isBalanceSmsMirrored = true;
  }

  /// Event-driven SMS sync — the native content observer fires the instant a
  /// bank SMS lands. Debounced (Android often delivers several onChange pokes
  /// for a single message); the 10-minute timer stays only as a backstop.
  Timer? _smsArrivalDebounce;

  Future<void> _watchIncomingBankSms() async {
    try {
      await BankSmsParserService.watchIncomingSms(() {
        _smsArrivalDebounce?.cancel();
        _smsArrivalDebounce = Timer(const Duration(seconds: 2), () {
          unawaited(_silentSmsSyncIfConsented());
        });
      });
    } catch (e) {
      debugPrint('[AppState] SMS arrival watcher unavailable: $e');
    }
  }

  /// Silent, consent-gated SMS sync powering the automatic credit heads-up.
  /// Runs the local SMS mirror unless it is already running. Returns whether
  /// a sync actually started, so callers can throttle real attempts only —
  /// a bail-out (no session yet / no consent) must stay retryable.
  ///
  /// NOTE: `init()` can execute this *before* the session is restored, in
  /// which case `_currentUser` is still null and the sync is skipped. The
  /// mirror therefore also runs from [refreshAllData], which fires once the
  /// session is live — otherwise the device's balance and transactions stay
  /// frozen until the 10-minute timer.
  Future<bool> _silentSmsSyncIfConsented() async {
    if (_currentUser == null || _isDemoMode || _isSmsSyncing) return false;
    try {
      final consented = await LocalTransactionStorageService.isSmsSyncConsentGranted();
      // Consent is recorded the first time the user opts into import (the
      // "Sync SMS" button or the connect-bank mirror flow). Users who opted
      // in before that recording existed are recognised by a completed sync
      // on this device — otherwise automation would silently never start.
      if (!consented && _lastSmsSyncTime == null) return false;
      _lastSilentSmsSyncAttempt = DateTime.now();
      await syncBankSmsTransactions();
      return true;
    } catch (e) {
      debugPrint('[AppState] Automatic SMS sync skipped: $e');
      return false;
    }
  }

  DateTime? _lastSilentSmsSyncAttempt;

  /// Ensures the on-device mirror is fresh, throttled to one real attempt per
  /// 90 seconds so pull-to-refresh storms cannot hammer the SMS inbox.
  void _ensureFreshSmsMirror() {
    if (AppConfig.environment == AppEnvironment.test) return;
    final last = _lastSilentSmsSyncAttempt;
    if (last != null && DateTime.now().difference(last) < const Duration(seconds: 90)) {
      return;
    }
    unawaited(_silentSmsSyncIfConsented());
  }

  /// Heads-up for every real credit (salary / UPI inflow) the app *newly*
  /// observes — whether it arrived via on-device bank SMS import or a real
  /// AA-synced statement. Approved behaviour: SMS + AA both, full summary,
  /// in-app bell + Android heads-up (addNotification posts both).
  ///
  /// Only genuinely new credits fire (deduplicated by transaction id, bank
  /// reference and notification id), and only recent ones (24 h) so restoring
  /// a backup or re-logging in never replays old history as fresh alerts.
  void _notifyNewCredits(List<Transaction> before, List<Transaction> after) {
    final knownIds = before.map((t) => t.id).toSet();
    final knownRefs = before.map((t) => t.referenceId).where((r) => r.isNotEmpty).toSet();
    final cutoff = DateTime.now().subtract(const Duration(hours: 24));

    for (final t in after) {
      if (t.type != TransactionType.INCOME || t.status != TransactionStatus.SUCCESSFUL) continue;
      if (knownIds.contains(t.id)) continue;
      if (t.referenceId.isNotEmpty && knownRefs.contains(t.referenceId)) continue;
      if (t.timestamp.isBefore(cutoff)) continue;
      if (_notifiedCreditIds.contains(t.id)) continue;

      final from = t.sender.isNotEmpty ? t.sender : 'an external source';
      // Real values only: the balance / Safe-to-Spend clauses are appended
      // only when those figures are actually known (> 0) for this user.
      final summary = StringBuffer('₹${t.amount.toStringAsFixed(2)} credited from $from');
      if (totalAvailableBalance > 0) {
        summary.write(' • New balance ₹${totalAvailableBalance.toStringAsFixed(2)}');
      }
      if (safeToSpend.safeToSpend > 0) {
        summary.write(' • Safe-to-Spend now ₹${safeToSpend.safeToSpend.toStringAsFixed(2)}');
      }

      addNotification(AppNotification(
        id: 'credit_${t.id}',
        title: 'Money Received: ₹${t.amount.toStringAsFixed(2)}',
        message: summary.toString(),
        type: NotificationType.sms,
        timestamp: DateTime.now(),
        data: {
          'amount': t.amount,
          'sender': t.sender,
          'transactionId': t.id,
          'referenceId': t.referenceId,
        },
      ));
      _notifiedCreditIds.add(t.id);
      unawaited(_persistNotifiedCreditIds());
    }
  }

  /// Synchronize real bank transactions from local Android SMS inbox
  Future<int> syncBankSmsTransactions({bool forceRequestPermission = false}) async {
    _isSmsSyncing = true;
    notifyListeners();

    try {
      bool hasPerm = await BankSmsParserService.hasSmsPermission();
      if (!hasPerm) {
        if (forceRequestPermission) {
          hasPerm = await BankSmsParserService.requestSmsPermission();
        }
      }

      if (!hasPerm) {
        _isSmsSyncing = false;
        notifyListeners();
        return 0;
      }

      final parsed = await BankSmsParserService.fetchAndParseBankSms();
      if (parsed.isEmpty) {
        final cleaned = await LocalTransactionStorageService.loadLocalTransactions();
        _transactions = cleaned;
        await LocalTransactionStorageService.recordSmsSyncTime();
        _lastSmsSyncTime = DateTime.now();
        _isSmsSyncing = false;
        notifyListeners();
        return 0;
      }

      final smsTxns = parsed.map((p) => p.transaction).toList();
      final txnsBeforeSync = List<Transaction>.of(_transactions);
      final updatedList = await LocalTransactionStorageService.mergeWithLocalTransactions(smsTxns);
      final countAdded = updatedList.length - txnsBeforeSync.length;
      _transactions = updatedList;

      // Centralized PostgreSQL synchronization:
      // Pushes parsed transactions to PostgreSQL on finpocket_server so they
      // are permanently and privately stored on the central database (multi-user safe).
      unawaited(ApiService.syncTransactions(smsTxns));

      // Real balance the bank itself stated in its newest SMS ("Avl Bal INR
      // 48,250.00"). Persisted and surfaced even when no AA account exists —
      // it is the bank's own figure, never computed by the app. Runs BEFORE
      // the heads-up so the alert quotes the post-credit balance.
      ParsedBankSms? latestWithBal;
      for (final p in parsed) {
        final bal = p.availableBalanceAfter;
        if (bal == null || bal <= 0) continue;
        if (latestWithBal == null ||
            p.transaction.timestamp.isAfter(latestWithBal.transaction.timestamp)) {
          latestWithBal = p;
        }
      }
      if (latestWithBal != null) {
        _smsReportedBalance = latestWithBal.availableBalanceAfter!;
        _smsReportedBank = latestWithBal.bankName;
        _smsReportedAt = latestWithBal.transaction.timestamp;
        unawaited(_persistSmsReportedBalance());
        if (_bankAccounts.isEmpty) {
          _ensureSmsMirroredAccount(latestWithBal);
        } else {
          // Only the mirrored row follows the SMS figure; a linked account's
          // balance stays whatever the bank/AA last reported.
          for (final acct in _bankAccounts) {
            if (acct.providerType == 'SMS_MIRROR') {
              acct.availableBalance = _smsReportedBalance!;
            }
          }
        }
        _applySmsBalanceOverlay();
      }

      // Salary/credit heads-up for credits this sync newly revealed
      // (balance & Safe-to-Spend clauses now reflect the figure above).
      _notifyNewCredits(txnsBeforeSync, _transactions);

      await LocalTransactionStorageService.recordSmsSyncTime();
      _lastSmsSyncTime = DateTime.now();

      return countAdded > 0 ? countAdded : parsed.length;
    } catch (e) {
      debugPrint('[AppState] Error syncing bank SMS: $e');
      return 0;
    } finally {
      _isSmsSyncing = false;
      notifyListeners();
    }
  }

  /// Creates the account row for an SMS-mirrored balance when the server has
  /// no linked account. Every field is real: the bank named by the sender ID,
  /// the masked digits printed in the SMS and the balance the bank stated.
  /// `providerType` is `SMS_MIRROR` (never `MOCK`), so it can never read as a
  /// demo/dummy account.
  void _ensureSmsMirroredAccount(ParsedBankSms parsed) {
    if (_bankAccounts.isNotEmpty) return;
    final bal = parsed.availableBalanceAfter;
    if (bal == null || bal <= 0) return;

    _bankAccounts = [
      BankAccount(
        id: 'sms_mirror_${parsed.bankName.toLowerCase().replaceAll(RegExp(r'[^a-z0-9]+'), '_')}',
        bankName: parsed.bankName,
        accountType: 'SAVINGS',
        maskedAccountNumber: parsed.maskedAccount ?? '••••',
        availableBalance: bal,
        isPrimary: true,
        status: 'ACTIVE',
        providerType: 'SMS_MIRROR',
        freshnessStatus: 'CURRENT',
        lastSynced: parsed.transaction.timestamp,
      ),
    ];
  }

  /// Toggle local on-device transaction vault state
  Future<void> setLocalVaultActive(bool active) async {
    _isLocalVaultActive = active;
    await LocalTransactionStorageService.setVaultConsent(active);
    notifyListeners();
  }

  // Emergency Fund operations
  Future<Map<String, dynamic>> depositEmergencyFund(double amount, {BuildContext? overlayContext}) async {
    if (amount <= 0) {
      return {'success': false, 'message': 'Please enter an amount greater than ₹0.'};
    }

    if (_bankAccounts.isNotEmpty && _bankAccounts[0].availableBalance < amount) {
      return {
        'success': false,
        'message': 'Insufficient funds in ${_bankAccounts[0].bankName} (Available: ₹${_bankAccounts[0].availableBalance.toStringAsFixed(0)}).'
      };
    }

    try {
      await ApiService.depositEmergencyFund(amount);
    } catch (e) {
      final raw = e.toString().replaceFirst('Exception: ', '');
      final unreachable = raw.contains('SocketException') ||
          raw.contains('Connection refused') ||
          raw.contains('Connection closed') ||
          raw.contains('TimeoutException') ||
          raw.contains('ClientException') ||
          raw.contains('XMLHttpRequest') ||
          raw.contains('No host specified');
      debugPrint('[AppState] Emergency-fund deposit not recorded: $e');
      return {
        'success': false,
        'message': unreachable
            ? 'Could not reach the server, so your Emergency Fund was NOT changed. Please try again.'
            : raw,
      };
    }

    final bankInfo = _bankAccounts.isNotEmpty
        ? '${_bankAccounts[0].bankName} A/c ${_bankAccounts[0].maskedAccountNumber}'
        : null;
    final refId = 'EMG/DEP/${DateTime.now().millisecondsSinceEpoch}';

    await refreshAllData();
    final notif = AppNotification(
      id: 'sms_dep_${DateTime.now().millisecondsSinceEpoch}',
      title: '₹${amount.toStringAsFixed(2)} Transferred to Emergency Shield',
      message: bankInfo != null
          ? 'Debited from $bankInfo to Emergency Shield Reserve. New Shield Bal: ₹${_emergencyFund.currentAmount.toStringAsFixed(2)}. Ref: $refId.'
          : 'Moved ₹${amount.toStringAsFixed(2)} into Emergency Shield Reserve. New Shield Bal: ₹${_emergencyFund.currentAmount.toStringAsFixed(2)}. Ref: $refId.',
      type: NotificationType.sms,
      timestamp: DateTime.now(),
      data: {'amount': amount, 'referenceId': refId, 'sourceAccount': bankInfo},
    );
    addNotification(notif, overlayContext: (overlayContext != null && overlayContext.mounted) ? overlayContext : null);
    return {
      'success': true,
      'amount': amount,
      'newBalance': _emergencyFund.currentAmount,
      'message': 'Successfully transferred ₹${amount.toStringAsFixed(0)} to Emergency Fund!'
    };
  }

  Future<Map<String, dynamic>> withdrawEmergencyFund(
    double amount,
    String reason,
    String pin, {
    BuildContext? overlayContext,
  }) async {
    if (_emergencyFund.isLocked) {
      return {
        'success': false,
        'message': 'Emergency Fund is currently LOCKED. Please unlock the fund using your PIN before withdrawing.'
      };
    }

    if (amount <= 0) {
      return {'success': false, 'message': 'Please enter a valid amount greater than ₹0.'};
    }

    if (amount > _emergencyFund.currentAmount) {
      return {
        'success': false,
        'message': 'Withdrawal amount exceeds current Emergency Fund balance (₹${_emergencyFund.currentAmount.toStringAsFixed(0)}).'
      };
    }

    // PIN correctness is decided by the server (bcrypt compare on
    // /savings/emergency-fund/withdraw) — the old local check compared against
    // a fabricated '1234' fallback that rejected every real PIN.

    try {
      await ApiService.withdrawEmergencyFund(amount, reason, pin);
    } catch (e) {
      // Real-data rule: if the server can't record the withdrawal, report the
      // failure. Server-side validation failures (invalid PIN, lock, limits)
      // carry their own message; transport failures get the honest
      // unreachable copy.
      // (The old local fallback decremented the fund, faked an
      // INCOME ledger row — inflating Income totals — and mutated balances,
      // all of which silently reverted on the next refresh anyway.)
      final raw = e.toString().replaceFirst('Exception: ', '');
      final unreachable = raw.contains('SocketException') ||
          raw.contains('Connection refused') ||
          raw.contains('Connection closed') ||
          raw.contains('TimeoutException') ||
          raw.contains('ClientException') ||
          raw.contains('XMLHttpRequest') ||
          raw.contains('No host specified');
      debugPrint('[AppState] Emergency-fund withdrawal not recorded: $e');
      return {
        'success': false,
        'message': unreachable
            ? 'Could not reach the server, so your Emergency Fund was NOT changed. Please try again.'
            : raw,
      };
    }

    final bankInfo = _bankAccounts.isNotEmpty
        ? '${_bankAccounts[0].bankName} A/c ${_bankAccounts[0].maskedAccountNumber}'
        : null;
    final refId = 'EMG/WDR/${DateTime.now().millisecondsSinceEpoch}';

    await refreshAllData();
    final notif = AppNotification(
      id: 'sms_wdr_${DateTime.now().millisecondsSinceEpoch}',
      title: bankInfo != null
          ? '₹${amount.toStringAsFixed(2)} Credited to $bankInfo'
          : '₹${amount.toStringAsFixed(2)} Withdrawn from Emergency Shield',
      message: 'Withdrawn from Emergency Shield Reserve (${reason.isNotEmpty ? reason : "Urgent needs"}). Available Bal: ₹${totalAvailableBalance.toStringAsFixed(2)}. Ref: $refId. -FinPocket${bankInfo != null ? ' Bank Alert' : ''}',
      type: NotificationType.sms,
      timestamp: DateTime.now(),
      data: {'amount': amount, 'referenceId': refId, 'sourceAccount': bankInfo, 'reason': reason},
    );
    addNotification(notif, overlayContext: (overlayContext != null && overlayContext.mounted) ? overlayContext : null);

    notifyListeners();
    return {
      'success': true,
      'amount': amount,
      'newBalance': _emergencyFund.currentAmount,
      'message': 'Successfully withdrawn ₹${amount.toStringAsFixed(0)}${bankInfo != null ? ' to primary bank account' : ' from Emergency Shield Reserve'}.'
    };
  }

  Future<void> toggleLockEmergencyFund(bool lock) async {
    try {
      await ApiService.toggleEmergencyLock(lock);
    } catch (e) {
      debugPrint('[AppState] Lock toggle remote notice: $e');
    } finally {
      _emergencyFund.isLocked = lock;
      _emergencyFund.auditLog.insert(
        0,
        EmergencyFundAudit(
          id: 'aud_${DateTime.now().millisecondsSinceEpoch}',
          action: lock ? 'LOCK' : 'UNLOCK',
          timestamp: DateTime.now(),
          reason: lock ? 'Emergency Fund Locked' : 'Emergency Fund Unlocked via PIN',
        ),
      );
      notifyListeners();
    }
  }

  // Bills & EMI
  Future<bool> markBillPaid(String id) async {
    try {
      await ApiService.markBillPaid(id);
      await refreshAllData();
      return true;
    } catch (e) {
      debugPrint('[AppState] Mark bill paid failed: $e');
      return false;
    }
  }

  // Child Care Mode
  /// Server-verified App PIN check (bcrypt digest stays server-side).
  /// TEST/DEMO environments intentionally run without a backend — those
  /// harnesses validate locally by design, mirroring the server's own
  /// TEST/DEMO allowances. Every other environment hits `/auth/pin/verify`.
  Future<bool> verifyAppPin(String pin) async {
    if (AppConfig.isTest || AppConfig.isDemo) return true;
    try {
      return await ApiService.verifyAppPin(pin);
    } catch (e) {
      debugPrint('[AppState] PIN verification unreachable: $e');
      return false;
    }
  }

  /// The PIN gate lives in the opening dialog (server-verified); these are the
  /// plain toggles it applies afterwards. They used to re-compare against a
  /// fabricated local '1234' value that rejected every real PIN.
  void enableChildCare() {
    _childCare.enabled = true;
    notifyListeners();
    _persistChildCare(true);
  }

  void disableChildCare() {
    _childCare.enabled = false;
    notifyListeners();
    _persistChildCare(false);
  }

  /// Child Care blocks all payments — a safety feature must survive restarts.
  /// Without this it silently turned itself off every time the app was closed.
  Future<void> _persistChildCare(bool enabled) async {
    try {
      final prefs = await SharedPreferences.getInstance();
      await prefs.setBool('fp_childcare_enabled', enabled);
    } catch (_) {}
  }

  // Security Center Data
  Future<void> fetchSecurityData() async {
    try {
      _auditLogs = await ApiService.getAuditLogs();
      _devices = await ApiService.getDevices();
      notifyListeners();
    } catch (e) {
      debugPrint('[AppState] Fetch security data error: $e');
    }
  }

  Future<void> revokeDevice(String deviceId) async {
    try {
      await ApiService.revokeDevice(deviceId);
      await fetchSecurityData();
    } catch (e) {
      debugPrint('[AppState] Revoke device error: $e');
    }
  }

  // Phase 5A: Account Aggregator & Financial Data Provider Integration
  Future<bool> syncProviderAccounts() async {
    try {
      _isLoading = true;
      notifyListeners();
      final res = await ApiService.syncProviderData();
      await refreshAllData();
      return res['success'] == true;
    } catch (e) {
      debugPrint('[AppState] Provider data sync error: $e');
      return false;
    } finally {
      _isLoading = false;
      notifyListeners();
    }
  }

  Future<bool> unlinkBankAccount(String accountId) async {
    try {
      final res = await ApiService.unlinkAccount(accountId);
      if (res['success'] == true) {
        await refreshAllData();
        return true;
      }
      return false;
    } catch (e) {
      debugPrint('[AppState] Unlink account error: $e');
      return false;
    }
  }

  // Category helpers
  String _categoryToId(TransactionCategory cat) {
    switch (cat) {
      case TransactionCategory.Food: return 'cat_food';
      case TransactionCategory.Shopping: return 'cat_shop';
      case TransactionCategory.Travel: return 'cat_travel';
      case TransactionCategory.Bills: return 'cat_bills';
      case TransactionCategory.Rent: return 'cat_rent';
      case TransactionCategory.Salary: return 'cat_salary';
      case TransactionCategory.EMI: return 'cat_emi';
      case TransactionCategory.Health: return 'cat_health';
      default: return 'cat_other';
    }
  }
}
