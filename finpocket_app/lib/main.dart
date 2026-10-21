import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:provider/provider.dart';
import 'providers/app_state.dart';
import 'theme/app_theme.dart';
import 'screens/splash_screen.dart';
import 'screens/auth/login_screen.dart';
import 'screens/home_screen.dart';
import 'screens/payments_screen.dart';
import 'screens/transactions_screen.dart';
import 'screens/savings_screen.dart';
import 'screens/bills_screen.dart';
import 'screens/vault_screen.dart';
import 'screens/child_care_screen.dart';
import 'screens/ai_assistant_screen.dart';
import 'screens/profile_screen.dart';
import 'widgets/financial_profile_onboarding_modal.dart';
import 'widgets/connect_bank_prompt_modal.dart';

import 'core/auth/google_auth_config.dart';
import 'core/device_identity.dart';

void main() async {
  WidgetsFlutterBinding.ensureInitialized();
  await DeviceIdentity.init();
  await GoogleAuthConfig.initialize();
  runApp(
    MultiProvider(
      providers: [
        ChangeNotifierProvider(create: (_) => AppState()),
      ],
      child: const FinPocketApp(),
    ),
  );
}

class FinPocketApp extends StatelessWidget {
  const FinPocketApp({super.key});

  @override
  Widget build(BuildContext context) {
    final state = Provider.of<AppState>(context);

    return MaterialApp(
      title: 'FinPocket',
      debugShowCheckedModeBanner: false,
      theme: AppTheme.lightTheme,
      darkTheme: AppTheme.darkTheme,
      themeMode: state.themeMode,
      home: const AuthGate(),
    );
  }
}

class AuthGate extends StatelessWidget {
  const AuthGate({super.key});

  @override
  Widget build(BuildContext context) {
    final state = Provider.of<AppState>(context);

    if (state.isAuthChecking) {
      return const SplashScreen();
    }

    if (state.hasAccess) {
      return const MainNavigationShell();
    }

    return const LoginScreen();
  }
}

class MainNavigationShell extends StatefulWidget {
  const MainNavigationShell({super.key});

  @override
  State<MainNavigationShell> createState() => _MainNavigationShellState();
}

class _MainNavigationShellState extends State<MainNavigationShell> {
  int _currentIndex = 0;
  final List<int> _tabHistory = [0];
  String? _pendingPaymentRecipient;
  String? _pendingPaymentsMode;

  @override
  void initState() {
    super.initState();
    // One-time money profile setup: income, essential spend (-> minimum budget
    // floor) and whether the user is carrying EMIs (-> monthly guidance loop).
    // Once that sheet closes, ask whether the user wants to connect a real
    // bank (one-time; users who already linked an account are never asked).
    WidgetsBinding.instance.addPostFrameCallback((_) async {
      if (!mounted) return;
      await FinancialProfileOnboardingModal.showIfNeeded(context);
      if (!mounted) return;
      await ConnectBankPromptModal.showIfNeeded(context);
    });
  }

  void _handleTabChange(int index, [String? recipient, String? mode]) {
    _pendingPaymentRecipient = recipient;
    _pendingPaymentsMode = mode;
    if (_currentIndex != index) {
      _tabHistory.add(_currentIndex);
      setState(() {
        _currentIndex = index;
      });
    } else if (recipient != null || mode != null) {
      setState(() {});
    }
  }

  Future<bool> _showExitConfirmationDialog(BuildContext context) async {
    final res = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        backgroundColor: const Color(0xFF0F172A),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
        title: const Row(
          children: [
            Icon(Icons.exit_to_app_rounded, color: AppTheme.primary, size: 22),
            SizedBox(width: 8),
            Text('Exit FinPocket?', style: TextStyle(fontWeight: FontWeight.bold, fontSize: 17, color: Colors.white)),
          ],
        ),
        content: const Text(
          'Are you sure you want to close the app?',
          style: TextStyle(color: Color(0xFF94A3B8), fontSize: 13),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx, false),
            child: const Text('Stay in App', style: TextStyle(color: Colors.white70)),
          ),
          ElevatedButton(
            style: ElevatedButton.styleFrom(
              backgroundColor: AppTheme.danger,
              foregroundColor: Colors.white,
              shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(8)),
            ),
            onPressed: () => Navigator.pop(ctx, true),
            child: const Text('Yes, Exit'),
          ),
        ],
      ),
    );
    return res ?? false;
  }

  @override
  Widget build(BuildContext context) {
    final state = Provider.of<AppState>(context);

    // Unauthenticated protection fallback
    if (!state.hasAccess) {
      return const LoginScreen();
    }

    final List<Widget> screens = [
      HomeScreen(
        onTabChange: _handleTabChange,
        onOpenSend: () => _handleTabChange(1),
      ),
      PaymentsScreen(
        initialRecipient: _pendingPaymentRecipient,
        initialMode: _pendingPaymentsMode,
      ),
      const TransactionsScreen(),
      const SavingsScreen(),
      const BillsScreen(),
      const VaultScreen(),
      const ChildCareScreen(),
      const AIAssistantScreen(),
      ProfileScreen(onNavigate: _handleTabChange),
    ];

    return PopScope(
      canPop: false,
      onPopInvokedWithResult: (didPop, result) async {
        if (didPop) return;

        // Clean up redundant history items
        while (_tabHistory.isNotEmpty && _tabHistory.last == _currentIndex) {
          _tabHistory.removeLast();
        }

        // 1. If user navigated across tabs, pop tab history
        if (_tabHistory.isNotEmpty) {
          final prev = _tabHistory.removeLast();
          setState(() {
            _currentIndex = prev;
          });
          return;
        }

        // 2. If not on Home (index 0), go back to Home
        if (_currentIndex != 0) {
          setState(() {
            _currentIndex = 0;
          });
          return;
        }

        // 3. Already on Home (root) -> Ask confirmation before exiting!
        final shouldExit = await _showExitConfirmationDialog(context);
        if (shouldExit == true) {
          SystemNavigator.pop();
        }
      },
      child: Scaffold(
        body: screens[_currentIndex.clamp(0, screens.length - 1)],
        bottomNavigationBar: Container(
          decoration: BoxDecoration(
            color: Theme.of(context).brightness == Brightness.dark
                ? AppTheme.bgSurfaceDark
                : AppTheme.bgSurfaceLight,
            border: Border(
              top: BorderSide(
                color: Theme.of(context).brightness == Brightness.dark
                    ? AppTheme.borderDark
                    : AppTheme.borderLight,
              ),
            ),
          ),
          child: BottomNavigationBar(
            currentIndex: _currentIndex > 4 ? 4 : _currentIndex,
            elevation: 0,
            backgroundColor: Colors.transparent,
            selectedFontSize: 11,
            unselectedFontSize: 11,
            selectedItemColor: AppTheme.primary,
            unselectedItemColor: Theme.of(context).brightness == Brightness.dark
                ? AppTheme.textSecondaryDark
                : AppTheme.textSecondaryLight,
            onTap: (index) {
              if (index == 4) {
                _handleTabChange(8); // Profile screen is index 8
              } else {
                _handleTabChange(index);
              }
            },
            items: [
              BottomNavigationBarItem(
                icon: const Icon(Icons.home_outlined),
                activeIcon: const Icon(Icons.home_rounded),
                label: state.t('navHome'),
              ),
              BottomNavigationBarItem(
                icon: const Icon(Icons.swap_horiz_rounded),
                activeIcon: const Icon(Icons.swap_horiz_rounded, color: AppTheme.primary),
                label: state.t('navPayments'),
              ),
              BottomNavigationBarItem(
                icon: const Icon(Icons.receipt_long_outlined),
                activeIcon: const Icon(Icons.receipt_long, color: AppTheme.primary),
                label: state.t('navHistory'),
              ),
              BottomNavigationBarItem(
                icon: const Icon(Icons.track_changes_outlined),
                activeIcon: const Icon(Icons.track_changes, color: AppTheme.primary),
                label: state.t('navSavings'),
              ),
              BottomNavigationBarItem(
                icon: const Icon(Icons.person_outline_rounded),
                activeIcon: const Icon(Icons.person_rounded),
                label: state.t('navProfile'),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
