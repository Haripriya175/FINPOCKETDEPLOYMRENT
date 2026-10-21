import 'dart:math';

class ReceiptItem {
  final String id;
  String name;
  double price;
  List<String> assignedTo; // List of friend names assigned to this item

  ReceiptItem({
    required this.id,
    required this.name,
    required this.price,
    List<String>? assignedTo,
  }) : assignedTo = assignedTo ?? [];
}

class ReceiptSplitResult {
  final double subtotal;
  final double taxesAndCharges;
  final double totalAmount;
  final List<ReceiptItem> items;
  final List<String> friends;
  final Map<String, double> individualShares;
  final String myVpa;
  final String myName;

  ReceiptSplitResult({
    required this.subtotal,
    required this.taxesAndCharges,
    required this.totalAmount,
    required this.items,
    required this.friends,
    required this.individualShares,
    required this.myVpa,
    required this.myName,
  });

  /// Generate NPCI UPI deep-link request for a specific friend
  String getUpiRequestLinkFor(String friend) {
    final amount = individualShares[friend] ?? 0.0;
    final encName = Uri.encodeComponent(myName);
    final encNote = Uri.encodeComponent('Bill Split with $myName');
    return 'upi://pay?pa=$myVpa&pn=$encName&am=${amount.toStringAsFixed(2)}&cu=INR&tn=$encNote';
  }

  /// Generate pre-formatted WhatsApp share message with item breakdown and UPI payment links
  String getWhatsAppShareText() {
    final buffer = StringBuffer();
    buffer.writeln('🍽️ *FinPocket AI Bill Split*');
    buffer.writeln('Total Bill: ₹${totalAmount.toStringAsFixed(0)} (Subtotal: ₹${subtotal.toStringAsFixed(0)} + Tax: ₹${taxesAndCharges.toStringAsFixed(0)})');
    buffer.writeln('--------------------------------');

    final hasRealVpa = myVpa.trim().isNotEmpty;

    for (final friend in friends) {
      final share = individualShares[friend] ?? 0.0;
      buffer.writeln('👤 *$friend*: ₹${share.toStringAsFixed(0)}');
      if (friend != 'Me' && share > 0 && hasRealVpa) {
        final upiLink = getUpiRequestLinkFor(friend);
        buffer.writeln('   👉 Pay via UPI: $upiLink');
      }
    }

    buffer.writeln('--------------------------------');
    if (!hasRealVpa) {
      buffer.writeln('⚠️ Add your UPI ID in FinPocket → Receive Money to include payment links.');
    }
    buffer.writeln('⚡ Powered by FinPocket Instant Split');
    return buffer.toString();
  }
}

/// Service to parse receipt text / images and calculate split balances
class ReceiptSplitterService {
  /// Parse receipt OCR lines into structured items
  static ReceiptSplitResult parseAndCalculateSplit({
    required String rawText,
    required List<String> friends,
    required String myVpa,
    required String myName,
    Map<String, List<String>>? customAssignments,
  }) {
    final lines = rawText.split('\n').map((l) => l.trim()).where((l) => l.isNotEmpty).toList();
    List<ReceiptItem> items = [];
    double detectedTax = 0.0;
    double detectedSubtotal = 0.0;

    int counter = 1;
    for (final line in lines) {
      final lower = line.toLowerCase();
      // Match price at end of line (e.g. "Paneer Masala 320" or "Beer ... 250.00")
      final priceMatch = RegExp(r'(\d+[\.,]?\d*)\s*$').firstMatch(line);

      if (priceMatch != null) {
        final priceStr = priceMatch.group(1)!.replaceAll(',', '');
        final price = double.tryParse(priceStr) ?? 0.0;

        if (price > 0) {
          // Check if this line is tax or service charge
          if (lower.contains('tax') || lower.contains('gst') || lower.contains('cgst') || lower.contains('sgst') || lower.contains('vat') || lower.contains('service')) {
            detectedTax += price;
          } else if (lower.contains('subtotal') || lower.contains('total') || lower.contains('round')) {
            // Skip summary lines in items list
          } else {
            String itemName = line.substring(0, priceMatch.start).trim();
            itemName = itemName.replaceAll(RegExp(r'[\.\-_:]+$'), '').trim();
            if (itemName.isEmpty) itemName = 'Item $counter';

            items.add(ReceiptItem(
              id: 'item_${counter++}',
              name: itemName,
              price: price,
            ));
            detectedSubtotal += price;
          }
        }
      }
    }

    // Fallback if no items parsed: return an empty result honestly. The old
    // code fabricated a fake restaurant bill (Paneer Masala, Biryani…) here,
    // which got split and shared to real friends as if it were their receipt.
    if (items.isEmpty) {
      return ReceiptSplitResult(
        subtotal: 0.0,
        taxesAndCharges: 0.0,
        totalAmount: 0.0,
        items: const [],
        friends: friends,
        individualShares: {for (final f in friends) f: 0.0},
        myVpa: myVpa,
        myName: myName,
      );
    }

    // Default item assignment (if empty, split equally among all friends)
    for (final item in items) {
      if (customAssignments != null && customAssignments.containsKey(item.id)) {
        item.assignedTo = customAssignments[item.id]!;
      } else if (item.assignedTo.isEmpty) {
        item.assignedTo = List.from(friends);
      }
    }

    final total = detectedSubtotal + detectedTax;
    final Map<String, double> shares = {};
    for (final f in friends) {
      shares[f] = 0.0;
    }

    // Calculate item share
    for (final item in items) {
      final assignees = item.assignedTo.isEmpty ? friends : item.assignedTo;
      final perPerson = item.price / max(assignees.length, 1);
      for (final person in assignees) {
        shares[person] = (shares[person] ?? 0.0) + perPerson;
      }
    }

    // Proportionately distribute tax & service charges
    if (detectedSubtotal > 0 && detectedTax > 0) {
      final taxRatio = detectedTax / detectedSubtotal;
      for (final f in friends) {
        final currentShare = shares[f] ?? 0.0;
        shares[f] = currentShare + (currentShare * taxRatio);
      }
    }

    return ReceiptSplitResult(
      subtotal: detectedSubtotal,
      taxesAndCharges: detectedTax,
      totalAmount: total,
      items: items,
      friends: friends,
      individualShares: shares,
      myVpa: myVpa,
      myName: myName,
    );
  }

  /// Preset sample receipt templates for 1-tap testing
  static const Map<String, String> sampleReceipts = {
    '🍽️ Restaurant Dinner': '''
Royal Flavors Restaurant
1x Paneer Butter Masala 340.00
4x Butter Naan 160.00
1x Chicken Dum Biryani 380.00
2x Fresh Lime Soda 120.00
Subtotal 1000.00
CGST 2.5% 25.00
SGST 2.5% 25.00
Grand Total 1050.00
''',
    '☕ Coffee & Pastries': '''
Starbucks Cafe & Co
2x Caramel Macchiato 580.00
1x Blueberry Muffin 220.00
1x Chocolate Croissant 240.00
GST 5% 52.00
Total 1092.00
''',
    '🛒 Supermarket Groceries': '''
Nature Basket Supermarket
Amul Butter 500g 275.00
Basmati Rice 5kg 450.00
Olive Oil 1L 890.00
Organic Milk 2L 140.00
Total 1755.00
''',
  };
}
