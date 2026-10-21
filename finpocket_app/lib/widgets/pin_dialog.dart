import 'dart:async';

import 'package:flutter/material.dart';

/// Dots showing how many digits of a PIN have been entered.
class PinDots extends StatelessWidget {
  final int length;
  final int filled;

  const PinDots({super.key, required this.length, required this.filled});

  @override
  Widget build(BuildContext context) {
    return Row(
      mainAxisAlignment: MainAxisAlignment.center,
      children: List.generate(length, (index) {
        final isFilled = filled > index;
        return Container(
          margin: const EdgeInsets.symmetric(horizontal: 8),
          width: 16,
          height: 16,
          decoration: BoxDecoration(
            shape: BoxShape.circle,
            color: isFilled ? const Color(0xFF14B8A6) : Colors.transparent,
            border: Border.all(
              color:
                  isFilled ? const Color(0xFF14B8A6) : const Color(0xFF64748B),
              width: 2,
            ),
          ),
        );
      }),
    );
  }
}

/// The 1–9 / 0 / backspace keypad shared by every PIN dialog.
class PinKeypad extends StatelessWidget {
  final void Function(String digit) onDigit;
  final VoidCallback onDelete;

  /// When false the keys render but do nothing (e.g. while an async PIN check
  /// is running), so the user can't race the validator.
  final bool enabled;

  const PinKeypad({
    super.key,
    required this.onDigit,
    required this.onDelete,
    this.enabled = true,
  });

  @override
  Widget build(BuildContext context) {
    return GridView.builder(
      shrinkWrap: true,
      physics: const NeverScrollableScrollPhysics(),
      gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
        crossAxisCount: 3,
        childAspectRatio: 1.4,
        crossAxisSpacing: 10,
        mainAxisSpacing: 10,
      ),
      itemCount: 12,
      itemBuilder: (context, index) {
        if (index == 9) return const SizedBox();
        if (index == 10) {
          return _keyButton('0', enabled ? () => onDigit('0') : null);
        }
        if (index == 11) {
          return IconButton(
            onPressed: enabled ? onDelete : null,
            icon: const Icon(Icons.backspace_outlined, color: Colors.white70),
          );
        }
        final digit = (index + 1).toString();
        return _keyButton(digit, enabled ? () => onDigit(digit) : null);
      },
    );
  }

  Widget _keyButton(String text, VoidCallback? onPressed) {
    return InkWell(
      onTap: onPressed,
      borderRadius: BorderRadius.circular(16),
      child: Container(
        decoration: BoxDecoration(
          color: const Color(0xFF1E293B),
          borderRadius: BorderRadius.circular(16),
          border: Border.all(color: const Color(0x22FFFFFF)),
        ),
        alignment: Alignment.center,
        child: Text(
          text,
          style: const TextStyle(
              fontSize: 20, fontWeight: FontWeight.bold, color: Colors.white),
        ),
      ),
    );
  }
}

/// Asks the user to enter an existing PIN.
class PinDialog extends StatefulWidget {
  final String title;
  final String subtitle;

  /// Decides whether [pin] is correct. May be asynchronous — a user-chosen
  /// Vault PIN can only be checked by deriving its key (the PIN itself is
  /// never stored), in which case the keypad shows a spinner meanwhile.
  final FutureOr<bool> Function(String pin) onValidate;
  final VoidCallback onSuccess;

  /// How many digits the user must enter.
  final int length;

  /// Show the "Demo PIN: 1234" hint. Only for flows still keyed to the demo
  /// App PIN — never for a PIN the user chose themselves.
  final bool showDemoHint;

  /// Optional content under the keypad (e.g. a "choose your own PIN" path
  /// offered to legacy vaults). Replaces the demo hint when present.
  final Widget? footer;

  const PinDialog({
    super.key,
    this.title = 'Enter Security PIN',
    this.subtitle = 'Enter 4-digit App PIN to authorize',
    required this.onValidate,
    required this.onSuccess,
    this.length = 4,
    this.showDemoHint = true,
    this.footer,
  });

  @override
  State<PinDialog> createState() => _PinDialogState();
}

class _PinDialogState extends State<PinDialog> {
  String _enteredPin = '';
  String? _error;
  bool _checking = false;

  Future<void> _handleDigit(String digit) async {
    if (_checking || _enteredPin.length >= widget.length) return;

    setState(() {
      _enteredPin += digit;
      _error = null;
    });
    if (_enteredPin.length != widget.length) return;

    final pin = _enteredPin;
    setState(() => _checking = true);

    bool ok;
    try {
      ok = await widget.onValidate(pin);
    } catch (_) {
      ok = false; // e.g. a wrong vault PIN throws from the key check
    }
    if (!mounted) return;
    setState(() => _checking = false);

    if (ok) {
      Navigator.of(context).pop();
      widget.onSuccess();
    } else {
      setState(() {
        _error = 'Incorrect PIN. Try again.';
        _enteredPin = '';
      });
    }
  }

  void _handleDelete() {
    if (_checking || _enteredPin.isEmpty) return;
    setState(() {
      _enteredPin = _enteredPin.substring(0, _enteredPin.length - 1);
      _error = null;
    });
  }

  @override
  Widget build(BuildContext context) {
    return Dialog(
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(24)),
      backgroundColor: const Color(0xFF0F172A),
      child: Padding(
        padding: const EdgeInsets.all(24),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Container(
              width: 50,
              height: 50,
              decoration: BoxDecoration(
                color: const Color(0xFF14B8A6).withOpacity(0.15),
                shape: BoxShape.circle,
              ),
              child: const Icon(Icons.lock_outline,
                  color: Color(0xFF14B8A6), size: 26),
            ),
            const SizedBox(height: 12),
            Text(
              widget.title,
              style: const TextStyle(
                  fontSize: 18,
                  fontWeight: FontWeight.bold,
                  color: Colors.white),
            ),
            const SizedBox(height: 4),
            Text(
              widget.subtitle,
              textAlign: TextAlign.center,
              style:
                  const TextStyle(fontSize: 12, color: Color(0xFF94A3B8)),
            ),
            const SizedBox(height: 20),

            PinDots(length: widget.length, filled: _enteredPin.length),

            if (_error != null) ...[
              const SizedBox(height: 12),
              Text(
                _error!,
                style: const TextStyle(
                    color: Colors.redAccent,
                    fontSize: 12,
                    fontWeight: FontWeight.bold),
              ),
            ],

            if (_checking) ...[
              const SizedBox(height: 12),
              const SizedBox(
                width: 18,
                height: 18,
                child: CircularProgressIndicator(
                    strokeWidth: 2, color: Color(0xFF14B8A6)),
              ),
            ],

            const SizedBox(height: 20),

            PinKeypad(
              onDigit: _handleDigit,
              onDelete: _handleDelete,
              enabled: !_checking,
            ),

            const SizedBox(height: 10),
            if (widget.footer != null)
              widget.footer!
            else if (widget.showDemoHint)
              const Text(
                'Demo PIN: 1234',
                style:
                    TextStyle(fontSize: 10, color: Color(0xFF64748B)),
              ),
          ],
        ),
      ),
    );
  }
}
