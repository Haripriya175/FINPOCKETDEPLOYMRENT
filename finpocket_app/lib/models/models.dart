
enum SupportedLanguage { en, te, hi, ta, kn, ml, mr, bn }

enum TransactionType { INCOME, EXPENSE, TRANSFER }

enum TransactionStatus { PROCESSING, SUCCESSFUL, FAILED, CANCELLED, REFUNDED }

enum TransactionCategory {
  Food,
  Shopping,
  Travel,
  Bills,
  Education,
  Entertainment,
  Health,
  Rent,
  EMI,
  Investment,
  Savings,
  Salary,
  Other
}

extension TransactionCategoryExt on TransactionCategory {
  String get name => toString().split('.').last;
}

extension TransactionStatusExt on TransactionStatus {
  String get name => toString().split('.').last;
}

extension TransactionTypeExt on TransactionType {
  String get name => toString().split('.').last;
}

class User {
  final String userId;
  final String fullName;
  final String email;
  final String phone;
  final String role;
  final SupportedLanguage preferredLanguage;
  final bool biometricsEnabled;
  final bool appPinEnabled;
  final String? pinHash;
  final String createdAt;
  final bool phoneVerified;
  final bool emailVerified;
  final String maskedPhone;
  final String maskedName;
  final String? ssoProvider;

  /// The UPI ID this user actually owns (shown in their own UPI app).
  /// Null until they enter it — FinPocket never generates a VPA.
  final String? upiId;

  User({
    required this.userId,
    required this.fullName,
    required this.email,
    this.phone = '',
    this.role = 'USER',
    this.preferredLanguage = SupportedLanguage.en,
    this.biometricsEnabled = true,
    this.appPinEnabled = true,
    this.pinHash,
    required this.createdAt,
    this.phoneVerified = false,
    this.emailVerified = false,
    this.maskedPhone = '',
    this.maskedName = '',
    this.ssoProvider,
    this.upiId,
  });

  String get id => userId;
  String get name => fullName;
  bool get isGoogleLinked => ssoProvider == 'google';
  bool get isMetaLinked => ssoProvider == 'meta' || ssoProvider == 'facebook';
  bool get isFullyVerified => emailVerified && (phone.isEmpty || phoneVerified);

  factory User.fromJson(Map<String, dynamic> json) {
    return User(
      userId: json['id'] ?? json['userId'] ?? '',
      fullName: json['name'] ?? json['fullName'] ?? 'User',
      email: json['email'] ?? '',
      phone: json['phone'] ?? '',
      role: json['role'] ?? 'USER',
      preferredLanguage: SupportedLanguage.values.firstWhere(
        (l) => l.name == (json['preferredLanguage'] ?? json['preferred_language'] ?? 'en'),
        orElse: () => SupportedLanguage.en,
      ),
      biometricsEnabled: json['biometricsEnabled'] == true || json['biometrics_enabled'] == 1,
      appPinEnabled: json['appPinEnabled'] == true || json['app_pin_enabled'] == true,
      pinHash: json['pinHash'] as String?,
      createdAt: json['createdAt'] ?? json['created_at'] ?? DateTime.now().toIso8601String(),
      phoneVerified: json['isPhoneVerified'] == true || json['phone_verified'] == 1 || json['phoneVerified'] == true,
      emailVerified: json['isEmailVerified'] == true || json['email_verified'] == 1 || json['emailVerified'] == true,
      maskedPhone: json['maskedPhone'] ?? '',
      maskedName: json['maskedName'] ?? '',
      ssoProvider: json['ssoProvider'] ?? json['sso_provider'],
      upiId: json['upiId'] ?? json['upi_id'],
    );
  }

  User copyWith({
    String? fullName,
    String? email,
    String? phone,
    SupportedLanguage? preferredLanguage,
    bool? biometricsEnabled,
    bool? appPinEnabled,
    String? pinHash,
    bool? phoneVerified,
    bool? emailVerified,
    String? maskedPhone,
    String? maskedName,
    String? ssoProvider,
    String? upiId,
  }) {
    return User(
      userId: userId,
      fullName: fullName ?? this.fullName,
      email: email ?? this.email,
      phone: phone ?? this.phone,
      role: role,
      preferredLanguage: preferredLanguage ?? this.preferredLanguage,
      biometricsEnabled: biometricsEnabled ?? this.biometricsEnabled,
      appPinEnabled: appPinEnabled ?? this.appPinEnabled,
      pinHash: pinHash ?? this.pinHash,
      createdAt: createdAt,
      phoneVerified: phoneVerified ?? this.phoneVerified,
      emailVerified: emailVerified ?? this.emailVerified,
      maskedPhone: maskedPhone ?? this.maskedPhone,
      maskedName: maskedName ?? this.maskedName,
      ssoProvider: ssoProvider ?? this.ssoProvider,
      upiId: upiId ?? this.upiId,
    );
  }
}

class Transaction {
  final String id;
  final String userId;
  final String sender;
  final String receiver;
  final double amount;
  final TransactionType type;
  final TransactionCategory category;
  final TransactionStatus status;
  final DateTime timestamp;
  final String referenceId;
  final String description;
  final String paymentMethod;
  final String? merchant;

  Transaction({
    required this.id,
    required this.userId,
    required this.sender,
    required this.receiver,
    required this.amount,
    required this.type,
    required this.category,
    required this.status,
    required this.timestamp,
    required this.referenceId,
    required this.description,
    this.paymentMethod = 'UPI',
    this.merchant,
  });

  DateTime get date => timestamp;
  bool get isExpense => type == TransactionType.EXPENSE;

  factory Transaction.fromJson(Map<String, dynamic> json) {
    // Determine category
    final catStr = (json['category_name'] ?? json['category'] ?? json['category_id'] ?? '').toString().toLowerCase();
    TransactionCategory cat = TransactionCategory.Other;
    if (catStr.contains('food')) {
      cat = TransactionCategory.Food;
    } else if (catStr.contains('shop')) {
      cat = TransactionCategory.Shopping;
    } else if (catStr.contains('travel')) {
      cat = TransactionCategory.Travel;
    } else if (catStr.contains('bill')) {
      cat = TransactionCategory.Bills;
    } else if (catStr.contains('rent')) {
      cat = TransactionCategory.Rent;
    } else if (catStr.contains('salary') || catStr.contains('income')) {
      cat = TransactionCategory.Salary;
    } else if (catStr.contains('emi') || catStr.contains('loan')) {
      cat = TransactionCategory.EMI;
    } else if (catStr.contains('health')) {
      cat = TransactionCategory.Health;
    } else if (catStr.contains('entertain')) {
      cat = TransactionCategory.Entertainment;
    }

    // Determine type
    final typeStr = (json['type'] ?? 'EXPENSE').toString().toUpperCase();
    final type = typeStr == 'INCOME' ? TransactionType.INCOME : typeStr == 'TRANSFER' ? TransactionType.TRANSFER : TransactionType.EXPENSE;

    // Determine status
    final statusStr = (json['status'] ?? 'SUCCESSFUL').toString().toUpperCase();
    final status = statusStr == 'PROCESSING'
        ? TransactionStatus.PROCESSING
        : statusStr == 'FAILED'
            ? TransactionStatus.FAILED
            : statusStr == 'CANCELLED'
                ? TransactionStatus.CANCELLED
                : TransactionStatus.SUCCESSFUL;

    // Parse date
    DateTime ts = DateTime.now();
    final dateVal = json['transaction_date'] ?? json['created_at'] ?? json['timestamp'];
    if (dateVal != null) {
      final parsed = DateTime.tryParse(dateVal.toString());
      if (parsed != null) ts = parsed;
    }

    return Transaction(
      id: json['id'] ?? 'FP_${DateTime.now().millisecondsSinceEpoch}',
      userId: json['user_id'] ?? json['userId'] ?? '',
      sender: json['sender'] ?? 'User',
      receiver: json['receiver'] ?? json['merchant'] ?? 'Merchant',
      amount: (json['amount'] as num?)?.toDouble() ?? 0.0,
      type: type,
      category: cat,
      status: status,
      timestamp: ts,
      referenceId: json['reference_id'] ?? json['referenceId'] ?? '',
      description: json['description'] ?? '',
      paymentMethod: json['payment_method'] ?? json['paymentMethod'] ?? 'UPI',
      merchant: json['merchant'],
    );
  }

  Map<String, dynamic> toJson() {
    return {
      'id': id,
      'user_id': userId,
      'sender': sender,
      'receiver': receiver,
      'amount': amount,
      'type': type.toString().split('.').last,
      'category': category.toString().split('.').last,
      'status': status.toString().split('.').last,
      'timestamp': timestamp.toIso8601String(),
      'reference_id': referenceId,
      'description': description,
      'payment_method': paymentMethod,
      'merchant': merchant,
    };
  }
}

class BankAccount {
  final String id;
  final String bankName;
  final String accountType; // SAVINGS, CURRENT, SALARY
  final String maskedAccountNumber;
  double availableBalance;
  final bool isPrimary;
  final String status;
  final String providerType; // MOCK, ACCOUNT_AGGREGATOR, FAKE_TEST_PROVIDER
  final String freshnessStatus; // CURRENT, STALE, SYNCING, FAILED, NEVER_SYNCED
  final DateTime lastSynced;

  BankAccount({
    required this.id,
    required this.bankName,
    required this.accountType,
    required this.maskedAccountNumber,
    required this.availableBalance,
    this.isPrimary = false,
    this.status = 'ACTIVE',
    this.providerType = 'MOCK',
    this.freshnessStatus = 'CURRENT',
    required this.lastSynced,
  });

  String get name => bankName;
  String get type => accountType;
  double get balance => availableBalance;

  bool get isDemo => providerType == 'MOCK' || providerType == 'FAKE_TEST_PROVIDER';
}

class SavingsGoal {
  final String id;
  final String userId;
  final String name;
  final double targetAmount;
  double currentAmount;
  final DateTime targetDate;
  final double monthlyContribution;
  final String category;
  String status; // IN_PROGRESS, COMPLETED
  final DateTime createdAt;

  SavingsGoal({
    required this.id,
    required this.userId,
    required this.name,
    required this.targetAmount,
    required this.currentAmount,
    required this.targetDate,
    required this.monthlyContribution,
    required this.category,
    this.status = 'IN_PROGRESS',
    required this.createdAt,
  });

  String get title => name;

  bool get isCompleted => status == 'COMPLETED' || currentAmount >= targetAmount;

  double get progress =>
      targetAmount > 0 ? (currentAmount / targetAmount).clamp(0.0, 1.0) : 0.0;

  Map<String, dynamic> toJson() => {
        'id': id,
        'userId': userId,
        'name': name,
        'targetAmount': targetAmount,
        'currentAmount': currentAmount,
        'targetDate': targetDate.toIso8601String(),
        'monthlyContribution': monthlyContribution,
        'category': category,
        'status': status,
        'createdAt': createdAt.toIso8601String(),
      };

  factory SavingsGoal.fromJson(Map<String, dynamic> json) => SavingsGoal(
        id: json['id']?.toString() ?? '',
        userId: json['userId']?.toString() ?? '',
        name: json['name']?.toString() ?? 'Goal',
        targetAmount: (json['targetAmount'] as num?)?.toDouble() ?? 0.0,
        currentAmount: (json['currentAmount'] as num?)?.toDouble() ?? 0.0,
        targetDate: DateTime.tryParse(json['targetDate']?.toString() ?? '') ??
            DateTime.now().add(const Duration(days: 90)),
        monthlyContribution:
            (json['monthlyContribution'] as num?)?.toDouble() ?? 0.0,
        category: json['category']?.toString() ?? 'GENERAL',
        status: json['status']?.toString() ?? 'IN_PROGRESS',
        createdAt: DateTime.tryParse(json['createdAt']?.toString() ?? '') ??
            DateTime.now(),
      );
}

typedef Goal = SavingsGoal;

class EmergencyFundAudit {
  final String id;
  final String action; // DEPOSIT, WITHDRAW, LOCK, UNLOCK
  final double? amount;
  final DateTime timestamp;
  final String reason;

  EmergencyFundAudit({
    required this.id,
    required this.action,
    this.amount,
    required this.timestamp,
    required this.reason,
  });
}

class EmergencyFund {
  final String id;
  final String userId;
  double targetAmount;
  double currentAmount;
  bool isLocked;
  DateTime? lockedAt;
  double monthlyContribution;
  bool autoSaveEnabled;
  List<EmergencyFundAudit> auditLog;

  EmergencyFund({
    required this.id,
    required this.userId,
    required this.targetAmount,
    required this.currentAmount,
    this.isLocked = true,
    this.lockedAt,
    // Real-data rule: a new fund starts at ₹0 contribution until the user
    // sets one — never an assumed ₹5,000/month.
    this.monthlyContribution = 0.0,
    this.autoSaveEnabled = true,
    required this.auditLog,
  });
}

class AutoSaveRule {
  final String id;
  final String title;
  final double amount;
  final String frequency; // DAILY, PERCENT_INCOME
  final double? percentage;
  final String destination;
  bool isActive;

  AutoSaveRule({
    required this.id,
    required this.title,
    required this.amount,
    required this.frequency,
    this.percentage,
    required this.destination,
    this.isActive = true,
  });
}

class RecurringPayment {
  final String id;
  final String name;
  final double amount;
  final DateTime dueDate;
  final String category;
  final String recurrence;
  bool isPaidThisMonth;
  DateTime? lastPaidDate;

  RecurringPayment({
    required this.id,
    required this.name,
    required this.amount,
    required this.dueDate,
    required this.category,
    this.recurrence = 'MONTHLY',
    this.isPaidThisMonth = false,
    this.lastPaidDate,
  });

  String get title => name;
  bool get isPaid => isPaidThisMonth;
}

typedef Bill = RecurringPayment;
typedef Account = BankAccount;

class EMILoan {
  final String id;
  final String loanName;
  final double totalAmount;
  final double monthlyEMI;
  final int totalTenureMonths;
  int paidMonths;
  double remainingAmount;
  final double interestRate;
  final DateTime nextDueDate;
  bool isPaidThisMonth;

  EMILoan({
    required this.id,
    required this.loanName,
    required this.totalAmount,
    required this.monthlyEMI,
    required this.totalTenureMonths,
    required this.paidMonths,
    required this.remainingAmount,
    required this.interestRate,
    required this.nextDueDate,
    this.isPaidThisMonth = false,
  });

  int get remainingTenureMonths => (totalTenureMonths - paidMonths).clamp(0, totalTenureMonths);
  int get dueDayOfMonth => nextDueDate.day;
  String get bankOrLender => loanName;

  /// The EMI guidance loop runs until this flips to true.
  bool get isCleared => remainingAmount <= 0 || paidMonths >= totalTenureMonths;

  /// Days until the next instalment falls due (rolls into the coming month).
  int get daysUntilDue {
    final now = DateTime.now();
    var due = DateTime(now.year, now.month, dueDayOfMonth);
    if (due.isBefore(now)) {
      due = DateTime(now.year, now.month + 1, dueDayOfMonth);
    }
    return due.difference(now).inDays;
  }

  Map<String, dynamic> toJson() => {
        'id': id,
        'loanName': loanName,
        'totalAmount': totalAmount,
        'monthlyEMI': monthlyEMI,
        'totalTenureMonths': totalTenureMonths,
        'paidMonths': paidMonths,
        'remainingAmount': remainingAmount,
        'interestRate': interestRate,
        'nextDueDate': nextDueDate.toIso8601String(),
        'isPaidThisMonth': isPaidThisMonth,
      };

  factory EMILoan.fromJson(Map<String, dynamic> json) => EMILoan(
        id: json['id']?.toString() ?? '',
        loanName: json['loanName']?.toString() ?? 'Loan',
        totalAmount: (json['totalAmount'] as num?)?.toDouble() ?? 0.0,
        monthlyEMI: (json['monthlyEMI'] as num?)?.toDouble() ?? 0.0,
        totalTenureMonths: (json['totalTenureMonths'] as num?)?.toInt() ?? 0,
        paidMonths: (json['paidMonths'] as num?)?.toInt() ?? 0,
        remainingAmount: (json['remainingAmount'] as num?)?.toDouble() ?? 0.0,
        interestRate: (json['interestRate'] as num?)?.toDouble() ?? 0.0,
        nextDueDate: DateTime.tryParse(json['nextDueDate']?.toString() ?? '') ??
            DateTime.now().add(const Duration(days: 30)),
        isPaidThisMonth: json['isPaidThisMonth'] == true,
      );
}

class DocumentItem {
  final String id;
  final String name;
  final String documentType;
  final String? maskedNumber;
  final DateTime? expiryDate;
  final String fileType;
  final DateTime uploadDate;
  final bool isEncrypted;

  /// True when an encrypted image blob exists for this entry (written by
  /// `SecureVaultService`). The image itself is never held here — only the
  /// flag saying one is stored.
  final bool hasImage;

  DocumentItem({
    required this.id,
    required this.name,
    required this.documentType,
    this.maskedNumber,
    this.expiryDate,
    this.fileType = 'image/png',
    required this.uploadDate,
    this.isEncrypted = true,
    this.hasImage = false,
  });

  Map<String, dynamic> toJson() => {
        'id': id,
        'name': name,
        'documentType': documentType,
        'maskedNumber': maskedNumber,
        'expiryDate': expiryDate?.toIso8601String(),
        'fileType': fileType,
        'uploadDate': uploadDate.toIso8601String(),
        'isEncrypted': isEncrypted,
        'hasImage': hasImage,
      };

  factory DocumentItem.fromJson(Map<String, dynamic> json) => DocumentItem(
        id: json['id'] as String,
        name: json['name'] as String,
        documentType: json['documentType'] as String,
        maskedNumber: json['maskedNumber'] as String?,
        expiryDate: json['expiryDate'] != null
            ? DateTime.tryParse(json['expiryDate'] as String)
            : null,
        fileType: json['fileType'] as String? ?? 'image/png',
        uploadDate: DateTime.tryParse(json['uploadDate'] as String? ?? '') ??
            DateTime.now(),
        isEncrypted: json['isEncrypted'] as bool? ?? true,
        hasImage: json['hasImage'] as bool? ?? false,
      );
}

class ChildCareSettings {
  bool enabled;
  bool paymentBlocked;
  bool hideBalances;
  bool hideTransactionHistory;
  bool hideBankDetails;
  String? parentPin;

  ChildCareSettings({
    this.enabled = false,
    this.paymentBlocked = true,
    this.hideBalances = true,
    this.hideTransactionHistory = true,
    this.hideBankDetails = true,
    this.parentPin,
  });
}

class FinancialHealthScore {
  final int score;
  final String grade; // EXCELLENT, GOOD, FAIR, NEEDS_ATTENTION
  final List<String> positiveFactors;
  final List<String> warningFactors;

  FinancialHealthScore({
    required this.score,
    required this.grade,
    required this.positiveFactors,
    required this.warningFactors,
  });
}

enum NotificationType {
  sms,
  budgetAlert,
  dailyQuote,
  security,
  system,

  /// Month-by-month EMI coaching — kept distinct so it survives filtering and
  /// gets its own notification channel.
  emiReminder,
}

class AppNotification {
  final String id;
  final String title;
  final String message;
  final NotificationType type;
  final DateTime timestamp;
  bool isRead;
  final Map<String, dynamic>? data;

  AppNotification({
    required this.id,
    required this.title,
    required this.message,
    required this.type,
    required this.timestamp,
    this.isRead = false,
    this.data,
  });

  Map<String, dynamic> toJson() => {
    'id': id,
    'title': title,
    'message': message,
    'type': type.name,
    'timestamp': timestamp.toIso8601String(),
    'isRead': isRead,
    if (data != null) 'data': data,
  };

  factory AppNotification.fromJson(Map<String, dynamic> json) => AppNotification(
    id: json['id']?.toString() ?? '',
    title: json['title']?.toString() ?? '',
    message: json['message']?.toString() ?? '',
    type: NotificationType.values.firstWhere(
      (e) => e.name == json['type'],
      orElse: () => NotificationType.system,
    ),
    timestamp: DateTime.tryParse(json['timestamp']?.toString() ?? '') ?? DateTime.now(),
    isRead: json['isRead'] == true,
    data: json['data'] as Map<String, dynamic>?,
  );
}

/// Credit Card Statement model with Minimum Due Trap calculation
class CreditCardStatement {
  final String id;
  final String bankName;
  final String cardLast4;
  final double totalAmountDue;
  final double minimumAmountDue;
  final DateTime dueDate;
  final DateTime statementDate;
  final double aprRate; // Typical Indian bank APR ~42.0%
  final bool isPaid;
  final String? paymentVpa;

  CreditCardStatement({
    required this.id,
    required this.bankName,
    required this.cardLast4,
    required this.totalAmountDue,
    required this.minimumAmountDue,
    required this.dueDate,
    DateTime? statementDate,
    this.aprRate = 42.0,
    this.isPaid = false,
    this.paymentVpa,
  }) : statementDate = statementDate ?? DateTime.now();

  /// Days remaining until due date
  int get daysRemaining {
    final now = DateTime.now();
    final today = DateTime(now.year, now.month, now.day);
    final due = DateTime(dueDate.year, dueDate.month, dueDate.day);
    final diff = due.difference(today).inDays;
    return diff < 0 ? 0 : diff;
  }

  /// Compound interest penalty if user pays only Minimum Amount Due
  /// (Roughly 58% of balance in interest charges over the prolonged repayment cycle + 18% GST on interest)
  double get trapInterestCost {
    if (totalAmountDue <= minimumAmountDue) return 0.0;
    final unpaid = totalAmountDue - minimumAmountDue;
    return unpaid * 0.58;
  }

  /// Estimated months to clear debt if only paying minimum due (typically 36 - 60 months)
  int get monthsToPayoffMinOnly {
    if (minimumAmountDue <= 0 || totalAmountDue <= minimumAmountDue) return 1;
    final months = (totalAmountDue / (minimumAmountDue * 0.42)).round();
    return months.clamp(12, 60);
  }

  /// Direct UPI VPA to pay credit card in India
  String get defaultUpiVpa {
    if (paymentVpa != null && paymentVpa!.isNotEmpty) return paymentVpa!;
    final cleanBank = bankName.toLowerCase();
    if (cleanBank.contains('hdfc')) return 'hdfcbank.cc$cardLast4@hdfcbank';
    if (cleanBank.contains('sbi')) return 'sbicard.$cardLast4@sbi';
    if (cleanBank.contains('icici')) return 'icici.cc$cardLast4@icici';
    if (cleanBank.contains('axis')) return 'axis.cc$cardLast4@axisbank';
    if (cleanBank.contains('kotak')) return 'kotak.cc$cardLast4@kotak';
    return 'billpay.cc$cardLast4@upi';
  }

  Map<String, dynamic> toJson() => {
    'id': id,
    'bankName': bankName,
    'cardLast4': cardLast4,
    'totalAmountDue': totalAmountDue,
    'minimumAmountDue': minimumAmountDue,
    'dueDate': dueDate.toIso8601String(),
    'statementDate': statementDate.toIso8601String(),
    'aprRate': aprRate,
    'isPaid': isPaid,
    'paymentVpa': paymentVpa,
  };

  factory CreditCardStatement.fromJson(Map<String, dynamic> json) => CreditCardStatement(
    id: json['id']?.toString() ?? '',
    bankName: json['bankName']?.toString() ?? 'Credit Card',
    cardLast4: json['cardLast4']?.toString() ?? '0000',
    totalAmountDue: (json['totalAmountDue'] as num?)?.toDouble() ?? 0.0,
    minimumAmountDue: (json['minimumAmountDue'] as num?)?.toDouble() ?? 0.0,
    dueDate: DateTime.tryParse(json['dueDate']?.toString() ?? '') ?? DateTime.now().add(const Duration(days: 15)),
    statementDate: DateTime.tryParse(json['statementDate']?.toString() ?? '') ?? DateTime.now(),
    aprRate: (json['aprRate'] as num?)?.toDouble() ?? 42.0,
    isPaid: json['isPaid'] == true,
    paymentVpa: json['paymentVpa']?.toString(),
  );
}

/// Gamification Badge for financial milestones
class GamificationBadge {
  final String id;
  final String title;
  final String description;
  final String icon;
  final bool isUnlocked;
  final DateTime? unlockedAt;

  GamificationBadge({
    required this.id,
    required this.title,
    required this.description,
    required this.icon,
    this.isUnlocked = false,
    this.unlockedAt,
  });

  Map<String, dynamic> toJson() => {
    'id': id,
    'title': title,
    'description': description,
    'icon': icon,
    'isUnlocked': isUnlocked,
    'unlockedAt': unlockedAt?.toIso8601String(),
  };

  factory GamificationBadge.fromJson(Map<String, dynamic> json) => GamificationBadge(
    id: json['id']?.toString() ?? '',
    title: json['title']?.toString() ?? '',
    description: json['description']?.toString() ?? '',
    icon: json['icon']?.toString() ?? '🏆',
    isUnlocked: json['isUnlocked'] == true,
    unlockedAt: json['unlockedAt'] != null ? DateTime.tryParse(json['unlockedAt'].toString()) : null,
  );
}

/// Gamification Streak Data
class NoSpendStreakData {
  final int currentStreak;
  final int bestStreak;
  final String lastEvaluatedDate;
  final int totalDisciplinedDays;
  final List<String> unlockedBadgeIds;

  NoSpendStreakData({
    this.currentStreak = 0,
    this.bestStreak = 0,
    this.lastEvaluatedDate = '',
    this.totalDisciplinedDays = 0,
    this.unlockedBadgeIds = const [],
  });

  int get streakTier {
    if (currentStreak >= 30) return 4; // Master
    if (currentStreak >= 14) return 3; // Gold
    if (currentStreak >= 7) return 2;  // Silver
    if (currentStreak >= 3) return 1;  // Bronze
    return 0; // Novice
  }

  String get streakTierName {
    switch (streakTier) {
      case 4: return 'Budget Legend 👑';
      case 3: return 'Gold Discipline 🥇';
      case 2: return 'Silver Saver 🥈';
      case 1: return 'Bronze Streak 🥉';
      default: return 'Starter 🔥';
    }
  }

  Map<String, dynamic> toJson() => {
    'currentStreak': currentStreak,
    'bestStreak': bestStreak,
    'lastEvaluatedDate': lastEvaluatedDate,
    'totalDisciplinedDays': totalDisciplinedDays,
    'unlockedBadgeIds': unlockedBadgeIds,
  };

  factory NoSpendStreakData.fromJson(Map<String, dynamic> json) => NoSpendStreakData(
    currentStreak: (json['currentStreak'] as num?)?.toInt() ?? 0,
    bestStreak: (json['bestStreak'] as num?)?.toInt() ?? 0,
    lastEvaluatedDate: json['lastEvaluatedDate']?.toString() ?? '',
    totalDisciplinedDays: (json['totalDisciplinedDays'] as num?)?.toInt() ?? 0,
    unlockedBadgeIds: (json['unlockedBadgeIds'] as List<dynamic>?)?.map((e) => e.toString()).toList() ?? [],
  );
}
