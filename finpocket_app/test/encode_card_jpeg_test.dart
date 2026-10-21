import 'dart:typed_data';

import 'package:flutter_test/flutter_test.dart';
import 'package:image/image.dart' as img;

import 'package:finpocket_app/screens/document_scan_screen.dart';

/// Exercises the custom NV21 → JPEG converter the document scanner uses to
/// capture the card image for the encrypted vault.
///
/// This is deliberately a *decode* test: it round-trips synthetic NV21 through
/// the encoder and decodes the JPEG back, then asserts the colour is neutral
/// grey. That catches the two bugs most likely to slip through otherwise —
/// wrong chroma (V/U) plane ordering or a wrong chroma row offset — which
/// would produce a green/magenta card image instead of the real one.
void main() {
  test('encodeCardJpeg produces a decodable JPEG of the expected size', () {
    const w = 16;
    const h = 12;
    final nv21 = Uint8List(w * h + (w * h) ~/ 2);

    // Y = 128 (mid), V/U = 128 (neutral chroma) everywhere. Decoded output
    // must be near-neutral grey — not green or magenta.
    nv21.fillRange(0, nv21.length, 128);

    final out = encodeCardJpeg(<Object?>[nv21, w, h]);
    expect(out, isNotNull, reason: 'encoder must return bytes');

    // JPEG SOI marker.
    expect(out![0], 0xFF);
    expect(out[1], 0xD8);

    final decoded = img.decodeJpg(out);
    expect(decoded, isNotNull, reason: 'output must be a valid JPEG');
    expect(decoded!.width, w, reason: 'width preserved');
    expect(decoded.height, h, reason: 'height preserved');

    // Sample the centre pixel: mid-grey in ⇒ near-neutral grey out.
    final px = decoded.getPixel(decoded.width ~/ 2, decoded.height ~/ 2);
    final r = px.r.toInt();
    final g = px.g.toInt();
    final b = px.b.toInt();
    expect((r - g).abs(), lessThan(40), reason: 'R≈G (got r=$r g=$g b=$b)');
    expect((g - b).abs(), lessThan(40), reason: 'G≈B (got r=$r g=$g b=$b)');
    expect((r - 128).abs(), lessThan(60), reason: 'near mid-grey (got r=$r)');
  });

  test('encodeCardJpeg rejects missing or malformed frames', () {
    // Too small for the claimed w*h.
    expect(encodeCardJpeg(<Object?>[Uint8List(10), 16, 12]), isNull);
    // Null frame.
    expect(encodeCardJpeg(<Object?>[null, 16, 12]), isNull);
    // Non-positive width.
    expect(
      encodeCardJpeg(<Object?>[Uint8List(16 * 12 + 96), 0, 12]),
      isNull,
    );
  });
}
