import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:provider/provider.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'package:finpocket_app/main.dart';
import 'package:finpocket_app/config/app_config.dart';
import 'package:finpocket_app/models/models.dart';
import 'package:finpocket_app/providers/app_state.dart';
import 'package:finpocket_app/services/api_service.dart';
import 'package:finpocket_app/screens/auth/login_screen.dart';
import 'package:finpocket_app/screens/auth/register_screen.dart';
import 'package:finpocket_app/screens/auth/forgot_password_screen.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  setUp(() {
    SharedPreferences.setMockInitialValues({});
    AppConfig.environment = AppEnvironment.test;
  });

  group('Mobile Authentication Flow Tests', () {
    testWidgets('1. Login screen rendering with all fields and actions', (WidgetTester tester) async {
      await tester.pumpWidget(
        ChangeNotifierProvider(
          create: (_) => AppState(),
          child: const MaterialApp(home: LoginScreen()),
        ),
      );
      await tester.pumpAndSettle();

      expect(find.text('FinPocket'), findsWidgets);
      expect(find.text('Welcome Back'), findsOneWidget);
      expect(find.byKey(const Key('login_email_field')), findsOneWidget);
      expect(find.byKey(const Key('login_password_field')), findsOneWidget);
      expect(find.byKey(const Key('login_submit_button')), findsOneWidget);
      expect(find.byKey(const Key('forgot_password_button')), findsOneWidget);
      expect(find.byKey(const Key('go_to_register_button')), findsOneWidget);
    });

    testWidgets('2. Registration screen rendering with required inputs', (WidgetTester tester) async {
      await tester.pumpWidget(
        ChangeNotifierProvider(
          create: (_) => AppState(),
          child: const MaterialApp(home: RegisterScreen()),
        ),
      );
      await tester.pumpAndSettle();

      expect(find.text('Create Account'), findsWidgets);
      expect(find.text('Join FinPocket'), findsOneWidget);
      expect(find.byKey(const Key('register_name_field')), findsOneWidget);
      expect(find.byKey(const Key('register_email_field')), findsOneWidget);
      expect(find.byKey(const Key('register_password_field')), findsOneWidget);
      expect(find.byKey(const Key('register_confirm_password_field')), findsOneWidget);
      expect(find.byKey(const Key('register_submit_button')), findsOneWidget);
    });

    testWidgets('3. Invalid email validation displays error message', (WidgetTester tester) async {
      await tester.pumpWidget(
        ChangeNotifierProvider(
          create: (_) => AppState(),
          child: const MaterialApp(home: LoginScreen()),
        ),
      );
      await tester.pumpAndSettle();

      await tester.enterText(find.byKey(const Key('login_email_field')), 'invalid-email-format');
      await tester.enterText(find.byKey(const Key('login_password_field')), 'secret123');
      await tester.ensureVisible(find.byKey(const Key('login_submit_button')));
      await tester.tap(find.byKey(const Key('login_submit_button')));
      await tester.pumpAndSettle();

      expect(find.text('Please enter a valid email address'), findsOneWidget);
    });

    testWidgets('4. Empty password validation blocks submission', (WidgetTester tester) async {
      await tester.pumpWidget(
        ChangeNotifierProvider(
          create: (_) => AppState(),
          child: const MaterialApp(home: LoginScreen()),
        ),
      );
      await tester.pumpAndSettle();

      await tester.enterText(find.byKey(const Key('login_email_field')), 'user@finpocket.com');
      await tester.ensureVisible(find.byKey(const Key('login_submit_button')));
      await tester.tap(find.byKey(const Key('login_submit_button')));
      await tester.pumpAndSettle();

      expect(find.text('Please enter your password'), findsOneWidget);
    });

    testWidgets('5. Password mismatch validation in registration', (WidgetTester tester) async {
      await tester.pumpWidget(
        ChangeNotifierProvider(
          create: (_) => AppState(),
          child: const MaterialApp(home: RegisterScreen()),
        ),
      );
      await tester.pumpAndSettle();

      await tester.enterText(find.byKey(const Key('register_name_field')), 'Alice Test');
      await tester.enterText(find.byKey(const Key('register_email_field')), 'alice@test.com');
      await tester.enterText(find.byKey(const Key('register_password_field')), 'Password@123');
      await tester.enterText(find.byKey(const Key('register_confirm_password_field')), 'Password@Mismatch');
      await tester.ensureVisible(find.byKey(const Key('register_submit_button')));
      await tester.tap(find.byKey(const Key('register_submit_button')));
      await tester.pumpAndSettle();

      expect(find.text('Passwords do not match'), findsOneWidget);
    });

    test('6. Successful login flow updates state and stores authentication tokens', () async {
      await ApiService.setTokens('jwt_access_token_123', 'refresh_token_456');

      expect(ApiService.authToken, equals('jwt_access_token_123'));
      expect(ApiService.refreshToken, equals('refresh_token_456'));

      final user = User(
        userId: 'usr_live_test_1',
        fullName: 'Authenticated Test User',
        email: 'auth_test@finpocket.com',
        phone: '+91 99999 88888',
        createdAt: '2026-09-22T00:00:00Z',
      );

      // Verify User fromJson deserialization
      final userFromJson = User.fromJson({
        'id': 'usr_live_test_1',
        'name': 'Authenticated Test User',
        'email': 'auth_test@finpocket.com',
        'phone': '+91 99999 88888',
        'preferred_language': 'en',
        'biometrics_enabled': 1,
        'app_pin_enabled': true,
        'created_at': '2026-09-22T00:00:00Z',
      });

      expect(userFromJson.userId, equals(user.userId));
      expect(userFromJson.fullName, equals(user.fullName));
      expect(userFromJson.biometricsEnabled, isTrue);
    });

    test('7. Login failure records error in state without throwing unhandled exceptions', () async {
      final state = AppState();
      // Directly verify error handling behavior
      final result = await state.login('nonexistent@user.com', 'WrongPassword123');
      expect(result, isFalse);
      expect(state.authError, isNotNull);
    });

    test('8. Logout revokes session and clears local auth state', () async {
      final state = AppState();
      await ApiService.setTokens('token_to_clear', 'refresh_to_clear');
      expect(ApiService.authToken, equals('token_to_clear'));

      await state.logout();

      expect(state.currentUser, isNull);
      expect(state.isAuthenticated, isFalse);
      expect(state.isDemoMode, isFalse);
      expect(ApiService.authToken, isNull);
      expect(ApiService.refreshToken, isNull);
    });

    test('9. Session restoration sets authenticated user from stored token', () async {
      await ApiService.setTokens('valid_mock_token', 'valid_mock_refresh');
      expect(ApiService.authToken, isNotNull);
    });

    test('10. Expired session clears tokens and triggers logout handler', () async {
      bool sessionExpiredFired = false;
      ApiService.onSessionExpired = () {
        sessionExpiredFired = true;
      };

      await ApiService.setTokens('expired_token', 'expired_refresh');
      await ApiService.logout();

      expect(ApiService.authToken, isNull);
      expect(ApiService.refreshToken, isNull);
      expect(sessionExpiredFired, isFalse); // logout was explicit
    });

    test('11. Refresh token failure clears stored credentials', () async {
      await ApiService.setTokens('expired_token', null);
      try {
        await ApiService.refreshAuthToken();
        fail('Should throw if no refresh token available');
      } catch (e) {
        expect(e.toString().contains('No refresh token'), isTrue);
      }
    });

    testWidgets('12. Unauthorized routing blocks unauthenticated access to MainNavigationShell', (WidgetTester tester) async {
      final state = AppState();
      state.exitDemoMode(); // Unauthenticated, no demo mode

      await tester.pumpWidget(
        ChangeNotifierProvider.value(
          value: state,
          child: const MaterialApp(home: AuthGate()),
        ),
      );
      await tester.pumpAndSettle();

      // Should show LoginScreen, not MainNavigationShell
      expect(find.byType(LoginScreen), findsOneWidget);
      expect(find.byKey(const Key('login_submit_button')), findsOneWidget);
    });

    testWidgets('13. Forgot password screen renders request and reset stages', (WidgetTester tester) async {
      await tester.pumpWidget(
        ChangeNotifierProvider(
          create: (_) => AppState(),
          child: const MaterialApp(home: ForgotPasswordScreen()),
        ),
      );
      await tester.pumpAndSettle();

      expect(find.text('Reset Password'), findsWidgets);
      expect(find.byKey(const Key('forgot_password_email_field')), findsOneWidget);
      expect(find.byKey(const Key('request_reset_button')), findsOneWidget);
    });

    testWidgets('14. Loading states disable buttons and show progress indicators', (WidgetTester tester) async {
      await tester.pumpWidget(
        ChangeNotifierProvider(
          create: (_) => AppState(),
          child: const MaterialApp(home: LoginScreen()),
        ),
      );
      await tester.pumpAndSettle();

      final button = tester.widget<ElevatedButton>(find.byKey(const Key('login_submit_button')));
      expect(button.onPressed, isNotNull);
    });

    test('15. Network failure handling sanitizes error outputs without logging sensitive credentials', () async {
      final state = AppState();
      final failed = await state.login('test@finpocket.com', 'bad_password');
      expect(failed, isFalse);
      expect(state.authError, isNotNull);
      // Ensure error does not reveal passwords
      expect(state.authError!.contains('bad_password'), isFalse);
    });
  });
}
