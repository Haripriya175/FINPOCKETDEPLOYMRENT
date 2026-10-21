import React, { createContext, useContext, useState, useEffect } from 'react';
import {
  BankAccount,
  Transaction,
  SavingsGoal,
  EmergencyFund,
  AutoSaveRule,
  RecurringPayment,
  EMILoan,
  TransactionCategory,
  Budget,
} from '../types';
import { StorageService } from '../services/storage';
import { ApiService } from '../services/api';
import { CryptoService } from '../services/crypto';

interface FinanceContextType {
  bankAccounts: BankAccount[];
  transactions: Transaction[];
  emergencyFund: EmergencyFund;
  savingsGoals: SavingsGoal[];
  autoSaveRules: AutoSaveRule[];
  bills: RecurringPayment[];
  emis: EMILoan[];
  totalAvailableBalance: number;
  totalSavings: number;
  thisMonthSpent: number;
  thisMonthIncome: number;
  thisMonthSaved: number;

  // Actions
  sendPayment: (params: {
    receiver: string;
    amount: number;
    category: TransactionCategory;
    note?: string;
    paymentMethod?: 'UPI' | 'BANK_TRANSFER' | 'CARD' | 'WALLET';
    merchant?: string;
  }) => Promise<{ success: boolean; transaction?: Transaction; message?: string }>;

  connectBank: (bankName: string, accountType: 'SAVINGS' | 'CURRENT' | 'SALARY', initialBal: number, lastFour: string) => void;
  disconnectBank: (id: string) => void;

  depositEmergencyFund: (amount: number, reason?: string) => { success: boolean; message?: string; newBalance?: number };
  withdrawEmergencyFund: (amount: number, reason?: string) => { success: boolean; message?: string; newBalance?: number };
  toggleLockEmergencyFund: (shouldLock: boolean, reason?: string) => void;
  setEmergencyTarget: (target: number) => void;

  createSavingsGoal: (name: string, targetAmount: number, targetDate: string, monthlyContribution: number, category: any) => void;
  contributeToGoal: (goalId: string, amount: number) => void;

  markBillPaid: (billId: string) => void;
  markEmiPaid: (emiId: string) => void;
  exportTransactionsCsv: () => void;

  // Budgets
  budgets: Budget[];
  createBudget: (category: TransactionCategory | 'ALL', limitAmount: number, alertThresholdPercent?: number, period?: 'MONTHLY' | 'WEEKLY' | 'YEARLY') => void;
  updateBudget: (id: string, updates: Partial<Budget>) => void;
  deleteBudget: (id: string) => void;
  getBudgetSpending: (category: TransactionCategory | 'ALL', period?: 'MONTHLY' | 'WEEKLY' | 'YEARLY') => {
    spent: number;
    limit: number;
    remaining: number;
    percentage: number;
    isOverBudget: boolean;
    isWarning: boolean;
  };
}

const FinanceContext = createContext<FinanceContextType | undefined>(undefined);

export const FinanceProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [bankAccounts, setBankAccounts] = useState<BankAccount[]>(() => StorageService.getBankAccounts());
  const [transactions, setTransactions] = useState<Transaction[]>(() => StorageService.getTransactions());
  const [emergencyFund, setEmergencyFund] = useState<EmergencyFund>(() => StorageService.getEmergencyFund());
  const [savingsGoals, setSavingsGoals] = useState<SavingsGoal[]>(() => StorageService.getSavingsGoals());
  const [autoSaveRules, setAutoSaveRules] = useState<AutoSaveRule[]>(() => StorageService.getAutoSaveRules());
  const [bills, setBills] = useState<RecurringPayment[]>(() => StorageService.getBills());
  const [emis, setEmis] = useState<EMILoan[]>(() => StorageService.getEMIs());
  const [budgets, setBudgets] = useState<Budget[]>(() => StorageService.getBudgets());

  // Calculations
  const totalAvailableBalance = bankAccounts
    .filter(a => a.status === 'ACTIVE')
    .reduce((sum, a) => sum + a.availableBalance, 0);

  const goalsTotal = savingsGoals.reduce((sum, g) => sum + g.currentAmount, 0);
  const totalSavings = emergencyFund.currentAmount + goalsTotal;

  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth();

  let thisMonthSpent = 0;
  let thisMonthIncome = 0;

  transactions.forEach(t => {
    const d = new Date(t.timestamp);
    if (d.getFullYear() === currentYear && d.getMonth() === currentMonth && t.status === 'SUCCESSFUL') {
      if (t.type === 'EXPENSE') thisMonthSpent += t.amount;
      if (t.type === 'INCOME') thisMonthIncome += t.amount;
    }
  });

  const thisMonthSaved = Math.max(0, thisMonthIncome - thisMonthSpent);

  const sendPayment = async (params: {
    receiver: string;
    amount: number;
    category: TransactionCategory;
    note?: string;
    paymentMethod?: 'UPI' | 'BANK_TRANSFER' | 'CARD' | 'WALLET';
    merchant?: string;
  }) => {
    const childCare = StorageService.getChildCareSettings();
    if (childCare.enabled && childCare.paymentBlocked) {
      return {
        success: false,
        message: 'Payments are restricted while Child Care Mode is active.',
      };
    }

    if (params.amount <= 0) {
      return { success: false, message: 'Please enter a valid amount greater than 0.' };
    }

    if (params.amount > totalAvailableBalance) {
      return { success: false, message: 'Insufficient balance across your connected bank accounts.' };
    }

    const res = await ApiService.processPayment({
      receiver: params.receiver,
      amount: params.amount,
      category: params.category,
      note: params.note,
      paymentMethod: params.paymentMethod || 'UPI',
      merchant: params.merchant,
    });

    if (res.success && res.data) {
      setTransactions(StorageService.getTransactions());
      setBankAccounts(StorageService.getBankAccounts());
      return { success: true, transaction: res.data };
    }

    return { success: false, message: res.message || 'Payment failed' };
  };

  const connectBank = (bankName: string, accountType: 'SAVINGS' | 'CURRENT' | 'SALARY', initialBal: number, lastFour: string) => {
    const newBank: BankAccount = {
      id: 'bnk_' + Date.now(),
      bankName,
      accountType,
      maskedAccountNumber: '•••• ' + lastFour,
      availableBalance: initialBal,
      isPrimary: bankAccounts.length === 0,
      status: 'ACTIVE',
      lastSynced: new Date().toISOString(),
    };
    const updated = [...bankAccounts, newBank];
    StorageService.setBankAccounts(updated);
    setBankAccounts(updated);
  };

  const disconnectBank = (id: string) => {
    const updated = bankAccounts.filter(b => b.id !== id);
    StorageService.setBankAccounts(updated);
    setBankAccounts(updated);
  };

  const depositEmergencyFund = (amount: number, reason = 'Transfer to Emergency Shield'): { success: boolean; message?: string; newBalance?: number } => {
    if (amount <= 0) return { success: false, message: 'Please enter an amount greater than â‚¹0.' };

    if (bankAccounts.length > 0 && bankAccounts[0].availableBalance < amount) {
      return {
        success: false,
        message: `Insufficient funds in ${bankAccounts[0].bankName} (â‚¹${bankAccounts[0].availableBalance.toLocaleString('en-IN')} available).`
      };
    }

    const updatedFund: EmergencyFund = {
      ...emergencyFund,
      currentAmount: emergencyFund.currentAmount + amount,
      auditLog: [
        {
          id: 'log_' + Date.now(),
          action: 'DEPOSIT',
          amount,
          timestamp: new Date().toISOString(),
          reason,
        },
        ...emergencyFund.auditLog,
      ],
    };
    StorageService.setEmergencyFund(updatedFund);
    setEmergencyFund(updatedFund);

    // Deduct from primary bank balance
    if (bankAccounts.length > 0) {
      const updatedBanks = [...bankAccounts];
      updatedBanks[0].availableBalance = Math.max(0, updatedBanks[0].availableBalance - amount);
      StorageService.setBankAccounts(updatedBanks);
      setBankAccounts(updatedBanks);
    }

    // Record as official Transaction so it is visible in Transactions history & Statements
    const user = StorageService.getUser();
    const txn: Transaction = {
      id: 'tx_dep_' + Date.now(),
      userId: user.userId,
      sender: user.fullName,
      receiver: 'Emergency Shield Reserve',
      amount,
      type: 'EXPENSE',
      category: 'Savings',
      timestamp: new Date().toISOString(),
      status: 'SUCCESSFUL',
      referenceId: 'EMG/DEP/' + Date.now(),
      description: 'Transfer to Emergency Fund',
      paymentMethod: 'UPI',
    };
    const updatedTxns = [txn, ...transactions];
    StorageService.setTransactions(updatedTxns);
    setTransactions(updatedTxns);

    return { success: true, newBalance: updatedFund.currentAmount };
  };

  const withdrawEmergencyFund = (amount: number, reason = 'Emergency withdrawal'): { success: boolean; message?: string; newBalance?: number } => {
    if (emergencyFund.isLocked) {
      return {
        success: false,
        message: 'Emergency Fund is currently LOCKED. Please unlock the fund using your PIN before withdrawing.'
      };
    }
    if (amount <= 0) return { success: false, message: 'Invalid withdrawal amount.' };
    if (amount > emergencyFund.currentAmount) {
      return {
        success: false,
        message: `Withdrawal amount exceeds current emergency fund balance (â‚¹${emergencyFund.currentAmount.toLocaleString('en-IN')}).`
      };
    }

    const updatedFund: EmergencyFund = {
      ...emergencyFund,
      currentAmount: emergencyFund.currentAmount - amount,
      lastWithdrawalReason: reason,
      auditLog: [
        {
          id: 'log_' + Date.now(),
          action: 'WITHDRAW',
          amount,
          timestamp: new Date().toISOString(),
          reason,
        },
        ...emergencyFund.auditLog,
      ],
    };
    StorageService.setEmergencyFund(updatedFund);
    setEmergencyFund(updatedFund);

    // Credit back to primary bank account
    if (bankAccounts.length > 0) {
      const updatedBanks = [...bankAccounts];
      updatedBanks[0].availableBalance += amount;
      StorageService.setBankAccounts(updatedBanks);
      setBankAccounts(updatedBanks);
    }

    // Record as official Transaction (Income refund to bank)
    const currentUser = StorageService.getUser();
    const txn: Transaction = {
      id: 'tx_wdr_' + Date.now(),
      userId: currentUser.userId,
      sender: 'Emergency Shield Reserve',
      receiver: currentUser.fullName,
      amount,
      type: 'INCOME',
      category: 'Savings',
      timestamp: new Date().toISOString(),
      status: 'SUCCESSFUL',
      referenceId: 'EMG/WDR/' + Date.now(),
      description: `Emergency Withdrawal: ${reason}`,
      paymentMethod: 'BANK_TRANSFER',
    };
    const updatedTxns = [txn, ...transactions];
    StorageService.setTransactions(updatedTxns);
    setTransactions(updatedTxns);

    return { success: true, newBalance: updatedFund.currentAmount };
  };

  const toggleLockEmergencyFund = (shouldLock: boolean, reason = '') => {
    const updatedFund: EmergencyFund = {
      ...emergencyFund,
      isLocked: shouldLock,
      lockedAt: shouldLock ? new Date().toISOString() : undefined,
      auditLog: [
        {
          id: 'log_' + Date.now(),
          action: shouldLock ? 'LOCK' : 'UNLOCK',
          timestamp: new Date().toISOString(),
          reason: reason || (shouldLock ? 'User enabled emergency fund lock' : 'User unlocked emergency fund with PIN confirmation'),
        },
        ...emergencyFund.auditLog,
      ],
    };
    StorageService.setEmergencyFund(updatedFund);
    setEmergencyFund(updatedFund);
  };

  const setEmergencyTarget = (target: number) => {
    const updatedFund = { ...emergencyFund, targetAmount: target };
    StorageService.setEmergencyFund(updatedFund);
    setEmergencyFund(updatedFund);
  };

  const createSavingsGoal = (name: string, targetAmount: number, targetDate: string, monthlyContribution: number, category: any) => {
    const newGoal: SavingsGoal = {
      id: 'goal_' + Date.now(),
      userId: StorageService.getUser().userId,
      name,
      targetAmount,
      currentAmount: 0,
      targetDate,
      monthlyContribution,
      category,
      status: 'IN_PROGRESS',
      createdAt: new Date().toISOString(),
    };
    const updated = [newGoal, ...savingsGoals];
    StorageService.setSavingsGoals(updated);
    setSavingsGoals(updated);
  };

  const contributeToGoal = (goalId: string, amount: number) => {
    const updated = savingsGoals.map(g => {
      if (g.id === goalId) {
        const nextAmount = g.currentAmount + amount;
        return {
          ...g,
          currentAmount: nextAmount,
          status: (nextAmount >= g.targetAmount ? 'COMPLETED' : 'IN_PROGRESS') as 'COMPLETED' | 'IN_PROGRESS',
        };
      }
      return g;
    });
    StorageService.setSavingsGoals(updated);
    setSavingsGoals(updated);

    // Deduct from primary bank
    if (bankAccounts.length > 0) {
      const updatedBanks = [...bankAccounts];
      updatedBanks[0].availableBalance = Math.max(0, updatedBanks[0].availableBalance - amount);
      StorageService.setBankAccounts(updatedBanks);
      setBankAccounts(updatedBanks);
    }
  };

  const markBillPaid = (billId: string) => {
    const updated = bills.map(b => {
      if (b.id === billId) {
        return { ...b, isPaidThisMonth: true, lastPaidDate: new Date().toISOString() };
      }
      return b;
    });
    StorageService.setBills(updated);
    setBills(updated);
  };

  const markEmiPaid = (emiId: string) => {
    const updated = emis.map(e => {
      if (e.id === emiId) {
        return {
          ...e,
          paidMonths: e.paidMonths + 1,
          remainingAmount: Math.max(0, e.remainingAmount - e.monthlyEMI),
          isPaidThisMonth: true,
        };
      }
      return e;
    });
    StorageService.setEMIs(updated);
    setEmis(updated);
  };

  const exportTransactionsCsv = () => {
    const headers = ['Transaction ID', 'Date', 'Type', 'Category', 'Amount (INR)', 'Receiver/Sender', 'Status', 'Reference'];
    const rows = transactions.map(t => [
      t.id,
      new Date(t.timestamp).toLocaleDateString('en-IN'),
      t.type,
      t.category,
      t.amount,
      `"${t.receiver}"`,
      t.status,
      t.referenceId,
    ]);
    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map(e => e.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `FinPocket_Statement_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const getBudgetSpending = (category: TransactionCategory | 'ALL', period: 'MONTHLY' | 'WEEKLY' | 'YEARLY' = 'MONTHLY') => {
    const curDate = new Date();
    const curYear = curDate.getFullYear();
    const curMonth = curDate.getMonth();

    let spent = 0;
    transactions.forEach(t => {
      const d = new Date(t.timestamp);
      if (t.type === 'EXPENSE' && t.status === 'SUCCESSFUL' && d.getFullYear() === curYear && d.getMonth() === curMonth) {
        if (category === 'ALL' || t.category === category) {
          spent += t.amount;
        }
      }
    });

    const budget = budgets.find(b => b.category === category && b.period === period);
    const limit = budget ? budget.limitAmount : 0;
    const threshold = budget ? budget.alertThresholdPercent : 80;
    const percentage = limit > 0 ? (spent / limit) * 100 : 0;
    const remaining = Math.max(0, limit - spent);
    const isOverBudget = limit > 0 && spent > limit;
    const isWarning = limit > 0 && percentage >= threshold && !isOverBudget;

    return { spent, limit, remaining, percentage, isOverBudget, isWarning };
  };

  const createBudget = (
    category: TransactionCategory | 'ALL',
    limitAmount: number,
    alertThresholdPercent = 80,
    period: 'MONTHLY' | 'WEEKLY' | 'YEARLY' = 'MONTHLY'
  ) => {
    const existingIndex = budgets.findIndex(b => b.category === category && b.period === period);
    let updated: Budget[];
    if (existingIndex >= 0) {
      updated = [...budgets];
      updated[existingIndex] = {
        ...updated[existingIndex],
        limitAmount,
        alertThresholdPercent,
        updatedAt: new Date().toISOString(),
      };
    } else {
      const newBudget: Budget = {
        id: 'bgt_' + Date.now().toString(36),
        userId: 'usr_fp_882910',
        category,
        limitAmount,
        period,
        alertThresholdPercent,
        notificationsEnabled: true,
        createdAt: new Date().toISOString(),
      };
      updated = [newBudget, ...budgets];
    }
    StorageService.setBudgets(updated);
    setBudgets(updated);
  };

  const updateBudget = (id: string, updates: Partial<Budget>) => {
    const updated = budgets.map(b => (b.id === id ? { ...b, ...updates, updatedAt: new Date().toISOString() } : b));
    StorageService.setBudgets(updated);
    setBudgets(updated);
  };

  const deleteBudget = (id: string) => {
    const updated = budgets.filter(b => b.id !== id);
    StorageService.setBudgets(updated);
    setBudgets(updated);
  };

  return (
    <FinanceContext.Provider
      value={{
        bankAccounts,
        transactions,
        emergencyFund,
        savingsGoals,
        autoSaveRules,
        bills,
        emis,
        totalAvailableBalance,
        totalSavings,
        thisMonthSpent,
        thisMonthIncome,
        thisMonthSaved,
        sendPayment,
        connectBank,
        disconnectBank,
        depositEmergencyFund,
        withdrawEmergencyFund,
        toggleLockEmergencyFund,
        setEmergencyTarget,
        createSavingsGoal,
        contributeToGoal,
        markBillPaid,
        markEmiPaid,
        exportTransactionsCsv,
        budgets,
        createBudget,
        updateBudget,
        deleteBudget,
        getBudgetSpending,
      }}
    >
      {children}
    </FinanceContext.Provider>
  );
};

export const useFinance = () => {
  const context = useContext(FinanceContext);
  if (!context) throw new Error('useFinance must be used within FinanceProvider');
  return context;
};
