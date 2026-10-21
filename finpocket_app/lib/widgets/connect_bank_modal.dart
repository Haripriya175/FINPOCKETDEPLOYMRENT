import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:url_launcher/url_launcher.dart';
import '../providers/app_state.dart';
import '../theme/app_theme.dart';
import '../services/api_service.dart';
import '../services/bank_sms_parser_service.dart';
import '../services/local_transaction_storage_service.dart';

/// "Connect Bank Account" flow — honest about what each path really is.
///
///  * AA path (bank on the Account Aggregator sandbox) → the bank-registered
///    mobile number is sent with the consent request and the bank's own
///    consent page opens in the browser. That is a real connection.
///  * SMS mirror (every other bank) → no credentials and no connection claim.
///    FinPocket first *verifies* that this phone really receives SMS from the
///    chosen bank (on-device sender-ID check), then mirrors those messages.
///    The wording never says "connected", because nothing is.
///
/// Nothing here ever invents balances: a freshly connected account always
/// starts at ₹0 until the bank reports real figures.
class ConnectBankModal extends StatefulWidget {
  const ConnectBankModal({super.key});

  @override
  State<ConnectBankModal> createState() => _ConnectBankModalState();
}

class _ConnectBankModalState extends State<ConnectBankModal> {
  // `code` = ReBIT FIP institutionCode (used only by the AA path; the Setu
  // sandbox understands exactly HDFC/SBIN/ICIC/UTIB). `sms` = sender-ID
  // fragments this bank's alerts actually arrive from, used to verify on this
  // device that the bank really messages this phone before we mirror anything.
  static const List<Map<String, dynamic>> _banks = [
    {'code': 'HDFC', 'label': 'HDFC Bank', 'emoji': '🏦', 'aa': true, 'sms': ['HDFCBK', 'HDFC']},
    {'code': 'SBIN', 'label': 'State Bank of India', 'emoji': '🏛️', 'aa': true, 'sms': ['SBIIN', 'SBIPSG', 'SBI']},
    {'code': 'ICIC', 'label': 'ICICI Bank', 'emoji': '🏢', 'aa': true, 'sms': ['ICICIB', 'ICICI']},
    {'code': 'UTIB', 'label': 'Axis Bank', 'emoji': '🏬', 'aa': true, 'sms': ['AXISBK', 'AXIS']},
    // Indian Bank is the most common PSU bank on this device's inbox
    // (sender IDs VM-/BV-/BT-/AX-INDBNK-S), so it sits at the top of the
    // SMS-mirror group rather than being buried.
    {'code': 'INDB', 'label': 'Indian Bank', 'emoji': '🏦', 'aa': false, 'sms': ['INDBNK', 'INDIAN BANK']},
    {'code': 'KKBK', 'label': 'Kotak Mahindra Bank', 'emoji': '🔰', 'aa': false, 'sms': ['KOTAKB', 'KOTAK']},
    {'code': 'PNBS', 'label': 'Punjab National Bank', 'emoji': '🏦', 'aa': false, 'sms': ['PNBSMS', 'PNB']},
    {'code': 'CNRB', 'label': 'Canara Bank', 'emoji': '🏛️', 'aa': false, 'sms': ['CANBNK', 'CANARA']},
    {'code': 'BARB', 'label': 'Bank of Baroda', 'emoji': '🏢', 'aa': false, 'sms': ['BOBMSG', 'BARB', 'BOB']},
    {'code': 'UBIN', 'label': 'Union Bank of India', 'emoji': '🏬', 'aa': false, 'sms': ['UBIN', 'UNIONBANK']},
    {'code': 'BKID', 'label': 'Bank of India', 'emoji': '🏦', 'aa': false, 'sms': ['BOIIND', 'BOI']},
    {'code': 'IDFB', 'label': 'IDFC First Bank', 'emoji': '💠', 'aa': false, 'sms': ['IDFCFB', 'IDFC']},
    {'code': 'YESB', 'label': 'Yes Bank', 'emoji': '🔶', 'aa': false, 'sms': ['YESBNK', 'YESBANK']},
    {'code': 'INDUS', 'label': 'IndusInd Bank', 'emoji': '🔷', 'aa': false, 'sms': ['INDUSB', 'INDUS']},
    {'code': 'FDRL', 'label': 'Federal Bank', 'emoji': '🟡', 'aa': false, 'sms': ['FEDBNK', 'FEDERAL']},
    {'code': 'IBKL', 'label': 'IDBI Bank', 'emoji': '🔷', 'aa': false, 'sms': ['IDBIIB', 'IDBI']},
    {'code': 'PAYT', 'label': 'Paytm Payments Bank', 'emoji': '📱', 'aa': false, 'sms': ['PAYTMB', 'PAYTM']},
    {
      'code': 'OTHER',
      'label': 'My bank isn\u2019t listed',
      'emoji': '🔎',
      'aa': false,
      'sms': <String>[],
    },
  ];

  final TextEditingController _mobileController = TextEditingController();
  String _bankCode = 'HDFC';
  bool _isConnecting = false;
  String? _error;
  String? _notice;

  Map<String, dynamic> get _selectedBank => _banks.firstWhere(
        (b) => b['code'] == _bankCode,
        orElse: () => _banks.first,
      );

  bool get _bankSupportsAa => _selectedBank['aa'] == true;

  @override
  void dispose() {
    _mobileController.dispose();
    super.dispose();
  }

  /// Connect using the entered mobile number:
  /// AA consent when the server has an aggregator, verified SMS mirror
  /// otherwise — with wording that never pretends a mirror is a connection.
  Future<void> _connect() async {
    final bank = _selectedBank;
    final mobile = _mobileController.text.trim();

    if (_bankSupportsAa && !RegExp(r'^[6-9]\d{9}$').hasMatch(mobile)) {
      setState(() => _error = 'Enter a valid 10-digit Indian mobile number.');
      return;
    }
    setState(() {
      _isConnecting = true;
      _error = null;
      _notice = null;
    });

    final aaEnabled = _bankSupportsAa && await ApiService.isAaEnabled();
    if (!mounted) return;

    if (aaEnabled) {
      try {
        final result = await ApiService.requestSetuConsent(
          _bankCode,
          mobileNumber: mobile,
        );
        final account = result['account'];
        final redirect = (account is Map ? account['redirectUrl'] : null) ??
            result['redirectUrl'];
        final redirectUrl = redirect?.toString() ?? '';
        if (redirectUrl.isEmpty) {
          throw Exception('The bank did not return a consent link.');
        }
        final launched = await launchUrl(
          Uri.parse(redirectUrl),
          mode: LaunchMode.externalApplication,
        );
        if (!mounted) return;
        if (launched) {
          final messenger = ScaffoldMessenger.of(context);
          Navigator.pop(context);
          messenger.showSnackBar(
            const SnackBar(
              content: Text(
                'Complete the consent in your bank page. '
                'Your account appears here once the bank approves it.',
              ),
              backgroundColor: Color(0xFF10B981),
            ),
          );
          return;
        }
        setState(() => _error = 'Could not open the consent page. Try again.');
      } catch (_) {
        // AA unavailable or failed → the verified on-device SMS mirror is
        // offered instead, clearly labelled as such.
        if (!mounted) return;
        setState(
          () => _notice =
              'Bank consent unavailable — offering the on-device SMS mirror instead.',
        );
        await _mirrorFromSms(bank);
        return;
      }
    } else {
      await _mirrorFromSms(bank);
      return;
    }

    if (mounted) setState(() => _isConnecting = false);
  }

  /// On-device SMS mirror, **verified before any claim is made**:
  ///  1. READ_SMS permission is requested (nothing is read without it).
  ///  2. The inbox is checked for SMS that really come from this bank's
  ///     sender IDs — if there are none, we say so instead of pretending.
  ///  3. Only then are transactions imported, and the result is described as
  ///     a mirror of this phone's messages, never as a connected account.
  Future<void> _mirrorFromSms(Map<String, dynamic> bank) async {
    final label = bank['label'] as String;
    final senderKeys =
        (bank['sms'] as List<dynamic>?)?.map((e) => e.toString()).toList() ??
            const <String>[];
    final isOther = bank['code'] == 'OTHER';

    var permitted = await BankSmsParserService.hasSmsPermission();
    if (!permitted) {
      permitted = await BankSmsParserService.requestSmsPermission();
    }
    if (!mounted) return;
    if (!permitted) {
      setState(() {
        _isConnecting = false;
        _error =
            'SMS access is required to read your bank\u2019s messages. '
            'FinPocket reads them only on this phone — grant the permission to continue.';
      });
      return;
    }

    setState(() => _notice = 'Checking this phone for messages from $label\u2026');
    final evidence = await BankSmsParserService.countSmsForBank(label, senderKeys);
    if (!mounted) return;

    if (evidence == 0) {
      setState(() {
        _isConnecting = false;
        _notice = null;
        _error = isOther
            ? 'No bank transaction messages were found on this phone, so there '
                'is nothing to mirror yet. They will import automatically the '
                'moment one arrives.'
            : 'No messages from $label were found on this phone, so FinPocket '
                'cannot honestly mirror that account. If you use $label, its '
                'messages will appear here after your next transaction.';
      });
      return;
    }

    final state = Provider.of<AppState>(context, listen: false);
    // Pressing "Verify & mirror from SMS" after reading what the flow does is
    // the opt-in moment — record it so the automatic (no-button) sync that
    // follows is consented, not silent-surprise.
    await LocalTransactionStorageService.setVaultConsent(true);
    await LocalTransactionStorageService.setSmsSyncConsent(true);
    final imported = await state.syncBankSmsTransactions(
      forceRequestPermission: true,
    );
    if (!mounted) return;
    setState(() => _isConnecting = false);

    if (imported > 0) {
      final messenger = ScaffoldMessenger.of(context);
      Navigator.pop(context);
      messenger.showSnackBar(
        SnackBar(
          content: Text(
            isOther
                ? 'Verified $evidence bank messages on this phone · '
                    '$imported transactions mirrored from bank SMS.'
                : 'Verified $evidence messages from $label on this phone · '
                    '$imported transactions mirrored from bank SMS. '
                    'This is an on-device mirror, not a bank connection — '
                    'your money stays in your bank.',
          ),
          backgroundColor: const Color(0xFF10B981),
          duration: const Duration(seconds: 6),
        ),
      );
    } else {
      setState(() {
        _notice =
            'Found $evidence message${evidence == 1 ? '' : 's'}'
            '${isOther ? ' from your bank' : ' from $label'} on this phone, but '
            'none contained a transaction yet. New ones are imported '
            'automatically, no button needed.';
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final cardColor = isDark ? AppTheme.bgCardDark : AppTheme.bgCardLight;
    final borderColor = isDark ? AppTheme.borderDark : AppTheme.borderLight;
    final mutedText =
        isDark ? AppTheme.textSecondaryDark : AppTheme.textSecondaryLight;

    return Scaffold(
      appBar: AppBar(
        title: const Text('Connect Bank Account'),
        backgroundColor: cardColor,
        foregroundColor: AppTheme.primary,
        actions: [
          IconButton(
            icon: const Icon(Icons.close),
            tooltip: 'Close',
            onPressed: () => Navigator.pop(context),
          ),
        ],
      ),
      body: SingleChildScrollView(
        padding: const EdgeInsets.all(24),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            const SizedBox(height: 8),
            const Icon(Icons.account_tree, size: 64, color: AppTheme.primary),
            const SizedBox(height: 16),
            const Text(
              'Connect your bank account',
              style: TextStyle(
                fontSize: 22,
                fontWeight: FontWeight.bold,
                color: AppTheme.primary,
              ),
              textAlign: TextAlign.center,
            ),
            const SizedBox(height: 8),
            Text(
              'Two honest ways to bring in real data: bank consent (Account '
              'Aggregator) for a genuine connection, or a verified on-device '
              'mirror of the bank SMS this phone already receives. FinPocket '
              'never invents numbers — new accounts always start at ₹0.',
              style: TextStyle(fontSize: 13, color: mutedText, height: 1.4),
              textAlign: TextAlign.center,
            ),
            const SizedBox(height: 24),
            Container(
              padding: const EdgeInsets.all(16),
              decoration: BoxDecoration(
                color: cardColor,
                borderRadius: BorderRadius.circular(16),
                border: Border.all(color: borderColor),
              ),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  const Text(
                    'Your bank',
                    style: TextStyle(fontWeight: FontWeight.w600, fontSize: 14),
                  ),
                  const SizedBox(height: 6),
                  DropdownButtonFormField<String>(
                    initialValue: _bankCode,
                    style: TextStyle(
                      fontSize: 14,
                      color: isDark ? Colors.white : Colors.black,
                    ),
                    // DropdownButtonFormField defaults isDense to true, which
                    // clamps the row to _denseButtonHeight (24px). Our two-line
                    // item measures ~28px, so it overflowed by exactly 4px.
                    isDense: false,
                    dropdownColor: cardColor,
                    decoration: InputDecoration(
                      isDense: true,
                      contentPadding: const EdgeInsets.symmetric(horizontal: 12, vertical: 14),
                      border: OutlineInputBorder(
                        borderRadius: BorderRadius.circular(10),
                      ),
                      enabledBorder: OutlineInputBorder(
                        borderRadius: BorderRadius.circular(10),
                        borderSide: BorderSide(color: borderColor),
                      ),
                    ),
                    items: [
                      for (final bank in _banks)
                        DropdownMenuItem(
                          value: bank['code'] as String,
                          child: Column(
                            mainAxisAlignment: MainAxisAlignment.center,
                            crossAxisAlignment: CrossAxisAlignment.start,
                            mainAxisSize: MainAxisSize.min,
                            children: [
                              Text(
                                '${bank['emoji']} ${bank['label']}',
                                style: const TextStyle(fontSize: 14),
                              ),
                              Text(
                                bank['aa'] == true
                                    ? 'Bank consent (real connection)'
                                    : 'Mirrored from this phone\u2019s SMS',
                                style: TextStyle(
                                  fontSize: 10,
                                  color: bank['aa'] == true
                                      ? const Color(0xFF10B981)
                                      : mutedText,
                                ),
                              ),
                            ],
                          ),
                        ),
                    ],
                    onChanged: (value) {
                      setState(() {
                        _bankCode = value ?? 'HDFC';
                        _error = null;
                        _notice = null;
                      });
                    },
                  ),
                  if (_bankSupportsAa) ...[
                    const SizedBox(height: 16),
                    const Text(
                      'Bank-registered mobile number',
                      style: TextStyle(fontWeight: FontWeight.w600, fontSize: 14),
                    ),
                    const SizedBox(height: 6),
                    TextField(
                      controller: _mobileController,
                      autocorrect: false,
                      keyboardType: TextInputType.phone,
                      textInputAction: TextInputAction.done,
                      maxLength: 10,
                      decoration: InputDecoration(
                        counterText: '',
                        hintText: '9876543210',
                        hintStyle: TextStyle(color: mutedText),
                        border: OutlineInputBorder(
                          borderRadius: BorderRadius.circular(10),
                        ),
                        enabledBorder: OutlineInputBorder(
                          borderRadius: BorderRadius.circular(10),
                          borderSide: BorderSide(color: borderColor),
                        ),
                      ),
                      onSubmitted: (_) => _connect(),
                    ),
                  ] else ...[
                    const SizedBox(height: 16),
                    Container(
                      padding: const EdgeInsets.all(12),
                      decoration: BoxDecoration(
                        color: Colors.amber.withValues(alpha: 0.08),
                        borderRadius: BorderRadius.circular(10),
                        border: Border.all(color: Colors.amber.withValues(alpha: 0.4)),
                      ),
                      child: Text(
                        _bankCode == 'OTHER'
                            ? 'FinPocket will check this phone for any bank '
                                'transaction messages and mirror them on-device. '
                                'No credentials, no account connection.'
                            : '${_selectedBank['label']} is not on FinPocket\u2019s '
                                'Account Aggregator, so there is no bank connection '
                                'to make. FinPocket verifies this phone really '
                                'receives ${_selectedBank['label']} messages, then '
                                'mirrors them on-device. No mobile number needed.',
                        style: TextStyle(fontSize: 11, color: mutedText, height: 1.4),
                      ),
                    ),
                  ],
                  if (_error != null) ...[
                    const SizedBox(height: 8),
                    Text(
                      _error!,
                      style: const TextStyle(
                        color: AppTheme.danger,
                        fontSize: 11,
                      ),
                    ),
                  ],
                  if (_notice != null) ...[
                    const SizedBox(height: 8),
                    Text(
                      _notice!,
                      style: TextStyle(fontSize: 11, color: mutedText),
                    ),
                  ],
                ],
              ),
            ),
            const SizedBox(height: 24),
            _isConnecting
                ? const Center(child: CircularProgressIndicator())
                : ElevatedButton(
                    onPressed: _connect,
                    style: ElevatedButton.styleFrom(
                      backgroundColor: AppTheme.primary,
                      foregroundColor: Colors.white,
                      padding: const EdgeInsets.symmetric(vertical: 14),
                      shape: RoundedRectangleBorder(
                        borderRadius: BorderRadius.circular(12),
                      ),
                    ),
                    child: Text(
                      _bankSupportsAa
                          ? 'Connect Bank Account'
                          : 'Verify & mirror from SMS',
                    ),
                  ),
            const SizedBox(height: 8),
            TextButton(
              onPressed: _isConnecting
                  ? null
                  : () => Navigator.pop(context),
              child: const Text('Skip — I’ll do this later'),
            ),
          ],
        ),
      ),
    );
  }
}
