import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../../providers/app_state.dart';
import '../../theme/app_theme.dart';
import '../../services/security_auth_service.dart';
import '../../widgets/auth/captcha_widget.dart';
import '../../widgets/auth/otp_verification_sheet.dart';

class RegisterScreen extends StatefulWidget {
  const RegisterScreen({super.key});

  @override
  State<RegisterScreen> createState() => _RegisterScreenState();
}

class _RegisterScreenState extends State<RegisterScreen> {
  final _formKey = GlobalKey<FormState>();
  final _nameController = TextEditingController();
  final _emailController = TextEditingController();
  final _phoneController = TextEditingController();
  final _passwordController = TextEditingController();
  final _confirmPasswordController = TextEditingController();
  final _captchaController = TextEditingController();
  final GlobalKey<CaptchaWidgetState> _captchaKey = GlobalKey<CaptchaWidgetState>();

  bool _obscurePassword = true;
  bool _obscureConfirmPassword = true;
  String? _localError;

  // Password Policy & Strength State
  PasswordValidationResult _passwordResult = SecurityAuthService.validatePassword('');

  // Phone Verification & Privacy State
  bool _isPhoneVerified = false;
  bool _isSendingOtp = false;

  // Real-time Email Verification State
  bool _isEmailValid = false;
  bool _isEmailVerified = false;
  bool _isSendingEmailOtp = false;
  String? _emailValidationNotice;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (mounted) {
        Provider.of<AppState>(context, listen: false).clearAuthError();
      }
    });
    _passwordController.addListener(_onPasswordChanged);
    _emailController.addListener(_onEmailChanged);
    _phoneController.addListener(_onPhoneChanged);
  }

  void _onPhoneChanged() {
    if (_isPhoneVerified) {
      setState(() {
        _isPhoneVerified = false;
      });
    }
  }

  void _onEmailChanged() {
    final email = _emailController.text.trim();
    if (_isEmailVerified) {
      setState(() {
        _isEmailVerified = false;
      });
    }
    if (email.isEmpty) {
      if (_isEmailValid || _emailValidationNotice != null) {
        setState(() {
          _isEmailValid = false;
          _emailValidationNotice = null;
        });
      }
      return;
    }
    final regex = RegExp(r'^[^@]+@[^@]+\.[^@]+');
    if (!regex.hasMatch(email)) {
      if (_isEmailValid || _emailValidationNotice != null) {
        setState(() {
          _isEmailValid = false;
          _emailValidationNotice = null;
        });
      }
      return;
    }
    if (SecurityAuthService.isDisposableEmail(email)) {
      setState(() {
        _isEmailValid = false;
        _emailValidationNotice = 'Disposable email domain detected. Please use a personal email.';
      });
      return;
    }
    setState(() {
      _isEmailValid = true;
      _emailValidationNotice = null;
    });
  }

  void _onPasswordChanged() {
    setState(() {
      _passwordResult = SecurityAuthService.validatePassword(
        _passwordController.text,
        name: _nameController.text,
        email: _emailController.text,
      );
    });
  }

  @override
  void dispose() {
    _passwordController.removeListener(_onPasswordChanged);
    _emailController.removeListener(_onEmailChanged);
    _phoneController.removeListener(_onPhoneChanged);
    _nameController.dispose();
    _emailController.dispose();
    _phoneController.dispose();
    _passwordController.dispose();
    _confirmPasswordController.dispose();
    _captchaController.dispose();
    super.dispose();
  }

  Future<void> _handleRegister() async {
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

    if (!_passwordResult.isValid) {
      setState(() {
        _localError = _passwordResult.errors.isNotEmpty
            ? _passwordResult.errors.first
            : 'Password does not meet the security policy requirements.';
      });
      return;
    }

    if (_passwordController.text != _confirmPasswordController.text) {
      setState(() {
        _localError = 'Passwords do not match';
      });
      return;
    }

    // Seamless guided verification flow:
    if (!_isEmailVerified) {
      final emailVerified = await _showEmailOtpModal();
      if (!emailVerified) {
        setState(() {
          _localError = 'Please verify your email address to complete registration.';
        });
        return;
      }
    }

    if (_phoneController.text.trim().isNotEmpty && !_isPhoneVerified) {
      final phoneVerified = await _showPhoneOtpModal();
      if (!mounted) return;
      if (!phoneVerified) {
        setState(() {
          _localError = 'Please verify your mobile phone number to complete registration.';
        });
        return;
      }
    }

    if (!mounted) return;
    final state = Provider.of<AppState>(context, listen: false);
    final nav = Navigator.of(context);
    final messenger = ScaffoldMessenger.of(context);

    final success = await state.register(
      _nameController.text.trim(),
      _emailController.text.trim(),
      _passwordController.text,
      phone: _phoneController.text.trim().isNotEmpty ? _phoneController.text.trim() : null,
    );

    if (!mounted) return;

    if (success) {
      await state.refreshVerificationStatus();
      if (!mounted) return;
      nav.popUntil((route) => route.isFirst);
      messenger.showSnackBar(
        const SnackBar(
          content: Text('Account verified and created successfully! Welcome to FinPocket.'),
          backgroundColor: AppTheme.success,
        ),
      );
    } else {
      _captchaKey.currentState?.refreshCaptcha();
      setState(() {
        _localError = state.authError ?? 'Registration failed. Please check your information.';
      });
    }
  }

  Future<void> _handleSSORegister(String provider) async {
    setState(() {
      _localError = null;
    });

    if (provider == 'google') {
      final state = Provider.of<AppState>(context, listen: false);
      final success = await state.loginWithGoogle(promptAccountChooser: true);

      if (success && mounted) {
        Navigator.of(context).popUntil((route) => route.isFirst);
      } else if (mounted) {
        if (state.unlinkedEmailForLinking != null) {
          _showAccountTakeoverProtectionDialog(state.unlinkedEmailForLinking!);
        } else if (state.authError != null) {
          final err = state.authError!;
          if (err.contains('Google Cloud Console') ||
              err.contains('OAuth') ||
              err.contains('clientConfigurationError') ||
              err.contains('serverClientId') ||
              err.contains('requires an active OAuth')) {
            _showGoogleSetupDialog(err);
          } else {
            setState(() {
              _localError = state.authError;
            });
          }
        }
      }
      return;
    }

    if (provider == 'apple') {
      _showOAuthRegisterSheet(
        providerTitle: 'Apple ID',
        providerKey: 'apple',
        iconHeader: const Icon(Icons.apple, size: 30),
        defaultDomainHint: '@icloud.com or Apple ID email',
      );
      return;
    }

    if (provider == 'facebook') {
      _showOAuthRegisterSheet(
        providerTitle: 'Meta Account',
        providerKey: 'facebook',
        iconHeader: const Icon(Icons.facebook, color: Color(0xFF1877F2), size: 30),
        defaultDomainHint: 'Legitimate email linked to Meta',
      );
      return;
    }
  }

  void _showGoogleSetupDialog(String details) {
    showDialog(
      context: context,
      builder: (ctx) => AlertDialog(
        backgroundColor: Theme.of(context).brightness == Brightness.dark
            ? AppTheme.bgSurfaceDark
            : AppTheme.bgSurfaceLight,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
        title: const Row(
          children: [
            Icon(Icons.info_outline, color: Color(0xFF4285F4), size: 24),
            SizedBox(width: 10),
            Expanded(
              child: Text(
                'Google Sign-In Notice',
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
              'Native Google Sign-In requires your Google Cloud OAuth Client ID and debug SHA-1 fingerprint to be registered for this device build.',
              style: TextStyle(fontSize: 13, height: 1.4),
            ),
            const SizedBox(height: 12),
            Container(
              padding: const EdgeInsets.all(12),
              decoration: BoxDecoration(
                color: const Color(0xFF4285F4).withOpacity(0.08),
                borderRadius: BorderRadius.circular(8),
                border: Border.all(color: const Color(0xFF4285F4).withOpacity(0.25)),
              ),
              child: const Text(
                'Please complete registration with your legitimate Email & Password.',
                style: TextStyle(fontSize: 12, height: 1.3),
              ),
            ),
          ],
        ),
        actions: [
          ElevatedButton(
            style: ElevatedButton.styleFrom(
              backgroundColor: AppTheme.primary,
              foregroundColor: Colors.white,
            ),
            onPressed: () => Navigator.pop(ctx),
            child: const Text('OK'),
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
              Navigator.of(context).pop(); // Go back to login screen
            },
            child: const Text('Go to Login'),
          ),
        ],
      ),
    );
  }

  void _showOAuthRegisterSheet({
    required String providerTitle,
    required String providerKey,
    required Widget iconHeader,
    required String defaultDomainHint,
  }) {
    final emailCtrl = TextEditingController(text: _emailController.text.trim());
    final nameCtrl = TextEditingController(text: _nameController.text.trim());

    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      backgroundColor: Theme.of(context).scaffoldBackgroundColor,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
      ),
      builder: (ctx) {
        String? sheetError;
        bool isSubmitting = false;

        return StatefulBuilder(
          builder: (context, setSheetState) {
            return Padding(
              padding: EdgeInsets.only(
                left: 24,
                right: 24,
                top: 24,
                bottom: MediaQuery.of(context).viewInsets.bottom + 24,
              ),
              child: Column(
                mainAxisSize: MainAxisSize.min,
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  Row(
                    children: [
                      iconHeader,
                      const SizedBox(width: 12),
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(
                              'Register with $providerTitle',
                              style: const TextStyle(fontSize: 18, fontWeight: FontWeight.bold),
                            ),
                            const Text(
                              'Trusted Identity Provider Onboarding',
                              style: TextStyle(fontSize: 11, color: Colors.grey),
                            ),
                          ],
                        ),
                      ),
                      IconButton(
                        icon: const Icon(Icons.close),
                        onPressed: () => Navigator.pop(context),
                      ),
                    ],
                  ),
                  const SizedBox(height: 12),
                  Text(
                    'FinPocket will verify and link your identity through $providerTitle. Please confirm your personal email address.',
                    style: const TextStyle(fontSize: 12, color: Colors.grey),
                  ),
                  const SizedBox(height: 16),
                  TextField(
                    controller: emailCtrl,
                    keyboardType: TextInputType.emailAddress,
                    autofocus: true,
                    decoration: InputDecoration(
                      labelText: 'Your $providerTitle Email Address',
                      hintText: 'yourname$defaultDomainHint',
                      prefixIcon: const Icon(Icons.email_outlined),
                      border: OutlineInputBorder(borderRadius: BorderRadius.circular(12)),
                    ),
                  ),
                  const SizedBox(height: 12),
                  TextField(
                    controller: nameCtrl,
                    textCapitalization: TextCapitalization.words,
                    decoration: InputDecoration(
                      labelText: 'Your Full Name',
                      hintText: 'As registered on your $providerTitle account',
                      prefixIcon: const Icon(Icons.person_outline),
                      border: OutlineInputBorder(borderRadius: BorderRadius.circular(12)),
                    ),
                  ),
                  if (sheetError != null) ...[
                    const SizedBox(height: 10),
                    Text(
                      sheetError!,
                      style: const TextStyle(color: Colors.red, fontSize: 12),
                      textAlign: TextAlign.center,
                    ),
                  ],
                  const SizedBox(height: 16),
                  ElevatedButton(
                    onPressed: isSubmitting
                        ? null
                        : () async {
                            final email = emailCtrl.text.trim().toLowerCase();
                            final name = nameCtrl.text.trim();

                            if (email.isEmpty || !RegExp(r'^[^@]+@[^@]+\.[^@]+').hasMatch(email)) {
                              setSheetState(() {
                                sheetError = 'Please enter a valid $providerTitle email address.';
                              });
                              return;
                            }

                            if (SecurityAuthService.isDisposableEmail(email)) {
                              setSheetState(() {
                                sheetError = 'Disposable/temporary emails are not permitted.';
                              });
                              return;
                            }

                            setSheetState(() {
                              isSubmitting = true;
                              sheetError = null;
                            });

                            final state = Provider.of<AppState>(context, listen: false);
                            final success = await state.loginWithSSO(
                              providerKey,
                              email: email,
                              name: name.isNotEmpty ? name : null,
                            );

                            if (success) {
                              if (context.mounted) {
                                Navigator.pop(context); // close sheet
                                Navigator.of(context).popUntil((route) => route.isFirst);
                              }
                            } else {
                              setSheetState(() {
                                isSubmitting = false;
                                sheetError = state.authError ?? 'Registration failed.';
                              });
                            }
                          },
                    style: ElevatedButton.styleFrom(
                      backgroundColor: AppTheme.primary,
                      padding: const EdgeInsets.symmetric(vertical: 14),
                      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                    ),
                    child: isSubmitting
                        ? const SizedBox(height: 20, width: 20, child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white))
                        : Text('Confirm & Join with $providerTitle', style: const TextStyle(color: Colors.white, fontWeight: FontWeight.bold)),
                  ),
                ],
              ),
            );
          },
        );
      },
    );
  }


  Future<bool> _showEmailOtpModal() async {
    final email = _emailController.text.trim();
    if (email.isEmpty || !RegExp(r'^[^@]+@[^@]+\.[^@]+').hasMatch(email)) {
      setState(() {
        _localError = 'Please enter a valid email address before requesting OTP.';
      });
      return false;
    }
    if (SecurityAuthService.isDisposableEmail(email)) {
      setState(() {
        _localError = 'Temporary/disposable email domains are not permitted.';
      });
      return false;
    }

    final state = Provider.of<AppState>(context, listen: false);
    state.clearAuthError();
    setState(() {
      _isSendingEmailOtp = true;
      _localError = null;
    });

    final sendRes = await SecurityAuthService.sendEmailOtp(email);
    if (!mounted) return false;
    setState(() {
      _isSendingEmailOtp = false;
    });

    if (sendRes['success'] != true) {
      setState(() {
        _localError = sendRes['error'] ?? 'Unable to send verification code to email.';
      });
      return false;
    }

    final cooldown = (sendRes['resendCooldownSeconds'] as int?) ?? 30;

    final verified = await OtpVerificationSheet.show(
      context: context,
      type: OtpVerificationType.email,
      destination: email,
      initialCooldownSeconds: cooldown,
    );

    if (verified == true && mounted) {
      setState(() {
        _isEmailVerified = true;
        _localError = null;
      });
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('Email address verified successfully!'),
          backgroundColor: AppTheme.success,
        ),
      );
      return true;
    }
    return false;
  }

  Future<bool> _showPhoneOtpModal() async {
    final phone = _phoneController.text.trim();
    final phoneValidation = SecurityAuthService.normalizeIndianPhone(phone);
    if (!phoneValidation.isValid) {
      setState(() {
        _localError = phoneValidation.error ?? 'Please enter a valid 10-digit Indian mobile number.';
      });
      return false;
    }

    final cleanPhone = phoneValidation.normalized!;
    final state = Provider.of<AppState>(context, listen: false);
    state.clearAuthError();
    setState(() {
      _isSendingOtp = true;
      _localError = null;
    });

    final sendRes = await SecurityAuthService.sendPhoneOtp(cleanPhone);
    if (!mounted) return false;
    setState(() {
      _isSendingOtp = false;
    });

    if (sendRes['success'] != true) {
      setState(() {
        _localError = sendRes['error'] ?? 'Unable to send verification SMS.';
      });
      return false;
    }

    final masked = sendRes['maskedPhone'] as String? ?? SecurityAuthService.maskPhone(cleanPhone);
    final cooldown = (sendRes['resendCooldownSeconds'] as int?) ?? 30;

    final verified = await OtpVerificationSheet.show(
      context: context,
      type: OtpVerificationType.phone,
      destination: cleanPhone,
      maskedDestination: masked,
      initialCooldownSeconds: cooldown,
    );

    if (verified == true && mounted) {
      setState(() {
        _isPhoneVerified = true;
        _localError = null;
      });
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('Mobile phone number verified successfully!'),
          backgroundColor: AppTheme.success,
        ),
      );
      return true;
    }
    return false;
  }

  Color _getStrengthColor(int score) {
    switch (score) {
      case 4:
        return AppTheme.success;
      case 3:
        return AppTheme.accentBlue;
      case 2:
        return Colors.orange;
      default:
        return AppTheme.danger;
    }
  }

  Widget _buildCheckItem(String label, bool isMet) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 2.0),
      child: Row(
        children: [
          Icon(
            isMet ? Icons.check_circle_rounded : Icons.radio_button_unchecked,
            size: 14,
            color: isMet ? AppTheme.success : Colors.grey,
          ),
          const SizedBox(width: 6),
          Text(
            label,
            style: TextStyle(
              fontSize: 11,
              color: isMet ? AppTheme.success : Colors.grey,
              fontWeight: isMet ? FontWeight.w600 : FontWeight.normal,
            ),
          ),
        ],
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final state = Provider.of<AppState>(context);
    final theme = Theme.of(context);
    final isDark = theme.brightness == Brightness.dark;

    return Scaffold(
      appBar: AppBar(
        title: const Text('Create Account'),
        leading: IconButton(
          icon: const Icon(Icons.arrow_back),
          onPressed: () => Navigator.of(context).pop(),
        ),
      ),
      body: SafeArea(
        child: SingleChildScrollView(
          padding: const EdgeInsets.symmetric(horizontal: 24.0, vertical: 8.0),
          child: Form(
            key: _formKey,
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Row(
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: [
                    Container(
                      width: 32,
                      height: 32,
                      decoration: BoxDecoration(
                        gradient: AppTheme.gradientPrimary,
                        borderRadius: BorderRadius.circular(8),
                      ),
                      alignment: Alignment.center,
                      child: const Text('💰', style: TextStyle(fontSize: 18)),
                    ),
                    const SizedBox(width: 8),
                    ShaderMask(
                      shaderCallback: (bounds) => AppTheme.gradientPrimary.createShader(bounds),
                      child: const Text(
                        'FinPocket',
                        style: TextStyle(
                          fontSize: 22,
                          fontWeight: FontWeight.w900,
                          color: Colors.white,
                        ),
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 8),
                Text(
                  'Join FinPocket',
                  style: theme.textTheme.headlineSmall?.copyWith(
                    fontWeight: FontWeight.bold,
                    fontSize: 20,
                  ),
                ),
                const SizedBox(height: 4),
                Text(
                  'Bank-grade authentication with real-time privacy masking and safe-to-spend tracking.',
                  style: TextStyle(
                    color: isDark ? const Color(0xFF94A3B8) : const Color(0xFF64748B),
                    fontSize: 12,
                  ),
                ),
                const SizedBox(height: 14),

                // Error Banner
                if (_localError != null || state.authError != null) ...[
                  Container(
                    padding: const EdgeInsets.all(12),
                    decoration: BoxDecoration(
                      color: AppTheme.danger.withOpacity(0.12),
                      borderRadius: BorderRadius.circular(12),
                      border: Border.all(color: AppTheme.danger.withOpacity(0.3)),
                    ),
                    child: Row(
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
                            key: const Key('register_error_text'),
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
                  ),
                  const SizedBox(height: 14),
                ],

                // Full Name
                TextFormField(
                  key: const Key('register_name_field'),
                  controller: _nameController,
                  textCapitalization: TextCapitalization.words,
                  textInputAction: TextInputAction.next,
                  decoration: InputDecoration(
                    labelText: 'Full Name',
                    hintText: 'John Doe',
                    prefixIcon: const Icon(Icons.person_outline),
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
                      return 'Please enter your full name';
                    }
                    return null;
                  },
                ),
                const SizedBox(height: 12),

                // Email Address (With Disposable Email Enforcement)
                TextFormField(
                  key: const Key('register_email_field'),
                  controller: _emailController,
                  keyboardType: TextInputType.emailAddress,
                  textInputAction: TextInputAction.next,
                  autocorrect: false,
                  decoration: InputDecoration(
                    labelText: 'Legitimate Email Address',
                    hintText: 'name@gmail.com',
                    prefixIcon: const Icon(Icons.email_outlined),
                    suffixIcon: _isEmailVerified
                        ? const Padding(
                            padding: EdgeInsets.symmetric(horizontal: 12),
                            child: Row(
                              mainAxisSize: MainAxisSize.min,
                              children: [
                                Icon(Icons.check_circle_rounded, color: AppTheme.success, size: 18),
                                SizedBox(width: 4),
                                Text('Verified', style: TextStyle(color: AppTheme.success, fontWeight: FontWeight.bold, fontSize: 12)),
                              ],
                            ),
                          )
                        : TextButton(
                            onPressed: _isSendingEmailOtp ? null : _showEmailOtpModal,
                            child: _isSendingEmailOtp
                                ? const SizedBox(height: 14, width: 14, child: CircularProgressIndicator(strokeWidth: 2))
                                : const Text('Send OTP', style: TextStyle(color: AppTheme.primary, fontWeight: FontWeight.bold, fontSize: 12)),
                          ),
                    helperText: _emailValidationNotice ?? 'Temporary/throwaway emails are strictly rejected.',
                    helperStyle: TextStyle(
                      fontSize: 11,
                      color: _emailValidationNotice != null ? AppTheme.danger : null,
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
                    if (value == null || value.trim().isEmpty) {
                      return 'Please enter your email';
                    }
                    if (!RegExp(r'^[^@]+@[^@]+\.[^@]+').hasMatch(value.trim())) {
                      return 'Please enter a valid email address';
                    }
                    if (SecurityAuthService.isDisposableEmail(value.trim())) {
                      return 'Temporary/disposable email domains are not allowed.';
                    }
                    return null;
                  },
                ),
                const SizedBox(height: 12),

                // Phone Number with OTP Verification & Privacy Masking
                TextFormField(
                  key: const Key('register_phone_field'),
                  controller: _phoneController,
                  keyboardType: TextInputType.phone,
                  textInputAction: TextInputAction.next,
                  decoration: InputDecoration(
                    labelText: 'Mobile Phone Number',
                    hintText: '+91 98765 43210',
                    prefixIcon: const Icon(Icons.phone_outlined),
                    suffixIcon: _isPhoneVerified
                        ? const Padding(
                            padding: EdgeInsets.symmetric(horizontal: 12),
                            child: Row(
                              mainAxisSize: MainAxisSize.min,
                              children: [
                                Icon(Icons.verified, color: AppTheme.success, size: 18),
                                SizedBox(width: 4),
                                Text('Verified', style: TextStyle(color: AppTheme.success, fontWeight: FontWeight.bold, fontSize: 12)),
                              ],
                            ),
                          )
                        : TextButton(
                            onPressed: _isSendingOtp ? null : _showPhoneOtpModal,
                            child: _isSendingOtp
                                ? const SizedBox(height: 14, width: 14, child: CircularProgressIndicator(strokeWidth: 2))
                                : const Text('Send OTP', style: TextStyle(color: AppTheme.primary, fontWeight: FontWeight.bold, fontSize: 12)),
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
                    if (value != null && value.trim().isNotEmpty) {
                      final valResult = SecurityAuthService.normalizeIndianPhone(value);
                      if (!valResult.isValid) {
                        return valResult.error;
                      }
                    }
                    return null;
                  },
                ),
                const SizedBox(height: 4),

                // Privacy Shield Banner
                Row(
                  children: [
                    const Icon(Icons.shield_outlined, size: 13, color: AppTheme.primaryLight),
                    const SizedBox(width: 5),
                    Expanded(
                      child: Text(
                        'Privacy Shield: Phone numbers & usernames are masked (${_phoneController.text.isNotEmpty ? SecurityAuthService.maskPhone(_phoneController.text) : '+91 98*** *****'}).',
                        style: const TextStyle(fontSize: 11, color: Colors.grey),
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 12),

                // Strong Password Field
                TextFormField(
                  key: const Key('register_password_field'),
                  controller: _passwordController,
                  obscureText: _obscurePassword,
                  textInputAction: TextInputAction.next,
                  decoration: InputDecoration(
                    labelText: 'Strong Password',
                    hintText: 'Min. 8 characters with Upper, Number, Symbol',
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
                      return 'Please create a strong password';
                    }
                    if (!_passwordResult.isValid) {
                      return _passwordResult.errors.isNotEmpty ? _passwordResult.errors.first : 'Password policy not satisfied';
                    }
                    return null;
                  },
                ),

                // Live Password Strength Meter & Policy Checklist
                if (_passwordController.text.isNotEmpty) ...[
                  const SizedBox(height: 8),
                  Row(
                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                    children: [
                      const Text('Security Strength:', style: TextStyle(fontSize: 11, color: Colors.grey)),
                      Text(
                        _passwordResult.strengthLabel,
                        style: TextStyle(
                          fontSize: 12,
                          fontWeight: FontWeight.bold,
                          color: _getStrengthColor(_passwordResult.score),
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 4),
                  ClipRRect(
                    borderRadius: BorderRadius.circular(4),
                    child: LinearProgressIndicator(
                      value: (_passwordResult.score / 4.0).clamp(0.1, 1.0),
                      backgroundColor: isDark ? const Color(0xFF334155) : const Color(0xFFE2E8F0),
                      valueColor: AlwaysStoppedAnimation<Color>(_getStrengthColor(_passwordResult.score)),
                      minHeight: 5,
                    ),
                  ),
                  const SizedBox(height: 6),
                  Wrap(
                    spacing: 12,
                    children: [
                      _buildCheckItem('8+ Chars', _passwordResult.hasMinLength),
                      _buildCheckItem('Uppercase (A-Z)', _passwordResult.hasUpper),
                      _buildCheckItem('Lowercase (a-z)', _passwordResult.hasLower),
                      _buildCheckItem('Number (0-9)', _passwordResult.hasDigit),
                      _buildCheckItem('Symbol (!@#)', _passwordResult.hasSpecial),
                    ],
                  ),
                ],
                const SizedBox(height: 12),

                // Confirm Password
                TextFormField(
                  key: const Key('register_confirm_password_field'),
                  controller: _confirmPasswordController,
                  obscureText: _obscureConfirmPassword,
                  textInputAction: TextInputAction.done,
                  onFieldSubmitted: (_) => _handleRegister(),
                  decoration: InputDecoration(
                    labelText: 'Confirm Password',
                    hintText: 'Repeat strong password',
                    prefixIcon: const Icon(Icons.lock_outline),
                    suffixIcon: IconButton(
                      icon: Icon(
                        _obscureConfirmPassword ? Icons.visibility_off : Icons.visibility,
                        color: isDark ? Colors.white60 : Colors.black45,
                      ),
                      onPressed: () {
                        setState(() {
                          _obscureConfirmPassword = !_obscureConfirmPassword;
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
                      return 'Please confirm your password';
                    }
                    if (value != _passwordController.text) {
                      return 'Passwords do not match';
                    }
                    return null;
                  },
                ),
                const SizedBox(height: 16),

                // Security Captcha Challenge
                CaptchaWidget(
                  key: _captchaKey,
                  controller: _captchaController,
                ),
                const SizedBox(height: 20),

                // Submit Button
                ElevatedButton(
                  key: const Key('register_submit_button'),
                  onPressed: state.isLoading ? null : _handleRegister,
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
                          'Create Secure Account',
                          style: TextStyle(
                            fontSize: 16,
                            fontWeight: FontWeight.bold,
                          ),
                        ),
                ),
                const SizedBox(height: 18),

                // SSO Registration Options (Google / Apple / Meta)
                Row(
                  children: [
                    Expanded(child: Divider(color: isDark ? Colors.white12 : Colors.black12)),
                    Padding(
                      padding: const EdgeInsets.symmetric(horizontal: 10),
                      child: Text(
                        'Or register with',
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
                const SizedBox(height: 12),
                Row(
                  children: [
                    Expanded(
                      child: OutlinedButton.icon(
                        onPressed: state.isLoading ? null : () => _handleSSORegister('google'),
                        icon: const Text('🇬', style: TextStyle(fontSize: 16)),
                        label: const Text('Google', style: TextStyle(fontSize: 12, fontWeight: FontWeight.w600)),
                        style: OutlinedButton.styleFrom(
                          padding: const EdgeInsets.symmetric(vertical: 10),
                          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                        ),
                      ),
                    ),
                    const SizedBox(width: 8),
                    Expanded(
                      child: OutlinedButton.icon(
                        onPressed: state.isLoading ? null : () => _handleSSORegister('apple'),
                        icon: const Icon(Icons.apple, size: 18),
                        label: const Text('Apple', style: TextStyle(fontSize: 12, fontWeight: FontWeight.w600)),
                        style: OutlinedButton.styleFrom(
                          padding: const EdgeInsets.symmetric(vertical: 10),
                          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                        ),
                      ),
                    ),
                    const SizedBox(width: 8),
                    Expanded(
                      child: OutlinedButton.icon(
                        onPressed: state.isLoading ? null : () => _handleSSORegister('facebook'),
                        icon: const Icon(Icons.facebook, color: Color(0xFF1877F2), size: 18),
                        label: const Text('Meta', style: TextStyle(fontSize: 12, fontWeight: FontWeight.w600)),
                        style: OutlinedButton.styleFrom(
                          padding: const EdgeInsets.symmetric(vertical: 10),
                          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                        ),
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 18),

                // Back to Login
                Row(
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: [
                    Text(
                      'Already have an account? ',
                      style: TextStyle(
                        color: isDark ? const Color(0xFF94A3B8) : const Color(0xFF64748B),
                      ),
                    ),
                    GestureDetector(
                      key: const Key('go_to_login_button'),
                      onTap: () => Navigator.of(context).pop(),
                      child: const Text(
                        'Login',
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
    );
  }
}
