import { StorageService } from './storage';
import { Transaction, SavingsGoal, EmergencyFund, RecurringPayment, BankAccount, DocumentItem, User } from '../types';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '/api/v1';

interface ApiResponse<T> {
  success: boolean;
  data?: T;
  message?: string;
}

export const ApiService = {
  isOnline: false,

  async request<T>(path: string, body?: unknown): Promise<ApiResponse<T>> {
    try {
      const response = await fetch(`${API_BASE_URL}${path}`, {
        method: body === undefined ? 'GET' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) return { success: false, message: data.error || data.message || 'Request failed.' };
      return { success: true, data, message: data.message };
    } catch {
      return { success: false, message: 'FinPocket could not reach the server. Please try again.' };
    }
  },

  async sendRegistrationOtp(email: string, captchaToken: string) {
    return this.request('/auth/email/send-otp', { email, captchaToken });
  },

  async verifyRegistrationOtp(email: string, otp: string) {
    return this.request('/auth/email/verify-otp', { email, otp });
  },

  async registerAccount(name: string, email: string, phone: string, password: string, captchaToken: string) {
    const result = await this.request<any>('/auth/register', { name, email, phone, password, captchaToken });
    if (result.success && result.data?.token && result.data?.user) {
      const remote = result.data.user;
      const user: User = {
        userId: remote.id,
        fullName: remote.name,
        email: remote.email,
        phone: remote.phone,
        role: 'USER',
        preferredLanguage: remote.preferredLanguage || 'en',
        biometricsEnabled: !!remote.biometricsEnabled,
        appPinEnabled: !!remote.appPinEnabled,
        createdAt: remote.createdAt || new Date().toISOString(),
      };
      StorageService.setUser(user);
      StorageService.setToken(result.data.token);
      return { success: true, user };
    }
    return { success: false, message: result.message };
  },

  async checkServerHealth(): Promise<boolean> {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 1500);
      const res = await fetch('/health/live', { signal: controller.signal });
      clearTimeout(timeoutId);
      this.isOnline = res.ok;
      return res.ok;
    } catch {
      this.isOnline = false;
      return false;
    }
  },

  async login(email: string, password: string): Promise<ApiResponse<any>> {
    try {
      const res = await fetch(`${API_BASE_URL}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password, deviceName: 'FinPocket Web' }),
      });
      const data = await res.json();
      if (!res.ok || !data.token || !data.user) return { success: false, message: data.error || 'Invalid email or password.' };
      const remote = data.user;
      const user: User = {
        userId: remote.id,
        fullName: remote.name,
        email: remote.email,
        phone: remote.phone,
        role: 'USER',
        preferredLanguage: remote.preferredLanguage || 'en',
        biometricsEnabled: !!remote.biometricsEnabled,
        appPinEnabled: !!remote.appPinEnabled,
        createdAt: remote.createdAt || new Date().toISOString(),
      };
      StorageService.setUser(user);
      StorageService.setToken(data.token);
      return { success: true, data: { user, token: data.token } };
    } catch {
      return { success: false, message: 'FinPocket could not reach the server. Please try again.' };
    }
  },

  async metaLogin(accessToken?: string): Promise<ApiResponse<any>> {
    // Meta SSO login should use a real access token provided by the client SDK.
    // No mock tokens or hardcoded user details are used for security reasons.
    // If an access token is not supplied, we throw an error to enforce proper usage.
    if (!accessToken) {
      throw new Error('Meta access token is required for authentication.');
    }
    try {
      if (this.isOnline) {
        const res = await fetch(`http://localhost:3001/api/v1/auth/meta`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ accessToken }),
        });
        const data = await res.json();
        if (res.ok && data.token) {
          StorageService.setToken(data.token);
          // Persist returned user if provided
          if (data.user) {
            StorageService.setUser(data.user);
          }
          return { success: true, data };
        }
        // If server responded but without token, treat as failure
        return { success: false, message: data.message || 'Meta authentication failed.' };
      }
    } catch (e) {
      console.warn('Meta login failed due to network error:', e);
      // Propagate failure when offline; do not create mock sessions.
      return { success: false, message: 'Unable to reach authentication server.' };
    }
    // Fallback when offline without proper credentials is not allowed.
    return { success: false, message: 'Meta login unavailable offline without a valid token.' };
  },

  async googleLogin(idToken?: string): Promise<ApiResponse<any>> {
    if (!idToken) return { success: false, message: 'A valid Google identity token is required.' };
    const result = await this.request<any>('/auth/google', { idToken });
    if (!result.success || !result.data?.token || !result.data?.user) return result;
    const remote = result.data.user;
    const user: User = {
      userId: remote.id, fullName: remote.name, email: remote.email, phone: remote.phone,
      role: 'USER', preferredLanguage: remote.preferredLanguage || 'en',
      biometricsEnabled: !!remote.biometricsEnabled, appPinEnabled: !!remote.appPinEnabled,
      createdAt: remote.createdAt || new Date().toISOString(),
    };
    StorageService.setUser(user);
    StorageService.setToken(result.data.token);
    return { success: true, data: { user, token: result.data.token } };
  },

  async fetchDashboardData(): Promise<{
    availableBalance: number;
    totalSavings: number;
    emergencyFund: EmergencyFund;
    monthlySpent: number;
    monthlyIncome: number;
    transactions: Transaction[];
  }> {
    const transactions = StorageService.getTransactions();
    const bankAccounts = StorageService.getBankAccounts();
    const emergencyFund = StorageService.getEmergencyFund();
    const goals = StorageService.getSavingsGoals();

    const availableBalance = bankAccounts
      .filter(a => a.status === 'ACTIVE')
      .reduce((sum, a) => sum + a.availableBalance, 0);

    const goalsTotal = goals.reduce((sum, g) => sum + g.currentAmount, 0);
    const totalSavings = emergencyFund.currentAmount + goalsTotal;

    // Calculate current month's expenses & income
    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth();

    let monthlySpent = 0;
    let monthlyIncome = 0;

    transactions.forEach(t => {
      const d = new Date(t.timestamp);
      if (d.getFullYear() === currentYear && d.getMonth() === currentMonth && t.status === 'SUCCESSFUL') {
        if (t.type === 'EXPENSE') monthlySpent += t.amount;
        if (t.type === 'INCOME') monthlyIncome += t.amount;
      }
    });

    return {
      availableBalance,
      totalSavings,
      emergencyFund,
      monthlySpent,
      monthlyIncome,
      transactions: transactions.slice(0, 5),
    };
  },

  async processPayment(params: {
    receiver: string;
    amount: number;
    category: any;
    note?: string;
    paymentMethod: 'UPI' | 'BANK_TRANSFER' | 'CARD' | 'WALLET';
    merchant?: string;
  }): Promise<ApiResponse<Transaction>> {
    // Check Child Care mode
    const childCare = StorageService.getChildCareSettings();
    if (childCare.enabled && childCare.paymentBlocked) {
      return {
        success: false,
        message: 'Payments are restricted while Child Care Mode is active.',
      };
    }

    const newTxn: Transaction = {
      id: 'FP' + Math.floor(10000000 + Math.random() * 90000000),
      userId: StorageService.getUser().userId,
      sender: StorageService.getUser().fullName,
      receiver: params.receiver,
      amount: params.amount,
      type: 'EXPENSE',
      category: params.category || 'Other',
      status: 'SUCCESSFUL',
      timestamp: new Date().toISOString(),
      referenceId: 'UPI/' + Math.floor(100000000000 + Math.random() * 900000000000),
      description: params.note || `Payment to ${params.receiver}`,
      paymentMethod: params.paymentMethod,
      merchant: params.merchant,
    };

    // Update transactions & primary bank account balance
    const txns = StorageService.getTransactions();
    StorageService.setTransactions([newTxn, ...txns]);

    const accounts = StorageService.getBankAccounts();
    if (accounts.length > 0) {
      accounts[0].availableBalance = Math.max(0, accounts[0].availableBalance - params.amount);
      StorageService.setBankAccounts([...accounts]);
    }

    return { success: true, data: newTxn };
  },
};
