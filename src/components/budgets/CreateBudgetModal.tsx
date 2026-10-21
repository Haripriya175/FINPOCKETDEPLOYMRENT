import React, { useState, useEffect } from 'react';
import { useFinance } from '../../contexts/FinanceContext';
import { Budget, TransactionCategory } from '../../types';
import {
  X,
  PieChart,
  Bell,
  AlertTriangle,
  CheckCircle2,
  DollarSign,
  Layers,
} from 'lucide-react';

interface CreateBudgetModalProps {
  isOpen: boolean;
  onClose: () => void;
  editingBudget?: Budget | null;
}

const availableCategories: Array<{ key: TransactionCategory | 'ALL'; label: string; icon: string }> = [
  { key: 'ALL', label: 'Overall Monthly Spending', icon: '💳' },
  { key: 'Food', label: 'Food & Dining', icon: '🍔' },
  { key: 'Shopping', label: 'Shopping & E-Commerce', icon: '🛍️' },
  { key: 'Travel', label: 'Travel & Commute', icon: '🚕' },
  { key: 'Bills', label: 'Utilities & Bills', icon: '⚡' },
  { key: 'Entertainment', label: 'Entertainment & OTT', icon: '🎬' },
  { key: 'Health', label: 'Healthcare & Medical', icon: '💊' },
  { key: 'Rent', label: 'Rent & Housing', icon: '🏠' },
  { key: 'Education', label: 'Education & Courses', icon: '📚' },
  { key: 'Other', label: 'Miscellaneous / Other', icon: '🏷️' },
];

export const CreateBudgetModal: React.FC<CreateBudgetModalProps> = ({
  isOpen,
  onClose,
  editingBudget,
}) => {
  const { createBudget, updateBudget, getBudgetSpending } = useFinance();

  const [category, setCategory] = useState<TransactionCategory | 'ALL'>('Food');
  const [limitAmount, setLimitAmount] = useState<string>('5000');
  const [alertThreshold, setAlertThreshold] = useState<number>(80);
  const [notificationsEnabled, setNotificationsEnabled] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (editingBudget) {
      setCategory(editingBudget.category);
      setLimitAmount(editingBudget.limitAmount.toString());
      setAlertThreshold(editingBudget.alertThresholdPercent);
      setNotificationsEnabled(editingBudget.notificationsEnabled);
    } else {
      setCategory('Food');
      setLimitAmount('5000');
      setAlertThreshold(80);
      setNotificationsEnabled(true);
    }
    setError(null);
  }, [editingBudget, isOpen]);

  if (!isOpen) return null;

  // Real-time current month spending for selected category
  const currentSpending = getBudgetSpending(category);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const parsedLimit = parseFloat(limitAmount);
    if (isNaN(parsedLimit) || parsedLimit <= 0) {
      setError('Please enter a valid spending limit greater than ₹0.');
      return;
    }

    if (editingBudget) {
      updateBudget(editingBudget.id, {
        category,
        limitAmount: parsedLimit,
        alertThresholdPercent: alertThreshold,
        notificationsEnabled,
      });
    } else {
      createBudget(category, parsedLimit, alertThreshold, 'MONTHLY');
    }

    onClose();
  };

  const handleQuickAmount = (val: number) => {
    setLimitAmount(val.toString());
    setError(null);
  };

  return (
    <div className="modal-overlay animate-fade" style={{ zIndex: 1200 }}>
      <div
        className="modal-sheet animate-slide-up"
        style={{
          maxHeight: '90vh',
          display: 'flex',
          flexDirection: 'column',
          padding: '24px 20px',
        }}
      >
        <div className="sheet-handle" />

        {/* Modal Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '18px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div
              style={{
                width: '40px',
                height: '40px',
                borderRadius: '12px',
                background: 'rgba(20, 184, 166, 0.15)',
                color: 'var(--primary)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <PieChart size={22} />
            </div>
            <div>
              <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 800, color: 'var(--text-primary)' }}>
                {editingBudget ? 'Edit Spending Budget' : 'Set New Spending Budget'}
              </h3>
              <p style={{ margin: 0, fontSize: '12px', color: 'var(--text-secondary)' }}>
                Set limits and avoid impulse overspending
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            style={{
              background: 'var(--bg-surface)',
              border: '1px solid var(--border-color)',
              borderRadius: '50%',
              width: '32px',
              height: '32px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'var(--text-secondary)',
              cursor: 'pointer',
            }}
          >
            <X size={18} />
          </button>
        </div>

        {error && (
          <div
            style={{
              background: 'rgba(239, 68, 68, 0.12)',
              border: '1px solid var(--danger)',
              borderRadius: '10px',
              padding: '10px 14px',
              color: 'var(--danger)',
              fontSize: '12px',
              fontWeight: 600,
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              marginBottom: '14px',
            }}
          >
            <AlertTriangle size={16} />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} style={{ overflowY: 'auto', flex: 1, paddingRight: '4px' }}>
          {/* Category Select */}
          <div style={{ marginBottom: '16px' }}>
            <label style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-secondary)', display: 'block', marginBottom: '8px' }}>
              SELECT SPENDING CATEGORY
            </label>

            <select
              className="fp-input"
              value={category}
              onChange={e => setCategory(e.target.value as TransactionCategory | 'ALL')}
              style={{ fontSize: '13px', padding: '11px 12px' }}
            >
              {availableCategories.map(c => (
                <option key={c.key} value={c.key}>
                  {c.icon} {c.label}
                </option>
              ))}
            </select>

            {/* Current month benchmark snippet */}
            <div
              style={{
                marginTop: '8px',
                fontSize: '11.5px',
                color: 'var(--text-muted)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
              }}
            >
              <span>Current month spent so far:</span>
              <strong style={{ color: currentSpending.spent > 0 ? 'var(--primary-light)' : 'var(--text-secondary)' }}>
                ₹{currentSpending.spent.toLocaleString('en-IN')}
              </strong>
            </div>
          </div>

          {/* Monthly Limit Input */}
          <div style={{ marginBottom: '16px' }}>
            <label style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-secondary)', display: 'block', marginBottom: '8px' }}>
              MONTHLY BUDGET LIMIT (₹)
            </label>

            <div style={{ position: 'relative' }}>
              <span
                style={{
                  position: 'absolute',
                  left: '14px',
                  top: '12px',
                  fontSize: '18px',
                  fontWeight: 800,
                  color: 'var(--primary)',
                }}
              >
                ₹
              </span>
              <input
                type="number"
                step="100"
                min="100"
                className="fp-input"
                value={limitAmount}
                onChange={e => {
                  setLimitAmount(e.target.value);
                  setError(null);
                }}
                placeholder="5000"
                style={{ paddingLeft: '32px', fontSize: '18px', fontWeight: 800, color: 'var(--text-primary)' }}
              />
            </div>

            {/* Quick Amount Pills */}
            <div style={{ display: 'flex', gap: '6px', marginTop: '8px', overflowX: 'auto', paddingBottom: '4px' }}>
              {[2000, 5000, 10000, 20000, 35000].map(amt => (
                <button
                  key={amt}
                  type="button"
                  onClick={() => handleQuickAmount(amt)}
                  style={{
                    background: limitAmount === amt.toString() ? 'var(--primary)' : 'var(--bg-surface)',
                    color: limitAmount === amt.toString() ? '#ffffff' : 'var(--text-secondary)',
                    border: '1px solid var(--border-color)',
                    borderRadius: '8px',
                    padding: '4px 10px',
                    fontSize: '11px',
                    fontWeight: 600,
                    cursor: 'pointer',
                    whiteSpace: 'nowrap',
                  }}
                >
                  ₹{amt >= 1000 ? `${amt / 1000}k` : amt}
                </button>
              ))}
            </div>
          </div>

          {/* Alert Threshold */}
          <div style={{ marginBottom: '18px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
              <label style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-secondary)', margin: 0 }}>
                WARNING THRESHOLD
              </label>
              <span style={{ fontSize: '12px', fontWeight: 700, color: 'var(--primary)' }}>
                {alertThreshold}% of Limit
              </span>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '6px' }}>
              {[70, 80, 90, 100].map(pct => (
                <button
                  key={pct}
                  type="button"
                  onClick={() => setAlertThreshold(pct)}
                  style={{
                    background: alertThreshold === pct ? 'rgba(20, 184, 166, 0.2)' : 'var(--bg-surface)',
                    color: alertThreshold === pct ? 'var(--primary-light)' : 'var(--text-secondary)',
                    border: alertThreshold === pct ? '1px solid var(--primary)' : '1px solid var(--border-color)',
                    borderRadius: '8px',
                    padding: '8px',
                    fontSize: '11px',
                    fontWeight: 700,
                    cursor: 'pointer',
                  }}
                >
                  {pct}%
                </button>
              ))}
            </div>
            <p style={{ margin: '6px 0 0', fontSize: '11px', color: 'var(--text-muted)' }}>
              FinPocket will alert you when you reach {alertThreshold}% (₹{Math.round((parseFloat(limitAmount || '0') * alertThreshold) / 100).toLocaleString('en-IN')}).
            </p>
          </div>

          {/* Notifications Toggle */}
          <div
            style={{
              background: 'var(--bg-surface)',
              border: '1px solid var(--border-color)',
              borderRadius: '12px',
              padding: '12px 14px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              marginBottom: '20px',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <Bell size={18} color="var(--primary)" />
              <div>
                <div style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-primary)' }}>
                  In-App & Push Alerts
                </div>
                <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                  Notify before transactions breach your limit
                </div>
              </div>
            </div>

            <input
              type="checkbox"
              checked={notificationsEnabled}
              onChange={e => setNotificationsEnabled(e.target.checked)}
              style={{ width: '18px', height: '18px', accentColor: 'var(--primary)', cursor: 'pointer' }}
            />
          </div>

          {/* Modal Actions */}
          <div style={{ display: 'flex', gap: '10px' }}>
            <button
              type="button"
              className="btn-secondary"
              onClick={onClose}
              style={{ flex: 1, padding: '12px' }}
            >
              Cancel
            </button>

            <button
              type="submit"
              className="btn-primary"
              style={{
                flex: 2,
                padding: '12px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '8px',
              }}
            >
              <CheckCircle2 size={16} />
              <span>{editingBudget ? 'Save Changes' : 'Create Budget'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
