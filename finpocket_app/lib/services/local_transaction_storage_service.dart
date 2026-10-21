import 'dart:convert';
import 'package:shared_preferences/shared_preferences.dart';
import '../models/models.dart';

/// Service responsible for managing user consent and persisting bank transactions
/// locally on the device (100% private, offline-first).
class LocalTransactionStorageService {
  static const String _keyLocalTransactions = 'finpocket_local_transactions_v1';
  static const String _keyVaultConsent = 'finpocket_vault_consent_granted';
  static const String _keySmsConsent = 'finpocket_sms_sync_consent_granted';
  static const String _keyLastSmsSync = 'finpocket_last_sms_sync_timestamp';

  /// Check whether the user has granted consent to store transactions locally on-device
  static Future<bool> isVaultConsentGranted() async {
    final prefs = await SharedPreferences.getInstance();
    // Default to true or check explicit preference
    return prefs.getBool(_keyVaultConsent) ?? false;
  }

  /// Update user consent for local on-device transaction vault
  static Future<void> setVaultConsent(bool granted) async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.setBool(_keyVaultConsent, granted);
  }

  /// Check whether the user has granted consent to scan bank SMS locally
  static Future<bool> isSmsSyncConsentGranted() async {
    final prefs = await SharedPreferences.getInstance();
    return prefs.getBool(_keySmsConsent) ?? false;
  }

  /// Update user consent for local bank SMS parsing
  static Future<void> setSmsSyncConsent(bool granted) async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.setBool(_keySmsConsent, granted);
  }

  /// Get the timestamp of the last SMS sync
  static Future<DateTime?> getLastSmsSyncTime() async {
    final prefs = await SharedPreferences.getInstance();
    final str = prefs.getString(_keyLastSmsSync);
    if (str != null) {
      return DateTime.tryParse(str);
    }
    return null;
  }

  /// Record current time as last SMS sync
  static Future<void> recordSmsSyncTime() async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString(_keyLastSmsSync, DateTime.now().toIso8601String());
  }

  /// Checks whether a stored transaction is non-bank spam (e.g. promotional loan
  /// offer from Meesho, or fake transaction with generic 'Bank Account').
  static bool isInvalidOrSpamTransaction(Transaction t) {
    final s = t.sender.toLowerCase();
    final r = t.receiver.toLowerCase();
    final d = t.description.toLowerCase();
    final id = t.id.toLowerCase();
    final ref = t.referenceId.toLowerCase();

    // 1. Transaction parsed with generic fallback "Bank Account"
    if (s.contains('bank account') || r.contains('bank account') || d.contains('bank account')) {
      return true;
    }

    // 2. Promotional loan offer spam (e.g. Meesho personal loan ad)
    if (d.contains('meesho') || ref.contains('meesho') || id.contains('meesho')) {
      return true;
    }
    if (t.category == TransactionCategory.EMI && t.amount == 3000.0 &&
        (s.contains('bank account') || r.contains('bank account') || s.startsWith('me (bank account)'))) {
      return true;
    }

    // 3. For SMS transactions, ensure it actually belongs to a recognized official bank
    if (id.startsWith('tx_sms_')) {
      const recognizedBanks = [
        'indian bank', 'hdfc', 'state bank', 'sbi', 'icici', 'axis',
        'kotak', 'punjab national', 'pnb', 'canara', 'bank of baroda',
        'bob', 'bank of india', 'union bank', 'idfc', 'yes bank',
        'indusind', 'federal', 'idbi', 'central bank', 'uco',
        'bank of maharashtra', 'indian overseas', 'punjab & sind',
        'rbl', 'karur vysya', 'south indian', 'city union', 'bandhan',
        'standard chartered', 'citibank', 'hsbc', 'dbs', 'paytm', 'airtel',
        'ippb', 'jupiter', 'fi'
      ];
      final combined = '$s $r $d';
      final hasBank = recognizedBanks.any((b) => combined.contains(b));
      if (!hasBank) {
        return true;
      }
    }

    return false;
  }

  /// Load all transactions stored locally on the device, purging any spam/non-bank items
  static Future<List<Transaction>> loadLocalTransactions() async {
    try {
      final prefs = await SharedPreferences.getInstance();
      final rawJson = prefs.getString(_keyLocalTransactions);
      if (rawJson == null || rawJson.isEmpty) {
        return [];
      }
      final decoded = jsonDecode(rawJson) as List<dynamic>;
      final list = decoded.map((item) => Transaction.fromJson(item as Map<String, dynamic>)).toList();
      final filtered = list.where((t) => !isInvalidOrSpamTransaction(t)).toList();
      if (filtered.length != list.length) {
        await saveLocalTransactions(filtered);
      }
      return filtered;
    } catch (_) {
      return [];
    }
  }

  /// Explicitly purge any spam / non-bank transactions from local storage
  static Future<void> purgeSpamTransactions() async {
    final list = await loadLocalTransactions();
    final filtered = list.where((t) => !isInvalidOrSpamTransaction(t)).toList();
    await saveLocalTransactions(filtered);
  }

  /// Save the full list of transactions locally on the device
  static Future<void> saveLocalTransactions(List<Transaction> transactions) async {
    try {
      final prefs = await SharedPreferences.getInstance();
      final mapped = transactions
          .where((t) => !isInvalidOrSpamTransaction(t))
          .map((t) => t.toJson())
          .toList();
      await prefs.setString(_keyLocalTransactions, jsonEncode(mapped));
    } catch (_) {}
  }

  /// Add or update a single transaction in local storage (deduplicating by id / referenceId)
  static Future<void> addOrUpdateTransaction(Transaction txn) async {
    final list = await loadLocalTransactions();
    final index = list.indexWhere((t) =>
      t.id == txn.id || (txn.referenceId.isNotEmpty && t.referenceId == txn.referenceId)
    );

    if (index >= 0) {
      list[index] = txn;
    } else {
      list.insert(0, txn);
    }
    await saveLocalTransactions(list);
  }

  /// Merge new transactions with locally stored ones without duplicates
  static Future<List<Transaction>> mergeWithLocalTransactions(List<Transaction> newTransactions) async {
    final validNew = newTransactions.where((t) => !isInvalidOrSpamTransaction(t)).toList();
    final localList = await loadLocalTransactions();

    // Repair rows parsed before payee extraction could terminate on
    // punctuation: they stored a placeholder ("Merchant") where the bank SMS
    // actually named the payee. When the same message re-parses with a real
    // name, the real one replaces the placeholder in place — no duplicate
    // rows, no new ids, so notifications are unaffected.
    bool isPlaceholder(Transaction t) {
      final s = t.sender.trim().toLowerCase();
      final r = t.receiver.trim().toLowerCase();
      const placeholders = {'merchant', 'recipient', 'bank deposit / transfer'};
      return placeholders.contains(s) || placeholders.contains(r);
    }

    final freshById = <String, Transaction>{};
    final freshByRef = <String, Transaction>{};
    for (final txn in validNew) {
      freshById[txn.id] = txn;
      if (txn.referenceId.isNotEmpty) freshByRef[txn.referenceId] = txn;
    }

    var changed = false;
    for (var i = 0; i < localList.length; i++) {
      final stored = localList[i];
      if (!isPlaceholder(stored)) continue;
      final fresh = freshById[stored.id] ??
          (stored.referenceId.isNotEmpty ? freshByRef[stored.referenceId] : null);
      if (fresh == null || isPlaceholder(fresh)) continue;
      localList[i] = fresh;
      changed = true;
    }

    final existingIds = localList.map((t) => t.id).toSet();
    final existingRefs = localList
        .where((t) => t.referenceId.isNotEmpty)
        .map((t) => t.referenceId)
        .toSet();

    final toAdd = <Transaction>[];
    for (final txn in validNew) {
      if (!existingIds.contains(txn.id) &&
          (txn.referenceId.isEmpty || !existingRefs.contains(txn.referenceId))) {
        toAdd.add(txn);
        existingIds.add(txn.id);
        if (txn.referenceId.isNotEmpty) existingRefs.add(txn.referenceId);
      }
    }

    if (toAdd.isNotEmpty) {
      localList.insertAll(0, toAdd);
      // Sort newest first
      localList.sort((a, b) => b.timestamp.compareTo(a.timestamp));
      changed = true;
    }

    if (changed) await saveLocalTransactions(localList);

    return localList;
  }

  /// Clear all locally stored transactions (e.g., on user logout or privacy reset)
  static Future<void> clearLocalTransactions() async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.remove(_keyLocalTransactions);
  }
}
