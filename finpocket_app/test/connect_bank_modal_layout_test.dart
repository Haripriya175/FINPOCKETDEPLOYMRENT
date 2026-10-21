import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:provider/provider.dart';

import 'package:finpocket_app/providers/app_state.dart';
import 'package:finpocket_app/widgets/connect_bank_modal.dart';

// Regression guard for the bank dropdown overflow.
//
// DropdownButtonFormField defaults `isDense` to true, which wraps the button in
// SizedBox(height: _denseButtonHeight) — a hard 24px. Our dropdown item has two
// lines (~28px), so the field reported "BOTTOM OVERFLOWED BY 4.0 PIXELS" and
// clipped the second line ("Bank consent (real connection)") out of view.
// Setting isDense: false removes that clamp and the item lays out fully.
void main() {
  testWidgets('bank dropdown is not dense, so its two-line item fits',
      (tester) async {
    // Logical 1080x2400. The test font (Ahem) draws every glyph as a full em
    // square, so text measures far wider than on device; give the field enough
    // room that the only thing under test is the vertical clamp.
    tester.view.physicalSize = const Size(1080, 2400);
    tester.view.devicePixelRatio = 1.0;
    addTearDown(tester.view.reset);

    await tester.pumpWidget(
      ChangeNotifierProvider<AppState>(
        create: (_) => AppState(),
        child: const MaterialApp(home: ConnectBankModal()),
      ),
    );
    await tester.pumpAndSettle(const Duration(seconds: 1));

    // DropdownButtonFormField doesn't expose isDense; the inner DropdownButton
    // does, and it's what gets the clamping SizedBox(height: _denseButtonHeight).
    final inner = find.descendant(
      of: find.byType(DropdownButtonFormField<String>),
      matching: find.byType(DropdownButton<String>),
    );
    final button = tester.widget<DropdownButton<String>>(inner);
    expect(button.isDense, isFalse,
        reason:
            'isDense:true clamps the row to 24px and overflows the two-line item');

    // The second line must actually be laid out, not clipped away.
    final sub = tester.widget<Text>(find.text('Bank consent (real connection)'));
    expect(sub, isNotNull);
  });
}
