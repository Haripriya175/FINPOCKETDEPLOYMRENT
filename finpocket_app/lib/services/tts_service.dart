import 'package:flutter/foundation.dart';
import 'package:flutter_tts/flutter_tts.dart';
import 'package:shared_preferences/shared_preferences.dart';
import '../models/models.dart';

enum TtsVoicePersona {
  nativeRegional,   // 🎙️ Native Speaker (Natural Local Human Tone) - Pitch 1.0, Rate 0.48
  financialAdvisor, // 💼 Financial Advisor (Professional & Confident) - Pitch 1.0, Rate 0.50
  friendlyGuide,    // 🤝 Friendly Companion (Warm & Respectful) - Pitch 0.98, Rate 0.46
  soundboxVoice,    // 📢 Clear Announcer (Clear, Crisp Soundbox Tone) - Pitch 1.0, Rate 0.52
}

class TtsService {
  static final TtsService _instance = TtsService._internal();
  factory TtsService() => _instance;
  TtsService._internal();

  final FlutterTts _flutterTts = FlutterTts();
  bool _isInitialized = false;
  bool _isSpeaking = false;
  TtsVoicePersona _currentPersona = TtsVoicePersona.nativeRegional;

  bool get isSpeaking => _isSpeaking;
  TtsVoicePersona get currentPersona => _currentPersona;

  Future<void> init() async {
    if (_isInitialized) return;
    try {
      final prefs = await SharedPreferences.getInstance();
      final savedIndex = prefs.getInt('fp_tts_persona') ?? 0;
      if (savedIndex >= 0 && savedIndex < TtsVoicePersona.values.length) {
        _currentPersona = TtsVoicePersona.values[savedIndex];
      }

      await _applyPersonaSettings(_currentPersona);
      await _flutterTts.setVolume(1.0);

      _flutterTts.setStartHandler(() {
        _isSpeaking = true;
      });

      _flutterTts.setCompletionHandler(() {
        _isSpeaking = false;
      });

      _flutterTts.setCancelHandler(() {
        _isSpeaking = false;
      });

      _flutterTts.setErrorHandler((msg) {
        debugPrint('[TtsService] TTS error: $msg');
        _isSpeaking = false;
      });

      _isInitialized = true;
    } catch (e) {
      debugPrint('[TtsService] Init error: $e');
    }
  }

  Future<void> _applyPersonaSettings(TtsVoicePersona persona) async {
    switch (persona) {
      case TtsVoicePersona.nativeRegional:
        await _flutterTts.setPitch(1.0);
        await _flutterTts.setSpeechRate(0.48);
        break;
      case TtsVoicePersona.financialAdvisor:
        await _flutterTts.setPitch(1.0);
        await _flutterTts.setSpeechRate(0.50);
        break;
      case TtsVoicePersona.friendlyGuide:
        await _flutterTts.setPitch(0.98);
        await _flutterTts.setSpeechRate(0.46);
        break;
      case TtsVoicePersona.soundboxVoice:
        await _flutterTts.setPitch(1.0);
        await _flutterTts.setSpeechRate(0.52);
        break;
    }
  }

  Future<void> _selectBestVoiceForLanguage(String langCode) async {
    try {
      final voices = await _flutterTts.getVoices;
      if (voices is List && voices.isNotEmpty) {
        final langPrefix = langCode.toLowerCase().split('-').first;
        for (final v in voices) {
          if (v is Map) {
            final locale = (v['locale'] ?? '').toString().toLowerCase();
            final name = (v['name'] ?? '').toString().toLowerCase();
            if (locale.contains(langPrefix) || locale.contains(langCode.toLowerCase()) || name.contains(langPrefix)) {
              await _flutterTts.setVoice({'name': v['name'], 'locale': v['locale']});
              return;
            }
          }
        }
      }
    } catch (_) {}
  }

  Future<void> setVoicePersona(TtsVoicePersona persona) async {
    _currentPersona = persona;
    await _applyPersonaSettings(persona);
    try {
      final prefs = await SharedPreferences.getInstance();
      await prefs.setInt('fp_tts_persona', persona.index);
    } catch (_) {}
  }

  static String getLanguageCode(SupportedLanguage lang) {
    switch (lang) {
      case SupportedLanguage.te:
        return 'te-IN';
      case SupportedLanguage.hi:
        return 'hi-IN';
      case SupportedLanguage.ta:
        return 'ta-IN';
      case SupportedLanguage.kn:
        return 'kn-IN';
      case SupportedLanguage.ml:
        return 'ml-IN';
      case SupportedLanguage.mr:
        return 'mr-IN';
      case SupportedLanguage.bn:
        return 'bn-IN';
      default:
        return 'en-IN';
    }
  }

  Future<void> speak(String text, SupportedLanguage lang) async {
    try {
      await init();
      if (_isSpeaking) {
        await stop();
      }

      await _applyPersonaSettings(_currentPersona);

      final langCode = getLanguageCode(lang);
      try {
        await _flutterTts.setLanguage(langCode);
      } catch (e) {
        final shortCode = lang.toString().split('.').last;
        await _flutterTts.setLanguage(shortCode);
      }

      await _selectBestVoiceForLanguage(langCode);

      _isSpeaking = true;
      await _flutterTts.speak(text);
    } catch (e) {
      debugPrint('[TtsService] Speak error: $e');
      _isSpeaking = false;
    }
  }

  Future<void> stop() async {
    try {
      await _flutterTts.stop();
      _isSpeaking = false;
    } catch (e) {
      debugPrint('[TtsService] Stop error: $e');
    }
  }

  // Authentic spoken summaries in native state accents
  String getHomeNarration({
    required SupportedLanguage lang,
    required double balance,
    required double safeToSpend,
    required double emergencyFund,
    required String name,
    int? remainingDays,
  }) {
    final b = balance.toInt();
    final s = safeToSpend.toInt();
    final em = emergencyFund.toInt();
    final now = DateTime.now();
    final daysInMonth = DateTime(now.year, now.month + 1, 0).day;
    final daysLeft = remainingDays ?? (daysInMonth - now.day + 1);

    switch (lang) {
      case SupportedLanguage.te:
        return 'నమస్కారం $name గారు. మీ మొత్తం బ్యాంక్ బ్యాలెన్స్ ₹$b. మీ మొత్తం బ్యాలెన్స్ ప్రకారం, ఈ నెలకు మిగిలిన $daysLeft రోజులకు గాను ఈ రోజు మీరు సురక్షితంగా ఖర్చు చేయగల మొత్తం ₹$s. మీ ఎమర్జెన్సీ ఫండ్‌లో ₹$em భద్రంగా ఉన్నాయి.';
      case SupportedLanguage.hi:
        return 'नमस्ते $name जी। आपका कुल बैंक बैलेंस ₹$b है। आपके कुल बैलेंस के आधार पर, इस महीने के बाकी $daysLeft दिनों के लिए आज खर्च करने के लिए सुरक्षित राशि ₹$s है। आपके आपातकालीन फंड में ₹$em जमा हैं।';
      case SupportedLanguage.ta:
        return 'வணக்கம் $name! உங்கள் மொத்த வங்கி இருப்பு ₹$b. உங்கள் மொத்த இருப்பின்படி, இந்த மாதத்தின் மீதமுள்ள $daysLeft நாட்களுக்கு இன்று நீங்கள் செலவழிக்க பாதுகாப்பான தொகை ₹$s. அவசரகால நிதியில் ₹$em பத்திரமாக உள்ளது.';
      case SupportedLanguage.kn:
        return 'ನಮಸ್ಕಾರ $name! ನಿಮ್ಮ ಒಟ್ಟು ಬ್ಯಾಂಕ್ ಬ್ಯಾಲೆನ್ಸ್ ₹$b. ನಿಮ್ಮ ಒಟ್ಟು ಬ್ಯಾಲೆನ್ಸ್ ಆಧಾರದ ಮೇಲೆ, ಈ ತಿಂಗಳ ಉಳಿದ $daysLeft ದಿನಗಳಿಗೆ ಇಂದು ನೀವು ಸುರಕ್ಷಿತವಾಗಿ ಖರ್ಚು ಮಾಡಬಹುದಾದ ಮಿತಿ ₹$s. ತುರ್ತು ನಿಧಿಯಲ್ಲಿ ₹$em ಸುರಕ್ಷಿತವಾಗಿದೆ.';
      case SupportedLanguage.ml:
        return 'നമസ്കാരം $name! നിങ്ങളുടെ ആകെ ബാങ്ക് ബാലൻസ് ₹$b ആണ്. നിങ്ങളുടെ ആകെ ബാലൻസ് അനുസരിച്ച്, ഈ മാസത്തിലെ ബാക്കി $daysLeft ദിവസങ്ങളിലേക്ക് ഇന്ന് സുരക്ഷിതമായി ചെലവഴിക്കാവുന്ന തുക ₹$s. എമർജൻസി ഫണ്ടിൽ ₹$em ഉണ്ട്.';
      case SupportedLanguage.mr:
        return 'नमस्कार $name! आपली एकूण बँक शिल्लक ₹$b आहे. आपल्या एकूण शिल्लकीच्या आधारे, या महिन्याच्या उर्वरित $daysLeft दिवसांसाठी आज सुरक्षितपणे खर्च करण्याची मर्यादा ₹$s आहे. आपत्कालीन निधीत ₹$em सुरक्षित आहेत.';
      case SupportedLanguage.bn:
        return 'নমস্কার $name! আপনার মোট ব্যাঙ্ক ব্যালেন্স ₹$b. আপনার মোট ব্যালেন্সের ওপর ভিত্তি করে, এই মাসের বাকি $daysLeft দিনের জন্য আজ নিরাপদে খরচ করার পরিমাণ ₹$s. জরুরি তহবিলে ₹$em সঞ্চিত আছে.';
      default:
        return 'Hello $name. Your total bank balance is ₹$b. Based on your total balance, you can safely spend ₹$s for today, with $daysLeft days remaining this month. You have ₹$em secured in your emergency fund.';
    }
  }

  String getPaymentNarration({
    required SupportedLanguage lang,
    required double balance,
  }) {
    final b = balance.toInt();
    switch (lang) {
      case SupportedLanguage.te:
        return 'చెల్లింపుల విభాగం. మీ అందుబాటులో ఉన్న బ్యాలెన్స్ ₹$b. డబ్బు పంపడానికి యూపీఐ ఐడీ లేదా మొబైల్ నంబర్ నమోదు చేసి, మొత్తాన్ని ధృవీకరించండి.';
      case SupportedLanguage.hi:
        return 'भुगतान अनुभाग। आपका उपलब्ध बैलेंस ₹$b है। पैसे भेजने के लिए यूपीआई आईडी या मोबाइल नंबर दर्ज करें और राशि की पुष्टि करें।';
      case SupportedLanguage.ta:
        return 'பணப்பரிவர்த்தனை பக்கம். இருப்பு ₹$b. பணம் அனுப்ப யுபிஐ ஐடி அல்லது மொபைல் எண் உள்ளிட்டு தொகையை உறுதிப்படுத்தவும்.';
      case SupportedLanguage.kn:
        return 'ಪಾವತಿಗಳ ಪುಟ. ಲಭ್ಯವಿರುವ ಬ್ಯಾಲೆನ್ಸ್ ₹$b. ಹಣ ಕಳುಹಿಸಲು ಯುಪಿಐ ಅಥವಾ ಮೊಬೈಲ್ ಸಂಖ್ಯೆಯನ್ನು ನಮೂದಿಸಿ ಮೊತ್ತವನ್ನು ದೃಢೀಕರಿಸಿ.';
      case SupportedLanguage.ml:
        return 'പേയ്‌മെന്റ് പേജ്. ലഭ്യമായ ബാലൻസ് ₹$b. പണം അയക്കാൻ യുപിഐ ഐഡിയോ ഫോൺ നമ്പറോ നൽകി തുക സ്ഥിരീകരിക്കുക.';
      case SupportedLanguage.mr:
        return 'पेमेंट विभाग. उपलब्ध शिल्लक ₹$b आहे. पैसे पाठवण्यासाठी यूपीआई किंवा फोन नंबर टाका आणि रक्कम निश्चित करा.';
      case SupportedLanguage.bn:
        return 'পেমেন্ট বিভাগ. উপলব্ধ ব্যালেন্স ₹$b. টাকা পাঠাতে ইউপিআই বা ফোন নম্বর লিখুন এবং পরিমাণ নিশ্চিত করুন.';
      default:
        return 'Payments section. Your available balance is ₹$b. Enter recipient UPI ID or mobile number and confirm the amount to pay securely.';
    }
  }

  String getPaymentSuccessNarration({
    required SupportedLanguage lang,
    required double amount,
    required String recipient,
  }) {
    final a = amount.toInt();
    switch (lang) {
      case SupportedLanguage.te:
        return 'చెల్లింపు పూర్తయింది. $recipient కి ₹$a విజయవంతంగా చెల్లించబడింది. రసీదు భద్రపరచబడింది.';
      case SupportedLanguage.hi:
        return 'भुगतान सफल। $recipient को ₹$a का भुगतान सफलतापूर्वक पूरा हुआ। रसीद सुरक्षित है।';
      case SupportedLanguage.ta:
        return 'வெற்றிகரமானது! $recipient-க்கு ₹$a வெற்றிகரமாக செலுத்தப்பட்டது. ரசீது சேமிக்கப்பட்டது.';
      case SupportedLanguage.kn:
        return 'ಯಶಸ್ವಿ! $recipient ಅವರಿಗೆ ₹$a ಯಶಸ್ವಿಯಾಗಿ ಪಾವತಿಸಲಾಗಿದೆ. ರಸೀದಿ ಉಳಿಸಲಾಗಿದೆ.';
      case SupportedLanguage.ml:
        return 'വിജയം! $recipient-ലേക്ക് ₹$a വിജയകരമായി അയച്ചു.';
      case SupportedLanguage.mr:
        return 'यशस्वी! $recipient ला ₹$a यशस्वीपणे पाठवले गेले आहेत.';
      case SupportedLanguage.bn:
        return 'সফল! $recipient-কে ₹$a সফলভাবে পরিশোধ করা হয়েছে.';
      default:
        return 'Payment successful. ₹$a has been paid to $recipient. Your transaction receipt is saved.';
    }
  }

  /// On-device Soundbox audio announcement in 8 languages
  String getSoundboxNarration({
    required SupportedLanguage lang,
    required double amount,
    required String party,
    required bool isCredit,
  }) {
    final a = amount.toInt();
    final p = party.trim().isEmpty ? (isCredit ? 'Sender' : 'Merchant') : party.trim();
    if (isCredit) {
      switch (lang) {
        case SupportedLanguage.te:
          return 'ఫిన్‌పాకెట్: $p నుండి ₹$a రూపాయలు ఖాతాలో జమ అయ్యాయి.';
        case SupportedLanguage.hi:
          return 'फिनपॉकेट: $p से ₹$a रुपये प्राप्त हुए।';
        case SupportedLanguage.ta:
          return 'ஃபின்பாக்கெட்: $p-யிடமிருந்து ₹$a பெறப்பட்டது.';
        case SupportedLanguage.kn:
          return 'ಫಿನ್‌ಪಾಕೆಟ್: $p ರಿಂದ ₹$a ಸ್ವೀಕರಿಸಲಾಗಿದೆ.';
        case SupportedLanguage.ml:
          return 'ഫിൻപോക്കറ്റ്: $p-ൽ നിന്ന് ₹$a ലഭിച്ചു.';
        case SupportedLanguage.mr:
          return 'फिनपॉकेट: $p कडून ₹$a रुपये प्राप्त झाले.';
        case SupportedLanguage.bn:
          return 'ফিনপকেট: $p থেকে ₹$a টাকা জমা হয়েছে.';
        default:
          return 'FinPocket: Rupees $a received from $p.';
      }
    } else {
      switch (lang) {
        case SupportedLanguage.te:
          return 'ఫిన్‌పాకెట్: $p కి ₹$a రూపాయలు విజయవంతంగా చెల్లించబడ్డాయి.';
        case SupportedLanguage.hi:
          return 'फिनपॉकेट: $p को ₹$a रुपये का सफल भुगतान हुआ।';
        case SupportedLanguage.ta:
          return 'ஃபின்பாக்கெட்: $p-க்கு ₹$a வெற்றிகரமாக செலுத்தப்பட்டது.';
        case SupportedLanguage.kn:
          return 'ಫಿನ್‌ಪಾಕೆಟ್: $p ಅವರಿಗೆ ₹$a ಯಶಸ್ವಿಯಾಗಿ ಪಾವತಿಸಲಾಗಿದೆ.';
        case SupportedLanguage.ml:
          return 'ഫിൻപോക്കറ്റ്: $p-ലേക്ക് ₹$a വിജയകരമായി അയച്ചു.';
        case SupportedLanguage.mr:
          return 'फिनपॉकेट: $p ला ₹$a रुपये यशस्वीपणे दिले आहेत.';
        case SupportedLanguage.bn:
          return 'ফিনপকেট: $p-কে ₹$a টাকা সফলভাবে দেওয়া হয়েছে.';
        default:
          return 'FinPocket: Rupees $a paid successfully to $p.';
      }
    }
  }

  String getSavingsNarration({
    required SupportedLanguage lang,
    required double current,
    required double target,
    required bool isLocked,
  }) {
    final c = current.toInt();
    final t = target.toInt();
    switch (lang) {
      case SupportedLanguage.te:
        final lockStatus = isLocked ? 'లాక్ చేయబడింది' : 'అన్‌లాక్ చేయబడింది';
        return 'ఎమర్జెన్సీ సేవింగ్స్ విభాగం. లక్ష్యం ₹$t లో మీరు ఇప్పటివరకు ₹$c పొదుపు చేశారు. నిధి ప్రస్తుతం $lockStatus.';
      case SupportedLanguage.hi:
        final lockStatus = isLocked ? 'सुरक्षित रूप से लॉक है' : 'खुला है';
        return 'आपातकालीन बचत अनुभाग। लक्ष्य ₹$t में से आपने अब तक ₹$c जमा कर लिए हैं। फंड $lockStatus.';
      case SupportedLanguage.ta:
        final lockStatus = isLocked ? 'பூட்டப்பட்டுள்ளது' : 'திறக்கப்பட்டுள்ளது';
        return 'சேமிப்பு பிரிவு. இலக்கு ₹$t-ல் இதுவரை ₹$c சேமிக்கப்பட்டுள்ளது. நிதி $lockStatus.';
      case SupportedLanguage.kn:
        final lockStatus = isLocked ? 'ಲಾಕ್ ಆಗಿದೆ' : 'ಅನ್‌ಲಾಕ್ ಆಗಿದೆ';
        return 'ತುರ್ತು ಉಳಿತಾಯ ಪುಟ. ₹$t ಗುರಿಯಲ್ಲಿ ನೀವು ಇದುವರೆಗೆ ₹$c ಉಳಿಸಿದ್ದೀರಿ. ನಿಧಿ $lockStatus.';
      case SupportedLanguage.ml:
        return 'സമ്പാദ്യ വിഭാഗം. ലക്ഷ്യം ₹$t-ൽ ഇതുവരെ ₹$c സമ്പാദിച്ചു.';
      case SupportedLanguage.mr:
        return 'बचत विभाग. उद्दिष्ट ₹$t पैकी आतापर्यंत ₹$c जमा केले आहेत.';
      case SupportedLanguage.bn:
        return 'সঞ্চয় বিভাগ. লক্ষ্য ₹$t এর মধ্যে আপনি ₹$c সঞ্চয় করেছেন.';
      default:
        final lockStatus = isLocked ? 'locked' : 'unlocked';
        return 'Emergency Savings section. You have saved ₹$c out of your ₹$t goal. Your emergency fund is currently $lockStatus.';
    }
  }

  String getVaultNarration({
    required SupportedLanguage lang,
    required int docCount,
  }) {
    switch (lang) {
      case SupportedLanguage.te:
        return 'వ్యక్తిగత డాక్యుమెంట్ వాల్ట్. మీ వద్ద $docCount సురక్షిత డాక్యుమెంట్లు ఉన్నాయి. ఇవి 256-బిట్ ఎన్‌క్రిప్షన్‌తో భద్రపరచబడ్డాయి.';
      case SupportedLanguage.hi:
        return 'व्यक्तिगत दस्तावेज़ वॉल्ट। आपके पास $docCount सुरक्षित दस्तावेज़ हैं जो एन्क्रिप्टेड हैं। नया दस्तावेज़ जोड़ने के लिए अपलोड बटन दबाएं।';
      case SupportedLanguage.ta:
        return 'பாதுகாப்பான ஆவண பெட்டகம். உங்களிடம் $docCount ஆவணங்கள் பாதுகாக்கப்பட்டுள்ளன.';
      case SupportedLanguage.kn:
        return 'ದಾಖಲೆ ವಾಲ್ಟ್. ನಿಮ್ಮ ಬಳಿ $docCount ಸುರಕ್ಷಿತ ದಾಖಲೆಗಳಿವೆ. ಹೊಸ ದಾಖಲೆ ಸೇರಿಸಲು ಅಪ್ಲೋಡ್ ಬಟನ್ ಒತ್ತಿ.';
      case SupportedLanguage.ml:
        return 'ഡോക്യുമെന്റ് വോൾട്ട്. $docCount സുരക്ഷിത രേഖകൾ ഉണ്ട്.';
      case SupportedLanguage.mr:
        return 'दस्तऐवज वॉल्ट. आपल्याकडे $docCount सुरक्षित दस्तऐवज आहेत.';
      case SupportedLanguage.bn:
        return 'ডকুমেন্ট ভল্ট. আপনার $docCountটি সুরক্ষিত নথি আছে.';
      default:
        return 'Secure Document Vault. You have $docCount encrypted documents safely stored. Tap Upload Document to store a new identity card or policy.';
    }
  }

  /// Authentic Native Regional Voice Briefing (Respectful, clear, professional tone)
  String getFeaturesExplanation({
    required SupportedLanguage lang,
    required double balance,
    required double safeToSpend,
    required String name,
  }) {
    final b = balance.toInt();
    final s = safeToSpend.toInt();

    switch (lang) {
      case SupportedLanguage.te:
        return 'నమస్కారం $name గారు. మీ ఆర్థిక స్థితిని సురక్షితంగా ఉంచేందుకు ఫిన్‌పాకెట్ ముఖ్య వివరాలు ఇవి. '
            'ప్రస్తుతం మీ అందుబాటులో ఉన్న మొత్తం బ్యాంక్ బ్యాలెన్స్ ₹$b. '
            'మీ రాబోయే బిల్లులు మరియు పొదుపును భద్రపరిచిన తర్వాత, ఈ రోజు మీరు సురక్షితంగా ఖర్చు చేయగల మొత్తం ₹$s. '
            'ఫిన్‌పాకెట్ ముఖ్యమైన ఫీచర్లు: '
            'మొదటిది, సేఫ్-టు-స్పెండ్ మరియు ఇంపల్స్ గార్డ్ — ఇది అనవసర ఖర్చులను నియంత్రిస్తుంది. '
            'రెండవది, ఆటోనమస్ రౌండ్-అప్ వాల్ట్ — చిల్లర పైసలను ఆదా చేసి పెద్ద పొదుపు నిధిగా మారుస్తుంది. '
            'మూడవది, ఘోస్ట్ సబ్‌స్క్రిప్షన్ రాడార్ — అనవసర ఆటో-డెబిట్లను ముందుగానే గుర్తిస్తుంది. '
            'నాల్గవది, ఏఐ రిసీట్ లెన్స్ — బిల్లుల ఫోటో తీసి స్నేహితులతో సులభంగా పంచుకోవచ్చు. '
            'ఐదవది, వాయిస్ క్యాష్ లెడ్జర్ — మాట్లాడి నగదు ఖర్చులను వెంటనే నమోదు చేయవచ్చు. '
            'ఆరవది, స్టెల్త్ మోడ్ — పబ్లిక్‌లో బ్యాలెన్స్ ఇతరులకు కనిపించకుండా దాచిపెడుతుంది. '
            'మరియు ఏడవది, రియల్ యూపీఐ 2.0 — వేగవంతమైన, బ్యాంక్ స్థాయి సురక్షిత చెల్లింపులు. '
            'మీ ఆర్థిక ప్రయాణంలో ఫిన్‌పాకెట్ ఎల్లప్పుడూ మీకు తోడుగా ఉంటుంది. ధన్యవాదాలు.';

      case SupportedLanguage.hi:
        return 'नमस्ते $name जी। आपकी वित्तीय सुरक्षा और बचत के लिए फिनपॉकेट के मुख्य विवरण इस प्रकार हैं। '
            'वर्तमान में आपका कुल उपलब्ध बैंक बैलेंस ₹$b है। '
            'और आपके आगामी सभी बिलों और बचत को सुरक्षित रखने के बाद, आज आप बिना किसी चिंता के ₹$s खर्च कर सकते हैं। '
            'फिनपॉकेट के 7 प्रमुख फीचर्स: '
            'पहला, सेफ-टू-स्पेंड और इम्पल्स गार्ड — जो अतिरिक्त और अनचाहे खर्चों को रोकता है। '
            'दूसरा, ऑटोनॉमस राउंड-अप वॉल्ट — यूपीआई पेमेंट्स के बचे चिल्लर को जोड़कर बचत बनाता है। '
            'तीसरा, सब्सक्रिप्शन रडार — बिना बताए कटने वाले ऑटो-डेबिट भुगतानों पर नज़र रखता है। '
            'चौथा, एआई रसीद लेंस — बिल की फोटो खींचकर तुरंत दोस्तों में बांटें। '
            'पांचवा, वॉयस कैश लेजर — बोलकर अपने नकद खर्चे सीधे दर्ज करें। '
            'छठा, स्टेल्थ मोड — भीड़ में आपके बैंक बैलेंस को सुरक्षित रखता है। '
            'और सातवां, इंस्टेंट यूपीआई 2.0 — गूगल पे और फोन पे के साथ सुपरफास्ट और सुरक्षित भुगतान। '
            'फिनपॉकेट के साथ अपनी वित्तीय यात्रा सुरक्षित रखें। धन्यवाद।';

      case SupportedLanguage.ta:
        return 'வணக்கம் $name! உங்கள் நிதி நிலவரம் மற்றும் சேமிப்பு பற்றிய முக்கிய தகவல்கள். '
            'உங்கள் தற்போதைய வங்கி இருப்பு ₹$b. '
            'வரவிருக்கும் அத்தியாவசிய பில்களை ஒதுக்கிய பின், இன்று நீங்கள் பாதுகாப்பாக செலவழிக்கக்கூடிய தொகை ₹$s. '
            'ஃபின்பாக்கெட்டின் முக்கிய அம்சங்கள்: '
            '1. சேஃப்-டு-ஸ்பெண்ட் — தேவையற்ற செலவுகளை கட்டுப்படுத்தும். '
            '2. ரவுண்ட்-அப் வால்ட் — சில்லறை பணத்தை சேமித்து வைக்கும். '
            '3. ஆட்டோ-டெபிட் ரேடார் — தானியங்கி சந்தா கட்டணங்களை கண்காணிக்கும். '
            '4. ஏஐ ரசீது லென்ஸ் — பில் புகைப்படங்களை எடுத்து சுலபமாக பகிரலாம். '
            '5. வாய்ஸ் கேஷ் லெட்ஜர் — பேசி ரொக்க செலவுகளை பதிவு செய்யலாம். '
            '6. ஸ்டெல்த் மோடு — இருப்பை பிறர் பார்க்காதவாறு மறைக்கும். '
            '7. உடனடி யுபிஐ 2.0 — பாதுகாப்பான மின்னல் வேக பரிவர்த்தனைகள். நன்றி!';

      case SupportedLanguage.kn:
        return 'ನಮಸ್ಕಾರ $name! ನಿಮ್ಮ ಆರ್ಥಿಕ ನಿರ್ವಹಣೆ ಮತ್ತು ಉಳಿತಾಯದ ಪ್ರಮುಖ ವಿವರಗಳು. '
            'ನಿಮ್ಮ ಒಟ್ಟು ಬ್ಯಾಂಕ್ ಬ್ಯಾಲೆನ್ಸ್ ₹$b. '
            'ಮುಂಬರುವ ಬಿಲ್ಲುಗಳನ್ನು ಕಾಯ್ದಿರಿಸಿದ ನಂತರ ಇಂದು ನೀವು ಸುರಕ್ಷಿತವಾಗಿ ಖರ್ಚು ಮಾಡಬಹುದಾದ ಮಿತಿ ₹$s. '
            'ಫಿನ್‌ಪಾಕೆಟ್‌ನ 7 ಪ್ರಮುಖ ವೈಶಿಷ್ಟ್ಯಗಳು: '
            '1. ಸೇಫ್-ಟು-ಸ್ಪೆಂಡ್ — ಅನಗತ್ಯ ಖರ್ಚನ್ನು ನಿಯಂತ್ರಿಸುವ ರಕ್ಷಕ. '
            '2. ರೌಂಡ್-ಅಪ್ ವಾಲ್ಟ್ — ಚಿಲ್ಲರೆ ಹಣವನ್ನು ಉಳಿತಾಯದ ನಿಧಿಯನ್ನಾಗಿ ಮಾಡುತ್ತದೆ. '
            '3. ಚಂದಾದಾರಿಕೆ ರಾಡಾರ್ — ಆಟೋ-ಡೆಬಿಟ್‌ಗಳನ್ನು ಮುಂಚಿತವಾಗಿಯೇ ಪತ್ತೆ ಮಾಡುತ್ತದೆ. '
            '4. ಎಐ ರಶೀದಿ ಲೆನ್ಸ್ — ಬಿಲ್ ಫೋಟೋ ತೆಗೆದು ಸ್ನೇಹಿತರೊಂದಿಗೆ ಸುಲಭವಾಗಿ ಹಂಚಿಕೊಳ್ಳಿ. '
            '5. ಧ್ವನಿ ನಗದು ಲೆಡ್ಜರ್ — ಮಾತನಾಡುವ ಮೂಲಕ ನಗದು ಖರ್ಚುಗಳನ್ನು ತಕ್ಷಣ ನಮೂದಿಸಿ. '
            '6. ಸ್ಟೆಲ್ತ್ ಮೋಡ್ — ಸಾರ್ವಜನಿಕ ಸ್ಥಳದಲ್ಲಿ ಬ್ಯಾಲೆನ್ಸ್ ರಹಸ್ಯವಾಗಿರಿಸುತ್ತದೆ. '
            '7. ರಿಯಲ್ ಯುಪಿಐ 2.0 — ತ್ವರಿತ ನೇರ ಸುರಕ್ಷಿತ ಪಾವತಿಗಳು. ಧನ್ಯವಾದಗಳು.';

      case SupportedLanguage.ml:
        return 'നമസ്കാരം $name! നിങ്ങളുടെ സാമ്പത്തിക സുരക്ഷ ഉറപ്പാക്കുന്നതിനായുള്ള ഫിൻപോക്കറ്റ് വിവരങ്ങൾ. '
            'നിങ്ങളുടെ നിലവിലെ ബാങ്ക് ബാലൻസ് ₹$b ആണ്. '
            'വരാനിരിക്കുന്ന ബില്ലുകൾ മാറ്റിവെച്ച ശേഷം ഇന്ന് നിങ്ങൾക്ക് സുരക്ഷിതമായി ചെലവഴിക്കാവുന്ന തുക ₹$s. '
            '7 പ്രധാന ഫീച്ചറുകൾ: '
            '1. സേഫ്-ടു-സ്പെൻഡ് — അനാവശ്യ ചെലവുകൾ നിയന്ത്രിക്കുന്നു. '
            '2. റൗണ്ട്-അപ്പ് വോൾട്ട് — ചില്ലറത്തുട്ടുകൾ സമ്പാദ്യമാക്കി മാറ്റുന്നു. '
            '3. ഓട്ടോ-ഡെബിറ്റ് റഡാർ — സബ്സ്ക്രിപ്ഷനുകൾ നേരത്തെ ഓർമ്മിപ്പിക്കുന്നു. '
            '4. എഐ രസീത് ലെൻസ് — ബില്ലുകൾ ഫോട്ടോ എടുത്ത് പങ്കിടാം. '
            '5. വോയ്സ് ക്യാഷ് ലെഡ്ജർ — സംസാരിച്ച് പണച്ചെലവുകൾ രേഖപ്പെടുത്താം. '
            '6. സ്റ്റെൽത്ത് മോഡ് — ബാങ്ക് ബാലൻസ് ഒളിപ്പിച്ചു വെക്കാം. '
            '7. ഇൻസ്റ്റന്റ് യുപിഐ 2.0 — സുരക്ഷിതമായ വേഗതയേറിയ കൈമാറ്റം. നന്ദി.';

      case SupportedLanguage.mr:
        return 'नमस्कार $name! आपल्या आर्थिक सुरक्षेसाठी फिनपॉकेटचे महत्त्वाचे तपशील. '
            'आपली एकूण बँक शिल्लक ₹$b आहे. '
            'आणि येणारे सर्व बिल सुरक्षित ठेवून आज आपण सुरक्षितपणे ₹$s खर्च करू शकता. '
            'आपली 7 प्रमुख वैशिष्ट्ये: '
            '1. सेफ-टू-स्पेंड — अनावश्यक खर्चावर नियंत्रण ठेवणारा रक्षक. '
            '2. राउंड-अप व्हॉल्ट — प्रत्येक पेमेंटमधील सुटे पैसे बचत करते. '
            '3. वर्गणी रडार — ऑटो-डेबिट नूतनीकरण आधीच शोधून काढते. '
            '4. एआय पावती लेन्स — हॉटेल बिल फोटो काढून मित्रांमध्ये झटपट वाटून घ्या. '
            '5. व्हॉइस कॅश लेजर — बोलून रोख खर्च थेट डायरीत नोंदवा. '
            '6. स्टेल्थ मोड — सार्वजनिक ठिकाणी बँक शिल्लक सुरक्षित ठेवते. '
            '7. रिअल यूपीआय 2.0 — सुपरफास्ट आणि सुरक्षित व्यवहार. धन्यवाद.';

      case SupportedLanguage.bn:
        return 'নমস্কার $name! আপনার আর্থিক সুরক্ষার জন্য ফিনপকেটের গুরুত্বপূর্ণ তথ্য। '
            'আপনার বর্তমান ব্যাঙ্ক ব্যালেন্স ₹$b. '
            'আসন্ন সমস্ত বিল সুরক্ষিত রেখে আজ আপনি নিশ্চিন্তে ₹$s খরচ করতে পারেন। '
            '৭টি প্রধান বৈশিষ্ট্য: '
            '১. সেফ-টু-স্পেন্ড — অতিরিক্ত খরচ নিয়ন্ত্রণ করে. '
            '২. রাউন্ড-আপ ভল্ট — খুচরো পয়সা জমিয়ে সঞ্চয় তৈরি করে. '
            '৩. সাবস্ক্রিপশন রাডার — অটো-চার্জ কাটার আগেই সতর্ক করে. '
            '৪. এআই রসিদ লেন্স — বিলের ছবি তুলে বন্ধুদের সাথে ভাগ করে নিন. '
            '৫. ভয়েস ক্যাশ লেজার — মুখে বলেই নগদ খরচ লিখে রাখুন. '
            '৬. স্টিলথ মোড — ভিড়ের মধ্যে ব্যালেন্স নিরাপদে রাখে. '
            '৭. ইনস্ট্যান্ট ইউপিআই ২.০ — এক সেকেন্ডে সুরক্ষিত লেনদেন. ধন্যবাদ.';

      default:
        return 'Hello $name. Here is your daily FinPocket financial briefing. '
            'Your total available bank balance is ₹$b. '
            'Based on your total balance, your safe-to-spend limit for today is ₹$s. '
            'Here are FinPocket’s 7 core superpowers: '
            'First, Safe-to-Spend and Impulse Guard to protect you from unintended overspending. '
            'Second, Autonomous Round-Up Vault that gathers spare change from UPI transactions into disciplined savings. '
            'Third, Ghost Subscription Radar to catch recurring auto-debit renewals before they hit. '
            'Fourth, smart scanner bill splitting that asks how many members and sends the split to WhatsApp. '
            'Fifth, month-by-month EMI guidance that coaches you until every loan is cleared. '
            'Sixth, Stealth Privacy Mode to safeguard balances from curious eyes in public. '
            'And seventh, Instant 1-Tap UPI 2.0 for seamless, bank-grade payments. '
            'Wishing you a disciplined, financially confident day ahead. Thank you.';
    }
  }

  /// Individual feature audio explanation for any selected feature
  String getSingleFeatureExplanation({
    required String featureKey,
    required SupportedLanguage lang,
    double? balance,
    double? safeToSpend,
  }) {
    final b = balance?.toInt() ?? 0;
    final s = safeToSpend?.toInt() ?? 0;

    switch (featureKey) {
      case 'safe_to_spend':
        switch (lang) {
          case SupportedLanguage.te:
            return 'సేఫ్-టు-స్పెండ్ మీ మొత్తం బ్యాంక్ బ్యాలెన్స్ ₹$b నుండి రాబోయే బిల్లులు, ఈఎంఐలు మరియు పొదుపును మినహాయించి, ఈ రోజు మీరు సురక్షితంగా ఖర్చు చేయగల మొత్తం ₹$s అని లెక్కిస్తుంది. దీనివల్ల నెలాఖరులో డబ్బు కొరత రాదు.';
          case SupportedLanguage.hi:
            return 'सेफ-टू-स्पेंड आपके बैंक बैलेंस ₹$b में से आने वाले बिलों और बचत को सुरक्षित रखकर, आज खर्च करने के लिए सेफ लिमिट ₹$s तय करता है ताकि महीने के अंत में परेशानी न हो।';
          case SupportedLanguage.ta:
            return 'சேஃப்-டு-ஸ்பெண்ட் உங்கள் மொத்த இருப்பு ₹$b-ல் இருந்து பில்களை ஒதுக்கி, இன்று பாதுகாப்பாக செலவழிக்கக்கூடிய தொகை ₹$s என துல்லியமாக கணக்கிடுகிறது.';
          case SupportedLanguage.kn:
            return 'ಸೇಫ್-ಟು-ಸ್ಪೆಂಡ್ ನಿಮ್ಮ ಬ್ಯಾಂಕ್ ಬ್ಯಾಲೆನ್ಸ್ ₹$b ನಲ್ಲಿ ಬಿಲ್ಲುಗಳನ್ನು ಕಾಯ್ದಿರಿಸಿ, ಇಂದು ನೀವು ಸುರಕ್ಷಿತವಾಗಿ ಖರ್ಚು ಮಾಡಬಹುದಾದ ಮಿತಿ ₹$s ಎಂದು ತೋರಿಸುತ್ತದೆ.';
          case SupportedLanguage.ml:
            return 'സേഫ്-ടു-സ്പെൻഡ് നിങ്ങളുടെ ആകെ ബാലൻസ് ₹$b-ൽ നിന്ന് ബില്ലുകൾ മാറ്റിവെച്ച്, ഇന്ന് ചെലവഴിക്കാവുന്ന സുരക്ഷിത തുക ₹$s ആണെന്ന് വ്യക്തമാക്കുന്നു.';
          case SupportedLanguage.mr:
            return 'सेफ-टू-स्पेंड आपल्या बँकेतील शिल्लक ₹$b मधून बिले वजा करून, आज आपण सुरक्षितपणे ₹$s खर्च करू शकता हे सांगते.';
          case SupportedLanguage.bn:
            return 'সেফ-টু-স্পেন্ড আপনার মোট ব্যালেন্স ₹$b থেকে সমস্ত বিল সুরক্ষিত রেখে, আজ নিরাপদে খরচ করার পরিমাণ ₹$s হিসেব করে দেখায়।';
          default:
            return 'Safe-to-Spend dynamically calculates your exact spending limit for today, ₹$s, by subtracting upcoming bills, EMIs, and goals from your total balance of ₹$b. It prevents month-end cash crunches.';
        }

      case 'spend_guard':
        switch (lang) {
          case SupportedLanguage.te:
            return 'స్పెండ్ గార్డ్ అనవసర మరియు ఆవేశపూరిత ఖర్చులను అడ్డుకుంటుంది. పెద్ద యూపీఐ చెల్లింపుల సమయంలో అరవై సెకన్ల విరామం మరియు ఆలోచించే సమయాన్ని ఇచ్చి మీ బడ్జెట్‌ను కాపాడుతుంది.';
          case SupportedLanguage.hi:
            return 'स्पेंड गार्ड बड़े और बिना सोचे-समझे किए जाने वाले यूपीआई भुगतानों पर 60 सेकंड की रोक लगाकर आपको सोचने का समय देता है, जिससे फिजूलखर्ची से बचाव होता है।';
          case SupportedLanguage.ta:
            return 'ஸ்பெண்ட் கார்ட் தேவையற்ற அவசர செலவுகளை கட்டுப்படுத்துகிறது. பெரிய பரிவர்த்தனைகளுக்கு முன் 60 நொடிகள் சிந்திக்கும் இடைவெளியை தருகிறது.';
          case SupportedLanguage.kn:
            return 'ಸ್ಪೆಂಡ್ ಗಾರ್ಡ್ ಅನಗತ್ಯ ಖರ್ಚುಗಳನ್ನು ನಿಯಂತ್ರಿಸುತ್ತದೆ. ದೊಡ್ಡ ಯುಪಿಐ ಪಾವತಿಗಳಿಗೆ 60 ಸೆಕೆಂಡುಗಳ ವಿರಾಮ ನೀಡಿ ನಿಮ್ಮ ಹಣವನ್ನು ಉಳಿಸುತ್ತದೆ.';
          case SupportedLanguage.ml:
            return 'സ്പെൻഡ് ഗാർഡ് അനാവശ്യ ചെലവുകൾ തടയുന്നു. വലിയ യുപിഐ പേയ്‌മെന്റുകൾക്ക് മുമ്പ് ചിന്തിക്കാൻ 60 സെക്കൻഡ് നൽകുന്നു.';
          case SupportedLanguage.mr:
            return 'स्पेंड गार्ड अनावश्यक खर्च रोखतो. मोठे पेमेंट करण्यापूर्वी 60 सेकंदांचा विचार करण्याचा वेळ देऊन तुमचे पैसे वाचवतो.';
          case SupportedLanguage.bn:
            return 'স্পেন্ড গার্ড অতিরিক্ত খরচ প্রতিরোধ করে. বড় ইউপিআই পেমেন্টের আগে ৬০ সেকেন্ডের বিরতি দিয়ে আপনাকে ভাবার সময় দেয়.';
          default:
            return 'Spend Guard acts as your behavioral impulse shield. It pauses large unbudgeted UPI transactions with a 60-second reflection timer to prevent buyer remorse.';
        }

      case 'round_up':
        switch (lang) {
          case SupportedLanguage.te:
            return 'ఆటోనమస్ రౌండ్-అప్ వాల్ట్ ప్రతి యూపీఐ చెల్లింపులోని చిల్లర పైసలను ఆటోమేటిక్‌గా మీ పొదుపు వాల్ట్‌లోకి చేర్చి పెద్ద నిధిగా మారుస్తుంది.';
          case SupportedLanguage.hi:
            return 'ऑटोनॉमस राउंड-अप वॉल्ट आपके हर यूपीआई पेमेंट के बचे हुए चिल्लर को अपने आप जोड़कर आपकी बचत गुल्लक में जमा कर देता है।';
          case SupportedLanguage.ta:
            return 'ரவுண்ட்-அப் வால்ட் ஒவ்வொரு யுபிஐ பரிவர்த்தனையிலும் மீதமுள்ள சில்லறை பணத்தை தானாகவே உங்கள் சேமிப்பு நிதியில் சேர்க்கிறது.';
          case SupportedLanguage.kn:
            return 'ರೌಂಡ್-ಅಪ್ ವಾಲ್ಟ್ ಪ್ರತಿ ಯುಪಿಐ ಪಾವತಿಯ ಚಿಲ್ಲರೆ ಹಣವನ್ನು ಸ್ವಯಂಚಾಲಿತವಾಗಿ ನಿಮ್ಮ ಉಳಿತಾಯದ ಖಾತೆಗೆ ವರ್ಗಾಯಿಸುತ್ತದೆ.';
          case SupportedLanguage.ml:
            return 'റൗണ്ട്-അപ്പ് വോൾട്ട് ഓരോ യുപിഐ ഇടപാടിലെയും ചില്ലറത്തുട്ടുകൾ സ്വയമേവ നിങ്ങളുടെ സമ്പാദ്യത്തിലേക്ക് മാറ്റുന്നു.';
          case SupportedLanguage.mr:
            return 'राउंड-अप व्हॉल्ट प्रत्येक यूपीआय व्यवहारातील सुटे पैसे आपोआप तुमच्या बचतीमध्ये जमा करतो.';
          case SupportedLanguage.bn:
            return 'রাউন্ড-আপ ভল্ট প্রতিটি ইউপিআই পেমেন্টের খুচরো পয়সা স্বয়ংক্রিয়ভাবে আপনার সঞ্চয়ে যুক্ত করে.';
          default:
            return 'Autonomous Round-Up Vault rounds up your daily UPI transactions to the nearest ten rupees and sweeps the spare change into micro-savings.';
        }

      case 'subscriptions':
        switch (lang) {
          case SupportedLanguage.te:
            return 'ఘోస్ట్ సబ్‌స్క్రిప్షన్ రాడార్ మీ ఖాతాలోని రికరింగ్ ఆటో-డెబిట్లను నిరంతరం గమనిస్తూ, చార్జీలు కట్ అవ్వడానికి మూడు రోజుల ముందే మీకు సమాచారం అందిస్తుంది.';
          case SupportedLanguage.hi:
            return 'सब्सक्रिप्शन रडार ऑटो-डेबिट भुगतानों पर नज़र रखता है और पैसे कटने से 3 दिन पहले आपको सूचित करता है ताकि आप अनचाहे प्लान रोक सकें।';
          case SupportedLanguage.ta:
            return 'சந்தா ரேடார் தானியங்கி பில் மற்றும் ஓடிடி கட்டணங்களை கண்காணித்து, பணம் கழிப்பதற்கு 3 நாட்களுக்கு முன்பே உங்களுக்கு நினைவூட்டுகிறது.';
          case SupportedLanguage.kn:
            return 'ಚಂದಾದಾರಿಕೆ ರಾಡಾರ್ ಆಟೋ-ಡೆಬಿಟ್‌ಗಳನ್ನು ಗಮನಿಸುತ್ತದೆ ಮತ್ತು ಹಣ ಕಡಿತಗೊಳ್ಳುವ 3 ದಿನಗಳ ಮುಂಚೆಯೇ ನಿಮಗೆ ಎಚ್ಚರಿಕೆ ನೀಡುತ್ತದೆ.';
          case SupportedLanguage.ml:
            return 'സബ്സ്ക്രിപ്ഷൻ റഡാർ ആവർത്തിച്ചുള്ള ചാർജുകൾ പരിശോധിച്ച്, പണം ഈടാക്കുന്നതിന് 3 ദിവസം മുമ്പ് അറിയിക്കുന്നു.';
          case SupportedLanguage.mr:
            return 'वर्गणी रडार ऑटो-डेबिट पेमेंटवर लक्ष ठेवतो आणि पैसे कापले जाण्यापूर्वी 3 दिवस आधी आपल्याला सावध करतो.';
          case SupportedLanguage.bn:
            return 'সাবস্ক্রিপশন রাডার অটো-চার্জিং ট্র্যাক করে এবং টাকা কাটার ৩ দিন আগেই আপনাকে নোটিফিকেশন পাঠায়.';
          default:
            return 'Ghost Subscription Radar tracks recurring auto-debits and alerts you 3 days before any OTT or SaaS renewal charges your account.';
        }

      case 'bill_splitter':
        switch (lang) {
          case SupportedLanguage.te:
            return 'స్మార్ట్ బిల్ స్ప్లిట్టర్ రెస్టారెంట్ లేదా గ్రూప్ ఖర్చుల ఫోటో తీసి, సభ్యుల వాటాలను ట్యాక్స్ మరియు టిప్‌తో సహా విభజించి వాట్సాప్ యూపీఐ లింకులు పంపుతుంది.';
          case SupportedLanguage.hi:
            return 'स्मार्ट बिल स्प्लिटर बिल की फोटो खींचकर दोस्तों में सही-सही हिस्सा बांटता है और तुरंत व्हाट्सएप पर पेमेंट लिंक भेजता है।';
          case SupportedLanguage.ta:
            return 'பில் ஸ்ப்ளிட்டர் குழு செலவுகளையும் உணவக பில்களையும் சுலபமாக பிரித்து, யுபிஐ மூலம் வசூலிக்க உதவுகிறது.';
          case SupportedLanguage.kn:
            return 'ಬಿಲ್ ಸ್ಪ್ಲಿಟರ್ ಬಿಲ್ ಫೋಟೋ ತೆಗೆದು ಸ್ನೇಹಿತರ ನಡುವೆ ನಿಖರ ಪಾಲು ಹಂಚಿ ವಾಟ್ಸಾಪ್ ಮೂಲಕ ಹಣ ಪಡೆಯಲು ನೆರವಾಗುತ್ತದೆ.';
          case SupportedLanguage.ml:
            return 'ബിൽ സ്പ്ലിറ്റർ സുഹൃത്തുക്കളുമൊത്തുള്ള ചെലവുകൾ എളുപ്പത്തിൽ തുല്യമായി വീതിക്കാൻ സഹായിക്കുന്നു.';
          case SupportedLanguage.mr:
            return 'स्मार्ट बिल स्प्लिटर हॉटेल बिल किंवा मित्रांमधील खर्च अचूक वाटून व्हॉट्सॲपवर यूपीआय लिंक पाठवतो.';
          case SupportedLanguage.bn:
            return 'স্মার্ট বিল স্প্লিটার রেস্তোরাঁ বিল বন্ধুদের মধ্যে সমানভাবে ভাগ করে ইউপিআই লিংক পাঠিয়ে দেয়.';
          default:
            return 'Smart Bill Splitter lets you scan food or shopping receipts, divide items precisely with taxes, and generate 1-tap WhatsApp payment collection links.';
        }

      case 'what_if_lab':
        switch (lang) {
          case SupportedLanguage.te:
            return 'వాట్-ఇఫ్ ల్యాబ్ మీ ఫైనాన్షియల్ ట్విన్ సిమ్యులేటర్. జీతం మారినా లేదా కొత్త ఈఎంఐ తీసుకున్నా వచ్చే 12 నెలల్లో మీ సంపద ఎలా మారుతుందో ముందే ఊహిస్తుంది.';
          case SupportedLanguage.hi:
            return 'व्हाट-इफ लैब एक वित्तीय सिम्युलेटर है, जो यह दिखाता है कि नई सैलरी या लोन लेने पर अगले 12 महीनों में आपके पैसों पर क्या असर पड़ेगा।';
          case SupportedLanguage.ta:
            return 'வாட்-இஃப் லேப் சம்பள மாற்றம் அல்லது புதிய கடன்களின் தாக்கத்தை அடுத்த 12 மாதங்களுக்கு முன்கூட்டியே கணிக்கிறது.';
          case SupportedLanguage.kn:
            return 'ವಾಟ್-ಇಫ್ ಲ್ಯಾಬ್ ಸಂಬಳ ಬದಲಾವಣೆ ಅಥವಾ ಸಾಲದ ಪರಿಣಾಮವನ್ನು ಮುಂದಿನ 12 ತಿಂಗಳುಗಳವರೆಗೆ ಮೊದಲೇ ತೋರಿಸುತ್ತದೆ.';
          case SupportedLanguage.ml:
            return 'വാട്ട്-ഇഫ് ലാബ് പുതിയ ലോണുകളും വരുമാന മാറ്റങ്ങളും അടുത്ത 12 മാസത്തേക്ക് എങ്ങനെ ബാധിക്കുമെന്ന് കണക്കുകൂട്ടുന്നു.';
          case SupportedLanguage.mr:
            return 'व्हॉट-इफ लॅब पगार किंवा कर्जातील बदलांचा पुढील 12 महिन्यांत काय परिणाम होईल हे दर्शवतो.';
          case SupportedLanguage.bn:
            return 'হোয়াট-ইফ ল্যাব বেতন বৃদ্ধি বা নতুন লোনের প্রভাব আগামী ১২ মাসের জন্য পূর্বাভাস দেয়.';
          default:
            return 'What-If Lab is your predictive financial twin. It models income shifts, new loan EMIs, and inflation across the next 12 months.';
        }

      case 'document_vault':
        switch (lang) {
          case SupportedLanguage.te:
            return 'పర్సనల్ డాక్యుమెంట్ వాల్ట్ ఆధార్, పాన్, శాలరీ స్లిప్పులు, ఐటీసీ మరియు ఇన్సూరెన్స్ పత్రాలను ఎన్‌క్రిప్ట్ చేసి మీ ఫోన్‌లోనే అత్యంత భద్రంగా ఉంచుతుంది.';
          case SupportedLanguage.hi:
            return 'डॉक्यूमेंट वॉल्ट आपके आधार, पैन, सैलरी स्लिप, आईटीसी और बीमा पेपर्स को बैंक-ग्रेड सुरक्षा के साथ पूरी तरह सुरक्षित रखता है।';
          case SupportedLanguage.ta:
            return 'டாகுமெண்ட் வால்ட் ஆதார், பான், சம்பள ரசீதுகள் மற்றும் காப்பீட்டு ஆவணங்களை முழுமையாக என்க்ரிப்ட் செய்து பாதுகாக்கிறது.';
          case SupportedLanguage.kn:
            return 'ಡಾಕ್ಯುಮೆಂಟ್ ವಾಲ್ಟ್ ಆಧಾರ್, ಪ್ಯಾನ್, ಸ್ಯಾಲರಿ ಸ್ಲಿಪ್ ಮತ್ತು ವಿಮೆ ದಾಖಲೆಗಳನ್ನು ಸಂಪೂರ್ಣ ಎನ್‌ಕ್ರಿಪ್ಶನ್‌ನೊಂದಿಗೆ ರಕ್ಷಿಸುತ್ತದೆ.';
          case SupportedLanguage.ml:
            return 'ഡോക്യുമെന്റ് വോൾട്ട് ആധാർ, പാൻ, സാലറി സ്ലിപ്പ്, ഇൻഷുറൻസ് എന്നിവ സുരക്ഷിതമായി സൂക്ഷിക്കുന്നു.';
          case SupportedLanguage.mr:
            return 'दस्तऐवज व्हॉल्ट आधार, पॅन, पगार पावती आणि विमा कागदपत्रे पूर्णपणे एन्क्रिप्ट करून सुरक्षित ठेवतो.';
          case SupportedLanguage.bn:
            return 'ডকুমেন্ট ভল্ট আধার, প্যান, স্যালারি স্লিপ এবং বীমা নথিগুলি সুরক্ষিতভাবে ফোনে সংরক্ষণ করে.';
          default:
            return 'Personal Document Vault safeguards your Aadhaar, PAN, Salary Slips, ITC documents, and Insurance with AES-256 hardware encryption on your device.';
        }

      case 'stealth_mode':
        switch (lang) {
          case SupportedLanguage.te:
            return 'స్టెల్త్ మోడ్ బస్సు, మెట్రో లేదా పబ్లిక్ ప్రదేశాలలో మీ స్క్రీన్ చూసే వారి నుండి మీ బ్యాంక్ బ్యాలెన్స్‌ను ఒకే ట్యాప్‌తో దాచిపెడుతుంది.';
          case SupportedLanguage.hi:
            return 'स्टेल्थ मोड सार्वजनिक जगहों पर सिर्फ एक टैप में आपके बैंक बैलेंस को दूसरों की नज़रों से छिपा देता है।';
          case SupportedLanguage.ta:
            return 'ஸ்டெல்த் மோடு பொது இடங்களில் உங்கள் வங்கி இருப்பை மற்றவர்கள் பார்க்காதவாறு ஒரே தொடுதலில் மறைக்கிறது.';
          case SupportedLanguage.kn:
            return 'ಸ್ಟೆಲ್ತ್ ಮೋಡ್ ಸಾರ್ವಜನಿಕ ಸ್ಥಳಗಳಲ್ಲಿ ನಿಮ್ಮ ಬ್ಯಾಂಕ್ ಬ್ಯಾಲೆನ್ಸ್ ರಹಸ್ಯವಾಗಿರಿಸಲು ಕೇವಲ ಒಂದೇ ಟ್ಯಾಪ್‌ನಲ್ಲಿ ನೆರವಾಗುತ್ತದೆ.';
          case SupportedLanguage.ml:
            return 'സ്റ്റെൽത്ത് മോഡ് പൊതുസ്ഥലങ്ങളിൽ നിങ്ങളുടെ അക്കൗണ്ട് ബാലൻസ് ഒളിപ്പിച്ചു വെക്കാൻ സഹായിക്കുന്നു.';
          case SupportedLanguage.mr:
            return 'स्टेल्थ मोड गर्दीच्या ठिकाणी तुमचे बँक बॅलन्स एका टॅपने सुरक्षितपणे लपवून ठेवतो.';
          case SupportedLanguage.bn:
            return 'স্টিলথ মোড পাবলিক প্লেসে এক ট্যাপে আপনার ব্যালেন্স স্ক্রীন থেকে আড়াল করে.';
          default:
            return 'Stealth Privacy Mode masks your balances and sensitive money metrics on screen with one tap to protect you in public places.';
        }

      case 'soundbox':
        switch (lang) {
          case SupportedLanguage.te:
            return 'యూపీఐ పాకెట్ సౌండ్‌బాక్స్ ప్రతి చెల్లింపు మరియు అందుకున్న మొత్తాన్ని మీ స్థానిక భాషలో స్పష్టమైన ఆడియో అనౌన్స్‌మెంట్‌గా వినిపిస్తుంది.';
          case SupportedLanguage.hi:
            return 'यूपीआई पॉकेट साउंडबॉक्स हर लेनदेन की तुरंत आपकी अपनी भाषा में बोलकर पुष्टि करता है।';
          case SupportedLanguage.ta:
            return 'யுபிஐ பாக்கெட் சவுண்ட்பாக்ஸ் பணப்பரிவர்த்தனைகளை உங்கள் மொழியில் உடனடியாக அறிவிக்கிறது.';
          case SupportedLanguage.kn:
            return 'ಯುಪಿಐ ಪಾಕೆಟ್ ಸೌಂಡ್‌ಬಾಕ್ಸ್ ಪ್ರತಿ ಪಾವತಿಯನ್ನು ನಿಮ್ಮ ಭಾಷೆಯಲ್ಲಿಯೇ ಧ್ವನಿ ಮೂಲಕ ದೃಢೀಕರಿಸುತ್ತದೆ.';
          case SupportedLanguage.ml:
            return 'യുപിഐ സൗണ്ട്ബോക്സ് ഓരോ ഇടപാടും നിങ്ങളുടെ ഭാഷയിൽ ഉച്ചത്തിൽ അനൗൺസ് ചെയ്യുന്നു.';
          case SupportedLanguage.mr:
            return 'यूपीआय पॉकेट साउंडबॉक्स प्रत्येक व्यवहाराची आपल्या भाषेत स्पष्ट आवाजात घोषणा करतो.';
          case SupportedLanguage.bn:
            return 'ইউপিআই পকেট সাউন্ডবক্স প্রতিটি লেনদেন আপনার ভাষায় স্পষ্ট কণ্ঠে ঘোষণা করে.';
          default:
            return 'UPI Pocket Soundbox announces sent and received money transactions aloud in your regional language with zero delay.';
        }

      case 'emergency_fund':
        switch (lang) {
          case SupportedLanguage.te:
            return 'ఎమర్జెన్సీ షీల్డ్ 3 నుండి 6 నెలల అత్యవసర ఖర్చుల నిధిని భద్రపరిచి, అనుకోని అవసరాలు వచ్చినప్పుడు అప్పులపాలు కాకుండా రక్షిస్తుంది.';
          case SupportedLanguage.hi:
            return 'इमरजेंसी शील्ड 3 से 6 महीने के जरूरी खर्चों का सुरक्षा कवच बनाती है, ताकि किसी भी अचानक जरूरत में कर्ज न लेना पड़े।';
          case SupportedLanguage.ta:
            return 'அவசரகால நிதி எதிர்பாராத சூழ்நிலைகளில் கடனில் விழாமல் உங்களை காக்கும் பாதுகாப்பு அரணாகும்.';
          case SupportedLanguage.kn:
            return 'ತುರ್ತು ನಿಧಿ ಅನಿರೀಕ್ಷಿತ ಸಂದರ್ಭಗಳಲ್ಲಿ ಸಾಲದ ಸುಳಿಗೆ ಸಿಲುಕದಂತೆ ನಿಮ್ಮನ್ನು ರಕ್ಷಿಸುವ ಕವಚವಾಗಿದೆ.';
          case SupportedLanguage.ml:
            return 'എമർജൻസി ഷീൽഡ് അപ്രതീക്ഷിത ആവശ്യങ്ങൾക്ക് കടം വാങ്ങാതെ നിങ്ങളെ സംരക്ഷിക്കുന്നു.';
          case SupportedLanguage.mr:
            return 'आपत्कालीन निधी अचानक येणाऱ्या खर्चात कर्जात न अडकण्यासाठी सुरक्षा कवच देतो.';
          case SupportedLanguage.bn:
            return 'ইমার্জেন্সি শিল্ড যেকোনো জরুরি প্রয়োজনে আপনাকে ঋণের হাত থেকে বাঁচায়.';
          default:
            return 'Emergency Shield protects 3 to 6 months of essential living expenses, keeping you resilient against unforeseen shocks without debt.';
        }

      default:
        return 'FinPocket feature guide. Tap any feature card to listen to its detailed breakdown.';
    }
  }
}
