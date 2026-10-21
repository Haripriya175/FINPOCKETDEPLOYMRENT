import 'package:flutter_test/flutter_test.dart';
import 'package:provider/provider.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:finpocket_app/main.dart';
import 'package:finpocket_app/providers/app_state.dart';
import 'package:finpocket_app/config/app_config.dart';

void main() {
  setUp(() {
    TestWidgetsFlutterBinding.ensureInitialized();
    SharedPreferences.setMockInitialValues({});
    AppConfig.environment = AppEnvironment.test;
  });

  testWidgets('FinPocketApp smoke test', (WidgetTester tester) async {
    await tester.pumpWidget(
      ChangeNotifierProvider(
        create: (_) => AppState(),
        child: const FinPocketApp(),
      ),
    );
    await tester.pumpAndSettle();
    expect(find.text('FinPocket'), findsWidgets);
  });
}
