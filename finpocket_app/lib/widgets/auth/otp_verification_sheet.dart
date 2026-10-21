import 'dart:async';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import '../../theme/app_theme.dart';
import '../../services/security_auth_service.dart';

enum OtpVerificationType {
  email,
  phone,
}

class OtpVerificationSheet extends StatefulWidget {
  final OtpVerificationType type;
  final String destination;
  final String? maskedDestination;
  final int initialCooldownSeconds;
  final String? userId;

  const OtpVerificationSheet({
    super.key,
    required this.type,
    required this.destination,
    this.maskedDestination,
    this.initialCooldownSeconds = 30,
    this.userId,
  });

  static Future<bool?> show({
    required BuildContext context,
    required OtpVerificationType type,
    required String destination,
    String? maskedDestination,
    int initialCooldownSeconds = 30,
    String? userId,
  }) {
    return showModalBottomSheet<bool>(
      context: context,
      isScrollControlled: true,
      backgroundColor: Theme.of(context).scaffoldBackgroundColor,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(24)),
      ),
      builder: (ctx) => OtpVerificationSheet(
        type: type,
        destination: destination,
        maskedDestination: maskedDestination,
        initialCooldownSeconds: initialCooldownSeconds,
        userId: userId,
      ),
    );
  }

  @override
  State<OtpVerificationSheet> createState() => _OtpVerificationSheetState();
}

class _OtpVerificationSheetState extends State<OtpVerificationSheet> {
  final TextEditingController _otpController = TextEditingController();
  final FocusNode _focusNode = FocusNode();

  Timer? _countdownTimer;
  late int _resendSeconds;
  bool _isVerifying = false;
  bool _isResending = false;
  String? _errorMessage;
  int? _remainingAttempts;

  @override
  void initState() {
    super.initState();
    _resendSeconds = widget.initialCooldownSeconds > 0 ? widget.initialCooldownSeconds : 30;
    _startCountdown();
  }

  void _startCountdown() {
    _countdownTimer?.cancel();
    if (_resendSeconds <= 0) return;

    _countdownTimer = Timer.periodic(const Duration(seconds: 1), (timer) {
      if (!mounted) {
        timer.cancel();
        return;
      }
      setState(() {
        if (_resendSeconds > 1) {
          _resendSeconds--;
        } else {
          _resendSeconds = 0;
          timer.cancel();
        }
      });
    });
  }

  @override
  void dispose() {
    _countdownTimer?.cancel();
    _otpController.dispose();
    _focusNode.dispose();
    super.dispose();
  }

  Future<void> _handleVerify() async {
    final code = _otpController.text.trim();
    if (code.length != 6) {
      setState(() {
        _errorMessage = 'Please enter the complete 6-digit code.';
      });
      return;
    }

    if (_isVerifying) return; // Prevent duplicate submissions

    setState(() {
      _isVerifying = true;
      _errorMessage = null;
    });

    try {
      final Map<String, dynamic> result;
      if (widget.type == OtpVerificationType.email) {
        result = await SecurityAuthService.verifyEmailOtp(widget.destination, code);
      } else {
        result = await SecurityAuthService.verifyPhoneOtp(
          widget.destination,
          code,
          userId: widget.userId,
        );
      }

      if (!mounted) return;

      if (result['success'] == true && result['verified'] == true) {
        Navigator.of(context).pop(true);
      } else {
        setState(() {
          _isVerifying = false;
          _remainingAttempts = result['remainingAttempts'] as int?;
          final rawError = result['error'] as String? ?? 'Invalid verification code.';
          if (_remainingAttempts != null && _remainingAttempts! > 0) {
            _errorMessage = '$rawError ($_remainingAttempts ${_remainingAttempts == 1 ? "attempt" : "attempts"} remaining)';
          } else {
            _errorMessage = rawError;
          }
        });
      }
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _isVerifying = false;
        _errorMessage = 'Network timeout. Please check your connection and retry.';
      });
    }
  }

  Future<void> _handleResend() async {
    if (_resendSeconds > 0 || _isResending || _isVerifying) return;

    setState(() {
      _isResending = true;
      _errorMessage = null;
    });

    try {
      final Map<String, dynamic> result;
      if (widget.type == OtpVerificationType.email) {
        result = await SecurityAuthService.resendOtp(
          destination: widget.destination,
          type: 'EMAIL',
          purpose: 'REGISTRATION_EMAIL',
        );
      } else {
        result = await SecurityAuthService.resendOtp(
          destination: widget.destination,
          type: 'PHONE',
          purpose: widget.userId != null ? 'UPDATE_PHONE' : 'REGISTRATION_PHONE',
        );
      }

      if (!mounted) return;

      setState(() {
        _isResending = false;
      });

      if (result['success'] == true) {
        final cooldown = (result['resendCooldownSeconds'] as int?) ?? 30;
        setState(() {
          _resendSeconds = cooldown;
          _remainingAttempts = null;
          _errorMessage = null;
        });
        _startCountdown();

        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(result['message'] as String? ?? 'Verification code sent successfully.'),
            backgroundColor: AppTheme.success,
            duration: const Duration(seconds: 3),
          ),
        );
      } else {
        final retryAfter = result['retryAfterSeconds'] as int?;
        if (retryAfter != null && retryAfter > 0) {
          setState(() {
            _resendSeconds = retryAfter;
          });
          _startCountdown();
        }
        setState(() {
          _errorMessage = result['error'] as String? ?? 'Unable to resend verification code. Please wait.';
        });
      }
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _isResending = false;
        _errorMessage = 'Network error while requesting code. Please retry.';
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final isEmail = widget.type == OtpVerificationType.email;
    final displayDestination = widget.maskedDestination ??
        (isEmail ? widget.destination : SecurityAuthService.maskPhone(widget.destination));

    final title = isEmail ? 'Email Verification' : 'Mobile Phone Verification';
    final icon = isEmail ? Icons.mark_email_read_outlined : Icons.sms_outlined;

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
          // Header Bar
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Row(
                children: [
                  Container(
                    padding: const EdgeInsets.all(8),
                    decoration: BoxDecoration(
                      color: AppTheme.primary.withOpacity(0.12),
                      borderRadius: BorderRadius.circular(10),
                    ),
                    child: Icon(icon, color: AppTheme.primary, size: 22),
                  ),
                  const SizedBox(width: 12),
                  Text(
                    title,
                    style: const TextStyle(fontSize: 18, fontWeight: FontWeight.bold),
                  ),
                ],
              ),
              IconButton(
                key: const Key('otp_close_button'),
                icon: const Icon(Icons.close),
                onPressed: () => Navigator.of(context).pop(false),
              ),
            ],
          ),
          const SizedBox(height: 12),

          // Informational Subtitle
          Text.rich(
            TextSpan(
              style: TextStyle(
                fontSize: 13,
                color: isDark ? Colors.grey[400] : Colors.grey[700],
                height: 1.4,
              ),
              children: [
                const TextSpan(text: 'Please enter the 6-digit verification code sent to '),
                TextSpan(
                  text: displayDestination,
                  style: const TextStyle(fontWeight: FontWeight.bold),
                ),
                const TextSpan(text: '. Codes expire in 5–10 minutes.'),
              ],
            ),
          ),

          const SizedBox(height: 20),

          // 6-Digit OTP Field
          TextField(
            key: const Key('otp_input_field'),
            controller: _otpController,
            focusNode: _focusNode,
            autofocus: true,
            enabled: !_isVerifying,
            keyboardType: TextInputType.number,
            inputFormatters: [
              FilteringTextInputFormatter.digitsOnly,
              LengthLimitingTextInputFormatter(6),
            ],
            textAlign: TextAlign.center,
            style: const TextStyle(
              fontSize: 26,
              letterSpacing: 12,
              fontWeight: FontWeight.bold,
            ),
            decoration: InputDecoration(
              hintText: '••••••',
              counterText: '',
              hintStyle: TextStyle(
                letterSpacing: 12,
                color: isDark ? Colors.grey[600] : Colors.grey[400],
              ),
              filled: true,
              fillColor: isDark ? const Color(0xFF1E293B) : const Color(0xFFF1F5F9),
              border: OutlineInputBorder(
                borderRadius: BorderRadius.circular(14),
                borderSide: BorderSide(
                  color: isDark ? const Color(0xFF334155) : const Color(0xFFCBD5E1),
                ),
              ),
              focusedBorder: OutlineInputBorder(
                borderRadius: BorderRadius.circular(14),
                borderSide: const BorderSide(color: AppTheme.primary, width: 2),
              ),
            ),
            onChanged: (val) {
              if (val.length == 6) {
                _handleVerify();
              }
            },
          ),

          // Error Message Feedback
          if (_errorMessage != null) ...[
            const SizedBox(height: 10),
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
              decoration: BoxDecoration(
                color: AppTheme.danger.withOpacity(0.1),
                borderRadius: BorderRadius.circular(8),
              ),
              child: Row(
                children: [
                  const Icon(Icons.error_outline, size: 16, color: AppTheme.danger),
                  const SizedBox(width: 8),
                  Expanded(
                    child: Text(
                      _errorMessage!,
                      key: const Key('otp_error_message'),
                      style: const TextStyle(color: AppTheme.danger, fontSize: 12, fontWeight: FontWeight.w500),
                    ),
                  ),
                ],
              ),
            ),
          ],

          const SizedBox(height: 20),

          // Verify Button
          ElevatedButton(
            key: const Key('otp_verify_button'),
            onPressed: (_isVerifying || _otpController.text.length != 6)
                ? null
                : _handleVerify,
            style: ElevatedButton.styleFrom(
              backgroundColor: AppTheme.primary,
              foregroundColor: Colors.white,
              padding: const EdgeInsets.symmetric(vertical: 14),
              shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
              elevation: 0,
            ),
            child: _isVerifying
                ? const SizedBox(
                    height: 20,
                    width: 20,
                    child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white),
                  )
                : const Text(
                    'Verify & Continue',
                    style: TextStyle(fontWeight: FontWeight.bold, fontSize: 15),
                  ),
          ),

          const SizedBox(height: 16),

          // Resend Cooldown Action
          Center(
            child: _isResending
                ? const SizedBox(
                    height: 18,
                    width: 18,
                    child: CircularProgressIndicator(strokeWidth: 2),
                  )
                : _resendSeconds > 0
                    ? Text(
                        'Resend code in ${_resendSeconds}s',
                        key: const Key('otp_resend_countdown'),
                        style: TextStyle(
                          fontSize: 13,
                          color: isDark ? Colors.grey[500] : Colors.grey[600],
                          fontWeight: FontWeight.w500,
                        ),
                      )
                    : TextButton.icon(
                        key: const Key('otp_resend_button'),
                        onPressed: _handleResend,
                        icon: const Icon(Icons.refresh, size: 16),
                        label: const Text(
                          'Resend Code',
                          style: TextStyle(fontWeight: FontWeight.bold, fontSize: 13),
                        ),
                      ),
          ),
        ],
      ),
    );
  }
}
