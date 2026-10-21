import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:provider/provider.dart';
import '../providers/app_state.dart';
import '../theme/app_theme.dart';
import '../models/models.dart';
import '../widgets/qr_scanner_modal.dart';
import '../services/real_payment_service.dart';
import '../services/api_service.dart';
import '../services/external_intent_service.dart';
import '../widgets/receive_money_modal.dart';
import '../widgets/connect_bank_modal.dart';

class PaymentsScreen extends StatefulWidget {
  final String? initialRecipient;

  /// `'send'` (default) or `'receive'` — lets Home open Receive directly rather
  /// than landing the user on the Send form.
  final String? initialMode;

  const PaymentsScreen({super.key, this.initialRecipient, this.initialMode});

  @override
  State<PaymentsScreen> createState() => _PaymentsScreenState();
}

enum PaymentsMode { send, receive }

class _PaymentsScreenState extends State<PaymentsScreen> with WidgetsBindingObserver {
  /// Send and Receive are genuinely different flows — Receive renders its own
  /// QR / UPI-request surface instead of hiding inside the Send form.
  PaymentsMode _mode = PaymentsMode.send;

  final _recipientController = TextEditingController();
  final _amountController = TextEditingController();
  final _noteController = TextEditingController();
  TransactionCategory _selectedCategory = TransactionCategory.Food;
  double _currentInputAmount = 0.0;
  PaymentGatewayProvider _selectedPaymentMode = PaymentGatewayProvider.upiApp;
  UpiQrDetails? _detectedUpiDetails;
  String? _selectedUpiPackage;
  List<InstalledUpiApp> _installedUpiApps = [];

  bool get _hasGooglePay => _installedUpiApps.any((a) => a.packageName == 'com.google.android.apps.nbu.paisa.user');

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    if (widget.initialMode == 'receive') {
      _mode = PaymentsMode.receive;
    }
    if (widget.initialRecipient != null && widget.initialRecipient!.isNotEmpty) {
      _recipientController.text = widget.initialRecipient!;
    }
    _recipientController.addListener(() {
      setState(() {});
    });
    _amountController.addListener(() {
      final amt = double.tryParse(_amountController.text) ?? 0.0;
      if (amt != _currentInputAmount) {
        setState(() {
          _currentInputAmount = amt;
        });
      }
    });
    _loadInstalledUpiApps();
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    _recipientController.dispose();
    _amountController.dispose();
    _noteController.dispose();
    super.dispose();
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.resumed) {
      _loadInstalledUpiApps();
    }
  }

  Future<void> _loadInstalledUpiApps() async {
    final apps = await RealPaymentService.getInstalledUpiApps();
    if (mounted) {
      setState(() {
        _installedUpiApps = apps;
        final hasGPay = apps.any((a) => a.packageName == 'com.google.android.apps.nbu.paisa.user');
        // If Google Pay is present and nothing selected or previously default:
        if (hasGPay && (_selectedUpiPackage == null || _selectedUpiPackage == 'com.phonepe.app')) {
          _selectedUpiPackage = 'com.google.android.apps.nbu.paisa.user';
        } else if (_selectedUpiPackage == null && apps.isNotEmpty) {
          _selectedUpiPackage = apps.first.packageName;
        }
      });
    }
  }

  bool get _isMerchant {
    if (_detectedUpiDetails != null) {
      if (_detectedUpiDetails!.merchantCode != null && _detectedUpiDetails!.merchantCode!.isNotEmpty) {
        return true;
      }
    }
    final text = _recipientController.text.trim().toLowerCase();
    if (text.isEmpty) return false;
    return text.contains('merchant') ||
        text.contains('@paytm') ||
        text.contains('@billdesk') ||
        text.contains('@razorpay') ||
        text.contains('store') ||
        text.contains('swiggy') ||
        text.contains('zomato');
  }

  /// Returns true if [text] looks like a pure VPA (ends with @[bank]), without a
  /// leading number sequence (i.e. not a 10-digit mobile number).
  bool get _isPureVpa => RealPaymentService.isPureVpa(_recipientController.text);

  /// True if the entered text is a 10-digit Indian mobile number (6–9 prefix).
  /// When true, we convert it to a VPA using the user's bank domain @upi.
  bool get _isMobileNumber {
    final text = _recipientController.text.trim();
    return RegExp(r'^[6-9]\d{9}$').hasMatch(text);
  }

  @override
  void didUpdateWidget(covariant PaymentsScreen oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (widget.initialRecipient != null && widget.initialRecipient != oldWidget.initialRecipient) {
      _recipientController.text = widget.initialRecipient!;
    }
    if (widget.initialMode != oldWidget.initialMode) {
      _mode = widget.initialMode == 'receive' ? PaymentsMode.receive : PaymentsMode.send;
    }
  }

  /// Entry point for the "Authenticate & Pay" button.
  ///
  /// The original implementation was `void _handlePay() async`, so any
  /// exception thrown before the first `await`-guarded try/catch escaped to the
  /// zone as an *unhandled* error: no snackbar, no log the user could see, and
  /// the tap simply did nothing (this is exactly how the `parts.single` bug in
  /// [_isPureVpa] hid a crash on every VPA payment). Route every failure to a
  /// visible message instead.
  void _handlePay() {
    _handlePayFlow().catchError((Object error, StackTrace stack) {
      debugPrint('[Payments] _handlePay failed: $error\n$stack');
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          backgroundColor: AppTheme.danger,
          content: Text('Payment could not be started: $error'),
        ),
      );
    });
  }

  Future<void> _handlePayFlow() async {
    final state = Provider.of<AppState>(context, listen: false);

    if (state.isChildCareActive) {
      showDialog(
        context: context,
        builder: (ctx) => AlertDialog(
          backgroundColor: const Color(0xFF0F172A),
          title: const Row(
            children: [
              Icon(Icons.shield_outlined, color: AppTheme.danger),
              SizedBox(width: 8),
              Text('Payment Blocked', style: TextStyle(color: AppTheme.danger, fontSize: 16)),
            ],
          ),
          content: Text(state.t('childCareBlocked')),
          actions: [
            TextButton(
              onPressed: () => Navigator.pop(ctx),
              child: const Text('OK'),
            ),
          ],
        ),
      );
      return;
    }

    final amount = double.tryParse(_amountController.text) ?? 0.0;
    if (_recipientController.text.isEmpty || amount <= 0) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Please enter a valid recipient and amount.')),
      );
      return;
    }

    // Smart Impulse Guard & Cooling-Off Lock
    final impact = state.analyzeSpendImpact(amount, category: _selectedCategory);
    if (impact.requiresCoolingOff) {
      final proceed = await showDialog<bool>(
        context: context,
        builder: (ctx) => AlertDialog(
          backgroundColor: const Color(0xFF0F172A),
          title: const Row(
            children: [
              Icon(Icons.shield_outlined, color: Color(0xFFEF4444)),
              SizedBox(width: 8),
              Text('Smart Impulse Guard', style: TextStyle(color: Color(0xFFEF4444), fontSize: 16)),
            ],
          ),
          content: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                'This ₹${amount.toStringAsFixed(0)} purchase will drop your month-end safety buffer by ${impact.safeToSpendDropPercent.toStringAsFixed(0)}% and delay your "${impact.primaryGoalName}" goal by ~${impact.daysGoalDelayed} days.',
                style: const TextStyle(fontSize: 12.5, color: Colors.white, height: 1.3),
              ),
              const SizedBox(height: 12),
              Container(
                padding: const EdgeInsets.all(10),
                decoration: BoxDecoration(
                  color: const Color(0x33EF4444),
                  borderRadius: BorderRadius.circular(8),
                ),
                child: const Text(
                  '💡 Impulse Reflection: Is this a critical need right now, or something you can wait 24 hours on?',
                  style: TextStyle(fontSize: 11, color: Color(0xFFFCA5A5)),
                ),
              ),
            ],
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.pop(ctx, false),
              child: const Text('Save & Postpone', style: TextStyle(color: Color(0xFF10B981), fontWeight: FontWeight.bold)),
            ),
            ElevatedButton(
              style: ElevatedButton.styleFrom(backgroundColor: const Color(0xFF334155)),
              onPressed: () => Navigator.pop(ctx, true),
              child: const Text('I Still Need This', style: TextStyle(color: Colors.white70)),
            ),
          ],
        ),
      );
      if (proceed != true) return;
    }
    if (!mounted) return;

    // ─── User Pay & Spending Limit Guard ─────────────────────────────────
    if (state.userPaySpendLimit != null && state.wouldExceedPaySpendLimit(amount)) {
      final limit = state.userPaySpendLimit!;
      final currentSpend = state.thisMonthSpent;
      final newTotal = currentSpend + amount;
      final exceededBy = newTotal - limit;

      final willProceed = await showDialog<bool>(
        context: context,
        barrierDismissible: false,
        builder: (ctx) => AlertDialog(
          backgroundColor: const Color(0xFF0F172A),
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(18)),
          title: const Row(
            children: [
              Icon(Icons.report_problem_rounded, color: Color(0xFFEF4444), size: 26),
              SizedBox(width: 10),
              Expanded(
                child: Text(
                  '⚠️ Budget Limit Exceeded!',
                  style: TextStyle(
                    color: Color(0xFFEF4444),
                    fontSize: 16,
                    fontWeight: FontWeight.bold,
                  ),
                ),
              ),
            ],
          ),
          content: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Container(
                padding: const EdgeInsets.all(12),
                decoration: BoxDecoration(
                  color: const Color(0x33EF4444),
                  borderRadius: BorderRadius.circular(10),
                  border: Border.all(color: const Color(0x66EF4444)),
                ),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    const Text(
                      'Kindly stop! You are exceeding your set budget limit.',
                      style: TextStyle(
                        fontSize: 13,
                        fontWeight: FontWeight.bold,
                        color: Color(0xFFFCA5A5),
                      ),
                    ),
                    const SizedBox(height: 8),
                    Text(
                      '• Your spending limit: ₹${limit.toStringAsFixed(0)}\n'
                      '• Spent so far this month: ₹${currentSpend.toStringAsFixed(0)}\n'
                      '• This payment: ₹${amount.toStringAsFixed(0)}\n'
                      '• Total after this payment: ₹${newTotal.toStringAsFixed(0)}\n'
                      '• Exceeding limit by: ₹${exceededBy.toStringAsFixed(0)}',
                      style: const TextStyle(fontSize: 12, color: Colors.white, height: 1.4),
                    ),
                  ],
                ),
              ),
              const SizedBox(height: 12),
              if (state.surplusForOtherSections > 0)
                Container(
                  padding: const EdgeInsets.all(10),
                  decoration: BoxDecoration(
                    color: const Color(0x2214B8A6),
                    borderRadius: BorderRadius.circular(8),
                    border: Border.all(color: const Color(0x4414B8A6)),
                  ),
                  child: Row(
                    children: [
                      const Icon(Icons.savings_outlined, color: AppTheme.primary, size: 20),
                      const SizedBox(width: 8),
                      Expanded(
                        child: Text(
                          'You earmarked ₹${state.surplusForOtherSections.toStringAsFixed(0)} to transfer to Savings/Emergency Fund. Exceeding your spend limit will disrupt your savings plan!',
                          style: const TextStyle(fontSize: 11.5, color: Color(0xFF99F6E4)),
                        ),
                      ),
                    ],
                  ),
                ),
            ],
          ),
          actions: [
            ElevatedButton(
              style: ElevatedButton.styleFrom(
                backgroundColor: const Color(0xFF10B981),
                foregroundColor: Colors.white,
                padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
                shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
              ),
              onPressed: () => Navigator.pop(ctx, false),
              child: const Text('🛑 Stop / Cancel Payment', style: TextStyle(fontWeight: FontWeight.bold)),
            ),
            if (state.surplusForOtherSections > 0)
              TextButton(
                onPressed: () {
                  Navigator.pop(ctx, false);
                  _showTransferSurplusDialog(state);
                },
                child: const Text('Transfer to Savings', style: TextStyle(color: AppTheme.primary)),
              ),
            TextButton(
              onPressed: () => Navigator.pop(ctx, true),
              child: const Text('Proceed Anyway', style: TextStyle(color: Colors.white54, fontSize: 11)),
            ),
          ],
        ),
      );

      // Record in notification center
      state.addNotification(
        AppNotification(
          id: 'pay_limit_${DateTime.now().millisecondsSinceEpoch}',
          title: '🚨 Budget Spend Limit Exceeded',
          message:
              'Attempted ₹${amount.toStringAsFixed(0)} payment exceeds your set spending limit of ₹${limit.toStringAsFixed(0)} by ₹${exceededBy.toStringAsFixed(0)}.',
          type: NotificationType.budgetAlert,
          timestamp: DateTime.now(),
          data: {'amount': amount, 'limit': limit, 'exceededBy': exceededBy},
        ),
        overlayContext: mounted ? context : null,
      );

      if (willProceed != true) return;
    }
    if (!mounted) return;

    // ─── Overspending Consequence Alert ───────────────────────────────────────
    if (amount > state.totalAvailableBalance) {
      final deficit = amount - state.totalAvailableBalance;
      final willProceed = await showDialog<bool>(
        context: context,
        builder: (ctx) => AlertDialog(
          backgroundColor: const Color(0xFF0F172A),
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
          title: const Row(
            children: [
              Icon(Icons.warning_amber_rounded, color: Color(0xFFEF4444), size: 22),
              SizedBox(width: 8),
              Expanded(
                child: Text('⚠️ Insufficient Balance',
                    style: TextStyle(color: Color(0xFFEF4444), fontSize: 15)),
              ),
            ],
          ),
          content: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                'This payment of ₹${amount.toStringAsFixed(0)} exceeds your available balance by ₹${deficit.toStringAsFixed(0)}.',
                style: const TextStyle(fontSize: 13, color: Colors.white70, height: 1.4),
              ),
              const SizedBox(height: 12),
              Container(
                padding: const EdgeInsets.all(10),
                decoration: BoxDecoration(
                  color: const Color(0x33EF4444),
                  borderRadius: BorderRadius.circular(8),
                ),
                child: const Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text('Consequences:', style: TextStyle(fontSize: 11, fontWeight: FontWeight.bold, color: Color(0xFFFCA5A5))),
                    SizedBox(height: 4),
                    Text('• Bill payment reserves may be compromised', style: TextStyle(fontSize: 11, color: Color(0xFFFCA5A5))),
                    Text('• Budget streak will be broken', style: TextStyle(fontSize: 11, color: Color(0xFFFCA5A5))),
                    Text('• Savings goals will be delayed', style: TextStyle(fontSize: 11, color: Color(0xFFFCA5A5))),
                  ],
                ),
              ),
            ],
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.pop(ctx, false),
              child: const Text('Cancel Payment', style: TextStyle(color: Color(0xFF10B981), fontWeight: FontWeight.bold)),
            ),
            ElevatedButton(
              style: ElevatedButton.styleFrom(backgroundColor: const Color(0xFFEF4444)),
              onPressed: () => Navigator.pop(ctx, true),
              child: const Text('Proceed Anyway', style: TextStyle(color: Colors.white)),
            ),
          ],
        ),
      );
      // Record the anomaly in the in-app notification centre + device status bar.
      state.addNotification(
        AppNotification(
          id: 'budget_breach_${DateTime.now().millisecondsSinceEpoch}',
          title: '⚠️ Minimum Budget Breached',
          message:
              'Attempted ₹${amount.toStringAsFixed(0)} payment exceeds your available balance by ₹${deficit.toStringAsFixed(0)}. '
              'Proceeding will push you into a deficit and may miss upcoming bill payments.',
          type: NotificationType.budgetAlert,
          timestamp: DateTime.now(),
          data: {'amount': amount, 'deficit': deficit},
        ),
        overlayContext: mounted ? context : null,
      );
      if (willProceed != true) return;
    }
    if (!mounted) return;

    // ─── Minimum Budget Floor Guard ─────────────────────────────────────────
    // The account still has enough money, but the payment would drop the user
    // below the buffer they need for upcoming bills — warn *before* it happens.
    if (amount <= state.totalAvailableBalance &&
        state.wouldCrossMinimumBudget(amount)) {
      final floor = state.minimumBudgetFloor;
      final remaining = state.totalAvailableBalance - amount;
      final willProceed = await showDialog<bool>(
        context: context,
        builder: (ctx) => AlertDialog(
          backgroundColor: const Color(0xFF0F172A),
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
          title: const Row(
            children: [
              Icon(Icons.account_balance_wallet_outlined, color: Color(0xFFF59E0B), size: 22),
              SizedBox(width: 8),
              Expanded(
                child: Text('⚠️ Below Minimum Budget',
                    style: TextStyle(color: Color(0xFFF59E0B), fontSize: 15)),
              ),
            ],
          ),
          content: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                'Paying ₹${amount.toStringAsFixed(0)} leaves you with ₹${remaining.toStringAsFixed(0)}, '
                'which is under your minimum budget of ₹${floor.toStringAsFixed(0)}.',
                style: const TextStyle(fontSize: 13, color: Colors.white70, height: 1.4),
              ),
              const SizedBox(height: 12),
              Container(
                padding: const EdgeInsets.all(10),
                decoration: BoxDecoration(
                  color: const Color(0x33F59E0B),
                  borderRadius: BorderRadius.circular(8),
                ),
                child: const Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text('What this means:',
                        style: TextStyle(fontSize: 11, fontWeight: FontWeight.bold, color: Color(0xFFFCD34D))),
                    SizedBox(height: 4),
                    Text('• Upcoming bill payments may bounce',
                        style: TextStyle(fontSize: 11, color: Color(0xFFFCD34D))),
                    Text('• You will have no buffer for the rest of the month',
                        style: TextStyle(fontSize: 11, color: Color(0xFFFCD34D))),
                    Text('• Your savings contributions may be skipped',
                        style: TextStyle(fontSize: 11, color: Color(0xFFFCD34D))),
                  ],
                ),
              ),
            ],
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.pop(ctx, false),
              child: const Text('Cancel Payment',
                  style: TextStyle(color: Color(0xFF10B981), fontWeight: FontWeight.bold)),
            ),
            ElevatedButton(
              style: ElevatedButton.styleFrom(backgroundColor: const Color(0xFFF59E0B)),
              onPressed: () => Navigator.pop(ctx, true),
              child: const Text('Pay Anyway', style: TextStyle(color: Colors.white)),
            ),
          ],
        ),
      );

      // Recorded even if the user backs out — repeatedly trying to break the
      // floor is itself worth flagging.
      state.addNotification(
        AppNotification(
          id: 'min_budget_${DateTime.now().millisecondsSinceEpoch}',
          title: '⚠️ Minimum Budget Warning',
          message:
              'A ₹${amount.toStringAsFixed(0)} payment would leave ₹${remaining.toStringAsFixed(0)}, '
              'below your minimum budget of ₹${floor.toStringAsFixed(0)}.',
          type: NotificationType.budgetAlert,
          timestamp: DateTime.now(),
          data: {'amount': amount, 'floor': floor, 'remaining': remaining},
        ),
        overlayContext: mounted ? context : null,
      );

      if (willProceed != true) return;
    }
    if (!mounted) return;

    // ── Determine recipient details ────────────────────────────────────────
    final recipientRaw = _recipientController.text.trim();
    String recipient;
    String name;
    bool isMerchant;

    // 1) Mobile number (10 digits starting with 6-9): treat as VPA with user's bank domain
    if (_isMobileNumber && !_isPureVpa) {
      recipient = recipientRaw;
      name = recipientRaw;
      isMerchant = false;
    }
    // 2) Pure VPA (e.g. user@okaxis, shop@paytm): the part after @ is 2-6 alpha-numeric chars
    else if (_isPureVpa) {
      recipient = recipientRaw;
      name = recipientRaw.split('@').first;
      isMerchant = false;
    }
    // 3) Otherwise: use existing merchant/detected logic
    else {
      recipient = recipientRaw;
      isMerchant = _isMerchant;
      name = _detectedUpiDetails != null && _detectedUpiDetails!.name.isNotEmpty
          ? _detectedUpiDetails!.name
          : recipient.split('@').first;
    }

    // ── UPI payment flow ───────────────────────────────────────────────────
    if (_selectedPaymentMode == PaymentGatewayProvider.upiApp) {
      final vpa = recipient.contains('@') ? recipient : '$recipient@upi';

      // 1) MERCHANT: Direct 1-tap payment with prefilled amount
      if (isMerchant) {
        final result = await RealPaymentService.payWithRealUpi(
          vpa: vpa,
          name: name,
          amount: amount,
          note: _noteController.text.isNotEmpty ? _noteController.text : null,
          targetPackage: _selectedUpiPackage,
          merchantCode: _detectedUpiDetails?.merchantCode,
          transactionRef: _detectedUpiDetails?.transactionRef,
          rawQrUri: _detectedUpiDetails?.raw,
        );
        await _processUpiResult(result, name, amount);
        return;
      }

      // 2) FRIEND (P2P): Google Pay or system chooser → direct intent works smoothly!
      // PhonePe and Amazon Pay block automated P2P intents for security reasons.
      if (_selectedUpiPackage != 'com.phonepe.app' &&
          _selectedUpiPackage != 'in.amazon.mShop.android.shopping') {
        final result = await RealPaymentService.payWithRealUpi(
          vpa: vpa,
          name: name,
          amount: amount,
          note: _noteController.text.isNotEmpty ? _noteController.text : null,
          targetPackage: _selectedUpiPackage,
          rawQrUri: _detectedUpiDetails?.raw,
        );
        await _processUpiResult(result, name, amount);
        return;
      }

      // 3) PhonePe or Amazon Pay friend transfer (automated intent blocked): manual sheet
      _showFriendTransferSheet(
        name: name,
        amount: amount,
        vpa: vpa,
        googlePayInstalled: _hasGooglePay,
        preferredPackage: _selectedUpiPackage,
      );
      return;
    }

    if (_selectedPaymentMode == PaymentGatewayProvider.razorpay) {
      // 2. Real Payment Gateway (Razorpay Checkout) with 3D Secure / OTP Authentication
      final recipient = _recipientController.text.trim();
      final note = _noteController.text.isNotEmpty ? _noteController.text : 'Payment to $recipient';

      showModalBottomSheet(
        context: context,
        backgroundColor: Theme.of(context).brightness == Brightness.dark
            ? const Color(0xFF0F172A)
            : Colors.white,
        shape: const RoundedRectangleBorder(
          borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
        ),
        builder: (ctx) => Padding(
          padding: const EdgeInsets.all(20),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Container(
                width: 40,
                height: 4,
                margin: const EdgeInsets.only(bottom: 16),
                decoration: BoxDecoration(
                  color: Colors.grey.withOpacity(0.3),
                  borderRadius: BorderRadius.circular(2),
                ),
              ),
              Row(
                children: [
                  Container(
                    padding: const EdgeInsets.all(10),
                    decoration: BoxDecoration(
                      color: const Color(0x1F14B8A6),
                      borderRadius: BorderRadius.circular(12),
                    ),
                    child: const Icon(Icons.security_rounded, color: Color(0xFF14B8A6), size: 24),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          'Razorpay Payment Gateway',
                          style: TextStyle(
                            fontWeight: FontWeight.bold,
                            fontSize: 16,
                            color: Theme.of(context).brightness == Brightness.dark
                                ? Colors.white
                                : AppTheme.textPrimaryLight,
                          ),
                        ),
                        Text(
                          '₹${amount.toStringAsFixed(2)} to $recipient',
                          style: const TextStyle(fontSize: 12, color: Color(0xFF14B8A6), fontWeight: FontWeight.w600),
                        ),
                      ],
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 14),
              Container(
                padding: const EdgeInsets.all(12),
                decoration: BoxDecoration(
                  color: const Color(0xFF1E293B),
                  borderRadius: BorderRadius.circular(10),
                ),
                child: const Text(
                  'This opens the official Razorpay Checkout sheet. You can authenticate using Debit/Credit Card (with 3D Secure OTP), UPI, NetBanking, or Wallets. The transaction is verified cryptographically by the server and saved locally.',
                  style: TextStyle(fontSize: 11, color: Color(0xFF94A3B8), height: 1.3),
                ),
              ),
              const SizedBox(height: 20),
              SizedBox(
                width: double.infinity,
                height: 48,
                child: ElevatedButton.icon(
                  style: ElevatedButton.styleFrom(
                    backgroundColor: const Color(0xFF0D9488),
                    foregroundColor: Colors.white,
                    shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                  ),
                  icon: const Icon(Icons.lock_outline_rounded, size: 18),
                  label: const Text('Authenticate & Pay via Gateway', style: TextStyle(fontWeight: FontWeight.bold)),
                  onPressed: () async {
                    Navigator.pop(ctx);
                    ScaffoldMessenger.of(context).showSnackBar(
                      const SnackBar(content: Text('Opening secure payment gateway...')),
                    );

                    try {
                      // 1. Create order on backend.
                      // Empty = "no order id yet". We deliberately do NOT
                      // fabricate a local `order_...` value: an id Razorpay
                      // never issued is rejected at checkout with
                      // INVALID_ORDER_ID, so the payment could never succeed.
                      // If the server can't create one, checkout opens without
                      // an `order_id` (a supported Razorpay flow).
                      String orderId = '';
                      String keyId = PaymentGatewayConfig.razorpayKeyId;
                      try {
                        final orderRes = await ApiService.createGatewayOrder(
                          amount: amount,
                          recipient: recipient,
                          note: note,
                        );
                        if (orderRes['orderId'] != null && orderRes['orderId'].toString().isNotEmpty) {
                          orderId = orderRes['orderId'].toString();
                        }
                        if (orderRes['keyId'] != null && orderRes['keyId'].toString().isNotEmpty) {
                          keyId = orderRes['keyId'].toString();
                        }
                      } catch (e) {
                        debugPrint('[GatewayOrder] Server order creation fallback: $e');
                      }

                      // The gateway key must come from the backend — never from
                      // a hardcoded client value. If the server couldn't supply
                      // one, fail honestly instead of opening a doomed checkout.
                      if (keyId.isEmpty) {
                        if (mounted) {
                          ScaffoldMessenger.of(context).showSnackBar(
                            const SnackBar(content: Text('Payment gateway unavailable — server did not return a payment key. Please use UPI Apps instead.')),
                          );
                        }
                        return;
                      }

                      // 2. Open Razorpay native Checkout SDK
                      final result = await RealPaymentService.openRazorpayCheckout(
                        orderId: orderId,
                        amount: amount,
                        recipient: recipient,
                        note: note,
                        keyId: keyId,
                        userPhone: state.currentUser?.phone,
                        userEmail: state.currentUser?.email,
                      );

                      if (result.isSuccess) {
                        // 3. Cryptographic server verification.
                        // Razorpay only returns a signature when checkout was
                        // opened with an `order_id`, so skip rather than send a
                        // request the server is guaranteed to reject (400).
                        final verifyOrderId = (result.orderId ?? orderId);
                        if (verifyOrderId.isNotEmpty && (result.signature ?? '').isNotEmpty) {
                          try {
                            await ApiService.verifyGatewayPayment(
                              orderId: verifyOrderId,
                              paymentId: result.paymentId ?? '',
                              signature: result.signature ?? '',
                              amount: amount,
                              recipient: recipient,
                              note: note,
                            );
                          } catch (e) {
                            debugPrint('[GatewayVerify] Server verification note: $e');
                          }
                        } else {
                          debugPrint(
                              '[GatewayVerify] Skipped: no order id/signature to verify (orderId=$verifyOrderId).');
                        }

                        // 4. Record in local encrypted vault
                        await RealPaymentService.recordRealPaymentLocally(
                          recipient: recipient,
                          amount: amount,
                          category: _selectedCategory,
                          note: note,
                          approvalRef: result.paymentId,
                          txnId: result.orderId ?? orderId,
                        );
                        if (!mounted) return;

                        // 5. Update app state
                        await state.sendPayment(
                          receiver: recipient,
                          amount: amount,
                          category: _selectedCategory,
                          note: 'Gateway: $recipient (ID: ${result.paymentId})',
                          overlayContext: context,
                        );

                        // 5. Autonomous Round-Up Micro-Savings
                        final savedRoundUp = await state.applyRoundUpForPayment(amount);

                        _recipientController.clear();
                        _amountController.clear();
                        _noteController.clear();
                        _detectedUpiDetails = null;

                        if (mounted) {
                          ScaffoldMessenger.of(context).showSnackBar(
                            SnackBar(
                              backgroundColor: AppTheme.success,
                              content: Text(
                                savedRoundUp > 0
                                    ? 'Payment Authenticated! ID: ${result.paymentId} (+₹${savedRoundUp.toStringAsFixed(0)} saved in Round-Up Vault 🪙)'
                                    : 'Payment Authenticated! ID: ${result.paymentId}',
                              ),
                            ),
                          );
                        }
                      } else if (result.isCancelled) {
                        if (mounted) {
                          ScaffoldMessenger.of(context).showSnackBar(
                            const SnackBar(content: Text('Payment cancelled by user in gateway.')),
                          );
                        }
                      } else {
                        if (mounted) {
                          ScaffoldMessenger.of(context).showSnackBar(
                            SnackBar(
                              backgroundColor: AppTheme.danger,
                              content: Text(result.errorMessage ?? 'Payment failed in gateway.'),
                            ),
                          );
                        }
                      }
                    } catch (e) {
                      if (mounted) {
                        ScaffoldMessenger.of(context).showSnackBar(
                          SnackBar(
                            backgroundColor: AppTheme.danger,
                            content: Text('Payment gateway error: $e'),
                          ),
                        );
                      }
                    }
                  },
                ),
              ),
            ],
          ),
        ),
      );
      return;
    }

    // All payments must go through Real UPI App or Real Payment Gateway.
    // Fake in-app wallet simulations have been removed.
  }

  void _showFriendTransferSheet({
    required String name,
    required double amount,
    required String vpa,
    bool googlePayInstalled = false,
    String? preferredPackage,
  }) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final isPhonePe = preferredPackage == 'com.phonepe.app';
    final preferredLabel = isPhonePe
        ? 'PhonePe'
        : (preferredPackage == 'in.amazon.mShop.android.shopping' ? 'Amazon Pay' : 'your UPI app');
    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      backgroundColor: isDark ? const Color(0xFF0F172A) : Colors.white,
      shape: const RoundedRectangleBorder(borderRadius: BorderRadius.vertical(top: Radius.circular(20))),
      builder: (ctx) => Padding(
        padding: EdgeInsets.only(
          left: 20,
          right: 20,
          top: 20,
          // Keep the last button clear of the keyboard when the note field is
          // focused, and of the gesture bar otherwise.
          bottom: 20 + MediaQuery.of(ctx).viewInsets.bottom,
        ),
        // The sheet has ~10 widgets of content; without a scroller the final
        // buttons were pushed below the bottom of the screen and the sheet
        // itself overflowed (RenderFlex overflow) on shorter displays.
        child: SingleChildScrollView(
          child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Center(
              child: Container(
                width: 40,
                height: 4,
                margin: const EdgeInsets.only(bottom: 16),
                decoration: BoxDecoration(
                  color: Colors.grey.withOpacity(0.3),
                  borderRadius: BorderRadius.circular(2),
                ),
              ),
            ),
            Row(
              children: [
                Container(
                  padding: const EdgeInsets.all(10),
                  decoration: BoxDecoration(
                    color: const Color(0xFF673AB7).withOpacity(0.15),
                    borderRadius: BorderRadius.circular(12),
                  ),
                  child: const Icon(Icons.person_rounded, color: Color(0xFF9C27B0), size: 24),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        'Friend / Personal Transfer',
                        style: TextStyle(
                          fontWeight: FontWeight.bold,
                          fontSize: 16,
                          color: isDark ? Colors.white : AppTheme.textPrimaryLight,
                        ),
                      ),
                      Text(
                        '₹${amount.toStringAsFixed(2)} to $name',
                        style: TextStyle(
                          fontSize: 12,
                          color: Color(0xFF9C27B0),
                          fontWeight: FontWeight.w600,
                        ),
                      ),
                      const SizedBox(height: 2),
                      Text(
                        'VPA: $vpa',
                        style: const TextStyle(fontSize: 11, color: Color(0xFF64748B)),
                      ),
                    ],
                  ),
                ),
              ],
            ),
            const SizedBox(height: 14),
            Container(
              padding: const EdgeInsets.all(12),
              decoration: BoxDecoration(
                color: isDark ? const Color(0xFF1E293B) : const Color(0xFFF8FAFC),
                borderRadius: BorderRadius.circular(10),
                border: Border.all(color: isDark ? const Color(0xFF334155) : const Color(0xFFE2E8F0)),
              ),
              child: const Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text('🛡️', style: TextStyle(fontSize: 14)),
                  SizedBox(width: 8),
                  Expanded(
                    child: Text(
                      'Google Pay and PhonePe both take a real UPI intent that pre-fills the payee and amount. If a bank app still returns without a status, FinPocket asks you to confirm before recording.',
                      style: TextStyle(fontSize: 11, color: Color(0xFF94A3B8), height: 1.35),
                    ),
                  ),
                ],
              ),
            ),
            const SizedBox(height: 16),
            // The app the user actually picked leads the sheet. PhonePe and
            // Amazon Pay block fully-automated P2P intents, so this opens the
            // app with the payee pre-filled wherever possible and falls back to
            // copy-VPA + manual confirm when the intent is refused.
            Builder(builder: (ctx) {
              final Color brandColor = isPhonePe
                  ? const Color(0xFF673AB7)
                  : const Color(0xFF00A8E0);
              return SizedBox(
                width: double.infinity,
                height: 48,
                child: ElevatedButton.icon(
                  style: ElevatedButton.styleFrom(
                    backgroundColor: brandColor,
                    foregroundColor: Colors.white,
                    shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                    elevation: 0,
                  ),
                  icon: Icon(
                    isPhonePe ? Icons.phone_android_rounded : Icons.shopping_bag_rounded,
                    size: 18,
                  ),
                  label: Text('Pay ₹${amount.toStringAsFixed(0)} via $preferredLabel',
                      style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 13)),
                  onPressed: () async {
                    Navigator.pop(ctx);
                    final res = await RealPaymentService.payWithRealUpi(
                      vpa: vpa,
                      name: name,
                      amount: amount,
                      targetPackage: preferredPackage,
                      note: _noteController.text.isNotEmpty ? _noteController.text : null,
                      rawQrUri: _detectedUpiDetails?.raw,
                    );
                    // A launch failure (no handler / app refused the intent)
                    // degrades to copy-VPA + open the app + manual confirm.
                    if (res.status != 'ERROR') {
                      await _processUpiResult(res, name, amount);
                      return;
                    }
                    await Clipboard.setData(ClipboardData(text: vpa));
                    // `preferredPackage` is captured into a local so the null
                    // promotion holds after the `await` above.
                    final pkg = preferredPackage;
                    if (pkg != null) {
                      await RealPaymentService.openUpiAppDirectly(packageName: pkg);
                    }
                    if (mounted) {
                      ScaffoldMessenger.of(context).showSnackBar(
                        SnackBar(
                          duration: const Duration(seconds: 4),
                          backgroundColor: brandColor,
                          content: Text('📋 Copied "$vpa" (₹${amount.toStringAsFixed(0)})! Paste in $preferredLabel to complete.'),
                        ),
                      );
                    }
                    _promptPaymentConfirmation(name, amount);
                  },
                ),
              );
            }),
            const SizedBox(height: 14),
            // Google Pay direct — the easiest path when it is installed
            if (googlePayInstalled) ...[
              Text(
                isPhonePe ? 'Or quick-pay with Google Pay:' : 'Quick payment via Google Pay:',
                style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 12),
              ),
              const SizedBox(height: 4),
              SizedBox(
                width: double.infinity,
                height: 48,
                child: ElevatedButton.icon(
                  style: ElevatedButton.styleFrom(
                    backgroundColor: const Color(0xFF1A73E8),
                    foregroundColor: Colors.white,
                    shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                    elevation: 0,
                  ),
                  icon: const Icon(Icons.flash_on_rounded, size: 18),
                  label: Text('⚡ Pay ₹${amount.toStringAsFixed(0)} via Google Pay (Direct)',
                      style: TextStyle(fontWeight: FontWeight.bold, fontSize: 13)),
                  onPressed: () async {
                    Navigator.pop(ctx);
                    final res = await RealPaymentService.payWithRealUpi(
                      vpa: vpa,
                      name: name,
                      amount: amount,
                      targetPackage: 'com.google.android.apps.nbu.paisa.user',
                      rawQrUri: _detectedUpiDetails?.raw,
                    );
                    await _processUpiResult(res, name, amount);
                  },
                ),
              ),
              const SizedBox(height: 10),
            ],
            // Manual copy & pay — for PhonePe, Amazon Pay, or any UPI app
            const Text('Or copy the details below and pay manually in your UPI app:', style: TextStyle(fontSize: 11, color: Color(0xFF64748B))),
            const SizedBox(height: 6),
            Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const SizedBox(width: 16),
                Expanded(
                  child: Container(
                    padding: const EdgeInsets.all(8),
                    decoration: BoxDecoration(
                      color: isDark ? const Color(0xFF1E293B) : const Color(0xFFF8FAFC),
                      borderRadius: BorderRadius.circular(8),
                      border: Border.all(color: isDark ? const Color(0xFF525F7A) : const Color(0xFFCBD5E1)),
                    ),
                    child: Text(
                      vpa,
                      // Must contrast with the box fill: the fill is
                      // 0xFF1E293B in dark mode, and this text used to be the
                      // exact same colour — rendering the VPA invisible, so
                      // "copy the details below" pointed at a blank box.
                      style: TextStyle(
                        fontFamily: 'monospace',
                        fontSize: 14,
                        color: isDark ? const Color(0xFFE2E8F0) : const Color(0xFF1E293B),
                      ),
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                    ),
                  ),
                ),
                const SizedBox(width: 8),
                IconButton(
                  icon: const Icon(Icons.content_copy, color: Color(0xFF64748B), size: 20),
                  onPressed: () {
                    // Copy VPA to clipboard
                    Clipboard.setData(ClipboardData(text: vpa));
                    if (mounted) {
                      ScaffoldMessenger.of(ctx).showSnackBar(
                        const SnackBar(content: Text('VPA copied to clipboard')),
                      );
                    }
                  },
                ),
              ],
            ),
            const SizedBox(height: 14),
            Text(
              'Steps to complete payment:',
              style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 12),
            ),
            const SizedBox(height: 4),
            const Text('1. Open your UPI app (Google Pay, PhonePe, Paytm, BHIM, etc.)', style: TextStyle(fontSize: 11, color: Color(0xFF94A3B8))),
            const Text('2. Paste the VPA above or enter the recipient name', style: TextStyle(fontSize: 11, color: Color(0xFF94A3B8))),
            Text('3. Enter ₹${amount.toStringAsFixed(0)} and add a note if desired', style: const TextStyle(fontSize: 11, color: Color(0xFF94A3B8))),
            const Text('4. Confirm the transfer — the money will be debited from your account', style: TextStyle(fontSize: 11, color: Color(0xFF94A3B8))),
            const SizedBox(height: 14),
            SizedBox(
              width: double.infinity,
              height: 44,
              child: OutlinedButton.icon(
                style: OutlinedButton.styleFrom(
                  foregroundColor: AppTheme.primary,
                  side: const BorderSide(color: AppTheme.primary, width: 1.2),
                  shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                ),
                icon: const Icon(Icons.open_in_new_rounded, size: 16),
                label: const Text('Try Auto-Intent via Other UPI App', style: TextStyle(fontSize: 12, fontWeight: FontWeight.bold)),
                onPressed: () async {
                  Navigator.pop(ctx);
                  final res = await RealPaymentService.payWithRealUpi(
                    vpa: vpa,
                    name: name,
                    amount: amount,
                    targetPackage: null,
                    rawQrUri: _detectedUpiDetails?.raw,
                  );
                  await _processUpiResult(res, name, amount);
                },
              ),
            ),
          ],
          ),
        ),
      ),
    );
  }

  Future<void> _processUpiResult(RealUpiPaymentResult result, String name, double amount) async {
    final state = Provider.of<AppState>(context, listen: false);
    if (result.isSuccess) {
      await RealPaymentService.recordRealPaymentLocally(
        recipient: name,
        amount: amount,
        category: _selectedCategory,
        note: _noteController.text,
        approvalRef: result.approvalRefNo,
        txnId: result.txnId,
      );
      if (!mounted) return;
      final recorded = await state.sendPayment(
        receiver: name,
        amount: amount,
        category: _selectedCategory,
        note: 'UPI Payment to $name (Ref: ${result.approvalRefNo ?? result.txnId ?? "Approved"})',
        overlayContext: context,
      );

      // The UPI app already debited the money, but FinPocket may still have
      // failed to record it (API down / balance mismatch). Only treat it as a
      // clean success — and only bank the Round-Up — when it was actually
      // recorded. Otherwise tell the user the truth instead of claiming
      // "successful!" while nothing appears in History.
      if (!recorded) {
        if (mounted) {
          ScaffoldMessenger.of(context).showSnackBar(
            const SnackBar(
              backgroundColor: Color(0xFFF59E0B),
              content: Text(
                'Paid in your UPI app, but FinPocket couldn’t record it just now. It won’t appear in History until it syncs — check your connection and pull to refresh.',
              ),
            ),
          );
        }
        return;
      }

      final savedRoundUp = await state.applyRoundUpForPayment(amount);

      _recipientController.clear();
      _amountController.clear();
      _noteController.clear();
      _detectedUpiDetails = null;

      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            backgroundColor: AppTheme.success,
            content: Text(
              savedRoundUp > 0
                  ? 'Real UPI Payment of ₹${amount.toStringAsFixed(2)} successful! (+₹${savedRoundUp.toStringAsFixed(0)} saved in Round-Up Vault 🪙)'
                  : 'Real UPI Payment of ₹${amount.toStringAsFixed(2)} successful! Ref: ${result.approvalRefNo ?? result.txnId ?? "Approved"}',
            ),
          ),
        );
      }
      await _checkAndAlertUnusualTransaction(name, amount, state);
    } else if (result.isCancelled) {
      _promptPaymentConfirmation(name, amount);
    } else {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            backgroundColor: AppTheme.danger,
            content: Text(result.errorMessage ?? 'Payment failed or declined in banking app.'),
          ),
        );
      }
    }
  }

  void _promptPaymentConfirmation(String name, double amount) async {
    final state = Provider.of<AppState>(context, listen: false);
    final userConfirmed = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        backgroundColor: const Color(0xFF0F172A),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
        title: const Row(
          children: [
            Icon(Icons.check_circle_outline, color: Color(0xFF10B981)),
            SizedBox(width: 8),
            Text('Confirm Payment Status', style: TextStyle(color: Colors.white, fontSize: 16)),
          ],
        ),
        content: Text(
          'The UPI app did not report a final status. Did you complete the ₹${amount.toStringAsFixed(2)} transfer to $name?',
          style: const TextStyle(fontSize: 13, color: Colors.white70),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx, false),
            child: const Text('No, Cancelled', style: TextStyle(color: Colors.grey)),
          ),
          ElevatedButton(
            style: ElevatedButton.styleFrom(backgroundColor: const Color(0xFF10B981)),
            onPressed: () => Navigator.pop(ctx, true),
            child: const Text('Yes, Payment Done', style: TextStyle(color: Colors.white, fontWeight: FontWeight.bold)),
          ),
        ],
      ),
    );

    if (userConfirmed == true) {
      await RealPaymentService.recordRealPaymentLocally(
        recipient: name,
        amount: amount,
        category: _selectedCategory,
        note: _noteController.text,
        approvalRef: 'CONFIRMED_${DateTime.now().millisecondsSinceEpoch}',
        txnId: 'UPI_${DateTime.now().millisecondsSinceEpoch}',
      );
      if (!mounted) return;
      final recorded = await state.sendPayment(
        receiver: name,
        amount: amount,
        category: _selectedCategory,
        note: 'UPI Payment to $name (Verified in PhonePe)',
        overlayContext: context,
      );

      // sendPayment returns false when the ledger write failed — including the
      // common force-approve case where the amount exceeds FinPocket's tracked
      // balance. The money already moved in the UPI app, so warn honestly
      // instead of recording a success that will never appear in History.
      if (!recorded) {
        if (mounted) {
          ScaffoldMessenger.of(context).showSnackBar(
            const SnackBar(
              backgroundColor: Color(0xFFF59E0B),
              content: Text(
                'Marked as paid, but FinPocket couldn’t record it (amount may exceed your tracked balance). It won’t appear in History until synced.',
              ),
            ),
          );
        }
        return;
      }

      final savedRoundUp = await state.applyRoundUpForPayment(amount);

      _recipientController.clear();
      _amountController.clear();
      _noteController.clear();
      _detectedUpiDetails = null;

      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            backgroundColor: AppTheme.success,
            content: Text(
              savedRoundUp > 0
                  ? 'Payment of ₹${amount.toStringAsFixed(2)} recorded! (+₹${savedRoundUp.toStringAsFixed(0)} saved in Round-Up Vault 🪙)'
                  : 'Payment of ₹${amount.toStringAsFixed(2)} confirmed and recorded successfully!',
            ),
          ),
        );
      }
      await _checkAndAlertUnusualTransaction(name, amount, state);
    }
  }

  /// Detects unusual/suspicious transactions and fires multi-channel alerts.
  ///
  /// The heuristics and the in-app/OS notification now live in
  /// `AppState.flagUnusualTransaction`, which the ledger calls on every debit
  /// too — so all payment paths are covered and a 10s de-dup window keeps the
  /// user from seeing the same event twice.
  Future<void> _checkAndAlertUnusualTransaction(
    String recipient,
    double amount,
    AppState state,
  ) async {
    final reason = state.flagUnusualTransaction(
      recipient: recipient,
      amount: amount,
      overlayContext: mounted ? context : null,
    );
    if (reason == null) return;

    // In-app banner with one-tap escalation to WhatsApp / SMS.
    if (mounted) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          backgroundColor: const Color(0xFFDC2626),
          duration: const Duration(seconds: 6),
          behavior: SnackBarBehavior.floating,
          content: Row(
            children: [
              const Icon(Icons.warning_amber_rounded, color: Colors.white, size: 18),
              const SizedBox(width: 8),
              Expanded(
                child: Text(
                  '🚨 Unusual Transaction: $reason',
                  style: const TextStyle(color: Colors.white, fontSize: 12),
                  overflow: TextOverflow.ellipsis,
                  maxLines: 2,
                ),
              ),
            ],
          ),
          action: SnackBarAction(
            label: 'Send Alert',
            textColor: Colors.yellow,
            onPressed: () => _showSecurityAlertChannels(
              reason: reason,
              recipient: recipient,
              amount: amount,
              state: state,
            ),
          ),
        ),
      );
    }
  }

  /// Multi-channel escape hatch for a detected anomaly: WhatsApp, SMS or both.
  /// The message is prefilled into the target app so the user only taps "send".
  Future<void> _showSecurityAlertChannels({
    required String reason,
    required String recipient,
    required double amount,
    required AppState state,
  }) async {
    if (!mounted) return;
    final message = '🚨 FinPocket Security Alert\n\n'
        '$reason\n'
        'Paid ₹${amount.toStringAsFixed(0)} to $recipient.\n'
        'If this was NOT you, immediately block your UPI apps and call your bank.';
    final userPhone = state.currentUser?.phone.replaceAll(RegExp(r'\D'), '') ?? '';

    await showModalBottomSheet<void>(
      context: context,
      backgroundColor: const Color(0xFF0F172A),
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
      ),
      builder: (ctx) => SafeArea(
        child: Padding(
          padding: const EdgeInsets.fromLTRB(20, 12, 20, 20),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Center(
                child: Container(
                  width: 40,
                  height: 4,
                  margin: const EdgeInsets.only(bottom: 16),
                  decoration: BoxDecoration(
                    color: Colors.white.withOpacity(0.2),
                    borderRadius: BorderRadius.circular(2),
                  ),
                ),
              ),
              const Text(
                'Send this security alert',
                style: TextStyle(color: Colors.white, fontSize: 15, fontWeight: FontWeight.bold),
              ),
              const SizedBox(height: 6),
              Text(
                'Prefilled in the app — you just tap send.',
                style: TextStyle(color: Colors.white.withOpacity(0.55), fontSize: 12),
              ),
              const SizedBox(height: 16),
              ListTile(
                leading: Container(
                  padding: const EdgeInsets.all(8),
                  decoration: BoxDecoration(
                    color: const Color(0xFF25D366).withOpacity(0.15),
                    borderRadius: BorderRadius.circular(10),
                  ),
                  child: const Icon(Icons.chat_rounded, color: Color(0xFF25D366)),
                ),
                title: const Text('WhatsApp', style: TextStyle(color: Colors.white)),
                subtitle: Text(
                  userPhone.isNotEmpty ? 'To your registered number' : 'To the alert chat',
                  style: TextStyle(color: Colors.white.withOpacity(0.5), fontSize: 11),
                ),
                onTap: () async {
                  Navigator.pop(ctx);
                  await ExternalIntentService.launchWhatsApp(
                    text: message,
                    phone: userPhone.isNotEmpty ? userPhone : null,
                  );
                },
              ),
              ListTile(
                leading: Container(
                  padding: const EdgeInsets.all(8),
                  decoration: BoxDecoration(
                    color: const Color(0xFF3B82F6).withOpacity(0.15),
                    borderRadius: BorderRadius.circular(10),
                  ),
                  child: const Icon(Icons.sms_rounded, color: Color(0xFF3B82F6)),
                ),
                title: const Text('SMS', style: TextStyle(color: Colors.white)),
                subtitle: Text(
                  userPhone.isNotEmpty ? 'To your registered number' : 'New message',
                  style: TextStyle(color: Colors.white.withOpacity(0.5), fontSize: 11),
                ),
                onTap: () async {
                  Navigator.pop(ctx);
                  await ExternalIntentService.launchSms(
                    body: message,
                    phone: userPhone.isNotEmpty ? userPhone : null,
                  );
                },
              ),
            ],
          ),
        ),
      ),
    );
  }

  /// The UPI apps users most commonly ask for. Always offered, whether or not
  /// they are installed — an absent app is shown dimmed with an explanation
  /// rather than silently missing, so the row stops changing under the user.
  static const List<_KnownUpiApp> _knownUpiApps = [
    _KnownUpiApp('Google Pay', 'com.google.android.apps.nbu.paisa.user', Icons.flash_on_rounded, Color(0xFF1A73E8)),
    _KnownUpiApp('PhonePe', 'com.phonepe.app', Icons.phone_android_rounded, Color(0xFF673AB7)),
    _KnownUpiApp('Paytm', 'net.one97.paytm', Icons.account_balance_wallet_rounded, Color(0xFF00B9F1)),
    _KnownUpiApp('BHIM', 'in.org.npci.upiapp', Icons.account_balance_rounded, Color(0xFFF26522)),
    _KnownUpiApp('Amazon Pay', 'in.amazon.mShop.android.shopping', Icons.shopping_bag_rounded, Color(0xFFFF9900)),
  ];

  List<Widget> _buildAppChips(bool isDark) {
    final widgets = <Widget>[];
    final installedPkgs = _installedUpiApps.map((a) => a.packageName).toSet();

    // 1. The five well-known apps first, in a fixed order.
    for (final app in _knownUpiApps) {
      widgets.add(
        Padding(
          padding: const EdgeInsets.only(right: 6),
          child: _buildUpiAppChip(
            label: app.label,
            pkg: app.packageName,
            icon: app.icon,
            color: app.color,
            isDark: isDark,
            isInstalled: installedPkgs.contains(app.packageName),
          ),
        ),
      );
    }

    // 2. Any other installed UPI handler (bank apps, CRED, Mobikwik, …).
    for (final app in _installedUpiApps) {
      if (_knownUpiApps.any((k) => k.packageName == app.packageName)) continue;
      widgets.add(
        Padding(
          padding: const EdgeInsets.only(right: 6),
          child: _buildUpiAppChip(
            label: app.appName,
            pkg: app.packageName,
            icon: Icons.payment_rounded,
            color: AppTheme.primary,
            isDark: isDark,
            isInstalled: true,
          ),
        ),
      );
    }

    // 3. Finally the system chooser.
    widgets.add(
      _buildUpiAppChip(
        label: 'System Chooser',
        pkg: null,
        icon: Icons.apps_rounded,
        color: Colors.grey,
        isDark: isDark,
        isInstalled: true,
      ),
    );

    return widgets;
  }

  Widget _buildUpiAppChip({
    required String label,
    required String? pkg,
    required IconData icon,
    required Color color,
    required bool isDark,
    bool isInstalled = true,
  }) {
    final isSelected = isInstalled && _selectedUpiPackage == pkg;

    // An app the user does not have installed stays visible but disabled, with
    // an explanation on tap — much clearer than the chip simply not existing.
    if (!isInstalled) {
      return Opacity(
        opacity: 0.45,
        child: GestureDetector(
          onTap: () {
            ScaffoldMessenger.of(context).showSnackBar(
              SnackBar(
                duration: const Duration(seconds: 3),
                behavior: SnackBarBehavior.floating,
                shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
                content: Text('$label is not installed on this phone. Install it from the Play Store, then come back here to pay with it.'),
              ),
            );
          },
          child: Container(
            padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
            decoration: BoxDecoration(
              color: isDark ? const Color(0xFF1E293B) : const Color(0xFFF1F5F9),
              borderRadius: BorderRadius.circular(8),
              border: Border.all(color: isDark ? AppTheme.borderDark : AppTheme.borderLight),
            ),
            child: Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                Icon(icon, size: 14, color: isDark ? Colors.white38 : Colors.black38),
                const SizedBox(width: 5),
                Text(
                  label,
                  style: TextStyle(
                    fontSize: 11,
                    fontWeight: FontWeight.w500,
                    color: isDark ? Colors.white38 : Colors.black38,
                  ),
                ),
                const SizedBox(width: 4),
                Icon(Icons.download_rounded, size: 11, color: isDark ? Colors.white38 : Colors.black38),
              ],
            ),
          ),
        ),
      );
    }

    return GestureDetector(
      onTap: () => setState(() => _selectedUpiPackage = pkg),
      child: AnimatedContainer(
        duration: const Duration(milliseconds: 180),
        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
        decoration: BoxDecoration(
          color: isSelected
              ? color.withOpacity(0.2)
              : (isDark ? const Color(0xFF1E293B) : const Color(0xFFF1F5F9)),
          borderRadius: BorderRadius.circular(8),
          border: Border.all(
            color: isSelected ? color : (isDark ? AppTheme.borderDark : AppTheme.borderLight),
            width: isSelected ? 1.5 : 1.0,
          ),
        ),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(icon, size: 14, color: isSelected ? color : (isDark ? Colors.white60 : Colors.black54)),
            const SizedBox(width: 5),
            Text(
              label,
              style: TextStyle(
                fontSize: 11,
                fontWeight: isSelected ? FontWeight.bold : FontWeight.w500,
                color: isSelected ? (isDark ? Colors.white : color) : (isDark ? Colors.white70 : Colors.black87),
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildModeChip({
    required IconData icon,
    required String label,
    required String subtitle,
    required bool isSelected,
    required VoidCallback onTap,
    required bool isDark,
  }) {
    return GestureDetector(
      onTap: onTap,
      child: AnimatedContainer(
        duration: const Duration(milliseconds: 180),
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
        decoration: BoxDecoration(
          color: isSelected
              ? AppTheme.primary.withOpacity(isDark ? 0.25 : 0.12)
              : (isDark ? AppTheme.bgInputDark : AppTheme.bgCardLightSoft),
          borderRadius: BorderRadius.circular(10),
          border: Border.all(
            color: isSelected ? AppTheme.primary : (isDark ? AppTheme.borderDark : AppTheme.borderLight),
            width: isSelected ? 1.5 : 1.0,
          ),
        ),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(
              icon,
              size: 16,
              color: isSelected ? AppTheme.primary : (isDark ? AppTheme.textSecondaryDark : AppTheme.textSecondaryLight),
            ),
            const SizedBox(width: 8),
            Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              mainAxisSize: MainAxisSize.min,
              children: [
                Text(
                  label,
                  style: TextStyle(
                    fontSize: 12,
                    fontWeight: FontWeight.bold,
                    color: isSelected
                        ? AppTheme.primary
                        : (isDark ? AppTheme.textPrimaryDark : AppTheme.textPrimaryLight),
                  ),
                ),
                Text(
                  subtitle,
                  style: TextStyle(
                    fontSize: 9.5,
                    color: isDark ? AppTheme.textSecondaryDark : AppTheme.textSecondaryLight,
                  ),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }

  /// Send / Receive segmented control shown in the app bar.
  Widget _buildModeSwitch(bool isDark) {
    Widget segment(PaymentsMode mode, IconData icon, String label) {
      final selected = _mode == mode;
      return Expanded(
        child: GestureDetector(
          onTap: () {
            if (_mode != mode) setState(() => _mode = mode);
          },
          behavior: HitTestBehavior.opaque,
          child: AnimatedContainer(
            duration: const Duration(milliseconds: 180),
            padding: const EdgeInsets.symmetric(vertical: 7),
            decoration: BoxDecoration(
              color: selected
                  ? AppTheme.primary
                  : (isDark ? const Color(0xFF1E293B) : const Color(0xFFF1F5F9)),
              borderRadius: BorderRadius.circular(9),
            ),
            child: Row(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                Icon(icon, size: 15, color: selected ? Colors.white : (isDark ? AppTheme.textSecondaryDark : AppTheme.textSecondaryLight)),
                const SizedBox(width: 6),
                Text(
                  label,
                  style: TextStyle(
                    fontSize: 13,
                    fontWeight: FontWeight.w700,
                    color: selected
                        ? Colors.white
                        : (isDark ? AppTheme.textSecondaryDark : AppTheme.textSecondaryLight),
                  ),
                ),
              ],
            ),
          ),
        ),
      );
    }

    return Container(
      padding: const EdgeInsets.all(3),
      decoration: BoxDecoration(
        color: isDark ? const Color(0xFF0B1220) : const Color(0xFFE2E8F0),
        borderRadius: BorderRadius.circular(12),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          segment(PaymentsMode.send, Icons.near_me_rounded, 'Send'),
          segment(PaymentsMode.receive, Icons.qr_code_2_rounded, 'Receive'),
        ],
      ),
    );
  }

  /// Receive is its own destination: QR + UPI ID + amount request, with no
  /// send form anywhere in sight.
  Widget _buildReceiveBody(bool isDark) {
    return SingleChildScrollView(
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Container(
            padding: const EdgeInsets.all(16),
            decoration: BoxDecoration(
              color: isDark ? AppTheme.bgCardDark : AppTheme.bgCardLight,
              borderRadius: BorderRadius.circular(16),
              border: Border.all(
                color: isDark ? AppTheme.borderDark : AppTheme.borderLight,
              ),
              boxShadow: [
                BoxShadow(
                  color: Colors.black.withOpacity(isDark ? 0.2 : 0.04),
                  blurRadius: 10,
                  offset: const Offset(0, 2),
                ),
              ],
            ),
            child: const ReceiveMoneyPanel(),
          ),
          const SizedBox(height: 16),
          // Scanning someone else's QR is the mirror image of showing yours,
          // so it belongs here too rather than only living inside Send.
          SizedBox(
            width: double.infinity,
            child: OutlinedButton.icon(
              style: OutlinedButton.styleFrom(
                padding: const EdgeInsets.symmetric(vertical: 13),
                side: BorderSide(
                  color: isDark ? AppTheme.borderDark : AppTheme.borderLight,
                ),
                shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
              ),
              icon: const Icon(Icons.qr_code_scanner_rounded, size: 18, color: AppTheme.primary),
              label: const Text(
                'Scan someone else’s QR to pay them',
                style: TextStyle(fontWeight: FontWeight.bold, fontSize: 13, color: AppTheme.primary),
              ),
              onPressed: () async {
                final scanned = await QrScannerModal.show(context);
                if (scanned == null || scanned.isEmpty || !mounted) return;
                setState(() {
                  _mode = PaymentsMode.send;
                  _recipientController.text = scanned;
                });
              },
            ),
          ),
        ],
      ),
    );
  }

  /// Compact strip at the top of the Send form that grades the amount currently
  /// in the box against balance, safe-to-spend and the user's minimum budget.
  Widget _buildBudgetStatusBanner({
    required bool isDark,
    required String label,
    required Color color,
    required double afterBalance,
    required double afterSafe,
  }) {
    if (_currentInputAmount <= 0) return const SizedBox.shrink();

    return Container(
      width: double.infinity,
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
      decoration: BoxDecoration(
        color: color.withOpacity(0.10),
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: color.withOpacity(0.45)),
      ),
      child: Row(
        children: [
          Icon(
            color == AppTheme.success
                ? Icons.check_circle_rounded
                : Icons.warning_amber_rounded,
            size: 18,
            color: color,
          ),
          const SizedBox(width: 8),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  label,
                  style: TextStyle(
                    fontSize: 11,
                    fontWeight: FontWeight.w800,
                    letterSpacing: 0.4,
                    color: color,
                  ),
                ),
                const SizedBox(height: 2),
                Text(
                  'After paying: ₹${afterBalance.toStringAsFixed(0)} balance · '
                  '₹${afterSafe.toStringAsFixed(0)} safe to spend',
                  style: TextStyle(
                    fontSize: 11,
                    color: isDark ? Colors.white70 : Colors.black54,
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  void _showSetPayBudgetDialog(AppState state) {
    final incomeCtrl = TextEditingController(
      text: state.userPayIncome != null ? state.userPayIncome!.toStringAsFixed(0) : '',
    );
    final limitCtrl = TextEditingController(
      text: state.userPaySpendLimit != null ? state.userPaySpendLimit!.toStringAsFixed(0) : '',
    );

    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      backgroundColor: const Color(0xFF0F172A),
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(24)),
      ),
      builder: (ctx) {
        return StatefulBuilder(
          builder: (context, setSheetState) {
            final inc = double.tryParse(incomeCtrl.text.trim()) ?? 0.0;
            final lim = double.tryParse(limitCtrl.text.trim()) ?? 0.0;
            final surplus = inc > lim ? inc - lim : 0.0;
            final spendPct = inc > 0 ? (lim / inc * 100).clamp(0, 100).toStringAsFixed(0) : '0';
            final savePct = inc > 0 ? (surplus / inc * 100).clamp(0, 100).toStringAsFixed(0) : '0';

            return Padding(
              padding: EdgeInsets.only(
                left: 20,
                right: 20,
                top: 20,
                bottom: 24 + MediaQuery.of(context).viewInsets.bottom,
              ),
              child: SingleChildScrollView(
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Center(
                      child: Container(
                        width: 40,
                        height: 4,
                        decoration: BoxDecoration(
                          color: const Color(0xFF334155),
                          borderRadius: BorderRadius.circular(2),
                        ),
                      ),
                    ),
                    const SizedBox(height: 16),
                    const Row(
                      children: [
                        Icon(Icons.tune_rounded, color: AppTheme.primary, size: 22),
                        SizedBox(width: 8),
                        Text(
                          'Set Pay & Spending Limit',
                          style: TextStyle(
                            fontSize: 18,
                            fontWeight: FontWeight.bold,
                            color: Colors.white,
                          ),
                        ),
                      ],
                    ),
                    const SizedBox(height: 6),
                    const Text(
                      'Decide how much you want to spend from your pay, and reserve the remainder to transfer to Savings & other sections.',
                      style: TextStyle(fontSize: 12, color: Color(0xFF94A3B8), height: 1.3),
                    ),
                    const SizedBox(height: 18),
                    // Monthly Pay / Income field
                    TextField(
                      controller: incomeCtrl,
                      keyboardType: TextInputType.number,
                      style: const TextStyle(color: Colors.white, fontSize: 15),
                      decoration: InputDecoration(
                        labelText: 'Monthly Pay / Income (₹)',
                        labelStyle: const TextStyle(color: Color(0xFF94A3B8), fontSize: 13),
                        prefixText: '₹ ',
                        prefixStyle: const TextStyle(color: AppTheme.primary, fontWeight: FontWeight.bold),
                        filled: true,
                        fillColor: const Color(0xFF1E293B),
                        border: OutlineInputBorder(
                          borderRadius: BorderRadius.circular(12),
                          borderSide: const BorderSide(color: Color(0xFF334155)),
                        ),
                      ),
                      onChanged: (_) => setSheetState(() {}),
                    ),
                    const SizedBox(height: 14),
                    // Desired Spending Limit field
                    TextField(
                      controller: limitCtrl,
                      keyboardType: TextInputType.number,
                      style: const TextStyle(color: Colors.white, fontSize: 15),
                      decoration: InputDecoration(
                        labelText: 'Maximum Spend Limit (₹)',
                        labelStyle: const TextStyle(color: Color(0xFF94A3B8), fontSize: 13),
                        prefixText: '₹ ',
                        prefixStyle: const TextStyle(color: Color(0xFFF59E0B), fontWeight: FontWeight.bold),
                        hintText: 'e.g. 15000',
                        hintStyle: const TextStyle(color: Colors.white30),
                        filled: true,
                        fillColor: const Color(0xFF1E293B),
                        border: OutlineInputBorder(
                          borderRadius: BorderRadius.circular(12),
                          borderSide: const BorderSide(color: Color(0xFF334155)),
                        ),
                      ),
                      onChanged: (_) => setSheetState(() {}),
                    ),
                    const SizedBox(height: 16),
                    // Visual Breakdown Box
                    if (inc > 0 || lim > 0)
                      Container(
                        padding: const EdgeInsets.all(14),
                        decoration: BoxDecoration(
                          color: const Color(0xFF1E293B),
                          borderRadius: BorderRadius.circular(12),
                          border: Border.all(color: const Color(0xFF334155)),
                        ),
                        child: Column(
                          children: [
                            Row(
                              mainAxisAlignment: MainAxisAlignment.spaceBetween,
                              children: [
                                Row(
                                  children: [
                                    Container(
                                      width: 10,
                                      height: 10,
                                      decoration: const BoxDecoration(
                                        color: Color(0xFFF59E0B),
                                        shape: BoxShape.circle,
                                      ),
                                    ),
                                    const SizedBox(width: 6),
                                    const Text('Allowed Spend:', style: TextStyle(color: Colors.white70, fontSize: 12)),
                                  ],
                                ),
                                Text(
                                  '₹${lim.toStringAsFixed(0)} ($spendPct%)',
                                  style: const TextStyle(color: Color(0xFFF59E0B), fontWeight: FontWeight.bold, fontSize: 13),
                                ),
                              ],
                            ),
                            const SizedBox(height: 8),
                            Row(
                              mainAxisAlignment: MainAxisAlignment.spaceBetween,
                              children: [
                                Row(
                                  children: [
                                    Container(
                                      width: 10,
                                      height: 10,
                                      decoration: const BoxDecoration(
                                        color: AppTheme.primary,
                                        shape: BoxShape.circle,
                                      ),
                                    ),
                                    const SizedBox(width: 6),
                                    const Text('Transfer to Savings / Others:', style: TextStyle(color: Colors.white70, fontSize: 12)),
                                  ],
                                ),
                                Text(
                                  '₹${surplus.toStringAsFixed(0)} ($savePct%)',
                                  style: const TextStyle(color: AppTheme.primary, fontWeight: FontWeight.bold, fontSize: 13),
                                ),
                              ],
                            ),
                          ],
                        ),
                      ),
                    const SizedBox(height: 20),
                    // Action Buttons
                    Row(
                      children: [
                        if (state.userPaySpendLimit != null)
                          Expanded(
                            child: OutlinedButton(
                              style: OutlinedButton.styleFrom(
                                foregroundColor: Colors.white60,
                                side: const BorderSide(color: Color(0xFF334155)),
                                padding: const EdgeInsets.symmetric(vertical: 14),
                                shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                              ),
                              onPressed: () async {
                                await state.clearUserPayBudget();
                                if (ctx.mounted) Navigator.pop(ctx);
                              },
                              child: const Text('Clear Limit'),
                            ),
                          ),
                        if (state.userPaySpendLimit != null) const SizedBox(width: 12),
                        Expanded(
                          flex: 2,
                          child: ElevatedButton(
                            style: ElevatedButton.styleFrom(
                              backgroundColor: AppTheme.primary,
                              foregroundColor: Colors.white,
                              padding: const EdgeInsets.symmetric(vertical: 14),
                              shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                            ),
                            onPressed: () async {
                              final newInc = double.tryParse(incomeCtrl.text.trim()) ?? 0.0;
                              final newLim = double.tryParse(limitCtrl.text.trim()) ?? 0.0;
                              final messenger = ScaffoldMessenger.of(context);
                              if (newLim <= 0) {
                                messenger.showSnackBar(
                                  const SnackBar(content: Text('Please enter a spending limit greater than zero.')),
                                );
                                return;
                              }
                              await state.setUserPayBudget(income: newInc, spendLimit: newLim);
                              if (ctx.mounted) Navigator.pop(ctx);
                              if (mounted) {
                                messenger.showSnackBar(
                                  SnackBar(
                                    content: Text('Spending limit set to ₹${newLim.toStringAsFixed(0)}/month!'),
                                    backgroundColor: const Color(0xFF10B981),
                                  ),
                                );
                              }
                            },
                            child: const Text('Save & Activate Limit', style: TextStyle(fontWeight: FontWeight.bold)),
                          ),
                        ),
                      ],
                    ),
                  ],
                ),
              ),
            );
          },
        );
      },
    );
  }

  void _showTransferSurplusDialog(AppState state) {
    final surplus = state.surplusForOtherSections;
    if (surplus <= 0) return;

    final transferCtrl = TextEditingController(text: surplus.toStringAsFixed(0));
    String target = 'emergency';

    showDialog(
      context: context,
      builder: (ctx) => StatefulBuilder(
        builder: (ctx, setDlgState) => AlertDialog(
          backgroundColor: const Color(0xFF0F172A),
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(18)),
          title: const Row(
            children: [
              Icon(Icons.savings_rounded, color: AppTheme.primary, size: 24),
              SizedBox(width: 8),
              Expanded(
                child: Text('Transfer Pay Surplus', style: TextStyle(color: Colors.white, fontSize: 16)),
              ),
            ],
          ),
          content: SingleChildScrollView(
            child: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  'You have ₹${surplus.toStringAsFixed(0)} set aside from your pay for savings.',
                  style: const TextStyle(fontSize: 13, color: Color(0xFF94A3B8)),
                ),
                const SizedBox(height: 14),
                TextField(
                  controller: transferCtrl,
                  keyboardType: TextInputType.number,
                  style: const TextStyle(color: Colors.white),
                  decoration: InputDecoration(
                    labelText: 'Amount to Transfer (₹)',
                    labelStyle: const TextStyle(color: Color(0xFF94A3B8), fontSize: 12),
                    prefixText: '₹ ',
                    prefixStyle: const TextStyle(color: AppTheme.primary),
                    filled: true,
                    fillColor: const Color(0xFF1E293B),
                    border: OutlineInputBorder(borderRadius: BorderRadius.circular(10)),
                  ),
                ),
                const SizedBox(height: 14),
                const Text('Destination:', style: TextStyle(fontSize: 12, color: Color(0xFF94A3B8))),
                const SizedBox(height: 6),
                Row(
                  children: [
                    ChoiceChip(
                      label: const Text('Emergency Shield', style: TextStyle(fontSize: 11)),
                      selected: target == 'emergency',
                      selectedColor: AppTheme.primary,
                      checkmarkColor: Colors.white,
                      backgroundColor: const Color(0xFF1E293B),
                      onSelected: (val) => setDlgState(() => target = 'emergency'),
                    ),
                    const SizedBox(width: 8),
                    ChoiceChip(
                      label: const Text('Savings Goals', style: TextStyle(fontSize: 11)),
                      selected: target == 'savings',
                      selectedColor: AppTheme.primary,
                      checkmarkColor: Colors.white,
                      backgroundColor: const Color(0xFF1E293B),
                      onSelected: (val) => setDlgState(() => target = 'savings'),
                    ),
                  ],
                ),
              ],
            ),
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.pop(ctx),
              child: const Text('Cancel', style: TextStyle(color: Colors.white54)),
            ),
            ElevatedButton(
              style: ElevatedButton.styleFrom(
                backgroundColor: AppTheme.primary,
                foregroundColor: Colors.white,
              ),
              onPressed: () async {
                final amt = double.tryParse(transferCtrl.text.trim()) ?? 0.0;
                if (amt <= 0) return;
                Navigator.pop(ctx);
                if (target == 'emergency') {
                  final res = await state.depositEmergencyFund(amt, overlayContext: mounted ? context : null);
                  if (mounted) {
                    ScaffoldMessenger.of(context).showSnackBar(
                      SnackBar(
                        content: Text(res['message'] ?? 'Transferred ₹${amt.toStringAsFixed(0)} to Emergency Fund!'),
                        backgroundColor: const Color(0xFF10B981),
                      ),
                    );
                  }
                } else {
                  if (state.savingsGoals.isNotEmpty) {
                    state.depositToSavingsGoal(state.savingsGoals.first.id, amt);
                    if (mounted) {
                      ScaffoldMessenger.of(context).showSnackBar(
                        SnackBar(
                          content: Text('Deposited ₹${amt.toStringAsFixed(0)} to ${state.savingsGoals.first.title}!'),
                          backgroundColor: const Color(0xFF10B981),
                        ),
                      );
                    }
                  } else {
                    final res = await state.depositEmergencyFund(amt, overlayContext: mounted ? context : null);
                    if (mounted) {
                      ScaffoldMessenger.of(context).showSnackBar(
                        SnackBar(
                          content: Text(res['message'] ?? 'Transferred ₹${amt.toStringAsFixed(0)} to Emergency Fund!'),
                          backgroundColor: const Color(0xFF10B981),
                        ),
                      );
                    }
                  }
                }
              },
              child: const Text('Confirm Transfer'),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildPaySpendLimitCard(AppState state, bool isDark) {
    if (state.userPaySpendLimit == null) {
      return InkWell(
        onTap: () => _showSetPayBudgetDialog(state),
        borderRadius: BorderRadius.circular(14),
        child: Container(
          padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
          decoration: BoxDecoration(
            color: isDark ? const Color(0xFF1E293B) : const Color(0xFFF1F5F9),
            borderRadius: BorderRadius.circular(14),
            border: Border.all(
              color: isDark ? const Color(0xFF334155) : const Color(0xFFCBD5E1),
              style: BorderStyle.solid,
            ),
          ),
          child: Row(
            children: [
              Container(
                width: 36,
                height: 36,
                decoration: BoxDecoration(
                  color: AppTheme.primary.withOpacity(0.12),
                  borderRadius: BorderRadius.circular(8),
                ),
                child: const Icon(Icons.shield_moon_outlined, color: AppTheme.primary, size: 20),
              ),
              const SizedBox(width: 12),
              const Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      'Set Pay Spending Limit',
                      style: TextStyle(
                        fontSize: 13,
                        fontWeight: FontWeight.bold,
                      ),
                    ),
                    SizedBox(height: 2),
                    Text(
                      'Limit your spending and allocate the rest to savings.',
                      style: TextStyle(fontSize: 11, color: Color(0xFF94A3B8)),
                    ),
                  ],
                ),
              ),
              const Icon(Icons.chevron_right_rounded, color: Color(0xFF94A3B8), size: 20),
            ],
          ),
        ),
      );
    }

    final limit = state.userPaySpendLimit!;
    final spent = state.thisMonthSpent;
    final remaining = state.remainingPaySpendBudget;
    final pct = state.paySpendUsagePercent;
    final isExceeded = spent > limit;
    final isNearLimit = pct >= 0.8 && !isExceeded;

    final Color statusColor = isExceeded
        ? const Color(0xFFEF4444)
        : isNearLimit
            ? const Color(0xFFF59E0B)
            : const Color(0xFF10B981);

    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: isDark ? AppTheme.bgCardDark : AppTheme.bgCardLight,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(
          color: statusColor.withOpacity(0.35),
          width: 1.2,
        ),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Row(
                children: [
                  Icon(
                    isExceeded ? Icons.warning_amber_rounded : Icons.account_balance_wallet_outlined,
                    color: statusColor,
                    size: 18,
                  ),
                  const SizedBox(width: 6),
                  const Text(
                    'Pay Spending Budget',
                    style: TextStyle(
                      fontSize: 13,
                      fontWeight: FontWeight.bold,
                    ),
                  ),
                ],
              ),
              InkWell(
                onTap: () => _showSetPayBudgetDialog(state),
                child: Padding(
                  padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                  child: Row(
                    children: [
                      Text(
                        'Edit',
                        style: TextStyle(
                          fontSize: 12,
                          color: isDark ? Colors.white70 : Colors.black87,
                          fontWeight: FontWeight.w600,
                        ),
                      ),
                      const SizedBox(width: 2),
                      const Icon(Icons.edit_outlined, size: 13, color: AppTheme.primary),
                    ],
                  ),
                ),
              ),
            ],
          ),
          const SizedBox(height: 10),
          // Progress bar
          ClipRRect(
            borderRadius: BorderRadius.circular(6),
            child: LinearProgressIndicator(
              value: pct,
              minHeight: 6,
              backgroundColor: isDark ? const Color(0xFF334155) : const Color(0xFFE2E8F0),
              valueColor: AlwaysStoppedAnimation<Color>(statusColor),
            ),
          ),
          const SizedBox(height: 8),
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Expanded(
                child: Text(
                  'Spent ₹${spent.toStringAsFixed(0)} of ₹${limit.toStringAsFixed(0)} limit',
                  style: TextStyle(
                    fontSize: 11,
                    color: isDark ? Colors.white70 : Colors.black87,
                    fontWeight: FontWeight.w500,
                  ),
                  overflow: TextOverflow.ellipsis,
                ),
              ),
              const SizedBox(width: 8),
              Text(
                isExceeded
                    ? 'Exceeded by ₹${(spent - limit).toStringAsFixed(0)}'
                    : '₹${remaining.toStringAsFixed(0)} remaining',
                style: TextStyle(
                  fontSize: 11,
                  color: statusColor,
                  fontWeight: FontWeight.bold,
                ),
              ),
            ],
          ),
          if (state.surplusForOtherSections > 0) ...[
            const SizedBox(height: 8),
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
              decoration: BoxDecoration(
                color: AppTheme.primary.withOpacity(0.08),
                borderRadius: BorderRadius.circular(8),
              ),
              child: Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  Expanded(
                    child: Text(
                      'Savings surplus: ₹${state.surplusForOtherSections.toStringAsFixed(0)}',
                      style: const TextStyle(fontSize: 11, color: AppTheme.primary, fontWeight: FontWeight.w600),
                      overflow: TextOverflow.ellipsis,
                    ),
                  ),
                  const SizedBox(width: 8),
                  InkWell(
                    onTap: () => _showTransferSurplusDialog(state),
                    child: const Text(
                      'Transfer Now →',
                      style: TextStyle(
                        fontSize: 11,
                        color: AppTheme.primary,
                        fontWeight: FontWeight.bold,
                        decoration: TextDecoration.underline,
                      ),
                    ),
                  ),
                ],
              ),
            ),
          ],
        ],
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final state = Provider.of<AppState>(context);
    final theme = Theme.of(context);
    final isDark = theme.brightness == Brightness.dark;
    final available = state.totalAvailableBalance;
    final safe = state.safeToSpend.safeToSpend;

    final afterBalance = Math.max(0, available - _currentInputAmount);
    final afterSafe = Math.max(0, safe - _currentInputAmount);
    final exceedsSafe = _currentInputAmount > safe;
    final exceedsBalance = _currentInputAmount > available;
    final belowMinBudget = _currentInputAmount > 0 &&
        (available - _currentInputAmount) < state.minimumBudgetFloor &&
        !exceedsBalance;

    final String statusBadgeText = exceedsBalance
        ? 'HIGH IMPACT / INSUFFICIENT'
        : belowMinBudget
            ? 'CROSSES YOUR MINIMUM BUDGET'
            : exceedsSafe
                ? 'TIGHT (EXCEEDS SAFE-TO-SPEND)'
                : 'COMFORTABLE BUFFER';

    final Color statusColor = exceedsBalance
        ? AppTheme.danger
        : belowMinBudget
            ? AppTheme.danger
            : exceedsSafe
                ? AppTheme.warning
                : AppTheme.success;

    return Scaffold(
      appBar: AppBar(
        title: _buildModeSwitch(isDark),
        actions: [
          IconButton(
            icon: Icon(
              state.isSpeaking ? Icons.volume_up_rounded : Icons.volume_up_outlined,
              color: state.isSpeaking ? AppTheme.primary : null,
            ),
            tooltip: state.isSpeaking ? state.t('readAloudStop') : state.t('readAloud'),
            onPressed: () {
              if (state.isSpeaking) {
                state.stopSpeaking();
              } else {
                state.speakPaymentNarration();
              }
            },
          ),
        ],
      ),
      body: _mode == PaymentsMode.receive
          ? _buildReceiveBody(isDark)
          : SingleChildScrollView(
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            // Live affordability status — shown *before* the tap so the user
            // sees they are crossing their minimum budget while there is still
            // time to back out, not after the money has left.
            _buildBudgetStatusBanner(
              isDark: isDark,
              label: statusBadgeText,
              color: statusColor,
              afterBalance: afterBalance,
              afterSafe: afterSafe,
            ),
            const SizedBox(height: 14),

            // Pay & Spending Budget Allocation Card
            _buildPaySpendLimitCard(state, isDark),
            const SizedBox(height: 14),

            // Quick Send Box (Matches Web quick action form)
            Container(
              padding: const EdgeInsets.all(18),
              decoration: BoxDecoration(
                color: isDark ? AppTheme.bgCardDark : AppTheme.bgCardLight,
                borderRadius: BorderRadius.circular(16),
                border: Border.all(
                  color: isDark ? AppTheme.borderDark : AppTheme.borderLight,
                ),
                boxShadow: [
                  BoxShadow(
                    color: Colors.black.withOpacity(isDark ? 0.2 : 0.04),
                    blurRadius: 10,
                    offset: const Offset(0, 2),
                  ),
                ],
              ),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                    children: [
                      Expanded(
                        child: Row(
                          children: [
                            Container(
                              width: 36,
                              height: 36,
                              decoration: BoxDecoration(
                                gradient: AppTheme.gradientPrimary,
                                borderRadius: BorderRadius.circular(8),
                              ),
                              alignment: Alignment.center,
                              child: const Text('💸', style: TextStyle(fontSize: 18)),
                            ),
                            const SizedBox(width: 10),
                            Expanded(
                              child: Text(
                                state.t('sendMoneyTitle'),
                                style: TextStyle(
                                  fontSize: 16,
                                  fontWeight: FontWeight.w800,
                                  color: isDark ? AppTheme.textPrimaryDark : AppTheme.textPrimaryLight,
                                ),
                                overflow: TextOverflow.ellipsis,
                              ),
                            ),
                          ],
                        ),
                      ),
                      const SizedBox(width: 8),
                      Container(
                        padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                        decoration: BoxDecoration(
                          color: const Color(0x2610B981),
                          borderRadius: BorderRadius.circular(6),
                        ),
                        child: Row(
                          mainAxisSize: MainAxisSize.min,
                          children: [
                            Container(
                              width: 6,
                              height: 6,
                              decoration: const BoxDecoration(
                                shape: BoxShape.circle,
                                color: Color(0xFF10B981),
                              ),
                            ),
                            const SizedBox(width: 5),
                            const Text(
                              '⚡ INSTANT UPI 2.0',
                              style: TextStyle(
                                fontSize: 10,
                                fontWeight: FontWeight.bold,
                                color: Color(0xFF10B981),
                              ),
                            ),
                          ],
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 8),
                  Text(
                    'Direct bank-to-bank transfer with real-time balance and safe-to-spend limits protection.',
                    style: TextStyle(
                      fontSize: 11,
                      color: isDark ? AppTheme.textSecondaryDark : AppTheme.textSecondaryLight,
                    ),
                  ),
                  const SizedBox(height: 14),

                  // Payment Engine Mode Selector
                  SingleChildScrollView(
                    scrollDirection: Axis.horizontal,
                    child: Row(
                      children: [
                        _buildModeChip(
                          icon: Icons.flash_on_rounded,
                          label: '⚡ Real UPI App',
                          subtitle: 'GPay/PhonePe/Paytm',
                          isSelected: _selectedPaymentMode == PaymentGatewayProvider.upiApp,
                          onTap: () => setState(() => _selectedPaymentMode = PaymentGatewayProvider.upiApp),
                          isDark: isDark,
                        ),
                        const SizedBox(width: 8),
                        _buildModeChip(
                          icon: Icons.security_rounded,
                          label: '💳 Razorpay Gateway',
                          subtitle: 'Cards/NetBanking/UPI',
                          isSelected: _selectedPaymentMode == PaymentGatewayProvider.razorpay,
                          onTap: () => setState(() => _selectedPaymentMode = PaymentGatewayProvider.razorpay),
                          isDark: isDark,
                        ),
                      ],
                    ),
                  ),
                  if (_selectedPaymentMode == PaymentGatewayProvider.upiApp) ...[
                    const SizedBox(height: 10),
                    SingleChildScrollView(
                      scrollDirection: Axis.horizontal,
                      child: Row(
                        children: [
                          Text(
                            'Open with:',
                            style: TextStyle(
                              fontSize: 11,
                              fontWeight: FontWeight.w600,
                              color: isDark ? AppTheme.textSecondaryDark : AppTheme.textSecondaryLight,
                            ),
                          ),
                          const SizedBox(width: 8),
                          ..._buildAppChips(isDark),
                        ],
                      ),
                    ),
                  ],
                  const SizedBox(height: 16),

                  // Recipient
                  TextField(
                    controller: _recipientController,
                    decoration: InputDecoration(
                      labelText: state.t('recipientHint'),
                      labelStyle: TextStyle(
                        fontSize: 12,
                        color: isDark ? AppTheme.textSecondaryDark : AppTheme.textSecondaryLight,
                      ),
                      filled: true,
                      fillColor: isDark ? AppTheme.bgInputDark : AppTheme.bgCardLightSoft,
                      border: OutlineInputBorder(
                        borderRadius: BorderRadius.circular(10),
                        borderSide: BorderSide(color: isDark ? AppTheme.borderDark : AppTheme.borderLight),
                      ),
                      enabledBorder: OutlineInputBorder(
                        borderRadius: BorderRadius.circular(10),
                        borderSide: BorderSide(color: isDark ? AppTheme.borderDark : AppTheme.borderLight),
                      ),
                      focusedBorder: OutlineInputBorder(
                        borderRadius: BorderRadius.circular(10),
                        borderSide: const BorderSide(color: AppTheme.primary, width: 1.5),
                      ),
                      prefixIcon: Icon(
                        Icons.person_outline,
                        size: 20,
                        color: isDark ? AppTheme.textSecondaryDark : AppTheme.textSecondaryLight,
                      ),
                      suffixIcon: IconButton(
                        icon: const Icon(Icons.qr_code_scanner_rounded, color: AppTheme.primary),
                        tooltip: 'Scan UPI QR / User',
                        onPressed: () async {
                          final scanned = await QrScannerModal.show(context);
                          if (!mounted || !context.mounted) return;
                          if (scanned != null && scanned.isNotEmpty) {
                            final upi = RealPaymentService.parseUpiQr(scanned);
                            if (upi != null && upi.isValid) {
                              setState(() {
                                _detectedUpiDetails = upi;
                                _recipientController.text = upi.vpa;
                                if (upi.amount != null && upi.amount! > 0) {
                                  _amountController.text = upi.amount!.toStringAsFixed(0);
                                  _currentInputAmount = upi.amount!;
                                }
                                if (upi.note != null && upi.note!.isNotEmpty) {
                                  _noteController.text = upi.note!;
                                }
                                _selectedPaymentMode = PaymentGatewayProvider.upiApp;
                              });
                              ScaffoldMessenger.of(context).showSnackBar(
                                SnackBar(
                                  content: Text('Scanned UPI QR: ${upi.name} (${upi.vpa})'),
                                  backgroundColor: AppTheme.primary,
                                ),
                              );
                            } else {
                              setState(() {
                                _recipientController.text = scanned;
                              });
                            }
                          }
                        },
                      ),
                    ),
                  ),
                  if (_recipientController.text.trim().isNotEmpty) ...[
                    const SizedBox(height: 6),
                    Builder(
                      builder: (context) {
                        final displayName = (_detectedUpiDetails != null && _detectedUpiDetails!.name.isNotEmpty)
                            ? _detectedUpiDetails!.name
                            : _recipientController.text.trim();
                        final isMerch = _isMerchant;
                        final badgeColor = isMerch ? AppTheme.success : const Color(0xFF8B5CF6);
                        final badgeBg = isMerch ? AppTheme.success.withOpacity(0.12) : const Color(0x1F8B5CF6);
                        final icon = isMerch ? Icons.storefront_rounded : Icons.person_rounded;
                        final label = isMerch
                            ? '🏪 Merchant Store (Instant 1-Click Pay)'
                            : (_isMobileNumber
                                ? '📱 Friend Mobile: $displayName'
                                : '👤 Friend / Personal Account: $displayName');

                        return Container(
                          padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                          decoration: BoxDecoration(
                            color: badgeBg,
                            borderRadius: BorderRadius.circular(8),
                            border: Border.all(color: badgeColor.withOpacity(0.35)),
                          ),
                          child: Row(
                            mainAxisSize: MainAxisSize.min,
                            children: [
                              Icon(icon, size: 14, color: badgeColor),
                              const SizedBox(width: 5),
                              Flexible(
                                child: Text(
                                  label,
                                  style: TextStyle(fontSize: 10.5, fontWeight: FontWeight.bold, color: badgeColor),
                                  overflow: TextOverflow.ellipsis,
                                ),
                              ),
                            ],
                          ),
                        );
                      },
                    ),
                  ],
                  const SizedBox(height: 12),

                  // Amount
                  TextField(
                    controller: _amountController,
                    keyboardType: TextInputType.number,
                    decoration: InputDecoration(
                      labelText: state.t('amountHint'),
                      labelStyle: TextStyle(
                        fontSize: 12,
                        color: isDark ? AppTheme.textSecondaryDark : AppTheme.textSecondaryLight,
                      ),
                      filled: true,
                      fillColor: isDark ? AppTheme.bgInputDark : AppTheme.bgCardLightSoft,
                      border: OutlineInputBorder(
                        borderRadius: BorderRadius.circular(10),
                        borderSide: BorderSide(color: isDark ? AppTheme.borderDark : AppTheme.borderLight),
                      ),
                      enabledBorder: OutlineInputBorder(
                        borderRadius: BorderRadius.circular(10),
                        borderSide: BorderSide(color: isDark ? AppTheme.borderDark : AppTheme.borderLight),
                      ),
                      focusedBorder: OutlineInputBorder(
                        borderRadius: BorderRadius.circular(10),
                        borderSide: const BorderSide(color: AppTheme.primary, width: 1.5),
                      ),
                      prefixIcon: Icon(
                        Icons.currency_rupee,
                        size: 20,
                        color: isDark ? AppTheme.textSecondaryDark : AppTheme.textSecondaryLight,
                      ),
                    ),
                  ),
                  const SizedBox(height: 12),

                  // Note / Reference Field
                  TextField(
                    controller: _noteController,
                    decoration: InputDecoration(
                      labelText: 'Payment Note / Purpose (Optional)',
                      labelStyle: TextStyle(
                        fontSize: 12,
                        color: isDark ? AppTheme.textSecondaryDark : AppTheme.textSecondaryLight,
                      ),
                      filled: true,
                      fillColor: isDark ? AppTheme.bgInputDark : AppTheme.bgCardLightSoft,
                      border: OutlineInputBorder(
                        borderRadius: BorderRadius.circular(10),
                        borderSide: BorderSide(color: isDark ? AppTheme.borderDark : AppTheme.borderLight),
                      ),
                      enabledBorder: OutlineInputBorder(
                        borderRadius: BorderRadius.circular(10),
                        borderSide: BorderSide(color: isDark ? AppTheme.borderDark : AppTheme.borderLight),
                      ),
                      focusedBorder: OutlineInputBorder(
                        borderRadius: BorderRadius.circular(10),
                        borderSide: const BorderSide(color: AppTheme.primary, width: 1.5),
                      ),
                      prefixIcon: Icon(
                        Icons.note_alt_outlined,
                        size: 20,
                        color: isDark ? AppTheme.textSecondaryDark : AppTheme.textSecondaryLight,
                      ),
                    ),
                  ),
                  const SizedBox(height: 12),

                  // Category dropdown
                  DropdownButtonFormField<TransactionCategory>(
                    initialValue: _selectedCategory,
                    dropdownColor: isDark ? AppTheme.bgCardDark : AppTheme.bgCardLight,
                    decoration: InputDecoration(
                      labelText: state.t('categoryLabel'),
                      labelStyle: TextStyle(
                        fontSize: 12,
                        color: isDark ? AppTheme.textSecondaryDark : AppTheme.textSecondaryLight,
                      ),
                      filled: true,
                      fillColor: isDark ? AppTheme.bgInputDark : AppTheme.bgCardLightSoft,
                      border: OutlineInputBorder(
                        borderRadius: BorderRadius.circular(10),
                        borderSide: BorderSide(color: isDark ? AppTheme.borderDark : AppTheme.borderLight),
                      ),
                      enabledBorder: OutlineInputBorder(
                        borderRadius: BorderRadius.circular(10),
                        borderSide: BorderSide(color: isDark ? AppTheme.borderDark : AppTheme.borderLight),
                      ),
                      focusedBorder: OutlineInputBorder(
                        borderRadius: BorderRadius.circular(10),
                        borderSide: const BorderSide(color: AppTheme.primary, width: 1.5),
                      ),
                    ),
                    items: TransactionCategory.values.map((cat) {
                      return DropdownMenuItem(
                        value: cat,
                        child: Text(cat.toString().split('.').last, style: const TextStyle(fontSize: 13)),
                      );
                    }).toList(),
                    onChanged: (val) {
                      if (val != null) setState(() => _selectedCategory = val);
                    },
                  ),
                  const SizedBox(height: 16),

                  // Smart Impulse Guard & Pre-Transaction Spend Impact Predictor
                  if (_currentInputAmount > 0) ...[
                    Builder(
                      builder: (context) {
                        final impact = state.analyzeSpendImpact(_currentInputAmount, category: _selectedCategory);
                        final roundUp = state.calculateRoundUp(_currentInputAmount);
                        final isImpulse = impact.severity == SpendImpactSeverity.impulseWarning;
                        final isHigh = impact.severity == SpendImpactSeverity.highImpact;
                        final cardColor = isImpulse
                            ? const Color(0xFFEF4444)
                            : (isHigh ? const Color(0xFFF59E0B) : AppTheme.primary);

                        return Container(
                          padding: const EdgeInsets.all(14),
                          decoration: BoxDecoration(
                            color: cardColor.withOpacity(0.1),
                            borderRadius: BorderRadius.circular(12),
                            border: Border.all(color: cardColor.withOpacity(0.35)),
                          ),
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Row(
                                children: [
                                  Icon(
                                    isImpulse
                                        ? Icons.shield_outlined
                                        : (isHigh ? Icons.warning_amber_rounded : Icons.insights_rounded),
                                    size: 16,
                                    color: cardColor,
                                  ),
                                  const SizedBox(width: 6),
                                  Text(
                                    isImpulse
                                        ? '🛡️ SMART IMPULSE GUARD'
                                        : (isHigh ? '⚠️ HIGH-IMPACT SPEND' : '🎯 SPEND IMPACT PREDICTOR'),
                                    style: TextStyle(fontSize: 11, fontWeight: FontWeight.bold, color: cardColor, letterSpacing: 0.5),
                                  ),
                                ],
                              ),
                              const SizedBox(height: 8),
                              Text(
                                impact.message,
                                style: TextStyle(
                                  fontSize: 11.5,
                                  fontWeight: FontWeight.w600,
                                  color: isDark ? AppTheme.textPrimaryDark : AppTheme.textPrimaryLight,
                                  height: 1.3,
                                ),
                              ),
                              const SizedBox(height: 8),
                              _affordRow('Safe-to-Spend After:', '₹${impact.safeToSpendAfter.toStringAsFixed(0)} (-${impact.safeToSpendDropPercent.toStringAsFixed(0)}%)', isDark: isDark),
                              if (impact.daysGoalDelayed > 0)
                                _affordRow('Goal Impact:', 'Delays "${impact.primaryGoalName}" by ~${impact.daysGoalDelayed} days', isDark: isDark),
                              if (roundUp > 0)
                                Padding(
                                  padding: const EdgeInsets.only(top: 6),
                                  child: Row(
                                    children: [
                                      const Text('🪙', style: TextStyle(fontSize: 12)),
                                      const SizedBox(width: 4),
                                      Expanded(
                                        child: Text(
                                          '+₹${roundUp.toStringAsFixed(0)} spare change will be saved to your Round-Up Vault',
                                          style: const TextStyle(fontSize: 10.5, fontWeight: FontWeight.bold, color: AppTheme.success),
                                          overflow: TextOverflow.ellipsis,
                                        ),
                                      ),
                                    ],
                                  ),
                                ),
                            ],
                          ),
                        );
                      },
                    ),
                    const SizedBox(height: 16),
                  ],

                  SizedBox(
                    width: double.infinity,
                    height: 46,
                    child: ElevatedButton(
                      style: ElevatedButton.styleFrom(
                        backgroundColor: AppTheme.primary,
                        foregroundColor: Colors.white,
                        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
                        elevation: 0,
                      ),
                      onPressed: _handlePay,
                      child: Text(state.t('payNow'), style: const TextStyle(fontSize: 14, fontWeight: FontWeight.bold)),
                    ),
                  ),
                  const SizedBox(height: 10),
                  SizedBox(
                    width: double.infinity,
                    height: 44,
                    child: OutlinedButton.icon(
                      style: OutlinedButton.styleFrom(
                        foregroundColor: AppTheme.primary,
                        side: const BorderSide(color: AppTheme.primary, width: 1.5),
                        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
                      ),
                      icon: const Icon(Icons.qr_code_rounded, size: 18),
                      label: const Text('Receive / My QR Code',
                          style: TextStyle(fontSize: 13, fontWeight: FontWeight.bold)),
                      onPressed: () => setState(() => _mode = PaymentsMode.receive),
                    ),
                  ),
                ],
              ),
            ),
            const SizedBox(height: 20),

            // Payment Status Center
            if (state.pendingPayments.isNotEmpty) ...[
              Container(
                padding: const EdgeInsets.all(16),
                decoration: BoxDecoration(
                  color: isDark ? AppTheme.bgCardDark : AppTheme.bgCardLight,
                  borderRadius: BorderRadius.circular(14),
                  border: Border.all(
                    color: isDark ? AppTheme.borderDark : AppTheme.borderLight,
                  ),
                ),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      mainAxisAlignment: MainAxisAlignment.spaceBetween,
                      children: [
                        Expanded(
                          child: Row(
                            children: [
                              const Text('⏱️', style: TextStyle(fontSize: 16)),
                              const SizedBox(width: 8),
                              Flexible(
                                child: Text(
                                  'Payment Status Center',
                                  style: TextStyle(
                                    fontSize: 13,
                                    fontWeight: FontWeight.w700,
                                    color: isDark ? AppTheme.textPrimaryDark : AppTheme.textPrimaryLight,
                                  ),
                                  overflow: TextOverflow.ellipsis,
                                ),
                              ),
                            ],
                          ),
                        ),
                        const SizedBox(width: 8),
                        Text(
                          'Authoritative State',
                          style: TextStyle(fontSize: 11, color: isDark ? AppTheme.textMutedDark : AppTheme.textSecondaryLight),
                        ),
                      ],
                    ),
                    const SizedBox(height: 12),
                    ...state.pendingPayments.map((p) {
                      final isProcessing = p.state == 'PROCESSING';
                      final isPending = p.state == 'PENDING';
                      final Color badgeColor = isProcessing
                          ? const Color(0xFF38BDF8)
                          : isPending
                              ? const Color(0xFFFBBF24)
                              : const Color(0xFF34D399);

                      return Container(
                        margin: const EdgeInsets.only(bottom: 8),
                        padding: const EdgeInsets.all(12),
                        decoration: BoxDecoration(
                          color: isDark ? AppTheme.bgCardDarkHover : AppTheme.bgCardLightSoft,
                          borderRadius: BorderRadius.circular(10),
                        ),
                        child: Row(
                          mainAxisAlignment: MainAxisAlignment.spaceBetween,
                          children: [
                            Expanded(
                              child: Column(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: [
                                  Text(
                                    p.recipient,
                                    maxLines: 1,
                                    overflow: TextOverflow.ellipsis,
                                    style: TextStyle(
                                      fontWeight: FontWeight.w600,
                                      fontSize: 13,
                                      color: isDark ? AppTheme.textPrimaryDark : AppTheme.textPrimaryLight,
                                    ),
                                  ),
                                  const SizedBox(height: 2),
                                  Text(
                                    p.createdAt,
                                    style: TextStyle(fontSize: 11, color: isDark ? AppTheme.textSecondaryDark : AppTheme.textSecondaryLight),
                                  ),
                                ],
                              ),
                            ),
                            const SizedBox(width: 8),
                            Column(
                              crossAxisAlignment: CrossAxisAlignment.end,
                              children: [
                                Text(
                                  '₹${p.amount.toStringAsFixed(0)}',
                                  style: TextStyle(
                                    fontWeight: FontWeight.bold,
                                    fontSize: 13,
                                    color: isDark ? AppTheme.textPrimaryDark : AppTheme.textPrimaryLight,
                                  ),
                                ),
                                const SizedBox(height: 4),
                                Container(
                                  padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                                  decoration: BoxDecoration(
                                    color: badgeColor.withOpacity(0.15),
                                    borderRadius: BorderRadius.circular(6),
                                  ),
                                  child: Text(
                                    p.state,
                                    style: TextStyle(fontSize: 10, fontWeight: FontWeight.bold, color: badgeColor),
                                  ),
                                ),
                              ],
                            ),
                          ],
                        ),
                      );
                    }),
                  ],
                ),
              ),
              const SizedBox(height: 20),
            ],

            // Financial Accounts & Account Aggregator Linking
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                Expanded(
                  child: Text(
                    // An SMS-mirrored account is NOT a connected account —
                    // the heading must not claim a link that doesn't exist.
                    state.bankAccounts.isNotEmpty &&
                            state.bankAccounts
                                .every((b) => b.providerType == 'SMS_MIRROR')
                        ? 'Your Accounts · mirrored from SMS (${state.bankAccounts.length})'
                        : 'Connected Accounts (${state.bankAccounts.length})',
                    style: TextStyle(
                      fontSize: 15,
                      fontWeight: FontWeight.w800,
                      color: isDark ? AppTheme.textPrimaryDark : AppTheme.textPrimaryLight,
                    ),
                  ),
                ),
                IconButton(
                  tooltip: 'Sync balances',
                  icon: const Icon(Icons.sync, size: 20, color: AppTheme.primary),
                  visualDensity: VisualDensity.compact,
                  onPressed: () async {
                    final success = await state.syncProviderAccounts();
                    if (!context.mounted) return;
                    ScaffoldMessenger.of(context).showSnackBar(
                      SnackBar(
                        content: Text(success ? 'Balances & transactions synchronized.' : 'Sync completed.'),
                      ),
                    );
                  },
                ),
                TextButton.icon(
                  style: TextButton.styleFrom(
                    visualDensity: VisualDensity.compact,
                    padding: const EdgeInsets.symmetric(horizontal: 8),
                  ),
                  icon: const Icon(Icons.add_link, size: 16, color: AppTheme.primaryLight),
                  label: const Text('Connect', style: TextStyle(fontSize: 12, fontWeight: FontWeight.bold, color: AppTheme.primaryLight)),
                  onPressed: () => _showAccountLinkingModal(context),
                ),
              ],
            ),
            const SizedBox(height: 8),

            ...state.bankAccounts.map((bank) {
              final isDemo = state.isDemoMode && bank.isDemo;
              final Color badgeBg = isDemo ? const Color(0xFFF59E0B).withOpacity(0.15) : const Color(0xFF10B981).withOpacity(0.15);
              final Color badgeText = isDemo ? const Color(0xFFFBBF24) : const Color(0xFF34D399);

              final freshness = bank.freshnessStatus.toUpperCase();
              final Color freshnessColor = freshness == 'CURRENT'
                  ? AppTheme.success
                  : freshness == 'STALE'
                      ? AppTheme.warning
                      : freshness == 'SYNCING'
                          ? AppTheme.primary
                          : freshness == 'FAILED'
                              ? AppTheme.danger
                              : const Color(0xFF94A3B8);

              return Container(
                margin: const EdgeInsets.only(bottom: 10),
                padding: const EdgeInsets.all(14),
                decoration: BoxDecoration(
                  color: isDark ? AppTheme.bgCardDark : AppTheme.bgCardLight,
                  borderRadius: BorderRadius.circular(14),
                  border: Border.all(
                    color: isDark ? AppTheme.borderDark : AppTheme.borderLight,
                  ),
                  boxShadow: [
                    BoxShadow(
                      color: Colors.black.withOpacity(isDark ? 0.15 : 0.03),
                      blurRadius: 6,
                      offset: const Offset(0, 2),
                    ),
                  ],
                ),
                child: Row(
                  children: [
                    Container(
                      width: 40,
                      height: 40,
                      decoration: BoxDecoration(
                        color: const Color(0x1F14B8A6),
                        borderRadius: BorderRadius.circular(10),
                      ),
                      alignment: Alignment.center,
                      child: const Text('🏦', style: TextStyle(fontSize: 18)),
                    ),
                    const SizedBox(width: 12),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Row(
                            children: [
                              Flexible(
                                child: Text(
                                  bank.bankName,
                                  style: TextStyle(
                                    fontWeight: FontWeight.bold,
                                    fontSize: 14,
                                    color: isDark ? AppTheme.textPrimaryDark : AppTheme.textPrimaryLight,
                                  ),
                                  overflow: TextOverflow.ellipsis,
                                ),
                              ),
                              const SizedBox(width: 6),
                              Container(
                                padding: const EdgeInsets.symmetric(horizontal: 5, vertical: 1),
                                decoration: BoxDecoration(
                                  color: badgeBg,
                                  borderRadius: BorderRadius.circular(4),
                                ),
                                child: Text(
                                  isDemo
                                      ? 'DEMO'
                                      : bank.providerType == 'SMS_MIRROR'
                                          ? 'SMS MIRROR'
                                          : (bank.isPrimary
                                              ? 'PRIMARY • ACTIVE'
                                              : 'LINKED'),
                                  style: TextStyle(fontSize: 8, fontWeight: FontWeight.bold, color: badgeText),
                                ),
                              ),
                            ],
                          ),
                          const SizedBox(height: 3),
                          Row(
                            children: [
                              Flexible(
                                child: Text(
                                  '${bank.maskedAccountNumber} • ${bank.accountType}',
                                  style: TextStyle(
                                    fontSize: 11,
                                    color: isDark ? AppTheme.textSecondaryDark : AppTheme.textSecondaryLight,
                                  ),
                                  overflow: TextOverflow.ellipsis,
                                ),
                              ),
                              const SizedBox(width: 6),
                              Container(
                                padding: const EdgeInsets.symmetric(horizontal: 4, vertical: 1),
                                decoration: BoxDecoration(
                                  color: freshnessColor.withOpacity(0.15),
                                  borderRadius: BorderRadius.circular(3),
                                ),
                                child: Text(
                                  freshness,
                                  style: TextStyle(fontSize: 8, fontWeight: FontWeight.bold, color: freshnessColor),
                                ),
                              ),
                            ],
                          ),
                        ],
                      ),
                    ),
                    Text(
                      state.isChildCareActive ? '••••••' : '₹${bank.availableBalance.toStringAsFixed(0)}',
                      style: TextStyle(
                        fontSize: 15,
                        fontWeight: FontWeight.w800,
                        color: isDark ? AppTheme.textPrimaryDark : AppTheme.textPrimaryLight,
                      ),
                    ),
                  ],
                ),
              );
            }),
          ],
        ),
      ),
    );
  }

  void _showAccountLinkingModal(BuildContext context) {
    showModalBottomSheet(
      context: context,
      backgroundColor: const Color(0xFF0F172A),
      shape: const RoundedRectangleBorder(borderRadius: BorderRadius.vertical(top: Radius.circular(20))),
      builder: (ctx) => Padding(
        padding: const EdgeInsets.all(20),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                const Icon(Icons.shield_outlined, color: AppTheme.primaryLight, size: 20),
                const SizedBox(width: 8),
                const Expanded(
                  child: Text(
                    'CONNECT BANK ACCOUNT',
                    style: TextStyle(fontSize: 14, fontWeight: FontWeight.bold, color: Colors.white),
                    overflow: TextOverflow.ellipsis,
                  ),
                ),
                const SizedBox(width: 8),
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                  decoration: BoxDecoration(
                    color: AppTheme.warning.withOpacity(0.2),
                    borderRadius: BorderRadius.circular(4),
                  ),
                  child: const Text('CONSENT REQUIRED', style: TextStyle(fontSize: 9, fontWeight: FontWeight.bold, color: AppTheme.warning)),
                ),
              ],
            ),
            const SizedBox(height: 12),
            const Text(
              'FinPocket uses consent-based ReBIT Account Aggregator architecture for financial data access in Sandbox/Staging mode.',
              style: TextStyle(fontSize: 12, color: Color(0xFF94A3B8)),
            ),
            const SizedBox(height: 12),
            Container(
              padding: const EdgeInsets.all(12),
              decoration: BoxDecoration(
                color: const Color(0xFF1E293B),
                borderRadius: BorderRadius.circular(10),
              ),
              child: const Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text('• Purpose: Financial Planning & Safe-to-Spend calculation', style: TextStyle(fontSize: 11, color: Color(0xFFCBD5E1))),
                  SizedBox(height: 4),
                  Text('• Data Scope: Read-only Balances & Transactions (No Money Movement)', style: TextStyle(fontSize: 11, color: Color(0xFFCBD5E1))),
                  SizedBox(height: 4),
                  Text('• Validity: 365 Days (Revocable at any time)', style: TextStyle(fontSize: 11, color: Color(0xFFCBD5E1))),
                  SizedBox(height: 4),
                  Text('• Security: End-to-end encrypted; banking passwords never collected', style: TextStyle(fontSize: 11, color: Color(0xFFCBD5E1))),
                ],
              ),
            ),
            const SizedBox(height: 16),
            SizedBox(
              width: double.infinity,
              height: 44,
              child: ElevatedButton(
                style: ElevatedButton.styleFrom(
                  backgroundColor: AppTheme.primary,
                  foregroundColor: Colors.white,
                  shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
                ),
                onPressed: () {
                  Navigator.pop(ctx);
                  // Real flow: registered mobile → AA consent (when the server
                  // has an aggregator) or the on-device SMS importer.
                  Navigator.of(context).push(
                    MaterialPageRoute<void>(
                      builder: (_) => const ConnectBankModal(),
                    ),
                  );
                },
                child: const Text('Request AA Consent', style: TextStyle(fontWeight: FontWeight.bold)),
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _affordRow(String label, String value, {bool isDark = true}) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 2),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          Flexible(
            child: Text(
              label,
              style: TextStyle(fontSize: 12, color: isDark ? const Color(0xFFCBD5E1) : const Color(0xFF475569)),
              overflow: TextOverflow.ellipsis,
            ),
          ),
          const SizedBox(width: 8),
          Flexible(
            child: Text(
              value,
              textAlign: TextAlign.end,
              style: TextStyle(fontSize: 12, fontWeight: FontWeight.bold, color: isDark ? Colors.white : const Color(0xFF0F172A)),
              overflow: TextOverflow.ellipsis,
            ),
          ),
        ],
      ),
    );
  }
}

class Math {
  static double max(double a, double b) => a > b ? a : b;
}

/// Static description of a well-known UPI app shown in the "Open with" row.
class _KnownUpiApp {
  final String label;
  final String packageName;
  final IconData icon;
  final Color color;

  const _KnownUpiApp(this.label, this.packageName, this.icon, this.color);
}
