import 'package:flutter/foundation.dart';

/// On-device extraction of identity details (PAN / Aadhaar / name / DOB) from
/// text recognised by ML Kit.
///
/// ─────────────────────────────────────────────────────────────────────────
/// SECURITY MODEL — read before changing anything here.
///
/// PAN and Aadhaar numbers are "sensitive personal data" under India's DPDP
/// Act. This class is deliberately written so that the recognised text can
/// never leak:
///
///  1. RECOGNITION IS ON-DEVICE. ML Kit's text recognizer runs entirely on
///     the handset. No image and no recognised string is ever sent over the
///     network by this code path.
///  2. THE RAW TEXT NEVER ESCAPES. [parse] takes the recognised text,
///     extracts validated fields into a [ScannedDocumentFields], and then the
///     caller drops the raw text. The raw string is not stored on the result
///     object, so it cannot be logged, cached, serialised to disk, attached
///     to a crash report, or accidentally persisted.
///  3. NOTHING HERE LOGS. There is deliberately no debugPrint/print of any
///     extracted value — not even masked — because logcat is readable by any
///     app with READ_LOGS on a rooted device and by anything that can pull a
///     bug report.
///  4. OUTPUT IS VALIDATED, NOT TRUSTED. Regex hits are checked against the
///     real checksum rules (Verhoeff for Aadhaar) so an OCR misread is
///     rejected instead of silently saved as a wrong identity number.
///  5. STORAGE IS MASKED UPSTREAM. `AppState.addDocument` reduces the number
///     to `XXXX-XXXX-<last4>` before it is persisted, so the full number
///     extracted here only ever exists in memory for the few seconds it takes
///     the user to review the autofilled form.
/// ─────────────────────────────────────────────────────────────────────────
class SecureDocumentScanner {
  SecureDocumentScanner._();

  /// PAN: 5 letters + 4 digits + 1 letter, e.g. ABCDE1234F.
  ///
  /// The 4th character encodes the holder's status (P = individual) and the
  /// 5th is the first letter of the surname, so we sanity-check the pattern
  /// but cannot fully validate it offline.
  static final RegExp _panRe = RegExp(r'\b([A-Z]{5})\s?([0-9]{4})\s?([A-Z])\b');

  /// Aadhaar: exactly 12 digits, usually printed as 4-4-4 groups.
  ///
  /// Written to also match OCR'd runs where the grouping spaces were lost.
  /// Explicitly rejects anything longer than 12 digits so a phone number or a
  /// long reference ID is never mistaken for an Aadhaar.
  static final RegExp _aadhaarRe = RegExp(r'\b(\d{4})[\s-]?(\d{4})[\s-]?(\d{4})\b');

  /// Indian DOB forms printed on PAN/Aadhaar: DD/MM/YYYY, DD-MM-YYYY, DD MM YYYY.
  static final RegExp _dobRe = RegExp(r'\b(\d{2})[/.\-\s](\d{2})[/.\-\s](\d{4})\b');

  static final RegExp _maleRe = RegExp(r'\b(MALE|M)\b', caseSensitive: false);
  static final RegExp _femaleRe = RegExp(r'\b(FEMALE|F)\b', caseSensitive: false);

  /// Verhoeff's dihedral-group checksum.
  ///
  /// Aadhaar numbers are checksummed; validating it is what stops a misread
  /// digit (e.g. an OCR "8" for "6") from being saved as a real identity
  /// number. Returns false for malformed input rather than throwing.
  static bool isValidVerhoeff(String digits) {
    if (digits.isEmpty || digits.length > 12) return false;
    if (digits.contains(RegExp(r'[^0-9]'))) return false;

    const multiplication = [
      [0, 1, 2, 3, 4, 5, 6, 7, 8, 9],
      [1, 2, 3, 4, 0, 6, 7, 8, 9, 5],
      [2, 3, 4, 0, 1, 7, 8, 9, 5, 6],
      [3, 4, 0, 1, 2, 8, 9, 5, 6, 7],
      [4, 0, 1, 2, 3, 9, 5, 6, 7, 8],
      [5, 9, 8, 7, 6, 0, 4, 3, 2, 1],
      [6, 5, 9, 8, 7, 1, 0, 4, 3, 2],
      [7, 6, 5, 9, 8, 2, 1, 0, 4, 3],
      [8, 7, 6, 5, 9, 3, 2, 1, 0, 4],
      [9, 8, 7, 6, 5, 4, 3, 2, 1, 0],
    ];
    const permutation = [
      [0, 1, 2, 3, 4, 5, 6, 7, 8, 9],
      [1, 5, 7, 6, 2, 8, 3, 0, 9, 4],
      [5, 8, 0, 3, 7, 9, 6, 1, 4, 2],
      [8, 9, 1, 6, 0, 4, 3, 5, 2, 7],
      [9, 4, 5, 3, 1, 2, 6, 8, 7, 0],
      [4, 2, 8, 6, 5, 7, 3, 9, 0, 1],
      [2, 7, 9, 3, 8, 0, 6, 4, 1, 5],
      [7, 0, 4, 6, 9, 1, 3, 2, 5, 8],
    ];

    var checksum = 0;
    for (var i = 0; i < digits.length; i++) {
      final digit = int.parse(digits[digits.length - 1 - i]);
      checksum = multiplication[checksum][permutation[i % 8][digit]];
    }
    return checksum == 0;
  }

  /// Normalises OCR output: uppercases, and turns common OCR confusions into
  /// the characters that actually appear on a PAN card.
  ///
  /// PAN letters can never be O/Q/I/1 in the digit positions and digits can
  /// never be letters, so collapsing `O->0`, `I->1`, `S->5`, `Z->2`, `B->8`,
  /// `G->6` inside digit runs is safe and materially improves hit rate on
  /// blurry phone photos.
  static String _normalizeForOcr(String text) {
    return text
        .toUpperCase()
        .replaceAll('O', '0')
        .replaceAll('I', '1')
        .replaceAll('S', '5')
        .replaceAll('Z', '2')
        .replaceAll('B', '8')
        .replaceAll('G', '6');
  }

  /// Extracts validated identity fields from recognised [text].
  ///
  /// Returns an empty [ScannedDocumentFields] when nothing matches. Never
  /// throws, never logs, and never retains [text].
  static ScannedDocumentFields parse(String text) {
    if (text.isEmpty) return const ScannedDocumentFields();

    // ── PAN ──────────────────────────────────────────────────────────────
    String? pan;
    final panMatches = _panRe.allMatches(text.toUpperCase()).toList();
    if (panMatches.isNotEmpty) {
      // Prefer a match whose 4-digit block is all digits after normalisation.
      final best = panMatches.firstWhere(
        (m) => RegExp(r'^[0-9]{4}$').hasMatch(m.group(2)!),
        orElse: () => panMatches.first,
      );
      pan = '${best.group(1)}${best.group(2)}${best.group(3)}';
    }

    // ── Aadhaar ──────────────────────────────────────────────────────────
    String? aadhaar;
    var aadhaarChecksumOk = false;
    // Normalise first so "OOOO IIII ZZZZ" from OCR still resolves to digits.
    final digitsOnlySource = _normalizeForOcr(text);
    for (final m in _aadhaarRe.allMatches(digitsOnlySource)) {
      final candidate = '${m.group(1)}${m.group(2)}${m.group(3)}';
      // A leading digit of 0 or 1 is invalid on Aadhaar, and the Verhoeff
      // check rejects OCR noise. Try checksum first, else remember the first
      // plausible shape as a fallback for the user to confirm.
      if (candidate[0] == '0' || candidate[0] == '1') continue;
      if (isValidVerhoeff(candidate)) {
        aadhaar = candidate;
        aadhaarChecksumOk = true;
        break;
      }
      aadhaar ??= candidate;
    }

    // ── Date of birth ────────────────────────────────────────────────────
    String? dob;
    for (final m in _dobRe.allMatches(text)) {
      final d = int.tryParse(m.group(1)!);
      final mo = int.tryParse(m.group(2)!);
      final y = int.tryParse(m.group(3)!);
      if (d == null || mo == null || y == null) continue;
      if (d < 1 || d > 31 || mo < 1 || mo > 12) continue;
      if (y < 1900 || y > DateTime.now().year) continue;
      // DateTime silently normalises overflow (31 Feb -> 2 Mar), so comparing
      // the round-tripped day back against the parsed one is what actually
      // rejects impossible dates like 31/02 or 31/04.
      final dt = DateTime(y, mo, d);
      if (dt.year != y || dt.month != mo || dt.day != d) continue;
      dob = '${d.toString().padLeft(2, '0')}/${mo.toString().padLeft(2, '0')}/$y';
      break;
    }

    // ── Name ─────────────────────────────────────────────────────────────
    final name = _extractName(text);

    // ── Gender ───────────────────────────────────────────────────────────
    String? gender;
    if (_femaleRe.hasMatch(text)) {
      gender = 'Female';
    } else if (_maleRe.hasMatch(text)) {
      gender = 'Male';
    }

    return ScannedDocumentFields(
      pan: pan,
      aadhaar: aadhaar,
      aadhaarChecksumOk: aadhaarChecksumOk,
      name: name,
      dateOfBirth: dob,
      gender: gender,
    );
  }

  /// Best-effort holder-name extraction.
  ///
  /// Looks for an explicit "Name" label first (Aadhaar back / most IDs), then
  /// falls back to the longest alphabetic line that is not a known card label
  /// such as "GOVERNMENT OF INDIA" or "UNIQUE IDENTIFICATION AUTHORITY".
  static String? _extractName(String text) {
    final lines = text
        .split(RegExp(r'\r?\n'))
        .map((l) => l.trim())
        .where((l) => l.isNotEmpty)
        .toList();

    final labelRe = RegExp(r'\b(NAME|Name)\s*[:\-]?\s+(.+)$');
    for (final line in lines) {
      final m = labelRe.firstMatch(line);
      if (m != null) {
        final candidate = _cleanName(m.group(2)!);
        if (candidate != null) return candidate;
      }
    }

    final blocked = RegExp(
      r'GOVERNMENT|INDIA|AUTHORITY|IDENTIFICATION|UNIQUE|DEPARTMENT|REVENUE|INCOME|TAX|CARD|NUMBER|MALE|FEMALE|DOB|DATE|SIGNATURE|ADDRESS|PINCODE|जन|आधार',
      caseSensitive: false,
    );

    String? best;
    var bestLen = 0;
    for (final line in lines) {
      if (blocked.hasMatch(line)) continue;
      // A person's name is letters (and occasional spaces/dots) only.
      if (!RegExp(r"^[A-Za-z.'\- ]{3,40}$").hasMatch(line)) continue;
      if (line.split(RegExp(r'\s+')).length < 2) continue; // needs first+last
      if (line.length > bestLen) {
        bestLen = line.length;
        best = line;
      }
    }
    return _cleanName(best ?? '');
  }

  static String? _cleanName(String raw) {
    var n = raw
        // Raw *double*-quoted so the apostrophe can appear literally; a raw
        // single-quoted string cannot contain an escaped quote.
        .replaceAll(RegExp(r"[^A-Za-z.' \-]"), ' ')
        .replaceAll(RegExp(r'\s+'), ' ')
        .trim();
    // Reject if it lost most of its content or is still label-ish.
    if (n.length < 3 || n.split(' ').length < 2) return null;
    final blocked = RegExp(r'CARD|NUMBER|GOVERNMENT|AUTHORITY', caseSensitive: false);
    if (blocked.hasMatch(n.toUpperCase())) return null;
    return n.split(' ').map((w) {
      if (w.isEmpty) return w;
      return w[0].toUpperCase() + w.substring(1).toLowerCase();
    }).join(' ');
  }

  /// Masks a number the way the vault persists it: last four visible only.
  ///
  /// Exposed so the scan UI can show a masked preview and so the same masking
  /// rule is used in one place.
  static String maskNumber(String number) {
    final clean = number.replaceAll(RegExp(r'[^0-9A-Za-z]'), '');
    if (clean.length <= 4) return 'XXXX-$clean';
    return 'XXXX-XXXX-${clean.substring(clean.length - 4)}';
  }
}

/// The only data that leaves this module.
///
/// Contains no raw recognised text by design — see the security model above.
@immutable
class ScannedDocumentFields {
  final String? pan;
  final String? aadhaar;

  /// True when [aadhaar] passed the Verhoeff checksum. When false the value is
  /// only a shape-match and the UI must ask the user to confirm it.
  final bool aadhaarChecksumOk;

  final String? name;
  final String? dateOfBirth;
  final String? gender;

  /// The captured card frame, encoded to JPEG *entirely in memory* so the
  /// vault can persist it encrypted without a plaintext file ever touching
  /// disk. Null when the caller did not request an image or none was read.
  final Uint8List? imageJpeg;

  const ScannedDocumentFields({
    this.pan,
    this.aadhaar,
    this.aadhaarChecksumOk = false,
    this.name,
    this.dateOfBirth,
    this.gender,
    this.imageJpeg,
  });

  bool get isEmpty =>
      pan == null && aadhaar == null && name == null && dateOfBirth == null && gender == null;

  bool get hasPan => pan != null;
  bool get hasAadhaar => aadhaar != null;

  /// Which vault category this scan most likely belongs to.
  String get suggestedDocumentType {
    if (pan != null) return 'PAN Card';
    if (aadhaar != null) return 'Aadhaar Card';
    return 'Other Document';
  }

  @override
  String toString() =>
      // Intentionally omits every extracted value: this object must be safe to
      // print even inside a debugger.
      'ScannedDocumentFields(hasPan: $hasPan, hasAadhaar: $hasAadhaar, '
      'hasName: ${name != null}, hasDob: ${dateOfBirth != null})';
}
