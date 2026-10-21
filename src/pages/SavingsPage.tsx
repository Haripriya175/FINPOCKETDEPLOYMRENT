import React, { useState } from 'react';
import { useFinance } from '../contexts/FinanceContext';
import { useLanguage } from '../contexts/LanguageContext';
import {
  Lock,
  Unlock,
  PlusCircle,
  PiggyBank,
  TrendingUp,
  ShieldCheck,
  AlertTriangle,
  History,
  Calendar,
  CheckCircle2,
  Sparkles,
  ArrowDownCircle,
} from 'lucide-react';
import confetti from 'canvas-confetti';

interface SavingsPageProps {
  onRequestPin: (onVerified: () => void) => void;
}

export const SavingsPage: React.FC<SavingsPageProps> = ({ onRequestPin }) => {
  const {
    emergencyFund,
    savingsGoals,
    autoSaveRules,
    bankAccounts,
    depositEmergencyFund,
    withdrawEmergencyFund,
    toggleLockEmergencyFund,
    setEmergencyTarget,
    createSavingsGoal,
    contributeToGoal,
  } = useFinance();
  const { t } = useLanguage();

  const [activeTab, setActiveTab] = useState<'EMERGENCY' | 'GOALS' | 'AUTOSAVE'>('EMERGENCY');

  // Modals & Inputs
  const [showAddDepositModal, setShowAddDepositModal] = useState(false);
  const [depositAmount, setDepositAmount] = useState('');
  const [showWithdrawModal, setShowWithdrawModal] = useState(false);
  const [withdrawAmount, setWithdrawAmount] = useState('');
  const [withdrawReason, setWithdrawReason] = useState('');

  const [showNewGoalModal, setShowNewGoalModal] = useState(false);
  const [goalName, setGoalName] = useState('');
  const [goalTarget, setGoalTarget] = useState('');
  const [goalDate, setGoalDate] = useState('2026-12-31');
  const [goalMonthly, setGoalMonthly] = useState('');
  const [goalCategory, setGoalCategory] = useState<'TECH' | 'VEHICLE' | 'EDUCATION' | 'VACATION' | 'WEDDING' | 'OTHER'>('TECH');

  const [showGoalContributeModal, setShowGoalContributeModal] = useState<string | null>(null);
  const [goalContributeAmount, setGoalContributeAmount] = useState('');

  const emergencyProgress =
    emergencyFund.targetAmount > 0
      ? Math.min(100, Math.round((emergencyFund.currentAmount / emergencyFund.targetAmount) * 100))
      : 0;

  // Deposit handler
  const handleDepositSubmit = () => {
    const amt = parseFloat(depositAmount);
    if (isNaN(amt) || amt <= 0) {
      alert('Please enter a valid amount greater than ₹0.');
      return;
    }
    const res = depositEmergencyFund(amt, 'Transfer to Emergency Shield');
    if (!res.success) {
      alert(res.message || 'Transfer failed.');
      return;
    }
    try {
      confetti({ particleCount: 50, spread: 50 });
    } catch {}
    setDepositAmount('');
    setShowAddDepositModal(false);
  };

  // Withdraw handler with PIN & Warning
  const handleWithdrawSubmit = () => {
    const amt = parseFloat(withdrawAmount);
    if (amt > 0) {
      onRequestPin(() => {
        const res = withdrawEmergencyFund(amt, withdrawReason || 'Emergency medical/repair expense');
        if (res.success) {
          setWithdrawAmount('');
          setWithdrawReason('');
          setShowWithdrawModal(false);
        } else {
          alert(res.message);
        }
      });
    }
  };

  // Toggle Lock mechanism
  const handleToggleLock = () => {
    if (emergencyFund.isLocked) {
      // Unlocking requires PIN verification
      onRequestPin(() => {
        toggleLockEmergencyFund(false, 'User confirmed unlock with PIN');
      });
    } else {
      // Locking can be done instantly
      toggleLockEmergencyFund(true, 'User enabled fund lock');
    }
  };

  // Create Goal handler
  const handleCreateGoalSubmit = () => {
    const target = parseFloat(goalTarget);
    const monthly = parseFloat(goalMonthly) || target / 12;
    if (goalName.trim() && target > 0) {
      createSavingsGoal(goalName, target, goalDate, monthly, goalCategory);
      setGoalName('');
      setGoalTarget('');
      setShowNewGoalModal(false);
    }
  };

  // Goal contribute
  const handleContributeGoalSubmit = (goalId: string) => {
    const amt = parseFloat(goalContributeAmount);
    if (amt > 0) {
      contributeToGoal(goalId, amt);
      try {
        confetti({ particleCount: 50, spread: 50 });
      } catch {}
      setGoalContributeAmount('');
      setShowGoalContributeModal(null);
    }
  };

  return (
    <div className="mobile-body animate-fade">
      <h2 style={{ fontSize: '20px', fontWeight: 800, margin: '0 0 16px 0', color: 'var(--text-primary)' }}>
        {t.navSavings}
      </h2>

      {/* Sub tabs */}
      <div style={{ display: 'flex', gap: '8px', marginBottom: '16px' }}>
        {(['EMERGENCY', 'GOALS', 'AUTOSAVE'] as const).map(tab => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            style={{
              flex: 1,
              padding: '8px 4px',
              borderRadius: '10px',
              background: activeTab === tab ? 'var(--primary)' : 'var(--bg-card)',
              color: activeTab === tab ? '#ffffff' : 'var(--text-secondary)',
              border: '1px solid var(--border-color)',
              fontSize: '11px',
              fontWeight: 700,
              cursor: 'pointer',
              textTransform: 'uppercase',
              letterSpacing: '0.4px',
            }}
          >
            {tab === 'EMERGENCY' ? 'Emergency Fund' : tab === 'GOALS' ? 'Savings Goals' : 'Auto-Save'}
          </button>
        ))}
      </div>

      {activeTab === 'EMERGENCY' && (
        <div>
          {/* Emergency Fund Card */}
          <div
            className="fp-card"
            style={{
              background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 100%)',
              border: '1px solid rgba(20, 184, 166, 0.3)',
              padding: '20px',
              borderRadius: 'var(--radius-lg)',
              marginBottom: '16px',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
              <div>
                <span style={{ fontSize: '12px', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.4px', fontWeight: 600 }}>
                  {t.emergencyFundTitle}
                </span>
                <div style={{ fontSize: '28px', fontWeight: 800, color: '#ffffff', marginTop: '2px' }}>
                  ₹{emergencyFund.currentAmount.toLocaleString('en-IN')}
                </div>
              </div>

              {/* Lock Switch */}
              <button
                onClick={handleToggleLock}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  background: emergencyFund.isLocked ? 'rgba(20, 184, 166, 0.2)' : 'rgba(245, 158, 11, 0.2)',
                  color: emergencyFund.isLocked ? 'var(--primary-light)' : 'var(--warning)',
                  border: '1px solid currentColor',
                  borderRadius: '20px',
                  padding: '6px 12px',
                  fontSize: '12px',
                  fontWeight: 700,
                  cursor: 'pointer',
                }}
              >
                {emergencyFund.isLocked ? <Lock size={14} /> : <Unlock size={14} />}
                <span>{emergencyFund.isLocked ? 'Locked' : 'Unlocked'}</span>
              </button>
            </div>

            {/* Target & Progress */}
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', color: 'var(--text-muted)', marginBottom: '6px' }}>
              <span>Target: ₹{emergencyFund.targetAmount.toLocaleString('en-IN')}</span>
              <span style={{ fontWeight: 700, color: 'var(--primary-light)' }}>{emergencyProgress}%</span>
            </div>

            <div
              style={{
                height: '10px',
                borderRadius: '5px',
                background: 'var(--bg-surface)',
                overflow: 'hidden',
                marginBottom: '16px',
              }}
            >
              <div
                style={{
                  width: `${emergencyProgress}%`,
                  height: '100%',
                  background: 'linear-gradient(90deg, #14b8a6 0%, #0ea5e9 100%)',
                  borderRadius: '5px',
                }}
              />
            </div>

            {/* Deposit & Withdraw Buttons */}
            <div style={{ display: 'flex', gap: '10px' }}>
              <button
                className="btn-primary"
                onClick={() => setShowAddDepositModal(true)}
                style={{ flex: 1, padding: '10px' }}
              >
                <PlusCircle size={16} />
                <span>{t.addMoney}</span>
              </button>

              <button
                className="btn-secondary"
                onClick={() => setShowWithdrawModal(true)}
                style={{ flex: 1, padding: '10px' }}
              >
                <ArrowDownCircle size={16} />
                <span>{t.withdrawMoney}</span>
              </button>
            </div>
          </div>

          {/* Locked Notice Alert */}
          {emergencyFund.isLocked && (
            <div
              style={{
                background: 'rgba(20, 184, 166, 0.1)',
                border: '1px solid rgba(20, 184, 166, 0.25)',
                borderRadius: '12px',
                padding: '12px',
                marginBottom: '16px',
                display: 'flex',
                gap: '10px',
                alignItems: 'center',
              }}
            >
              <ShieldCheck size={22} color="var(--primary-light)" />
              <p style={{ fontSize: '12px', color: 'var(--text-secondary)', margin: 0, lineHeight: '1.4' }}>
                {t.fundLockedNotice}
              </p>
            </div>
          )}

          {/* Audit History Log */}
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '10px' }}>
              <History size={16} color="var(--text-secondary)" />
              <span style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-primary)' }}>
                Emergency Fund Audit Log
              </span>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {emergencyFund.auditLog.map(log => (
                <div
                  key={log.id}
                  className="fp-card"
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    padding: '10px 12px',
                    fontSize: '12px',
                  }}
                >
                  <div>
                    <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>
                      {log.action === 'DEPOSIT'
                        ? `Deposit: +₹${log.amount?.toLocaleString('en-IN')}`
                        : log.action === 'WITHDRAW'
                        ? `Emergency Withdraw: -₹${log.amount?.toLocaleString('en-IN')}`
                        : log.action === 'LOCK'
                        ? 'Fund Locked'
                        : 'Fund Unlocked with PIN'}
                    </div>
                    {log.reason && (
                      <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px' }}>
                        {log.reason}
                      </div>
                    )}
                  </div>

                  <span style={{ fontSize: '10px', color: 'var(--text-muted)' }}>
                    {new Date(log.timestamp).toLocaleDateString('en-IN', { month: 'short', day: 'numeric' })}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {activeTab === 'GOALS' && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
            <span style={{ fontSize: '14px', fontWeight: 700, color: 'var(--text-primary)' }}>
              {t.savingsGoals} ({savingsGoals.length})
            </span>
            <button
              onClick={() => setShowNewGoalModal(true)}
              style={{
                background: 'none',
                border: 'none',
                color: 'var(--primary-light)',
                display: 'flex',
                alignItems: 'center',
                gap: '4px',
                fontSize: '12px',
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              <PlusCircle size={14} />
              <span>{t.createGoal}</span>
            </button>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {savingsGoals.map(goal => {
              const pct = Math.min(100, Math.round((goal.currentAmount / goal.targetAmount) * 100));
              return (
                <div key={goal.id} className="fp-card">
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '8px' }}>
                    <div>
                      <h4 style={{ fontSize: '15px', fontWeight: 700, margin: 0, color: 'var(--text-primary)' }}>
                        {goal.name}
                      </h4>
                      <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                        Target: {new Date(goal.targetDate).toLocaleDateString('en-IN', { month: 'short', year: 'numeric' })}
                      </span>
                    </div>

                    <span className={goal.status === 'COMPLETED' ? 'badge badge-success' : 'badge badge-teal'}>
                      {goal.status === 'COMPLETED' ? 'Completed' : `${pct}%`}
                    </span>
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '6px' }}>
                    <span style={{ fontSize: '16px', fontWeight: 800, color: 'var(--text-primary)' }}>
                      ₹{goal.currentAmount.toLocaleString('en-IN')}
                    </span>
                    <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                      of ₹{goal.targetAmount.toLocaleString('en-IN')}
                    </span>
                  </div>

                  {/* Progress bar */}
                  <div style={{ height: '8px', borderRadius: '4px', background: 'var(--bg-surface)', overflow: 'hidden', marginBottom: '12px' }}>
                    <div
                      style={{
                        width: `${pct}%`,
                        height: '100%',
                        background: goal.status === 'COMPLETED' ? 'var(--success)' : 'linear-gradient(90deg, #14b8a6, #0ea5e9)',
                      }}
                    />
                  </div>

                  {goal.status !== 'COMPLETED' && (
                    <button
                      className="btn-secondary"
                      onClick={() => setShowGoalContributeModal(goal.id)}
                      style={{ width: '100%', padding: '8px', fontSize: '12px' }}
                    >
                      <PlusCircle size={14} />
                      <span>Add Savings Contribution</span>
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {activeTab === 'AUTOSAVE' && (
        <div>
          <div style={{ marginBottom: '16px' }}>
            <span style={{ fontSize: '14px', fontWeight: 700, color: 'var(--text-primary)' }}>
              {t.autoSaveRules}
            </span>
            <p style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '2px' }}>
              Automate small daily or monthly transfers to build continuous saving habits effortlessly.
            </p>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {autoSaveRules.map(rule => (
              <div key={rule.id} className="fp-card">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                  <span style={{ fontSize: '14px', fontWeight: 700, color: 'var(--text-primary)' }}>
                    {rule.title}
                  </span>
                  <span className="badge badge-success">Active</span>
                </div>

                <div style={{ fontSize: '18px', fontWeight: 800, color: 'var(--primary-light)', marginBottom: '4px' }}>
                  {rule.frequency === 'PERCENT_INCOME' ? `${rule.percentage}% of Monthly Salary` : `₹${rule.amount} / Day`}
                </div>

                <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                  Destination: {rule.destination === 'EMERGENCY_FUND' ? 'Locked Emergency Fund' : 'MacBook Pro Goal'}
                </div>

                <div
                  style={{
                    background: 'var(--bg-surface)',
                    padding: '10px',
                    borderRadius: '8px',
                    marginTop: '10px',
                    fontSize: '12px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    color: 'var(--text-primary)',
                  }}
                >
                  <Sparkles size={14} color="var(--primary-light)" />
                  <span>
                    {rule.frequency === 'DAILY'
                      ? '≈ ₹36,500 estimated accumulation per year.'
                      : '≈ ₹66,000 estimated yearly savings habit.'}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Add Deposit Modal */}
      {showAddDepositModal && (
        <div className="modal-overlay animate-fade">
          <div className="modal-sheet animate-slide-up">
            <div className="sheet-handle" />
            <h3 style={{ fontSize: '18px', fontWeight: 700, margin: '0 0 10px 0' }}>Transfer to Emergency Shield</h3>

            {/* Bank source card */}
            <div style={{
              background: 'rgba(20, 184, 166, 0.08)',
              border: '1px solid rgba(20, 184, 166, 0.25)',
              borderRadius: '10px',
              padding: '10px 12px',
              marginBottom: '14px',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              fontSize: '12px'
            }}>
              <div>
                <span style={{ color: 'var(--text-secondary)' }}>Source Account:</span>
                <div style={{ fontWeight: 700, color: 'var(--text-primary)' }}>
                  {bankAccounts[0]?.bankName || 'Primary Bank Account'}
                </div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <span style={{ color: 'var(--text-secondary)' }}>Available:</span>
                <div style={{ fontWeight: 700, color: 'var(--primary-light)' }}>
                  ₹{(bankAccounts[0]?.availableBalance || 0).toLocaleString('en-IN')}
                </div>
              </div>
            </div>

            {/* Quick chips */}
            <div style={{ display: 'flex', gap: '8px', marginBottom: '14px' }}>
              {[1000, 2500, 5000, 10000].map(val => (
                <button
                  key={val}
                  type="button"
                  onClick={() => setDepositAmount(val.toString())}
                  style={{
                    flex: 1,
                    padding: '6px 4px',
                    borderRadius: '8px',
                    background: 'var(--bg-card)',
                    border: '1px solid var(--border-color)',
                    color: 'var(--text-primary)',
                    fontSize: '11px',
                    fontWeight: 600,
                    cursor: 'pointer'
                  }}
                >
                  +₹{val.toLocaleString('en-IN')}
                </button>
              ))}
            </div>

            <div style={{ marginBottom: '16px' }}>
              <label style={{ display: 'block', fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '6px' }}>
                Deposit Amount (₹)
              </label>
              <input
                type="number"
                className="fp-input"
                placeholder="e.g. 5000"
                value={depositAmount}
                onChange={e => setDepositAmount(e.target.value)}
                autoFocus
              />
            </div>
            <div style={{ display: 'flex', gap: '10px' }}>
              <button className="btn-secondary" onClick={() => setShowAddDepositModal(false)} style={{ flex: 1 }}>
                Cancel
              </button>
              <button className="btn-primary" onClick={handleDepositSubmit} style={{ flex: 1 }}>
                Confirm Transfer
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Withdraw Modal */}
      {showWithdrawModal && (
        <div className="modal-overlay animate-fade">
          <div className="modal-sheet animate-slide-up">
            <div className="sheet-handle" />
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--warning)', marginBottom: '8px' }}>
              <AlertTriangle size={20} />
              <h3 style={{ fontSize: '18px', fontWeight: 700, margin: 0 }}>Emergency Withdrawal</h3>
            </div>
            <p style={{ fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '14px' }}>
              Emergency funds are intended for medical or critical life events. You will be required to authenticate with your PIN.
            </p>
            <div style={{ marginBottom: '12px' }}>
              <label style={{ display: 'block', fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '6px' }}>
                Amount to Withdraw (₹)
              </label>
              <input
                type="number"
                className="fp-input"
                placeholder="e.g. 2000"
                value={withdrawAmount}
                onChange={e => setWithdrawAmount(e.target.value)}
              />
            </div>
            <div style={{ marginBottom: '20px' }}>
              <label style={{ display: 'block', fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '6px' }}>
                Reason for Emergency Withdrawal
              </label>
              <input
                className="fp-input"
                placeholder="e.g. Car repair, dental bill"
                value={withdrawReason}
                onChange={e => setWithdrawReason(e.target.value)}
              />
            </div>
            <div style={{ display: 'flex', gap: '10px' }}>
              <button className="btn-secondary" onClick={() => setShowWithdrawModal(false)} style={{ flex: 1 }}>
                Cancel
              </button>
              <button className="btn-primary btn-danger" onClick={handleWithdrawSubmit} style={{ flex: 1 }}>
                Authenticate & Withdraw
              </button>
            </div>
          </div>
        </div>
      )}

      {/* New Goal Modal */}
      {showNewGoalModal && (
        <div className="modal-overlay animate-fade">
          <div className="modal-sheet animate-slide-up">
            <div className="sheet-handle" />
            <h3 style={{ fontSize: '18px', fontWeight: 700, margin: '0 0 12px 0' }}>Create Savings Goal</h3>
            <div style={{ marginBottom: '12px' }}>
              <label style={{ display: 'block', fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '4px' }}>Goal Name</label>
              <input className="fp-input" placeholder="e.g. New Laptop, Vacation" value={goalName} onChange={e => setGoalName(e.target.value)} />
            </div>
            <div style={{ marginBottom: '12px' }}>
              <label style={{ display: 'block', fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '4px' }}>Target Amount (₹)</label>
              <input type="number" className="fp-input" placeholder="80000" value={goalTarget} onChange={e => setGoalTarget(e.target.value)} />
            </div>
            <div style={{ marginBottom: '20px' }}>
              <label style={{ display: 'block', fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '4px' }}>Target Date</label>
              <input type="date" className="fp-input" value={goalDate} onChange={e => setGoalDate(e.target.value)} />
            </div>
            <div style={{ display: 'flex', gap: '10px' }}>
              <button className="btn-secondary" onClick={() => setShowNewGoalModal(false)} style={{ flex: 1 }}>
                Cancel
              </button>
              <button className="btn-primary" onClick={handleCreateGoalSubmit} style={{ flex: 1 }}>
                Save Goal
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Goal Contribute Modal */}
      {showGoalContributeModal && (
        <div className="modal-overlay animate-fade">
          <div className="modal-sheet animate-slide-up">
            <div className="sheet-handle" />
            <h3 style={{ fontSize: '18px', fontWeight: 700, margin: '0 0 12px 0' }}>Contribute to Goal</h3>
            <div style={{ marginBottom: '16px' }}>
              <label style={{ display: 'block', fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '6px' }}>Contribution Amount (₹)</label>
              <input
                type="number"
                className="fp-input"
                placeholder="e.g. 5000"
                value={goalContributeAmount}
                onChange={e => setGoalContributeAmount(e.target.value)}
              />
            </div>
            <div style={{ display: 'flex', gap: '10px' }}>
              <button className="btn-secondary" onClick={() => setShowGoalContributeModal(null)} style={{ flex: 1 }}>
                Cancel
              </button>
              <button className="btn-primary" onClick={() => handleContributeGoalSubmit(showGoalContributeModal)} style={{ flex: 1 }}>
                Confirm Contribution
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
