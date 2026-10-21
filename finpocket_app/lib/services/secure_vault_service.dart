import 'dart:convert';
import 'dart:io';
import 'dart:typed_data';

import 'package:cryptography/cryptography.dart';
import 'package:flutter/foundation.dart';
import 'package:path_provider/path_provider.dart';

/// PIN-encrypted blob store for the Personal Document Vault.
///
/// This class owns the *ciphertext* (the real document contents: full number,
/// holder details and the card image). The human-readable **index** of what is
/// in the vault lives in `AppState` (masked metadata only), so there is exactly
/// one list and one encrypted store — no two sources of truth.
///
/// ─────────────────────────────────────────────────────────────────────────
/// SECURITY MODEL
///
///  * The vault key is derived from the user's Security PIN with PBKDF2
///    (HMAC-SHA256, high iteration count, 256-bit key) against a random,
///    per-install salt. A wrong PIN does not merely fail a string comparison —
///    it yields a key that cannot authenticate the AES-GCM tag, so decryption
///    *provably* fails.
///  * Every blob is sealed with AES-256-GCM (authenticated encryption). Any
///    tampering — even one flipped bit — makes the MAC check fail and the blob
///    is rejected rather than decoded into attacker-controlled data.
///  * The derived key is held only in memory while unlocked, dropped on
///    [lock], never written to disk, never logged, never sent over the network.
///  * Everything stays on this handset. Nothing is uploaded anywhere.
/// ─────────────────────────────────────────────────────────────────────────
class SecureVaultService {
  SecureVaultService._();
  static final SecureVaultService instance = SecureVaultService._();

  /// PBKDF2 work factor used by vaults that pre-date user-chosen PINs (their
  /// key was derived from the account's App PIN). Kept as-is for them —
  /// changing it would change the derived key and lock their data out. Those
  /// vaults are upgraded to [_kdfIterations] the moment the user sets or
  /// changes their own PIN, because [changePin] re-seals every blob anyway.
  static const int _legacyKdfIterations = 100000;

  /// PBKDF2 work factor for vaults the user has taken ownership of. Higher
  /// than the legacy value because the *PIN* is the only secret: with a short
  /// numeric secret, iteration count is what makes an offline sweep of the
  /// PIN space expensive. Costs ~1–2s on first unlock; repeat unlocks within
  /// a session are served from the in-memory cache below.
  static const int _kdfIterations = 300000;

  static const String _dirName = 'finpocket_vault';
  static const String _blobDirName = 'blobs';
  static const String _saltFileName = 'master.salt';
  static const String _markerName = '.selftest';
  static const String _pinMetaName = 'pin.meta';

  /// Bump when the container layout changes.
  static const int _formatVersion = 1;

  SecretKey? _masterKey;
  Directory? _vaultRoot;

  /// SHA-256 of the PIN the vault was last successfully unlocked with, so
  /// repeat unlocks inside one app session skip the PBKDF2 grind. Memory-only
  /// by design — never persisted, never logged, dropped by [lock].
  List<int>? _unlockedPinFingerprint;

  /// Test seam: points the vault at a temp directory instead of the platform
  /// documents directory. Production never sets this.
  @visibleForTesting
  static String? debugBaseDirectory;

  // ────────────────────────────────────────────────────────────────────────
  // Unlock / lock
  // ────────────────────────────────────────────────────────────────────────

  bool get isUnlocked => _masterKey != null;

  /// True once a PIN exists on this device (the encrypted self-test marker
  /// has been written). Until then the user is prompted to choose one the
  /// first time the vault is used.
  Future<bool> get isPinSet async => (await _markerFile()).exists();

  /// True when that PIN was chosen by the user.
  ///
  /// False for vaults initialised by the pre-upgrade flow, where the key was
  /// silently derived from the account's App PIN. Those keep opening with the
  /// old App PIN, but we prompt the user to pick a PIN of their own (which
  /// re-keys the vault) the first time it matters.
  Future<bool> get isUserChosenPin async {
    final meta = await _readPinMeta();
    return meta != null && meta['source'] == 'user';
  }

  /// How many digits this vault's PIN has, so the unlock dialog can draw the
  /// right number of dots instead of assuming four. The length is recorded in
  /// [pin.meta] when the user creates or changes their PIN (the PIN itself is
  /// never stored — only how long it is). Legacy App-PIN vaults, and anything
  /// unreadable, are always 4 digits.
  Future<int> get pinLength async {
    final meta = await _readPinMeta();
    final length = meta?['length'];
    return length is int && length >= 4 && length <= 8 ? length : 4;
  }

  /// Derives the vault key from [pin] and caches it in memory.
  ///
  /// The first unlock with a given [pin] pays the PBKDF2 cost; while the
  /// vault stays unlocked, repeat unlocks with that same PIN are answered
  /// from a memory-only fingerprint cache.
  ///
  /// Throws [StateError] if [pin] cannot open an already-initialised vault —
  /// a wrong PIN must never look like a successful unlock.
  Future<void> unlock(String pin) async {
    final cached = _unlockedPinFingerprint;
    if (_masterKey != null &&
        cached != null &&
        listEquals(cached, (await Sha256().hash(utf8.encode(pin))).bytes)) {
      return; // already open with this exact PIN
    }

    final iterations = await _kdfIterationsForExistingVault();
    final salt = await _readOrCreateSalt();
    final key = await _deriveKey(pin, salt, iterations);

    if (!await _selfTest(key)) {
      lock();
      throw StateError('Invalid PIN');
    }
    _masterKey = key;
    _unlockedPinFingerprint = (await Sha256().hash(utf8.encode(pin))).bytes;
  }

  /// Drops the derived key (and the unlock fingerprint) from memory.
  void lock() {
    _masterKey = null;
    _unlockedPinFingerprint = null;
  }

  /// Proves [key] opens this vault. On first use it seals a version marker
  /// with [key] so every later unlock can verify the PIN really is correct.
  Future<bool> _selfTest(SecretKey key) async {
    final marker = await _markerFile();
    if (!await marker.exists()) {
      final sealed = await _sealWith(
          key, utf8.encode('finpocket-vault-v$_formatVersion'));
      await marker.writeAsBytes(sealed, flush: true);
      return true;
    }
    try {
      final plain = await _openWith(key, await marker.readAsBytes());
      return utf8.decode(plain) == 'finpocket-vault-v$_formatVersion';
    } catch (_) {
      return false;
    }
  }

  // ────────────────────────────────────────────────────────────────────────
  // PIN lifecycle — the user chooses it, and only a verified holder of the
  // current PIN (plus, at the UI layer, a re-authenticated account) may
  // change it.
  // ────────────────────────────────────────────────────────────────────────

  /// Returns an error message if [pin] is not an acceptable user-chosen PIN,
  /// or null if it is fine.
  ///
  /// Pure (no I/O) so the setup dialog can enforce it before any key is
  /// derived, and so it is directly unit-testable.
  ///
  /// Policy: 4–8 digits, digits only, and no trivially guessable patterns —
  /// one digit repeated, or a plain ascending/descending run. Past that, the
  /// choice is the user's.
  static String? validateChosenPin(String pin) {
    if (pin.length < 4 || pin.length > 8) {
      return 'Choose a PIN between 4 and 8 digits.';
    }
    if (!RegExp(r'^\d+$').hasMatch(pin)) {
      return 'A vault PIN may only contain digits.';
    }
    if (pin.split('').every((d) => d == pin[0])) {
      return 'That PIN is too easy to guess — avoid repeating one digit.';
    }
    var ascending = true;
    var descending = true;
    for (var i = 1; i < pin.length; i++) {
      final step = pin.codeUnitAt(i) - pin.codeUnitAt(i - 1);
      if (step != 1) ascending = false;
      if (step != -1) descending = false;
    }
    if (ascending || descending) {
      return 'That PIN is a simple sequence — pick something less predictable.';
    }
    return null;
  }

  /// Initialises the vault under a PIN the user chose.
  ///
  /// Only valid before any PIN exists; afterwards the sole way to change it
  /// is [changePin], which demands proof of the current one.
  Future<void> createPin(String pin) async {
    final error = validateChosenPin(pin);
    if (error != null) throw ArgumentError.value(pin, 'pin', error);
    if (await isPinSet) {
      throw StateError('A vault PIN already exists — use changePin instead.');
    }
    // Record the derivation parameters first: unlock() reads them, and a
    // fresh vault's first unlock creates the self-test marker under this PIN.
    await _writeAtomic(
      await _pinMetaFile(),
      utf8.encode(jsonEncode({
        'source': 'user',
        'length': pin.length,
        'createdAt': DateTime.now().toIso8601String(),
        'iterations': _kdfIterations,
      })),
    );
    await unlock(pin); // first unlock initialises the marker under this PIN
  }

  /// Re-keys the entire vault from [oldPin] to [newPin].
  ///
  /// The caller must already have established legitimacy — this class can't
  /// judge that, it only checks that [oldPin] genuinely opens the vault
  /// (a wrong PIN throws [StateError]). Every blob is decrypted with the old
  /// key and re-sealed with the new one, and the salt, self-test marker and
  /// PIN metadata are replaced together. If anything fails, the previous
  /// bytes are restored so the vault still opens with the old PIN — a failed
  /// change must never strand the user's documents.
  Future<void> changePin({required String oldPin, required String newPin}) async {
    final error = validateChosenPin(newPin);
    if (error != null) throw ArgumentError.value(newPin, 'newPin', error);
    if (newPin == oldPin) {
      throw ArgumentError.value(
          newPin, 'newPin', 'The new PIN must be different from the current one.');
    }

    await unlock(oldPin); // throws StateError if [oldPin] is wrong
    final oldKey = _masterKey!;

    final saltFile = await _saltFile();
    final markerFile = await _markerFile();
    final metaFile = await _pinMetaFile();

    final newSalt = _randomSalt();
    final newKey = await _deriveKey(newPin, newSalt, _kdfIterations);

    final oldSalt = await saltFile.readAsBytes();
    final oldMarker = await markerFile.readAsBytes();
    final oldMeta = await metaFile.exists() ? await metaFile.readAsBytes() : null;

    final blobFiles = await _blobFiles();
    final previousBlobs = <String, List<int>>{};
    final rekeyedBlobs = <String, Uint8List>{};

    try {
      // 1. Decrypt + re-seal every record while the old key is still valid.
      for (final file in blobFiles) {
        final bytes = await file.readAsBytes();
        previousBlobs[file.path] = bytes;
        rekeyedBlobs[file.path] = await _rekeyContainer(bytes, oldKey, newKey);
      }
      final newMarker =
          await _sealWith(newKey, utf8.encode('finpocket-vault-v$_formatVersion'));
      final newMeta = utf8.encode(jsonEncode({
        'source': 'user',
        'length': newPin.length,
        'createdAt': DateTime.now().toIso8601String(),
        'iterations': _kdfIterations,
      }));

      // 2. Commit: records first, then the key material — each written to a
      //    temp file and renamed, so nothing is ever seen half-written.
      for (final entry in rekeyedBlobs.entries) {
        await _writeAtomic(File(entry.key), entry.value);
      }
      await _writeAtomic(saltFile, newSalt);
      await _writeAtomic(markerFile, newMarker);
      await _writeAtomic(metaFile, newMeta);
    } catch (_) {
      // Roll back to the old state so the vault still opens with the old PIN.
      try {
        for (final entry in previousBlobs.entries) {
          await _writeAtomic(File(entry.key), entry.value);
        }
        await _writeAtomic(saltFile, oldSalt);
        await _writeAtomic(markerFile, oldMarker);
        if (oldMeta != null) await _writeAtomic(metaFile, oldMeta);
      } catch (_) {
        // Best effort — the original failure is the one worth surfacing.
      }
      rethrow;
    }

    debugPrint('[SecureVault] Re-keyed ${blobFiles.length} record(s).');
    _masterKey = newKey;
    _unlockedPinFingerprint = (await Sha256().hash(utf8.encode(newPin))).bytes;
  }

  // ────────────────────────────────────────────────────────────────────────
  // Blob CRUD (caller owns the index)
  // ────────────────────────────────────────────────────────────────────────

  /// Seals one document's full details and optional image into an encrypted
  /// blob named `<id>.fvault`. The plaintext never touches disk.
  Future<void> sealBlob({
    required String id,
    required String documentType,
    String? fullNumber,
    String? holderName,
    String? dateOfBirth,
    String? gender,
    DateTime? expiryDate,
    Uint8List? imageBytes,
  }) async {
    final key = _requireKey();
    final dir = await _dir();

    final payload = <String, dynamic>{
      'documentType': documentType,
      'fullNumber': fullNumber,
      'holderName': holderName,
      'dateOfBirth': dateOfBirth,
      'gender': gender,
      'expiryDate': expiryDate?.toIso8601String(),
      'savedAt': DateTime.now().toIso8601String(),
    };

    final meta = await _sealWith(key, utf8.encode(jsonEncode(payload)));
    final img = (imageBytes != null && imageBytes.isNotEmpty)
        ? await _sealWith(key, imageBytes)
        : null;

    final container = jsonEncode({
      'v': _formatVersion,
      'meta': base64Encode(meta),
      'img': img == null ? null : base64Encode(img),
    });

    await File('${dir.path}/$_blobDirName/$id.fvault')
        .writeAsString(container, flush: true);
  }

  /// Decrypts the blob for [id]. Requires the vault to be unlocked.
  ///
  /// Throws [FileSystemException] if the blob is missing (e.g. a legacy
  /// metadata-only entry that predates encrypted storage).
  Future<VaultDocumentDetail> openBlob(String id) async {
    final key = _requireKey();
    final dir = await _dir();
    final file = File('${dir.path}/$_blobDirName/$id.fvault');
    if (!await file.exists()) {
      throw const FileSystemException('Encrypted record is missing');
    }

    final container =
        jsonDecode(await file.readAsString()) as Map<String, dynamic>;
    final meta = await _openWith(key, base64Decode(container['meta'] as String));
    final d = jsonDecode(utf8.decode(meta)) as Map<String, dynamic>;

    Uint8List? image;
    final imgB64 = container['img'];
    if (imgB64 is String && imgB64.isNotEmpty) {
      image = await _openWith(key, base64Decode(imgB64));
    }

    return VaultDocumentDetail(
      documentType: d['documentType'] as String?,
      fullNumber: d['fullNumber'] as String?,
      holderName: d['holderName'] as String?,
      dateOfBirth: d['dateOfBirth'] as String?,
      gender: d['gender'] as String?,
      expiryDate: DateTime.tryParse(d['expiryDate']?.toString() ?? ''),
      savedAt: DateTime.tryParse(d['savedAt']?.toString() ?? ''),
      imageBytes: image,
    );
  }

  Future<void> deleteBlob(String id) async {
    final dir = await _dir();
    final file = File('${dir.path}/$_blobDirName/$id.fvault');
    if (await file.exists()) await file.delete();
  }

  // ────────────────────────────────────────────────────────────────────────
  // Crypto primitives
  // ────────────────────────────────────────────────────────────────────────

  SecretKey _requireKey() {
    final key = _masterKey;
    if (key == null) throw StateError('Vault is locked');
    return key;
  }

  Future<Uint8List> _sealWith(SecretKey key, List<int> plain) async {
    final aes = AesGcm.with256bits();
    final nonce = aes.newNonce();
    final box =
        await aes.encrypt(Uint8List.fromList(plain), secretKey: key, nonce: nonce);

    // Layout: [nonce][mac][ciphertext]
    final out = BytesBuilder();
    out.add(box.nonce);
    out.add(box.mac.bytes);
    out.add(box.cipherText);
    return out.takeBytes();
  }

  Future<Uint8List> _openWith(SecretKey key, Uint8List sealed) async {
    const macLen = 16;
    final aes = AesGcm.with256bits();
    final nonceLen = aes.nonceLength;
    if (sealed.length < nonceLen + macLen) {
      throw const FormatException('Corrupt vault record');
    }
    final nonce = sealed.sublist(0, nonceLen);
    final mac = sealed.sublist(nonceLen, nonceLen + macLen);
    final cipher = sealed.sublist(nonceLen + macLen);

    // Throws on any tampering / wrong key — that is the point of GCM.
    final clear = await aes.decrypt(
      SecretBox(cipher, nonce: nonce, mac: Mac(mac)),
      secretKey: key,
    );
    return Uint8List.fromList(clear);
  }

  // ────────────────────────────────────────────────────────────────────────
  // Storage helpers
  // ────────────────────────────────────────────────────────────────────────

  Future<Directory> _dir() async {
    if (_vaultRoot != null) return _vaultRoot!;
    final base = debugBaseDirectory != null
        ? Directory(debugBaseDirectory!)
        : await getApplicationDocumentsDirectory();
    final root = Directory('${base.path}/$_dirName');
    if (!await root.exists()) await root.create(recursive: true);
    final blobs = Directory('${root.path}/$_blobDirName');
    if (!await blobs.exists()) await blobs.create(recursive: true);
    _vaultRoot = root;
    return root;
  }

  Future<File> _markerFile() async =>
      File('${(await _dir()).path}/$_markerName');
  Future<File> _saltFile() async =>
      File('${(await _dir()).path}/$_saltFileName');
  Future<File> _pinMetaFile() async =>
      File('${(await _dir()).path}/$_pinMetaName');

  Future<Map<String, dynamic>?> _readPinMeta() async {
    final file = await _pinMetaFile();
    if (!await file.exists()) return null;
    try {
      return jsonDecode(await file.readAsString()) as Map<String, dynamic>;
    } catch (_) {
      return null; // unreadable metadata ⇒ fall back to legacy parameters
    }
  }

  /// The iteration count this vault was sealed with (legacy vaults pre-date
  /// the metadata file and keep their original work factor).
  Future<int> _kdfIterationsForExistingVault() async {
    final meta = await _readPinMeta();
    final iterations = meta?['iterations'];
    return iterations is int ? iterations : _legacyKdfIterations;
  }

  Future<List<File>> _blobFiles() async {
    final blobs = Directory('${(await _dir()).path}/$_blobDirName');
    if (!await blobs.exists()) return const [];
    return await blobs
        .list()
        .where((e) => e is File && e.path.endsWith('.fvault'))
        .cast<File>()
        .toList();
  }

  /// Decrypts a whole container with [oldKey] and re-seals it with [newKey].
  Future<Uint8List> _rekeyContainer(
      List<int> containerBytes, SecretKey oldKey, SecretKey newKey) async {
    final container =
        jsonDecode(utf8.decode(containerBytes)) as Map<String, dynamic>;
    final metaPlain =
        await _openWith(oldKey, base64Decode(container['meta'] as String));
    final metaSealed = await _sealWith(newKey, metaPlain);

    Uint8List? imgSealed;
    final imgB64 = container['img'];
    if (imgB64 is String && imgB64.isNotEmpty) {
      final imgPlain = await _openWith(oldKey, base64Decode(imgB64));
      imgSealed = await _sealWith(newKey, imgPlain);
    }

    return utf8.encode(jsonEncode({
      'v': _formatVersion,
      'meta': base64Encode(metaSealed),
      'img': imgSealed == null ? null : base64Encode(imgSealed),
    }));
  }

  /// Writes [bytes] via temp file + rename so a crash mid-write can never
  /// leave a truncated record behind.
  Future<void> _writeAtomic(File file, List<int> bytes) async {
    final tmp = File('${file.path}.tmp');
    await tmp.writeAsBytes(bytes, flush: true);
    await tmp.rename(file.path);
  }

  Future<SecretKey> _deriveKey(String pin, Uint8List salt, int iterations) {
    final kdf = Pbkdf2(
      macAlgorithm: Hmac.sha256(),
      iterations: iterations,
      bits: 256,
    );
    return kdf.deriveKeyFromPassword(password: pin, nonce: salt);
  }

  /// 16 cryptographically random bytes (a fresh GCM nonce plus a slice of it).
  Uint8List _randomSalt() {
    final seed = AesGcm.with256bits().newNonce();
    return Uint8List.fromList([...seed, ...seed.sublist(0, 4)]);
  }

  Future<Uint8List> _readOrCreateSalt() async {
    final f = await _saltFile();
    if (await f.exists()) {
      final bytes = await f.readAsBytes();
      if (bytes.length >= 16) return bytes;
    }
    final salt = _randomSalt();
    await f.writeAsBytes(salt, flush: true);
    return salt;
  }

  /// Clears all in-memory vault state and points the vault at [baseDirectory]
  /// (pass null to return to the platform documents directory). Tests only.
  @visibleForTesting
  void debugReset({String? baseDirectory}) {
    debugBaseDirectory = baseDirectory;
    _masterKey = null;
    _unlockedPinFingerprint = null;
    _vaultRoot = null;
  }
}

/// The decrypted contents of a vault blob. Only ever produced in memory after
/// a successful PIN unlock — never cached, never persisted.
@immutable
class VaultDocumentDetail {
  final String? documentType;
  final String? fullNumber;
  final String? holderName;
  final String? dateOfBirth;
  final String? gender;
  final DateTime? expiryDate;
  final DateTime? savedAt;
  final Uint8List? imageBytes;

  const VaultDocumentDetail({
    this.documentType,
    this.fullNumber,
    this.holderName,
    this.dateOfBirth,
    this.gender,
    this.expiryDate,
    this.savedAt,
    this.imageBytes,
  });

  bool get hasImage => imageBytes != null && imageBytes!.isNotEmpty;
}
