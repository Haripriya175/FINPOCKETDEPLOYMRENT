import 'dart:io' show Platform;
import 'package:flutter/foundation.dart';
import 'package:flutter/services.dart';
import '../models/models.dart';

/// Result of parsing an SMS transaction
class ParsedBankSms {
  final Transaction transaction;
  final String bankName;
  final String? maskedAccount;
  final double? availableBalanceAfter;
  final String rawBody;

  ParsedBankSms({
    required this.transaction,
    required this.bankName,
    this.maskedAccount,
    this.availableBalanceAfter,
    required this.rawBody,
  });
}

/// Service that securely reads and parses real bank SMS on the user's Android device.
/// All processing happens 100% on-device without cloud transmission.
class BankSmsParserService {
  static const MethodChannel _channel = MethodChannel('com.finpocket/bank_sms');

  /// Cached device contacts map: normalized 10-digit phone number -> Display Name
  static Map<String, String> contactsMap = {};

  /// Check whether the Android app has READ_SMS permission
  static Future<bool> hasSmsPermission() async {
    if (kIsWeb || !Platform.isAndroid) return false;
    try {
      final res = await _channel.invokeMethod<bool>('hasSmsPermission');
      return res ?? false;
    } catch (_) {
      return false;
    }
  }

  /// Request runtime Android READ_SMS permission from the operating system
  static Future<bool> requestSmsPermission() async {
    if (kIsWeb || !Platform.isAndroid) return false;
    try {
      final res = await _channel.invokeMethod<bool>('requestSmsPermission');
      return res ?? false;
    } catch (_) {
      return false;
    }
  }

  /// Check whether the Android app has READ_CONTACTS permission
  static Future<bool> hasContactsPermission() async {
    if (kIsWeb || !Platform.isAndroid) return false;
    try {
      final res = await _channel.invokeMethod<bool>('hasContactsPermission');
      return res ?? false;
    } catch (_) {
      return false;
    }
  }

  /// Request runtime Android READ_CONTACTS permission
  static Future<bool> requestContactsPermission() async {
    if (kIsWeb || !Platform.isAndroid) return false;
    try {
      final res = await _channel.invokeMethod<bool>('requestContactsPermission');
      return res ?? false;
    } catch (_) {
      return false;
    }
  }

  /// Syncs phone contacts map (10-digit number -> Display Name)
  static Future<Map<String, String>> fetchContactsMap() async {
    if (kIsWeb || !Platform.isAndroid) return contactsMap;
    try {
      final hasPerm = await hasContactsPermission();
      if (!hasPerm) {
        await requestContactsPermission();
      }
      final raw = await _channel.invokeMethod<dynamic>('getContactsMap');
      if (raw is Map) {
        final out = <String, String>{};
        raw.forEach((k, v) {
          if (k != null && v != null) {
            final key = k.toString().trim();
            final val = v.toString().trim();
            if (key.isNotEmpty && val.isNotEmpty) {
              out[key] = val;
            }
          }
        });
        contactsMap = out;
      }
    } catch (e) {
      debugPrint('[BankSmsParser] Error loading contacts map: $e');
    }
    return contactsMap;
  }

  /// Raw inbox read (address / body / date) — shared by the parser and the
  /// on-device "does this bank actually message this phone?" verification.
  static Future<List<Map<String, String>>> fetchRawSms({int limit = 150}) async {
    if (kIsWeb || !Platform.isAndroid) return [];

    try {
      final rawMessages = await _channel.invokeMethod<List<dynamic>>(
        'readBankSms',
        {'limit': limit},
      );
      if (rawMessages == null || rawMessages.isEmpty) return [];

      final out = <Map<String, String>>[];
      for (final raw in rawMessages) {
        if (raw is Map) {
          out.add({
            'address': (raw['address'] ?? '').toString(),
            'body': (raw['body'] ?? '').toString(),
            'date': (raw['date'] as num?)?.toInt().toString() ?? '',
          });
        }
      }
      return out;
    } catch (e) {
      debugPrint('[BankSmsParser] Error reading raw SMS: $e');
      return [];
    }
  }

  /// Read SMS from Android inbox and parse bank transactions
  static Future<List<ParsedBankSms>> fetchAndParseBankSms({int limit = 150}) async {
    await fetchContactsMap();
    final rawAll = await fetchRawSms(limit: limit);
    if (rawAll.isEmpty) return [];

    final parsedList = <ParsedBankSms>[];
    for (final raw in rawAll) {
      final dateEpoch = int.tryParse(raw['date'] ?? '');
      final timestamp = dateEpoch != null && dateEpoch > 0
          ? DateTime.fromMillisecondsSinceEpoch(dateEpoch)
          : DateTime.now();

      final parsed = parseSms(
        address: raw['address'] ?? '',
        body: raw['body'] ?? '',
        timestamp: timestamp,
      );
      if (parsed != null) parsedList.add(parsed);
    }
    return parsedList;
  }

  /// Verification used by the Connect Bank flow: how many messages on *this
  /// device* plausibly come from [bankLabel]?
  ///
  /// Matched by the bank's sender-ID prefixes (e.g. `HDFCBK`) and/or the bank
  /// name appearing in the message body. An empty [senderKeys] means "any
  /// bank SMS" (the 'Other bank' option) — counted via parseable transactions.
  /// This is real on-device evidence, never a claim of account ownership.
  static Future<int> countSmsForBank(String bankLabel, List<String> senderKeys) async {
    if (kIsWeb || !Platform.isAndroid) return 0;

    if (senderKeys.isEmpty) {
      final parsed = await fetchAndParseBankSms(limit: 300);
      return parsed.length;
    }

    final msgs = await fetchRawSms(limit: 300);
    final labelUpper = bankLabel.toUpperCase();
    final keysUpper = senderKeys.map((k) => k.toUpperCase()).toList();
    var count = 0;
    for (final m in msgs) {
      final addr = (m['address'] ?? '').toUpperCase();
      final bodyU = (m['body'] ?? '').toUpperCase();
      final bySender = keysUpper.any((k) => k.isNotEmpty && addr.contains(k));
      final byBody = bodyU.contains(labelUpper);
      if (bySender || byBody) count++;
    }
    return count;
  }

  /// Starts listening for newly arriving SMS (native content observer) and
  /// invokes [onSmsChanged] — this is what makes sync automatic the moment a
  /// transaction happens, without the user pressing "Sync SMS".
  static void Function()? _onSmsEvent;
  static bool _handlerInstalled = false;

  static Future<void> watchIncomingSms(void Function() onSmsChanged) async {
    if (kIsWeb || !Platform.isAndroid) return;
    _onSmsEvent = onSmsChanged;
    if (!_handlerInstalled) {
      _handlerInstalled = true;
      _channel.setMethodCallHandler((call) async {
        if (call.method == 'onSmsChanged') {
          _onSmsEvent?.call();
        }
        return null;
      });
    }
    try {
      await _channel.invokeMethod<bool>('startSmsObserver');
    } catch (e) {
      debugPrint('[BankSmsParser] Could not start SMS observer: $e');
    }
  }

  /// Registry of official Indian bank DLT headers and their standard names.
  /// Mandated by TRAI: official bank transactional alerts MUST arrive with one of
  /// these registered entity headers (e.g. INDBNK for Indian Bank, HDFCBK for HDFC).
  static const Map<String, String> _officialBankSenderMap = {
    // Indian Bank
    'INDBNK': 'Indian Bank',
    'ALBK': 'Indian Bank',
    // State Bank of India
    'SBINB': 'State Bank of India',
    'SBIINB': 'State Bank of India',
    'SBICRD': 'State Bank of India',
    'SBIPSG': 'State Bank of India',
    'SBMSMS': 'State Bank of India',
    'SBTRD': 'State Bank of India',
    'SBIUPI': 'State Bank of India',
    'SBISMS': 'State Bank of India',
    'SBIRTL': 'State Bank of India',
    // HDFC Bank
    'HDFCBK': 'HDFC Bank',
    'HDFCBN': 'HDFC Bank',
    'HDFCCC': 'HDFC Bank',
    'HDFCLD': 'HDFC Bank',
    'HDFCAM': 'HDFC Bank',
    // ICICI Bank
    'ICICIB': 'ICICI Bank',
    'ICICIT': 'ICICI Bank',
    'ICICIC': 'ICICI Bank',
    'ICICIS': 'ICICI Bank',
    'ICICIN': 'ICICI Bank',
    'ICICIP': 'ICICI Bank',
    // Axis Bank
    'AXISBK': 'Axis Bank',
    'AXISBC': 'Axis Bank',
    'AXISIN': 'Axis Bank',
    'AXISMB': 'Axis Bank',
    'AXISCC': 'Axis Bank',
    // Kotak Mahindra Bank
    'KOTAKB': 'Kotak Mahindra',
    'KMBANK': 'Kotak Mahindra',
    'KOTAKC': 'Kotak Mahindra',
    'KOTAK': 'Kotak Mahindra',
    // Punjab National Bank
    'PNBSMS': 'Punjab National Bank',
    'PNBBNK': 'Punjab National Bank',
    // Canara Bank
    'CANBNK': 'Canara Bank',
    'CNRBMS': 'Canara Bank',
    // Bank of Baroda
    'BOBMSG': 'Bank of Baroda',
    'BOBTXN': 'Bank of Baroda',
    'BARBOD': 'Bank of Baroda',
    'BOBBNK': 'Bank of Baroda',
    // Bank of India
    'BOIIND': 'Bank of India',
    'BOISMS': 'Bank of India',
    'BOIBNK': 'Bank of India',
    // Union Bank of India
    'UBISMS': 'Union Bank of India',
    'UNIONB': 'Union Bank of India',
    'UBIN': 'Union Bank of India',
    // IDFC FIRST Bank
    'IDFCFB': 'IDFC First Bank',
    'IDFCBK': 'IDFC First Bank',
    'IDFCBN': 'IDFC First Bank',
    // Yes Bank
    'YESBNK': 'Yes Bank',
    'YESB': 'Yes Bank',
    // IndusInd Bank
    'INDUSB': 'IndusInd Bank',
    // Federal Bank
    'FEDBNK': 'Federal Bank',
    'FEDSEC': 'Federal Bank',
    // IDBI Bank
    'IDBIIB': 'IDBI Bank',
    'IDBIBK': 'IDBI Bank',
    'IDBIMS': 'IDBI Bank',
    // Central Bank of India
    'CBISMS': 'Central Bank of India',
    'CENTBK': 'Central Bank of India',
    // UCO Bank
    'UCOBNK': 'UCO Bank',
    'UCOSMS': 'UCO Bank',
    // Bank of Maharashtra
    'MAHABK': 'Bank of Maharashtra',
    'BOMBNK': 'Bank of Maharashtra',
    // Indian Overseas Bank
    'IOBCHN': 'Indian Overseas Bank',
    'IOBBNK': 'Indian Overseas Bank',
    // Punjab & Sind Bank
    'PSBBNK': 'Punjab & Sind Bank',
    'PSBSMS': 'Punjab & Sind Bank',
    // RBL Bank
    'RBLBNK': 'RBL Bank',
    'RATNAK': 'RBL Bank',
    // Karur Vysya Bank
    'KVBBANK': 'Karur Vysya Bank',
    'KVBSMS': 'Karur Vysya Bank',
    // South Indian Bank
    'SIBLTD': 'South Indian Bank',
    'SIBBNK': 'South Indian Bank',
    // City Union Bank
    'CUBBNK': 'City Union Bank',
    // Jammu & Kashmir Bank
    'JKBANK': 'Jammu & Kashmir Bank',
    // AU Small Finance Bank
    'AUBANK': 'AU Small Finance Bank',
    // Equitas Small Finance Bank
    'EQITAS': 'Equitas Small Finance Bank',
    // Ujjivan Small Finance Bank
    'UJJIVN': 'Ujjivan Small Finance Bank',
    // Bandhan Bank
    'BNDHAN': 'Bandhan Bank',
    'BNDHN': 'Bandhan Bank',
    // Standard Chartered
    'SCISMS': 'Standard Chartered',
    'SCBLTD': 'Standard Chartered',
    // Citibank
    'CITIBK': 'Citibank',
    // HSBC
    'HSBCIN': 'HSBC',
    'HSBCBK': 'HSBC',
    // DBS Bank
    'DBSBNK': 'DBS Bank',
    'DIGIBK': 'DBS Bank',
    // India Post Payments Bank
    'IPPBMS': 'India Post Payments Bank',
    'IPPB': 'India Post Payments Bank',
    // Paytm Payments Bank
    'PAYTMB': 'Paytm Payments Bank',
    // Airtel Payments Bank
    'AIRBNK': 'Airtel Payments Bank',
    'AIRPAY': 'Airtel Payments Bank',
    // Jupiter / Fi / Federal
    'JUPITR': 'Federal Bank (Jupiter)',
    'FIBANK': 'Federal Bank (Fi)',
  };

  /// Pure Dart SMS parser with regex engine strictly for official bank SMS.
  /// Rejects all promotional ads, loan offers, and non-bank messages.
  static ParsedBankSms? parseSms({
    required String address,
    required String body,
    DateTime? timestamp,
  }) {
    if (body.isEmpty) return null;
    final addrUpper = address.toUpperCase().trim();
    final lower = body.toLowerCase();

    // 1. Strict DLT Promotional filter:
    // In India TRAI regulations, promotional SMS senders end in "-P" (e.g. JM-MEESHO-P).
    // These are strictly marketing messages and NEVER legitimate bank debit/credit alerts.
    if (addrUpper.endsWith('-P') || addrUpper.contains('-P-')) {
      return null;
    }

    // 2. Reject personal phone numbers (+91..., 10 digits).
    // Legitimate bank transactional alerts never come from standard mobile numbers.
    final cleanAddr = addrUpper.replaceAll(RegExp(r'[-\s+]'), '');
    if (RegExp(r'^\d{8,15}$').hasMatch(cleanAddr)) {
      return null;
    }

    // 3. Reject known non-bank commercial / marketing / e-commerce senders
    const blockedSenders = [
      'MEESHO', 'FLPKRT', 'FLIPKT', 'AMAZON', 'AMZON', 'SWIGGY', 'ZOMATO',
      'MYNTRA', 'ZUDIO', 'AJIO', 'TATACLIQ', 'NYKAA', 'BIGBSK', 'BLINKIT',
      'ZEPTO', 'DOMINO', 'PIZZAH', 'KFC', 'MCDON', 'UBER', 'OLA', 'RAPIDO',
      'CRED', 'SLICE', 'DHANI', 'KREDIT', 'MONEY', 'LOAN', 'RUPEE', 'POLICY',
      'BAJAJ', 'FIBE', 'NAVI', 'POKET', 'LENDING', 'CASHE', 'FINC', 'CASH'
    ];
    for (final sender in blockedSenders) {
      if (addrUpper.contains(sender)) {
        return null;
      }
    }

    // 4. Reject promotional, marketing, and loan spam phrasing
    if (RegExp(
      r'\b(personal\s*loan|instant\s*loan|loan\s*offer|get\s*a\s*loan|avail\s*loan|pre-?approved|check\s*your\s*offer|apply\s*now|apply\s*today|congratulations|congrats|special\s*offer|limited\s*period|promo\s*code|discount|coupon|cashback\s*offer|claim\s*now|free\s*gift|upgrade\s*your\s*card)\b',
      caseSensitive: false,
    ).hasMatch(body)) {
      return null;
    }

    // 5. Reject URL shorteners and advertising links
    if (RegExp(
      r'(?:https?:\/\/)?(?:bit\.ly|ltl\.sh|tinyurl\.com|is\.gd|t\.co|goo\.gl|cutt\.ly|rb\.gy|shorturl\.at|meesho\.com|wa\.me|\.sh\/)',
      caseSensitive: false,
    ).hasMatch(body)) {
      return null;
    }

    // 6. Strict Official Bank Verification:
    // MUST match a registered official bank sender code or verified bank sign-off.
    final bankName = _detectOfficialBank(address, body);
    if (bankName == null) {
      return null; // Reject: not from an official registered bank
    }

    // 7. Transactional keyword filter:
    // Indian Bank uses "Sent Rs.X from A/c...". Other banks use "debited", "spent", "paid", etc.
    final isDebit = RegExp(
      r'\b(debited|spent|paid|withdrawn|transferred to|purchase of|sent\s+(?:rs\.?|inr|₹))\b',
      caseSensitive: false,
    ).hasMatch(body);
    final isCredit = RegExp(
      r'\b(credited|received|deposited|refunded|added to)\b',
      caseSensitive: false,
    ).hasMatch(body);

    if (!isDebit && !isCredit) {
      return null; // Not a debit/credit transactional SMS
    }

    // 8. Extract Amount
    double? amount;
    final amtMatch1 = RegExp(r'(?:Rs\.?|INR|₹)\s*([\d,]+(?:\.\d{1,2})?)', caseSensitive: false).firstMatch(body);
    final amtMatch2 = RegExp(r'([\d,]+(?:\.\d{1,2})?)\s*(?:debited|credited|spent|withdrawn)', caseSensitive: false).firstMatch(body);

    final match = amtMatch1 ?? amtMatch2;
    if (match != null) {
      final clean = match.group(1)?.replaceAll(',', '').trim();
      if (clean != null) {
        amount = double.tryParse(clean);
      }
    }

    if (amount == null || amount <= 0) {
      return null; // Could not parse valid amount
    }

    // 9. Extract Account / Card number
    String? maskedAccount;
    final accMatch = RegExp(
      r'(?:A/c|Acct|Acc|card|a/c no\.?|account)\s*(?:no\.?\s*)?(?:ending\s*)?(?:with\s*)?(?:[xX*]*(\d{3,4}))',
      caseSensitive: false,
    ).firstMatch(body);
    if (accMatch != null) {
      maskedAccount = '•••• ${accMatch.group(1)}';
    }

    // 10. Extract Reference / UTR / Txn ID / RRN
    String referenceId = '';
    final refMatch = RegExp(
      r'(?:ref\s*no\.?|ref\s*num(?:ber)?|utr\s*no\.?|txn\s*(?:id|no\.?)|upi\s*ref|rrn|ref|utr|txn)\s*(?:is|:|-)?\s*([A-Za-z0-9]+)',
      caseSensitive: false,
    ).firstMatch(body);
    if (refMatch != null) {
      final candidate = refMatch.group(1) ?? '';
      if (candidate.toLowerCase() != 'no' && candidate.toLowerCase() != 'is') {
        referenceId = candidate;
      }
    }

    // 11. Extract Available Balance after transaction
    double? avlBal;
    final balMatch = RegExp(
      r'(?:avl|avail|available)\s*(?:bal|balance|limit)?\s*(?:is|:)?\s*(?:Rs\.?|INR|₹)\s*([\d,]+(?:\.\d{1,2})?)',
      caseSensitive: false,
    ).firstMatch(body);
    if (balMatch != null) {
      final balStr = balMatch.group(1)?.replaceAll(',', '').trim();
      if (balStr != null) {
        avlBal = double.tryParse(balStr);
      }
    }

    // 12. Security guard: A genuine bank transaction alert MUST contain at least
    // one of: an account mask, a transaction reference / RRN, or an available balance.
    if (maskedAccount == null && referenceId.isEmpty && avlBal == null) {
      return null;
    }

    final ts = timestamp ?? DateTime.now();
    if (referenceId.isEmpty) {
      referenceId = 'SMS_${ts.millisecondsSinceEpoch}_${amount.toInt()}';
    }

    // 13. Extract counterparty
    String receiver = 'Merchant';
    if (isCredit) {
      receiver = _extractCreditSender(body) ?? 'Bank Deposit / Transfer';
    } else {
      // Termination is the hard part: real SMS read "...to Impact Guru
      // Technology Venture.RRN 628168613199.Avl Bal Rs.151.00." — the name is
      // followed by '.' with NO space, so the old `\s+keyword` lookahead ran
      // past the payee, blew the 40-char cap and fell back to "Merchant".
      // Punctuation, whitespace-keywords and end-of-string now all end it.
      final recMatch = RegExp(
        r'\b(?:at|to|vpa|towards|info)\s+(?:is\s+)?([A-Za-z0-9][A-Za-z0-9\s\.\-_@&]{1,39}?)(?=\s*(?:on|ref|utr|rrn|upi|avl|avail|bal|not|at|by|from|for)\b|\s*[.,]|$)',
        caseSensitive: false,
      ).firstMatch(body);

      if (recMatch != null) {
        final candidate = recMatch.group(1)?.trim();
        if (candidate != null && _isValidPartyName(candidate)) {
          receiver = candidate;
        }
      }
    }

    // 8. Determine Category
    final category = _determineCategory(receiver, lower);

    // 9. Build Transaction object
    final type = isCredit ? TransactionType.INCOME : TransactionType.EXPENSE;
    final txn = Transaction(
      id: 'tx_sms_${referenceId.replaceAll(RegExp(r'[^a-zA-Z0-9_]'), '')}',
      userId: 'usr_local',
      sender: isCredit ? receiver : 'Me ($bankName)',
      receiver: isCredit ? 'Me ($bankName)' : receiver,
      amount: amount,
      type: type,
      category: category,
      status: TransactionStatus.SUCCESSFUL,
      timestamp: ts,
      referenceId: referenceId,
      description: '$bankName ${maskedAccount ?? 'A/c'} ${type == TransactionType.INCOME ? 'Credit' : 'Debit'}: $receiver',
      paymentMethod: body.contains('UPI') || body.contains('VPA') ? 'UPI' : 'Bank Transfer',
      merchant: receiver,
    );

    return ParsedBankSms(
      transaction: txn,
      bankName: bankName,
      maskedAccount: maskedAccount,
      availableBalanceAfter: avlBal,
      rawBody: body,
    );
  }

  /// Extracts WHO sent money in a credit SMS. Indian bank wording varies
  /// ("from X via UPI", "by X on date", "IMPS/P2A/ref/NAME/NPCI"), so every
  /// pattern is tried and each candidate is validated — amounts, dates and
  /// boilerplate ("Avail Bal is Rs 82,410") are rejected, never shown as a
  /// person. Returns null when the SMS genuinely doesn't name a sender.
  static String? _extractCreditSender(String body) {
    const cand = r'([A-Za-z][A-Za-z0-9 .&\-_@]{1,40}?)';
    // NOTE: Dart raw strings do not interpolate, so these patterns are built
    // with normal strings (escaped backslashes) to actually inject `$cand`.
    final patterns = <RegExp>[
      // "by a/c linked to mobile 9XXXXXX43210" / "from mobile 9XXXXXX43210"
      RegExp(
        r'\b(?:by|from)\s+(?:a/c\s+linked\s+to\s+)?(mobile\s+[A-Za-z0-9X*]+)',
        caseSensitive: false,
      ),
      // "from Rahul Sharma via UPI" / "from ramesh@okhdfc on ..."
      RegExp(
          '\\bfrom\\s+(?!(?:rs\\.?|inr|₹|\\d|account|a/c|your\\s+bank)\\b)$cand(?=\\s+(?:via|through|upi|imps|neft|rtgs|on|ref|for|towards)\\b|[,.]|\$)',
          caseSensitive: false),
      // "by Salary payroll." / "credited by ACME Corp via"
      RegExp(
          '\\b(?:by|credited\\s+by|deposited\\s+by)\\s+(?!(?:rs\\.?|inr|₹|\\d|account|a/c)\\b)$cand(?=\\s+(?:via|through|upi|imps|neft|rtgs|on|ref|for)\\b|[,.]|\$)',
          caseSensitive: false),
      // "IMPS/P2A/123456789012/RAMESH KUMAR/NPCI" (also NEFT/RTGS variants)
      RegExp('\\b(?:IMPS|NEFT|RTGS)(?:/[A-Z0-9]+){2}/$cand/', caseSensitive: false),
      // "received Rs.500 from NAME on ..." / "transfer ... by NAME via ..."
      RegExp(
          '\\b(?:received|transfer(?:red)?|sent)\\s+(?:\\S+\\s+){0,3}?(?:from|by)\\s+(?!(?:rs\\.?|inr|₹|\\d|account|a/c)\\b)$cand(?=\\s+(?:via|through|upi|on|ref)\\b|[,.]|\$)',
          caseSensitive: false),
    ];

    for (final re in patterns) {
      for (final m in re.allMatches(body)) {
        final raw = m.group(1)?.trim();
        if (raw == null) continue;
        if (_isValidPartyName(raw)) return raw;
      }
    }
    return null;
  }

  /// Rejects amount/date/boilerplate strings so a row never claims the
  /// counterparty is "Rs 55,000" or "Avail Bal".
  static bool _isValidPartyName(String name) {
    final t = name.trim();
    if (t.length < 2 || t.length > 40) return false;
    if (!RegExp(r'[A-Za-z]').hasMatch(t)) return false;
    // Allow masked or explicit mobile strings (e.g. "mobile 9XXXXXX43210")
    if (t.toLowerCase().startsWith('mobile ')) return true;
    // Currency / numeric / date-shaped values are not people.
    if (RegExp(r'^(?:rs\.?|inr|₹)(?:\s|\d|$)', caseSensitive: false).hasMatch(t)) return false;
    // UPI VPAs formatted with phone number + handle (e.g. 7382224476ptyes, 9876543210apl)
    if (RegExp(r'^\d{10}[a-zA-Z0-9.\-_]*$').hasMatch(t)) return true;
    // Digit-leading strings are amounts, not people — except a UPI VPA
    // (9876543210@okaxis), which is a perfectly valid counterparty.
    if (RegExp(r'^\d').hasMatch(t) && !t.contains('@')) return false;
    if (RegExp(r'\d{1,2}[-/]\d{1,2}[-/]\d{2,4}').hasMatch(t)) return false;
    const stop = {
      'the', 'a', 'an', 'on', 'at', 'to', 'from', 'by', 'via', 'for', 'is',
      'has', 'been', 'your', 'you', 'ac', 'a c', 'acct', 'account', 'card',
      'no', 'ref', 'utr', 'rrn', 'bal', 'avail', 'available', 'avl', 'credit',
      'debit', 'debited', 'credited', 'received', 'transaction', 'upi', 'imps',
      'neft', 'rtgs', 'thanks', 'team', 'towards', 'ending', 'with', 'in',
      'and', 'or', 'of', 'this', 'that', 'will', 'not', 'please', 'info',
      'rs', 'rs.', 'inr', 'inr.', 'amount', 'amt', 'payment', 'transfer',
      'your bank account', 'bank account', 'my bank account',
    };
    if (stop.contains(t.toLowerCase())) return false;
    if (t.toLowerCase() == 'your bank account' || t.toLowerCase() == 'bank account') return false;
    // Must not be a sentence fragment from an unrelated clause.
    if (t.toLowerCase().contains(' avail ') || t.toLowerCase().contains(' bal ') || t.toLowerCase().contains(' a/c ')) return false;
    return true;
  }

  /// Detects the official bank entity from DLT sender header and verified bank sign-offs.
  /// Returns null if the sender or message does not belong to a recognized official bank.
  /// NEVER falls back to generic 'Bank Account'.
  static String? _detectOfficialBank(String address, String body) {
    final addrUpper = address.toUpperCase().trim();
    final bodyUpper = body.toUpperCase().trim();

    // 1. Direct match against TRAI registered bank sender entity headers
    for (final entry in _officialBankSenderMap.entries) {
      if (addrUpper.contains(entry.key)) {
        return entry.value;
      }
    }

    // 2. Strict bank sign-off check in the message body ONLY IF the sender address
    // indicates a financial/banking entity (contains BANK, BK, or NB).
    if (addrUpper.contains('BANK') || addrUpper.contains('BK') || addrUpper.contains('NB')) {
      if (bodyUpper.contains('INDIAN BANK') || bodyUpper.contains('INDBNK')) return 'Indian Bank';
      if (bodyUpper.contains('STATE BANK') || bodyUpper.contains('SBI')) return 'State Bank of India';
      if (bodyUpper.contains('HDFC')) return 'HDFC Bank';
      if (bodyUpper.contains('ICICI')) return 'ICICI Bank';
      if (bodyUpper.contains('AXIS')) return 'Axis Bank';
      if (bodyUpper.contains('KOTAK')) return 'Kotak Mahindra';
      if (bodyUpper.contains('PUNJAB NATIONAL') || bodyUpper.contains('PNB')) return 'Punjab National Bank';
      if (bodyUpper.contains('CANARA')) return 'Canara Bank';
      if (bodyUpper.contains('BANK OF BARODA') || bodyUpper.contains('BOB')) return 'Bank of Baroda';
      if (bodyUpper.contains('BANK OF INDIA') || bodyUpper.contains('BOI')) return 'Bank of India';
      if (bodyUpper.contains('UNION BANK')) return 'Union Bank of India';
      if (bodyUpper.contains('IDFC')) return 'IDFC First Bank';
      if (bodyUpper.contains('YES BANK')) return 'Yes Bank';
      if (bodyUpper.contains('INDUSIND')) return 'IndusInd Bank';
      if (bodyUpper.contains('FEDERAL BANK')) return 'Federal Bank';
      if (bodyUpper.contains('IDBI')) return 'IDBI Bank';
      if (bodyUpper.contains('PAYTM')) return 'Paytm Payments Bank';
    }

    // No official bank matched -> strictly null
    return null;
  }

  static TransactionCategory _determineCategory(String merchant, String lowerBody) {
    final text = '${merchant.toLowerCase()} $lowerBody';

    if (text.contains('swiggy') || text.contains('zomato') || text.contains('starbucks') ||
        text.contains('mcdonald') || text.contains('restaurant') || text.contains('food') ||
        text.contains('cafe') || text.contains('dining') || text.contains('pizza')) {
      return TransactionCategory.Food;
    }
    if (text.contains('amazon') || text.contains('flipkart') || text.contains('myntra') ||
        text.contains('zara') || text.contains('shopping') || text.contains('mall') ||
        text.contains('supermarket') || text.contains('mart') || text.contains('store')) {
      return TransactionCategory.Shopping;
    }
    if (text.contains('uber') || text.contains('ola') || text.contains('rapido') ||
        text.contains('irctc') || text.contains('metro') || text.contains('flight') ||
        text.contains('petrol') || text.contains('fuel') || text.contains('makemytrip')) {
      return TransactionCategory.Travel;
    }
    if (text.contains('airtel') || text.contains('jio') || text.contains('electricity') ||
        text.contains('water') || text.contains('broadband') || text.contains('bescom') ||
        text.contains('bill') || text.contains('utility') || text.contains('recharge')) {
      return TransactionCategory.Bills;
    }
    if (text.contains('rent') || text.contains('landlord') || text.contains('society') ||
        text.contains('maintenance')) {
      return TransactionCategory.Rent;
    }
    if (text.contains('salary') || text.contains('payroll') || text.contains('stipend') ||
        text.contains('bonus') || text.contains('wages')) {
      return TransactionCategory.Salary;
    }
    if (text.contains('emi') || text.contains('loan') || text.contains('bajaj finance') ||
        text.contains('interest')) {
      return TransactionCategory.EMI;
    }
    if (text.contains('apollo') || text.contains('pharmacy') || text.contains('hospital') ||
        text.contains('medplus') || text.contains('doctor') || text.contains('medical')) {
      return TransactionCategory.Health;
    }
    if (text.contains('netflix') || text.contains('spotify') || text.contains('prime') ||
        text.contains('bookmyshow') || text.contains('cinema') || text.contains('pvr')) {
      return TransactionCategory.Entertainment;
    }

    return TransactionCategory.Other;
  }

  /// Parses Credit Card Statement SMS messages from Indian banks
  static CreditCardStatement? parseCreditCardStatement({
    required String address,
    required String body,
    DateTime? timestamp,
  }) {
    if (body.isEmpty) return null;

    // 1. Check if this is a credit card statement notification
    final isStatement = RegExp(r'\b(statement|stmt|min\s*due|minimum\s*due|total\s*due|tot\s*due|payable\s*by|bill\s*due)\b', caseSensitive: false).hasMatch(body);
    final isCard = RegExp(r'\b(card|credit\s*card|creditcard|cc)\b', caseSensitive: false).hasMatch(body);

    if (!isStatement || !isCard) return null;

    // 2. Extract Total Due Amount
    double? totalDue;
    final totalDueMatch = RegExp(
      r'(?:total\s*(?:amt|amount)?\s*due|tot\s*due|total\s*due)\s*(?:is|:)?\s*(?:Rs\.?|INR|₹)?\s*([\d,]+(?:\.\d{1,2})?)',
      caseSensitive: false,
    ).firstMatch(body);

    if (totalDueMatch != null) {
      final clean = totalDueMatch.group(1)?.replaceAll(',', '').trim();
      if (clean != null) totalDue = double.tryParse(clean);
    }

    // Fallback: search for first currency amount if marked with "bill" or "statement"
    if (totalDue == null) {
      final genAmt = RegExp(r'(?:Rs\.?|INR|₹)\s*([\d,]+(?:\.\d{1,2})?)', caseSensitive: false).firstMatch(body);
      if (genAmt != null) {
        final clean = genAmt.group(1)?.replaceAll(',', '').trim();
        if (clean != null) totalDue = double.tryParse(clean);
      }
    }

    if (totalDue == null || totalDue <= 0) return null;

    // 3. Extract Minimum Due Amount
    double? minDue;
    final minDueMatch = RegExp(
      r'(?:min\s*(?:amt|amount)?\s*due|minimum\s*(?:amt|amount)?\s*due|min\s*due)\s*(?:is|:)?\s*(?:Rs\.?|INR|₹)?\s*([\d,]+(?:\.\d{1,2})?)',
      caseSensitive: false,
    ).firstMatch(body);

    if (minDueMatch != null) {
      final clean = minDueMatch.group(1)?.replaceAll(',', '').trim();
      if (clean != null) minDue = double.tryParse(clean);
    }

    // Default min due to 5% of total due if bank didn't specify (standard RBI/Indian bank default)
    minDue ??= (totalDue * 0.05).clamp(250.0, totalDue);

    // 4. Extract Card Last 4
    String cardLast4 = '0000';
    final cardMatch = RegExp(
      r'(?:card(?:\s*no\.?)?|ending\s*(?:with)?|xx|xx\*)\s*(\d{4})',
      caseSensitive: false,
    ).firstMatch(body);
    if (cardMatch != null) {
      cardLast4 = cardMatch.group(1) ?? '0000';
    }

    // 5. Extract Due Date
    DateTime dueDate = DateTime.now().add(const Duration(days: 15));
    final dateMatch = RegExp(
      r'(?:due\s*(?:date|by|on)|payable\s*by|by)\s*(?:is|:)?\s*(\d{1,2}[-\/\s](?:[A-Za-z]{3}|\d{1,2})[-\/\s]\d{2,4})',
      caseSensitive: false,
    ).firstMatch(body);

    if (dateMatch != null) {
      final rawDate = dateMatch.group(1)?.trim();
      if (rawDate != null) {
        dueDate = _parseCustomDate(rawDate) ?? dueDate;
      }
    }

    // 6. Detect Bank Name
    final bankName = _detectOfficialBank(address, body);
    if (bankName == null) return null;

    final id = 'CC_${bankName}_${cardLast4}_${(timestamp ?? DateTime.now()).millisecondsSinceEpoch}';

    return CreditCardStatement(
      id: id,
      bankName: bankName,
      cardLast4: cardLast4,
      totalAmountDue: totalDue,
      minimumAmountDue: minDue,
      dueDate: dueDate,
      statementDate: timestamp ?? DateTime.now(),
    );
  }

  static DateTime? _parseCustomDate(String str) {
    try {
      final parts = str.split(RegExp(r'[-\/\s]'));
      if (parts.length == 3) {
        int day = int.tryParse(parts[0]) ?? 1;
        int year = int.tryParse(parts[2]) ?? DateTime.now().year;
        if (year < 100) year += 2000;
        int month = 1;
        final monthStr = parts[1].toLowerCase();
        const months = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
        final mIdx = months.indexWhere((m) => monthStr.startsWith(m));
        if (mIdx != -1) {
          month = mIdx + 1;
        } else {
          month = int.tryParse(parts[1]) ?? 1;
        }
        return DateTime(year, month, day);
      }
    } catch (_) {}
    return null;
  }
}
