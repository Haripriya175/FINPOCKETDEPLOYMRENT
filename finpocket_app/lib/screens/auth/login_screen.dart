import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../../providers/app_state.dart';
import '../../theme/app_theme.dart';
import '../../config/app_config.dart';
import '../../services/security_auth_service.dart';
import '../../services/api_service.dart';
import '../../core/storage/secure_token_storage.dart';
import 'register_screen.dart';
import 'forgot_password_screen.dart';
import '../../widgets/auth/captcha_widget.dart';

class LoginScreen extends StatefulWidget {
  const LoginScreen({super.key});

  @override
  State<LoginScreen> createState() => _LoginScreenState();
}

class _LoginScreenState extends State<LoginScreen> {
  final _formKey = GlobalKey<FormState>();
  final _emailController = TextEditingController();
  final _passwordController = TextEditingController();
  final _captchaController = TextEditingController();
  final GlobalKey<CaptchaWidgetState> _captchaKey = GlobalKey<CaptchaWidgetState>();

  bool _obscurePassword = true;
  String? _localError;
  bool _biometricsAvailable = false;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (mounted) {
        Provider.of<AppState>(context, listen: false).clearAuthError();
      }
    });
    _checkBiometrics();
  }

  Future<void> _checkBiometrics() async {
    final available = await SecurityAuthService.isBiometricsAvailable();
    final pref = await SecureTokenStorage.getBiometricPreference();
    final hasStoredSession = await SecureTokenStorage.getCachedUser() != null || await SecureTokenStorage.getAccessToken() != null;
    if (mounted) {
      setState(() {
        _biometricsAvailable = available;
      });
      // If user has biometrics enabled and an enrolled session exists, auto-prompt biometric unlock
      if (available && pref && hasStoredSession) {
        Future.delayed(const Duration(milliseconds: 350), () {
          if (mounted) {
            _handleBiometricLogin();
          }
        });
      }
    }
  }

  @override
  void dispose() {
    _emailController.dispose();
    _passwordController.dispose();
    _captchaController.dispose();
    super.dispose();
  }

  void _showServerConfigDialog() {
    final ctrl = TextEditingController(text: AppConfig.customApiBaseUrl ?? AppConfig.apiBaseUrl);
    showDialog(
      context: context,
      builder: (ctx) => AlertDialog(
        backgroundColor: const Color(0xFF0F172A),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
        title: const Row(
          children: [
            Icon(Icons.dns_rounded, color: AppTheme.primary, size: 20),
            SizedBox(width: 8),
            Text('Server Connection', style: TextStyle(fontSize: 16, color: Colors.white, fontWeight: FontWeight.bold)),
          ],
        ),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Text(
              'Enter backend URL (e.g. your hosted domain, tunnel, or LAN IP for external/friend devices):',
              style: TextStyle(fontSize: 12, color: Color(0xFF94A3B8)),
            ),
            const SizedBox(height: 12),
            TextField(
              controller: ctrl,
              style: const TextStyle(fontSize: 13, color: Colors.white),
              decoration: InputDecoration(
                hintText: 'https://api.yourdomain.com/api/v1',
                hintStyle: const TextStyle(color: Colors.white38),
                filled: true,
                fillColor: const Color(0xFF1E293B),
                border: OutlineInputBorder(borderRadius: BorderRadius.circular(10)),
              ),
            ),
          ],
        ),
        actions: [
          TextButton(
            onPressed: () async {
              AppConfig.customApiBaseUrl = null;
              await SecureTokenStorage.saveCustomApiUrl('');
              if (ctx.mounted) Navigator.pop(ctx);
              setState(() {});
            },
            child: const Text('Reset Default', style: TextStyle(color: Colors.white70)),
          ),
          ElevatedButton(
            style: ElevatedButton.styleFrom(backgroundColor: AppTheme.primary),
            onPressed: () async {
              final url = ctrl.text.trim();
              if (url.isNotEmpty) {
                AppConfig.customApiBaseUrl = url.endsWith('/api/v1') ? url : '${url.replaceAll(RegExp(r'/+$'), '')}/api/v1';
                await SecureTokenStorage.saveCustomApiUrl(AppConfig.customApiBaseUrl!);
              }
              if (ctx.mounted) Navigator.pop(ctx);
              setState(() {});
            },
            child: const Text('Save & Connect', style: TextStyle(color: Colors.white)),
          ),
        ],
      ),
    );
  }

  Future<void> _handleLogin() async {
    setState(() {
      _localError = null;
    });

    if (!_formKey.currentState!.validate() || !(_captchaKey.currentState?.isValid ?? false)) {
      setState(() {
        _localError = 'Please solve the security captcha correctly.';
      });
      _captchaKey.currentState?.refreshCaptcha();
      return;
    }

    final state = Provider.of<AppState>(context, listen: false);
    final success = await state.login(
      _emailController.text.trim(),
      _passwordController.text,
    );

    if (!success && mounted) {
      _captchaKey.currentState?.refreshCaptcha();
      setState(() {
        _localError = state.authError ?? 'Login failed. Please check your credentials.';
      });
    }
  }

  Future<void> _handleBiometricLogin() async {
    setState(() {
      _localError = null;
    });

    final state = Provider.of<AppState>(context, listen: false);
    final success = await state.loginWithBiometrics();

    if (!success && mounted) {
      setState(() {
        _localError = state.authError ?? 'Biometric verification unsuccessful. Please enter your password.';
      });
    }
  }

  Future<void> _handleGoogleLogin({bool promptAccountChooser = false}) async {
    setState(() {
      _localError = null;
    });

    final state = Provider.of<AppState>(context, listen: false);
    final success = await state.loginWithGoogle(promptAccountChooser: promptAccountChooser);

    if (!success && mounted) {
      if (state.unlinkedEmailForLinking != null) {
        _showAccountTakeoverProtectionDialog(state.unlinkedEmailForLinking!);
      } else if (state.authError != null) {
        final err = state.authError!;
        if (err.contains('Google Cloud Console') ||
            err.contains('OAuth') ||
            err.contains('clientConfigurationError') ||
            err.contains('serverClientId') ||
            err.contains('requires an active OAuth') ||
            err.contains('GOOGLE_CLIENT_ID') ||
            err.contains('Google Sign-In is not configured') ||
            err.contains('Google token verification failed') ||
            err.toLowerCase().contains('google')) {
          _showGoogleSetupDialog(err);
        } else {
          setState(() {
            _localError = state.authError;
          });
        }
      }
    }
  }

  void _showGoogleSetupDialog(String details) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    showDialog(
      context: context,
      builder: (ctx) => AlertDialog(
        backgroundColor: isDark ? AppTheme.bgSurfaceDark : AppTheme.bgSurfaceLight,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(18)),
        title: const Row(
          children: [
            Icon(Icons.info_outline_rounded, color: Color(0xFF4285F4), size: 24),
            SizedBox(width: 10),
            Expanded(
              child: Text(
                'Google Sign-In Status',
                style: TextStyle(fontSize: 16, fontWeight: FontWeight.bold),
              ),
            ),
          ],
        ),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Text(
              'Google OAuth is currently being provisioned on the cloud server. You can sign in immediately using your Email & Password.',
              style: TextStyle(fontSize: 13, height: 1.4),
            ),
            const SizedBox(height: 12),
            Container(
              padding: const EdgeInsets.all(12),
              decoration: BoxDecoration(
                color: const Color(0xFF4285F4).withOpacity(0.08),
                borderRadius: BorderRadius.circular(10),
                border: Border.all(color: const Color(0xFF4285F4).withOpacity(0.25)),
              ),
              child: const Row(
                children: [
                  Icon(Icons.lock_open_rounded, color: Color(0xFF4285F4), size: 18),
                  SizedBox(width: 8),
                  Expanded(
                    child: Text(
                      'Your FinPocket account and all data are fully active and accessible with your credentials.',
                      style: TextStyle(fontSize: 11.5, height: 1.3),
                    ),
                  ),
                ],
              ),
            ),
          ],
        ),
        actions: [
          TextButton(
            onPressed: () {
              Navigator.pop(ctx);
              setState(() {
                _localError = null;
              });
              Provider.of<AppState>(context, listen: false).clearAuthError();
            },
            child: const Text('Dismiss', style: TextStyle(color: Colors.white60)),
          ),
          ElevatedButton(
            style: ElevatedButton.styleFrom(
              backgroundColor: AppTheme.primary,
              foregroundColor: Colors.white,
              shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
            ),
            onPressed: () {
              Navigator.pop(ctx);
              setState(() {
                _localError = null;
              });
              Provider.of<AppState>(context, listen: false).clearAuthError();
              FocusScope.of(context).requestFocus(FocusNode());
            },
            child: const Text('Use Email / Password'),
          ),
        ],
      ),
    );
  }

  void _showAccountTakeoverProtectionDialog(String email) {
    _emailController.text = email;
    final state = Provider.of<AppState>(context, listen: false);
    showDialog(
      context: context,
      builder: (ctx) => AlertDialog(
        backgroundColor: Theme.of(context).brightness == Brightness.dark
            ? AppTheme.bgSurfaceDark
            : AppTheme.bgSurfaceLight,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
        title: Row(
          children: [
            const Icon(Icons.shield_outlined, color: AppTheme.primary, size: 28),
            const SizedBox(width: 10),
            const Expanded(
              child: Text(
                'Security Verification Required',
                style: TextStyle(fontSize: 16, fontWeight: FontWeight.bold),
              ),
            ),
          ],
        ),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              'A FinPocket account with $email already exists with password authentication.',
              style: const TextStyle(fontSize: 13, height: 1.4),
            ),
            const SizedBox(height: 12),
            Container(
              padding: const EdgeInsets.all(12),
              decoration: BoxDecoration(
                color: Colors.amber.withOpacity(0.12),
                borderRadius: BorderRadius.circular(8),
                border: Border.all(color: Colors.amber.withOpacity(0.3)),
              ),
              child: const Row(
                children: [
                  Icon(Icons.info_outline, color: Colors.amber, size: 20),
                  SizedBox(width: 8),
                  Expanded(
                    child: Text(
                      'To prevent account takeover, please sign in with your password. You can then link Google securely in the Security Center.',
                      style: TextStyle(fontSize: 11, color: Colors.amber, height: 1.3),
                    ),
                  ),
                ],
              ),
            ),
          ],
        ),
        actions: [
          TextButton(
            onPressed: () {
              Navigator.pop(ctx);
              state.clearUnlinkedEmail();
            },
            child: const Text('Cancel'),
          ),
          ElevatedButton(
            style: ElevatedButton.styleFrom(
              backgroundColor: AppTheme.primary,
              foregroundColor: Colors.white,
            ),
            onPressed: () {
              Navigator.pop(ctx);
              state.clearUnlinkedEmail();
            },
            child: const Text('Enter Password'),
          ),
        ],
      ),
    );
  }

  Future<void> _handleSSOLogin(String provider) async {
    setState(() {
      _localError = null;
    });

    if (provider == 'google') {
      await _handleGoogleLogin();
      return;
    }

    final state = Provider.of<AppState>(context, listen: false);
    bool success = false;

    if (provider == 'facebook' || provider == 'meta') {
      success = await state.loginWithMeta();
    } else if (provider == 'apple') {
      success = await state.loginWithApple();
    }

    if (!success && mounted) {
      if (state.unlinkedEmailForLinking != null) {
        _showAccountTakeoverProtectionDialog(state.unlinkedEmailForLinking!);
      } else if (state.authError != null) {
        setState(() {
          _localError = state.authError;
        });
      }
    }
  }



  @override
  Widget build(BuildContext context) {
    final state = Provider.of<AppState>(context);
    final theme = Theme.of(context);
    final isDark = theme.brightness == Brightness.dark;

    return Scaffold(
      body: SafeArea(
        child: Center(
          child: SingleChildScrollView(
            padding: const EdgeInsets.symmetric(horizontal: 24.0, vertical: 16.0),
            child: Form(
              key: _formKey,
              child: Column(
                mainAxisAlignment: MainAxisAlignment.center,
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  Align(
                    alignment: Alignment.topRight,
                    child: IconButton(
                      icon: const Icon(Icons.settings_ethernet_rounded, size: 20, color: Color(0xFF64748B)),
                      tooltip: 'Server Connection Settings',
                      onPressed: _showServerConfigDialog,
                    ),
                  ),
                  // Web-aligned Logo & Header (Matches Web login.html .auth-logo)
                  Center(
                    child: Container(
                      width: 58,
                      height: 58,
                      decoration: BoxDecoration(
                        gradient: AppTheme.gradientPrimary,
                        borderRadius: BorderRadius.circular(14),
                        boxShadow: const [
                          BoxShadow(
                            color: Color(0x3314B8A6),
                            blurRadius: 16,
                            offset: Offset(0, 4),
                          ),
                        ],
                      ),
                      alignment: Alignment.center,
                      child: const Text('💰', style: TextStyle(fontSize: 28)),
                    ),
                  ),
                  const SizedBox(height: 18),

                  // Brand & Welcome
                  Center(
                    child: ShaderMask(
                      shaderCallback: (bounds) => AppTheme.gradientPrimary.createShader(bounds),
                      child: const Text(
                        'FinPocket',
                        style: TextStyle(
                          fontSize: 28,
                          fontWeight: FontWeight.w900,
                          color: Colors.white,
                          letterSpacing: -0.5,
                        ),
                      ),
                    ),
                  ),
                  const SizedBox(height: 6),
                  Text(
                    'Welcome Back',
                    textAlign: TextAlign.center,
                    style: TextStyle(
                      fontSize: 18,
                      fontWeight: FontWeight.w700,
                      color: isDark ? AppTheme.textPrimaryDark : AppTheme.textPrimaryLight,
                    ),
                  ),
                  const SizedBox(height: 4),
                  Text(
                    'Sign in to your FinPocket account',
                    textAlign: TextAlign.center,
                    style: TextStyle(
                      fontSize: 12,
                      color: isDark ? AppTheme.textSecondaryDark : AppTheme.textSecondaryLight,
                    ),
                  ),
                  const SizedBox(height: 24),

                  // Error Display Banner
                  if (_localError != null || state.authError != null) ...[
                    Container(
                      padding: const EdgeInsets.all(12),
                      decoration: BoxDecoration(
                        color: AppTheme.danger.withOpacity(0.12),
                        borderRadius: BorderRadius.circular(12),
                        border: Border.all(color: AppTheme.danger.withOpacity(0.3)),
                      ),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.stretch,
                        children: [
                          Row(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              const Padding(
                                padding: EdgeInsets.only(top: 2),
                                child: Icon(Icons.error_outline, color: AppTheme.danger, size: 20),
                              ),
                              const SizedBox(width: 10),
                              Expanded(
                                child: Text(
                                  _localError ?? state.authError ?? '',
                                  key: const Key('auth_error_text'),
                                  style: const TextStyle(
                                    color: AppTheme.danger,
                                    fontSize: 13,
                                    fontWeight: FontWeight.w500,
                                  ),
                                ),
                              ),
                              InkWell(
                                onTap: () {
                                  setState(() {
                                    _localError = null;
                                  });
                                  state.clearAuthError();
                                },
                                child: const Padding(
                                  padding: EdgeInsets.all(2.0),
                                  child: Icon(Icons.close, color: AppTheme.danger, size: 18),
                                ),
                              ),
                            ],
                          ),
                          if (!((_localError ?? state.authError ?? '').contains('GOOGLE_CLIENT_ID') ||
                                  (_localError ?? state.authError ?? '').contains('Google Sign-In') ||
                                  (_localError ?? state.authError ?? '').contains('OAuth')) &&
                              ((_localError ?? state.authError ?? '').toLowerCase().contains('server') ||
                                  (_localError ?? state.authError ?? '').toLowerCase().contains('connection'))) ...[
                            const SizedBox(height: 8),
                            InkWell(
                              onTap: () async {
                                setState(() {
                                  _localError = 'Connecting to 24/7 cloud server...';
                                });
                                await ApiService.discoverHost();
                                state.clearAuthError();
                                setState(() {
                                  _localError = null;
                                });
                                if (context.mounted) {
                                  ScaffoldMessenger.of(context).showSnackBar(
                                    const SnackBar(
                                      content: Text('Connected to FinPocket Cloud Backend!'),
                                      backgroundColor: Color(0xFF10B981),
                                      duration: Duration(seconds: 2),
                                    ),
                                  );
                                }
                              },
                              child: Container(
                                padding: const EdgeInsets.symmetric(vertical: 6, horizontal: 10),
                                decoration: BoxDecoration(
                                  color: AppTheme.primary.withOpacity(0.15),
                                  borderRadius: BorderRadius.circular(6),
                                  border: Border.all(color: AppTheme.primary.withOpacity(0.4)),
                                ),
                                child: const Row(
                                  mainAxisAlignment: MainAxisAlignment.center,
                                  children: [
                                    Icon(Icons.refresh_rounded, size: 16, color: AppTheme.primary),
                                    SizedBox(width: 6),
                                    Text(
                                      'Retry Cloud Connection',
                                      style: TextStyle(
                                        fontSize: 12,
                                        fontWeight: FontWeight.bold,
                                        color: AppTheme.primary,
                                      ),
                                    ),
                                  ],
                                ),
                              ),
                            ),
                          ],
                        ],
                      ),
                    ),
                    const SizedBox(height: 18),
                  ],

                  // Email Field
                  TextFormField(
                    key: const Key('login_email_field'),
                    controller: _emailController,
                    keyboardType: TextInputType.emailAddress,
                    textInputAction: TextInputAction.next,
                    autocorrect: false,
                    decoration: InputDecoration(
                      labelText: 'Email Address',
                      hintText: 'name@example.com',
                      prefixIcon: const Icon(Icons.email_outlined),
                      filled: true,
                      fillColor: isDark ? const Color(0xFF1E293B) : const Color(0xFFF8FAFC),
                      border: OutlineInputBorder(
                        borderRadius: BorderRadius.circular(14),
                        borderSide: BorderSide(
                          color: isDark ? const Color(0xFF334155) : const Color(0xFFE2E8F0),
                        ),
                      ),
                    ),
                    validator: (value) {
                      if (value == null || value.trim().isEmpty) {
                        return 'Please enter your email';
                      }
                      if (!RegExp(r'^[^@]+@[^@]+\.[^@]+').hasMatch(value.trim())) {
                        return 'Please enter a valid email address';
                      }
                      if (SecurityAuthService.isDisposableEmail(value.trim())) {
                        return 'Temporary/disposable emails are not permitted';
                      }
                      return null;
                    },
                  ),
                  const SizedBox(height: 16),

                  // Password Field
                  TextFormField(
                    key: const Key('login_password_field'),
                    controller: _passwordController,
                    obscureText: _obscurePassword,
                    textInputAction: TextInputAction.done,
                    onFieldSubmitted: (_) => _handleLogin(),
                    decoration: InputDecoration(
                      labelText: 'Password',
                      hintText: '••••••••',
                      prefixIcon: const Icon(Icons.lock_outline),
                      suffixIcon: IconButton(
                        icon: Icon(
                          _obscurePassword ? Icons.visibility_off : Icons.visibility,
                          color: isDark ? Colors.white60 : Colors.black45,
                        ),
                        onPressed: () {
                          setState(() {
                            _obscurePassword = !_obscurePassword;
                          });
                        },
                      ),
                      filled: true,
                      fillColor: isDark ? const Color(0xFF1E293B) : const Color(0xFFF8FAFC),
                      border: OutlineInputBorder(
                        borderRadius: BorderRadius.circular(14),
                        borderSide: BorderSide(
                          color: isDark ? const Color(0xFF334155) : const Color(0xFFE2E8F0),
                        ),
                      ),
                    ),
                    validator: (value) {
                      if (value == null || value.isEmpty) {
                        return 'Please enter your password';
                      }
                      return null;
                    },
                  ),
                  const SizedBox(height: 8),

                  // Forgot Password Link
                  Align(
                    alignment: Alignment.centerRight,
                    child: TextButton(
                      key: const Key('forgot_password_button'),
                      onPressed: state.isLoading
                          ? null
                          : () {
                              Navigator.of(context).push(
                                MaterialPageRoute(
                                  builder: (_) => const ForgotPasswordScreen(),
                                ),
                              );
                            },
                      child: const Text(
                        'Forgot Password?',
                        style: TextStyle(
                          color: AppTheme.primaryLight,
                          fontWeight: FontWeight.w600,
                          fontSize: 13,
                        ),
                      ),
                    ),
                  ),
                  const SizedBox(height: 16),

                  // Security Captcha Challenge
                  CaptchaWidget(
                    key: _captchaKey,
                    controller: _captchaController,
                  ),

                  const SizedBox(height: 18),

                  // Submit Login Button
                  ElevatedButton(
                    key: const Key('login_submit_button'),
                    onPressed: state.isLoading ? null : _handleLogin,
                    style: ElevatedButton.styleFrom(
                      backgroundColor: AppTheme.primary,
                      foregroundColor: Colors.white,
                      padding: const EdgeInsets.symmetric(vertical: 15),
                      shape: RoundedRectangleBorder(
                        borderRadius: BorderRadius.circular(14),
                      ),
                      elevation: 0,
                    ),
                    child: state.isLoading
                        ? const SizedBox(
                            height: 20,
                            width: 20,
                            child: CircularProgressIndicator(
                              strokeWidth: 2,
                              valueColor: AlwaysStoppedAnimation<Color>(Colors.white),
                            ),
                          )
                        : const Text(
                            'Login',
                            style: TextStyle(
                              fontSize: 16,
                              fontWeight: FontWeight.bold,
                            ),
                          ),
                  ),

                  // Biometric Authentication (User choice: Enter Password OR Scan Biometric)
                  if (_biometricsAvailable) ...[
                    const SizedBox(height: 12),
                    OutlinedButton.icon(
                      key: const Key('login_biometric_button'),
                      onPressed: state.isLoading ? null : _handleBiometricLogin,
                      icon: const Icon(Icons.fingerprint, color: AppTheme.primary, size: 24),
                      label: const Text(
                        'Unlock with Biometrics (Fingerprint / Face)',
                        style: TextStyle(
                          color: AppTheme.primary,
                          fontWeight: FontWeight.w600,
                          fontSize: 14,
                        ),
                      ),
                      style: OutlinedButton.styleFrom(
                        side: BorderSide(
                          color: AppTheme.primary.withOpacity(0.5),
                          width: 1.5,
                        ),
                        padding: const EdgeInsets.symmetric(vertical: 14),
                        shape: RoundedRectangleBorder(
                          borderRadius: BorderRadius.circular(14),
                        ),
                      ),
                    ),
                  ],

                  const SizedBox(height: 22),

                  // SSO Provider Section (Google, Apple, Facebook)
                  Row(
                    children: [
                      Expanded(child: Divider(color: isDark ? Colors.white12 : Colors.black12)),
                      Padding(
                        padding: const EdgeInsets.symmetric(horizontal: 10),
                        child: Text(
                          'Or sign in with',
                          style: TextStyle(
                            fontSize: 12,
                            color: isDark ? const Color(0xFF94A3B8) : const Color(0xFF64748B),
                            fontWeight: FontWeight.w500,
                          ),
                        ),
                      ),
                      Expanded(child: Divider(color: isDark ? Colors.white12 : Colors.black12)),
                    ],
                  ),
                  const SizedBox(height: 14),

                  // SSO Buttons Row
                  Row(
                    children: [
                      // Google SSO
                      Expanded(
                        child: OutlinedButton.icon(
                          key: const Key('sso_google_button'),
                          onPressed: state.isLoading ? null : () => _handleSSOLogin('google'),
                          icon: const Text('🇬', style: TextStyle(fontSize: 16)),
                          label: const Text('Google', style: TextStyle(fontSize: 12, fontWeight: FontWeight.w600)),
                          style: OutlinedButton.styleFrom(
                            padding: const EdgeInsets.symmetric(vertical: 11),
                            side: BorderSide(color: isDark ? const Color(0xFF334155) : const Color(0xFFE2E8F0)),
                            shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                          ),
                        ),
                      ),
                      const SizedBox(width: 8),

                      // Apple SSO
                      Expanded(
                        child: OutlinedButton.icon(
                          key: const Key('sso_apple_button'),
                          onPressed: state.isLoading ? null : () => _handleSSOLogin('apple'),
                          icon: const Icon(Icons.apple, size: 18),
                          label: const Text('Apple', style: TextStyle(fontSize: 12, fontWeight: FontWeight.w600)),
                          style: OutlinedButton.styleFrom(
                            padding: const EdgeInsets.symmetric(vertical: 11),
                            side: BorderSide(color: isDark ? const Color(0xFF334155) : const Color(0xFFE2E8F0)),
                            shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                          ),
                        ),
                      ),
                      const SizedBox(width: 8),

                      // Facebook SSO
                      Expanded(
                        child: OutlinedButton.icon(
                          key: const Key('sso_facebook_button'),
                          onPressed: state.isLoading ? null : () => _handleSSOLogin('facebook'),
                          icon: const Icon(Icons.facebook, color: Color(0xFF1877F2), size: 18),
                          label: const Text('Meta', style: TextStyle(fontSize: 12, fontWeight: FontWeight.w600)),
                          style: OutlinedButton.styleFrom(
                            padding: const EdgeInsets.symmetric(vertical: 11),
                            side: BorderSide(color: isDark ? const Color(0xFF334155) : const Color(0xFFE2E8F0)),
                            shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                          ),
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 20),

                  // Create Account Link
                  Row(
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: [
                      Text(
                        "Don't have an account? ",
                        style: TextStyle(
                          color: isDark ? const Color(0xFF94A3B8) : const Color(0xFF64748B),
                        ),
                      ),
                      GestureDetector(
                        key: const Key('go_to_register_button'),
                        onTap: state.isLoading
                            ? null
                            : () {
                                state.clearAuthError();
                                setState(() {
                                  _localError = null;
                                });
                                Navigator.of(context).push(
                                  MaterialPageRoute(
                                    builder: (_) => const RegisterScreen(),
                                  ),
                                );
                              },
                        child: const Text(
                          'Create Account',
                          style: TextStyle(
                            color: AppTheme.primary,
                            fontWeight: FontWeight.bold,
                          ),
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 16),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}
