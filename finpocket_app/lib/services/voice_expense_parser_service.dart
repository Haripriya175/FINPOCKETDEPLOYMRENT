import '../models/models.dart';

class VoiceExpenseIntent {
  final double amount;
  final TransactionCategory category;
  final String paymentMethod;
  final String merchant;
  final String description;
  final double confidence;
  final bool isValid;
  final String? rawTranscript;

  VoiceExpenseIntent({
    required this.amount,
    required this.category,
    required this.paymentMethod,
    required this.merchant,
    required this.description,
    this.confidence = 0.9,
    this.isValid = true,
    this.rawTranscript,
  });

  factory VoiceExpenseIntent.invalid(String raw) => VoiceExpenseIntent(
    amount: 0.0,
    category: TransactionCategory.Other,
    paymentMethod: 'CASH',
    merchant: 'Unknown',
    description: raw,
    confidence: 0.0,
    isValid: false,
    rawTranscript: raw,
  );
}

/// Natural Language Parser for Indian English & Hinglish Voice Expense Logging
class VoiceExpenseParserService {
  /// Word-to-number mapping for common Indian and English spoken amounts
  static final Map<String, double> _numberWords = {
    'one': 1, 'two': 2, 'three': 3, 'four': 4, 'five': 5,
    'six': 6, 'seven': 7, 'eight': 8, 'nine': 9, 'ten': 10,
    'twenty': 20, 'thirty': 30, 'forty': 40, 'fifty': 50,
    'sixty': 60, 'seventy': 70, 'eighty': 80, 'ninety': 90,
    'hundred': 100, 'thousand': 1000,
    // Hindi/Hinglish
    'ek': 1, 'do': 2, 'teen': 3, 'char': 4, 'paanch': 5,
    'panch': 5, 'chhe': 6, 'saat': 7, 'aath': 8, 'nau': 9, 'das': 10,
    'bees': 20, 'tees': 30, 'chalis': 40, 'pachaas': 50, 'pachas': 50,
    'saath': 60, 'sattar': 70, 'assi': 80, 'nabbe': 90,
    'sau': 100, 'so': 100, 'hazaar': 1000, 'hazar': 1000,
  };

  /// Category keyword lookup
  static final Map<String, TransactionCategory> _categoryKeywords = {
    // Food & Dining
    'chai': TransactionCategory.Food,
    'tea': TransactionCategory.Food,
    'coffee': TransactionCategory.Food,
    'samosa': TransactionCategory.Food,
    'breakfast': TransactionCategory.Food,
    'lunch': TransactionCategory.Food,
    'dinner': TransactionCategory.Food,
    'snack': TransactionCategory.Food,
    'snacks': TransactionCategory.Food,
    'restaurant': TransactionCategory.Food,
    'hotel': TransactionCategory.Food,
    'food': TransactionCategory.Food,
    'biryani': TransactionCategory.Food,
    'pizza': TransactionCategory.Food,
    'burger': TransactionCategory.Food,

    // Transport
    'auto': TransactionCategory.Travel,
    'rickshaw': TransactionCategory.Travel,
    'cab': TransactionCategory.Travel,
    'taxi': TransactionCategory.Travel,
    'uber': TransactionCategory.Travel,
    'ola': TransactionCategory.Travel,
    'rapido': TransactionCategory.Travel,
    'metro': TransactionCategory.Travel,
    'bus': TransactionCategory.Travel,
    'petrol': TransactionCategory.Travel,
    'diesel': TransactionCategory.Travel,
    'fuel': TransactionCategory.Travel,
    'parking': TransactionCategory.Travel,
    'toll': TransactionCategory.Travel,

    // Groceries (Food)
    'grocery': TransactionCategory.Food,
    'groceries': TransactionCategory.Food,
    'vegetables': TransactionCategory.Food,
    'sabzi': TransactionCategory.Food,
    'fruits': TransactionCategory.Food,
    'milk': TransactionCategory.Food,
    'doodh': TransactionCategory.Food,
    'supermarket': TransactionCategory.Food,
    'ration': TransactionCategory.Food,

    // Health
    'medicine': TransactionCategory.Health,
    'medicines': TransactionCategory.Health,
    'pharmacy': TransactionCategory.Health,
    'medical': TransactionCategory.Health,
    'doctor': TransactionCategory.Health,
    'clinic': TransactionCategory.Health,
    'hospital': TransactionCategory.Health,

    // Entertainment
    'movie': TransactionCategory.Entertainment,
    'cinema': TransactionCategory.Entertainment,
    'theatre': TransactionCategory.Entertainment,
    'film': TransactionCategory.Entertainment,
    'game': TransactionCategory.Entertainment,

    // Shopping
    'shirt': TransactionCategory.Shopping,
    'shoes': TransactionCategory.Shopping,
    'clothes': TransactionCategory.Shopping,
    'cloth': TransactionCategory.Shopping,
    'mall': TransactionCategory.Shopping,
    'book': TransactionCategory.Shopping,
    'books': TransactionCategory.Shopping,

    // Utilities & Bills
    'recharge': TransactionCategory.Bills,
    'bill': TransactionCategory.Bills,
    'electricity': TransactionCategory.Bills,
    'wifi': TransactionCategory.Bills,
  };

  /// Parse spoken sentence into structured transaction intent
  static VoiceExpenseIntent parseTranscript(String transcript) {
    final raw = transcript.trim();
    if (raw.isEmpty) return VoiceExpenseIntent.invalid(raw);

    final clean = raw.toLowerCase().replaceAll(RegExp(r'[,\.\?!]'), ' ');
    final tokens = clean.split(RegExp(r'\s+')).where((t) => t.isNotEmpty).toList();

    // 1. Extract Amount
    double? detectedAmount;

    // A. Check for digits first (e.g. 50, 120.50, ₹50, Rs 50)
    for (final token in tokens) {
      final stripped = token.replaceAll(RegExp(r'[^\d\.]'), '');
      if (stripped.isNotEmpty) {
        final val = double.tryParse(stripped);
        if (val != null && val > 0) {
          detectedAmount = val;
          break;
        }
      }
    }

    // B. Check word-to-number mapping if no digits found
    if (detectedAmount == null) {
      for (int i = 0; i < tokens.length; i++) {
        final word = tokens[i];
        if (_numberWords.containsKey(word)) {
          double val = _numberWords[word]!;
          // Check for multiplier (e.g. "two hundred", "panch sau")
          if (i + 1 < tokens.length) {
            final next = tokens[i + 1];
            if (next == 'hundred' || next == 'sau' || next == 'so') {
              val = val * 100;
            } else if (next == 'thousand' || next == 'hazaar' || next == 'hazar') {
              val = val * 1000;
            }
          }
          detectedAmount = val;
          break;
        }
      }
    }

    if (detectedAmount == null || detectedAmount <= 0) {
      return VoiceExpenseIntent.invalid(raw);
    }

    // 2. Extract Category & Merchant
    TransactionCategory detectedCategory = TransactionCategory.Other;
    String detectedMerchant = 'Cash Expense';

    for (final token in tokens) {
      if (_categoryKeywords.containsKey(token)) {
        detectedCategory = _categoryKeywords[token]!;
        detectedMerchant = token[0].toUpperCase() + token.substring(1);
        break;
      }
    }

    // 3. Extract Payment Method (Cash vs UPI)
    String paymentMethod = 'CASH'; // Default to cash for voice offline ledger
    if (clean.contains('upi') || clean.contains('gpay') || clean.contains('phonepe') || clean.contains('online')) {
      paymentMethod = 'UPI';
    }

    // 4. Clean description
    String desc = raw;
    if (desc.length > 50) desc = desc.substring(0, 50);

    return VoiceExpenseIntent(
      amount: detectedAmount,
      category: detectedCategory,
      paymentMethod: paymentMethod,
      merchant: detectedMerchant,
      description: desc,
      confidence: 0.95,
      isValid: true,
      rawTranscript: raw,
    );
  }
}
