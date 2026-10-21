import 'package:flutter/material.dart';

import '../services/secure_vault_service.dart';
import 'pin_dialog.dart';

/// Two-step dialog that lets the user choose a Vault PIN of their own and
/// confirms it by typing it twice.
///
/// It only *returns* the chosen PIN through [onCompleted]; validation runs
/// here (so bad choices bounce immediately) while key derivation and storage
/// stay the caller's job.
class PinSetupDialog extends StatefulWidget {
  final String title;
  final String subtitle;

  /// Called once with the confirmed PIN. The caller is responsible for
  /// dismissing this dialog.
  final void Function(String pin) onCompleted;

  const PinSetupDialog({
    super.key,
    this.title = 'Choose your Vault PIN',
    this.subtitle = '4 to 8 digits — 6 or more is strongly recommended.',
    required this.onCompleted,
  });

  @override
  State<PinSetupDialog> createState() => _PinSetupDialogState();
}

class _PinSetupDialogState extends State<PinSetupDialog> {
  static const int _minLength = 4;
  static const int _maxLength = 8;

  String _first = '';
  String _entered = '';
  String? _error;
  bool _confirming = false;

  bool get _canSubmit => _entered.length >= _minLength;

  void _handleDigit(String digit) {
    if (_entered.length >= _maxLength) return;
    setState(() {
      _entered += digit;
      _error = null;
    });
  }

  void _handleDelete() {
    if (_entered.isEmpty) return;
    setState(() {
      _entered = _entered.substring(0, _entered.length - 1);
      _error = null;
    });
  }

  void _submit() {
    if (!_canSubmit) {
      setState(() =>
          _error = 'A PIN needs at least $_minLength digits.');
      return;
    }

    if (!_confirming) {
      final problem = SecureVaultService.validateChosenPin(_entered);
      if (problem != null) {
        setState(() {
          _error = problem;
          _entered = '';
        });
        return;
      }
      setState(() {
        _first = _entered;
        _entered = '';
        _confirming = true;
        _error = null;
      });
      return;
    }

    if (_entered != _first) {
      setState(() {
        _first = '';
        _entered = '';
        _confirming = false;
        _error = 'The PINs didn\'t match — let\'s start again.';
      });
      return;
    }

    widget.onCompleted(_entered);
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
              child: Icon(
                _confirming ? Icons.check_circle_outline : Icons.key_rounded,
                color: const Color(0xFF14B8A6),
                size: 26,
              ),
            ),
            const SizedBox(height: 12),
            Text(
              _confirming ? 'Confirm your PIN' : widget.title,
              style: const TextStyle(
                  fontSize: 18,
                  fontWeight: FontWeight.bold,
                  color: Colors.white),
            ),
            const SizedBox(height: 4),
            Text(
              _confirming
                  ? 'Enter the same PIN again to confirm.'
                  : widget.subtitle,
              textAlign: TextAlign.center,
              style: const TextStyle(fontSize: 12, color: Color(0xFF94A3B8)),
            ),
            const SizedBox(height: 20),

            // Dots grow with the entry: a 4-digit PIN shows 4 dots, and so on.
            PinDots(
              length: _entered.isEmpty ? _minLength : _entered.length,
              filled: _entered.length,
            ),

            if (_error != null) ...[
              const SizedBox(height: 12),
              Text(
                _error!,
                textAlign: TextAlign.center,
                style: const TextStyle(
                    color: Colors.redAccent,
                    fontSize: 12,
                    fontWeight: FontWeight.bold),
              ),
            ],

            const SizedBox(height: 20),

            PinKeypad(onDigit: _handleDigit, onDelete: _handleDelete),

            const SizedBox(height: 14),
            SizedBox(
              width: double.infinity,
              height: 44,
              child: ElevatedButton(
                style: ElevatedButton.styleFrom(
                  backgroundColor: const Color(0xFF14B8A6),
                  foregroundColor: Colors.white,
                  disabledBackgroundColor:
                      const Color(0xFF14B8A6).withOpacity(0.3),
                  shape: RoundedRectangleBorder(
                      borderRadius: BorderRadius.circular(12)),
                ),
                onPressed: _submit,
                child: Text(
                  _confirming ? 'Confirm PIN' : 'Continue',
                  style: const TextStyle(fontWeight: FontWeight.bold),
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}
