import 'dart:math' as math;
import 'package:flutter/material.dart';
import 'package:mobile_scanner/mobile_scanner.dart';
import '../theme/app_theme.dart';
import 'scan_action_sheet.dart';

class QrScannerModal extends StatefulWidget {
  final Function(String scannedValue) onScanned;

  const QrScannerModal({super.key, required this.onScanned});

  /// Scans a code, then asks the user whether they want to pay it or split the
  /// bill across friends. Returns the payload only when the user chose to pay —
  /// a split (or a cancel) returns `null` so callers never fall through into the
  /// Send Money form against the user's wishes.
  static Future<String?> show(BuildContext context) async {
    final scanned = await showModalBottomSheet<String>(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      builder: (ctx) => QrScannerModal(
        onScanned: (val) {
          Navigator.of(ctx).pop(val);
        },
      ),
    );

    if (!context.mounted) return null;
    if (scanned == null || scanned.trim().isEmpty) return null;

    final decision = await ScanActionSheet.ask(context, scanned.trim());
    return decision.action == ScanAction.pay ? decision.payload : null;
  }

  @override
  State<QrScannerModal> createState() => _QrScannerModalState();
}

class _QrScannerModalState extends State<QrScannerModal> with SingleTickerProviderStateMixin {
  late final MobileScannerController _cameraController;
  late final AnimationController _laserController;
  late final Animation<double> _laserAnimation;

  bool _isTorchOn = false;
  bool _hasDetected = false;
  String? _detectedFeedback;
  final TextEditingController _manualInputController = TextEditingController();

  @override
  void initState() {
    super.initState();
    _cameraController = MobileScannerController(
      detectionSpeed: DetectionSpeed.noDuplicates,
      facing: CameraFacing.back,
      torchEnabled: false,
    );

    _laserController = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 1800),
    )..repeat(reverse: true);

    _laserAnimation = Tween<double>(begin: 0.08, end: 0.92).animate(
      CurvedAnimation(parent: _laserController, curve: Curves.easeInOut),
    );
  }

  @override
  void dispose() {
    _laserController.dispose();
    _cameraController.dispose();
    _manualInputController.dispose();
    super.dispose();
  }

  String _parseUpiOrRecipient(String raw) {
    final trimmed = raw.trim();
    // Standard UPI URI format: upi://pay?pa=merchant@upi&pn=StoreName...
    if (trimmed.toLowerCase().startsWith('upi://pay')) {
      try {
        final uri = Uri.parse(trimmed);
        final pa = uri.queryParameters['pa'];
        if (pa != null && pa.trim().isNotEmpty) {
          return pa.trim();
        }
      } catch (_) {}
    }
    return trimmed;
  }

  void _handleDetected(String rawValue) {
    if (_hasDetected) return;
    final trimmed = rawValue.trim();
    if (trimmed.isEmpty) return;
    final parsed = _parseUpiOrRecipient(trimmed);

    setState(() {
      _hasDetected = true;
      _detectedFeedback = parsed;
    });

    // Provide visual feedback before popping
    Future.delayed(const Duration(milliseconds: 350), () {
      if (mounted) {
        widget.onScanned(trimmed);
      }
    });
  }

  @override
  Widget build(BuildContext context) {
    final size = MediaQuery.of(context).size;
    final viewfinderSize = size.width * 0.72;

    // Keyboard-aware height: the manual "enter UPI ID" field sits near the
    // bottom, so clamp the sheet to the visible area when the keyboard opens
    // (otherwise the keyboard covers the input / triggers a RenderFlex overflow).
    final double keyboardHeight = MediaQuery.of(context).viewInsets.bottom;
    final double sheetHeight = keyboardHeight > 0
        ? math.max(280.0, size.height - keyboardHeight - 16)
        : size.height * 0.88;

    return Container(
      height: sheetHeight,
      decoration: const BoxDecoration(
        color: Color(0xFF090D16),
        borderRadius: BorderRadius.vertical(top: Radius.circular(28)),
        boxShadow: [
          BoxShadow(
            color: Colors.black87,
            blurRadius: 30,
            spreadRadius: 10,
          ),
        ],
      ),
      child: Column(
        children: [
          // Drag handle bar
          Container(
            margin: const EdgeInsets.only(top: 12, bottom: 8),
            width: 44,
            height: 4,
            decoration: BoxDecoration(
              color: Colors.white24,
              borderRadius: BorderRadius.circular(2),
            ),
          ),

          // Header
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 8),
            child: Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                Row(
                  children: [
                    Container(
                      padding: const EdgeInsets.all(8),
                      decoration: BoxDecoration(
                        color: AppTheme.primary.withOpacity(0.18),
                        borderRadius: BorderRadius.circular(10),
                      ),
                      child: const Icon(Icons.qr_code_scanner, color: AppTheme.primary, size: 20),
                    ),
                    const SizedBox(width: 12),
                    const Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          'Scan User / UPI QR',
                          style: TextStyle(
                            fontSize: 16,
                            fontWeight: FontWeight.bold,
                            color: Colors.white,
                          ),
                        ),
                        Text(
                          'Live Camera • Instant UPI 2.0 Detection',
                          style: TextStyle(fontSize: 11, color: Color(0xFF94A3B8)),
                        ),
                      ],
                    ),
                  ],
                ),
                IconButton(
                  icon: const Icon(Icons.close, color: Colors.white70),
                  onPressed: () => Navigator.of(context).pop(),
                ),
              ],
            ),
          ),

          const Divider(color: Color(0xFF1E293B), height: 1),

          // Live Camera Viewfinder
          Expanded(
            child: SingleChildScrollView(
              padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 14),
              child: Column(
                children: [
                  // Camera Box with Laser Sweep
                  Center(
                    child: Container(
                      width: viewfinderSize,
                      height: viewfinderSize,
                      decoration: BoxDecoration(
                        borderRadius: BorderRadius.circular(20),
                        border: Border.all(
                          color: _hasDetected
                              ? const Color(0xFF10B981)
                              : const Color(0xFF14B8A6).withOpacity(0.5),
                          width: 2,
                        ),
                        boxShadow: [
                          BoxShadow(
                            color: (_hasDetected ? const Color(0xFF10B981) : const Color(0xFF14B8A6))
                                .withOpacity(0.2),
                            blurRadius: 20,
                            spreadRadius: 2,
                          ),
                        ],
                      ),
                      child: ClipRRect(
                        borderRadius: BorderRadius.circular(18),
                        child: Stack(
                          fit: StackFit.expand,
                          children: [
                            // REAL LIVE MOBILE SCANNER CAMERA FEED
                            MobileScanner(
                              controller: _cameraController,
                              onDetect: (BarcodeCapture capture) {
                                for (final barcode in capture.barcodes) {
                                  final raw = barcode.rawValue;
                                  if (raw != null && raw.trim().isNotEmpty) {
                                    _handleDetected(raw);
                                    break;
                                  }
                                }
                              },
                              errorBuilder: (context, error) {
                                return Container(
                                  color: const Color(0xFF0F172A),
                                  padding: const EdgeInsets.all(16),
                                  child: Center(
                                    child: Column(
                                      mainAxisSize: MainAxisSize.min,
                                      children: [
                                        const Icon(Icons.videocam_off_outlined, color: Colors.orangeAccent, size: 36),
                                        const SizedBox(height: 8),
                                        const Text(
                                          'Camera Initializing',
                                          style: TextStyle(color: Colors.white, fontWeight: FontWeight.bold, fontSize: 13),
                                        ),
                                        const SizedBox(height: 4),
                                        Text(
                                          'Please grant camera permission or enter UPI ID manually below.',
                                          textAlign: TextAlign.center,
                                          style: TextStyle(color: Colors.white.withOpacity(0.7), fontSize: 11),
                                        ),
                                      ],
                                    ),
                                  ),
                                );
                              },
                            ),

                            // Corner Viewfinder Brackets
                            Positioned(
                              top: 14,
                              left: 14,
                              child: _buildCornerBracket(top: true, left: true),
                            ),
                            Positioned(
                              top: 14,
                              right: 14,
                              child: _buildCornerBracket(top: true, left: false),
                            ),
                            Positioned(
                              bottom: 14,
                              left: 14,
                              child: _buildCornerBracket(top: false, left: true),
                            ),
                            Positioned(
                              bottom: 14,
                              right: 14,
                              child: _buildCornerBracket(top: false, left: false),
                            ),

                            // Animated Laser Sweep Line
                            if (!_hasDetected)
                              AnimatedBuilder(
                                animation: _laserAnimation,
                                builder: (context, child) {
                                  return Positioned(
                                    top: _laserAnimation.value * (viewfinderSize - 20),
                                    left: 20,
                                    right: 20,
                                    child: Container(
                                      height: 3,
                                      decoration: BoxDecoration(
                                        gradient: const LinearGradient(
                                          colors: [
                                            Colors.transparent,
                                            Color(0xFF2DD4BF),
                                            Color(0xFF14B8A6),
                                            Colors.transparent,
                                          ],
                                        ),
                                        boxShadow: [
                                          BoxShadow(
                                            color: const Color(0xFF14B8A6).withOpacity(0.9),
                                            blurRadius: 8,
                                            spreadRadius: 2,
                                          ),
                                        ],
                                      ),
                                    ),
                                  );
                                },
                              ),

                            // Success Overlay on Detection
                            if (_hasDetected)
                              Container(
                                color: const Color(0xFF10B981).withOpacity(0.35),
                                child: Center(
                                  child: Column(
                                    mainAxisSize: MainAxisSize.min,
                                    children: [
                                      const Icon(Icons.check_circle_rounded, color: Colors.white, size: 54),
                                      const SizedBox(height: 8),
                                      const Text(
                                        'QR CODE DETECTED',
                                        style: TextStyle(
                                          color: Colors.white,
                                          fontWeight: FontWeight.w900,
                                          fontSize: 14,
                                          letterSpacing: 1.0,
                                        ),
                                      ),
                                      const SizedBox(height: 4),
                                      if (_detectedFeedback != null)
                                        Padding(
                                          padding: const EdgeInsets.symmetric(horizontal: 16),
                                          child: Text(
                                            _detectedFeedback!,
                                            maxLines: 1,
                                            overflow: TextOverflow.ellipsis,
                                            style: const TextStyle(
                                              color: Colors.white70,
                                              fontSize: 12,
                                              fontWeight: FontWeight.w600,
                                            ),
                                          ),
                                        ),
                                    ],
                                  ),
                                ),
                              ),
                          ],
                        ),
                      ),
                    ),
                  ),

                  const SizedBox(height: 16),

                  // Real Camera Controls (Torch & Camera Flip)
                  Row(
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: [
                      // Torch Toggle
                      InkWell(
                        onTap: () async {
                          await _cameraController.toggleTorch();
                          setState(() {
                            _isTorchOn = !_isTorchOn;
                          });
                        },
                        borderRadius: BorderRadius.circular(10),
                        child: Container(
                          padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
                          decoration: BoxDecoration(
                            color: _isTorchOn ? const Color(0xFFFBBF24).withOpacity(0.25) : const Color(0xFF1E293B),
                            borderRadius: BorderRadius.circular(10),
                            border: Border.all(
                              color: _isTorchOn ? const Color(0xFFFBBF24) : Colors.white12,
                            ),
                          ),
                          child: Row(
                            mainAxisSize: MainAxisSize.min,
                            children: [
                              Icon(
                                _isTorchOn ? Icons.flash_on : Icons.flash_off,
                                size: 16,
                                color: _isTorchOn ? const Color(0xFFFBBF24) : Colors.white70,
                              ),
                              const SizedBox(width: 6),
                              Text(
                                _isTorchOn ? 'Torch On' : 'Torch Off',
                                style: TextStyle(
                                  fontSize: 12,
                                  fontWeight: FontWeight.w600,
                                  color: _isTorchOn ? const Color(0xFFFBBF24) : Colors.white70,
                                ),
                              ),
                            ],
                          ),
                        ),
                      ),

                      const SizedBox(width: 12),

                      // Switch Camera (Back / Front)
                      InkWell(
                        onTap: () => _cameraController.switchCamera(),
                        borderRadius: BorderRadius.circular(10),
                        child: Container(
                          padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
                          decoration: BoxDecoration(
                            color: const Color(0xFF1E293B),
                            borderRadius: BorderRadius.circular(10),
                            border: Border.all(color: Colors.white12),
                          ),
                          child: const Row(
                            mainAxisSize: MainAxisSize.min,
                            children: [
                              Icon(Icons.flip_camera_ios, size: 16, color: Colors.white70),
                              SizedBox(width: 6),
                              Text(
                                'Flip Lens',
                                style: TextStyle(
                                  fontSize: 12,
                                  fontWeight: FontWeight.w600,
                                  color: Colors.white70,
                                ),
                              ),
                            ],
                          ),
                        ),
                      ),
                    ],
                  ),

                  const SizedBox(height: 18),

                  // Guidance text
                  const Text(
                    'Point camera steadily at any UPI QR code, merchant standee, or phone screen.\nIt will auto-detect instantly.',
                    textAlign: TextAlign.center,
                    style: TextStyle(
                      fontSize: 11,
                      color: Color(0xFF94A3B8),
                      height: 1.4,
                    ),
                  ),

                  const SizedBox(height: 20),

                  // Manual UPI Entry Alternative
                  Container(
                    padding: const EdgeInsets.all(14),
                    decoration: BoxDecoration(
                      color: const Color(0xFF131D2E),
                      borderRadius: BorderRadius.circular(14),
                      border: Border.all(color: const Color(0xFF1E293B)),
                    ),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        const Text(
                          'OR ENTER UPI ID / PHONE MANUALLY',
                          style: TextStyle(
                            fontSize: 10,
                            fontWeight: FontWeight.w800,
                            color: Color(0xFF64748B),
                            letterSpacing: 0.8,
                          ),
                        ),
                        const SizedBox(height: 10),
                        Row(
                          children: [
                            Expanded(
                              child: TextField(
                                controller: _manualInputController,
                                style: const TextStyle(color: Colors.white, fontSize: 13),
                                decoration: InputDecoration(
                                  hintText: 'e.g. mobile number or name@upi',
                                  hintStyle: const TextStyle(color: Colors.white38, fontSize: 12),
                                  filled: true,
                                  fillColor: const Color(0xFF0F172A),
                                  isDense: true,
                                  contentPadding: const EdgeInsets.symmetric(horizontal: 12, vertical: 12),
                                  border: OutlineInputBorder(
                                    borderRadius: BorderRadius.circular(10),
                                    borderSide: const BorderSide(color: Color(0xFF334155)),
                                  ),
                                  enabledBorder: OutlineInputBorder(
                                    borderRadius: BorderRadius.circular(10),
                                    borderSide: const BorderSide(color: Color(0xFF334155)),
                                  ),
                                  focusedBorder: OutlineInputBorder(
                                    borderRadius: BorderRadius.circular(10),
                                    borderSide: const BorderSide(color: AppTheme.primary, width: 1.5),
                                  ),
                                ),
                              ),
                            ),
                            const SizedBox(width: 10),
                            ElevatedButton(
                              style: ElevatedButton.styleFrom(
                                backgroundColor: AppTheme.primary,
                                foregroundColor: Colors.white,
                                padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
                                shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
                                elevation: 0,
                              ),
                              onPressed: () {
                                final text = _manualInputController.text.trim();
                                if (text.isNotEmpty) {
                                  widget.onScanned(text);
                                }
                              },
                              child: const Text('Confirm', style: TextStyle(fontWeight: FontWeight.bold, fontSize: 12)),
                            ),
                          ],
                        ),
                      ],
                    ),
                  ),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildCornerBracket({required bool top, required bool left}) {
    const double length = 22;
    const double thickness = 3.5;
    const Color color = Color(0xFF14B8A6);

    return Container(
      width: length,
      height: length,
      decoration: BoxDecoration(
        border: Border(
          top: top ? const BorderSide(color: color, width: thickness) : BorderSide.none,
          bottom: !top ? const BorderSide(color: color, width: thickness) : BorderSide.none,
          left: left ? const BorderSide(color: color, width: thickness) : BorderSide.none,
          right: !left ? const BorderSide(color: color, width: thickness) : BorderSide.none,
        ),
      ),
    );
  }
}
