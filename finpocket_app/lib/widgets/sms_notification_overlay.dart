import 'package:flutter/material.dart';
import '../models/models.dart';
import '../theme/app_theme.dart';

class SmsNotificationOverlay {
  static void show(BuildContext context, AppNotification notification) {
    final overlay = Overlay.of(context);
    late OverlayEntry entry;

    entry = OverlayEntry(
      builder: (ctx) => _SmsHudBanner(
        notification: notification,
        onDismiss: () {
          entry.remove();
        },
      ),
    );

    overlay.insert(entry);
  }
}

class _SmsHudBanner extends StatefulWidget {
  final AppNotification notification;
  final VoidCallback onDismiss;

  const _SmsHudBanner({
    required this.notification,
    required this.onDismiss,
  });

  @override
  State<_SmsHudBanner> createState() => _SmsHudBannerState();
}

class _SmsHudBannerState extends State<_SmsHudBanner> with SingleTickerProviderStateMixin {
  late AnimationController _controller;
  late Animation<Offset> _offsetAnimation;

  @override
  void initState() {
    super.initState();
    _controller = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 380),
    );

    _offsetAnimation = Tween<Offset>(
      begin: const Offset(0, -1.2),
      end: Offset.zero,
    ).animate(CurvedAnimation(
      parent: _controller,
      curve: Curves.easeOutBack,
    ));

    _controller.forward();

    // Auto-dismiss after 4.8 seconds
    Future.delayed(const Duration(milliseconds: 4800), () {
      if (mounted) {
        _dismiss();
      }
    });
  }

  void _dismiss() {
    _controller.reverse().then((_) {
      widget.onDismiss();
    });
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final n = widget.notification;
    final isSms = n.type == NotificationType.sms;
    final isBudgetAlert = n.type == NotificationType.budgetAlert;

    final Color accentColor = isBudgetAlert
        ? const Color(0xFFF59E0B)
        : (isSms ? const Color(0xFF10B981) : AppTheme.primary);

    final String senderLabel = isBudgetAlert
        ? 'FINPOCKET SPENDGUARD'
        : (isSms ? 'VK-FINPCKT (BANK SMS)' : 'FINPOCKET NOTICE');

    return Positioned(
      top: MediaQuery.of(context).padding.top + 8,
      left: 12,
      right: 12,
      child: SlideTransition(
        position: _offsetAnimation,
        child: Material(
          color: Colors.transparent,
          child: GestureDetector(
            onVerticalDragUpdate: (details) {
              if (details.primaryDelta != null && details.primaryDelta! < -5) {
                _dismiss();
              }
            },
            onTap: _dismiss,
            child: Container(
              padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
              decoration: BoxDecoration(
                color: const Color(0xFF0F172A),
                borderRadius: BorderRadius.circular(16),
                border: Border.all(color: accentColor.withOpacity(0.5), width: 1.2),
                boxShadow: [
                  BoxShadow(
                    color: Colors.black.withOpacity(0.6),
                    blurRadius: 18,
                    offset: const Offset(0, 8),
                  ),
                  BoxShadow(
                    color: accentColor.withOpacity(0.2),
                    blurRadius: 10,
                    offset: const Offset(0, 2),
                  ),
                ],
              ),
              child: Column(
                mainAxisSize: MainAxisSize.min,
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  // App / SMS Sender Header
                  Row(
                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                    children: [
                      Row(
                        children: [
                          Container(
                            padding: const EdgeInsets.all(5),
                            decoration: BoxDecoration(
                              color: accentColor.withOpacity(0.18),
                              borderRadius: BorderRadius.circular(7),
                            ),
                            child: Icon(
                              isBudgetAlert
                                  ? Icons.warning_amber_rounded
                                  : (isSms ? Icons.mark_chat_unread_rounded : Icons.notifications_active),
                              color: accentColor,
                              size: 15,
                            ),
                          ),
                          const SizedBox(width: 8),
                          Text(
                            senderLabel,
                            style: TextStyle(
                              fontSize: 11,
                              fontWeight: FontWeight.w800,
                              color: accentColor,
                              letterSpacing: 0.6,
                            ),
                          ),
                        ],
                      ),
                      Row(
                        children: [
                          const Text(
                            'now',
                            style: TextStyle(fontSize: 10, color: Color(0xFF94A3B8)),
                          ),
                          const SizedBox(width: 6),
                          GestureDetector(
                            onTap: _dismiss,
                            child: const Icon(Icons.close, size: 14, color: Color(0xFF64748B)),
                          ),
                        ],
                      ),
                    ],
                  ),
                  const SizedBox(height: 7),
                  Text(
                    n.title,
                    style: const TextStyle(
                      fontSize: 13,
                      fontWeight: FontWeight.w800,
                      color: Colors.white,
                    ),
                  ),
                  const SizedBox(height: 3),
                  Text(
                    n.message,
                    style: const TextStyle(
                      fontSize: 11.5,
                      color: Color(0xFFCBD5E1),
                      height: 1.35,
                    ),
                  ),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}
