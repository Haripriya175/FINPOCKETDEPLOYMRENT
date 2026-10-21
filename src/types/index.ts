export type SupportedLanguage = 'en' | 'te' | 'hi' | 'ta' | 'kn' | 'ml' | 'mr' | 'bn';

export type Role = 'USER' | 'ADMIN';

export interface User {
    userId: string;
    fullName: string;
    email: string;
    phone?: string;
    role: Role;
    avatarUrl?: string;
    preferredLanguage: SupportedLanguage;
    biometricsEnabled: boolean;
    appPinEnabled: boolean;
    pinHash?: string;
    createdAt: string;
}

export type TransactionType = 'INCOME' | 'EXPENSE' | 'TRANSFER';

export type TransactionStatus = 'PROCESSING' | 'SUCCESSFUL' | 'FAILED' | 'CANCELLED' | 'REFUNDED';

export type TransactionCategory =
    | 'Food'
    | 'Shopping'
    | 'Travel'
    | 'Bills'
    | 'Education'
    | 'Entertainment'
    | 'Health'
    | 'Rent'
    | 'EMI'
    | 'Investment'
    | 'Savings'
    | 'Salary'
    | 'Other';

export interface Transaction {
    id: string;
    userId: string;
    sender: string;
    receiver: string;
    amount: number;
    type: TransactionType;
    category: TransactionCategory;
    status: TransactionStatus;
    timestamp: string;
    referenceId: string;
    description: string;
    paymentMethod: 'UPI' | 'BANK_TRANSFER' | 'CARD' | 'WALLET';
    merchant?: string;
}

export interface BankAccount {
    id: string;
    bankName: string;
    accountType: 'SAVINGS' | 'CURRENT' | 'SALARY';
    maskedAccountNumber: string;
    availableBalance: number;
    isPrimary: boolean;
    status: 'ACTIVE' | 'DISCONNECTED';
    lastSynced: string;
    logoUrl?: string;
    ifscCode?: string;
}

export interface SavingsGoal {
    id: string;
    userId: string;
    name: string;
    targetAmount: number;
    currentAmount: number;
    targetDate: string;
    monthlyContribution: number;
    category: 'TECH' | 'VEHICLE' | 'EDUCATION' | 'VACATION' | 'WEDDING' | 'OTHER';
    status: 'IN_PROGRESS' | 'COMPLETED' | 'PAUSED';
    createdAt: string;
}

export interface EmergencyFund {
    id: string;
    userId: string;
    targetAmount: number;
    currentAmount: number;
    isLocked: boolean;
    lockedAt?: string;
    lastWithdrawalReason?: string;
    monthlyContribution: number;
    autoSaveEnabled: boolean;
    auditLog: Array<{
        id: string;
        action: 'DEPOSIT' | 'WITHDRAW' | 'LOCK' | 'UNLOCK';
        amount?: number;
        timestamp: string;
        reason?: string;
    }>;
}

export interface AutoSaveRule {
    id: string;
    title: string;
    amount: number;
    frequency: 'DAILY' | 'WEEKLY' | 'MONTHLY' | 'PERCENT_INCOME';
    percentage?: number;
    destination: 'SAVINGS_GOAL' | 'EMERGENCY_FUND';
    targetGoalId?: string;
    isActive: boolean;
}

export interface DocumentItem {
    id: string;
    userId: string;
    name: string;
    documentType: 'Aadhaar' | 'PAN Card' | 'Driving Licence' | 'Passport' | 'Voter ID' | 'Salary Slip' | 'ITC Document' | 'Insurance' | 'Education' | 'Bank' | 'Other';
    maskedNumber?: string;
    issueDate?: string;
    expiryDate?: string;
    fileType: 'image/png' | 'image/jpeg' | 'application/pdf';
    fileSize: number;
    uploadDate: string;
    isEncrypted: boolean;
    mockFilePreview?: string;
}

export interface RecurringPayment {
    id: string;
    userId: string;
    name: string;
    amount: number;
    dueDate: string;
    category: 'Electricity' | 'Internet' | 'Mobile Recharge' | 'Rent' | 'Insurance' | 'Subscription' | 'Education' | 'EMI';
    recurrence: 'MONTHLY' | 'QUARTERLY' | 'YEARLY';
    isPaidThisMonth: boolean;
    lastPaidDate?: string;
    autoDebit: boolean;
    reminderDaysBefore: number;
}

export interface EMILoan {
    id: string;
    loanName: string;
    totalAmount: number;
    monthlyEMI: number;
    totalTenureMonths: number;
    paidMonths: number;
    remainingAmount: number;
    interestRate: number;
    nextDueDate: string;
    isPaidThisMonth: boolean;
}

export interface Budget {
    id: string;
    userId: string;
    category: TransactionCategory | 'ALL';
    limitAmount: number;
    period: 'MONTHLY' | 'WEEKLY' | 'YEARLY';
    alertThresholdPercent: number; // e.g. 80
    notificationsEnabled: boolean;
    createdAt: string;
    updatedAt?: string;
}

export interface ChildCareSettings {
    enabled: boolean;
    paymentBlocked: boolean;
    hideBalances: boolean;
    hideTransactionHistory: boolean;
    hideBankDetails: boolean;
    spendingLimit: number;
    parentPinHash: string;
    activatedAt?: string;
}

export interface FinancialHealthScore {
    score: number; // 0 - 100
    grade: 'EXCELLENT' | 'GOOD' | 'FAIR' | 'NEEDS_ATTENTION';
    factors: Array<{
        title: string;
        status: 'POSITIVE' | 'WARNING' | 'NEUTRAL';
        description: string;
    }>;
}

export interface UserSession {
    id: string;
    deviceName: string;
    deviceType: 'MOBILE' | 'DESKTOP' | 'TABLET';
    location: string;
    lastActive: string;
    isCurrent: boolean;
}
