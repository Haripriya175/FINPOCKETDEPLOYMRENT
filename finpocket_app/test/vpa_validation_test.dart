import 'package:flutter_test/flutter_test.dart';
import 'package:finpocket_app/services/real_payment_service.dart';

/// Regression tests for VPA detection on the Payments screen.
///
/// Background: `_isPureVpa` used to be implemented inline as
/// `text.split('@')` followed by `parts.single`, guarded by
/// `if (parts.length != 2) return false`. The guard guarantees TWO elements,
/// but `Iterable.single` throws `StateError: Too many elements` whenever the
/// iterable has more than one — so every valid VPA (e.g. `user@okaxis`) threw.
/// The exception escaped the `void ... async` `_handlePay`, making the
/// "Authenticate & Pay" button appear completely dead with no visible error.
///
/// These tests pin the corrected behaviour so the crash cannot return.
void main() {
  group('RealPaymentService.isPureVpa', () {
    test('accepts a standard VPA (the case that used to crash)', () {
      expect(RealPaymentService.isPureVpa('user@okaxis'), isTrue);
      expect(RealPaymentService.isPureVpa('shop@paytm'), isTrue);
      expect(RealPaymentService.isPureVpa('9912788555-f6a9@ibl'), isTrue);
      expect(RealPaymentService.isPureVpa('dinesh@icici'), isTrue);
    });

    test('accepts a VPA with surrounding whitespace', () {
      expect(RealPaymentService.isPureVpa('  user@ybl  '), isTrue);
    });

    test('rejects empty input', () {
      expect(RealPaymentService.isPureVpa(''), isFalse);
      expect(RealPaymentService.isPureVpa('   '), isFalse);
    });

    test('rejects a bare mobile number (no @)', () {
      expect(RealPaymentService.isPureVpa('9876543210'), isFalse);
      expect(RealPaymentService.isPureVpa('6123456789'), isFalse);
    });

    test('rejects malformed input with too many @ separators', () {
      expect(RealPaymentService.isPureVpa('a@b@c'), isFalse);
      expect(RealPaymentService.isPureVpa('@okaxis'), isFalse);
      expect(RealPaymentService.isPureVpa('user@'), isFalse);
    });

    test('rejects a bank id shorter than 2 or longer than 6 chars', () {
      expect(RealPaymentService.isPureVpa('user@a'), isFalse);
      expect(RealPaymentService.isPureVpa('user@toolongbank'), isFalse);
    });

    test('rejects non-alphanumeric bank ids', () {
      expect(RealPaymentService.isPureVpa('user@ok-axis'), isFalse);
      expect(RealPaymentService.isPureVpa('user@ok.axis'), isFalse);
    });

    test('does not throw for any realistic input shape', () {
      // The original bug threw StateError; assert no input can ever escape.
      const candidates = <String>[
        '',
        ' ',
        '@',
        '@@',
        'a@b',
        'a@b@c',
        '9876543210',
        '9876543210@upi',
        'user@okaxis',
        '9912788555-f6a9@ibl',
        'user@toolongbank',
        'upi://pay?pa=user@okaxis&pn=Name',
      ];
      for (final c in candidates) {
        expect(
          () => RealPaymentService.isPureVpa(c),
          returnsNormally,
          reason: 'isPureVpa must never throw for input: "$c"',
        );
      }
    });
  });
}
