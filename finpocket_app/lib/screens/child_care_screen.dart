import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../providers/app_state.dart';
import '../theme/app_theme.dart';
import '../widgets/pin_dialog.dart';

class ChildCareScreen extends StatelessWidget {
  const ChildCareScreen({super.key});

  void _handleToggle(BuildContext context, AppState state) {
    showDialog(
      context: context,
      builder: (ctx) => PinDialog(
        title: state.isChildCareActive ? 'Exit Child Care Mode' : 'Enable Child Care Mode',
        subtitle: 'Enter Parent PIN to proceed',
        // Server-verified PIN (bcrypt digest stays server-side) — the old
        // local compare always ran against a fabricated '1234' value.
        onValidate: state.verifyAppPin,
        onSuccess: () {
          if (state.isChildCareActive) {
            state.disableChildCare();
          } else {
            state.enableChildCare();
          }
        },
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final state = Provider.of<AppState>(context);

    return Scaffold(
      appBar: AppBar(title: const Text('Child Care Mode')),
      body: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          children: [
            Container(
              decoration: state.isChildCareActive
                  ? BoxDecoration(
                      color: AppTheme.warning.withOpacity(0.08),
                      borderRadius: BorderRadius.circular(16),
                      border: Border.all(color: AppTheme.warning.withOpacity(0.4)),
                    )
                  : AppTheme.cardDecoration(context),
              padding: const EdgeInsets.all(24),
              child: Column(
                children: [
                  Container(
                    width: 64,
                    height: 64,
                    decoration: BoxDecoration(
                      color: (state.isChildCareActive ? AppTheme.warning : AppTheme.primary).withOpacity(0.12),
                      shape: BoxShape.circle,
                    ),
                    child: Icon(
                      state.isChildCareActive ? Icons.shield : Icons.shield_outlined,
                      size: 36,
                      color: state.isChildCareActive ? AppTheme.warning : AppTheme.primaryLight,
                    ),
                  ),
                  const SizedBox(height: 16),
                  Text(
                    state.isChildCareActive ? 'Child Care Mode Active' : 'Child Care Mode Inactive',
                    style: const TextStyle(fontSize: 18, fontWeight: FontWeight.bold),
                  ),
                  const SizedBox(height: 8),
                  const Text(
                    'When active, all payments are blocked and sensitive balance numbers are masked for financial safety.',
                    textAlign: TextAlign.center,
                    style: TextStyle(fontSize: 13, color: Color(0xFF94A3B8), height: 1.4),
                  ),
                  const SizedBox(height: 24),
                  SizedBox(
                    width: double.infinity,
                    height: 48,
                    child: ElevatedButton(
                      style: ElevatedButton.styleFrom(
                        backgroundColor: state.isChildCareActive ? AppTheme.danger : AppTheme.primary,
                        foregroundColor: Colors.white,
                        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                        elevation: 0,
                      ),
                      onPressed: () => _handleToggle(context, state),
                      child: Text(
                        state.isChildCareActive ? 'Exit Child Care (Parent PIN)' : 'Activate Child Care Mode',
                        style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 14),
                      ),
                    ),
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}
