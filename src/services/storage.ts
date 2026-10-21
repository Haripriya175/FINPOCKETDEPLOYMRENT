import { initialUser } from './mockData';
import {
  User,
  BankAccount,
  Transaction,
  EmergencyFund,
  SavingsGoal,
  AutoSaveRule,
  RecurringPayment,
  EMILoan,
  DocumentItem,
  ChildCareSettings,
  UserSession,
  Budget,
} from '../types';

const STORAGE_KEYS = {
  USER: 'finpocket_user',
  TOKEN: 'finpocket_token',
  ACCOUNTS: 'finpocket_bank_accounts',
  TRANSACTIONS: 'finpocket_transactions',
  EMERGENCY_FUND: 'finpocket_emergency_fund',
  SAVINGS_GOALS: 'finpocket_savings_goals',
  AUTOSAVE_RULES: 'finpocket_autosave_rules',
  BILLS: 'finpocket_recurring_bills',
  EMIS: 'finpocket_emi_loans',
  DOCUMENTS: 'finpocket_documents',
  BUDGETS: 'finpocket_budgets',
  CHILD_CARE: 'finpocket_child_care',
  SESSIONS: 'finpocket_sessions',
  THEME: 'finpocket_theme',
  LANG: 'finpocket_language',
};

const defaultChildCareSettings: ChildCareSettings = {
  enabled: false,
  paymentBlocked: true,
  hideBalances: true,
  hideTransactionHistory: true,
  hideBankDetails: true,
  spendingLimit: 0,
  parentPinHash: '1234',
};

const privateDataKeys = new Set([
  STORAGE_KEYS.ACCOUNTS, STORAGE_KEYS.TRANSACTIONS, STORAGE_KEYS.EMERGENCY_FUND,
  STORAGE_KEYS.SAVINGS_GOALS, STORAGE_KEYS.AUTOSAVE_RULES, STORAGE_KEYS.BILLS,
  STORAGE_KEYS.EMIS, STORAGE_KEYS.DOCUMENTS, STORAGE_KEYS.BUDGETS, STORAGE_KEYS.CHILD_CARE,
]);

function storageKey(key: string): string {
  if (!privateDataKeys.has(key)) return key;
  try {
    const rawUser = localStorage.getItem(STORAGE_KEYS.USER);
    const userId = rawUser ? (JSON.parse(rawUser) as User).userId : 'guest';
    return `${key}:${userId || 'guest'}`;
  } catch {
    return `${key}:guest`;
  }
}

export const StorageService = {
  initialize() {
    // New accounts start empty. Financial data is stored under an account-specific key.
    // Clear the legacy shared demo identity so it cannot sign a visitor in automatically.
    const oldUser = localStorage.getItem(STORAGE_KEYS.USER);
    const oldToken = localStorage.getItem(STORAGE_KEYS.TOKEN);
    const hasServerJwtShape = !!oldToken && oldToken.split('.').length === 3;
    if (oldToken && !hasServerJwtShape || oldUser?.includes('usr_fp_')) {
      localStorage.removeItem(STORAGE_KEYS.TOKEN);
      localStorage.removeItem(STORAGE_KEYS.USER);
    }
  },

  getUser(): User {
    const raw = localStorage.getItem(STORAGE_KEYS.USER);
    return raw ? JSON.parse(raw) : initialUser;
  },
  setUser(user: User) {
    localStorage.setItem(STORAGE_KEYS.USER, JSON.stringify(user));
  },

  getToken(): string | null {
    return localStorage.getItem(STORAGE_KEYS.TOKEN);
  },
  setToken(token: string) {
    localStorage.setItem(STORAGE_KEYS.TOKEN, token);
  },
  clearAuth() {
    localStorage.removeItem(STORAGE_KEYS.TOKEN);
    localStorage.removeItem(STORAGE_KEYS.USER);
  },

  getBankAccounts(): BankAccount[] {
    const raw = localStorage.getItem(storageKey(STORAGE_KEYS.ACCOUNTS));
    return raw ? JSON.parse(raw) : [];
  },
  setBankAccounts(accounts: BankAccount[]) {
    localStorage.setItem(storageKey(STORAGE_KEYS.ACCOUNTS), JSON.stringify(accounts));
  },

  getTransactions(): Transaction[] {
    const raw = localStorage.getItem(storageKey(STORAGE_KEYS.TRANSACTIONS));
    return raw ? JSON.parse(raw) : [];
  },
  setTransactions(transactions: Transaction[]) {
    localStorage.setItem(storageKey(STORAGE_KEYS.TRANSACTIONS), JSON.stringify(transactions));
  },

  getEmergencyFund(): EmergencyFund {
    const raw = localStorage.getItem(storageKey(STORAGE_KEYS.EMERGENCY_FUND));
    return raw ? JSON.parse(raw) : { id: `emf_${StorageService.getUser().userId}`, userId: StorageService.getUser().userId, targetAmount: 100000, currentAmount: 0, isLocked: true, monthlyContribution: 0, autoSaveEnabled: false, auditLog: [] };
  },
  setEmergencyFund(fund: EmergencyFund) {
    localStorage.setItem(storageKey(STORAGE_KEYS.EMERGENCY_FUND), JSON.stringify(fund));
  },

  getSavingsGoals(): SavingsGoal[] {
    const raw = localStorage.getItem(storageKey(STORAGE_KEYS.SAVINGS_GOALS));
    return raw ? JSON.parse(raw) : [];
  },
  setSavingsGoals(goals: SavingsGoal[]) {
    localStorage.setItem(storageKey(STORAGE_KEYS.SAVINGS_GOALS), JSON.stringify(goals));
  },

  getAutoSaveRules(): AutoSaveRule[] {
    const raw = localStorage.getItem(storageKey(STORAGE_KEYS.AUTOSAVE_RULES));
    return raw ? JSON.parse(raw) : [];
  },
  setAutoSaveRules(rules: AutoSaveRule[]) {
    localStorage.setItem(storageKey(STORAGE_KEYS.AUTOSAVE_RULES), JSON.stringify(rules));
  },

  getBills(): RecurringPayment[] {
    const raw = localStorage.getItem(storageKey(STORAGE_KEYS.BILLS));
    return raw ? JSON.parse(raw) : [];
  },
  setBills(bills: RecurringPayment[]) {
    localStorage.setItem(storageKey(STORAGE_KEYS.BILLS), JSON.stringify(bills));
  },

  getEMIs(): EMILoan[] {
    const raw = localStorage.getItem(storageKey(STORAGE_KEYS.EMIS));
    return raw ? JSON.parse(raw) : [];
  },
  setEMIs(emis: EMILoan[]) {
    localStorage.setItem(storageKey(STORAGE_KEYS.EMIS), JSON.stringify(emis));
  },

  getBudgets(): Budget[] {
    const raw = localStorage.getItem(storageKey(STORAGE_KEYS.BUDGETS));
    return raw ? JSON.parse(raw) : [];
  },
  setBudgets(budgets: Budget[]) {
    localStorage.setItem(storageKey(STORAGE_KEYS.BUDGETS), JSON.stringify(budgets));
  },

  getDocuments(): DocumentItem[] {
    const raw = localStorage.getItem(storageKey(STORAGE_KEYS.DOCUMENTS));
    return raw ? JSON.parse(raw) : [];
  },
  setDocuments(docs: DocumentItem[]) {
    localStorage.setItem(storageKey(STORAGE_KEYS.DOCUMENTS), JSON.stringify(docs));
  },

  getChildCareSettings(): ChildCareSettings {
    const raw = localStorage.getItem(storageKey(STORAGE_KEYS.CHILD_CARE));
    return raw ? JSON.parse(raw) : defaultChildCareSettings;
  },
  setChildCareSettings(settings: ChildCareSettings) {
    localStorage.setItem(storageKey(STORAGE_KEYS.CHILD_CARE), JSON.stringify(settings));
  },

  getSessions(): UserSession[] {
    const raw = localStorage.getItem(STORAGE_KEYS.SESSIONS);
    return raw ? JSON.parse(raw) : [];
  },
  setSessions(sessions: UserSession[]) {
    localStorage.setItem(STORAGE_KEYS.SESSIONS, JSON.stringify(sessions));
  },
};
