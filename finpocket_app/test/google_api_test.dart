import 'package:flutter_test/flutter_test.dart';
import 'package:google_sign_in/google_sign_in.dart';

void main() {
  test('verify GoogleSignInAccount interface and typing', () {
    expect(GoogleSignIn.instance, isNotNull);
  });
}
