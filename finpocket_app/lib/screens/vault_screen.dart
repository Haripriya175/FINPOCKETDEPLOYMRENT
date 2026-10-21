import 'dart:io';
import 'dart:typed_data';

import 'package:flutter/material.dart';
import 'package:path_provider/path_provider.dart';
import 'package:provider/provider.dart';
import 'package:share_plus/share_plus.dart';
import '../models/models.dart';
import '../providers/app_state.dart';
import '../services/account_reauth_service.dart';
import '../services/secure_document_scanner.dart';
import '../services/secure_vault_service.dart';
import '../theme/app_theme.dart';
import '../widgets/pin_dialog.dart';
import '../widgets/pin_setup_dialog.dart';
import 'document_scan_screen.dart';

class VaultScreen extends StatefulWidget {
  final VoidCallback? onBack;

  const VaultScreen({super.key, this.onBack});

  @override
  State<VaultScreen> createState() => _VaultScreenState();
}

class _VaultScreenState extends State<VaultScreen> {
  String _selectedCategory = 'ALL';

  String _formatDate(DateTime dt) {
    final months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    return '${dt.day} ${months[dt.month - 1]} ${dt.year}';
  }

  void _handleBack(BuildContext context) {
    if (Navigator.canPop(context)) {
      Navigator.pop(context);
    } else if (widget.onBack != null) {
      widget.onBack!();
    }
  }

  void _showDocument(BuildContext context, DocumentItem doc) {
    final state = Provider.of<AppState>(context, listen: false);

    _authorizeVaultAction(
      context,
      state,
      action: 'decrypt and view ${doc.name}',
      onAuthorized: () async {
        VaultDocumentDetail? detail;
        try {
          // The vault is already open here (the gate unlocked it), so this is
          // just an AES-GCM read of the record.
          detail = await SecureVaultService.instance.openBlob(doc.id);
        } catch (_) {
          // No encrypted blob — a legacy metadata-only entry (saved before
          // this upgrade). Fall back to showing what the index holds rather
          // than a confusing "decrypt failed" error.
          detail = null;
        }
        if (!context.mounted) return;
        _showDecryptedDocument(context, state, doc, detail);
      },
    );
  }

  /// Opens the vault for [action], then runs [onAuthorized].
  ///
  /// - First-time users choose their own PIN (4–8 digits) *before* anything
  ///   is stored — the vault never has a PIN the user didn't pick.
  /// - Returning users enter that PIN; it is verified cryptographically
  ///   (PBKDF2 + AES-GCM self-test), never by comparing a stored value.
  /// - Legacy vaults (keyed to the old App PIN) still open with that PIN, but
  ///   are offered a one-tap path to choose a PIN of their own.
  Future<void> _authorizeVaultAction(
    BuildContext context,
    AppState state, {
    required String action,
    required VoidCallback onAuthorized,
  }) async {
    final service = SecureVaultService.instance;

    if (!await service.isPinSet) {
      // Nothing is protected yet — the user picks the PIN right now.
      if (!context.mounted) return;
      await showDialog(
        context: context,
        builder: (pinCtx) => PinSetupDialog(
          title: 'Create your Vault PIN',
          subtitle:
              'Choose a 4–8 digit PIN — it becomes the only key to your documents.',
          onCompleted: (pin) {
            Navigator.of(pinCtx).pop();
            _finishWithVaultWork(
              context,
              work: () => service.createPin(pin),
              onDone: onAuthorized,
              failureMessage:
                  'Could not create your Vault PIN. Nothing was stored — please try again.',
            );
          },
        ),
      );
      return;
    }

    final userChosen = await service.isUserChosenPin;
    // The PIN can be 4–8 digits; ask for exactly as many as were chosen.
    final pinLen = await service.pinLength;
    if (!context.mounted) return;
    await showDialog(
      context: context,
      builder: (pinCtx) => PinDialog(
        title: 'Unlock Document Vault',
        subtitle: userChosen
            ? 'Enter your $pinLen-digit Vault PIN to $action.'
            : 'Enter your App PIN to $action.',
        length: pinLen,
        // Never hint at a PIN the user chose themselves; the demo hint only
        // makes sense for vaults still keyed to the old App PIN.
        showDemoHint: !userChosen,
        footer: userChosen
            ? null
            : _LegacyPinFooter(onChooseOwn: () {
                Navigator.of(pinCtx).pop();
                _changeVaultPin(context, state);
              }),
        onValidate: (pin) async {
          try {
            await service.unlock(pin); // throws StateError on a wrong PIN
            return true;
          } catch (_) {
            return false;
          }
        },
        onSuccess: onAuthorized,
      ),
    );
  }

  /// Runs [work] behind a blocking progress overlay (key derivation and
  /// re-keying are deliberately slow), then calls [onDone] — or surfaces
  /// [failureMessage] if the work failed.
  Future<void> _finishWithVaultWork(
    BuildContext context, {
    required Future<void> Function() work,
    required VoidCallback onDone,
    required String failureMessage,
  }) async {
    final navigator = Navigator.of(context, rootNavigator: true);
    navigator.push(
      PageRouteBuilder(
        opaque: false,
        barrierDismissible: false,
        pageBuilder: (_, _, _) =>
            const Center(child: CircularProgressIndicator()),
      ),
    );

    var ok = true;
    try {
      await work();
    } catch (_) {
      ok = false;
    } finally {
      if (navigator.canPop()) navigator.pop();
    }

    if (!context.mounted) return;
    if (ok) {
      onDone();
    } else {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          backgroundColor: AppTheme.danger,
          content: Text(failureMessage),
        ),
      );
    }
  }

  /// The change-Vault-PIN flow.
  ///
  /// Legitimacy first: the FinPocket account is re-authenticated *and* the
  /// current Vault PIN is verified. Only then is a new PIN chosen (twice) and
  /// every record in the vault re-keyed. Legacy App-PIN-keyed vaults take the
  /// same path — for them "the current PIN" simply *is* the App PIN, and
  /// finishing the flow migrates them onto a user-chosen PIN.
  Future<void> _changeVaultPin(BuildContext context, AppState state) async {
    final service = SecureVaultService.instance;
    final messenger = ScaffoldMessenger.of(context);

    // Legacy vaults (keyed to the old App PIN, no metadata file) word this
    // step differently so the user knows which PIN to reach for. Their PIN is
    // whatever length they chose — the dialog must match it digit for digit.
    final legacy = await service.isPinSet && !await service.isUserChosenPin;
    final currentPinLen = legacy ? 4 : await service.pinLength;
    if (!context.mounted) return;

    // 1. Prove the human still owns the FinPocket account.
    final gate = await _reauthenticateAccount(context, state);
    if (gate.cancelled || !context.mounted) return;
    if (gate.error != null) {
      messenger.showSnackBar(
        SnackBar(
          backgroundColor: AppTheme.danger,
          content: Text(gate.error!),
        ),
      );
      return;
    }

    // 2. Prove knowledge of the current Vault PIN.
    var confirmed = false;
    String? currentPin;
    await showDialog(
      context: context,
      builder: (pinCtx) => PinDialog(
        title: legacy ? 'Confirm your App PIN' : 'Confirm current PIN',
        subtitle: legacy
            ? 'This vault was secured with your App PIN. Verify it once, then choose your own.'
            : 'Enter your current Vault PIN before setting a new one.',
        length: currentPinLen,
        showDemoHint: legacy,
        onValidate: (pin) async {
          try {
            await service.unlock(pin);
            currentPin = pin;
            confirmed = true;
            return true;
          } catch (_) {
            return false;
          }
        },
        onSuccess: () {},
      ),
    );
    if (!confirmed || currentPin == null || !context.mounted) return;

    // 3. Choose the new PIN (entered twice).
    String? newPin;
    await showDialog(
      context: context,
      builder: (pinCtx) => PinSetupDialog(
        title: legacy ? 'Choose your Vault PIN' : 'Choose your new PIN',
        onCompleted: (pin) {
          Navigator.of(pinCtx).pop();
          newPin = pin;
        },
      ),
    );
    if (newPin == null || !context.mounted) return;

    // 4. Re-key every record (with rollback safety inside the service).
    await _finishWithVaultWork(
      context,
      work: () => service.changePin(oldPin: currentPin!, newPin: newPin!),
      onDone: () => messenger.showSnackBar(
        const SnackBar(
          content:
              Text('Vault PIN changed — every document was re-encrypted.'),
        ),
      ),
      failureMessage:
          'Could not change the PIN. Your documents are still protected by the current PIN.',
    );
  }

  /// Re-verifies the signed-in account. Backing out is not an error — the
  /// caller just receives [cancelled] and stays silent.
  Future<_ReauthResult> _reauthenticateAccount(
      BuildContext context, AppState state) async {
    final user = state.currentUser;
    if (user == null || user.email.isEmpty) {
      return const _ReauthResult.failed(
          'Please sign in again before changing your Vault PIN.');
    }

    if (user.isGoogleLinked) {
      final error =
          await AccountReauthService.verifyGoogle(expectedEmail: user.email);
      if (error == null) return const _ReauthResult.ok();
      if (error == 'cancelled') return const _ReauthResult.cancelled();
      return _ReauthResult.failed(error);
    }

    final verified = await showDialog<bool>(
      context: context,
      builder: (ctx) => _PasswordReauthDialog(email: user.email),
    );
    return verified == true
        ? const _ReauthResult.ok()
        : const _ReauthResult.cancelled();
  }

  /// Renders the fully-decrypted document: the actual stored card image plus
  /// the complete number and holder details. Reached only after a successful
  /// PIN unlock — the plaintext lives in this frame only and is never
  /// re-persisted anywhere.
  void _showDecryptedDocument(
    BuildContext context,
    AppState state,
    DocumentItem doc,
    VaultDocumentDetail? detail, // null = legacy entry with no encrypted blob
  ) {
    final image = detail?.imageBytes;
    final docType = detail?.documentType ?? doc.documentType;
    final number = detail?.fullNumber ?? doc.maskedNumber ?? '—';
    final holder =
        detail?.holderName ?? state.currentUser?.fullName ?? 'Verified Member';
    final dob = detail?.dateOfBirth;
    final gender = detail?.gender;
    final expiry = detail?.expiryDate;

    showDialog(
      context: context,
      builder: (viewCtx) => AlertDialog(
              backgroundColor: const Color(0xFF0F172A),
              shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(20)),
              title: Row(
                children: [
                  Container(
                    width: 34,
                    height: 34,
                    decoration: BoxDecoration(
                      color: AppTheme.primary.withOpacity(0.15),
                      borderRadius: BorderRadius.circular(8),
                    ),
                    alignment: Alignment.center,
                    child: const Icon(Icons.verified_user_rounded, color: AppTheme.primary, size: 20),
                  ),
                  const SizedBox(width: 10),
                  Expanded(
                    child: Text(
                      doc.name,
                      style: const TextStyle(color: Colors.white, fontSize: 16, fontWeight: FontWeight.bold),
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                    ),
                  ),
                ],
              ),
              content: SingleChildScrollView(
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    if (image != null) ...[
                      ClipRRect(
                        borderRadius: BorderRadius.circular(12),
                        child: Container(
                          width: double.infinity,
                          height: 190,
                          color: const Color(0xFF0B1220),
                          alignment: Alignment.center,
                          child: Image.memory(
                            image,
                            fit: BoxFit.contain,
                            gaplessPlayback: true,
                          ),
                        ),
                      ),
                      const SizedBox(height: 4),
                      const Text(
                        'Decrypted image — visible only while the vault is unlocked.',
                        style: TextStyle(fontSize: 10, color: Color(0xFF64748B)),
                      ),
                      const SizedBox(height: 12),
                    ],
                    if (detail == null) ...[
                      Container(
                        width: double.infinity,
                        padding: const EdgeInsets.all(12),
                        decoration: BoxDecoration(
                          color: const Color(0xFFF59E0B).withOpacity(0.10),
                          borderRadius: BorderRadius.circular(10),
                          border: Border.all(
                              color: const Color(0xFFF59E0B).withOpacity(0.3)),
                        ),
                        child: const Text(
                          'Older entry saved before encrypted images were added. Re-scan this document to upgrade it to a full encrypted copy.',
                          style: TextStyle(
                              fontSize: 11, height: 1.35, color: Color(0xFFF59E0B)),
                        ),
                      ),
                      const SizedBox(height: 12),
                    ],
                    Container(
                      width: double.infinity,
                      padding: const EdgeInsets.all(18),
                    decoration: BoxDecoration(
                      color: const Color(0xFF1E293B),
                      borderRadius: BorderRadius.circular(16),
                      border: Border.all(color: AppTheme.primary.withOpacity(0.3)),
                    ),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Row(
                          mainAxisAlignment: MainAxisAlignment.spaceBetween,
                          children: [
                            // Flexible so the badge can never be pushed out of
                            // the card on narrow screens (it overflowed by 19px).
                            Expanded(
                              child: Text(
                                'OFFICIAL DOCUMENT RECORD',
                                overflow: TextOverflow.ellipsis,
                                style: TextStyle(color: AppTheme.primary, fontWeight: FontWeight.w800, fontSize: 10, letterSpacing: 0.5),
                              ),
                            ),
                            const SizedBox(width: 8),
                            Container(
                              padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                              decoration: BoxDecoration(
                                color: const Color(0xFF10B981).withOpacity(0.15),
                                borderRadius: BorderRadius.circular(4),
                              ),
                              child: Text(
                                detail != null ? 'AES-256' : 'LEGACY',
                                style: TextStyle(
                                  color: detail != null
                                      ? const Color(0xFF10B981)
                                      : const Color(0xFFF59E0B),
                                  fontSize: 9,
                                  fontWeight: FontWeight.bold,
                                ),
                              ),
                            ),
                          ],
                        ),
                        const SizedBox(height: 10),
                        Text(
                          docType,
                          style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 16, color: Colors.white),
                        ),
                        const SizedBox(height: 8),
                        Text(
                          // The COMPLETE number, decrypted — the whole point of
                          // the upgrade. Falls back to the masked index value
                          // only for legacy metadata-only entries.
                          number,
                          style: const TextStyle(fontSize: 18, letterSpacing: 2, fontWeight: FontWeight.w800, color: Colors.white),
                        ),
                        const Divider(height: 24, color: Color(0xFF334155)),
                        Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            _kvRow('Document Holder', holder),
                            if (dob != null) _kvRow('Date of Birth', dob),
                            if (gender != null) _kvRow('Gender', gender),
                            if (expiry != null) _kvRow('Expiry', _formatDate(expiry)),
                            _kvRow('Vault Storage Date', _formatDate(doc.uploadDate)),
                          ],
                        ),
                      ],
                    ),
                  ),
                ],
              ),
              ),
              actions: [
                TextButton.icon(
                  icon: const Icon(Icons.delete_outline, size: 16, color: AppTheme.danger),
                  label: const Text('Delete', style: TextStyle(color: AppTheme.danger)),
                  onPressed: () {
                    Navigator.pop(viewCtx);
                    _confirmDeleteDocument(context, state, doc);
                  },
                ),
                ElevatedButton.icon(
                  style: ElevatedButton.styleFrom(backgroundColor: AppTheme.primary, foregroundColor: Colors.white),
                  icon: const Icon(Icons.download_rounded, size: 16),
                  label: const Text('Export Record'),
                  onPressed: () {
                    Navigator.pop(viewCtx);
                    _exportDocumentRecord(context, doc);
                  },
                ),
              ],
            ),
          );
  }

  /// A label/value row for the decrypted document details.
  Widget _kvRow(String label, String value) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 8),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          SizedBox(
            width: 112,
            child: Text(label, style: const TextStyle(fontSize: 11, color: Color(0xFF94A3B8))),
          ),
          Expanded(
            child: Text(
              value,
              maxLines: 2,
              overflow: TextOverflow.ellipsis,
              style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w700, color: Colors.white),
            ),
          ),
        ],
      ),
    );
  }

  /// Export a reference text record of the document's details.
  ///
  /// Deliberately exports only the MASKED number and metadata, never the full
  /// number or the image — this file is written to disk and handed to other
  /// apps through the share sheet, so it must not leak the sensitive values
  /// that the AES-256 vault exists to protect.
  Future<void> _exportDocumentRecord(BuildContext context, DocumentItem doc) async {
    final messenger = ScaffoldMessenger.of(context);
    try {
      final record = StringBuffer()
        ..writeln('FinPocket Vault — Document Record')
        ..writeln('=================================')
        ..writeln('Name: ${doc.name}')
        ..writeln('Type: ${doc.documentType}')
        ..writeln('Number: ${doc.maskedNumber ?? '—'}')
        ..writeln('Expiry: ${doc.expiryDate != null ? _formatDate(doc.expiryDate!) : '—'}')
        ..writeln('Saved: ${_formatDate(doc.uploadDate)}')
        ..writeln()
        ..writeln('Reference record only. The full number and any image stay encrypted in the vault and are never exported in plaintext.');

      final dir = await getApplicationDocumentsDirectory();
      final file = File('${dir.path}/finpocket_${doc.id}.txt');
      await file.writeAsString(record.toString(), flush: true);

      await Share.shareXFiles(
        [XFile(file.path)],
        text: 'FinPocket vault record for ${doc.name}',
      );
    } catch (e) {
      messenger.showSnackBar(
        SnackBar(
          backgroundColor: const Color(0xFFEF4444),
          content: Text('Couldn’t export record: $e'),
        ),
      );
    }
  }

  void _confirmDeleteDocument(BuildContext context, AppState state, DocumentItem doc) {
    showDialog(
      context: context,
      builder: (ctx) => AlertDialog(
        backgroundColor: const Color(0xFF0F172A),
        title: const Text('Remove Document?'),
        content: Text('Are you sure you want to permanently delete "${doc.name}" from your Secure Vault? This cannot be undone.'),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx), child: const Text('Cancel')),
          ElevatedButton(
            style: ElevatedButton.styleFrom(backgroundColor: AppTheme.danger, foregroundColor: Colors.white),
            onPressed: () async {
              // Capture the messenger BEFORE popping so we never use this
              // context after the dialog is gone.
              final messenger = ScaffoldMessenger.of(context);
              Navigator.pop(ctx);
              // Removes the list entry and destroys the encrypted blob.
              await state.deleteDocument(doc.id);
              messenger.showSnackBar(
                SnackBar(
                  backgroundColor: AppTheme.danger,
                  content: Text('"${doc.name}" removed from vault.'),
                ),
              );
            },
            child: const Text('Delete Permanently'),
          ),
        ],
      ),
    );
  }

  void _showUploadDialog(BuildContext context, AppState state) {
    final nameController = TextEditingController();
    final numberController = TextEditingController();
    String selectedDocType = 'PAN Card';
    final isDark = Theme.of(context).brightness == Brightness.dark;

    // Carried from the scanner to the PIN-authorized save, in memory only.
    // The encrypted blob is the sole store for these — nothing here is
    // written to SharedPreferences or anywhere else.
    String? pendingHolderName;
    String? pendingDob;
    String? pendingGender;
    Uint8List? pendingImage;

    final docTypeOptions = [
      {'label': 'PAN Card', 'defaultName': 'Income Tax PAN Card', 'hint': 'e.g. ABCDE1234F'},
      {'label': 'Aadhaar Card', 'defaultName': 'Aadhaar National Identity', 'hint': 'e.g. 1234 5678 9012'},
      {'label': 'Passport', 'defaultName': 'Republic of India Passport', 'hint': 'e.g. Z1234567'},
      {'label': 'Driving License', 'defaultName': 'State Driving License', 'hint': 'e.g. DL-0420110012345'},
      {'label': 'Salary Slip', 'defaultName': 'Monthly Salary Slip', 'hint': 'e.g. SLIP-2026/06'},
      {'label': 'ITC Document', 'defaultName': 'Input Tax Credit (ITC) / ITR', 'hint': 'e.g. ITC-2026-REF'},
      {'label': 'Health Insurance', 'defaultName': 'Star Health Insurance Policy', 'hint': 'e.g. POL-984210'},
      {'label': 'Other Document', 'defaultName': 'Personal Financial Document', 'hint': 'e.g. Document Reference ID'},
    ];

    nameController.text = docTypeOptions.first['defaultName']!;

    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      builder: (ctx) => StatefulBuilder(
        builder: (bottomSheetCtx, setModalState) => Container(
          padding: EdgeInsets.only(
            left: 20,
            right: 20,
            top: 20,
            bottom: MediaQuery.of(ctx).viewInsets.bottom + 24,
          ),
          decoration: BoxDecoration(
            color: isDark ? const Color(0xFF0F172A) : Colors.white,
            borderRadius: const BorderRadius.vertical(top: Radius.circular(24)),
            border: Border.all(color: isDark ? const Color(0xFF1E293B) : const Color(0xFFE2E8F0)),
          ),
          child: SingleChildScrollView(
            child: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Center(
                  child: Container(
                    width: 40,
                    height: 4,
                    margin: const EdgeInsets.only(bottom: 16),
                    decoration: BoxDecoration(
                      color: Colors.grey.withOpacity(0.3),
                      borderRadius: BorderRadius.circular(2),
                    ),
                  ),
                ),
                Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [
                    const Row(
                      children: [
                        Icon(Icons.shield_rounded, color: AppTheme.primary, size: 22),
                        SizedBox(width: 8),
                        Text(
                          'Upload to Secure Vault',
                          style: TextStyle(fontSize: 18, fontWeight: FontWeight.w800),
                        ),
                      ],
                    ),
                    IconButton(
                      icon: const Icon(Icons.close, size: 20),
                      onPressed: () => Navigator.pop(ctx),
                    ),
                  ],
                ),
                const SizedBox(height: 6),
                const Text(
                  'Encrypts your document — the scanned image plus full details (number, name, DOB) — with AES-256 on this device. Only your PIN decrypts it.',
                  style: TextStyle(fontSize: 12, color: Color(0xFF94A3B8)),
                ),
                const SizedBox(height: 14),

                // ── On-device camera scan ────────────────────────────────
                // Reads the card with ML Kit running locally, prefills the
                // type + number below, and nothing is saved until the user
                // taps Add. The captured image never touches disk and the
                // full number is masked before it is persisted.
                SizedBox(
                  width: double.infinity,
                  child: OutlinedButton.icon(
                    style: OutlinedButton.styleFrom(
                      foregroundColor: AppTheme.primary,
                      side: BorderSide(color: AppTheme.primary.withOpacity(0.6)),
                      padding: const EdgeInsets.symmetric(vertical: 12),
                      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                    ),
                    icon: const Icon(Icons.document_scanner_rounded, size: 20),
                    label: const Text(
                      'Scan card with camera to autofill',
                      style: TextStyle(fontWeight: FontWeight.w700, fontSize: 13),
                    ),
                    onPressed: () async {
                      final scanned = await Navigator.push<ScannedDocumentFields>(
                        context,
                        MaterialPageRoute(builder: (_) => const DocumentScanScreen()),
                      );
                      // Nothing found or the user backed out.
                      if (scanned == null || scanned.isEmpty) return;

                      // Capture the decrypted-detail candidates + image for the
                      // encrypted save. The full number also lands in
                      // numberController (kept in memory until the user saves).
                      pendingHolderName = scanned.name;
                      pendingDob = scanned.dateOfBirth;
                      pendingGender = scanned.gender;
                      pendingImage = scanned.imageJpeg;

                      // Prefill only the machine-read values. Deliberately NOT
                      // filling the document *name* with the holder's legal
                      // name — that would persist it as plaintext metadata.
                      setModalState(() {
                        if (scanned.pan != null) {
                          selectedDocType = 'PAN Card';
                          nameController.text = 'Income Tax PAN Card';
                          numberController.text = scanned.pan!;
                        } else if (scanned.aadhaar != null) {
                          selectedDocType = 'Aadhaar Card';
                          nameController.text = 'Aadhaar National Identity';
                          numberController.text = scanned.aadhaar!;
                        } else if (scanned.name != null) {
                          // Name-only hit: keep whatever type is selected and
                          // show it so the user can confirm it matches.
                          nameController.text = scanned.name!;
                        }
                      });
                    },
                  ),
                ),
                const SizedBox(height: 6),
                const Text(
                  'Processed on this device only. If you save, the card image is encrypted with AES-256 and never uploaded — only your PIN can open it.',
                  style: TextStyle(fontSize: 10.5, color: Color(0xFF64748B)),
                ),
                const SizedBox(height: 16),

                // Document Type Selection
                const Text(
                  'Select Document Type',
                  style: TextStyle(fontSize: 12, fontWeight: FontWeight.w700),
                ),
                const SizedBox(height: 8),
                DropdownButtonFormField<String>(
                  value: selectedDocType,
                  decoration: InputDecoration(
                    border: OutlineInputBorder(borderRadius: BorderRadius.circular(12)),
                    contentPadding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
                  ),
                  items: docTypeOptions.map((opt) {
                    return DropdownMenuItem<String>(
                      value: opt['label']!,
                      child: Text(opt['label']!, style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w600)),
                    );
                  }).toList(),
                  onChanged: (val) {
                    if (val != null) {
                      setModalState(() {
                        selectedDocType = val;
                        final match = docTypeOptions.firstWhere((o) => o['label'] == val);
                        nameController.text = match['defaultName']!;
                      });
                    }
                  },
                ),
                const SizedBox(height: 14),

                // Display Name
                TextField(
                  controller: nameController,
                  decoration: InputDecoration(
                    labelText: 'Document Name',
                    hintText: 'e.g. DigiLocker PAN Card',
                    border: OutlineInputBorder(borderRadius: BorderRadius.circular(12)),
                  ),
                ),
                const SizedBox(height: 14),

                // Document ID Number
                TextField(
                  controller: numberController,
                  decoration: InputDecoration(
                    labelText: 'Document Number / ID (Optional)',
                    hintText: docTypeOptions.firstWhere((o) => o['label'] == selectedDocType)['hint'],
                    border: OutlineInputBorder(borderRadius: BorderRadius.circular(12)),
                  ),
                ),
                const SizedBox(height: 16),

                // Note: this vault now encrypts the real contents (scanned
                // image + full details) with AES-256 via SecureVaultService.
                // The old UI showed a fake attached file ("_scanned.pdf •
                // 1.4 MB • Ready for 256-bit AES") that was never stored —
                // now the badge reflects an actually-encrypted blob.
                Container(
                  padding: const EdgeInsets.all(12),
                  decoration: BoxDecoration(
                    color: AppTheme.primary.withOpacity(0.06),
                    borderRadius: BorderRadius.circular(12),
                    border: Border.all(color: AppTheme.primary.withOpacity(0.2)),
                  ),
                  child: const Row(
                    children: [
                      Icon(Icons.info_outline_rounded, color: AppTheme.primary, size: 20),
                      SizedBox(width: 10),
                      Expanded(
                        child: Text(
                          'Encrypted on this device with AES-256 and sealed with your PIN. Nothing is ever uploaded to a server — your document never leaves this handset.',
                          style: TextStyle(fontSize: 11, height: 1.35, color: Color(0xFF94A3B8)),
                        ),
                      ),
                    ],
                  ),
                ),
                const SizedBox(height: 20),

                // Upload & Encrypt Action
                SizedBox(
                  width: double.infinity,
                  height: 48,
                  child: ElevatedButton.icon(
                    style: ElevatedButton.styleFrom(
                      backgroundColor: AppTheme.primary,
                      foregroundColor: Colors.white,
                      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                    ),
                    icon: const Icon(Icons.lock_rounded, size: 18),
                    label: const Text(
                      'Authenticate PIN & Save to Vault',
                      style: TextStyle(fontWeight: FontWeight.w700, fontSize: 13),
                    ),
                    onPressed: () {
                      final name = nameController.text.trim();
                      if (name.isEmpty) {
                        ScaffoldMessenger.of(context).showSnackBar(
                          const SnackBar(content: Text('Please enter a document name.')),
                        );
                        return;
                      }

                      final docNumber = numberController.text.trim();
                      // Copy the pending scan data into locals so the sheet's
                      // disposal (below) cannot affect the async save.
                      final docType = selectedDocType;
                      final holder = pendingHolderName;
                      final dob = pendingDob;
                      final gender = pendingGender;
                      final image = pendingImage;
                      Navigator.pop(ctx);

                      // The gate opens the vault first — creating a PIN for
                      // first-time users, or asking for the existing one —
                      // and only then is the document sealed into it.
                      final messenger = ScaffoldMessenger.of(context);
                      _authorizeVaultAction(
                        context,
                        state,
                        action: 'securely save "$name"',
                        onAuthorized: () {
                          _finishWithVaultWork(
                            context,
                            work: () => state.addDocument(
                              name: name,
                              documentType: docType,
                              documentNumber:
                                  docNumber.isNotEmpty ? docNumber : null,
                              holderName: holder,
                              dateOfBirth: dob,
                              gender: gender,
                              imageBytes: image,
                            ),
                            onDone: () => messenger.showSnackBar(
                              SnackBar(
                                backgroundColor: const Color(0xFF10B981),
                                behavior: SnackBarBehavior.floating,
                                shape: RoundedRectangleBorder(
                                    borderRadius: BorderRadius.circular(10)),
                                content: Row(
                                  children: [
                                    const Icon(Icons.check_circle_rounded,
                                        color: Colors.white),
                                    const SizedBox(width: 10),
                                    Expanded(
                                      child: Text(
                                        '✓ "$name" encrypted & saved to your Vault!',
                                        style: const TextStyle(
                                            fontWeight: FontWeight.bold),
                                      ),
                                    ),
                                  ],
                                ),
                              ),
                            ),
                            failureMessage:
                                'Could not encrypt and save the document.',
                          );
                        },
                      );
                    },
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    ).whenComplete(() {
      // Release the controllers as soon as the sheet closes so the scanned
      // document number does not linger in memory after the user is done.
      // (`name` and `docNumber` are copied into locals before the pop, so the
      // PIN dialog that runs afterwards is unaffected.)
      nameController.dispose();
      numberController.dispose();
    });
  }

  @override
  Widget build(BuildContext context) {
    final state = Provider.of<AppState>(context);
    final theme = Theme.of(context);
    final isDark = theme.brightness == Brightness.dark;

    final filteredDocs = _selectedCategory == 'ALL'
        ? state.documents
        : state.documents.where((d) {
            if (_selectedCategory == 'IDENTITY') {
              return d.documentType.contains('Aadhaar') || d.documentType.contains('PAN') || d.documentType.contains('Passport') || d.documentType.contains('License');
            }
            if (_selectedCategory == 'FINANCIAL') {
              return d.documentType.contains('Salary') || d.documentType.contains('Tax') || d.documentType.contains('ITC') || d.documentType.contains('ITR') || d.documentType.contains('Passbook');
            }
            if (_selectedCategory == 'INSURANCE') {
              return d.documentType.contains('Insurance');
            }
            return true;
          }).toList();

    return PopScope(
      canPop: true,
      onPopInvokedWithResult: (didPop, result) {
        if (didPop) return;
        _handleBack(context);
      },
      child: Scaffold(
        appBar: AppBar(
          title: Text(state.t('vaultTitle')),
          leading: IconButton(
            icon: const Icon(Icons.arrow_back),
            tooltip: 'Back',
            onPressed: () => _handleBack(context),
          ),
          actions: [
            IconButton(
              icon: Icon(
                state.isSpeaking ? Icons.volume_up_rounded : Icons.volume_up_outlined,
                color: state.isSpeaking ? AppTheme.primary : null,
              ),
              tooltip: state.isSpeaking ? state.t('readAloudStop') : state.t('readAloud'),
              onPressed: () {
                if (state.isSpeaking) {
                  state.stopSpeaking();
                } else {
                  state.speakVaultNarration();
                }
              },
            ),
            IconButton(
              icon: const Icon(Icons.password_rounded),
              tooltip: 'Change Vault PIN',
              onPressed: () => _changeVaultPin(context, state),
            ),
            IconButton(
              icon: const Icon(Icons.add_rounded),
              tooltip: state.t('uploadDocument'),
              onPressed: () => _showUploadDialog(context, state),
            ),
          ],
        ),
        floatingActionButton: FloatingActionButton.extended(
          backgroundColor: AppTheme.primary,
          foregroundColor: Colors.white,
          icon: const Icon(Icons.cloud_upload_rounded),
          label: Text(state.t('uploadDocument'), style: const TextStyle(fontWeight: FontWeight.bold)),
          onPressed: () => _showUploadDialog(context, state),
        ),
        body: SingleChildScrollView(
          padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              // Security Encryption Banner
              Container(
                padding: const EdgeInsets.all(14),
                decoration: BoxDecoration(
                  gradient: LinearGradient(
                    colors: isDark
                        ? [const Color(0xFF0F172A), const Color(0xFF1E293B)]
                        : [const Color(0xFFF0FDF4), const Color(0xFFDCFCE7)],
                    begin: Alignment.topLeft,
                    end: Alignment.bottomRight,
                  ),
                  borderRadius: BorderRadius.circular(16),
                  border: Border.all(
                    color: const Color(0xFF10B981).withOpacity(0.3),
                  ),
                ),
                child: Row(
                  children: [
                    Container(
                      width: 42,
                      height: 42,
                      decoration: BoxDecoration(
                        color: const Color(0xFF10B981).withOpacity(0.15),
                        borderRadius: BorderRadius.circular(10),
                      ),
                      alignment: Alignment.center,
                      child: const Icon(Icons.shield_rounded, color: Color(0xFF10B981), size: 24),
                    ),
                    const SizedBox(width: 12),
                    const Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            '256-BIT CLIENT-SIDE AES VAULT',
                            style: TextStyle(
                              fontSize: 11,
                              fontWeight: FontWeight.w800,
                              color: Color(0xFF10B981),
                              letterSpacing: 0.5,
                            ),
                          ),
                          SizedBox(height: 2),
                          Text(
                            'Documents are encrypted on this device before storage. Only your Vault PIN — chosen by you — can decrypt them, and only you can change it.',
                            style: TextStyle(fontSize: 11, color: Color(0xFF64748B), height: 1.3),
                          ),
                        ],
                      ),
                    ),
                  ],
                ),
              ),
              const SizedBox(height: 16),

              // Filter Chips Row
              SingleChildScrollView(
                scrollDirection: Axis.horizontal,
                child: Row(
                  children: [
                    {'id': 'ALL', 'label': 'All Documents (${state.documents.length})'},
                    {'id': 'IDENTITY', 'label': 'Identity (PAN/Aadhaar)'},
                    {'id': 'FINANCIAL', 'label': 'Financial & ITR'},
                    {'id': 'INSURANCE', 'label': 'Insurance'},
                  ].map((filter) {
                    final isSelected = _selectedCategory == filter['id'];
                    return Padding(
                      padding: const EdgeInsets.only(right: 8),
                      child: ChoiceChip(
                        label: Text(
                          filter['label']!,
                          style: TextStyle(
                            fontSize: 11,
                            fontWeight: FontWeight.w700,
                            color: isSelected ? Colors.white : (isDark ? AppTheme.textSecondaryDark : AppTheme.textSecondaryLight),
                          ),
                        ),
                        selected: isSelected,
                        selectedColor: AppTheme.primary,
                        backgroundColor: isDark ? const Color(0xFF1E293B) : const Color(0xFFF1F5F9),
                        onSelected: (selected) {
                          if (selected) {
                            setState(() {
                              _selectedCategory = filter['id']!;
                            });
                          }
                        },
                      ),
                    );
                  }).toList(),
                ),
              ),
              const SizedBox(height: 16),

              // Document List or Empty State
              if (filteredDocs.isEmpty)
                Container(
                  width: double.infinity,
                  padding: const EdgeInsets.symmetric(vertical: 36, horizontal: 20),
                  decoration: BoxDecoration(
                    color: isDark ? AppTheme.bgCardDark : AppTheme.bgCardLight,
                    borderRadius: BorderRadius.circular(16),
                    border: Border.all(color: isDark ? AppTheme.borderDark : AppTheme.borderLight),
                  ),
                  child: Column(
                    children: [
                      Container(
                        width: 56,
                        height: 56,
                        decoration: BoxDecoration(
                          color: AppTheme.primary.withOpacity(0.1),
                          shape: BoxShape.circle,
                        ),
                        child: const Icon(Icons.folder_open_rounded, size: 28, color: AppTheme.primary),
                      ),
                      const SizedBox(height: 14),
                      const Text(
                        'No Documents in this Category',
                        style: TextStyle(fontSize: 15, fontWeight: FontWeight.bold),
                      ),
                      const SizedBox(height: 6),
                      Text(
                        'Upload your PAN, Aadhaar, Insurance, Salary Slips, or ITC documents to store them in your secure encrypted vault.',
                        textAlign: TextAlign.center,
                        style: TextStyle(fontSize: 12, color: isDark ? AppTheme.textSecondaryDark : AppTheme.textSecondaryLight),
                      ),
                      const SizedBox(height: 18),
                      ElevatedButton.icon(
                        style: ElevatedButton.styleFrom(
                          backgroundColor: AppTheme.primary,
                          foregroundColor: Colors.white,
                          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
                        ),
                        icon: const Icon(Icons.cloud_upload_rounded, size: 18),
                        label: const Text('Upload Document Now', style: TextStyle(fontWeight: FontWeight.bold)),
                        onPressed: () => _showUploadDialog(context, state),
                      ),
                    ],
                  ),
                )
              else
                ...filteredDocs.map((doc) {
                  final isAadhaar = doc.documentType.contains('Aadhaar');
                  final isPan = doc.documentType.contains('PAN');
                  final isPassport = doc.documentType.contains('Passport');

                  final iconColor = isAadhaar
                      ? const Color(0xFF0284C7)
                      : isPan
                          ? const Color(0xFFF59E0B)
                          : isPassport
                              ? const Color(0xFF8B5CF6)
                              : AppTheme.primary;

                  return Container(
                    margin: const EdgeInsets.only(bottom: 12),
                    decoration: BoxDecoration(
                      color: isDark ? AppTheme.bgCardDark : AppTheme.bgCardLight,
                      borderRadius: BorderRadius.circular(14),
                      border: Border.all(
                        color: isDark ? AppTheme.borderDark : AppTheme.borderLight,
                      ),
                    ),
                    padding: const EdgeInsets.all(14),
                    child: Row(
                      children: [
                        Container(
                          width: 44,
                          height: 44,
                          decoration: BoxDecoration(
                            color: iconColor.withOpacity(0.12),
                            borderRadius: BorderRadius.circular(12),
                          ),
                          child: Icon(
                            isAadhaar || isPan || isPassport
                                ? Icons.badge_rounded
                                : Icons.description_rounded,
                            color: iconColor,
                            size: 22,
                          ),
                        ),
                        const SizedBox(width: 14),
                        Expanded(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text(
                                doc.name,
                                style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 14),
                              ),
                              const SizedBox(height: 3),
                              Row(
                                children: [
                                  Container(
                                    padding: const EdgeInsets.symmetric(horizontal: 5, vertical: 1.5),
                                    decoration: BoxDecoration(
                                      color: const Color(0xFF10B981).withOpacity(0.12),
                                      borderRadius: BorderRadius.circular(4),
                                    ),
                                    child: const Text('AES-256', style: TextStyle(fontSize: 9, fontWeight: FontWeight.bold, color: Color(0xFF10B981))),
                                  ),
                                  if (doc.hasImage) ...[
                                    const SizedBox(width: 6),
                                    Container(
                                      padding: const EdgeInsets.symmetric(horizontal: 5, vertical: 1.5),
                                      decoration: BoxDecoration(
                                        color: const Color(0xFF8B5CF6).withOpacity(0.15),
                                        borderRadius: BorderRadius.circular(4),
                                      ),
                                      child: const Text('PHOTO', style: TextStyle(fontSize: 9, fontWeight: FontWeight.bold, color: Color(0xFF8B5CF6))),
                                    ),
                                  ],
                                  const SizedBox(width: 6),
                                  // Flexible so the badges can never push the
                                  // number past the card edge (it overflowed
                                  // by 15px once the PHOTO badge was added).
                                  Expanded(
                                    child: Text(
                                      doc.maskedNumber ?? doc.documentType,
                                      overflow: TextOverflow.ellipsis,
                                      style: const TextStyle(fontSize: 12, color: Color(0xFF94A3B8), fontWeight: FontWeight.w600),
                                    ),
                                  ),
                                ],
                              ),
                              const SizedBox(height: 2),
                              Text(
                                'Added: ${_formatDate(doc.uploadDate)}',
                                style: const TextStyle(fontSize: 10, color: Color(0xFF64748B)),
                              ),
                            ],
                          ),
                        ),
                        IconButton(
                          icon: const Icon(Icons.lock_open_rounded, color: AppTheme.primary),
                          tooltip: 'Decrypt & View Document',
                          onPressed: () => _showDocument(context, doc),
                        ),
                      ],
                    ),
                  );
                }).toList(),
              const SizedBox(height: 60), // Room for FloatingActionButton
            ],
          ),
        ),
      ),
    );
  }
}

/// Outcome of the account re-verification step of a PIN change.
class _ReauthResult {
  /// The user backed out on purpose — the UI stays silent.
  final bool cancelled;

  /// A user-facing reason it failed (null = verified).
  final String? error;

  const _ReauthResult.ok()
      : cancelled = false,
        error = null;
  const _ReauthResult.cancelled()
      : cancelled = true,
        error = null;
  const _ReauthResult.failed(this.error) : cancelled = false;
}

/// Offered under the keypad to vaults still keyed to the old App PIN: a
/// one-tap path to choose a PIN of their own.
class _LegacyPinFooter extends StatelessWidget {
  final VoidCallback onChooseOwn;

  const _LegacyPinFooter({required this.onChooseOwn});

  @override
  Widget build(BuildContext context) {
    return Column(
      children: [
        const Text(
          'This vault still uses your App PIN.',
          style: TextStyle(fontSize: 11, color: Color(0xFF94A3B8)),
        ),
        TextButton(
          onPressed: onChooseOwn,
          child: const Text(
            'Choose a PIN of my own →',
            style: TextStyle(fontSize: 12, fontWeight: FontWeight.w700),
          ),
        ),
      ],
    );
  }
}

/// Asks for the FinPocket account password and verifies it with the server —
/// without touching the signed-in session.
class _PasswordReauthDialog extends StatefulWidget {
  final String email;

  const _PasswordReauthDialog({required this.email});

  @override
  State<_PasswordReauthDialog> createState() => _PasswordReauthDialogState();
}

class _PasswordReauthDialogState extends State<_PasswordReauthDialog> {
  final _controller = TextEditingController();
  String? _error;
  bool _checking = false;

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    final password = _controller.text;
    if (password.isEmpty) {
      setState(() => _error = 'Enter your account password.');
      return;
    }
    setState(() {
      _checking = true;
      _error = null;
    });

    final error = await AccountReauthService.verifyPassword(
      email: widget.email,
      password: password,
    );

    if (!mounted) return;
    if (error == null) {
      Navigator.of(context).pop(true);
    } else {
      setState(() {
        _checking = false;
        _error = error;
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    return AlertDialog(
      title: const Text('Confirm it’s you'),
      content: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            'For your security, re-enter your FinPocket account password to change your Vault PIN.',
            style: TextStyle(
                fontSize: 12.5,
                color: Theme.of(context).textTheme.bodySmall?.color),
          ),
          const SizedBox(height: 6),
          Text(
            widget.email,
            style: const TextStyle(
                fontSize: 12, fontWeight: FontWeight.w700),
          ),
          const SizedBox(height: 14),
          TextField(
            controller: _controller,
            obscureText: true,
            autofocus: true,
            enabled: !_checking,
            onSubmitted: (_) => _submit(),
            decoration: InputDecoration(
              hintText: 'Account password',
              errorText: _error,
              isDense: true,
              border: OutlineInputBorder(
                borderRadius: BorderRadius.circular(10),
              ),
            ),
          ),
          if (_checking) ...[
            const SizedBox(height: 12),
            const LinearProgressIndicator(),
          ],
        ],
      ),
      actions: [
        TextButton(
          onPressed: _checking ? null : () => Navigator.of(context).pop(false),
          child: const Text('Cancel'),
        ),
        FilledButton(
          onPressed: _checking ? null : _submit,
          child: const Text('Verify'),
        ),
      ],
    );
  }
}
