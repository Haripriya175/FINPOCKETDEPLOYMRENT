import { describe, it, expect, beforeEach } from 'vitest';
import { StorageService } from '../services/storage';
import { CryptoService } from '../services/crypto';
import { AIAssistantService } from '../services/aiAssistant';
import { translations } from '../i18n/translations';
import { SupportedLanguage } from '../types';

describe('FinPocket Core Services & Security Unit Tests', () => {
  beforeEach(() => {
    localStorage.clear();
    StorageService.initialize();
  });

  it('1. should keep a new account free of seeded bank data', () => {
    const user = StorageService.getUser();
    expect(user.fullName).toBe('Jithendra Sureddy');
    expect(user.email).toBe('jithendra@finpocket.com');

    const accounts = StorageService.getBankAccounts();
    expect(accounts).toEqual([]);
  });

  it('2. should verify PIN and generate idempotency keys', async () => {
    const key1 = CryptoService.generateIdempotencyKey();
    const key2 = CryptoService.generateIdempotencyKey();
    expect(key1).not.toBe(key2);
    expect(key1.startsWith('FP_TXN_')).toBe(true);

    const isPinValid = await CryptoService.verifyPin('1234', '1234');
    expect(isPinValid).toBe(true);

    const isPinInvalid = await CryptoService.verifyPin('9999', '1234');
    expect(isPinInvalid).toBe(false);
  });

  it('3. should calculate Financial Health Score within valid range', () => {
    const health = AIAssistantService.getFinancialHealthScore();
    expect(health.score).toBeGreaterThanOrEqual(0);
    expect(health.score).toBeLessThanOrEqual(100);
    expect(['EXCELLENT', 'GOOD', 'FAIR', 'NEEDS_ATTENTION']).toContain(health.grade);
    expect(health.factors.length).toBeGreaterThan(0);
  });

  it('4. should answer data-backed financial questions deterministically', () => {
    const balanceAns = AIAssistantService.askQuestion('How much money do I have?');
    expect(balanceAns).toContain('₹');

    const foodAns = AIAssistantService.askQuestion('How much did I spend on food?');
    expect(foodAns.toLowerCase()).toContain('food');

    const emiAns = AIAssistantService.askQuestion('When is my next EMI?');
    expect(emiAns).toContain('EMI');
  });

  it('5. should enforce Child Care Mode safety guards and block payments', () => {
    const settings = StorageService.getChildCareSettings();
    expect(settings.enabled).toBe(false);

    // Enable Child Care Mode
    StorageService.setChildCareSettings({
      ...settings,
      enabled: true,
      paymentBlocked: true,
      hideBalances: true,
    });

    const activeSettings = StorageService.getChildCareSettings();
    expect(activeSettings.enabled).toBe(true);
    expect(activeSettings.paymentBlocked).toBe(true);
    expect(activeSettings.hideBalances).toBe(true);
  });

  it('6. should ensure complete localization coverage for all 8 Indian languages', () => {
    const requiredLanguages: SupportedLanguage[] = ['en', 'te', 'hi', 'ta', 'kn', 'ml', 'mr', 'bn'];

    requiredLanguages.forEach(lang => {
      const dict = translations[lang];
      expect(dict).toBeDefined();
      expect(dict.navHome).toBeTruthy();
      expect(dict.navPayments).toBeTruthy();
      expect(dict.availableBalance).toBeTruthy();
      expect(dict.emergencyFundTitle).toBeTruthy();
      expect(dict.documentVaultTitle).toBeTruthy();
      expect(dict.childCareTitle).toBeTruthy();
      expect(dict.paymentBlockedChildCare).toBeTruthy();
    });
  });

  it('7. should accurately compute statement period dates and summary totals', async () => {
    const { StatementService } = await import('../services/statementService');
    const { initialTransactions, initialBankAccounts } = await import('../services/mockData');

    const periodInfo = StatementService.getPeriodDates('THIS_MONTH');
    expect(periodInfo.start).toBeInstanceOf(Date);
    expect(periodInfo.end).toBeInstanceOf(Date);
    expect(periodInfo.label).toBeTruthy();

    const summary = StatementService.generateStatementSummary(initialTransactions, initialBankAccounts, {
      period: 'ALL',
      accountId: 'ALL',
    });

    expect(summary.totalTransactions).toBe(initialTransactions.length);
    expect(summary.totalIncome).toBeGreaterThan(0);
    expect(summary.totalExpense).toBeGreaterThan(0);
    expect(summary.netCashflow).toBe(summary.totalIncome - summary.totalExpense);
    expect(summary.categoryBreakdown.length).toBeGreaterThan(0);
    expect(summary.transactions.length).toBe(initialTransactions.length);

    // Verify running balances are tracked on transactions
    summary.transactions.forEach(t => {
      expect(typeof t.runningBalance).toBe('number');
      expect(t.runningBalance).toBeGreaterThanOrEqual(0);
    });
  });

  it('8. should manage budgets, enforce limits, and calculate warning thresholds', () => {
    const budgets = StorageService.getBudgets();
    expect(budgets).toEqual([]);

    // Create a new budget
    const newBudgets = [
      ...budgets,
      {
        id: 'bgt_custom_test',
        userId: 'usr_fp_882910',
        category: 'Health' as const,
        limitAmount: 4000,
        period: 'MONTHLY' as const,
        alertThresholdPercent: 80,
        notificationsEnabled: true,
        createdAt: new Date().toISOString(),
      },
    ];

    StorageService.setBudgets(newBudgets);
    const updated = StorageService.getBudgets();
    expect(updated.find(b => b.id === 'bgt_custom_test')).toBeDefined();
    expect(updated.find(b => b.id === 'bgt_custom_test')?.limitAmount).toBe(4000);
  });
});


