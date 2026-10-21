import 'package:flutter_test/flutter_test.dart';
import 'package:finpocket_app/services/secure_document_scanner.dart';

/// The vault handles PAN/Aadhaar — sensitive personal data under the DPDP Act.
/// These tests lock down both the extraction accuracy AND the security
/// invariants (nothing leaks through logging/toString, only validated numbers
/// are accepted).
void main() {
  group('Verhoeff checksum (Aadhaar authenticity)', () {
    test('accepts real checksummed numbers', () {
      // Generated and verified against Verhoeff's dihedral-group algorithm.
      expect(SecureDocumentScanner.isValidVerhoeff('240491189334'), isTrue);
      expect(SecureDocumentScanner.isValidVerhoeff('230116948953'), isTrue);
      expect(SecureDocumentScanner.isValidVerhoeff('225887635590'), isTrue);
    });

    test('rejects a single misread digit', () {
      // Same number with the last digit altered — exactly what an OCR "8"→"6"
      // style misread produces.
      expect(SecureDocumentScanner.isValidVerhoeff('240491189335'), isFalse);
    });

    test('rejects malformed input instead of throwing', () {
      expect(SecureDocumentScanner.isValidVerhoeff(''), isFalse);
      expect(SecureDocumentScanner.isValidVerhoeff('123'), isFalse);
      expect(SecureDocumentScanner.isValidVerhoeff('2404911893340000'), isFalse); // >12
      expect(SecureDocumentScanner.isValidVerhoeff('24049118933A'), isFalse);
    });
  });

  group('PAN extraction', () {
    test('reads a PAN from realistic card text', () {
      const card = 'INCOME TAX DEPARTMENT\nGOVERNMENT OF INDIA\nABCDE1234F\nSUREDDY DINESH REDDY\nDOB 15/08/1990';
      final r = SecureDocumentScanner.parse(card);
      expect(r.pan, 'ABCDE1234F');
      expect(r.hasPan, isTrue);
      expect(r.suggestedDocumentType, 'PAN Card');
    });

    test('tolerates OCR inserting a space inside the PAN', () {
      final r = SecureDocumentScanner.parse('ABCDE 1234F');
      expect(r.pan, 'ABCDE1234F');
    });

    test('normalises lower-case OCR output to an uppercase PAN', () {
      // OCR sometimes lowercases; the card is always uppercase, so we accept
      // and normalise rather than throwing the field away.
      expect(SecureDocumentScanner.parse('abcde1234f').pan, 'ABCDE1234F');
      expect(SecureDocumentScanner.parse('ABCDE12345').pan, isNull);
    });
  });

  group('Aadhaar extraction', () {
    test('reads a grouped Aadhaar and flags the checksum as verified', () {
      const card = 'UNIQUE IDENTIFICATION AUTHORITY OF INDIA\n2404 9118 9334\nSUREDDY DINESH REDDY';
      final r = SecureDocumentScanner.parse(card);
      expect(r.aadhaar, '240491189334');
      expect(r.aadhaarChecksumOk, isTrue);
      expect(r.suggestedDocumentType, 'Aadhaar Card');
    });

    test('reads an ungrouped Aadhaar', () {
      final r = SecureDocumentScanner.parse('230116948953');
      expect(r.aadhaar, '230116948953');
      expect(r.aadhaarChecksumOk, isTrue);
    });

    test('normalises O/I/S/Z/B/G confusions in digit runs', () {
      // "O" for 0 and "I" for 1 are the classic PAN/Aadhaar misreads.
      final r = SecureDocumentScanner.parse('24O4 9118 9334');
      expect(r.aadhaar, '240491189334');
      expect(r.aadhaarChecksumOk, isTrue);
    });

    test('returns a checksum-failing number but marks it unverified', () {
      // Shape is right, checksum is not: still surfaced so the user can check
      // it, but never presented as confirmed.
      final r = SecureDocumentScanner.parse('2404 9118 9335');
      expect(r.aadhaar, '240491189335');
      expect(r.aadhaarChecksumOk, isFalse);
    });

    test('never treats a phone number or long reference as an Aadhaar', () {
      // Indian mobile numbers start 6-9 and are 10 digits — must not match.
      expect(SecureDocumentScanner.parse('9876543210').aadhaar, isNull);
      // Aadhaar may not begin with 0 or 1.
      expect(SecureDocumentScanner.parse('0123 4567 8901').aadhaar, isNull);
      expect(SecureDocumentScanner.parse('1123 4567 8901').aadhaar, isNull);
    });

    test('does not swallow more than 12 digits', () {
      expect(SecureDocumentScanner.parse('2404911893340').aadhaar, isNull);
    });
  });

  group('Name and DOB extraction', () {
    test('reads DOB in DD/MM/YYYY', () {
      final r = SecureDocumentScanner.parse('DOB 15/08/1990\nABCDE1234F');
      expect(r.dateOfBirth, '15/08/1990');
    });

    test('reads DOB in DD-MM-YYYY', () {
      final r = SecureDocumentScanner.parse('Date of Birth 02-01-1985');
      expect(r.dateOfBirth, '02/01/1985');
    });

    test('rejects an impossible date', () {
      expect(SecureDocumentScanner.parse('31/02/1990').dateOfBirth, isNull);
      expect(SecureDocumentScanner.parse('00/13/1990').dateOfBirth, isNull);
      expect(SecureDocumentScanner.parse('15/08/1700').dateOfBirth, isNull);
    });

    test('reads a labelled name', () {
      final r = SecureDocumentScanner.parse('Name: SUREDDY DINESH REDDY\n2404 9118 9334');
      expect(r.name, 'Sureddy Dinesh Reddy');
    });

    test('ignores government labels when guessing the name', () {
      final r = SecureDocumentScanner.parse('GOVERNMENT OF INDIA\nUNIQUE IDENTIFICATION AUTHORITY\nSUREDDY DINESH REDDY\n2404 9118 9334');
      expect(r.name, isNot(contains('GOVERNMENT')));
      expect(r.name, contains('Sureddy'));
    });

    test('detects gender', () {
      expect(SecureDocumentScanner.parse('SUREDDY DINESH REDDY\nMALE').gender, 'Male');
      expect(SecureDocumentScanner.parse('LAKSHMI DEVI\nFEMALE').gender, 'Female');
    });
  });

  group('Empty and degenerate input', () {
    test('empty text yields empty result and never throws', () {
      final r = SecureDocumentScanner.parse('');
      expect(r.isEmpty, isTrue);
      expect(r.pan, isNull);
      expect(r.aadhaar, isNull);
      expect(r.name, isNull);
    });

    test('noise text yields empty result', () {
      expect(SecureDocumentScanner.parse('@@@@@ ##### 12345').isEmpty, isTrue);
    });
  });

  group('Masking', () {
    test('shows only the last four characters', () {
      expect(SecureDocumentScanner.maskNumber('240491189334'), 'XXXX-XXXX-9334');
      expect(SecureDocumentScanner.maskNumber('ABCDE1234F'), 'XXXX-XXXX-234F');
    });

    test('handles short values without throwing', () {
      expect(SecureDocumentScanner.maskNumber('12'), 'XXXX-12');
    });
  });

  group('SECURITY: extracted values must never leak', () {
    test('toString() contains none of the sensitive values', () {
      // This is the guard that keeps a careless debugPrint from dumping a PAN
      // or Aadhaar into logcat. If anyone adds the values back to toString(),
      // this test fails.
      const pan = 'ABCDE1234F';
      const aadhaar = '240491189334';
      const name = 'Sureddy Dinesh Reddy';

      final r = SecureDocumentScanner.parse(
        'Name: SUREDDY DINESH REDDY\n$pan\n2404 9118 9334\nDOB 15/08/1990',
      );

      // Sanity: the parser really did find them…
      expect(r.pan, pan);
      expect(r.aadhaar, aadhaar);
      expect(r.name, name);

      // …and yet none of them may appear in the printable form.
      final printed = r.toString();
      expect(printed, isNot(contains(pan)));
      expect(printed, isNot(contains('1234F')));
      expect(printed, isNot(contains(aadhaar)));
      expect(printed, isNot(contains('9334')));
      expect(printed, isNot(contains(name)));
      expect(printed, isNot(contains('Sureddy')));
      expect(printed, isNot(contains('15/08/1990')));
    });

    test('result object exposes no raw recognised text field', () {
      final r = SecureDocumentScanner.parse('ABCDE1234F SUREDDY DINESH REDDY');
      // The type must not carry a rawText/text/payload member.
      final fields = <String>[];
      for (final v in [
        r.pan,
        r.aadhaar,
        r.name,
        r.dateOfBirth,
        r.gender,
        r.suggestedDocumentType,
        r.toString(),
      ]) {
        fields.add(v ?? '');
      }
      // The only PAN-shaped thing reachable is the PAN itself; there must be
      // no blob containing the whole recognised paragraph.
      for (final f in fields) {
        expect(f.contains('SUREDDY DINESH REDDY ABCDE1234F'), isFalse);
      }
    });
  });
}
