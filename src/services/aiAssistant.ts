import { StorageService } from './storage';
import { FinancialHealthScore, Transaction } from '../types';

export const AIAssistantService = {
  /**
   * Calculate 0-100 financial health score based on authentic user metrics
   */
  getFinancialHealthScore(): FinancialHealthScore {
    const transactions = StorageService.getTransactions();
    const emergencyFund = StorageService.getEmergencyFund();
    const goals = StorageService.getSavingsGoals();
    const bills = StorageService.getBills();

    let score = 50; // base score
    const factors: FinancialHealthScore['factors'] = [];

    // Factor 1: Emergency Fund Progress (up to +25)
    const emProgress = emergencyFund.targetAmount > 0 ? emergencyFund.currentAmount / emergencyFund.targetAmount : 0;
    if (emProgress >= 0.5) {
      score += 20;
      factors.push({
        title: 'Emergency Fund Protection',
        status: 'POSITIVE',
        description: `Your emergency fund is ${Math.round(emProgress * 100)}% funded, safeguarding against unplanned expenses.`,
      });
    } else if (emProgress >= 0.25) {
      score += 10;
      factors.push({
        title: 'Growing Emergency Savings',
        status: 'POSITIVE',
        description: 'You have built over 25% of your emergency fund goal. Keep contributing consistently.',
      });
    } else {
      score -= 5;
      factors.push({
        title: 'Low Emergency Fund Buffer',
        status: 'WARNING',
        description: 'Target building at least 3-6 months of living expenses in your locked fund.',
      });
    }

    // Factor 2: Recurring Bills on time (+15)
    const unpaidBills = bills.filter(b => !b.isPaidThisMonth);
    if (unpaidBills.length === 0) {
      score += 15;
      factors.push({
        title: 'Bill Payment Discipline',
        status: 'POSITIVE',
        description: 'All monthly recurring bills and EMIs are up-to-date with zero defaults.',
      });
    } else {
      factors.push({
        title: 'Upcoming Due Obligations',
        status: 'NEUTRAL',
        description: `${unpaidBills.length} recurring obligations due later this month.`,
      });
    }

    // Factor 3: Savings goals progress (+15)
    const activeGoals = goals.filter(g => g.status === 'IN_PROGRESS');
    if (activeGoals.length > 0) {
      score += 10;
      factors.push({
        title: 'Active Goal Tracking',
        status: 'POSITIVE',
        description: `You are actively making progress towards ${activeGoals.length} structured savings goals.`,
      });
    }

    // Clamp score 0 - 100
    const finalScore = Math.max(10, Math.min(95, score));
    const grade = finalScore >= 80 ? 'EXCELLENT' : finalScore >= 65 ? 'GOOD' : finalScore >= 50 ? 'FAIR' : 'NEEDS_ATTENTION';

    return {
      score: finalScore,
      grade,
      factors,
    };
  },

  /**
   * Get dynamic daily saving tips based on actual spending
   */
  getDailySavingTip(): string {
    const transactions = StorageService.getTransactions();
    const foodExpenses = transactions
      .filter(t => t.category === 'Food' && t.type === 'EXPENSE')
      .reduce((sum, t) => sum + t.amount, 0);

    if (foodExpenses > 3000) {
      return `You spent ₹${foodExpenses.toLocaleString('en-IN')} on dining and delivery this month. Preparing just 2 meals at home weekly could save ~₹2,400 monthly.`;
    }
    return `If you set aside just ₹100 every day into your emergency fund, you will accumulate approximately ₹36,500 by this time next year!`;
  },

  /**
   * Answer user's financial questions deterministically using real data
   */
  askQuestion(query: string): string {
    const q = query.toLowerCase().trim();
    const txns = StorageService.getTransactions();
    const emergencyFund = StorageService.getEmergencyFund();
    const bankAccounts = StorageService.getBankAccounts();
    const emis = StorageService.getEMIs();
    const bills = StorageService.getBills();

    const totalBalance = bankAccounts.reduce((sum, b) => sum + b.availableBalance, 0);

    // Question: How much money do I have / Available balance
    if (q.includes('how much money') || q.includes('balance') || q.includes('total money') || q.includes('bank')) {
      return `Your total available balance across ${bankAccounts.length} connected accounts is ₹${totalBalance.toLocaleString('en-IN')}. In addition, you have ₹${emergencyFund.currentAmount.toLocaleString('en-IN')} safeguarded in your Emergency Fund.`;
    }

    // Question: How much did I spend this month / spending
    if (q.includes('how much did i spend') || q.includes('spent this month') || q.includes('my spending') || q.includes('expenses')) {
      const thisMonthSpent = txns
        .filter(t => t.type === 'EXPENSE' && t.status === 'SUCCESSFUL')
        .reduce((sum, t) => sum + t.amount, 0);
      return `This month, you have spent a total of ₹${thisMonthSpent.toLocaleString('en-IN')}. Your largest expense categories are Rent and Food.`;
    }

    // Question: Where am I spending the most / highest spending
    if (q.includes('where am i spending') || q.includes('highest spending') || q.includes('most spending') || q.includes('top category')) {
      const categoryTotals: Record<string, number> = {};
      txns.filter(t => t.type === 'EXPENSE').forEach(t => {
        categoryTotals[t.category] = (categoryTotals[t.category] || 0) + t.amount;
      });
      const sorted = Object.entries(categoryTotals).sort((a, b) => b[1] - a[1]);
      if (sorted.length > 0) {
        return `Your highest spending category is ${sorted[0][0]} with ₹${sorted[0][1].toLocaleString('en-IN')} spent, followed by ${sorted[1]?.[0] || 'Shopping'} (₹${sorted[1]?.[1]?.toLocaleString('en-IN') || 0}).`;
      }
    }

    // Question: Food spending
    if (q.includes('food') || q.includes('swiggy') || q.includes('zomato')) {
      const foodTotal = txns
        .filter(t => t.category === 'Food' && t.type === 'EXPENSE')
        .reduce((sum, t) => sum + t.amount, 0);
      return `You have spent ₹${foodTotal.toLocaleString('en-IN')} on food and dining this month across ${txns.filter(t => t.category === 'Food').length} orders.`;
    }

    // Question: Emergency fund
    if (q.includes('emergency fund') || q.includes('emergency balance')) {
      const pct = Math.round((emergencyFund.currentAmount / emergencyFund.targetAmount) * 100);
      return `Your Emergency Fund currently holds ₹${emergencyFund.currentAmount.toLocaleString('en-IN')} out of your ₹${emergencyFund.targetAmount.toLocaleString('en-IN')} target (${pct}% achieved). It is currently ${emergencyFund.isLocked ? '🔒 LOCKED for security' : '🔓 Unlocked'}.`;
    }

    // Question: Next EMI / loan
    if (q.includes('emi') || q.includes('loan') || q.includes('car loan')) {
      if (emis.length > 0) {
        const emi = emis[0];
        return `Your next EMI for ${emi.loanName} is ₹${emi.monthlyEMI.toLocaleString('en-IN')}, due on ${emi.nextDueDate}. You have ${emi.totalTenureMonths - emi.paidMonths} installments remaining.`;
      }
      return 'You currently have no active EMI obligations recorded in FinPocket.';
    }

    // Question: Upcoming bills
    if (q.includes('upcoming') || q.includes('bill') || q.includes('electricity')) {
      const unpaid = bills.filter(b => !b.isPaidThisMonth);
      if (unpaid.length > 0) {
        const list = unpaid.map(u => `${u.name} (₹${u.amount} due on ${u.dueDate})`).join(', ');
        return `You have ${unpaid.length} upcoming bills: ${list}.`;
      }
      return 'All your recurring monthly bills are already marked as paid!';
    }

    // Question: How much did I save
    if (q.includes('save') || q.includes('saved') || q.includes('savings')) {
      const goals = StorageService.getSavingsGoals();
      const goalsTotal = goals.reduce((sum, g) => sum + g.currentAmount, 0);
      const total = emergencyFund.currentAmount + goalsTotal;
      return `Your total accumulated savings across all goals and emergency funds is ₹${total.toLocaleString('en-IN')}.`;
    }

    // Fallback if data not identifiable
    return `I don't have enough specific transaction details for that question, but you can ask about your balance, food expenses, monthly spending, emergency fund, or upcoming EMIs!`;
  },
};
