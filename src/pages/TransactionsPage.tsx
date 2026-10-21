import React, { useState } from 'react';
import { useFinance } from '../contexts/FinanceContext';
import { useLanguage } from '../contexts/LanguageContext';
import { useChildCare } from '../contexts/ChildCareContext';
import { Transaction, TransactionCategory } from '../types';
import {
  Search,
  Filter,
  Download,
  TrendingUp,
  TrendingDown,
  Calendar,
  Layers,
  ArrowUpDown,
  FileSpreadsheet,
  FileText,
} from 'lucide-react';
import { ExportReportModal } from '../components/reports/ExportReportModal';

interface TransactionsPageProps {
  onSelectTransaction: (txn: Transaction) => void;
}

type PeriodFilter = 'THIS_MONTH' | 'LAST_MONTH' | 'LAST_3_MONTHS' | 'LAST_6_MONTHS' | 'THIS_YEAR' | 'ALL';

const categoriesList: Array<TransactionCategory | 'ALL'> = [
  'ALL',
  'Food',
  'Shopping',
  'Travel',
  'Bills',
  'Entertainment',
  'Health',
  'Rent',
  'Savings',
  'Salary',
  'Other',
];

export const TransactionsPage: React.FC<TransactionsPageProps> = ({ onSelectTransaction }) => {
  const { transactions } = useFinance();
  const { t } = useLanguage();
  const { isChildCareActive } = useChildCare();

  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<TransactionCategory | 'ALL'>('ALL');
  const [selectedPeriod, setSelectedPeriod] = useState<PeriodFilter>('THIS_MONTH');
  const [typeFilter, setTypeFilter] = useState<'ALL' | 'INCOME' | 'EXPENSE'>('ALL');
  const [showExportModal, setShowExportModal] = useState<boolean>(false);

  if (isChildCareActive) {
    return (
      <div className="mobile-body animate-fade" style={{ textAlign: 'center', padding: '60px 20px' }}>
        <h3 style={{ fontSize: '18px', fontWeight: 800, color: 'var(--text-primary)' }}>
          Transaction History Hidden
        </h3>
        <p style={{ fontSize: '13px', color: 'var(--text-secondary)', marginTop: '8px', lineHeight: '1.5' }}>
          Detailed financial transaction records are hidden while Child Care Mode is active to safeguard sensitive financial details.
        </p>
      </div>
    );
  }

  // Filter logic
  const filteredTransactions = transactions.filter(t => {
    // Search matching
    const q = searchQuery.toLowerCase();
    const matchesSearch =
      !q ||
      t.receiver.toLowerCase().includes(q) ||
      t.sender.toLowerCase().includes(q) ||
      t.description.toLowerCase().includes(q) ||
      t.id.toLowerCase().includes(q) ||
      t.category.toLowerCase().includes(q) ||
      t.amount.toString().includes(q);

    if (!matchesSearch) return false;

    // Category matching
    if (selectedCategory !== 'ALL' && t.category !== selectedCategory) {
      return false;
    }

    // Type matching
    if (typeFilter !== 'ALL' && t.type !== typeFilter) {
      return false;
    }

    return true;
  });

  // Category breakdown calculation for visual chart
  const categoryTotals: Record<string, number> = {};
  let totalExpense = 0;

  filteredTransactions.forEach(t => {
    if (t.type === 'EXPENSE') {
      categoryTotals[t.category] = (categoryTotals[t.category] || 0) + t.amount;
      totalExpense += t.amount;
    }
  });

  const sortedCategories = Object.entries(categoryTotals).sort((a, b) => b[1] - a[1]);

  return (
    <div className="mobile-body animate-fade">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
        <h2 style={{ fontSize: '20px', fontWeight: 800, margin: 0, color: 'var(--text-primary)' }}>
          {t.navTransactions}
        </h2>

        <button
          onClick={() => setShowExportModal(true)}
          className="btn-primary"
          style={{
            padding: '6px 14px',
            fontSize: '12px',
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            background: 'linear-gradient(135deg, var(--primary), var(--primary-dark))',
            boxShadow: '0 2px 8px var(--primary-glow)',
            cursor: 'pointer',
          }}
        >
          <Download size={14} />
          <span>Statement / PDF</span>
        </button>
      </div>

      {/* Search Input Bar */}
      <div style={{ position: 'relative', marginBottom: '12px' }}>
        <Search size={16} style={{ position: 'absolute', left: '12px', top: '13px', color: 'var(--text-muted)' }} />
        <input
          className="fp-input"
          style={{ paddingLeft: '36px', fontSize: '13px' }}
          placeholder={t.search}
          value={searchQuery}
          onChange={e => setSearchQuery(e.target.value)}
        />
      </div>

      {/* Period Filter Tabs */}
      <div style={{ display: 'flex', gap: '6px', overflowX: 'auto', paddingBottom: '8px', marginBottom: '8px' }}>
        {[
          { key: 'THIS_MONTH', label: 'This Month' },
          { key: 'LAST_MONTH', label: 'Last Month' },
          { key: 'LAST_3_MONTHS', label: 'Last 3M' },
          { key: 'LAST_6_MONTHS', label: 'Last 6M' },
          { key: 'THIS_YEAR', label: 'This Year' },
          { key: 'ALL', label: 'All Time' },
        ].map(p => (
          <button
            key={p.key}
            onClick={() => setSelectedPeriod(p.key as PeriodFilter)}
            style={{
              background: selectedPeriod === p.key ? 'var(--primary)' : 'var(--bg-card)',
              color: selectedPeriod === p.key ? '#ffffff' : 'var(--text-secondary)',
              border: '1px solid var(--border-color)',
              borderRadius: '16px',
              padding: '5px 12px',
              fontSize: '11px',
              fontWeight: 600,
              cursor: 'pointer',
              whiteSpace: 'nowrap',
            }}
          >
            {p.label}
          </button>
        ))}
      </div>

      {/* Category Horizontal Pills */}
      <div style={{ display: 'flex', gap: '6px', overflowX: 'auto', paddingBottom: '10px', marginBottom: '16px' }}>
        {categoriesList.map(cat => (
          <button
            key={cat}
            onClick={() => setSelectedCategory(cat)}
            style={{
              background: selectedCategory === cat ? 'rgba(20, 184, 166, 0.2)' : 'var(--bg-card)',
              color: selectedCategory === cat ? 'var(--primary-light)' : 'var(--text-secondary)',
              border: selectedCategory === cat ? '1px solid var(--primary)' : '1px solid var(--border-color)',
              borderRadius: '14px',
              padding: '4px 10px',
              fontSize: '11px',
              fontWeight: 600,
              cursor: 'pointer',
              whiteSpace: 'nowrap',
            }}
          >
            {cat}
          </button>
        ))}
      </div>

      {/* Category Visual Breakdown Chart Card */}
      {sortedCategories.length > 0 && (
        <div className="fp-card" style={{ marginBottom: '16px' }}>
          <span style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '10px', display: 'block' }}>
            {t.spendingBreakdown} (₹{totalExpense.toLocaleString('en-IN')})
          </span>

          {/* Multi-segment Progress Bar */}
          <div
            style={{
              height: '10px',
              borderRadius: '6px',
              display: 'flex',
              overflow: 'hidden',
              marginBottom: '12px',
              background: 'var(--bg-surface)',
            }}
          >
            {sortedCategories.map(([catName, amt], idx) => {
              const pct = Math.max(2, (amt / totalExpense) * 100);
              const colors = ['#14b8a6', '#0ea5e9', '#8b5cf6', '#f59e0b', '#ef4444', '#10b981'];
              return (
                <div
                  key={catName}
                  style={{
                    width: `${pct}%`,
                    height: '100%',
                    backgroundColor: colors[idx % colors.length],
                  }}
                  title={`${catName}: ₹${amt}`}
                />
              );
            })}
          </div>

          {/* Top 3 Category Breakdown rows */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            {sortedCategories.slice(0, 3).map(([catName, amt]) => (
              <div key={catName} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px' }}>
                <span style={{ color: 'var(--text-secondary)' }}>{catName}</span>
                <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>
                  ₹{amt.toLocaleString('en-IN')} ({Math.round((amt / totalExpense) * 100)}%)
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Filter Tabs (All / Income / Expense) */}
      <div style={{ display: 'flex', gap: '8px', marginBottom: '12px' }}>
        {(['ALL', 'EXPENSE', 'INCOME'] as const).map(type => (
          <button
            key={type}
            onClick={() => setTypeFilter(type)}
            style={{
              flex: 1,
              padding: '6px',
              borderRadius: '8px',
              background: typeFilter === type ? 'var(--bg-card-hover)' : 'var(--bg-card)',
              border: typeFilter === type ? '1px solid var(--primary)' : '1px solid var(--border-color)',
              color: typeFilter === type ? 'var(--primary-light)' : 'var(--text-secondary)',
              fontSize: '11px',
              fontWeight: 700,
              cursor: 'pointer',
            }}
          >
            {type === 'ALL' ? 'All Transactions' : type === 'EXPENSE' ? 'Expenses' : 'Income'}
          </button>
        ))}
      </div>

      {/* Transaction List */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
        {filteredTransactions.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '40px 10px', color: 'var(--text-muted)' }}>
            No transactions match your search filters.
          </div>
        ) : (
          filteredTransactions.map(txn => (
            <div
              key={txn.id}
              className="fp-card fp-card-interactive"
              onClick={() => onSelectTransaction(txn)}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '12px 14px',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <div
                  style={{
                    width: '38px',
                    height: '38px',
                    borderRadius: '10px',
                    background: txn.type === 'INCOME' ? 'rgba(34,197,94,0.15)' : 'rgba(239,68,68,0.15)',
                    color: txn.type === 'INCOME' ? 'var(--success)' : 'var(--danger)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  {txn.type === 'INCOME' ? <TrendingUp size={18} /> : <TrendingDown size={18} />}
                </div>

                <div>
                  <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)' }}>
                    {txn.receiver}
                  </div>
                  <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                    {new Date(txn.timestamp).toLocaleDateString('en-IN', { month: 'short', day: 'numeric', year: 'numeric' })} • {txn.category}
                  </div>
                </div>
              </div>

              <div style={{ textAlign: 'right' }}>
                <div
                  style={{
                    fontSize: '14px',
                    fontWeight: 700,
                    color: txn.type === 'INCOME' ? 'var(--success)' : 'var(--text-primary)',
                  }}
                >
                  {txn.type === 'INCOME' ? '+' : '-'}₹{txn.amount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                </div>
                <span className="badge badge-teal" style={{ fontSize: '9px', marginTop: '2px' }}>
                  {txn.status}
                </span>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Official Bank Statement & Financial Report Export Modal */}
      <ExportReportModal
        isOpen={showExportModal}
        onClose={() => setShowExportModal(false)}
      />
    </div>
  );
};
