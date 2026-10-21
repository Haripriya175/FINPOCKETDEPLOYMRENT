import 'dart:math';
import 'package:flutter/material.dart';
import '../../theme/app_theme.dart';

class CaptchaWidget extends StatefulWidget {
  final TextEditingController controller;
  final ValueChanged<bool>? onValidationChanged;

  const CaptchaWidget({
    super.key,
    required this.controller,
    this.onValidationChanged,
  });

  @override
  State<CaptchaWidget> createState() => CaptchaWidgetState();
}

class CaptchaWidgetState extends State<CaptchaWidget> with SingleTickerProviderStateMixin {
  String _captchaCode = '';
  late AnimationController _refreshAnimController;
  final Random _random = Random();

  // Characters used for captcha generation (omitting confusing 0, O, I, 1, l)
  static const String _chars = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';

  @override
  void initState() {
    super.initState();
    _refreshAnimController = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 500),
    );
    _generateCaptchaCode();
    widget.controller.addListener(_onTextChanged);
  }

  @override
  void dispose() {
    widget.controller.removeListener(_onTextChanged);
    _refreshAnimController.dispose();
    super.dispose();
  }

  void _generateCaptchaCode() {
    final buffer = StringBuffer();
    for (int i = 0; i < 5; i++) {
      buffer.write(_chars[_random.nextInt(_chars.length)]);
    }
    _captchaCode = buffer.toString();
  }

  void refreshCaptcha() {
    _refreshAnimController.forward(from: 0.0);
    setState(() {
      _generateCaptchaCode();
    });
    widget.controller.clear();
    _notifyValidation();
  }

  void _onTextChanged() {
    setState(() {});
    _notifyValidation();
  }

  void _notifyValidation() {
    if (widget.onValidationChanged != null) {
      final valid = isValid;
      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (mounted) {
          widget.onValidationChanged!(valid);
        }
      });
    }
  }

  bool get isValid =>
      widget.controller.text.trim().isNotEmpty &&
      widget.controller.text.trim().toUpperCase() == _captchaCode.toUpperCase();

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final isMatched = widget.controller.text.trim().toUpperCase() == _captchaCode.toUpperCase();

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Row(
          children: [
            Expanded(
              child: Container(
                height: 52,
                decoration: BoxDecoration(
                  color: isDark ? const Color(0xFF1E293B) : const Color(0xFFF1F5F9),
                  borderRadius: BorderRadius.circular(12),
                  border: Border.all(
                    color: isDark ? const Color(0xFF334155) : const Color(0xFFCBD5E1),
                  ),
                ),
                child: ClipRRect(
                  borderRadius: BorderRadius.circular(12),
                  child: CustomPaint(
                    painter: _CaptchaPainter(code: _captchaCode, isDark: isDark),
                    child: Container(),
                  ),
                ),
              ),
            ),
            const SizedBox(width: 8),
            IconButton(
              tooltip: 'Generate New Captcha',
              onPressed: refreshCaptcha,
              icon: RotationTransition(
                turns: _refreshAnimController,
                child: const Icon(Icons.refresh, color: AppTheme.primary, size: 26),
              ),
            ),
          ],
        ),
        const SizedBox(height: 10),
        TextFormField(
          key: const Key('login_captcha_field'),
          controller: widget.controller,
          textCapitalization: TextCapitalization.characters,
          style: const TextStyle(fontWeight: FontWeight.bold, letterSpacing: 3),
          decoration: InputDecoration(
            labelText: 'Security Captcha',
            hintText: 'Enter characters above',
            prefixIcon: const Icon(Icons.security_outlined),
            suffixIcon: widget.controller.text.isEmpty
                ? null
                : Icon(
                    isMatched ? Icons.check_circle : Icons.cancel_outlined,
                    color: isMatched ? AppTheme.success : AppTheme.danger,
                    size: 20,
                  ),
            filled: true,
            fillColor: isDark ? const Color(0xFF1E293B) : const Color(0xFFF8FAFC),
            border: OutlineInputBorder(
              borderRadius: BorderRadius.circular(14),
              borderSide: BorderSide(
                color: isDark ? const Color(0xFF334155) : const Color(0xFFE2E8F0),
              ),
            ),
            enabledBorder: OutlineInputBorder(
              borderRadius: BorderRadius.circular(14),
              borderSide: BorderSide(
                color: isMatched
                    ? AppTheme.success.withOpacity(0.6)
                    : (isDark ? const Color(0xFF334155) : const Color(0xFFE2E8F0)),
              ),
            ),
            focusedBorder: OutlineInputBorder(
              borderRadius: BorderRadius.circular(14),
              borderSide: const BorderSide(color: AppTheme.primary, width: 2),
            ),
          ),
          validator: (value) {
            if (value == null || value.trim().isEmpty) {
              return 'Please enter the security captcha';
            }
            if (value.trim().toUpperCase() != _captchaCode.toUpperCase()) {
              return 'Incorrect captcha. Please re-enter or refresh.';
            }
            return null;
          },
        ),
      ],
    );
  }
}

class _CaptchaPainter extends CustomPainter {
  final String code;
  final bool isDark;

  _CaptchaPainter({required this.code, required this.isDark});

  @override
  void paint(Canvas canvas, Size size) {
    final rand = Random(code.hashCode);

    // 1. Draw subtle background pattern noise lines
    final linePaint = Paint()
      ..color = (isDark ? Colors.cyanAccent : Colors.blueGrey).withOpacity(0.2)
      ..strokeWidth = 1.2
      ..style = PaintingStyle.stroke;

    for (int i = 0; i < 4; i++) {
      final path = Path();
      path.moveTo(0, rand.nextDouble() * size.height);
      path.cubicTo(
        size.width * 0.33,
        rand.nextDouble() * size.height,
        size.width * 0.66,
        rand.nextDouble() * size.height,
        size.width,
        rand.nextDouble() * size.height,
      );
      canvas.drawPath(path, linePaint);
    }

    // 2. Draw subtle random noise dots
    final dotPaint = Paint()
      ..color = (isDark ? Colors.white30 : Colors.black26)
      ..style = PaintingStyle.fill;
    for (int i = 0; i < 24; i++) {
      canvas.drawCircle(
        Offset(rand.nextDouble() * size.width, rand.nextDouble() * size.height),
        rand.nextDouble() * 1.5 + 0.5,
        dotPaint,
      );
    }

    // 3. Draw each character with offset, slight rotation, and distinct vibrant color
    final colors = isDark
        ? [
            const Color(0xFF00E5FF),
            const Color(0xFF38BDF8),
            const Color(0xFF34D399),
            const Color(0xFFA78BFA),
            const Color(0xFFFBBF24),
          ]
        : [
            const Color(0xFF0284C7),
            const Color(0xFF059669),
            const Color(0xFF7C3AED),
            const Color(0xFFD97706),
            const Color(0xFF2563EB),
          ];

    final charSpacing = size.width / (code.length + 1);

    for (int i = 0; i < code.length; i++) {
      final char = code[i];
      final textSpan = TextSpan(
        text: char,
        style: TextStyle(
          color: colors[i % colors.length],
          fontSize: 24,
          fontWeight: FontWeight.w900,
          fontFamily: 'monospace',
          letterSpacing: 2,
        ),
      );

      final textPainter = TextPainter(
        text: textSpan,
        textDirection: TextDirection.ltr,
      )..layout();

      final x = charSpacing * (i + 0.6) + (rand.nextDouble() * 4 - 2);
      final y = (size.height - textPainter.height) / 2 + (rand.nextDouble() * 6 - 3);

      canvas.save();
      final rotation = (rand.nextDouble() * 0.35) - 0.175; // -10 to +10 degrees
      canvas.translate(x + textPainter.width / 2, y + textPainter.height / 2);
      canvas.rotate(rotation);
      textPainter.paint(canvas, Offset(-textPainter.width / 2, -textPainter.height / 2));
      canvas.restore();
    }
  }

  @override
  bool shouldRepaint(covariant _CaptchaPainter oldDelegate) {
    return oldDelegate.code != code || oldDelegate.isDark != isDark;
  }
}
