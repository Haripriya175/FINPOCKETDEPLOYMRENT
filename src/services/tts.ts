import { SupportedLanguage } from '../types';

export class WebTtsService {
  private static instance: WebTtsService;
  private synthesis: SpeechSynthesis | null = null;
  private isSpeakingState = false;

  private constructor() {
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      this.synthesis = window.speechSynthesis;
    }
  }

  public static getInstance(): WebTtsService {
    if (!WebTtsService.instance) {
      WebTtsService.instance = new WebTtsService();
    }
    return WebTtsService.instance;
  }

  public isSupported(): boolean {
    return this.synthesis !== null;
  }

  public isSpeaking(): boolean {
    return this.isSpeakingState;
  }

  public getLocale(lang: SupportedLanguage): string {
    switch (lang) {
      case 'te':
        return 'te-IN';
      case 'hi':
        return 'hi-IN';
      case 'ta':
        return 'ta-IN';
      case 'kn':
        return 'kn-IN';
      case 'ml':
        return 'ml-IN';
      case 'mr':
        return 'mr-IN';
      case 'bn':
        return 'bn-IN';
      case 'en':
      default:
        return 'en-IN';
    }
  }

  public speak(text: string, lang: SupportedLanguage, onEnd?: () => void): void {
    if (!this.synthesis) return;

    this.stop();

    const utterance = new SpeechSynthesisUtterance(text);
    const locale = this.getLocale(lang);
    utterance.lang = locale;
    utterance.rate = 0.9;
    utterance.pitch = 1.0;

    // Pick appropriate voice if available
    const voices = this.synthesis.getVoices();
    const matchedVoice = voices.find(v => v.lang.replace('_', '-') === locale || v.lang.startsWith(lang));
    if (matchedVoice) {
      utterance.voice = matchedVoice;
    }

    this.isSpeakingState = true;

    utterance.onend = () => {
      this.isSpeakingState = false;
      if (onEnd) onEnd();
    };

    utterance.onerror = () => {
      this.isSpeakingState = false;
      if (onEnd) onEnd();
    };

    this.synthesis.speak(utterance);
  }

  public stop(): void {
    if (this.synthesis) {
      this.synthesis.cancel();
      this.isSpeakingState = false;
    }
  }

  public getHomeNarration(
    lang: SupportedLanguage,
    balance: number,
    safeToSpend: number,
    emergencyFund: number,
    name: string,
    remainingDays?: number
  ): string {
    const b = Math.round(balance);
    const s = Math.round(safeToSpend);
    const em = Math.round(emergencyFund);
    const now = new Date();
    const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
    const daysLeft = remainingDays ?? Math.max(1, daysInMonth - now.getDate() + 1);

    switch (lang) {
      case 'te':
        return `నమస్కారం ${name} గారు. మీ మొత్తం బ్యాంక్ బ్యాలెన్స్ ₹${b}. మీ మొత్తం బ్యాలెన్స్ ప్రకారం, ఈ నెలకు మిగిలిన ${daysLeft} రోజులకు గాను ఈ రోజు మీరు సురక్షితంగా ఖర్చు చేయగల మొత్తం ₹${s}. మీ ఎమర్జెన్సీ ఫండ్‌లో ₹${em} భద్రంగా ఉన్నాయి.`;
      case 'hi':
        return `नमस्ते ${name} जी। आपका कुल बैंक बैलेंस ₹${b} है। आपके कुल बैलेंस के आधार पर, इस महीने के बाकी ${daysLeft} दिनों के लिए आज खर्च करने के लिए सुरक्षित राशि ₹${s} है। आपके आपातकालीन फंड में ₹${em} जमा हैं।`;
      case 'ta':
        return `வணக்கம் ${name}! உங்கள் மொத்த வங்கி இருப்பு ₹${b}. உங்கள் மொத்த இருப்பின்படி, இந்த மாதத்தின் மீதமுள்ள ${daysLeft} நாட்களுக்கு இன்று நீங்கள் செலவழிக்க பாதுகாப்பான தொகை ₹${s}. அவசரகால நிதியில் ₹${em} பத்திரமாக உள்ளது.`;
      case 'kn':
        return `ನಮಸ್ಕಾರ ${name}! ನಿಮ್ಮ ಒಟ್ಟು ಬ್ಯಾಂಕ್ ಬ್ಯಾಲೆನ್ಸ್ ₹${b}. ನಿಮ್ಮ ಒಟ್ಟು ಬ್ಯಾಲೆನ್ಸ್ ಆಧಾರದ ಮೇಲೆ, ಈ ತಿಂಗಳ ಉಳಿದ ${daysLeft} ದಿನಗಳಿಗೆ ಇಂದು ನೀವು ಸುರಕ್ಷಿತವಾಗಿ ಖರ್ಚು ಮಾಡಬಹುದಾದ ಮಿತಿ ₹${s}. ತುರ್ತು ನಿಧಿಯಲ್ಲಿ ₹${em} ಸುರಕ್ಷಿತವಾಗಿದೆ.`;
      case 'ml':
        return `നമസ്കാരം ${name}! നിങ്ങളുടെ ആകെ ബാങ്ക് ബാലൻസ് ₹${b} ആണ്. നിങ്ങളുടെ ആകെ ബാലൻസ് അനുസരിച്ച്, ഈ മാസത്തിലെ ബാക്കി ${daysLeft} ദിവസങ്ങളിലേക്ക് ഇന്ന് സുരക്ഷിതമായി ചെലവഴിക്കാവുന്ന തുക ₹${s}. എമർജൻസി ഫണ്ടിൽ ₹${em} ഉണ്ട്.`;
      case 'mr':
        return `नमस्कार ${name}! आपली एकूण बँक शिल्लक ₹${b} आहे. आपल्या एकूण शिल्लकीच्या आधारे, या महिन्याच्या उर्वरित ${daysLeft} दिवसांसाठी आज सुरक्षितपणे खर्च करण्याची मर्यादा ₹${s} आहे. आपत्कालीन निधीत ₹${em} सुरक्षित आहेत.`;
      case 'bn':
        return `নমস্কার ${name}! আপনার মোট ব্যাঙ্ক ব্যালেন্স ₹${b}. আপনার মোট ব্যালেন্সের ওপর ভিত্তি করে, এই মাসের বাকি ${daysLeft} দিনের জন্য আজ নিরাপদে খরচ করার পরিমাণ ₹${s}. জরুরি তহবিলে ₹${em} সঞ্চিত আছে.`;
      case 'en':
      default:
        return `Hello ${name}. Your total bank balance is ₹${b}. Based on your total balance, you can safely spend ₹${s} for today, with ${daysLeft} days remaining this month. You have ₹${em} secured in your emergency fund.`;
    }
  }
}

export const ttsService = WebTtsService.getInstance();
