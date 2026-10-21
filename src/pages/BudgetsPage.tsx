import React, { useState } from 'react';
import { useFinance } from '../contexts/FinanceContext';
import { useLanguage } from '../contexts/LanguageContext';
import { useChildCare } from '../contexts/ChildCareContext';
import { Budget, TransactionCategory } from '../types';
import { TabType } from '../components/navigation/BottomNav';
import { CreateBudgetModal } from '../components/budgets/CreateBudgetModal';
import {
  PieChart,
  Plus,
  AlertTriangle,
  CheckCircle2,
  TrendingUp,
  TrendingDown,
  Edit2,
  Trash2,
  Bell,
  Sparkles,
  ShieldCheck,
  ChevronRight,
  ArrowRight,
  Sliders,
} from 'lucide-react';

interface BudgetsPageProps {
  onNavigate: (tab: TabType) => void;
}

const categoryIcons: Record<string, string> = {
  ALL: '💳',
  Food: '🍔',
  Shopping: '🛍️',
  Travel: '🚕',
  Bills: '⚡',
  Entertainment: '🎬',
  Health: '💊',
  Rent: '🏠',
  Education: '📚',
  Other: '🏷️',
};

export const BudgetsPage: React.FC<BudgetsPageProps> = ({ onNavigate }) => {
  const { budgets, deleteBudget, getBudgetSpending, transactions } = useFinance();
  const { t } = useLanguage();
  const { isChildCareActive } = useChildCare();

  const [showCreateModal, setShowCreateModal] = useState<boolean>(false);
  const [editingBudget, setEditingBudget] = useState<Budget | null>(null);

  if (isChildCareActive) {
    return (
      <div className="mobile-body animate-fade" style={{ textAlign: 'center', padding: '60px 20px' }}>
        <h3 style={{ fontSize: '18px', fontWeight: 800, color: 'var(--text-primary)' }}>
          Budgets Protected
        </h3>
        <p style={{ fontSize: '13px', color: 'var(--text-secondary)', marginTop: '8px', lineHeight: '1.5' }}>
          Budget management and spending configurations are locked while Child Care Mode is active.
        </p>
      </div>
    );
  }

  // Calculate overall total budget stats
  const overallBudget = budgets.find(b => b.category === 'ALL');
  const overallSpending = getBudgetSpending('ALL');

  // Compute total limit from category budgets if no master 'ALL' budget exists
  const categoryBudgets = budgets.filter(b => b.category !== 'ALL');
  const sumCategoryLimits = categoryBudgets.reduce((sum, b) => sum + b.limitAmount, 0);

  const effectiveTotalLimit = overallBudget ? overallBudget.limitAmount : sumCategoryLimits;
  const effectiveTotalSpent = overallSpending.spent;
  const effectiveRemaining = Math.max(0, effectiveTotalLimit - effectiveTotalSpent);
  const overallPercentage = effectiveTotalLimit > 0 ? (effectiveTotalSpent / effectiveTotalLimit) * 100 : 0;

  // Identify any categories with active warnings or over budget
  const alertBudgets = budgets
    .map(b => ({ budget: b, spending: getBudgetSpending(b.category) }))
    .filter(item => item.spending.isOverBudget || item.spending.isWarning);

  // Identify unbudgeted categories where transactions occurred this month
  const budgetedCategorySet = new Set(budgets.map(b => b.category));
  const unbudgetedCategories: { category: TransactionCategory; spent: number }[] = [];
  const currentMonth = new Date().getMonth();
  const currentYear = new Date().getFullYear();

  const categorySpentMap: Record<string, number> = {};
  transactions.forEach(t => {
    const d = new Date(t.timestamp);
    if (t.type === 'EXPENSE' && t.status === 'SUCCESSFUL' && d.getFullYear() === currentYear && d.getMonth() === currentMonth) {
      categorySpentMap[t.category] = (categorySpentMap[t.category] || 0) + t.amount;
    }
  });

  Object.entries(categorySpentMap).forEach(([cat, amount]) => {
    if (!budgetedCategorySet.has(cat as TransactionCategory) && cat !== 'Salary' && cat !== 'Savings') {
      unbudgetedCategories.push({ category: cat as TransactionCategory, spent: amount });
    }
  });

  const handleEdit = (budget: Budget) => {
    setEditingBudget(budget);
    setShowCreateModal(true);
  };

  const handleCreateNew = () => {
    setEditingBudget(null);
    setShowCreateModal(true);
  };

  return (
    <div className="mobile-body animate-fade">
      {/* Top Header Row */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
        <div>
          <h2 style={{ fontSize: '20px', fontWeight: 800, margin: 0, color: 'var(--text-primary)' }}>
            Budgets & Limits
          </h2>
          <p style={{ margin: '2px 0 0', fontSize: '12px', color: 'var(--text-secondary)' }}>
            Manage category caps & prevent overspending
          </p>
        </div>

        <button
          onClick={handleCreateNew}
          className="btn-primary"
          style={{
            padding: '8px 14px',
            fontSize: '12px',
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            boxShadow: '0 2px 10px var(--primary-glow)',
          }}
        >
          <Plus size={16} />
          <span>Set Budget</span>
        </button>
      </div>

      {/* Over-Budget Alert Banners */}
      {alertBudgets.length > 0 && (
        <div style={{ marginBottom: '16px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {alertBudgets.map(({ budget, spending }) => (
            <div
              key={budget.id}
              style={{
                background: spending.isOverBudget ? 'rgba(239, 68, 68, 0.14)' : 'rgba(245, 158, 11, 0.14)',
                border: `1px solid ${spending.isOverBudget ? 'var(--danger)' : 'var(--warning)'}`,
                borderRadius: '12px',
                padding: '12px 14px',
                display: 'flex',
                alignItems: 'center',
                gap: '10px',
              }}
            >
              <AlertTriangle size={20} color={spending.isOverBudget ? 'var(--danger)' : 'var(--warning)'} style={{ flexShrink: 0 }} />
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: '12px', fontWeight: 700, color: spending.isOverBudget ? 'var(--danger)' : 'var(--warning)' }}>
                  {spending.isOverBudget
                    ? `⚠️ ${budget.category} Budget Exceeded (+₹${(spending.spent - spending.limit).toLocaleString('en-IN')})`
                    : `⚡ ${budget.category} Near Limit (${Math.round(spending.percentage)}% spent)`}
                </div>
                <div style={{ fontSize: '11px', color: 'var(--text-secondary)', marginTop: '2px' }}>
                  ₹{spending.spent.toLocaleString('en-IN')} of ₹{spending.limit.toLocaleString('en-IN')} monthly cap reached.
                </div>
              </div>

              <button
                onClick={() => handleEdit(budget)}
                style={{
                  background: 'none',
                  border: 'none',
                  color: 'var(--primary-light)',
                  fontSize: '11px',
                  fontWeight: 700,
                  cursor: 'pointer',
                  textDecoration: 'underline',
                  whiteSpace: 'nowrap',
                }}
              >
                Adjust
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Monthly Budget Overview Card */}
      <div
        className="fp-card"
        style={{
          background: 'linear-gradient(135deg, rgba(30, 41, 59, 0.9) 0%, rgba(15, 23, 42, 0.95) 100%)',
          border: '1px solid rgba(20, 184, 166, 0.3)',
          boxShadow: '0 8px 24px rgba(0,0,0,0.3)',
          marginBottom: '20px',
          position: 'relative',
          overflow: 'hidden',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
          <span style={{ fontSize: '11px', fontWeight: 700, color: 'var(--primary-light)', letterSpacing: '0.5px', textTransform: 'uppercase' }}>
            MONTHLY BUDGET SUMMARY
          </span>
          <span
            className={
              overallPercentage > 100
                ? 'badge badge-warning'
                : overallPercentage >= 80
                ? 'badge badge-warning'
                : 'badge badge-teal'
            }
          >
            {overallPercentage > 100 ? 'Over Budget' : `${Math.round(overallPercentage)}% Utilized`}
          </span>
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '14px' }}>
          <div>
            <div style={{ fontSize: '26px', fontWeight: 800, color: '#ffffff', letterSpacing: '-0.5px' }}>
              ₹{effectiveTotalSpent.toLocaleString('en-IN')}
            </div>
            <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
              of ₹{effectiveTotalLimit.toLocaleString('en-IN')} total limit
            </div>
          </div>

          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: '15px', fontWeight: 700, color: effectiveRemaining > 0 ? 'var(--success)' : 'var(--danger)' }}>
              {effectiveRemaining > 0 ? `₹${effectiveRemaining.toLocaleString('en-IN')} left` : 'Exceeded'}
            </div>
            <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
              {new Date().toLocaleDateString('en-IN', { month: 'long', year: 'numeric' })}
            </div>
          </div>
        </div>

        {/* Dynamic Progress Bar */}
        <div
          style={{
            height: '10px',
            borderRadius: '6px',
            background: 'var(--bg-surface)',
            border: '1px solid var(--border-color)',
            overflow: 'hidden',
            marginBottom: '10px',
          }}
        >
          <div
            style={{
              height: '100%',
              width: `${Math.min(100, overallPercentage)}%`,
              background:
                overallPercentage > 100
                  ? 'var(--danger)'
                  : overallPercentage >= 80
                  ? 'var(--warning)'
                  : 'linear-gradient(90deg, var(--primary), var(--primary-light))',
              borderRadius: '6px',
              transition: 'width 0.4s ease',
            }}
          />
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: 'var(--text-muted)' }}>
          <span>0%</span>
          <span>50%</span>
          <span>80% (Warning)</span>
          <span>100%</span>
        </div>
      </div>

      {/* Category Budgets Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
        <span style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-primary)', textTransform: 'uppercase', letterSpacing: '0.4px' }}>
          CATEGORY BUDGETS ({budgets.length})
        </span>

        <button
          onClick={handleCreateNew}
          style={{
            background: 'none',
            border: 'none',
            color: 'var(--primary-light)',
            fontSize: '12px',
            fontWeight: 700,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '4px',
          }}
        >
          <Plus size={14} />
          <span>Add Category</span>
        </button>
      </div>

      {/* Category Budget Cards List */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginBottom: '24px' }}>
        {budgets.map(budget => {
          const spending = getBudgetSpending(budget.category);
          const pct = Math.min(100, spending.percentage);
          const icon = categoryIcons[budget.category] || '🏷️';

          return (
            <div
              key={budget.id}
              className="fp-card"
              style={{
                border: spending.isOverBudget
                  ? '1px solid rgba(239, 68, 68, 0.4)'
                  : spending.isWarning
                  ? '1px solid rgba(245, 158, 11, 0.4)'
                  : '1px solid var(--border-color)',
                transition: 'all 0.2s ease',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <span style={{ fontSize: '22px' }}>{icon}</span>
                  <div>
                    <div style={{ fontSize: '14px', fontWeight: 700, color: 'var(--text-primary)' }}>
                      {budget.category === 'ALL' ? 'Overall Monthly Spending' : budget.category}
                    </div>
                    <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                      Alert at {budget.alertThresholdPercent}% • {budget.notificationsEnabled ? '🔔 Alerts On' : '🔕 Muted'}
                    </div>
                  </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <button
                    onClick={() => handleEdit(budget)}
                    title="Edit Limit"
                    style={{
                      background: 'var(--bg-surface)',
                      border: '1px solid var(--border-color)',
                      borderRadius: '8px',
                      padding: '6px',
                      color: 'var(--text-secondary)',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <Edit2 size={13} />
                  </button>

                  <button
                    onClick={() => {
                      if (confirm(`Delete the ${budget.category} budget?`)) {
                        deleteBudget(budget.id);
                      }
                    }}
                    title="Delete Budget"
                    style={{
                      background: 'var(--bg-surface)',
                      border: '1px solid var(--border-color)',
                      borderRadius: '8px',
                      padding: '6px',
                      color: 'var(--danger)',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
              </div>

              {/* Numbers Row */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '8px' }}>
                <div>
                  <span style={{ fontSize: '16px', fontWeight: 800, color: 'var(--text-primary)' }}>
                    ₹{spending.spent.toLocaleString('en-IN')}
                  </span>
                  <span style={{ fontSize: '12px', color: 'var(--text-muted)', marginLeft: '4px' }}>
                    spent of ₹{budget.limitAmount.toLocaleString('en-IN')}
                  </span>
                </div>

                <span
                  style={{
                    fontSize: '12px',
                    fontWeight: 700,
                    color: spending.isOverBudget
                      ? 'var(--danger)'
                      : spending.isWarning
                      ? 'var(--warning)'
                      : 'var(--success)',
                  }}
                >
                  {spending.isOverBudget
                    ? `Over by ₹${(spending.spent - budget.limitAmount).toLocaleString('en-IN')}`
                    : `₹${spending.remaining.toLocaleString('en-IN')} left`}
                </span>
              </div>

              {/* Progress bar */}
              <div
                style={{
                  height: '8px',
                  borderRadius: '4px',
                  background: 'var(--bg-surface)',
                  overflow: 'hidden',
                  marginBottom: '6px',
                }}
              >
                <div
                  style={{
                    height: '100%',
                    width: `${pct}%`,
                    background: spending.isOverBudget
                      ? 'var(--danger)'
                      : spending.isWarning
                      ? 'var(--warning)'
                      : 'var(--primary)',
                    borderRadius: '4px',
                    transition: 'width 0.3s ease',
                  }}
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '10px', color: 'var(--text-muted)' }}>
                <span>{Math.round(spending.percentage)}% consumed</span>
                <span>Monthly Cap: ₹{budget.limitAmount.toLocaleString('en-IN')}</span>
              </div>
            </div>
          );
        })}
      </div>

      {/* Unbudgeted Active Categories Prompt */}
      {unbudgetedCategories.length > 0 && (
        <div className="fp-card" style={{ marginBottom: '20px', background: 'var(--bg-card)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px' }}>
            <Sparkles size={16} color="var(--primary-light)" />
            <span style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-primary)' }}>
              Categories Without Budgets
            </span>
          </div>
          <p style={{ fontSize: '12px', color: 'var(--text-secondary)', margin: '0 0 12px 0' }}>
            You spent money in these categories this month with no spending limit set:
          </p>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {unbudgetedCategories.map(item => (
              <div
                key={item.category}
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  background: 'var(--bg-surface)',
                  padding: '8px 12px',
                  borderRadius: '10px',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span>{categoryIcons[item.category] || '🏷️'}</span>
                  <div>
                    <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-primary)' }}>
                      {item.category}
                    </div>
                    <div style={{ fontSize: '10px', color: 'var(--text-muted)' }}>
                      ₹{item.spent.toLocaleString('en-IN')} spent this month
                    </div>
                  </div>
                </div>

                <button
                  onClick={() => {
                    setEditingBudget(null);
                    setShowCreateModal(true);
                  }}
                  className="btn-secondary"
                  style={{
                    padding: '4px 10px',
                    fontSize: '11px',
                    color: 'var(--primary-light)',
                    borderColor: 'var(--primary)',
                  }}
                >
                  Set Cap
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Financial Discipline Tip */}
      <div
        style={{
          background: 'rgba(20, 184, 166, 0.08)',
          border: '1px solid rgba(20, 184, 166, 0.2)',
          borderRadius: '14px',
          padding: '14px',
          display: 'flex',
          alignItems: 'center',
          gap: '10px',
        }}
      >
        <ShieldCheck size={22} color="var(--primary)" style={{ flexShrink: 0 }} />
        <div style={{ fontSize: '11.5px', color: 'var(--text-secondary)', lineHeight: '1.45' }}>
          <strong>FinPocket Smart Defense:</strong> Keeping category limits under 80% prevents impulse withdrawals from your locked emergency fund.
        </div>
      </div>

      {/* Create / Edit Budget Sheet Modal */}
      <CreateBudgetModal
        isOpen={showCreateModal}
        onClose={() => {
          setShowCreateModal(false);
          setEditingBudget(null);
        }}
        editingBudget={editingBudget}
      />
    </div>
  );
};
