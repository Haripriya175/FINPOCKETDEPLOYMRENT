import 'package:flutter_test/flutter_test.dart';
import 'package:finpocket_app/models/models.dart';
import 'package:finpocket_app/core/transaction_display.dart';
import 'package:finpocket_app/services/bank_sms_parser_service.dart';

Transaction _txn({
  required String sender,
  required String receiver,
  required TransactionType type,
  String referenceId = '',
  String id = 'tx_test_1',
  TransactionStatus status = TransactionStatus.SUCCESSFUL,
}) {
  return Transaction(
    id: id,
    userId: 'usr_test',
    sender: sender,
    receiver: receiver,
    amount: 2500,
    type: type,
    category: TransactionCategory.Salary,
    status: status,
    timestamp: DateTime(2026, 10, 9, 10, 12),
    referenceId: referenceId,
    description: 'Salary credit',
  );
}

void main() {
  group('Transaction display labels', () {
    test('credit row leads with WHO sent the money', () {
      final txn = _txn(
        sender: 'Ramesh Kumar',
        receiver: 'Me (HDFC Bank)',
        type: TransactionType.INCOME,
      );
      expect(transactionPartyLabel(txn), 'From Ramesh Kumar');
    });

    test('debit row leads with WHERE the money went', () {
      final txn = _txn(
        sender: 'Me (HDFC Bank)',
        receiver: 'Amazon Pay',
        type: TransactionType.EXPENSE,
      );
      expect(transactionPartyLabel(txn), 'To Amazon Pay');
    });

    test('the user\u2019s own account is never the headline', () {
      final txn = _txn(
        sender: 'Me (Bank Account)',
        receiver: 'Me (Bank Account)',
        type: TransactionType.EXPENSE,
      );
      expect(transactionPartyLabel(txn), 'Payment made');
    });

    test('currency tokens like Rs or generic bank account are never shown as counterparty', () {
      final rsTxn = _txn(
        sender: 'Rs',
        receiver: 'Me (HDFC Bank)',
        type: TransactionType.INCOME,
      );
      expect(transactionPartyLabel(rsTxn), isNot(contains('From Rs')));

      final genericAccTxn = _txn(
        sender: 'Me (HDFC Bank)',
        receiver: 'your bank account',
        type: TransactionType.EXPENSE,
      );
      expect(transactionPartyLabel(genericAccTxn), isNot(contains('To your bank account')));
    });

    test('time label carries date and clock time', () {
      final txn = _txn(
        sender: 'Ramesh Kumar',
        receiver: 'Me (HDFC Bank)',
        type: TransactionType.INCOME,
      );
      expect(transactionTimeLabel(txn.timestamp), '09 Oct 2026 · 10:12');
    });

    test('only real bank references are called transaction ids', () {
      final withRef = _txn(
        sender: 'Ramesh Kumar',
        receiver: 'Me (HDFC Bank)',
        type: TransactionType.INCOME,
        referenceId: '431234567890',
      );
      expect(transactionRefLabel(withRef), '431234567890');

      final synthetic = _txn(
        sender: 'Bank Deposit / Transfer',
        receiver: 'Me (HDFC Bank)',
        type: TransactionType.INCOME,
        referenceId: 'SMS_1770000000000_2500',
      );
      expect(transactionRefLabel(synthetic), isNull);
    });

    test('receipt text shows who, when and the transaction id', () {
      final txn = _txn(
        sender: 'Ramesh Kumar',
        receiver: 'Me (HDFC Bank)',
        type: TransactionType.INCOME,
        referenceId: '431234567890',
      );
      final text = transactionReceiptText(txn);
      expect(text, contains('From       : Ramesh Kumar'));
      expect(text, contains('To         : You (HDFC Bank)'));
      expect(text, contains('09 Oct 2026 · 10:12'));
      expect(text, contains('Bank Txn ID: 431234567890'));
      expect(text, contains('Status     : Successful'));
    });

    test('P2P mobile credits (e.g. mobile 9XXXXXX43210) show as sender and never Self Transfer', () {
      final txn = _txn(
        sender: 'mobile 9XXXXXX43210',
        receiver: 'Me (Indian Bank)',
        type: TransactionType.INCOME,
        referenceId: '628718993953',
      );
      expect(transactionPartyLabel(txn), 'From mobile 9XXXXXX43210');
    });

    test('P2P UPI VPA debits (e.g. 7382224476ptyes) format cleanly as UPI mobile when not in contacts', () {
      BankSmsParserService.contactsMap.clear();
      final txn = _txn(
        sender: 'Me (Indian Bank)',
        receiver: '7382224476ptyes',
        type: TransactionType.EXPENSE,
        referenceId: '450278654384',
      );
      expect(transactionPartyLabel(txn), 'To 7382224476 (UPI)');
    });

    test('P2P UPI debits resolve to the recipient\'s real contact name when in phone contacts', () {
      BankSmsParserService.contactsMap['7382224476'] = 'Nowneeth';
      final txn = _txn(
        sender: 'Me (Indian Bank)',
        receiver: '7382224476ptyes',
        type: TransactionType.EXPENSE,
        referenceId: '450278654384',
      );
      expect(transactionPartyLabel(txn), 'To Nowneeth');
    });

    test('Unparsed expense with fallback Merchant shows Payment made and never Self Transfer', () {
      final txn = _txn(
        sender: 'Me (Indian Bank)',
        receiver: 'Merchant',
        type: TransactionType.EXPENSE,
      );
      expect(transactionPartyLabel(txn), 'Payment made');
    });
  });
}
