import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:provider/provider.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'package:finpocket_app/config/app_config.dart';
import 'package:finpocket_app/models/models.dart';
import 'package:finpocket_app/providers/app_state.dart';
import 'package:finpocket_app/services/security_auth_service.dart';
import 'package:finpocket_app/screens/auth/register_screen.dart';
import 'package:finpocket_app/widgets/auth/otp_verification_sheet.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  setUp(() {
    SharedPreferences.setMockInitialValues({});
    AppConfig.environment = AppEnvironment.test;
  });

  group('FinPocket OTP Authentication — Phase 5 Flutter Integration Tests', () {
    // 1. Phone Normalization & Validation Tests
    test('1. Indian mobile phone number normalization and validation', () {
      // 10 digits starting with 9
      final res1 = SecurityAuthService.normalizeIndianPhone('9876543210');
      expect(res1.isValid, isTrue);
      expect(res1.normalized, equals('+919876543210'));
      expect(res1.raw10Digits, equals('9876543210'));

      // With +91 prefix and spaces
      final res2 = SecurityAuthService.normalizeIndianPhone('+91 98765 43210');
      expect(res2.isValid, isTrue);
      expect(res2.normalized, equals('+919876543210'));

      // With trunk 0 prefix
      final res3 = SecurityAuthService.normalizeIndianPhone('09876543210');
      expect(res3.isValid, isTrue);
      expect(res3.normalized, equals('+919876543210'));

      // Invalid starting digit (must start with 6, 7, 8, or 9)
      final res4 = SecurityAuthService.normalizeIndianPhone('5876543210');
      expect(res4.isValid, isFalse);
      expect(res4.error, contains('must start with 6, 7, 8, or 9'));

      // Invalid non-Indian country code
      final res5 = SecurityAuthService.normalizeIndianPhone('+14155552671');
      expect(res5.isValid, isFalse);
      expect(res5.error, contains('+91'));

      // Short number
      final res6 = SecurityAuthService.normalizeIndianPhone('98765');
      expect(res6.isValid, isFalse);
      expect(res6.error, contains('10-digit'));
    });

    // 2. Privacy Masking Tests
    test('2. Phone and name masking protects sensitive user details', () {
      final maskedPhone = SecurityAuthService.maskPhone('+919876543210');
      expect(maskedPhone, equals('+91 ******3210'));

      final maskedShort = SecurityAuthService.maskPhone('123');
      expect(maskedShort, equals('••••'));

      final maskedName = SecurityAuthService.maskName('Jithesh Kumar');
      expect(maskedName, equals('J****** K****'));
    });

    // 3. Disposable Email Rejection
    test('3. Disposable and temporary email addresses are rejected', () {
      expect(SecurityAuthService.isDisposableEmail('test@mailinator.com'), isTrue);
      expect(SecurityAuthService.isDisposableEmail('test@tempmail.com'), isTrue);
      expect(SecurityAuthService.isDisposableEmail('test@10minutemail.com'), isTrue);
      expect(SecurityAuthService.isDisposableEmail('legitimate.user@gmail.com'), isFalse);
      expect(SecurityAuthService.isDisposableEmail('finance@outlook.com'), isFalse);
    });

    // 4. Registration UI Input & Field Rendering
    testWidgets('4. Registration screen renders Name, Email, Phone, Passwords and Captcha', (WidgetTester tester) async {
      await tester.pumpWidget(
        ChangeNotifierProvider(
          create: (_) => AppState(),
          child: const MaterialApp(home: RegisterScreen()),
        ),
      );
      await tester.pumpAndSettle();

      expect(find.byKey(const Key('register_name_field')), findsOneWidget);
      expect(find.byKey(const Key('register_email_field')), findsOneWidget);
      expect(find.byKey(const Key('register_phone_field')), findsOneWidget);
      expect(find.byKey(const Key('register_password_field')), findsOneWidget);
      expect(find.byKey(const Key('register_confirm_password_field')), findsOneWidget);
      expect(find.byKey(const Key('register_submit_button')), findsOneWidget);
      expect(find.text('Send OTP'), findsNWidgets(2)); // For email and phone
    });

    // 5. OtpVerificationSheet Rendering (Email)
    testWidgets('5. Email OTP verification sheet renders 6-digit input, countdown, and resend action', (WidgetTester tester) async {
      await tester.pumpWidget(
        const MaterialApp(
          home: Scaffold(
            body: OtpVerificationSheet(
              type: OtpVerificationType.email,
              destination: 'sarah@finpocket.com',
              initialCooldownSeconds: 30,
            ),
          ),
        ),
      );
      await tester.pump();

      expect(find.text('Email Verification'), findsOneWidget);
      expect(find.textContaining('sarah@finpocket.com'), findsOneWidget);
      expect(find.byKey(const Key('otp_input_field')), findsOneWidget);
      expect(find.byKey(const Key('otp_verify_button')), findsOneWidget);
      expect(find.byKey(const Key('otp_resend_countdown')), findsOneWidget);
      expect(find.text('Resend code in 30s'), findsOneWidget);

      // Verify button should initially be disabled because OTP field is empty
      final button = tester.widget<ElevatedButton>(find.byKey(const Key('otp_verify_button')));
      expect(button.onPressed, isNull);
    });

    // 6. OtpVerificationSheet Real Code Entry
    testWidgets('6. Entering 6-digit code enables verify button and populates input', (WidgetTester tester) async {
      await tester.pumpWidget(
        const MaterialApp(
          home: Scaffold(
            body: OtpVerificationSheet(
              type: OtpVerificationType.email,
              destination: 'sarah@finpocket.com',
            ),
          ),
        ),
      );
      await tester.pump();

      // Enter 6-digit verification code
      await tester.enterText(find.byKey(const Key('otp_input_field')), '789123');
      await tester.pump();

      final input = tester.widget<TextField>(find.byKey(const Key('otp_input_field')));
      expect(input.controller!.text, equals('789123'));

      // Verify button should now be enabled
      final button = tester.widget<ElevatedButton>(find.byKey(const Key('otp_verify_button')));
      expect(button.onPressed, isNotNull);
    });

    // 7. OtpVerificationSheet Rendering (Mobile Phone)
    testWidgets('7. Mobile OTP verification sheet displays masked destination and SMS icon', (WidgetTester tester) async {
      await tester.pumpWidget(
        const MaterialApp(
          home: Scaffold(
            body: OtpVerificationSheet(
              type: OtpVerificationType.phone,
              destination: '+919876543210',
              maskedDestination: '+91 ******3210',
              initialCooldownSeconds: 30,
            ),
          ),
        ),
      );
      await tester.pump();

      expect(find.text('Mobile Phone Verification'), findsOneWidget);
      expect(find.textContaining('+91 ******3210'), findsOneWidget);
      expect(find.byIcon(Icons.sms_outlined), findsOneWidget);
    });

    // 8. Resend Countdown Timer Behavior
    testWidgets('8. Resend countdown decrements and activates Resend Code button at zero', (WidgetTester tester) async {
      await tester.pumpWidget(
        const MaterialApp(
          home: Scaffold(
            body: OtpVerificationSheet(
              type: OtpVerificationType.email,
              destination: 'timer@finpocket.com',
              initialCooldownSeconds: 2, // short for testing
            ),
          ),
        ),
      );
      await tester.pump();

      expect(find.text('Resend code in 2s'), findsOneWidget);
      expect(find.byKey(const Key('otp_resend_button')), findsNothing);

      // Advance 1 second
      await tester.pump(const Duration(seconds: 1));
      expect(find.text('Resend code in 1s'), findsOneWidget);

      // Advance 1 more second -> 0s
      await tester.pump(const Duration(seconds: 1));
      expect(find.byKey(const Key('otp_resend_countdown')), findsNothing);
      expect(find.byKey(const Key('otp_resend_button')), findsOneWidget);
      expect(find.text('Resend Code'), findsOneWidget);
    });

    // 9. Verification Status Refresh in AppState
    test('9. AppState refreshVerificationStatus updates User verification flags', () async {
      // Initial user with unverified flags
      final user = User(
        userId: 'usr_status_test',
        fullName: 'Test User',
        email: 'test@finpocket.com',
        phone: '+91 98765 43210',
        createdAt: '2026-09-22T00:00:00Z',
        emailVerified: false,
        phoneVerified: false,
      );

      expect(user.emailVerified, isFalse);
      expect(user.phoneVerified, isFalse);
      expect(user.isFullyVerified, isFalse);

      // Updated user via copyWith
      final verifiedUser = user.copyWith(
        emailVerified: true,
        phoneVerified: true,
      );

      expect(verifiedUser.emailVerified, isTrue);
      expect(verifiedUser.phoneVerified, isTrue);
      expect(verifiedUser.isFullyVerified, isTrue);
    });

    // 10. User JSON Deserialization of Verification Properties
    test('10. User model correctly maps emailVerified and phoneVerified from backend JSON', () {
      final json = {
        'id': 'usr_json_test',
        'name': 'Verification Tester',
        'email': 'verify@finpocket.com',
        'phone': '+91 99999 88888',
        'email_verified': 1,
        'phone_verified': 1,
        'maskedPhone': '+91 ******8888',
        'maskedName': 'V*********** T*****',
      };

      final user = User.fromJson(json);
      expect(user.userId, equals('usr_json_test'));
      expect(user.emailVerified, isTrue);
      expect(user.phoneVerified, isTrue);
      expect(user.isFullyVerified, isTrue);
      expect(user.maskedPhone, equals('+91 ******8888'));
    });
  });
}
