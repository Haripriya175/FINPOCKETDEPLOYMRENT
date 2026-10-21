/// Honest display labels for a transaction row.
///
/// A row must answer the three questions the user actually asks:
///  * **who** the money came from / went to (the counterparty the bank named,
///    never the placeholder "Me (Bank Account)" a credit row used to show),
///  * **when** it happened — date *and* clock time,
///  * **which transaction id** the bank assigned.
///
/// Nothing here invents data: when the bank SMS carried no counterparty or no
/// reference, the label falls back to a plain description instead of making
/// one up.
library;

import '../models/models.dart';
import '../services/bank_sms_parser_service.dart';

const List<String> _months = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
];

String _two(int v) => v.toString().padLeft(2, '0');

/// "09 Oct 2026 · 10:12" — date plus the time of day the SMS/ledger recorded.
String transactionTimeLabel(DateTime ts) =>
    '${_two(ts.day)} ${_months[ts.month - 1]} ${ts.year} · '
    '${_two(ts.hour)}:${_two(ts.minute)}';

/// True when [name] is the user's own side of the row ("Me (HDFC Bank)") or a
/// placeholder standing in for a payee the SMS never named — such rows must
/// True when [name] is the user's own side of the row ("Me (HDFC Bank)") or a
/// placeholder standing in for a payee the SMS never named — such rows must
/// never be the headline.
bool _isSelfSide(String name) {
  final t = name.trim().toLowerCase();
  if (t.isEmpty) return true;
  return t == 'me' ||
      t.startsWith('me (') ||
      t.startsWith('me -') ||
      t == 'my bank account' ||
      t == 'your bank account' ||
      t == 'bank account' ||
      t == 'primary bank account' ||
      t == 'merchant' ||
      t == 'recipient' ||
      t == 'rs' ||
      t == 'rs.' ||
      t == 'inr' ||
      t == 'inr.' ||
      t == 'self' ||
      t == 'self transfer' ||
      t == 'bank deposit / transfer';
}

/// Matches phone number or masked mobile against the device's contacts map
String? _resolveContactName(String p) {
  if (BankSmsParserService.contactsMap.isEmpty) return null;

  // 1. Any 10-digit sequence (e.g. 7382224476ptyes, 7382224476 (UPI), 7382224476@okhdfc, 7382224476)
  final m10 = RegExp(r'(?:^|[^\d])([6-9]\d{9})(?:$|[^\d])').firstMatch(p) ??
      RegExp(r'^([6-9]\d{9})').firstMatch(p) ??
      RegExp(r'\b(\d{10})\b').firstMatch(p);
  if (m10 != null) {
    final digits = m10.group(1)!;
    final contact = BankSmsParserService.contactsMap[digits];
    if (contact != null && contact.isNotEmpty) return contact;
  }

  // 2. Masked mobile (e.g. "mobile 9XXXXXX43210")
  final masked = RegExp(r'mobile\s+([6-9])(?:X+|\*+)(\d{4,5})', caseSensitive: false).firstMatch(p);
  if (masked != null) {
    final start = masked.group(1)!;
    final end = masked.group(2)!;
    final matches = BankSmsParserService.contactsMap.entries
        .where((e) => e.key.startsWith(start) && e.key.endsWith(end))
        .toList();
    if (matches.length == 1) {
      return matches.first.value;
    }
  }

  return null;
}

/// Cleans currency prefixes / tokens and rejects invalid names.
String? _cleanParty(String raw) {
  var p = raw.trim();
  if (p.isEmpty) return null;
  // Strip leading currency strings accidentally captured ("Rs.", "Rs", "INR", "₹")
  p = p.replaceAll(RegExp(r'^(?:rs\.?|inr|₹)\s*', caseSensitive: false), '').trim();
  if (p.isEmpty || _isSelfSide(p)) return null;

  // 1. Check if device contacts have a real person's name for this phone / VPA
  final contactName = _resolveContactName(p);
  if (contactName != null) {
    return contactName;
  }

  // Format 10-digit mobile UPI handles (e.g. 7382224476ptyes -> 7382224476 (UPI))
  final vpaMatch = RegExp(r'^(\d{10})([a-zA-Z]+)$').firstMatch(p);
  if (vpaMatch != null && vpaMatch.group(2)!.isNotEmpty) {
    final digits = vpaMatch.group(1)!;
    final contact = BankSmsParserService.contactsMap[digits];
    if (contact != null && contact.isNotEmpty) return contact;
    return '${vpaMatch.group(1)} (UPI)';
  }

  // If numeric only or date shaped, it's not a person
  if (RegExp(r'^\d+$').hasMatch(p)) return null;
  if (RegExp(r'^\d{1,2}[-/]\d{1,2}[-/]\d{2,4}$').hasMatch(p)) return null;
  return p;
}

/// The counterparty a row is about: "From Rahul Sharma" for money in,
/// "To Amazon Pay" for money out. Falls back through the other side of the
/// transaction, merchant, and description before settling on an honest verb.
String transactionPartyLabel(Transaction txn) {
  final isIncome = txn.type == TransactionType.INCOME;
  final primaryRaw = isIncome ? txn.sender : txn.receiver;
  final primary = _cleanParty(primaryRaw);
  if (primary != null) {
    return isIncome ? 'From $primary' : 'To $primary';
  }

  final otherRaw = isIncome ? txn.receiver : txn.sender;
  final other = _cleanParty(otherRaw);
  if (other != null) {
    return isIncome ? 'From $other' : 'To $other';
  }

  final merchant = _cleanParty(txn.merchant ?? '');
  if (merchant != null) {
    return isIncome ? 'From $merchant' : 'To $merchant';
  }

  // Check description if it ends with ": Payee"
  final desc = txn.description.trim();
  final colonIdx = desc.lastIndexOf(':');
  if (colonIdx != -1 && colonIdx + 1 < desc.length) {
    final candidate = _cleanParty(desc.substring(colonIdx + 1));
    if (candidate != null) {
      return isIncome ? 'From $candidate' : 'To $candidate';
    }
  }

  // Self transfers between distinct user accounts ONLY:
  // A true self-transfer happens when the user moves money between two of their own accounts
  // (both sides start with "me (" e.g. "Me (HDFC Bank)" to "Me (Indian Bank)").
  final s = txn.sender.trim().toLowerCase();
  final r = txn.receiver.trim().toLowerCase();
  final isBothUserAccounts = s.startsWith('me (') && r.startsWith('me (') && s != r;
  if (isBothUserAccounts) {
    return 'Self Transfer';
  }

  return isIncome ? 'Money received' : 'Payment made';
}

/// Renders one side of a row for a receipt: the user's own side reads as
/// "You (HDFC Bank)", the other side keeps the name the bank gave.
String receiptPartyLabel(String side) {
  final t = side.trim();
  if (t.isEmpty) return '—';
  if (t.toLowerCase().startsWith('me (') && t.endsWith(')')) {
    // `substring(2)` keeps the space before the account label.
    return 'You${t.substring(2)}';
  }
  if (t.toLowerCase() == 'my bank account') return 'You (Bank Account)';
  if (t.toLowerCase() == 'me') return 'You';
  return t;
}

/// The bank's own transaction / UTR / reference id — only when the bank
/// really sent one. Synthetic internal ids (`SMS_…`) are never dressed up as
/// bank transaction ids, so `null` means "no bank id on record".
String? transactionRefLabel(Transaction txn) {
  final ref = txn.referenceId.trim();
  if (ref.length < 4) return null;
  if (ref.toUpperCase().startsWith('SMS_')) return null;
  return ref;
}

/// Full plain-text receipt — used by the real "Share Receipt" action so the
/// clipboard gets actual content instead of a success message with none.
String transactionReceiptText(Transaction txn) {
  final ref = transactionRefLabel(txn);
  final rawStatus = txn.status.toString().split('.').last;
  final status = rawStatus.isEmpty
      ? rawStatus
      : '${rawStatus[0]}${rawStatus.substring(1).toLowerCase()}';
  return [
    'FinPocket Transaction Receipt',
    '--------------------------------',
    'Amount     : ${txn.type == TransactionType.INCOME ? '+' : '-'}₹${txn.amount.toStringAsFixed(2)}',
    'From       : ${receiptPartyLabel(txn.sender)}',
    'To         : ${receiptPartyLabel(txn.receiver)}',
    'Category   : ${txn.category.toString().split('.').last}',
    'Date & Time: ${transactionTimeLabel(txn.timestamp)}',
    if (ref != null) 'Bank Txn ID: $ref',
    'Record ID  : ${txn.id}',
    'Status     : $status',
    if (txn.description.trim().isNotEmpty) 'Note       : ${txn.description.trim()}',
  ].join('\n');
}
