import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../models/models.dart';
import '../providers/app_state.dart';
import '../theme/app_theme.dart';

class NotificationsScreen extends StatefulWidget {
  const NotificationsScreen({super.key});

  @override
  State<NotificationsScreen> createState() => _NotificationsScreenState();
}

class _NotificationsScreenState extends State<NotificationsScreen> {
  String _selectedFilter = 'ALL';

  @override
  Widget build(BuildContext context) {
    final state = Provider.of<AppState>(context);
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final allNotifications = state.notifications;

    final filtered = allNotifications.where((n) {
      if (_selectedFilter == 'SMS') return n.type == NotificationType.sms;
      if (_selectedFilter == 'BUDGET') return n.type == NotificationType.budgetAlert;
      if (_selectedFilter == 'QUOTES') return n.type == NotificationType.dailyQuote;
      if (_selectedFilter == 'SECURITY') return n.type == NotificationType.security;
      if (_selectedFilter == 'EMI') return n.type == NotificationType.emiReminder;
      return true;
    }).toList();

    return Scaffold(
      appBar: AppBar(
        title: const Text('Notification Center'),
        actions: [
          if (allNotifications.isNotEmpty) ...[
            TextButton(
              onPressed: () => state.markAllNotificationsAsRead(),
              child: const Text('Read All', style: TextStyle(color: AppTheme.primary, fontSize: 13, fontWeight: FontWeight.bold)),
            ),
            IconButton(
              icon: const Icon(Icons.delete_sweep_outlined, size: 20),
              tooltip: 'Clear All',
              onPressed: () {
                showDialog(
                  context: context,
                  builder: (ctx) => AlertDialog(
                    backgroundColor: const Color(0xFF0F172A),
                    title: const Text('Clear Notifications', style: TextStyle(color: Colors.white, fontSize: 16)),
                    content: const Text('Are you sure you want to clear all notification history?', style: TextStyle(color: Color(0xFF94A3B8))),
                    actions: [
                      TextButton(onPressed: () => Navigator.pop(ctx), child: const Text('Cancel')),
                      TextButton(
                        onPressed: () {
                          state.clearAllNotifications();
                          Navigator.pop(ctx);
                        },
                        child: const Text('Clear', style: TextStyle(color: AppTheme.danger)),
                      ),
                    ],
                  ),
                );
              },
            ),
          ],
        ],
      ),
      body: Column(
        children: [
          // Filter Chips
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
            color: isDark ? const Color(0xFF0B132B) : const Color(0xFFF1F5F9),
            child: SingleChildScrollView(
              scrollDirection: Axis.horizontal,
              child: Row(
                children: [
                  _filterChip('ALL', 'All (${allNotifications.length})', isDark),
                  const SizedBox(width: 8),
                  _filterChip(
                    'SMS',
                    '💳 SMS Receipts (${allNotifications.where((n) => n.type == NotificationType.sms).length})',
                    isDark,
                  ),
                  const SizedBox(width: 8),
                  _filterChip(
                    'BUDGET',
                    '⚠️ Budget Alerts (${allNotifications.where((n) => n.type == NotificationType.budgetAlert).length})',
                    isDark,
                  ),
                  const SizedBox(width: 8),
                  _filterChip(
                    'QUOTES',
                    '💡 Motivation (${allNotifications.where((n) => n.type == NotificationType.dailyQuote).length})',
                    isDark,
                  ),
                  const SizedBox(width: 8),
                  _filterChip(
                    'SECURITY',
                    '🛡️ Security (${allNotifications.where((n) => n.type == NotificationType.security).length})',
                    isDark,
                  ),
                  const SizedBox(width: 8),
                  _filterChip(
                    'EMI',
                    '🏦 EMI Guidance (${allNotifications.where((n) => n.type == NotificationType.emiReminder).length})',
                    isDark,
                  ),
                ],
              ),
            ),
          ),

          // Notification List
          Expanded(
            child: filtered.isEmpty
                ? Center(
                    child: Padding(
                      padding: const EdgeInsets.all(32),
                      child: Column(
                        mainAxisAlignment: MainAxisAlignment.center,
                        children: [
                          Container(
                            width: 68,
                            height: 68,
                            decoration: BoxDecoration(
                              color: AppTheme.primary.withOpacity(0.12),
                              shape: BoxShape.circle,
                            ),
                            child: const Icon(Icons.notifications_none_rounded, size: 36, color: AppTheme.primary),
                          ),
                          const SizedBox(height: 16),
                          Text(
                            'No notifications yet',
                            style: TextStyle(
                              fontSize: 16,
                              fontWeight: FontWeight.bold,
                              color: isDark ? Colors.white : Colors.black87,
                            ),
                          ),
                          const SizedBox(height: 6),
                          const Text(
                            'Transaction SMS receipts, budget cap alerts, and daily motivation quotes will appear here.',
                            textAlign: TextAlign.center,
                            style: TextStyle(fontSize: 12, color: Color(0xFF94A3B8), height: 1.4),
                          ),
                        ],
                      ),
                    ),
                  )
                : ListView.builder(
                    padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
                    itemCount: filtered.length,
                    itemBuilder: (context, index) {
                      final n = filtered[index];
                      return _buildNotificationCard(n, isDark, state);
                    },
                  ),
          ),
        ],
      ),
    );
  }

  Widget _filterChip(String filterKey, String label, bool isDark) {
    final isSelected = _selectedFilter == filterKey;
    return InkWell(
      borderRadius: BorderRadius.circular(20),
      onTap: () {
        setState(() {
          _selectedFilter = filterKey;
        });
      },
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
        decoration: BoxDecoration(
          color: isSelected
              ? AppTheme.primary
              : (isDark ? const Color(0xFF1E293B) : Colors.white),
          borderRadius: BorderRadius.circular(20),
          border: Border.all(
            color: isSelected
                ? AppTheme.primary
                : (isDark ? const Color(0xFF334155) : const Color(0xFFCBD5E1)),
          ),
        ),
        child: Text(
          label,
          style: TextStyle(
            fontSize: 12,
            fontWeight: isSelected ? FontWeight.bold : FontWeight.w500,
            color: isSelected ? Colors.white : (isDark ? const Color(0xFFCBD5E1) : const Color(0xFF334155)),
          ),
        ),
      ),
    );
  }

  Widget _buildNotificationCard(AppNotification n, bool isDark, AppState state) {
    final Color badgeColor;
    final IconData iconData;
    final String typeTag;

    switch (n.type) {
      case NotificationType.budgetAlert:
        badgeColor = const Color(0xFFF59E0B);
        iconData = Icons.warning_amber_rounded;
        typeTag = 'BUDGET WARNING';
        break;
      case NotificationType.sms:
        badgeColor = const Color(0xFF10B981);
        iconData = Icons.mark_chat_unread_rounded;
        typeTag = 'TRANSACTION SMS';
        break;
      case NotificationType.security:
        badgeColor = const Color(0xFFEF4444);
        iconData = Icons.shield_outlined;
        typeTag = 'SECURITY ALERT';
        break;
      case NotificationType.emiReminder:
        badgeColor = const Color(0xFF8B5CF6);
        iconData = Icons.account_balance_rounded;
        typeTag = 'EMI GUIDANCE';
        break;
      case NotificationType.dailyQuote:
      case NotificationType.system:
        badgeColor = const Color(0xFF38BDF8);
        iconData = Icons.lightbulb_outline_rounded;
        typeTag = n.type == NotificationType.system ? 'UPDATE' : 'DAILY MOTIVATION';
        break;
    }

    return Container(
      margin: const EdgeInsets.only(bottom: 12),
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: isDark ? AppTheme.bgCardDark : AppTheme.bgCardLight,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(
          color: n.isRead
              ? (isDark ? AppTheme.borderDark : AppTheme.borderLight)
              : badgeColor.withOpacity(0.5),
          width: n.isRead ? 1 : 1.4,
        ),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withOpacity(isDark ? 0.25 : 0.04),
            blurRadius: 8,
            offset: const Offset(0, 2),
          ),
        ],
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Row(
                children: [
                  Container(
                    padding: const EdgeInsets.all(5),
                    decoration: BoxDecoration(
                      color: badgeColor.withOpacity(0.18),
                      borderRadius: BorderRadius.circular(6),
                    ),
                    child: Icon(iconData, color: badgeColor, size: 14),
                  ),
                  const SizedBox(width: 8),
                  Text(
                    typeTag,
                    style: TextStyle(
                      fontSize: 10,
                      fontWeight: FontWeight.bold,
                      color: badgeColor,
                      letterSpacing: 0.5,
                    ),
                  ),
                ],
              ),
              Row(
                children: [
                  Text(
                    _formatTime(n.timestamp),
                    style: TextStyle(
                      fontSize: 10,
                      color: isDark ? AppTheme.textSecondaryDark : AppTheme.textSecondaryLight,
                    ),
                  ),
                  if (!n.isRead) ...[
                    const SizedBox(width: 6),
                    Container(
                      width: 7,
                      height: 7,
                      decoration: BoxDecoration(
                        color: badgeColor,
                        shape: BoxShape.circle,
                      ),
                    ),
                  ],
                ],
              ),
            ],
          ),
          const SizedBox(height: 8),
          Text(
            n.title,
            style: TextStyle(
              fontSize: 13,
              fontWeight: FontWeight.w700,
              color: isDark ? AppTheme.textPrimaryDark : AppTheme.textPrimaryLight,
            ),
          ),
          const SizedBox(height: 4),
          Text(
            n.message,
            style: TextStyle(
              fontSize: 12,
              color: isDark ? const Color(0xFFCBD5E1) : const Color(0xFF475569),
              height: 1.35,
            ),
          ),
          if (n.data != null && n.data!['referenceId'] != null) ...[
            const SizedBox(height: 8),
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
              decoration: BoxDecoration(
                color: isDark ? const Color(0xFF1E293B) : const Color(0xFFF1F5F9),
                borderRadius: BorderRadius.circular(6),
              ),
              child: Text(
                'UPI Ref: ${n.data!['referenceId']} • Account: ${n.data!['sourceAccount'] ?? "FinPocket Wallet"}',
                style: const TextStyle(fontSize: 10, fontFamily: 'monospace', color: Color(0xFF38BDF8)),
              ),
            ),
          ],
        ],
      ),
    );
  }

  String _formatTime(DateTime dt) {
    final now = DateTime.now();
    final diff = now.difference(dt);
    if (diff.inMinutes < 1) return 'Just now';
    if (diff.inMinutes < 60) return '${diff.inMinutes}m ago';
    if (diff.inHours < 24) return '${diff.inHours}h ago';
    return '${dt.day}/${dt.month}';
  }
}
