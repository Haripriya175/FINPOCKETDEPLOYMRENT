import { Transaction, BankAccount, User } from '../types';

export type StatementPeriod =
  | 'THIS_MONTH'
  | 'LAST_MONTH'
  | 'LAST_3_MONTHS'
  | 'LAST_6_MONTHS'
  | 'FINANCIAL_YEAR'
  | 'ALL'
  | 'CUSTOM';

export type StatementFormat = 'PDF_STATEMENT' | 'PDF_REPORT' | 'CSV_STATEMENT';

export interface StatementFilter {
  period: StatementPeriod;
  accountId: string; // 'ALL' or specific bank id
  type?: 'ALL' | 'INCOME' | 'EXPENSE';
  customStartDate?: string;
  customEndDate?: string;
  includeBreakdown?: boolean;
}

export interface StatementSummary {
  periodLabel: string;
  startDate: Date;
  endDate: Date;
  accountName: string;
  maskedAccount: string;
  ifscCode: string;
  totalTransactions: number;
  totalIncome: number;
  totalExpense: number;
  netCashflow: number;
  openingBalance: number;
  closingBalance: number;
  categoryBreakdown: { category: string; amount: number; percentage: number; count: number }[];
  transactions: (Transaction & { runningBalance: number })[];
}

export const StatementService = {
  getPeriodDates(period: StatementPeriod, customStart?: string, customEnd?: string): { start: Date; end: Date; label: string } {
    const now = new Date();
    let start = new Date();
    let end = new Date();
    let label = '';

    switch (period) {
      case 'THIS_MONTH': {
        start = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0);
        end = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);
        label = start.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });
        break;
      }
      case 'LAST_MONTH': {
        start = new Date(now.getFullYear(), now.getMonth() - 1, 1, 0, 0, 0);
        end = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59);
        label = start.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });
        break;
      }
      case 'LAST_3_MONTHS': {
        start = new Date(now.getFullYear(), now.getMonth() - 3, 1, 0, 0, 0);
        end = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);
        label = `Last 3 Months (${start.toLocaleDateString('en-IN', { month: 'short', year: 'numeric' })} - ${end.toLocaleDateString('en-IN', { month: 'short', year: 'numeric' })})`;
        break;
      }
      case 'LAST_6_MONTHS': {
        start = new Date(now.getFullYear(), now.getMonth() - 6, 1, 0, 0, 0);
        end = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);
        label = `Last 6 Months (${start.toLocaleDateString('en-IN', { month: 'short', year: 'numeric' })} - ${end.toLocaleDateString('en-IN', { month: 'short', year: 'numeric' })})`;
        break;
      }
      case 'FINANCIAL_YEAR': {
        const curMonth = now.getMonth(); // 0 is Jan, 3 is April
        const fyStartYear = curMonth >= 3 ? now.getFullYear() : now.getFullYear() - 1;
        start = new Date(fyStartYear, 3, 1, 0, 0, 0);
        end = new Date(fyStartYear + 1, 2, 31, 23, 59, 59);
        label = `Financial Year (FY ${fyStartYear}-${(fyStartYear + 1).toString().slice(-2)})`;
        break;
      }
      case 'CUSTOM': {
        if (customStart && customEnd) {
          start = new Date(customStart + 'T00:00:00');
          end = new Date(customEnd + 'T23:59:59');
          label = `${start.toLocaleDateString('en-IN')} to ${end.toLocaleDateString('en-IN')}`;
        } else {
          start = new Date(now.getFullYear(), now.getMonth(), 1);
          end = now;
          label = 'Custom Period';
        }
        break;
      }
      case 'ALL':
      default: {
        start = new Date(2020, 0, 1);
        end = now;
        label = 'Complete Statement (All-Time)';
        break;
      }
    }

    return { start, end, label };
  },

  generateStatementSummary(
    allTransactions: Transaction[],
    bankAccounts: BankAccount[],
    filter: StatementFilter
  ): StatementSummary {
    const { start, end, label } = this.getPeriodDates(filter.period, filter.customStartDate, filter.customEndDate);

    // Selected bank account details
    let accountName = 'Consolidated FinPocket Account';
    let maskedAccount = 'ALL-ACCOUNTS-LINKED';
    let ifscCode = 'FINP0000AA1';
    let baseAccountBalance = bankAccounts.reduce((sum, b) => sum + b.availableBalance, 0);

    if (filter.accountId !== 'ALL') {
      const selectedBank = bankAccounts.find(b => b.id === filter.accountId);
      if (selectedBank) {
        accountName = `${selectedBank.bankName} (${selectedBank.accountType})`;
        maskedAccount = selectedBank.maskedAccountNumber;
        ifscCode = selectedBank.ifscCode || 'HDFC0001824';
        baseAccountBalance = selectedBank.availableBalance;
      }
    }

    // Filter transactions by period & type
    const matchedTxns = allTransactions.filter(t => {
      const tDate = new Date(t.timestamp);
      if (tDate < start || tDate > end) return false;
      if (filter.type && filter.type !== 'ALL' && t.type !== filter.type) return false;
      return true;
    });

    // Chronological order for ledger & running balance
    const sortedTxns = [...matchedTxns].sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

    let totalIncome = 0;
    let totalExpense = 0;
    const categoryMap: Record<string, { amount: number; count: number }> = {};

    sortedTxns.forEach(t => {
      if (t.type === 'INCOME') {
        totalIncome += t.amount;
      } else {
        totalExpense += t.amount;
        if (!categoryMap[t.category]) {
          categoryMap[t.category] = { amount: 0, count: 0 };
        }
        categoryMap[t.category].amount += t.amount;
        categoryMap[t.category].count += 1;
      }
    });

    const netCashflow = totalIncome - totalExpense;
    // Calculate estimated opening balance relative to current balance
    const closingBalance = baseAccountBalance;
    const openingBalance = Math.max(0, closingBalance - netCashflow);

    let running = openingBalance;
    const transactionsWithBalance = sortedTxns.map(t => {
      if (t.type === 'INCOME') {
        running += t.amount;
      } else {
        running -= t.amount;
      }
      return {
        ...t,
        runningBalance: Math.max(0, running),
      };
    });

    // Descending for statement presentation
    const finalTransactions = [...transactionsWithBalance].reverse();

    const categoryBreakdown = Object.entries(categoryMap)
      .map(([cat, val]) => ({
        category: cat,
        amount: val.amount,
        percentage: totalExpense > 0 ? (val.amount / totalExpense) * 100 : 0,
        count: val.count,
      }))
      .sort((a, b) => b.amount - a.amount);

    return {
      periodLabel: label,
      startDate: start,
      endDate: end,
      accountName,
      maskedAccount,
      ifscCode,
      totalTransactions: sortedTxns.length,
      totalIncome,
      totalExpense,
      netCashflow,
      openingBalance,
      closingBalance,
      categoryBreakdown,
      transactions: finalTransactions,
    };
  },

  exportCsv(summary: StatementSummary, user: User) {
    const csvRows: string[] = [];

    // Header metadata block
    csvRows.push('FINPOCKET OFFICIAL FINANCIAL STATEMENT');
    csvRows.push(`Generated On,"${new Date().toLocaleString('en-IN')}"`);
    csvRows.push(`Customer Name,"${user.fullName}"`);
    csvRows.push(`Customer Mobile,"${user.phone || '9876543210'}"`);
    csvRows.push(`Customer Email,"${user.email}"`);
    csvRows.push(`Account,"${summary.accountName}"`);
    csvRows.push(`Account Number,"${summary.maskedAccount}"`);
    csvRows.push(`IFSC Code,"${summary.ifscCode}"`);
    csvRows.push(`Statement Period,"${summary.periodLabel}"`);
    csvRows.push('');
    csvRows.push('SUMMARY');
    csvRows.push(`Opening Balance (INR),${summary.openingBalance.toFixed(2)}`);
    csvRows.push(`Total Credits/Inflow (INR),${summary.totalIncome.toFixed(2)}`);
    csvRows.push(`Total Debits/Outflow (INR),${summary.totalExpense.toFixed(2)}`);
    csvRows.push(`Net Cashflow (INR),${summary.netCashflow.toFixed(2)}`);
    csvRows.push(`Closing Balance (INR),${summary.closingBalance.toFixed(2)}`);
    csvRows.push('');

    // Category Breakdown Table
    if (summary.categoryBreakdown.length > 0) {
      csvRows.push('SPENDING BREAKDOWN BY CATEGORY');
      csvRows.push('Category,Amount (INR),Percentage (%),Transaction Count');
      summary.categoryBreakdown.forEach(c => {
        csvRows.push(`"${c.category}",${c.amount.toFixed(2)},${c.percentage.toFixed(1)}%,${c.count}`);
      });
      csvRows.push('');
    }

    // Ledger Table
    csvRows.push('TRANSACTION STATEMENT LEDGER');
    csvRows.push(
      'Transaction Date,Value Time,Narration / Description,Category,Payment Mode,Transaction ID,Reference UTR,Debit (INR),Credit (INR),Running Balance (INR),Status'
    );

    summary.transactions.forEach(t => {
      const d = new Date(t.timestamp);
      const dateStr = d.toLocaleDateString('en-IN');
      const timeStr = d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
      const debit = t.type === 'EXPENSE' ? t.amount.toFixed(2) : '0.00';
      const credit = t.type === 'INCOME' ? t.amount.toFixed(2) : '0.00';
      const desc = `"${(t.description || t.receiver || 'Transfer').replace(/"/g, '""')}"`;
      const ref = `"${t.referenceId || ''}"`;

      csvRows.push(
        `${dateStr},${timeStr},${desc},${t.category},${t.paymentMethod || 'UPI'},${t.id},${ref},${debit},${credit},${t.runningBalance.toFixed(2)},${t.status}`
      );
    });

    const csvString = csvRows.join('\n');
    const blob = new Blob([csvString], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    const cleanAccountName = summary.accountName.replace(/[^a-zA-Z0-9]/g, '_');
    link.download = `FinPocket_Statement_${cleanAccountName}_${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  },

  exportPdfStatement(summary: StatementSummary, user: User) {
    const printWindow = window.open('', '_blank', 'width=980,height=900');
    if (!printWindow) {
      alert('Please allow popups in your browser to view and save the official PDF statement.');
      return;
    }

    const rowsHtml = summary.transactions
      .map(t => {
        const d = new Date(t.timestamp);
        const dateStr = d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
        const timeStr = d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
        const isIncome = t.type === 'INCOME';
        const debitText = !isIncome ? `₹${t.amount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}` : '-';
        const creditText = isIncome ? `₹${t.amount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}` : '-';

        return `
          <tr>
            <td>
              <div style="font-weight: 600; color: #1e293b;">${dateStr}</div>
              <div style="font-size: 11px; color: #64748b;">${timeStr}</div>
            </td>
            <td>
              <div style="font-weight: 600; color: #0f172a;">${t.receiver || t.description || 'Transaction'}</div>
              <div style="font-size: 11px; color: #64748b;">Ref: ${t.referenceId || t.id} • ${t.paymentMethod || 'UPI'}</div>
            </td>
            <td>
              <span class="badge badge-category">${t.category}</span>
            </td>
            <td style="text-align: right; color: #dc2626; font-weight: 600;">${debitText}</td>
            <td style="text-align: right; color: #16a34a; font-weight: 600;">${creditText}</td>
            <td style="text-align: right; font-weight: 700; color: #0f172a;">₹${t.runningBalance.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
          </tr>
        `;
      })
      .join('');

    const categoryRowsHtml = summary.categoryBreakdown
      .slice(0, 8)
      .map(c => `
        <tr>
          <td><strong>${c.category}</strong></td>
          <td style="text-align: right;">₹${c.amount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
          <td style="text-align: right;">${c.percentage.toFixed(1)}%</td>
          <td style="text-align: right;">${c.count}</td>
        </tr>
      `)
      .join('');

    const htmlContent = `
      <!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="UTF-8">
        <title>FinPocket Bank Statement — ${summary.periodLabel}</title>
        <style>
          @page {
            size: A4 portrait;
            margin: 14mm 12mm 14mm 12mm;
          }
          * {
            box-sizing: border-box;
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
          }
          body {
            color: #1e293b;
            background: #ffffff;
            margin: 0;
            padding: 24px;
            font-size: 12px;
            line-height: 1.45;
          }
          .header-table {
            width: 100%;
            border-bottom: 2px solid #14b8a6;
            padding-bottom: 16px;
            margin-bottom: 20px;
          }
          .brand-logo {
            font-size: 26px;
            font-weight: 800;
            color: #0f172a;
            letter-spacing: -0.5px;
          }
          .brand-logo span {
            color: #14b8a6;
          }
          .badge {
            display: inline-block;
            padding: 3px 8px;
            border-radius: 4px;
            font-size: 10px;
            font-weight: 700;
            text-transform: uppercase;
          }
          .badge-verified {
            background: #ecfdf5;
            color: #059669;
            border: 1px solid #a7f3d0;
          }
          .badge-category {
            background: #f1f5f9;
            color: #475569;
            border: 1px solid #e2e8f0;
          }
          .info-grid {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 20px;
            margin-bottom: 20px;
            background: #f8fafc;
            border: 1px solid #e2e8f0;
            border-radius: 8px;
            padding: 16px;
          }
          .info-col h4 {
            margin: 0 0 8px 0;
            font-size: 11px;
            text-transform: uppercase;
            letter-spacing: 0.5px;
            color: #64748b;
          }
          .info-row {
            display: flex;
            justify-content: space-between;
            margin-bottom: 4px;
            font-size: 12px;
          }
          .info-label {
            color: #64748b;
          }
          .info-val {
            font-weight: 600;
            color: #0f172a;
          }
          .summary-cards {
            display: grid;
            grid-template-columns: repeat(5, 1fr);
            gap: 10px;
            margin-bottom: 24px;
          }
          .summary-card {
            background: #f8fafc;
            border: 1px solid #e2e8f0;
            border-radius: 8px;
            padding: 12px;
            text-align: center;
          }
          .summary-card-title {
            font-size: 10px;
            text-transform: uppercase;
            color: #64748b;
            font-weight: 600;
            margin-bottom: 4px;
          }
          .summary-card-val {
            font-size: 15px;
            font-weight: 800;
            color: #0f172a;
          }
          .statement-table {
            width: 100%;
            border-collapse: collapse;
            font-size: 11.5px;
            margin-bottom: 24px;
          }
          .statement-table th {
            background: #f1f5f9;
            color: #475569;
            font-weight: 700;
            text-align: left;
            padding: 9px 8px;
            border-top: 1px solid #cbd5e1;
            border-bottom: 1px solid #cbd5e1;
            font-size: 10.5px;
            text-transform: uppercase;
          }
          .statement-table td {
            padding: 9px 8px;
            border-bottom: 1px solid #f1f5f9;
            vertical-align: top;
          }
          .breakdown-box {
            margin-bottom: 24px;
            background: #fafafa;
            border: 1px solid #e2e8f0;
            border-radius: 8px;
            padding: 14px;
          }
          .breakdown-box h3 {
            margin: 0 0 10px 0;
            font-size: 13px;
            color: #0f172a;
          }
          .footer-box {
            border-top: 1px dashed #cbd5e1;
            padding-top: 16px;
            margin-top: 30px;
            font-size: 10.5px;
            color: #64748b;
            display: flex;
            justify-content: space-between;
            align-items: center;
          }
          .no-print-toolbar {
            position: fixed;
            top: 0;
            left: 0;
            right: 0;
            background: #0f172a;
            color: #ffffff;
            padding: 12px 24px;
            display: flex;
            justify-content: space-between;
            align-items: center;
            box-shadow: 0 4px 12px rgba(0,0,0,0.15);
            z-index: 1000;
          }
          .btn-print {
            background: #14b8a6;
            color: #ffffff;
            border: none;
            padding: 8px 20px;
            border-radius: 6px;
            font-weight: 700;
            cursor: pointer;
            font-size: 13px;
          }
          .btn-print:hover {
            background: #0d9488;
          }
          @media print {
            .no-print-toolbar {
              display: none !important;
            }
            body {
              padding: 0 !important;
            }
          }
        </style>
      </head>
      <body>
        <div class="no-print-toolbar">
          <div>
            <strong>FinPocket Bank Statement Preview</strong> — ${summary.periodLabel}
          </div>
          <div>
            <button class="btn-print" onclick="window.print()">🖨️ Print / Save as PDF</button>
          </div>
        </div>

        <div style="height: 48px;" class="no-print-toolbar-spacer"></div>

        <table class="header-table">
          <tr>
            <td style="vertical-align: top;">
              <div class="brand-logo">Fin<span>Pocket</span></div>
              <div style="font-size: 12px; color: #64748b; margin-top: 2px;">Smart Personal Finance & Account Aggregator Suite</div>
              <div style="font-size: 11px; color: #94a3b8; margin-top: 4px;">RBI Account Aggregator Ecosystem • ISO 27001 Certified</div>
            </td>
            <td style="text-align: right; vertical-align: top;">
              <div style="font-size: 16px; font-weight: 800; color: #0f172a; text-transform: uppercase;">Official Account Statement</div>
              <div style="margin-top: 4px;"><span class="badge badge-verified">✓ RBI Regulated AA Feed</span></div>
              <div style="font-size: 11px; color: #64748b; margin-top: 6px;">Generated: ${new Date().toLocaleString('en-IN')}</div>
            </td>
          </tr>
        </table>

        <!-- Account Holder & Bank Info Grid -->
        <div class="info-grid">
          <div class="info-col">
            <h4>Account Holder Details</h4>
            <div class="info-row"><span class="info-label">Name:</span> <span class="info-val">${user.fullName}</span></div>
            <div class="info-row"><span class="info-label">Customer ID:</span> <span class="info-val">FP-${(user.userId || 'USR001').slice(0, 8).toUpperCase()}</span></div>
            <div class="info-row"><span class="info-label">Mobile:</span> <span class="info-val">+91 ${user.phone || '9876543210'}</span></div>
            <div class="info-row"><span class="info-label">Email:</span> <span class="info-val">${user.email}</span></div>
          </div>
          <div class="info-col">
            <h4>Account & Statement Details</h4>
            <div class="info-row"><span class="info-label">Bank Account:</span> <span class="info-val">${summary.accountName}</span></div>
            <div class="info-row"><span class="info-label">Account No:</span> <span class="info-val">${summary.maskedAccount}</span></div>
            <div class="info-row"><span class="info-label">IFSC Code:</span> <span class="info-val">${summary.ifscCode}</span></div>
            <div class="info-row"><span class="info-label">Statement Period:</span> <span class="info-val">${summary.periodLabel}</span></div>
          </div>
        </div>

        <!-- Executive Financial Summary Cards -->
        <div class="summary-cards">
          <div class="summary-card">
            <div class="summary-card-title">Opening Balance</div>
            <div class="summary-card-val">₹${summary.openingBalance.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</div>
          </div>
          <div class="summary-card">
            <div class="summary-card-title">Total Credits (+)</div>
            <div class="summary-card-val" style="color: #16a34a;">₹${summary.totalIncome.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</div>
          </div>
          <div class="summary-card">
            <div class="summary-card-title">Total Debits (-)</div>
            <div class="summary-card-val" style="color: #dc2626;">₹${summary.totalExpense.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</div>
          </div>
          <div class="summary-card">
            <div class="summary-card-title">Net Flow</div>
            <div class="summary-card-val" style="color: ${summary.netCashflow >= 0 ? '#16a34a' : '#dc2626'};">
              ${summary.netCashflow >= 0 ? '+' : ''}₹${summary.netCashflow.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
            </div>
          </div>
          <div class="summary-card" style="background: #f0fdfa; border-color: #99f6e4;">
            <div class="summary-card-title" style="color: #0f766e;">Closing Balance</div>
            <div class="summary-card-val" style="color: #0d9488;">₹${summary.closingBalance.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</div>
          </div>
        </div>

        <!-- Category Breakdown Box -->
        ${
          summary.categoryBreakdown.length > 0
            ? `
          <div class="breakdown-box">
            <h3>Top Spending Categories</h3>
            <table style="width: 100%; border-collapse: collapse; font-size: 11px;">
              <thead>
                <tr style="border-bottom: 1px solid #e2e8f0; color: #64748b;">
                  <th style="text-align: left; padding: 4px;">Category</th>
                  <th style="text-align: right; padding: 4px;">Total Spent</th>
                  <th style="text-align: right; padding: 4px;">Share</th>
                  <th style="text-align: right; padding: 4px;">Txn Count</th>
                </tr>
              </thead>
              <tbody>
                ${categoryRowsHtml}
              </tbody>
            </table>
          </div>
        `
            : ''
        }

        <!-- Transactions Ledger Table -->
        <h3 style="font-size: 14px; margin: 0 0 10px 0; color: #0f172a;">Transaction Statement Ledger (${summary.transactions.length} records)</h3>
        <table class="statement-table">
          <thead>
            <tr>
              <th style="width: 15%;">Date & Time</th>
              <th style="width: 35%;">Narration / Counterparty</th>
              <th style="width: 12%;">Category</th>
              <th style="width: 12%; text-align: right;">Withdrawal (Dr)</th>
              <th style="width: 12%; text-align: right;">Deposit (Cr)</th>
              <th style="width: 14%; text-align: right;">Balance</th>
            </tr>
          </thead>
          <tbody>
            ${
              rowsHtml ||
              `<tr><td colspan="6" style="text-align: center; color: #94a3b8; padding: 24px;">No transactions recorded in this period.</td></tr>`
            }
          </tbody>
        </table>

        <!-- Security Disclaimer & Footer -->
        <div class="footer-box">
          <div>
            <div><strong>FinPocket Technologies Private Limited</strong></div>
            <div>This is a computer-generated official financial statement. Does not require a physical signature.</div>
            <div>All transactions reconciled via RBI Account Aggregator (AA) framework. Reference Token: FP-${Date.now().toString(36).toUpperCase()}</div>
          </div>
          <div style="text-align: right;">
            <div style="font-size: 12px; font-weight: 700; color: #0f172a;">FinPocket Security Sealed</div>
            <div style="color: #14b8a6;">256-bit AES End-to-End Encrypted</div>
          </div>
        </div>

        <script>
          // Automatically prompt print dialog after page renders
          window.addEventListener('load', () => {
            setTimeout(() => {
              window.print();
            }, 600);
          });
        </script>
      </body>
      </html>
    `;

    printWindow.document.open();
    printWindow.document.write(htmlContent);
    printWindow.document.close();
  },

  exportPdfFinancialReport(summary: StatementSummary, user: User) {
    const printWindow = window.open('', '_blank', 'width=980,height=900');
    if (!printWindow) {
      alert('Please allow popups in your browser to view and save the official financial report.');
      return;
    }

    const savingsRate = summary.totalIncome > 0 ? Math.max(0, ((summary.totalIncome - summary.totalExpense) / summary.totalIncome) * 100) : 0;
    const avgDailyExpense = summary.totalExpense > 0 ? (summary.totalExpense / 30).toFixed(0) : '0';

    const categoryRows = summary.categoryBreakdown
      .map(c => `
        <div style="display: flex; justify-content: space-between; align-items: center; padding: 8px 0; border-bottom: 1px solid #f1f5f9;">
          <div style="display: flex; align-items: center; gap: 8px;">
            <span style="display: inline-block; width: 10px; height: 10px; border-radius: 50%; background: #14b8a6;"></span>
            <strong>${c.category}</strong>
          </div>
          <div style="text-align: right;">
            <div>₹${c.amount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</div>
            <div style="font-size: 11px; color: #64748b;">${c.percentage.toFixed(1)}% (${c.count} transactions)</div>
          </div>
        </div>
      `)
      .join('');

    const htmlContent = `
      <!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="UTF-8">
        <title>FinPocket Monthly Financial Intelligence Report — ${summary.periodLabel}</title>
        <style>
          * { box-sizing: border-box; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; }
          body { color: #1e293b; background: #ffffff; padding: 30px; font-size: 13px; line-height: 1.5; }
          .header { border-bottom: 2px solid #0ea5e9; padding-bottom: 16px; margin-bottom: 24px; display: flex; justify-content: space-between; }
          .title { font-size: 24px; font-weight: 800; color: #0f172a; }
          .grid-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin-bottom: 24px; }
          .card { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 12px; padding: 18px; }
          .card h3 { margin-top: 0; font-size: 14px; text-transform: uppercase; color: #475569; letter-spacing: 0.5px; }
          .stat-val { font-size: 26px; font-weight: 800; color: #0f172a; margin-top: 6px; }
          .no-print { position: fixed; top: 0; left: 0; right: 0; background: #0f172a; color: #fff; padding: 12px 24px; display: flex; justify-content: space-between; align-items: center; }
          .btn-p { background: #0ea5e9; color: #fff; border: none; padding: 8px 18px; border-radius: 6px; font-weight: bold; cursor: pointer; }
          @media print { .no-print { display: none !important; } body { padding: 0 !important; } }
        </style>
      </head>
      <body>
        <div class="no-print">
          <div>FinPocket Financial Intelligence Report • ${summary.periodLabel}</div>
          <button class="btn-p" onclick="window.print()">🖨️ Print / Save as PDF</button>
        </div>
        <div style="height: 48px;" class="no-print"></div>

        <div class="header">
          <div>
            <div class="title">FinPocket Financial Health Report</div>
            <div style="color: #64748b;">Member: ${user.fullName} (${user.email})</div>
          </div>
          <div style="text-align: right;">
            <div style="font-weight: 700; font-size: 14px; color: #0ea5e9;">${summary.periodLabel}</div>
            <div style="font-size: 11px; color: #94a3b8;">Generated on ${new Date().toLocaleDateString('en-IN')}</div>
          </div>
        </div>

        <div class="grid-2">
          <div class="card">
            <h3>Monthly Cash Flow Summary</h3>
            <div style="display: flex; justify-content: space-between; margin-top: 12px;">
              <span>Total Inflow (Income):</span>
              <strong style="color: #16a34a;">₹${summary.totalIncome.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</strong>
            </div>
            <div style="display: flex; justify-content: space-between; margin-top: 8px;">
              <span>Total Outflow (Expenses):</span>
              <strong style="color: #dc2626;">₹${summary.totalExpense.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</strong>
            </div>
            <div style="display: flex; justify-content: space-between; margin-top: 8px; border-top: 1px dashed #cbd5e1; padding-top: 8px;">
              <span>Net Period Savings:</span>
              <strong style="color: ${summary.netCashflow >= 0 ? '#16a34a' : '#dc2626'};">
                ${summary.netCashflow >= 0 ? '+' : ''}₹${summary.netCashflow.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
              </strong>
            </div>
          </div>

          <div class="card">
            <h3>Financial Efficiency Score</h3>
            <div class="stat-val" style="color: #0ea5e9;">${savingsRate.toFixed(1)}% <span style="font-size: 14px; font-weight: normal; color: #64748b;">Savings Rate</span></div>
            <div style="margin-top: 8px; font-size: 12px; color: #64748b;">
              Average Daily Outflow: <strong>₹${avgDailyExpense} / day</strong>
            </div>
            <div style="margin-top: 4px; font-size: 12px; color: #64748b;">
              Total Transactions Processed: <strong>${summary.totalTransactions}</strong>
            </div>
          </div>
        </div>

        <div class="card" style="margin-bottom: 24px;">
          <h3>Category Distribution & Spending Breakdown</h3>
          ${categoryRows || '<p style="color: #94a3b8;">No expense categories recorded for this period.</p>'}
        </div>

        <div style="border-top: 1px solid #e2e8f0; padding-top: 16px; font-size: 11px; color: #94a3b8; text-align: center;">
          FinPocket Personal Finance Intelligence Engine • End of Report
        </div>

        <script>
          window.addEventListener('load', () => {
            setTimeout(() => { window.print(); }, 600);
          });
        </script>
      </body>
      </html>
    `;

    printWindow.document.open();
    printWindow.document.write(htmlContent);
    printWindow.document.close();
  },
};
