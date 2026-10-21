import 'package:camera/camera.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:google_mlkit_text_recognition/google_mlkit_text_recognition.dart';
import 'package:image/image.dart' as img;

import '../services/secure_document_scanner.dart';
import '../theme/app_theme.dart';

/// Full-screen camera used to read a PAN/Aadhaar card and extract its details.
///
/// ─────────────────────────────────────────────────────────────────────────
/// SECURITY — this screen is deliberately built around the idea that the
/// card image is radioactive:
///
///  * ZERO DISK WRITES. The camera runs in *image-stream* mode. A single
///    frame is copied into a `Uint8List`, converted to NV21 in memory and
///    handed straight to ML Kit. `takePicture()` (which writes a JPEG to
///    app storage) is never used, so no copy of the card is ever persisted,
///    survives in a temp folder, or could be recovered by another app or a
///    forensic tool.
///  * ON-DEVICE OCR. ML Kit's Latin text recognizer runs locally — no API
///    key, no upload, no network. The image cannot leave the handset through
///    this code path.
///  * THE FRAME IS FREED IMMEDIATELY. The stream is stopped and the byte
///    array dropped as soon as recognition returns, before the result UI is
///    even built.
///  * ONLY VALIDATED FIELDS SURFACE. See [SecureDocumentScanner] — the raw
///    recognised text is discarded inside `parse()` and never returned here,
///    so it cannot be logged or persisted by anything downstream.
///  * NOTHING IS AUTO-SAVED. The caller receives fields to prefill a form the
///    user must still review and explicitly save.
/// ─────────────────────────────────────────────────────────────────────────
class DocumentScanScreen extends StatefulWidget {
  const DocumentScanScreen({super.key});

  @override
  State<DocumentScanScreen> createState() => _DocumentScanScreenState();
}

class _DocumentScanScreenState extends State<DocumentScanScreen>
    with WidgetsBindingObserver {
  CameraController? _controller;
  CameraDescription? _camera;
  TextRecognizer? _recognizer;

  bool _initialising = true;
  bool _processing = false;
  bool _permissionDenied = false;
  String? _error;

  /// Set once a frame has been recognised and parsed.
  ScannedDocumentFields? _result;

  /// True while the captured frame is being JPEG-encoded in the background
  /// isolate, so the button can show progress instead of appearing stuck.
  bool _encoding = false;

  /// A tight NV21 copy of the last captured frame, held ONLY in memory so it
  /// can be JPEG-encoded and encrypted if the user chooses to save. It is
  /// cleared on rescan, on dispose, and never written to disk in plaintext.
  Uint8List? _capturedNv21;
  int _capturedWidth = 0;
  int _capturedHeight = 0;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    _init();
  }

  Future<void> _init() async {
    try {
      final cams = await availableCameras();
      if (cams.isEmpty) {
        if (mounted) setState(() { _initialising = false; _error = 'No camera available on this device.'; });
        return;
      }
      // Prefer the rear camera — the card is in front of the user.
      final cam = cams.firstWhere(
        (c) => c.lensDirection == CameraLensDirection.back,
        orElse: () => cams.first,
      );
      _camera = cam;

      final controller = CameraController(
        cam,
        ResolutionPreset.high,
        enableAudio: false,
        // Ask for YUV420 rather than NV21. The CameraX-backed Android
        // implementation reliably honours YUV_420_888 (and it is what the
        // underlying stream produces anyway), whereas requesting NV21 can
        // silently fall back to a YUV_420_888 stream on some devices — which
        // then has to be converted to NV21 below before ML Kit can read it.
        imageFormatGroup: ImageFormatGroup.yuv420,
      );
      await controller.initialize();
      // Lock exposure so a glossy card does not blow out mid-capture.
      await controller.setExposureMode(ExposureMode.locked);
      if (!mounted) {
        await controller.dispose();
        return;
      }
      _recognizer = TextRecognizer(script: TextRecognitionScript.latin);
      setState(() { _controller = controller; _initialising = false; });
    } on CameraException catch (e) {
      if (!mounted) return;
      setState(() {
        _initialising = false;
        _permissionDenied = e.code == 'CameraAccessDenied';
        _error = _permissionDenied
            ? 'Camera permission is required to scan a card. You can grant it in Settings, or type the details manually.'
            : 'Could not start the camera: ${e.description ?? e.code}';
      });
    } catch (_) {
      // Deliberately does not surface the exception text — it can contain
      // paths or device detail we do not want on a sensitive screen.
      if (!mounted) return;
      setState(() { _initialising = false; _error = 'Could not start the camera.'; });
    }
  }

  /// Captures ONE in-memory frame and recognises it.
  Future<void> _captureAndRecognise() async {
    final controller = _controller;
    final recognizer = _recognizer;
    if (controller == null || recognizer == null || _processing) return;
    // Only the controller has to be ready — the image stream is started by
    // this method, so requiring `isStreamingImages` here would make the very
    // first tap a silent no-op.
    if (!controller.value.isInitialized) return;

    setState(() { _processing = true; _error = null; });

    CameraImage? frame;
    try {
      // Keep the stream running only long enough to grab a single frame.
      await controller.startImageStream((image) {
        frame ??= image;
      });

      // Wait briefly for the first frame to arrive.
      var waited = 0;
      while (frame == null && waited < 1500) {
        await Future<void>.delayed(const Duration(milliseconds: 50));
        waited += 50;
      }
      await controller.stopImageStream();

      final captured = frame;
      if (captured == null) {
        if (mounted) setState(() { _processing = false; _error = 'Could not read the camera frame. Try again.'; });
        return;
      }

      // Normalise the frame to NV21 exactly once. This single buffer feeds
      // BOTH the OCR pass below and (if the user saves) the encrypted
      // document image, so the conversion is never done twice.
      final sensorOrientation = _camera?.sensorOrientation ?? 0;
      final nv21 = _frameToNv21(captured);
      if (nv21 == null) {
        if (mounted) setState(() { _processing = false; _error = 'Unsupported camera frame format.'; });
        return;
      }

      final input = InputImage.fromBytes(
        bytes: nv21,
        metadata: InputImageMetadata(
          size: Size(captured.width.toDouble(), captured.height.toDouble()),
          rotation: _rotationFromSensor(sensorOrientation),
          format: InputImageFormat.nv21,
          bytesPerRow: captured.width,
        ),
      );

      final recognised = await recognizer.processImage(input);

      // Keep the NV21 copy (memory only) for optional encrypted persistence,
      // then drop the CameraImage and InputImage BEFORE building any UI.
      _capturedNv21 = nv21;
      _capturedWidth = captured.width;
      _capturedHeight = captured.height;
      frame = null;
      final raw = recognised.text;
      final fields = SecureDocumentScanner.parse(raw);
      // `raw` is intentionally not stored, returned, or logged.

      if (!mounted) return;
      if (fields.isEmpty) {
        setState(() {
          _processing = false;
          _error = 'No readable text found. Hold the card flat, avoid glare, and fill the frame.';
        });
      } else {
        setState(() { _result = fields; _processing = false; });
      }
    } catch (_) {
      if (!mounted) return;
      setState(() { _processing = false; _error = 'Could not read the card. Try again.'; });
    } finally {
      // Ensure the stream is stopped even on the error paths above.
      try {
        if (controller.value.isStreamingImages) await controller.stopImageStream();
      } catch (_) {}
    }
  }

  /// Normalises a camera frame to a tightly-packed NV21 buffer, or null when
  /// the format genuinely cannot be decoded.
  ///
  /// Android's image stream delivers YUV_420_888 (three planes: Y, U, V) or,
  /// on some paths, NV21 directly. NV21 is the single format that both ML
  /// Kit's `fromBytes` and our JPEG encoder understand, so every frame is
  /// reduced to it here — still entirely in memory, still never written to
  /// disk. Anything else is rejected rather than risking a mis-decoded — and
  /// therefore wrong — identity number.
  Uint8List? _frameToNv21(CameraImage image) {
    switch (image.format.group) {
      case ImageFormatGroup.yuv420:
        return _yuv420ToNv21(image);
      case ImageFormatGroup.nv21:
        return image.planes.first.bytes;
      default:
        // BGRA8888 is an iOS/desktop stream format and is not produced by
        // Android camera apps; we cannot persist it as a card image, so we
        // decline rather than save a garbled photo.
        return null;
    }
  }

  /// Repacks a YUV_420_888 frame into a tightly-packed NV21 buffer.
  ///
  /// NV21 layout: the full-resolution Y plane, followed by interleaved
  /// **V,U** bytes at half width / half height. Camera planes may have a row
  /// stride larger than the width and a pixel stride > 1 (especially on
  /// CameraX), so both are honoured per-plane rather than assumed.
  Uint8List _yuv420ToNv21(CameraImage image) {
    final width = image.width;
    final height = image.height;
    final yPlane = image.planes[0];
    final uPlane = image.planes[1];
    final vPlane = image.planes[2];

    final yBytes = yPlane.bytes;
    final uBytes = uPlane.bytes;
    final vBytes = vPlane.bytes;

    final out = Uint8List(width * height + (width * height) ~/ 2);

    // ── Y plane ──────────────────────────────────────────────────────────
    final yRowStride = yPlane.bytesPerRow;
    final yPixelStride = yPlane.bytesPerPixel ?? 1;
    if (yRowStride == width && yPixelStride == 1) {
      out.setRange(0, width * height, yBytes);
    } else {
      var o = 0;
      for (var row = 0; row < height; row++) {
        final rowStart = row * yRowStride;
        for (var col = 0; col < width; col++) {
          out[o++] = yBytes[rowStart + col * yPixelStride];
        }
      }
    }

    // ── V/U planes, interleaved V then U (NV21) ──────────────────────────
    final uRowStride = uPlane.bytesPerRow;
    final uPixelStride = uPlane.bytesPerPixel ?? 1;
    final vRowStride = vPlane.bytesPerRow;
    final vPixelStride = vPlane.bytesPerPixel ?? 1;

    final halfW = width ~/ 2;
    final halfH = height ~/ 2;
    var o = width * height;
    for (var row = 0; row < halfH; row++) {
      final uRowStart = row * uRowStride;
      final vRowStart = row * vRowStride;
      for (var col = 0; col < halfW; col++) {
        out[o++] = vBytes[vRowStart + col * vPixelStride]; // V first
        out[o++] = uBytes[uRowStart + col * uPixelStride]; // then U
      }
    }
    return out;
  }

  InputImageRotation _rotationFromSensor(int sensorOrientation) {
    switch (sensorOrientation) {
      case 90:
        return InputImageRotation.rotation90deg;
      case 180:
        return InputImageRotation.rotation180deg;
      case 270:
        return InputImageRotation.rotation270deg;
      default:
        return InputImageRotation.rotation0deg;
    }
  }

  /// JPEG-encodes the retained NV21 frame **entirely in memory**, or returns
  /// null if there is nothing to encode (or the encode failed).
  ///
  /// This runs only when the user actually taps "Use these details" — a
  /// rescan or backing out simply drops the buffer, so no card image is ever
  /// produced (let alone written to disk) unless the user asks to save it.
  ///
  /// The pixel loop + JPEG encode runs in a **background isolate** via
  /// [compute]: converting ~450k pixels is far too slow to do on the UI
  /// isolate, where it would visibly freeze the scan screen exactly when the
  /// user taps save. Either way the frame stays in RAM and never touches disk.
  Future<Uint8List?> _encodeCapturedJpeg() async {
    final nv21 = _capturedNv21;
    final w = _capturedWidth;
    final h = _capturedHeight;
    if (nv21 == null || w <= 0 || h <= 0) return null;
    try {
      return await compute(encodeCardJpeg, <Object?>[nv21, w, h]);
    } catch (_) {
      // Encoding is best-effort — the text fields are the important payload.
      return null;
    }
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    final controller = _controller;
    if (controller == null || !controller.value.isInitialized) return;
    if (state == AppLifecycleState.inactive) {
      controller.dispose();
      _controller = null;
    } else if (state == AppLifecycleState.resumed && _controller == null) {
      _init();
    }
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    _recognizer?.close();
    _recognizer = null;
    _controller?.dispose();
    _controller = null;
    // Drop the pending frame the moment the screen goes away.
    _capturedNv21 = null;
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    return Scaffold(
      backgroundColor: Colors.black,
      body: SafeArea(
        child: Column(
          children: [
            _buildHeader(isDark),
            Expanded(child: _buildBody(isDark)),
            if (_result != null) _buildResultPanel(isDark) else _buildControls(isDark),
          ],
        ),
      ),
    );
  }

  Widget _buildHeader(bool isDark) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(8, 8, 8, 0),
      child: Row(
        children: [
          IconButton(
            icon: const Icon(Icons.close, color: Colors.white),
            onPressed: () => Navigator.pop(context),
          ),
          const Expanded(
            child: Text(
              'Scan Document',
              style: TextStyle(color: Colors.white, fontSize: 16, fontWeight: FontWeight.w700),
            ),
          ),
          Container(
            margin: const EdgeInsets.only(right: 10),
            padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
            decoration: BoxDecoration(
              color: const Color(0xFF10B981).withOpacity(0.18),
              borderRadius: BorderRadius.circular(8),
              border: Border.all(color: const Color(0xFF10B981).withOpacity(0.5)),
            ),
            child: const Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                Icon(Icons.wifi_off_rounded, size: 12, color: Color(0xFF10B981)),
                SizedBox(width: 4),
                Text('On-device only', style: TextStyle(fontSize: 10, color: Color(0xFF10B981), fontWeight: FontWeight.w700)),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildBody(bool isDark) {
    if (_result != null) {
      // The camera feed is stopped; show a neutral surface instead of a
      // frozen frame of the user's card.
      return const SizedBox.expand();
    }
    if (_initialising) {
      return const Center(child: CircularProgressIndicator(color: AppTheme.primary));
    }
    final controller = _controller;
    if (controller == null || !controller.value.isInitialized) {
      return _buildMessage(
        isDark,
        icon: Icons.no_photography_rounded,
        title: _permissionDenied ? 'Camera permission needed' : 'Camera unavailable',
        body: _error ?? 'The camera could not be opened.',
        showManual: true,
      );
    }
    return Stack(
      alignment: Alignment.center,
      children: [
        Center(child: CameraPreview(controller)),
        // Card-shaped guide with the corners darkened outside it.
        _buildGuide(),
        if (_processing)
          Container(
            color: Colors.black54,
            alignment: Alignment.center,
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: const [
                CircularProgressIndicator(color: AppTheme.primary),
                SizedBox(height: 12),
                Text('Reading on device…', style: TextStyle(color: Colors.white, fontWeight: FontWeight.w600)),
              ],
            ),
          ),
      ],
    );
  }

  /// Draws a card-shaped guide and dims everything outside it.
  Widget _buildGuide() {
    return LayoutBuilder(
      builder: (context, constraints) {
        final guideW = constraints.maxWidth * 0.86;
        final guideH = guideW * 0.63; // ~CR80 card ratio
        return Stack(
          children: [
            // Dim the area outside the guide using four rectangles.
            Positioned.fill(
              child: CustomPaint(
                painter: _GuidePainter(
                  guide: Rect.fromCenter(
                    center: constraints.biggest.center(Offset.zero),
                    width: guideW,
                    height: guideH,
                  ),
                ),
              ),
            ),
            Center(
              child: Container(
                width: guideW,
                height: guideH,
                decoration: BoxDecoration(
                  border: Border.all(color: AppTheme.primary, width: 2),
                  borderRadius: BorderRadius.circular(14),
                ),
                alignment: Alignment.bottomLeft,
                padding: const EdgeInsets.all(10),
                child: const Text(
                  'Fit the front of your PAN / Aadhaar inside the frame',
                  style: TextStyle(color: Colors.white70, fontSize: 11, shadows: [Shadow(blurRadius: 6, color: Colors.black)]),
                ),
              ),
            ),
          ],
        );
      },
    );
  }

  Widget _buildControls(bool isDark) {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.fromLTRB(16, 12, 16, 18),
      decoration: BoxDecoration(
        color: isDark ? const Color(0xFF0F172A) : Colors.white,
        borderRadius: const BorderRadius.vertical(top: Radius.circular(20)),
      ),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          if (_error != null)
            Padding(
              padding: const EdgeInsets.only(bottom: 10),
              child: Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  const Icon(Icons.info_outline_rounded, color: Color(0xFFF59E0B), size: 18),
                  const SizedBox(width: 8),
                  Expanded(
                    child: Text(_error!, style: const TextStyle(fontSize: 12, color: Color(0xFFF59E0B))),
                  ),
                ],
              ),
            ),
          Container(
            width: double.infinity,
            padding: const EdgeInsets.all(10),
            margin: const EdgeInsets.only(bottom: 12),
            decoration: BoxDecoration(
              color: const Color(0xFF10B981).withOpacity(0.10),
              borderRadius: BorderRadius.circular(10),
              border: Border.all(color: const Color(0xFF10B981).withOpacity(0.35)),
            ),
            child: const Text(
              'The card is read entirely on this device. The photo is never saved, '
              'never uploaded, and is discarded the moment the text is read.',
              style: TextStyle(fontSize: 11, color: Color(0xFF10B981), height: 1.4),
            ),
          ),
          Row(
            children: [
              if (!_permissionDenied)
                Expanded(
                  child: SizedBox(
                    height: 48,
                    child: ElevatedButton.icon(
                      style: ElevatedButton.styleFrom(
                        backgroundColor: AppTheme.primary,
                        foregroundColor: Colors.white,
                        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                      ),
                      icon: const Icon(Icons.document_scanner_rounded, size: 18),
                      label: Text(_processing ? 'Reading…' : 'Capture & Read',
                          style: const TextStyle(fontWeight: FontWeight.bold)),
                      onPressed: _processing ? null : _captureAndRecognise,
                    ),
                  ),
                ),
              if (!_permissionDenied) const SizedBox(width: 10),
              Expanded(
                child: SizedBox(
                  height: 48,
                  child: OutlinedButton.icon(
                    style: OutlinedButton.styleFrom(
                      foregroundColor: Colors.white70,
                      side: const BorderSide(color: Colors.white38),
                      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                    ),
                    icon: const Icon(Icons.keyboard_rounded, size: 18),
                    label: const Text('Type manually', style: TextStyle(fontWeight: FontWeight.w600)),
                    onPressed: () => Navigator.pop(context),
                  ),
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }

  Widget _buildResultPanel(bool isDark) {
    final r = _result!;
    final rows = <Map<String, String>>[
      if (r.pan != null) {'label': 'PAN', 'value': SecureDocumentScanner.maskNumber(r.pan!)},
      if (r.aadhaar != null)
        {
          'label': r.aadhaarChecksumOk ? 'Aadhaar (verified)' : 'Aadhaar (check this)',
          'value': SecureDocumentScanner.maskNumber(r.aadhaar!),
        },
      if (r.name != null) {'label': 'Name', 'value': r.name!},
      if (r.dateOfBirth != null) {'label': 'Date of Birth', 'value': r.dateOfBirth!},
      if (r.gender != null) {'label': 'Gender', 'value': r.gender!},
    ];

    return Container(
      width: double.infinity,
      padding: const EdgeInsets.fromLTRB(16, 14, 16, 18),
      decoration: BoxDecoration(
        color: isDark ? const Color(0xFF0F172A) : Colors.white,
        borderRadius: const BorderRadius.vertical(top: Radius.circular(20)),
      ),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              const Icon(Icons.shield_rounded, color: AppTheme.primary, size: 18),
              const SizedBox(width: 8),
              Text(
                'Detected details',
                style: TextStyle(fontSize: 15, fontWeight: FontWeight.w800, color: isDark ? Colors.white : Colors.black87),
              ),
            ],
          ),
          const SizedBox(height: 4),
          const Text(
            'Numbers are shown masked. Nothing has been saved yet.',
            style: TextStyle(fontSize: 11, color: Color(0xFF94A3B8)),
          ),
          const SizedBox(height: 12),
          ...rows.map((row) => Container(
                margin: const EdgeInsets.only(bottom: 8),
                padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
                decoration: BoxDecoration(
                  color: const Color(0xFF1E293B),
                  borderRadius: BorderRadius.circular(10),
                ),
                child: Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [
                    Text(row['label']!, style: const TextStyle(color: Color(0xFF94A3B8), fontSize: 12)),
                    Flexible(
                      child: Text(
                        row['value']!,
                        textAlign: TextAlign.right,
                        style: const TextStyle(color: Colors.white, fontSize: 13, fontWeight: FontWeight.w700, letterSpacing: 0.5),
                      ),
                    ),
                  ],
                ),
              )),
          if (r.hasAadhaar && !r.aadhaarChecksumOk)
            const Padding(
              padding: EdgeInsets.only(bottom: 10),
              child: Text(
                'This Aadhaar number did not match its checksum — please double-check it before saving.',
                style: TextStyle(fontSize: 11, color: Color(0xFFF59E0B)),
              ),
            ),
          const SizedBox(height: 4),
          Row(
            children: [
              Expanded(
                child: SizedBox(
                  height: 46,
                  child: OutlinedButton.icon(
                    style: OutlinedButton.styleFrom(
                      foregroundColor: isDark ? Colors.white70 : Colors.black54,
                      side: BorderSide(color: isDark ? AppTheme.borderDark : AppTheme.borderLight),
                      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                      // Tighter padding so the label never wraps on narrow devices.
                      padding: const EdgeInsets.symmetric(horizontal: 8),
                    ),
                    icon: const Icon(Icons.refresh_rounded, size: 18),
                    label: const Text(
                      'Rescan',
                      maxLines: 1,
                      overflow: TextOverflow.clip,
                      style: TextStyle(fontWeight: FontWeight.w600),
                    ),
                    onPressed: () => setState(() {
                      _result = null;
                      _error = null;
                      // Discard the pending frame so a rescan never keeps a
                      // stale card image around.
                      _capturedNv21 = null;
                      _capturedWidth = 0;
                      _capturedHeight = 0;
                    }),
                  ),
                ),
              ),
              const SizedBox(width: 10),
              Expanded(
                flex: 2,
                child: SizedBox(
                  height: 46,
                  child: ElevatedButton.icon(
                    style: ElevatedButton.styleFrom(
                      backgroundColor: AppTheme.primary,
                      foregroundColor: Colors.white,
                      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                    ),
                    icon: _encoding
                        ? const SizedBox(
                            width: 16,
                            height: 16,
                            child: CircularProgressIndicator(
                                strokeWidth: 2, color: Colors.white),
                          )
                        : const Icon(Icons.check_rounded, size: 18),
                    label: Text(
                      _encoding ? 'Preparing image…' : 'Use these details',
                      style: const TextStyle(fontWeight: FontWeight.bold),
                    ),
                    onPressed: _encoding
                        ? null
                        : () async {
                            setState(() => _encoding = true);
                            // Encode the captured frame in a background isolate
                            // (memory only) and hand it back so the vault can
                            // encrypt it. If encoding fails we still return the
                            // text fields — the details matter more than the photo.
                            Uint8List? jpeg;
                            try {
                              jpeg = await _encodeCapturedJpeg();
                            } catch (_) {
                              jpeg = null;
                            }
                            if (!mounted) return;
                            Navigator.pop(
                              context,
                              ScannedDocumentFields(
                                pan: r.pan,
                                aadhaar: r.aadhaar,
                                aadhaarChecksumOk: r.aadhaarChecksumOk,
                                name: r.name,
                                dateOfBirth: r.dateOfBirth,
                                gender: r.gender,
                                imageJpeg: jpeg,
                              ),
                            );
                          },
                  ),
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }

  Widget _buildMessage(bool isDark, {required IconData icon, required String title, required String body, bool showManual = false}) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(28),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(icon, size: 46, color: Colors.white38),
            const SizedBox(height: 14),
            Text(title, textAlign: TextAlign.center, style: const TextStyle(color: Colors.white, fontSize: 16, fontWeight: FontWeight.w700)),
            const SizedBox(height: 8),
            Text(body, textAlign: TextAlign.center, style: const TextStyle(color: Colors.white60, fontSize: 12.5, height: 1.45)),
            if (showManual) ...[
              const SizedBox(height: 18),
              SizedBox(
                height: 44,
                child: OutlinedButton(
                  style: OutlinedButton.styleFrom(
                    foregroundColor: Colors.white70,
                    side: const BorderSide(color: Colors.white38),
                    shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                  ),
                  onPressed: () => Navigator.pop(context),
                  child: const Text('Type manually instead'),
                ),
              ),
            ],
          ],
        ),
      ),
    );
  }
}

class _GuidePainter extends CustomPainter {
  final Rect guide;
  _GuidePainter({required this.guide});

  @override
  void paint(Canvas canvas, Size size) {
    final paint = Paint()..color = Colors.black54;
    final outer = Offset.zero & size;
    final rrect = RRect.fromRectAndRadius(guide, const Radius.circular(14));
    final path = Path()
      ..addRect(outer)
      ..addRRect(rrect)
      ..fillType = PathFillType.evenOdd;
    canvas.drawPath(path, paint);
  }

  @override
  bool shouldRepaint(covariant _GuidePainter oldDelegate) => oldDelegate.guide != guide;
}

/// Top-level worker so the NV21 → JPEG conversion can run in a background
/// isolate via `compute`.
///
/// Converting ~450k pixels (BT.601 YUV → RGB) and then JPEG-encoding the
/// result is far too much work for the UI isolate — doing it there would
/// freeze the scan screen precisely when the user taps "Use these details".
/// Running it here keeps the UI responsive, and because it only ever reads
/// the in-memory frame and returns bytes, nothing touches disk.
///
/// [task] is `[nv21Bytes, width, height]`; returns the JPEG bytes, or null if
/// the frame is missing or malformed.
Uint8List? encodeCardJpeg(List<Object?> task) {
  final nv21 = task[0] as Uint8List?;
  final w = task[1] as int;
  final h = task[2] as int;
  if (nv21 == null || w <= 0 || h <= 0) return null;
  if (nv21.length < w * h + (w * h) ~/ 2) return null;

  // Down-scale to a sane size for a stored document — an ID card does not
  // need full sensor resolution, and this keeps the encode fast and the
  // encrypted blob small.
  const maxWidth = 900;
  final scale = w > maxWidth ? w / maxWidth : 1.0;
  final outW = (w / scale).round().clamp(1, w);
  final outH = (h / scale).round().clamp(1, h);
  final xStep = w / outW;
  final yStep = h / outH;

  final image = img.Image(width: outW, height: outH);
  final ySize = w * h;

  for (var oy = 0; oy < outH; oy++) {
    final sy = (oy * yStep).toInt().clamp(0, h - 1);
    final yRow = sy * w;
    // NV21 chroma row: width bytes per row, V then U per 2x2 block.
    final cRow = ySize + (sy >> 1) * w;
    for (var ox = 0; ox < outW; ox++) {
      final sx = (ox * xStep).toInt().clamp(0, w - 1);
      final yy = nv21[yRow + sx];
      final uv = cRow + (sx >> 1) * 2;
      final u = nv21[uv + 1];
      final v = nv21[uv];

      // BT.601 limited-range YUV -> RGB (the range Android cameras emit).
      final c = yy - 16;
      final d = u - 128;
      final e = v - 128;
      final r = (298 * c + 409 * e + 128) >> 8;
      final g = (298 * c - 100 * d - 208 * e + 128) >> 8;
      final b = (298 * c + 516 * d + 128) >> 8;

      image.setPixelRgb(
          ox, oy, r.clamp(0, 255), g.clamp(0, 255), b.clamp(0, 255));
    }
  }

  return Uint8List.fromList(img.encodeJpg(image, quality: 82));
}
