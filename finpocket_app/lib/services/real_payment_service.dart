import 'dart:async';
import 'dart:io' show Platform;
import 'package:flutter/foundation.dart';
import 'package:flutter/services.dart';
import 'package:razorpay_flutter/razorpay_flutter.dart';
import '../models/models.dart';
import 'local_transaction_storage_service.dart';

/// Parsed details from a standard NPCI UPI QR code or VPA
class UpiQrDetails {
  final String vpa;
  final String name;
  final double? amount;
  final String? note;
  final String? transactionRef;
  final String? merchantCode;
  final String raw;

  UpiQrDetails({
    required this.vpa,
    required this.name,
    this.amount,
    this.note,
    this.transactionRef,
    this.merchantCode,
    required this.raw,
  });

  bool get isValid => vpa.isNotEmpty && vpa.contains('@');
}

/// Installed UPI Application on Android (GPay, PhonePe, Paytm, BHIM, etc.)
class InstalledUpiApp {
  final String packageName;
  final String appName;

  InstalledUpiApp({required this.packageName, required this.appName});
}

/// Result returned from real UPI banking app
class RealUpiPaymentResult {
  final bool isSuccess;
  final bool isFailure;
  final bool isCancelled;
  final String status;
  final String? txnId;
  final String? approvalRefNo;
  final String? responseCode;
  final String? rawResponse;
  final String? errorMessage;

  RealUpiPaymentResult({
    required this.isSuccess,
    required this.isFailure,
    required this.isCancelled,
    required this.status,
    this.txnId,
    this.approvalRefNo,
    this.responseCode,
    this.rawResponse,
    this.errorMessage,
  });
}

/// Result returned from official Razorpay payment gateway
class RazorpayCheckoutResult {
  final bool isSuccess;
  final bool isCancelled;
  final String? paymentId;
  final String? orderId;
  final String? signature;
  final String? errorMessage;
  final int? errorCode;

  RazorpayCheckoutResult({
    required this.isSuccess,
    this.isCancelled = false,
    this.paymentId,
    this.orderId,
    this.signature,
    this.errorMessage,
    this.errorCode,
  });
}

/// Real-world payment gateway provider configuration
enum PaymentGatewayProvider {
  upiApp,     // Real UPI Intent (GPay, PhonePe, Paytm, BHIM)
  razorpay,   // Razorpay Gateway (Cards, Netbanking, UPI, Wallets)
  wallet,     // In-App FinPocket Wallet Ledger
  cashfree,   // Cashfree Gateway
}

class PaymentGatewayConfig {
  static PaymentGatewayProvider activeProvider = PaymentGatewayProvider.upiApp;

  // Razorpay key_id is supplied at runtime by the backend order endpoint
  // (/payments/gateway/order) — the key_secret stays on the server only and is
  // never bundled in the app. Empty default = "ask the server".
  static String razorpayKeyId = '';

  // Cashfree API Credentials (also server-supplied when enabled)
  static String cashfreeAppId = '';
  static String cashfreeSecretKey = '';

  static bool get isRazorpayConfigured => razorpayKeyId.isNotEmpty;
  static bool get isCashfreeConfigured => cashfreeAppId.isNotEmpty;
}

/// Service handling real UPI banking app deep-links, QR parsing,
/// and local real-time persistence of transaction receipts.
class RealPaymentService {
  static const MethodChannel _channel = MethodChannel('com.finpocket/upi_payment');

  /// Parse a scanned QR code to see if it's an NPCI UPI QR code or VPA address
  static UpiQrDetails? parseUpiQr(String qrContent) {
    final text = qrContent.trim();
    if (text.isEmpty) return null;

    // 1. Full NPCI UPI URI: upi://pay?pa=recipient@bank&pn=Recipient%20Name...
    if (text.toLowerCase().startsWith('upi://pay')) {
      try {
        final uri = Uri.parse(text);
        final pa = uri.queryParameters['pa'] ?? '';
        final pn = uri.queryParameters['pn'] ?? '';
        final amStr = uri.queryParameters['am'];
        final tn = uri.queryParameters['tn'];
        final tr = uri.queryParameters['tr'] ?? uri.queryParameters['tid'];
        final mc = uri.queryParameters['mc'];

        double? amount;
        if (amStr != null && amStr.isNotEmpty) {
          amount = double.tryParse(amStr);
        }

        return UpiQrDetails(
          vpa: pa,
          name: pn.isNotEmpty ? Uri.decodeComponent(pn) : pa.split('@').first,
          amount: amount,
          note: tn != null ? Uri.decodeComponent(tn) : null,
          transactionRef: tr,
          merchantCode: mc,
          raw: text,
        );
      } catch (_) {
        // Fallback to query param regex
      }
    }

    // 2. Direct VPA format: user@okaxis, shop@paytm, merchant@icici, etc.
    final vpaRegex = RegExp(r'^([a-zA-Z0-9.\-_]{2,256}@[a-zA-Z]{2,64})$');
    if (vpaRegex.hasMatch(text)) {
      return UpiQrDetails(
        vpa: text,
        name: text.split('@').first,
        raw: text,
      );
    }

    // 3. Fallback: Search for pa= in arbitrary URL
    final paMatch = RegExp(r'[?&]pa=([^&]+)', caseSensitive: false).firstMatch(text);
    if (paMatch != null) {
      final vpa = Uri.decodeComponent(paMatch.group(1) ?? '');
      final pnMatch = RegExp(r'[?&]pn=([^&]+)', caseSensitive: false).firstMatch(text);
      final name = pnMatch != null ? Uri.decodeComponent(pnMatch.group(1) ?? '') : vpa;
      final amMatch = RegExp(r'[?&]am=([^&]+)', caseSensitive: false).firstMatch(text);
      final amount = amMatch != null ? double.tryParse(amMatch.group(1) ?? '') : null;

      return UpiQrDetails(
        vpa: vpa,
        name: name,
        amount: amount,
        raw: text,
      );
    }

    return null;
  }

  /// Returns true if [text] looks like a *pure* UPI VPA address — exactly
  /// `handle@bank`, where the part after `@` is a 2-6 char alphanumeric bank ID.
  ///
  /// Examples that return true: `user@okaxis`, `shop@paytm`, `9912788555-f6a9@ibl`.
  /// Examples that return false: `` (empty), `9876543210` (no `@`),
  /// `a@b@c` (too many parts), `x@toolongbankdomain` (bank id > 6 chars).
  ///
  /// This lives here rather than inline in the Payments screen so it can be
  /// unit-tested directly. It deliberately uses `parts[1]` — never
  /// `Iterable.single` — because `.single` throws `StateError: Too many
  /// elements` whenever the list has more than one element, which used to crash
  /// `_handlePay` on every VPA payment and leave the "Authenticate & Pay"
  /// button doing nothing at all.
  static bool isPureVpa(String raw) {
    final text = raw.trim();
    if (text.isEmpty) return false;
    final parts = text.split('@');
    // Exactly one '@', with a non-empty handle on the left and bank id on the
    // right. "@okaxis" (empty handle) and "user@" (empty bank) are unpayable,
    // so reject them rather than routing them down the wrong branch.
    if (parts.length != 2 || parts[0].isEmpty || parts[1].isEmpty) return false;
    final afterAt = parts[1];
    // Standard VPAs have 2-6 alphanumeric chars after @ (okaxis, paytm, ibl…)
    return afterAt.length >= 2 &&
        afterAt.length <= 6 &&
        RegExp(r'^[a-zA-Z0-9]+$').hasMatch(afterAt);
  }

  /// Query installed UPI apps on Android (e.g. Google Pay, PhonePe, Paytm, BHIM, Cred)
  static Future<List<InstalledUpiApp>> getInstalledUpiApps() async {
    if (kIsWeb || !Platform.isAndroid) return [];

    try {
      final list = await _channel.invokeMethod<List<dynamic>>('getInstalledUpiApps');
      if (list == null) return [];

      return list.map((item) {
        final map = item as Map;
        return InstalledUpiApp(
          packageName: map['packageName']?.toString() ?? '',
          appName: map['appName']?.toString() ?? 'UPI App',
        );
      }).toList();
    } catch (e) {
      debugPrint('[RealPaymentService] Error listing UPI apps: $e');
      return [];
    }
  }

  /// Launch the real UPI App Intent on the phone with the standard NPCI UPI protocol.
  /// Debits real money from the user's real bank account and sends it to the recipient.
  static Future<RealUpiPaymentResult> payWithRealUpi({
    required String vpa,
    required String name,
    required double amount,
    String? note,
    String? targetPackage,
    String? transactionRef,
    String? merchantCode,
    String? rawQrUri,
  }) async {
    final encName = Uri.encodeComponent(name.trim());
    final amtFormatted = amount.toStringAsFixed(2);

    // Standard NPCI UPI URI Specification:
    // IMPORTANT: NPCI & PhonePe enforce strict anti-fraud rules for P2P transactions.
    // Adding arbitrary 'tn=' (transaction note) on peer-to-peer VPAs (such as @axl, @ybl, @okaxis)
    // causes PhonePe to decline with: "Your payment is declined for security reasons. Please try using a mobile number, UPI ID, or QR code."
    // We only attach 'tn' when paying a registered merchant with 'merchantCode'.
    // For P2P, we keep the cleanest, compliant NPCI URI: upi://pay?pa=$vpa&pn=$encName&am=$amtFormatted&cu=INR
    final uriBuffer = StringBuffer('upi://pay?pa=$vpa&pn=$encName&am=$amtFormatted&cu=INR');
    if (merchantCode != null && merchantCode.isNotEmpty) {
      uriBuffer.write('&mc=$merchantCode');
      if (transactionRef != null && transactionRef.isNotEmpty) {
        uriBuffer.write('&tr=$transactionRef');
      }
      if (note != null && note.trim().isNotEmpty) {
        uriBuffer.write('&tn=${Uri.encodeComponent(note.trim())}');
      }
    }
    final upiUri = uriBuffer.toString();

    if (kIsWeb || !Platform.isAndroid) {
      // Mock / fallback for Web & test runner
      final refId = transactionRef ?? 'FP${DateTime.now().millisecondsSinceEpoch}';
      return RealUpiPaymentResult(
        isSuccess: true,
        isFailure: false,
        isCancelled: false,
        status: 'SUCCESS',
        txnId: 'TXN_$refId',
        approvalRefNo: 'APP_$refId',
        rawResponse: 'Status=SUCCESS&txnId=TXN_$refId&ApprovalRefNo=APP_$refId',
      );
    }

    try {
      final res = await _channel.invokeMethod<Map<dynamic, dynamic>>(
        'launchUpiPayment',
        {
          'upiUri': upiUri,
          'packageName': targetPackage,
        },
      );

      if (res == null) {
        return RealUpiPaymentResult(
          isSuccess: false,
          isFailure: false,
          isCancelled: true,
          status: 'CANCELLED',
          errorMessage: 'Payment cancelled by user',
        );
      }

      final statusStr = (res['status'] ?? '').toString().toUpperCase();
      final isSuccess = res['isSuccess'] == true || statusStr == 'SUCCESS';
      final isFailure = res['isFailure'] == true || statusStr == 'FAILURE' || statusStr == 'FAILED';
      final isCancelled = !isSuccess && !isFailure;

      return RealUpiPaymentResult(
        isSuccess: isSuccess,
        isFailure: isFailure,
        isCancelled: isCancelled,
        status: statusStr.isNotEmpty ? statusStr : (isSuccess ? 'SUCCESS' : 'CANCELLED'),
        txnId: res['txnid']?.toString() ?? res['txnId']?.toString(),
        approvalRefNo: res['approvalrefno']?.toString() ?? res['approvalRefNo']?.toString(),
        responseCode: res['responsecode']?.toString() ?? res['responseCode']?.toString(),
        rawResponse: res['raw']?.toString(),
        errorMessage: isFailure ? (res['message']?.toString() ?? 'Payment failed in UPI app') : null,
      );
    } catch (e) {
      debugPrint('[RealPaymentService] Error launching UPI: $e');
      return RealUpiPaymentResult(
        isSuccess: false,
        isFailure: true,
        isCancelled: false,
        status: 'ERROR',
        errorMessage: e.toString(),
      );
    }
  }

  /// Open a specific UPI app directly (e.g. PhonePe, Google Pay, Paytm)
  static Future<bool> openUpiAppDirectly({String packageName = 'com.phonepe.app'}) async {
    if (kIsWeb || !Platform.isAndroid) return false;
    try {
      final res = await _channel.invokeMethod<bool>('openApp', {'packageName': packageName});
      return res ?? false;
    } catch (e) {
      debugPrint('[RealPaymentService] Error opening UPI app directly: $e');
      return false;
    }
  }

  /// Launch official Razorpay Checkout SDK on mobile device
  static Future<RazorpayCheckoutResult> openRazorpayCheckout({
    required String keyId,
    required String orderId,
    required double amount,
    required String recipient,
    String? note,
    String? userEmail,
    String? userPhone,
  }) async {
    final completer = Completer<RazorpayCheckoutResult>();
    final razorpay = Razorpay();

    razorpay.on(Razorpay.EVENT_PAYMENT_SUCCESS, (PaymentSuccessResponse response) {
      razorpay.clear();
      if (!completer.isCompleted) {
        completer.complete(RazorpayCheckoutResult(
          isSuccess: true,
          paymentId: response.paymentId,
          orderId: response.orderId ?? orderId,
          signature: response.signature,
        ));
      }
    });

    razorpay.on(Razorpay.EVENT_PAYMENT_ERROR, (PaymentFailureResponse response) {
      razorpay.clear();
      if (!completer.isCompleted) {
        final isCancel = response.code == Razorpay.PAYMENT_CANCELLED;
        completer.complete(RazorpayCheckoutResult(
          isSuccess: false,
          isCancelled: isCancel,
          errorCode: response.code,
          errorMessage: response.message ?? (isCancel ? 'Payment cancelled' : 'Payment failed in gateway'),
        ));
      }
    });

    razorpay.on(Razorpay.EVENT_EXTERNAL_WALLET, (ExternalWalletResponse response) {
      razorpay.clear();
      if (!completer.isCompleted) {
        completer.complete(RazorpayCheckoutResult(
          isSuccess: true,
          paymentId: 'wallet_${response.walletName}_${DateTime.now().millisecondsSinceEpoch}',
          orderId: orderId,
        ));
      }
    });

    final options = {
      'key': keyId.isNotEmpty ? keyId : PaymentGatewayConfig.razorpayKeyId,
      'amount': (amount * 100).round(), // in paise
      'name': 'FinPocket',
      'description': note ?? 'Payment to $recipient',
      // Only send an order id the server actually created. Razorpay validates
      // `order_id` against its own records and fails checkout with
      // INVALID_ORDER_ID for anything else, so an empty value must be omitted
      // entirely rather than passed through as ''.
      if (orderId.isNotEmpty) 'order_id': orderId,
      // Only prefill real user data — never fabricate contact details.
      if (userPhone != null && userPhone.isNotEmpty)
        'prefill': {
          'contact': userPhone,
          if (userEmail != null && userEmail.isNotEmpty) 'email': userEmail,
        },
      'theme': {
        'color': '#14B8A6',
      },
    };

    try {
      razorpay.open(options);
    } catch (e) {
      razorpay.clear();
      if (!completer.isCompleted) {
        completer.complete(RazorpayCheckoutResult(
          isSuccess: false,
          errorMessage: e.toString(),
        ));
      }
    }

    return completer.future;
  }

  /// Automatically record the real payment locally on device in real time
  static Future<Transaction> recordRealPaymentLocally({
    required String recipient,
    required double amount,
    required TransactionCategory category,
    String? note,
    String? bankName,
    String? approvalRef,
    String? txnId,
  }) async {
    final ref = approvalRef ?? txnId ?? 'UPI_${DateTime.now().millisecondsSinceEpoch}';
    final txn = Transaction(
      id: 'tx_real_${DateTime.now().millisecondsSinceEpoch}',
      userId: 'usr_local',
      sender: 'My Bank Account',
      receiver: recipient,
      amount: amount,
      type: TransactionType.EXPENSE,
      category: category,
      status: TransactionStatus.SUCCESSFUL,
      timestamp: DateTime.now(),
      referenceId: ref,
      description: note ?? 'Real UPI Payment to $recipient',
      paymentMethod: 'UPI',
      merchant: recipient,
    );

    await LocalTransactionStorageService.addOrUpdateTransaction(txn);
    return txn;
  }
}
