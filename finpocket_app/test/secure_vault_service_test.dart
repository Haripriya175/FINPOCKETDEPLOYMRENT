import 'dart:io';
import 'dart:typed_data';

import 'package:flutter_test/flutter_test.dart';

import 'package:finpocket_app/services/secure_vault_service.dart';

/// Exercises the Vault PIN lifecycle end-to-end against a temp directory:
/// choosing a PIN, unlocking with it, refusing wrong PINs, and — the critical
/// one — re-keying every record when the PIN changes, so the old PIN stops
/// working while each document (image included) survives byte-for-byte.
void main() {
  final vault = SecureVaultService.instance;
  late Directory tempDir;

  setUp(() {
    tempDir = Directory.systemTemp.createTempSync('finpocket_vault_test');
    vault.debugReset(baseDirectory: tempDir.path);
  });

  tearDown(() {
    vault.debugReset();
    tempDir.deleteSync(recursive: true);
  });

  test('validateChosenPin rejects trivial and malformed PINs', () {
    // Length bounds.
    expect(SecureVaultService.validateChosenPin('123'), isNotNull);
    expect(SecureVaultService.validateChosenPin('123456789'), isNotNull);
    // Non-digits.
    expect(SecureVaultService.validateChosenPin('12a4'), isNotNull);
    // One digit repeated.
    expect(SecureVaultService.validateChosenPin('1111'), isNotNull);
    expect(SecureVaultService.validateChosenPin('777777'), isNotNull);
    // Plain ascending / descending runs.
    expect(SecureVaultService.validateChosenPin('1234'), isNotNull);
    expect(SecureVaultService.validateChosenPin('6789'), isNotNull);
    expect(SecureVaultService.validateChosenPin('9876'), isNotNull);
    expect(SecureVaultService.validateChosenPin('4321'), isNotNull);
    expect(SecureVaultService.validateChosenPin('12345'), isNotNull);
    // The user's own sensible choices.
    expect(SecureVaultService.validateChosenPin('4829'), isNull);
    expect(SecureVaultService.validateChosenPin('80413'), isNull);
    expect(SecureVaultService.validateChosenPin('739164'), isNull);
    expect(SecureVaultService.validateChosenPin('20481592'), isNull);
  }, timeout: const Timeout(Duration(minutes: 1)));

  test('a fresh vault lets the user choose a PIN and only that PIN opens it',
      () async {
    expect(await vault.isPinSet, isFalse);

    await vault.createPin('4829');

    expect(await vault.isPinSet, isTrue);
    expect(await vault.isUserChosenPin, isTrue);
    expect(vault.isUnlocked, isTrue);

    // A wrong PIN must be refused — and must never leave the vault open.
    vault.lock();
    await expectLater(vault.unlock('9999'), throwsA(isA<StateError>()));
    expect(vault.isUnlocked, isFalse);

    // The chosen one opens it.
    await vault.unlock('4829');
    expect(vault.isUnlocked, isTrue);
  }, timeout: const Timeout(Duration(minutes: 2)));

  test('createPin refuses weak PINs and never overwrites an existing PIN',
      () async {
    await expectLater(
        vault.createPin('1234'), throwsA(isA<ArgumentError>()));

    await vault.createPin('4829');
    await expectLater(
        vault.createPin('7391'), throwsA(isA<StateError>()));

    // The original PIN still governs the vault.
    vault.lock();
    await expectLater(vault.unlock('7391'), throwsA(isA<StateError>()));
    await vault.unlock('4829');
  }, timeout: const Timeout(Duration(minutes: 2)));

  test('pinLength follows the chosen PIN; 4 for fresh and legacy vaults',
      () async {
    // Nothing chosen yet — the default is 4 (what a fresh setup offers).
    expect(await vault.pinLength, 4);

    await vault.createPin('739164');
    expect(await vault.pinLength, 6);

    // A change updates it too — the unlock dialog must follow.
    await vault.changePin(oldPin: '739164', newPin: '20481592');
    expect(await vault.pinLength, 8);
  }, timeout: const Timeout(Duration(minutes: 2)));

  test('records survive a PIN change and the old PIN stops working', () async {
    await vault.createPin('4829');

    final image = Uint8List.fromList(List.generate(2048, (i) => i % 251));
    await vault.sealBlob(
      id: 'doc1',
      documentType: 'Aadhaar Card',
      fullNumber: '466384205711',
      holderName: 'Sureddy Jithendra',
      dateOfBirth: '09/02/2006',
      gender: 'Male',
      imageBytes: image,
    );
    await vault.sealBlob(
        id: 'doc2', documentType: 'PAN Card', fullNumber: 'ABCDE1234F');

    await vault.changePin(oldPin: '4829', newPin: '739164');

    // The old PIN must no longer open the vault...
    vault.lock();
    await expectLater(vault.unlock('4829'), throwsA(isA<StateError>()));

    // ...and the new one must reveal every record exactly as it was.
    await vault.unlock('739164');
    final detail = await vault.openBlob('doc1');
    expect(detail.fullNumber, '466384205711');
    expect(detail.holderName, 'Sureddy Jithendra');
    expect(detail.dateOfBirth, '09/02/2006');
    expect(detail.gender, 'Male');
    expect(detail.imageBytes, image);

    final pan = await vault.openBlob('doc2');
    expect(pan.fullNumber, 'ABCDE1234F');
    expect(pan.hasImage, isFalse);
  }, timeout: const Timeout(Duration(minutes: 3)));

  test('a change attempted with the wrong current PIN changes nothing',
      () async {
    await vault.createPin('4829');
    await vault.sealBlob(
        id: 'doc1', documentType: 'PAN Card', fullNumber: 'ABCDE1234F');

    await expectLater(
      vault.changePin(oldPin: '0000', newPin: '739164'),
      throwsA(isA<StateError>()),
    );

    // Still governed by the original PIN, record intact.
    vault.lock();
    await vault.unlock('4829');
    final detail = await vault.openBlob('doc1');
    expect(detail.fullNumber, 'ABCDE1234F');
  }, timeout: const Timeout(Duration(minutes: 2)));

  test('changing to the same or a weak PIN is refused before any work starts',
      () async {
    await vault.createPin('4829');

    await expectLater(
      vault.changePin(oldPin: '4829', newPin: '4829'),
      throwsA(isA<ArgumentError>()),
    );
    await expectLater(
      vault.changePin(oldPin: '4829', newPin: '1234'),
      throwsA(isA<ArgumentError>()),
    );

    // Nothing changed — the original PIN still opens everything.
    vault.lock();
    await vault.unlock('4829');
  }, timeout: const Timeout(Duration(minutes: 2)));

  test('legacy App-PIN vaults keep working, then migrate to a chosen PIN',
      () async {
    // Simulate the pre-upgrade flow: the vault was initialised with whatever
    // the old gate handed it (no metadata file ⇒ legacy work factor).
    await vault.unlock('1234');
    expect(await vault.isPinSet, isTrue);
    expect(await vault.isUserChosenPin, isFalse);
    expect(await vault.pinLength, 4); // legacy App PINs are always 4 digits

    await vault.sealBlob(
        id: 'doc1', documentType: 'Aadhaar Card', fullNumber: '466384205711');

    // Migrating is just a change away from the legacy PIN.
    await vault.changePin(oldPin: '1234', newPin: '20481592');
    expect(await vault.isUserChosenPin, isTrue);

    vault.lock();
    await expectLater(vault.unlock('1234'), throwsA(isA<StateError>()));
    await vault.unlock('20481592');
    final detail = await vault.openBlob('doc1');
    expect(detail.fullNumber, '466384205711');
  }, timeout: const Timeout(Duration(minutes: 3)));
}
