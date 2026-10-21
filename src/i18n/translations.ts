import { SupportedLanguage } from '../types';

export interface TranslationSchema {
  // Navigation
  navHome: string;
  navPayments: string;
  navTransactions: string;
  navSavings: string;
  navProfile: string;
  navBills: string;
  navVault: string;
  navAssistant: string;

  // Greetings & Home
  greetingMorning: string;
  greetingAfternoon: string;
  greetingEvening: string;
  availableBalance: string;
  totalSavings: string;
  emergencyFund: string;
  todaySpending: string;
  monthlySpending: string;
  upcomingPayments: string;
  send: string;
  receive: string;
  scan: string;
  request: string;
  quickPay: string;

  // Monthly Summary
  monthlySummaryTitle: string;
  income: string;
  spent: string;
  saved: string;
  remaining: string;
  spendingBreakdown: string;

  // Payments
  sendMoneyTitle: string;
  recipient: string;
  enterAmount: string;
  noteOptional: string;
  reviewPayment: string;
  payNow: string;
  paymentSuccess: string;
  paymentFailed: string;
  paymentBlockedChildCare: string;
  transactionId: string;
  paidTo: string;
  date: string;
  shareReceipt: string;
  downloadReceipt: string;
  done: string;
  scanQrTitle: string;
  receiveQrTitle: string;
  copyUpi: string;
  upiCopied: string;

  // Emergency Fund & Savings
  emergencyFundTitle: string;
  lockFund: string;
  unlockFund: string;
  fundLockedNotice: string;
  addMoney: string;
  withdrawMoney: string;
  targetGoal: string;
  completed: string;
  savingsGoals: string;
  createGoal: string;
  autoSaveRules: string;
  projectedAnnualSavings: string;

  // Document Vault
  documentVaultTitle: string;
  vaultEncryptedBadge: string;
  uploadDocument: string;
  expiryWarning: string;
  viewDocument: string;
  deleteDocument: string;

  // Child Care Mode
  childCareTitle: string;
  childCareActive: string;
  childCareDesc: string;
  childCareBlockedNotice: string;
  enableChildCare: string;
  exitChildCare: string;
  parentPinPrompt: string;

  // AI Assistant & Insights
  aiAssistantTitle: string;
  askFinPocket: string;
  spendingInsight: string;
  dailyTipTitle: string;
  financialHealth: string;
  healthScoreGood: string;

  // Bills & EMI
  billsTitle: string;
  emiLoanTitle: string;
  dueSoon: string;
  markAsPaid: string;
  paidThisMonth: string;
  remainingObligations: string;

  // Security & Profile
  securityCenter: string;
  biometricLogin: string;
  appPin: string;
  connectedBanks: string;
  connectBank: string;
  activeSessions: string;
  logoutAllDevices: string;
  logout: string;
  language: string;
  theme: string;
  lightMode: string;
  darkMode: string;
  offlineMode: string;
  onlineMode: string;

  // Common
  cancel: string;
  confirm: string;
  search: string;
  filter: string;
  all: string;
  exportCsv: string;
  loading: string;
  errorGeneric: string;
}

export const translations: Record<SupportedLanguage, TranslationSchema> = {
  en: {
    navHome: 'Home',
    navPayments: 'Payments',
    navTransactions: 'History',
    navSavings: 'Savings',
    navProfile: 'Profile',
    navBills: 'Bills & EMI',
    navVault: 'Doc Vault',
    navAssistant: 'Ask AI',

    greetingMorning: 'Good Morning',
    greetingAfternoon: 'Good Afternoon',
    greetingEvening: 'Good Evening',
    availableBalance: 'Available Balance',
    totalSavings: 'Total Savings',
    emergencyFund: 'Emergency Fund',
    todaySpending: "Today's Spending",
    monthlySpending: 'Monthly Spending',
    upcomingPayments: 'Upcoming Payments',
    send: 'Send',
    receive: 'Receive',
    scan: 'Scan QR',
    request: 'Request',
    quickPay: 'Quick Pay',

    monthlySummaryTitle: 'Monthly Financial Overview',
    income: 'Income',
    spent: 'Spent',
    saved: 'Saved',
    remaining: 'Remaining',
    spendingBreakdown: 'Spending Categories',

    sendMoneyTitle: 'Send Money',
    recipient: 'Recipient (UPI / Mobile / Bank)',
    enterAmount: 'Enter Amount (₹)',
    noteOptional: 'Add a note (optional)',
    reviewPayment: 'Review Transfer',
    payNow: 'Authenticate & Pay',
    paymentSuccess: 'Payment Successful',
    paymentFailed: 'Payment Failed',
    paymentBlockedChildCare: 'Payments are restricted while Child Care Mode is active.',
    transactionId: 'Transaction ID',
    paidTo: 'Paid to',
    date: 'Date & Time',
    shareReceipt: 'Share Receipt',
    downloadReceipt: 'Download Receipt',
    done: 'Done',
    scanQrTitle: 'Scan Any UPI QR Code',
    receiveQrTitle: 'Receive Money via QR',
    copyUpi: 'Copy UPI ID',
    upiCopied: 'UPI ID Copied to Clipboard!',

    emergencyFundTitle: 'Emergency Fund',
    lockFund: 'Lock Fund',
    unlockFund: 'Unlock Fund',
    fundLockedNotice: 'Emergency Fund is Locked. Normal payments cannot use this balance.',
    addMoney: 'Add Money',
    withdrawMoney: 'Emergency Withdraw',
    targetGoal: 'Target Goal',
    completed: 'completed',
    savingsGoals: 'Savings Goals',
    createGoal: 'New Goal',
    autoSaveRules: 'Automatic Saving Rules',
    projectedAnnualSavings: 'Projected Annual Accumulation',

    documentVaultTitle: 'Secure Document Vault',
    vaultEncryptedBadge: 'End-to-End Encrypted',
    uploadDocument: 'Upload Document',
    expiryWarning: 'Expires soon',
    viewDocument: 'View Document',
    deleteDocument: 'Delete',

    childCareTitle: 'Child Care Mode',
    childCareActive: 'Child Care Mode Active',
    childCareDesc: 'Child safety payment guard and balance privacy is active.',
    childCareBlockedNotice: 'Payment Blocked: Safety mode enabled by parent.',
    enableChildCare: 'Enable Child Care',
    exitChildCare: 'Exit Child Care',
    parentPinPrompt: 'Enter Parent Security PIN',

    aiAssistantTitle: 'Ask FinPocket AI',
    askFinPocket: 'Ask a financial question...',
    spendingInsight: 'Your Spending Insight',
    dailyTipTitle: "Today's Financial Tip",
    financialHealth: 'Financial Health Score',
    healthScoreGood: 'Good financial consistency',

    billsTitle: 'Recurring Bills & Subscriptions',
    emiLoanTitle: 'Active Loans & EMIs',
    dueSoon: 'Due Soon',
    markAsPaid: 'Mark Paid',
    paidThisMonth: 'Paid this month',
    remainingObligations: 'Remaining obligations',

    securityCenter: 'Security Center',
    biometricLogin: 'Biometric Login',
    appPin: 'App Security PIN',
    connectedBanks: 'Connected Bank Accounts',
    connectBank: 'Connect Bank',
    activeSessions: 'Active Device Sessions',
    logoutAllDevices: 'Log Out All Devices',
    logout: 'Log Out',
    language: 'Language / భాష / भाषा',
    theme: 'App Theme',
    lightMode: 'Light Mode',
    darkMode: 'Dark Mode',
    offlineMode: 'Offline Local Mode',
    onlineMode: 'Backend Connected',

    cancel: 'Cancel',
    confirm: 'Confirm',
    search: 'Search transactions, bills, docs...',
    filter: 'Filter',
    all: 'All',
    exportCsv: 'Export Statement (CSV)',
    loading: 'Processing securely...',
    errorGeneric: 'Unable to process request. Please try again.',
  },

  te: {
    navHome: 'హోమ్',
    navPayments: 'చెల్లింపులు',
    navTransactions: 'చరిత్ర',
    navSavings: 'పొదుపులు',
    navProfile: 'ప్రొఫైల్',
    navBills: 'బిల్లులు & EMI',
    navVault: 'డాక్యుమెంట్ వాల్ట్',
    navAssistant: 'AI సహాయకుడు',

    greetingMorning: 'శుభోదయం',
    greetingAfternoon: 'శుభ మధ్యాహ్నం',
    greetingEvening: 'శుభ సాయంత్రం',
    availableBalance: 'లభ్యమైన బ్యాలెన్స్',
    totalSavings: 'మొత్తం పొదుపు',
    emergencyFund: 'ఎమర్జెన్సీ ఫండ్',
    todaySpending: 'నేటి ఖర్చు',
    monthlySpending: 'నెలవారీ ఖర్చు',
    upcomingPayments: 'రాబోయే చెల్లింపులు',
    send: 'పంపండి',
    receive: 'స్వీకరించండి',
    scan: 'QR స్కాన్',
    request: 'అడగండి',
    quickPay: 'త్వరిత చెల్లింపు',

    monthlySummaryTitle: 'నెలవారీ ఆర్థిక అవలోకనం',
    income: 'ఆదాయం',
    spent: 'ఖర్చు',
    saved: 'పొదుపు',
    remaining: 'మిగిలినది',
    spendingBreakdown: 'ఖర్చు వర్గాలు',

    sendMoneyTitle: 'డబ్బు పంపండి',
    recipient: 'స్వీకర్త (UPI / మొబైల్ / బ్యాంక్)',
    enterAmount: 'మొత్తం నమోదు చేయండి (₹)',
    noteOptional: 'వివరణ (ఐచ్ఛికం)',
    reviewPayment: 'చెల్లింపును సమీక్షించండి',
    payNow: 'ధృవీకరించి చెల్లించండి',
    paymentSuccess: 'చెల్లింపు విజయవంతమైంది',
    paymentFailed: 'చెల్లింపు విఫలమైంది',
    paymentBlockedChildCare: 'చైల్డ్ కేర్ మోడ్ సక్రియంగా ఉన్నందున చెల్లింపు నిరోధించబడింది.',
    transactionId: 'లావాదేవీ ID',
    paidTo: 'చెల్లించినది',
    date: 'తేదీ & సమయం',
    shareReceipt: 'రశీదును షేర్ చేయండి',
    downloadReceipt: 'రశీదు డౌన్‌లోడ్',
    done: 'పూర్తయింది',
    scanQrTitle: 'UPI QR కోడ్ స్కాన్ చేయండి',
    receiveQrTitle: 'QR ద్వారా డబ్బు స్వీకరించండి',
    copyUpi: 'UPI ID కాపీ చేయండి',
    upiCopied: 'UPI ID కాపీ చేయబడింది!',

    emergencyFundTitle: 'ఎమర్జెన్సీ ఫండ్',
    lockFund: 'ఫండ్ లాక్ చేయండి',
    unlockFund: 'ఫండ్ అన్‌లాక్ చేయండి',
    fundLockedNotice: 'ఎమర్జెన్సీ ఫండ్ లాక్ చేయబడింది. సాధారణ చెల్లింపులకు ఉపయోగించలేరు.',
    addMoney: 'డబ్బు జోడించండి',
    withdrawMoney: 'ఎమర్జెన్సీ ఉపసంహరణ',
    targetGoal: 'లక్ష్యం',
    completed: 'పూర్తయింది',
    savingsGoals: 'పొదుపు లక్ష్యాలు',
    createGoal: 'కొత్త లక్ష్యం',
    autoSaveRules: 'ఆటోమేటిక్ సేవింగ్ నియమాలు',
    projectedAnnualSavings: 'వార్షిక అంచనా పొదుపు',

    documentVaultTitle: 'సురక్షిత డాక్యుమెంట్ వాల్ట్',
    vaultEncryptedBadge: 'పూర్తి ఎన్‌క్రిప్ట్ చేయబడింది',
    uploadDocument: 'డాక్యుమెంట్ అప్‌లోడ్',
    expiryWarning: 'త్వరలో గడువు ముగుస్తుంది',
    viewDocument: 'డాక్యుమెంట్ చూడండి',
    deleteDocument: 'తొలగించండి',

    childCareTitle: 'చైల్డ్ కేర్ మోడ్',
    childCareActive: 'చైల్డ్ కేర్ మోడ్ సక్రియంగా ఉంది',
    childCareDesc: 'పిల్లల భద్రత కోసం చెల్లింపులు నిరోధించబడ్డాయి.',
    childCareBlockedNotice: 'చెల్లింపు నిరోధించబడింది: పేరెంట్ భద్రత మోడ్ ప్రారంభించబడింది.',
    enableChildCare: 'చైల్డ్ కేర్ ప్రారంభించండి',
    exitChildCare: 'చైల్డ్ కేర్ నుండి నిష్క్రమించండి',
    parentPinPrompt: 'పేరెంట్ పిన్ నమోదు చేయండి',

    aiAssistantTitle: 'FinPocket AI ని అడగండి',
    askFinPocket: 'ఆర్థిక ప్రశ్న అడగండి...',
    spendingInsight: 'మీ ఖర్చు అంతర్దృష్టి',
    dailyTipTitle: 'నేటి ఆర్థిక చిట్కా',
    financialHealth: 'ఆర్థిక ఆరోగ్య స్కోరు',
    healthScoreGood: 'మంచి పొదుపు స్థిరత్వం',

    billsTitle: 'బిల్లులు & సబ్‌స్క్రిప్షన్లు',
    emiLoanTitle: 'రుణాలు & EMI లు',
    dueSoon: 'గడువు సమీపంలో ఉంది',
    markAsPaid: 'చెల్లించినట్లు గుర్తించండి',
    paidThisMonth: 'ఈ నెల చెల్లించినది',
    remainingObligations: 'మిగిలిన బాధ్యతలు',

    securityCenter: 'భద్రతా కేంద్రం',
    biometricLogin: 'బయోమెట్రిక్ లాగిన్',
    appPin: 'యాప్ భద్రతా పిన్',
    connectedBanks: 'అనుసంధానించబడిన బ్యాంకులు',
    connectBank: 'బ్యాంక్ జోడించండి',
    activeSessions: 'సక్రియ పరికరాలు',
    logoutAllDevices: 'అన్ని పరికరాల నుండి లాగౌట్',
    logout: 'లాగౌట్',
    language: 'భాష మార్చుకోండి',
    theme: 'యాప్ థీమ్',
    lightMode: 'లైట్ మోడ్',
    darkMode: 'డార్క్ మోడ్',
    offlineMode: 'ఆఫ్‌లైన్ లోకల్ మోడ్',
    onlineMode: 'సర్వర్ అనుసంధానించబడింది',

    cancel: 'రద్దు చేయండి',
    confirm: 'నిర్ధారించండి',
    search: 'లావాదేవీలు, బిల్లులను శోధించండి...',
    filter: 'ఫిల్టర్',
    all: 'అన్నీ',
    exportCsv: 'స్టేట్‌మెంట్ డౌన్‌లోడ్ (CSV)',
    loading: 'ప్రాసెస్ అవుతోంది...',
    errorGeneric: 'అభ్యర్థన పూర్తి కాలేదు. దయచేసి మళ్ళీ ప్రయత్నించండి.',
  },

  hi: {
    navHome: 'होम',
    navPayments: 'भुगतान',
    navTransactions: 'इतिहास',
    navSavings: 'बचत',
    navProfile: 'प्रोफाइल',
    navBills: 'बिल & EMI',
    navVault: 'दस्तावेज़ वॉल्ट',
    navAssistant: 'AI सहायक',

    greetingMorning: 'शुभ प्रभात',
    greetingAfternoon: 'शुभ दोपहर',
    greetingEvening: 'शुभ संध्या',
    availableBalance: 'उपलब्ध शेष राशि',
    totalSavings: 'कुल बचत',
    emergencyFund: 'आपातकालीन फंड',
    todaySpending: 'आज का खर्च',
    monthlySpending: 'मासिक खर्च',
    upcomingPayments: 'आगामी भुगतान',
    send: 'भेजें',
    receive: 'प्राप्त करें',
    scan: 'QR स्कैन',
    request: 'अनुरोध करें',
    quickPay: 'त्वरित भुगतान',

    monthlySummaryTitle: 'मासिक वित्तीय अवलोकन',
    income: 'आय',
    spent: 'खर्च',
    saved: 'बचत',
    remaining: 'शेष',
    spendingBreakdown: 'खर्च की श्रेणियां',

    sendMoneyTitle: 'पैसे भेजें',
    recipient: 'प्राप्तकर्ता (UPI / मोबाइल / बैंक)',
    enterAmount: 'राशि दर्ज करें (₹)',
    noteOptional: 'विवरण (वैकल्पिक)',
    reviewPayment: 'भुगतान की समीक्षा करें',
    payNow: 'सत्यापित करें और भुगतान करें',
    paymentSuccess: 'भुगतान सफल रहा',
    paymentFailed: 'भुगतान विफल',
    paymentBlockedChildCare: 'चाइल्ड केयर मोड सक्रिय होने के कारण भुगतान अवरुद्ध है।',
    transactionId: 'लेनदेन आईडी',
    paidTo: 'भुगतान किया गया',
    date: 'दिनांक और समय',
    shareReceipt: 'रसीद साझा करें',
    downloadReceipt: 'रसीद डाउनलोड करें',
    done: 'संपन्न',
    scanQrTitle: 'कोई भी UPI QR स्कैन करें',
    receiveQrTitle: 'QR से पैसे प्राप्त करें',
    copyUpi: 'UPI ID कॉपी करें',
    upiCopied: 'UPI ID क्लिपबोर्ड में कॉपी हो गई!',

    emergencyFundTitle: 'आपातकालीन निधि',
    lockFund: 'फंड लॉक करें',
    unlockFund: 'फंड अनलॉक करें',
    fundLockedNotice: 'आपातकालीन निधि लॉक है। सामान्य भुगतान में इसका उपयोग नहीं किया जा सकता।',
    addMoney: 'पैसे जोड़ें',
    withdrawMoney: 'आपातकालीन निकासी',
    targetGoal: 'लक्ष्य',
    completed: 'पूर्ण',
    savingsGoals: 'बचत लक्ष्य',
    createGoal: 'नया लक्ष्य',
    autoSaveRules: 'स्वचालित बचत नियम',
    projectedAnnualSavings: 'अनुमानित वार्षिक बचत',

    documentVaultTitle: 'सुरक्षित दस्तावेज़ वॉल्ट',
    vaultEncryptedBadge: 'पूरी तरह से एन्क्रिप्टेड',
    uploadDocument: 'दस्तावेज़ अपलोड करें',
    expiryWarning: 'जल्द समाप्त हो रहा है',
    viewDocument: 'दस्तावेज़ देखें',
    deleteDocument: 'हटाएं',

    childCareTitle: 'चाइल्ड केयर मोड',
    childCareActive: 'चाइल्ड केयर मोड सक्रिय',
    childCareDesc: 'बच्चों की सुरक्षा के लिए भुगतान अवरुद्ध और बैलेंस छिपा हुआ है।',
    childCareBlockedNotice: 'भुगतान अवरुद्ध: सुरक्षा मोड सक्रिय है।',
    enableChildCare: 'चाइल्ड केयर चालू करें',
    exitChildCare: 'चाइल्ड केयर से बाहर निकलें',
    parentPinPrompt: 'अभिभावक सुरक्षा पिन दर्ज करें',

    aiAssistantTitle: 'FinPocket AI से पूछें',
    askFinPocket: 'वित्तीय प्रश्न पूछें...',
    spendingInsight: 'आपकी खर्च संबंधी अंतर्दृष्टि',
    dailyTipTitle: 'आज का वित्तीय सुझाव',
    financialHealth: 'वित्तीय स्वास्थ्य स्कोर',
    healthScoreGood: 'उत्कृष्ट बचत स्थिरता',

    billsTitle: 'आवर्ती बिल और सदस्यताएँ',
    emiLoanTitle: 'सक्रिय ऋण और EMI',
    dueSoon: 'नियत तिथि निकट है',
    markAsPaid: 'भुगतान किया गया चिह्नित करें',
    paidThisMonth: 'इस माह भुगतान किया',
    remainingObligations: 'शेष देनदारियां',

    securityCenter: 'सुरक्षा केंद्र',
    biometricLogin: 'बायोमेट्रिक लॉगिन',
    appPin: 'ऐप सुरक्षा पिन',
    connectedBanks: 'जुड़े हुए बैंक खाते',
    connectBank: 'बैंक जोड़ें',
    activeSessions: 'सक्रिय डिवाइस सत्र',
    logoutAllDevices: 'सभी उपकरणों से लॉग आउट करें',
    logout: 'लॉग आउट',
    language: 'भाषा बदलें',
    theme: 'ऐप थीम',
    lightMode: 'लाइट मोड',
    darkMode: 'डार्क मोड',
    offlineMode: 'ऑफ़लाइन लोकल मोड',
    onlineMode: 'सर्वर से जुड़ा हुआ',

    cancel: 'रद्द करें',
    confirm: 'पुष्टि करें',
    search: 'लेनदेन, बिल खोजें...',
    filter: 'फ़िल्टर',
    all: 'सभी',
    exportCsv: 'विवरण डाउनलोड करें (CSV)',
    loading: 'सुरक्षित रूप से प्रोसेस हो रहा है...',
    errorGeneric: 'अनुरोध पूरा नहीं हो सका। कृपया पुनः प्रयास करें।',
  },

  ta: {
    navHome: 'முகப்பு',
    navPayments: 'பணப்பரிவர்த்தனை',
    navTransactions: 'வரலாறு',
    navSavings: 'சேமிப்பு',
    navProfile: 'சுயவிவரம்',
    navBills: 'பில்கள் & EMI',
    navVault: 'ஆவணப் பெட்டகம்',
    navAssistant: 'AI உதவியாளர்',

    greetingMorning: 'காலை வணக்கம்',
    greetingAfternoon: 'மதிய வணக்கம்',
    greetingEvening: 'மாலை வணக்கம்',
    availableBalance: 'கிடைக்கும் இருப்பு',
    totalSavings: 'மொத்த சேமிப்பு',
    emergencyFund: 'அவசரகால நிதி',
    todaySpending: 'இன்றைய செலவு',
    monthlySpending: 'மாதாந்திர செலவு',
    upcomingPayments: 'வரவிருக்கும் கட்டணங்கள்',
    send: 'அனுப்பு',
    receive: 'பெறு',
    scan: 'QR ஸ்கேன்',
    request: 'கோரிக்கை',
    quickPay: 'விரைவு கட்டணம்',

    monthlySummaryTitle: 'மாதாந்திர நிதி கண்ணோட்டம்',
    income: 'வருமானம்',
    spent: 'செலவு',
    saved: 'சேமிப்பு',
    remaining: 'மீதம்',
    spendingBreakdown: 'செலவு பிரிவுகள்',

    sendMoneyTitle: 'பணம் அனுப்புங்கள்',
    recipient: 'பெறுநர் (UPI / மொபைல் / வங்கி)',
    enterAmount: 'தொகையை உள்ளிடவும் (₹)',
    noteOptional: 'குறிப்பு (விருப்பமானது)',
    reviewPayment: 'பரிவர்த்தனையை சரிபார்க்கவும்',
    payNow: 'உறுதிப்படுத்தி செலுத்துங்கள்',
    paymentSuccess: 'பரிவர்த்தனை வெற்றிகரமானது',
    paymentFailed: 'பரிவர்த்தனை தோல்வியடைந்தது',
    paymentBlockedChildCare: 'குழந்தை பாதுகாப்பு முறையில் பரிவர்த்தனை தடுக்கப்பட்டுள்ளது.',
    transactionId: 'பரிவர்த்தனை எண்',
    paidTo: 'செலுத்தப்பட்டது',
    date: 'தேதி & நேரம்',
    shareReceipt: 'ரசீதை பகிரவும்',
    downloadReceipt: 'ரசீது பதிவிறக்கம்',
    done: 'முடிந்தது',
    scanQrTitle: 'UPI QR குறியீட்டை ஸ்கேன் செய்யுங்கள்',
    receiveQrTitle: 'QR மூலம் பணம் பெறுங்கள்',
    copyUpi: 'UPI ID நகலெடு',
    upiCopied: 'UPI ID நகலெடுக்கப்பட்டது!',

    emergencyFundTitle: 'அவசரகால நிதி',
    lockFund: 'நிதியை பூட்டு',
    unlockFund: 'நிதியை திறக்க',
    fundLockedNotice: 'அவசரகால நிதி பூட்டப்பட்டுள்ளது.',
    addMoney: 'பணம் சேர்',
    withdrawMoney: 'அவசர திரும்பப் பெறுதல்',
    targetGoal: 'இலக்கு',
    completed: 'முடிந்தது',
    savingsGoals: 'சேமிப்பு இலக்குகள்',
    createGoal: 'புதிய இலக்கு',
    autoSaveRules: 'தானியங்கி சேமிப்பு விதிகள்',
    projectedAnnualSavings: 'ஆண்டு மதிப்பிடப்பட்ட சேமிப்பு',

    documentVaultTitle: 'பாதுகாப்பான ஆவண பெட்டகம்',
    vaultEncryptedBadge: 'முழுமையாக என்க்ரிப்ட் செய்யப்பட்டது',
    uploadDocument: 'ஆவணத்தைப் பதிவேற்றவும்',
    expiryWarning: 'விரைவில் காலாவதியாகிறது',
    viewDocument: 'ஆவணத்தைப் பார்',
    deleteDocument: 'நீக்கு',

    childCareTitle: 'குழந்தை பாதுகாப்பு முறை',
    childCareActive: 'குழந்தை பாதுகாப்பு முறை செயலில் உள்ளது',
    childCareDesc: 'குழந்தைகளின் பாதுகாப்புக்காக பணம் அனுப்புதல் முடக்கப்பட்டுள்ளது.',
    childCareBlockedNotice: 'பாதுகாப்பு முறை இயக்கப்பட்டுள்ளது.',
    enableChildCare: 'பாதுகாப்பை இயக்கு',
    exitChildCare: 'பாதுகாப்பிலிருந்து வெளியேறு',
    parentPinPrompt: 'பெற்றோர் PIN எண்ணை உள்ளிடவும்',

    aiAssistantTitle: 'FinPocket AI-யிடம் கேளுங்கள்',
    askFinPocket: 'நிதி கேள்விகளைக் கேளுங்கள்...',
    spendingInsight: 'உங்கள் செலவு நுண்ணறிவு',
    dailyTipTitle: 'இன்றைய நிதி குறிப்பு',
    financialHealth: 'நிதி ஆரோக்கிய மதிப்பெண்',
    healthScoreGood: 'சிறந்த சேமிப்பு பழக்கம்',

    billsTitle: 'தொடர் பில்கள் & சந்தாக்கள்',
    emiLoanTitle: 'கடன்கள் & EMI',
    dueSoon: 'கட்டணம் செலுத்த வேண்டிய தேதி அருகில்',
    markAsPaid: 'செலுத்தப்பட்டது என குறிக்க',
    paidThisMonth: 'இந்த மாதம் செலுத்தப்பட்டது',
    remainingObligations: 'மீதமுள்ள பொறுப்புகள்',

    securityCenter: 'பாதுகாப்பு மையம்',
    biometricLogin: 'பயோமெட்ரிக் உள்நுழைவு',
    appPin: 'ஆப் பாதுகாப்பு PIN',
    connectedBanks: 'இணைக்கப்பட்ட வங்கிகள்',
    connectBank: 'வங்கியை இணைக்கவும்',
    activeSessions: 'செயலில் உள்ள சாதனங்கள்',
    logoutAllDevices: 'அனைத்து சாதனங்களிலிருந்தும் வெளியேறு',
    logout: 'வெளியேறு',
    language: 'மொழியை மாற்றவும்',
    theme: 'வடிவமைப்பு',
    lightMode: 'லைட் பயன்முறை',
    darkMode: 'டார்க் பயன்முறை',
    offlineMode: 'ஆஃப்லைன் முறை',
    onlineMode: 'இணையத்துடன் இணைக்கப்பட்டது',

    cancel: 'ரத்து செய்',
    confirm: 'உறுதி செய்',
    search: 'பரிவர்த்தனைகளைத் தேடுங்கள்...',
    filter: 'வடிகட்டு',
    all: 'அனைத்தும்',
    exportCsv: 'அறிக்கை பதிவிறக்கம் (CSV)',
    loading: 'பாதுகாப்பாக செயலாக்கப்படுகிறது...',
    errorGeneric: 'கோரிக்கையை முடிக்க முடியவில்லை. மீண்டும் முயற்சிக்கவும்.',
  },

  kn: {
    navHome: 'ಮುಖಪುಟ',
    navPayments: 'ಪಾವತಿಗಳು',
    navTransactions: 'ಇತಿಹಾಸ',
    navSavings: 'ಉಳಿತಾಯ',
    navProfile: 'ಪ್ರೊಫೈಲ್',
    navBills: 'ಬಿಲ್ಲುಗಳು & EMI',
    navVault: 'ದಾಖಲೆ ವಾಲ್ಟ್',
    navAssistant: 'AI ಸಹಾಯಕ',

    greetingMorning: 'ಶುಭೋದಯ',
    greetingAfternoon: 'ಶುಭ ಮಧ್ಯಾಹ್ನ',
    greetingEvening: 'ಶುಭ ಸಂಜೆ',
    availableBalance: 'ಲಭ್ಯವಿರುವ ಬ್ಯಾಲೆನ್ಸ್',
    totalSavings: 'ಒಟ್ಟು ಉಳಿತಾಯ',
    emergencyFund: 'ತುರ್ತು ನಿಧಿ',
    todaySpending: 'ಇಂದಿನ ಖರ್ಚು',
    monthlySpending: 'ತಿಂಗಳ ಖರ್ಚು',
    upcomingPayments: 'ಮುಂಬರುವ ಪಾವತಿಗಳು',
    send: 'ಕಳುಹಿಸಿ',
    receive: 'ಸ್ವೀಕರಿಸಿ',
    scan: 'QR ಸ್ಕ್ಯಾನ್',
    request: 'ವಿನಂತಿಸಿ',
    quickPay: 'ತ್ವರಿತ ಪಾವತಿ',

    monthlySummaryTitle: 'ಮಾಸಿಕ ಆರ್ಥಿಕ ಅವಲೋಕನ',
    income: 'ಆದಾಯ',
    spent: 'ಖರ್ಚು',
    saved: 'ಉಳಿತಾಯ',
    remaining: 'ಉಳಿದದ್ದು',
    spendingBreakdown: 'ಖರ್ಚಿನ ವರ್ಗಗಳು',

    sendMoneyTitle: 'ಹಣ ಕಳುಹಿಸಿ',
    recipient: 'ಸ್ವೀಕರಿಸುವವರು (UPI / ಮೊಬೈಲ್ / ಬ್ಯಾಂಕ್)',
    enterAmount: 'ಮೊತ್ತವನ್ನು ನಮೂದಿಸಿ (₹)',
    noteOptional: 'ವಿವರಣೆ (ಐಚ್ಛಿಕ)',
    reviewPayment: 'ಪಾವತಿಯನ್ನು ಪರಿಶೀಲಿಸಿ',
    payNow: 'ದೃಢೀಕರಿಸಿ ಮತ್ತು ಪಾವತಿಸಿ',
    paymentSuccess: 'ಪಾವತಿ ಯಶಸ್ವಿಯಾಗಿದೆ',
    paymentFailed: 'ಪಾವತಿ ವಿಫಲವಾಗಿದೆ',
    paymentBlockedChildCare: 'ಚೈಲ್ಡ್ ಕೇರ್ ಮೋಡ್ ಸಕ್ರಿಯವಾಗಿರುವುದರಿಂದ ಪಾವತಿಯನ್ನು ನಿರ್ಬಂಧಿಸಲಾಗಿದೆ.',
    transactionId: 'ವಹಿವಾಟು ID',
    paidTo: 'ಪಾವತಿಸಲಾಗಿದೆ',
    date: 'ದಿನಾಂಕ ಮತ್ತು ಸಮಯ',
    shareReceipt: 'ರಸೀದಿಯನ್ನು ಹಂಚಿಕೊಳ್ಳಿ',
    downloadReceipt: 'ರಸೀದಿ ಡೌನ್‌ಲೋಡ್',
    done: 'ಮುಗಿದಿದೆ',
    scanQrTitle: 'UPI QR ಸ್ಕ್ಯಾನ್ ಮಾಡಿ',
    receiveQrTitle: 'QR ಮೂಲಕ ಹಣ ಸ್ವೀಕರಿಸಿ',
    copyUpi: 'UPI ID ನಕಲಿಸಿ',
    upiCopied: 'UPI ID ನಕಲಿಸಲಾಗಿದೆ!',

    emergencyFundTitle: 'ತುರ್ತು ನಿಧಿ',
    lockFund: 'ನಿಧಿಯನ್ನು ಲಾಕ್ ಮಾಡಿ',
    unlockFund: 'ನಿಧಿಯನ್ನು ಅನ್‌ಲಾಕ್ ಮಾಡಿ',
    fundLockedNotice: 'ತುರ್ತು ನಿಧಿಯನ್ನು ಲಾಕ್ ಮಾಡಲಾಗಿದೆ.',
    addMoney: 'ಹಣ ಸೇರಿಸಿ',
    withdrawMoney: 'ತುರ್ತು ಹಿಂಪಡೆಯುವಿಕೆ',
    targetGoal: 'ಗುರಿ',
    completed: 'ಪೂರ್ಣಗೊಂಡಿದೆ',
    savingsGoals: 'ಉಳಿತಾಯ ಗುರಿಗಳು',
    createGoal: 'ಹೊಸ ಗುರಿ',
    autoSaveRules: 'ಸ್ವಯಂಚಾಲಿತ ಉಳಿತಾಯ ನಿಯಮಗಳು',
    projectedAnnualSavings: 'ವಾರ್ಷಿಕ ಅಂದಾಜು ಉಳಿತಾಯ',

    documentVaultTitle: 'ಸುರಕ್ಷಿತ ದಾಖಲೆ ವಾಲ್ಟ್',
    vaultEncryptedBadge: 'ಸಂಪೂರ್ಣ ಎನ್‌ಕ್ರಿಪ್ಟ್ ಮಾಡಲಾಗಿದೆ',
    uploadDocument: 'ದಾಖಲೆ ಅಪ್‌ಲೋಡ್ ಮಾಡಿ',
    expiryWarning: 'ಶೀಘ್ರದಲ್ಲೇ ಮುಕ್ತಾಯಗೊಳ್ಳಲಿದೆ',
    viewDocument: 'ದಾಖಲೆ ವೀಕ್ಷಿಸಿ',
    deleteDocument: 'ಅಳಿಸಿ',

    childCareTitle: 'ಚೈಲ್ಡ್ ಕೇರ್ ಮೋಡ್',
    childCareActive: 'ಚೈಲ್ಡ್ ಕೇರ್ ಮೋಡ್ ಸಕ್ರಿಯವಾಗಿದೆ',
    childCareDesc: 'ಮಕ್ಕಳ ಸುರಕ್ಷತೆಗಾಗಿ ಪಾವತಿಗಳನ್ನು ನಿರ್ಬಂಧಿಸಲಾಗಿದೆ.',
    childCareBlockedNotice: 'ಪಾವತಿ ನಿರ್ಬಂಧಿಸಲಾಗಿದೆ: ಪೋಷಕರ ಸುರಕ್ಷತಾ ಮೋಡ್ ಸಕ್ರಿಯವಾಗಿದೆ.',
    enableChildCare: 'ಚೈಲ್ಡ್ ಕೇರ್ ಸಕ್ರಿಯಗೊಳಿಸಿ',
    exitChildCare: 'ಚೈಲ್ಡ್ ಕೇರ್‌ನಿಂದ ನಿರ್ಗಮಿಸಿ',
    parentPinPrompt: 'ಪೋಷಕರ ಪಿನ್ ನಮೂದಿಸಿ',

    aiAssistantTitle: 'FinPocket AI ಅನ್ನು ಕೇಳಿ',
    askFinPocket: 'ಆರ್ಥಿಕ ಪ್ರಶ್ನೆಗಳನ್ನು ಕೇಳಿ...',
    spendingInsight: 'ನಿಮ್ಮ ಖರ್ಚಿನ ಒಳನೋಟ',
    dailyTipTitle: 'ಇಂದಿನ ಆರ್ಥಿಕ ಸಲಹೆ',
    financialHealth: 'ಆರ್ಥಿಕ ಆರೋಗ್ಯ ಸ್ಕೋರ್',
    healthScoreGood: 'ಉತ್ತಮ ಉಳಿತಾಯ ಶಿಸ್ತು',

    billsTitle: 'ಮರುಕಳಿಸುವ ಬಿಲ್ಲುಗಳು & ಚಂದಾದಾರಿಕೆಗಳು',
    emiLoanTitle: 'ಸಾಲಗಳು & EMI',
    dueSoon: 'ಗಡುವು ಹತ್ತಿರದಲ್ಲಿದೆ',
    markAsPaid: 'ಪಾವತಿಸಲಾಗಿದೆ ಎಂದು ಗುರುತಿಸಿ',
    paidThisMonth: 'ಈ ತಿಂಗಳು ಪಾವತಿಸಲಾಗಿದೆ',
    remainingObligations: 'ಉಳಿದ ಜವಾಬ್ದಾರಿಗಳು',

    securityCenter: 'ಸುರಕ್ಷತಾ ಕೇಂದ್ರ',
    biometricLogin: 'ಬಯೋಮೆಟ್ರಿಕ್ ಲಾಗಿನ್',
    appPin: 'ಆ್ಯಪ್ ಭದ್ರತಾ ಪಿನ್',
    connectedBanks: 'ಸಂಪರ್ಕಿತ ಬ್ಯಾಂಕ್‌ಗಳು',
    connectBank: 'ಬ್ಯಾಂಕ್ ಸಂಪರ್ಕಿಸಿ',
    activeSessions: 'ಸಕ್ರಿಯ ಸಾಧನಗಳು',
    logoutAllDevices: 'ಎಲ್ಲಾ ಸಾಧನಗಳಿಂದ ಲಾಗೌಟ್ ಮಾಡಿ',
    logout: 'ಲಾಗೌಟ್',
    language: 'ಭಾಷೆ ಬದಲಾಯಿಸಿ',
    theme: 'ಆ್ಯಪ್ ಥೀಮ್',
    lightMode: 'ಲೈಟ್ ಮೋಡ್',
    darkMode: 'ಡಾರ್ಕ್ ಮೋಡ್',
    offlineMode: 'ಆಫ್‌ಲೈನ್ ಮೋಡ್',
    onlineMode: 'ಆನ್‌ಲೈನ್ ಸಂಪರ್ಕಿತ',

    cancel: 'ರದ್ದುಮಾಡಿ',
    confirm: 'ದೃಢೀಕರಿಸಿ',
    search: 'ವಹಿವಾಟುಗಳು, ಬಿಲ್ಲುಗಳನ್ನು ಹುಡುಕಿ...',
    filter: 'ಫಿಲ್ಟರ್',
    all: 'ಎಲ್ಲಾ',
    exportCsv: 'ಸ್ಟೇಟ್‌ಮೆಂಟ್ ಡೌನ್‌ಲೋಡ್ (CSV)',
    loading: 'ಸುರಕ್ಷಿತವಾಗಿ ಪ್ರಕ್ರಿಯೆಗೊಳಿಸಲಾಗುತ್ತಿದೆ...',
    errorGeneric: 'ವಿನಂತಿಯನ್ನು ಪೂರ್ಣಗೊಳಿಸಲು ಸಾಧ್ಯವಾಗಲಿಲ್ಲ. ದಯವಿಟ್ಟು ಪುನಃ ಪ್ರಯತ್ನಿಸಿ.',
  },

  ml: {
    navHome: 'ഹോം',
    navPayments: 'പേയ്‌മെന്റുകൾ',
    navTransactions: 'ചരിത്രം',
    navSavings: 'സമ്പാദ്യം',
    navProfile: 'പ്രൊഫൈൽ',
    navBills: 'ബില്ലുകൾ & EMI',
    navVault: 'ഡോക്യുമെന്റ് വോൾട്ട്',
    navAssistant: 'AI അസിസ്റ്റന്റ്',

    greetingMorning: 'സുപ്രഭാതം',
    greetingAfternoon: 'ശുഭ ഉച്ചതിരിഞ്ഞ്',
    greetingEvening: 'ശുഭ സായാഹ്നം',
    availableBalance: 'ലഭ്യമായ ബാലൻസ്',
    totalSavings: 'ആകെ സമ്പാദ്യം',
    emergencyFund: 'എമർജൻസി ഫണ്ട്',
    todaySpending: 'ഇന്നത്തെ ചെലവ്',
    monthlySpending: 'പ്രതിമാസ ചെലവ്',
    upcomingPayments: 'വരാനിരിക്കുന്ന പേയ്‌മെന്റുകൾ',
    send: 'അയക്കുക',
    receive: 'സ്വീകരിക്കുക',
    scan: 'QR സ്കാൻ',
    request: 'അഭ്യർത്ഥിക്കുക',
    quickPay: 'ദ്രുത പേയ്‌മെന്റ്',

    monthlySummaryTitle: 'പ്രതിമാസ സാമ്പത്തിക അവലോകനം',
    income: 'വരുമാനം',
    spent: 'ചെലവ്',
    saved: 'സമ്പാദ്യം',
    remaining: 'ബാക്കി',
    spendingBreakdown: 'ചെലവ് വിഭാഗങ്ങൾ',

    sendMoneyTitle: 'പണം അയക്കുക',
    recipient: 'സ്വീകർത്താവ് (UPI / മൊബൈൽ / ബാങ്ക്)',
    enterAmount: 'തുക രേഖപ്പെടുത്തുക (₹)',
    noteOptional: 'വിവരണം (ഓപ്ഷണൽ)',
    reviewPayment: 'പേയ്‌മെന്റ് അവലോകനം ചെയ്യുക',
    payNow: 'സ്ഥിരീകരിച്ച് പണമടയ്ക്കുക',
    paymentSuccess: 'പേയ്‌മെന്റ് വിജയകരം',
    paymentFailed: 'പേയ്‌മെന്റ് പരാജയപ്പെട്ടു',
    paymentBlockedChildCare: 'ചൈൽഡ് കെയർ മോഡ് സജീവമായതിനാൽ പേയ്‌മെന്റ് തടഞ്ഞു.',
    transactionId: 'ഇടപാട് ഐഡി',
    paidTo: 'നൽകിയത്',
    date: 'തീയതി & സമയം',
    shareReceipt: 'രസീത് പങ്കിടുക',
    downloadReceipt: 'രസീത് ഡൗൺലോഡ്',
    done: 'പൂർത്തിയായി',
    scanQrTitle: 'ഏതെങ്കിലും UPI QR സ്കാൻ ചെയ്യുക',
    receiveQrTitle: 'QR വഴി പണം സ്വീകരിക്കുക',
    copyUpi: 'UPI ID കോപ്പി ചെയ്യുക',
    upiCopied: 'UPI ID കോപ്പി ചെയ്തു!',

    emergencyFundTitle: 'എമർജൻസി ഫണ്ട്',
    lockFund: 'ഫണ്ട് ലോക്ക് ചെയ്യുക',
    unlockFund: 'ഫണ്ട് അൺലോക്ക് ചെയ്യുക',
    fundLockedNotice: 'എമർജൻസി ഫണ്ട് ലോക്ക് ചെയ്‌തിരിക്കുന്നു.',
    addMoney: 'പണം ചേർക്കുക',
    withdrawMoney: 'അടിയന്തര പിൻവലിക്കൽ',
    targetGoal: 'ലക്ഷ്യം',
    completed: 'പൂർത്തിയായി',
    savingsGoals: 'സമ്പാദ്യ ലക്ഷ്യങ്ങൾ',
    createGoal: 'പുതിയ ലക്ഷ്യം',
    autoSaveRules: 'ഓട്ടോമാറ്റിക് സേവിംഗ്സ് നിയമങ്ങൾ',
    projectedAnnualSavings: 'പ്രതീക്ഷിക്കുന്ന വാർഷിക സമ്പാദ്യം',

    documentVaultTitle: 'സുരക്ഷിത ഡോക്യുമെന്റ് വോൾട്ട്',
    vaultEncryptedBadge: 'എൻഡ്-ടു-എൻഡ് എൻക്രിപ്റ്റഡ്',
    uploadDocument: 'രേഖ അപ്‌ലോഡ് ചെയ്യുക',
    expiryWarning: 'ഉടൻ കാലഹരണപ്പെടും',
    viewDocument: 'രേഖ കാണുക',
    deleteDocument: 'ഡിലീറ്റ് ചെയ്യുക',

    childCareTitle: 'ചൈൽഡ് കെയർ മോഡ്',
    childCareActive: 'ചൈൽഡ് കെയർ മോഡ് സജീവം',
    childCareDesc: 'കുട്ടികളുടെ സുരക്ഷയ്ക്കായി പേയ്‌മെന്റുകൾ തടഞ്ഞിരിക്കുന്നു.',
    childCareBlockedNotice: 'പേയ്‌മെന്റ് തടഞ്ഞു: പാരന്റ് സേഫ്റ്റി മോഡ് ഓൺ ആണ്.',
    enableChildCare: 'ചൈൽഡ് കെയർ ഓൺ ചെയ്യുക',
    exitChildCare: 'ചൈൽഡ് കെയറിൽ നിന്ന് പുറത്തുകടക്കുക',
    parentPinPrompt: 'പാരന്റ് പിൻ നൽകുക',

    aiAssistantTitle: 'FinPocket AI-യോട് ചോദിക്കുക',
    askFinPocket: 'സാമ്പത്തിക സംശയങ്ങൾ ചോദിക്കൂ...',
    spendingInsight: 'നിങ്ങളുടെ ചെലവ് സ്ഥിതിവിവരക്കണക്കുകൾ',
    dailyTipTitle: 'ഇന്നത്തെ സാമ്പത്തിക ടിപ്പ്',
    financialHealth: 'സാമ്പത്തിക ആരോഗ്യ സ്കോർ',
    healthScoreGood: 'നല്ല സമ്പാദ്യ ശീലം',

    billsTitle: 'ബില്ലുകൾ & സബ്‌സ്‌ക്രിപ്ഷനുകൾ',
    emiLoanTitle: 'വായ്പകൾ & EMI',
    dueSoon: 'തീയതി അടുത്തെത്തി',
    markAsPaid: 'അടച്ചതായി അടയാളപ്പെടുത്തുക',
    paidThisMonth: 'ഈ മാസം അടച്ചത്',
    remainingObligations: 'ബാക്കി ബാധ്യതകൾ',

    securityCenter: 'സുരക്ഷാ കേന്ദ്രം',
    biometricLogin: 'ബയോമെട്രിക് ലോഗിൻ',
    appPin: 'ആപ്പ് സുരക്ഷാ പിൻ',
    connectedBanks: 'ബന്ധിപ്പിച്ച ബാങ്കുകൾ',
    connectBank: 'ബാങ്ക് ബന്ധിപ്പിക്കുക',
    activeSessions: 'സജീവ ഉപകരണങ്ങൾ',
    logoutAllDevices: 'എല്ലാ ഉപകരണങ്ങളിൽ നിന്നും ലോഗൗട്ട് ചെയ്യുക',
    logout: 'ലോഗൗട്ട്',
    language: 'ഭാഷ മാറ്റുക',
    theme: 'ആപ്പ് തീം',
    lightMode: 'ലൈറ്റ് മോഡ്',
    darkMode: 'ഡാർക്ക് മോഡ്',
    offlineMode: 'ഓഫ്‌ലൈൻ മോഡ്',
    onlineMode: 'കണക്റ്റഡ്',

    cancel: 'റദ്ദാക്കുക',
    confirm: 'സ്ഥിരീകരിക്കുക',
    search: 'ഇടപാടുകൾ തിരയുക...',
    filter: 'ഫിൽട്ടർ',
    all: 'എല്ലാം',
    exportCsv: 'സ്റ്റേറ്റ്മെന്റ് ഡൗൺലോഡ് (CSV)',
    loading: 'സുരക്ഷിതമായി പ്രോസസ്സ് ചെയ്യുന്നു...',
    errorGeneric: 'അഭ്യർത്ഥന പൂർത്തിയാക്കാൻ കഴിഞ്ഞില്ല. വീണ്ടും ശ്രമിക്കുക.',
  },

  mr: {
    navHome: 'मुख्यपृष्ठ',
    navPayments: 'पेमेंट्स',
    navTransactions: 'इतिहास',
    navSavings: 'बचत',
    navProfile: 'प्रोफाइल',
    navBills: 'बिले & EMI',
    navVault: 'कागदपत्र वॉल्ट',
    navAssistant: 'AI सहाय्यक',

    greetingMorning: 'शुभ प्रभात',
    greetingAfternoon: 'शुभ दुपार',
    greetingEvening: 'शुभ संध्याकाळ',
    availableBalance: 'उपलब्ध शिल्लक',
    totalSavings: 'एकूण बचत',
    emergencyFund: 'आपत्कालीन निधी',
    todaySpending: 'आजचा खर्च',
    monthlySpending: 'मासिक खर्च',
    upcomingPayments: 'आगामी देयके',
    send: 'पाठवा',
    receive: 'स्वीकारा',
    scan: 'QR स्कॅन',
    request: 'मागणी करा',
    quickPay: 'जलद पेमेंट',

    monthlySummaryTitle: 'मासिक आर्थिक आढावा',
    income: 'उत्पन्न',
    spent: 'खर्च',
    saved: 'बचत',
    remaining: 'उर्वरित',
    spendingBreakdown: 'खर्च वर्गवारी',

    sendMoneyTitle: 'पैसे पाठवा',
    recipient: 'प्राप्तकर्ता (UPI / मोबाइल / बँक)',
    enterAmount: 'रक्कम टाका (₹)',
    noteOptional: 'टीप (पर्यायी)',
    reviewPayment: 'पेमेंट तपासा',
    payNow: 'प्रमाणित करा आणि पैसे द्या',
    paymentSuccess: 'पेमेंट यशस्वी झाले',
    paymentFailed: 'पेमेंट अयशस्वी',
    paymentBlockedChildCare: 'चाइल्ड केअर मोड सक्रिय असल्याने पेमेंट ब्लॉक केले आहे.',
    transactionId: 'व्यवहार आयडी',
    paidTo: 'दिले',
    date: 'तारीख आणि वेळ',
    shareReceipt: 'पावती शेअर करा',
    downloadReceipt: 'पावती डाउनलोड करा',
    done: 'पूर्ण झाले',
    scanQrTitle: 'कोणताही UPI QR स्कॅन करा',
    receiveQrTitle: 'QR द्वारे पैसे मिळवा',
    copyUpi: 'UPI ID कॉपी करा',
    upiCopied: 'UPI ID कॉपी झाली!',

    emergencyFundTitle: 'आपत्कालीन निधी',
    lockFund: 'निधी लॉक करा',
    unlockFund: 'निधी अनलॉक करा',
    fundLockedNotice: 'आपत्कालीन निधी लॉक आहे.',
    addMoney: 'पैसे जोडा',
    withdrawMoney: 'आपत्कालीन पैसे काढणे',
    targetGoal: 'लक्ष्य',
    completed: 'पूर्ण',
    savingsGoals: 'बचत उद्दिष्टे',
    createGoal: 'नवीन ध्येय',
    autoSaveRules: 'स्वयंचलित बचत नियम',
    projectedAnnualSavings: 'अंदाजे वार्षिक बचत',

    documentVaultTitle: 'सुरक्षित दस्तऐवज वॉल्ट',
    vaultEncryptedBadge: 'पूर्णपणे एन्क्रिप्टेड',
    uploadDocument: 'दस्तऐवज अपलोड करा',
    expiryWarning: 'लवकरच संपत आहे',
    viewDocument: 'दस्तऐवज पहा',
    deleteDocument: 'हटवा',

    childCareTitle: 'चाइल्ड केअर मोड',
    childCareActive: 'चाइल्ड केअर मोड सुरू आहे',
    childCareDesc: 'मुलांच्या सुरक्षेसाठी पेमेंट्स ब्लॉक आहेत.',
    childCareBlockedNotice: 'पेमेंट ब्लॉक केले: पालक सुरक्षा मोड चालू आहे.',
    enableChildCare: 'चाइल्ड केअर सुरू करा',
    exitChildCare: 'चाइल्ड केअरमधून बाहेर पडा',
    parentPinPrompt: 'पालक पिन प्रविष्ट करा',

    aiAssistantTitle: 'FinPocket AI ला विचारा',
    askFinPocket: 'आर्थिक प्रश्न विचारा...',
    spendingInsight: 'तुमच्या खर्चाची अंतर्दृष्टी',
    dailyTipTitle: 'आजची आर्थिक टीप',
    financialHealth: 'आर्थिक आरोग्य स्कोअर',
    healthScoreGood: 'चांगली बचत शिस्त',

    billsTitle: 'नियमित बिले & वर्गणी',
    emiLoanTitle: 'कर्ज & EMI',
    dueSoon: 'मुदत जवळ आली आहे',
    markAsPaid: 'भरले म्हणून चिन्हांकित करा',
    paidThisMonth: 'या महिन्यात भरले',
    remainingObligations: 'उर्वरित देणी',

    securityCenter: 'सुरक्षा केंद्र',
    biometricLogin: 'बायोमेट्रिक लॉगिन',
    appPin: 'अॅप सुरक्षा पिन',
    connectedBanks: 'जोडलेली बँक खाती',
    connectBank: 'बँक जोडा',
    activeSessions: 'सक्रिय डिव्हाइसेस',
    logoutAllDevices: 'सर्व उपकरणांमधून लॉग आउट करा',
    logout: 'लॉग आउट',
    language: 'भाषा बदला',
    theme: 'अॅप थीम',
    lightMode: 'लाइट मोड',
    darkMode: 'डार्क मोड',
    offlineMode: 'ऑफलाइन मोड',
    onlineMode: 'सर्व्हरशी जोडलेले',

    cancel: 'रद्द करा',
    confirm: 'पुष्टी करा',
    search: 'व्यवहार, बिले शोधा...',
    filter: 'फिल्टर',
    all: 'सर्व',
    exportCsv: 'स्टेटमेंट डाउनलोड (CSV)',
    loading: 'सुरक्षितपणे प्रक्रिया करत आहे...',
    errorGeneric: 'प्रक्रिया पूर्ण होऊ शकली नाही. कृपया पुन्हा प्रयत्न करा.',
  },

  bn: {
    navHome: 'হোম',
    navPayments: 'পেমেন্ট',
    navTransactions: 'ইতিহাস',
    navSavings: 'সঞ্চয়',
    navProfile: 'প্রোফাইল',
    navBills: 'বিল ও ইএমআই',
    navVault: 'ডকুমেন্ট ভল্ট',
    navAssistant: 'এআই সহকারী',

    greetingMorning: 'সুপ্রভাত',
    greetingAfternoon: 'শুভ দুপুর',
    greetingEvening: 'শুভ সন্ধ্যা',
    availableBalance: 'উপলব্ধ ব্যালেন্স',
    totalSavings: 'মোট সঞ্চয়',
    emergencyFund: 'জরুরী তহবিল',
    todaySpending: 'আজকের খরচ',
    monthlySpending: 'মাসিক খরচ',
    upcomingPayments: 'আসন্ন পেমেন্ট',
    send: 'পাঠান',
    receive: 'গ্রহণ করুন',
    scan: 'QR স্ক্যান',
    request: 'অনুরোধ',
    quickPay: 'দ্রুত পেমেন্ট',

    monthlySummaryTitle: 'মাসিক আর্থিক বিবরণ',
    income: 'আয়',
    spent: 'ব্যয়',
    saved: 'সঞ্চয়',
    remaining: 'অবশিষ্ট',
    spendingBreakdown: 'ব্যয়ের খাতসমূহ',

    sendMoneyTitle: 'টাকা পাঠান',
    recipient: 'প্রাপক (UPI / মোবাইল / ব্যাংক)',
    enterAmount: 'পরিমাণ লিখুন (₹)',
    noteOptional: 'বিবরণ (ঐচ্ছিক)',
    reviewPayment: 'পেমেন্ট পর্যালোচনা করুন',
    payNow: 'নিশ্চিত ও পরিশোধ করুন',
    paymentSuccess: 'পেমেন্ট সফল হয়েছে',
    paymentFailed: 'পেমেন্ট ব্যর্থ হয়েছে',
    paymentBlockedChildCare: 'চাইল্ড কেয়ার মোড সক্রিয় থাকায় পেমেন্ট অবরুদ্ধ করা হয়েছে।',
    transactionId: 'লেনদেন আইডি',
    paidTo: 'প্রাপক',
    date: 'তারিখ ও সময়',
    shareReceipt: 'রসিদ শেয়ার করুন',
    downloadReceipt: 'রসিদ ডাউনলোড',
    done: 'সম্পন্ন',
    scanQrTitle: 'যে কোনো UPI QR স্ক্যান করুন',
    receiveQrTitle: 'QR মাধ্যমে টাকা গ্রহণ করুন',
    copyUpi: 'UPI ID কপি করুন',
    upiCopied: 'UPI ID কপি করা হয়েছে!',

    emergencyFundTitle: 'জরুরী তহবিল',
    lockFund: 'তহবিল লক করুন',
    unlockFund: 'তহবিল আনলক করুন',
    fundLockedNotice: 'জরুরী তহবিল লক করা আছে। সাধারণ পেমেন্টে এটি ব্যবহার করা যাবে না।',
    addMoney: 'টাকা যোগ করুন',
    withdrawMoney: 'জরুরী উত্তোলন',
    targetGoal: 'লক্ষ্য',
    completed: 'সম্পন্ন',
    savingsGoals: 'সঞ্চয় লক্ষ্যমাত্রা',
    createGoal: 'নতুন লক্ষ্য',
    autoSaveRules: 'স্বয়ংক্রিয় সঞ্চয় নিয়ম',
    projectedAnnualSavings: 'বার্ষিক আনুমানিক সঞ্চয়',

    documentVaultTitle: 'সুরক্ষিত ডকুমেন্ট ভল্ট',
    vaultEncryptedBadge: 'সম্পূর্ণ এনক্রিপ্ট করা',
    uploadDocument: 'ডকুমেন্ট আপলোড',
    expiryWarning: 'শীঘ্রই মেয়াদ শেষ হবে',
    viewDocument: 'ডকুমেন্ট দেখুন',
    deleteDocument: 'মুছুন',

    childCareTitle: 'চাইল্ড কেয়ার মোড',
    childCareActive: 'চাইল্ড কেয়ার মোড সক্রিয়',
    childCareDesc: 'শিশুদের সুরক্ষার জন্য পেমেন্ট অবরুদ্ধ এবং ব্যালেন্স গোপন আছে।',
    childCareBlockedNotice: 'পেমেন্ট অবরুদ্ধ: অভিভাবক সুরক্ষা মোড চালু আছে।',
    enableChildCare: 'চাইল্ড কেয়ার চালু করুন',
    exitChildCare: 'চাইল্ড কেয়ার থেকে প্রস্থান করুন',
    parentPinPrompt: 'অভিভাবক পিন দিন',

    aiAssistantTitle: 'FinPocket AI কে জিজ্ঞাসা করুন',
    askFinPocket: 'আর্থিক প্রশ্ন জিজ্ঞাসা করুন...',
    spendingInsight: 'আপনার ব্যয়ের অন্তর্দৃষ্টি',
    dailyTipTitle: 'আজকের আর্থিক পরামর্শ',
    financialHealth: 'আর্থিক স্বাস্থ্য স্কোর',
    healthScoreGood: 'চমৎকার সঞ্চয় ধারাবাহিকতা',

    billsTitle: 'নিয়মিত বিল ও সাবস্ক্রিপশন',
    emiLoanTitle: 'সক্রিয় ঋণ ও ইএমআই',
    dueSoon: 'মেয়াদ সন্নিকটে',
    markAsPaid: 'পরিশোধিত চিহ্নিত করুন',
    paidThisMonth: 'এই মাসে পরিশোধিত',
    remainingObligations: 'অবশিষ্ট দায়',

    securityCenter: 'নিরাপত্তা কেন্দ্র',
    biometricLogin: 'বায়োমেট্রিক লগইন',
    appPin: 'অ্যাপ পিন',
    connectedBanks: 'সংযুক্ত ব্যাংক একাউন্ট',
    connectBank: 'ব্যাংক যোগ করুন',
    activeSessions: 'সক্রিয় ডিভাইস',
    logoutAllDevices: 'সমস্ত ডিভাইস থেকে লগআউট করুন',
    logout: 'লগআউট',
    language: 'ভাষা পরিবর্তন',
    theme: 'অ্যাপ থিম',
    lightMode: 'লাইট মোড',
    darkMode: 'ডার্ক মোড',
    offlineMode: 'অফলাইন মোড',
    onlineMode: 'সার্ভার সংযুক্ত',

    cancel: 'বাতিল',
    confirm: 'নিশ্চিত করুন',
    search: 'লেনদেন, বিল খুঁজুন...',
    filter: 'ফিল্টার',
    all: 'সকল',
    exportCsv: 'স্টেটমেন্ট ডাউনলোড (CSV)',
    loading: 'নিরাপদে প্রক্রিয়াধীন...',
    errorGeneric: 'অনুরোধটি সম্পন্ন করা সম্ভব হয়নি। অনুগ্রহ করে আবার চেষ্টা করুন।',
  },
};
