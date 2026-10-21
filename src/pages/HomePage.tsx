import React, { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useFinance } from '../contexts/FinanceContext';
import { useLanguage } from '../contexts/LanguageContext';
import { useChildCare } from '../contexts/ChildCareContext';
import { TabType } from '../components/navigation/BottomNav';
import {
  Eye,
  EyeOff,
  Send,
  QrCode,
  ScanLine,
  ArrowDownLeft,
  Lock,
  Unlock,
  TrendingUp,
  TrendingDown,
  ChevronRight,
  ShieldCheck,
  Sparkles,
  Calendar,
  AlertCircle,
  FileText,
  PieChart,
  Target,
  Volume2,
  VolumeX,
  X,
} from 'lucide-react';
import { AIAssistantService } from '../services/aiAssistant';
import { ExportReportModal } from '../components/reports/ExportReportModal';
import { ttsService } from '../services/tts';

interface HomePageProps {
  onNavigate: (tab: TabType) => void;
  onSendMoney: () => void;
  onReceiveQr: () => void;
  onScanQr: () => void;
}

export const HomePage: React.FC<HomePageProps> = ({
  onNavigate,
  onSendMoney,
  onReceiveQr,
  onScanQr,
}) => {
  const { user } = useAuth();
  const {
    totalAvailableBalance,
    totalSavings,
    emergencyFund,
    thisMonthSpent,
    thisMonthIncome,
    thisMonthSaved,
    transactions,
    bills,
    budgets,
    getBudgetSpending,
  } = useFinance();
  const { language, t } = useLanguage();
  const { isChildCareActive } = useChildCare();

  const [hideBalance, setHideBalance] = useState(false);
  const [showExportModal, setShowExportModal] = useState<boolean>(false);
  const [showSafeToSpendModal, setShowSafeToSpendModal] = useState<boolean>(false);
  const [isSpeaking, setIsSpeaking] = useState<boolean>(false);

  // Time-based greeting
  const hour = new Date().getHours();
  const greeting = hour < 12 ? t.greetingMorning : hour < 17 ? t.greetingAfternoon : t.greetingEvening;

  const now = new Date();
  const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  const remainingDaysInMonth = Math.max(1, daysInMonth - now.getDate() + 1);
  const safeToSpendToday = Math.max(0, Math.round((totalAvailableBalance / remainingDaysInMonth) * 100) / 100);

  const handleToggleVoiceTour = () => {
    if (isSpeaking) {
      ttsService.stop();
      setIsSpeaking(false);
    } else {
      const text = ttsService.getHomeNarration(
        language,
        totalAvailableBalance,
        safeToSpendToday,
        emergencyFund.currentAmount,
        user?.fullName?.split(' ')[0] || 'User',
        remainingDaysInMonth
      );
      ttsService.speak(text, language, () => setIsSpeaking(false));
      setIsSpeaking(true);
    }
  };

  const emergencyProgress =
    emergencyFund.targetAmount > 0
      ? Math.min(100, Math.round((emergencyFund.currentAmount / emergencyFund.targetAmount) * 100))
      : 0;

  const unpaidBills = bills.filter(b => !b.isPaidThisMonth);
  const dailyTip = AIAssistantService.getDailySavingTip();
  const shouldMask = isChildCareActive || hideBalance;

  return (
    <div className="mobile-body animate-fade">
      {/* 1. Greeting & User Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
        <div>
          <span style={{ fontSize: '12px', color: 'var(--text-secondary)', fontWeight: 500 }}>
            {greeting},
          </span>
          <h2 style={{ fontSize: '20px', fontWeight: 800, color: 'var(--text-primary)', margin: '2px 0 0 0' }}>
            {user?.fullName?.split(' ')[0] || 'User'} 👋
          </h2>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <button
            onClick={handleToggleVoiceTour}
            title={isSpeaking ? "Stop Voice Briefing" : "Listen to Voice Briefing"}
            style={{
              width: '40px',
              height: '40px',
              borderRadius: '50%',
              background: isSpeaking ? 'rgba(20, 184, 166, 0.25)' : 'var(--bg-surface)',
              border: isSpeaking ? '1.5px solid var(--primary)' : '1px solid var(--border-color)',
              color: isSpeaking ? 'var(--primary-light)' : 'var(--text-secondary)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
              transition: 'all 0.2s ease',
            }}
          >
            {isSpeaking ? <VolumeX size={18} /> : <Volume2 size={18} />}
          </button>

          <button
            onClick={() => onNavigate('profile')}
            style={{
              width: '40px',
              height: '40px',
              borderRadius: '50%',
              background: 'linear-gradient(135deg, rgba(20,184,166,0.2), rgba(14,165,233,0.2))',
              border: '1px solid var(--border-color)',
              color: 'var(--primary-light)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontWeight: 700,
              fontSize: '14px',
              cursor: 'pointer',
            }}
          >
            {user?.fullName ? user.fullName[0].toUpperCase() : 'FP'}
          </button>
        </div>
      </div>

      {/* 2. Main Available Balance Card */}
      <div
        className="fp-card"
        style={{
          background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 100%)',
          border: '1px solid rgba(20, 184, 166, 0.3)',
          borderRadius: 'var(--radius-lg)',
          padding: '20px',
          boxShadow: '0 8px 24px rgba(0,0,0,0.35)',
          marginBottom: '20px',
          position: 'relative',
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            position: 'absolute',
            right: '-20px',
            top: '-20px',
            width: '120px',
            height: '120px',
            borderRadius: '50%',
            background: 'radial-gradient(circle, rgba(20,184,166,0.15) 0%, transparent 70%)',
          }}
        />

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontSize: '12px', color: 'var(--text-secondary)', fontWeight: 600, letterSpacing: '0.4px', textTransform: 'uppercase' }}>
            {t.availableBalance}
          </span>
          <button
            onClick={() => setHideBalance(!hideBalance)}
            style={{
              background: 'none',
              border: 'none',
              color: 'var(--text-secondary)',
              cursor: 'pointer',
              padding: '4px',
            }}
          >
            {shouldMask ? <EyeOff size={16} /> : <Eye size={16} />}
          </button>
        </div>

        <div style={{ fontSize: '32px', fontWeight: 800, color: '#ffffff', margin: '8px 0 16px 0', letterSpacing: '-0.5px' }}>
          {shouldMask ? '₹ ••••••' : `₹${totalAvailableBalance.toLocaleString('en-IN', { minimumFractionDigits: 2 })}`}
        </div>

        {/* Quick Payment Action Pills */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(4, 1fr)',
            gap: '8px',
            borderTop: '1px solid rgba(148, 163, 184, 0.15)',
            paddingTop: '14px',
          }}
        >
          <button
            onClick={onSendMoney}
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: '6px',
              background: 'none',
              border: 'none',
              color: '#f8fafc',
              cursor: 'pointer',
            }}
          >
            <div
              style={{
                width: '38px',
                height: '38px',
                borderRadius: '50%',
                background: 'rgba(20, 184, 166, 0.2)',
                color: 'var(--primary-light)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Send size={18} />
            </div>
            <span style={{ fontSize: '11px', fontWeight: 600 }}>{t.send}</span>
          </button>

          <button
            onClick={onReceiveQr}
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: '6px',
              background: 'none',
              border: 'none',
              color: '#f8fafc',
              cursor: 'pointer',
            }}
          >
            <div
              style={{
                width: '38px',
                height: '38px',
                borderRadius: '50%',
                background: 'rgba(14, 165, 233, 0.2)',
                color: 'var(--accent-blue)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <QrCode size={18} />
            </div>
            <span style={{ fontSize: '11px', fontWeight: 600 }}>{t.receive}</span>
          </button>

          <button
            onClick={onScanQr}
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: '6px',
              background: 'none',
              border: 'none',
              color: '#f8fafc',
              cursor: 'pointer',
            }}
          >
            <div
              style={{
                width: '38px',
                height: '38px',
                borderRadius: '50%',
                background: 'rgba(139, 92, 246, 0.2)',
                color: 'var(--accent-purple)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <ScanLine size={18} />
            </div>
            <span style={{ fontSize: '11px', fontWeight: 600 }}>{t.scan}</span>
          </button>

          <button
            onClick={onSendMoney}
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: '6px',
              background: 'none',
              border: 'none',
              color: '#f8fafc',
              cursor: 'pointer',
            }}
          >
            <div
              style={{
                width: '38px',
                height: '38px',
                borderRadius: '50%',
                background: 'rgba(16, 185, 129, 0.2)',
                color: 'var(--accent-emerald)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <ArrowDownLeft size={18} />
            </div>
            <span style={{ fontSize: '11px', fontWeight: 600 }}>{t.request}</span>
          </button>
        </div>
      </div>

      {/* 2b. Safe to Spend (Today) Card */}
      <div
        className="fp-card fp-card-interactive"
        style={{
          marginBottom: '16px',
          background: 'linear-gradient(135deg, rgba(14, 165, 233, 0.1) 0%, rgba(20, 184, 166, 0.08) 100%)',
          border: '1px solid rgba(14, 165, 233, 0.3)',
          cursor: 'pointer',
        }}
        onClick={() => setShowSafeToSpendModal(true)}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <div
              style={{
                width: '28px',
                height: '28px',
                borderRadius: '8px',
                background: 'rgba(14, 165, 233, 0.2)',
                color: 'var(--accent-blue)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Target size={16} />
            </div>
            <span style={{ fontSize: '12px', fontWeight: 700, color: 'var(--accent-blue)', letterSpacing: '0.4px', textTransform: 'uppercase' }}>
              SAFE TO SPEND (TODAY)
            </span>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '12px', color: 'var(--accent-blue)', fontWeight: 600 }}>
            <span>Breakdown</span>
            <ChevronRight size={14} />
          </div>
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '6px' }}>
          <div style={{ fontSize: '24px', fontWeight: 800, color: 'var(--text-primary)' }}>
            {shouldMask ? '₹ •••••' : `₹${safeToSpendToday.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
          </div>
          <span className="badge badge-teal" style={{ fontSize: '11px' }}>
            {remainingDaysInMonth} days left
          </span>
        </div>

        <div style={{ fontSize: '11px', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '6px' }}>
          <AlertCircle size={12} color="var(--primary)" />
          <span>Daily limit based strictly on ₹{totalAvailableBalance.toLocaleString('en-IN')} total balance</span>
        </div>
      </div>

      {/* 3. Emergency Fund Widget */}
      <div
        className="fp-card fp-card-interactive"
        onClick={() => onNavigate('savings')}
        style={{ marginBottom: '16px' }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ fontSize: '14px', fontWeight: 700, color: 'var(--text-primary)' }}>
              {t.emergencyFund}
            </span>
            <span className={emergencyFund.isLocked ? 'badge badge-teal' : 'badge badge-warning'}>
              {emergencyFund.isLocked ? <Lock size={10} /> : <Unlock size={10} />}
              <span>{emergencyFund.isLocked ? 'Locked' : 'Unlocked'}</span>
            </span>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '12px', color: 'var(--primary-light)', fontWeight: 600 }}>
            <span>Manage</span>
            <ChevronRight size={14} />
          </div>
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '6px' }}>
          <span style={{ fontSize: '18px', fontWeight: 800, color: 'var(--text-primary)' }}>
            {shouldMask ? '₹ •••••' : `₹${emergencyFund.currentAmount.toLocaleString('en-IN')}`}
          </span>
          <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
            Target: ₹{emergencyFund.targetAmount.toLocaleString('en-IN')}
          </span>
        </div>

        {/* Progress bar */}
        <div
          style={{
            height: '8px',
            borderRadius: '4px',
            background: 'var(--bg-surface)',
            border: '1px solid var(--border-color)',
            overflow: 'hidden',
          }}
        >
          <div
            style={{
              width: `${emergencyProgress}%`,
              height: '100%',
              background: 'linear-gradient(90deg, #14b8a6, #0ea5e9)',
              borderRadius: '4px',
              transition: 'width 0.5s ease',
            }}
          />
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '6px', fontSize: '11px', color: 'var(--text-secondary)' }}>
          <span>{emergencyProgress}% achieved</span>
          <span>{emergencyFund.isLocked ? 'Safeguarded from spend' : 'Protection active'}</span>
        </div>
      </div>

      {/* 4. Monthly Summary Snapshot */}
      <div className="fp-card" style={{ marginBottom: '16px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
          <span style={{ fontSize: '14px', fontWeight: 700, color: 'var(--text-primary)' }}>
            September Financial Summary
          </span>
          <button
            onClick={() => onNavigate('history')}
            style={{ background: 'none', border: 'none', color: 'var(--primary-light)', fontSize: '12px', fontWeight: 600, cursor: 'pointer' }}
          >
            Analytics &gt;
          </button>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px', textAlign: 'center' }}>
          <div style={{ background: 'var(--bg-surface)', padding: '10px 8px', borderRadius: '10px' }}>
            <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{t.income}</span>
            <div style={{ fontSize: '14px', fontWeight: 700, color: 'var(--success)', marginTop: '2px' }}>
              ₹{thisMonthIncome.toLocaleString('en-IN')}
            </div>
          </div>

          <div style={{ background: 'var(--bg-surface)', padding: '10px 8px', borderRadius: '10px' }}>
            <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{t.spent}</span>
            <div style={{ fontSize: '14px', fontWeight: 700, color: 'var(--danger)', marginTop: '2px' }}>
              ₹{thisMonthSpent.toLocaleString('en-IN')}
            </div>
          </div>

          <div style={{ background: 'var(--bg-surface)', padding: '10px 8px', borderRadius: '10px' }}>
            <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{t.saved}</span>
            <div style={{ fontSize: '14px', fontWeight: 700, color: 'var(--accent-blue)', marginTop: '2px' }}>
              ₹{thisMonthSaved.toLocaleString('en-IN')}
            </div>
          </div>
        </div>

        <button
          onClick={() => setShowExportModal(true)}
          style={{
            marginTop: '12px',
            width: '100%',
            background: 'rgba(20, 184, 166, 0.1)',
            border: '1px dashed var(--primary)',
            borderRadius: '10px',
            padding: '8px 12px',
            color: 'var(--primary-light)',
            fontSize: '12px',
            fontWeight: 700,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '6px',
            cursor: 'pointer',
          }}
        >
          <FileText size={14} />
          <span>Download Statement / PDF Report</span>
        </button>
      </div>

      {/* Category Budgets & Spending Limits Widget */}
      <div
        className="fp-card fp-card-interactive"
        onClick={() => onNavigate('budgets')}
        style={{ marginBottom: '16px' }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ fontSize: '14px', fontWeight: 700, color: 'var(--text-primary)' }}>
              Budgets & Limits ({budgets.length})
            </span>
            <span className="badge badge-teal">
              <PieChart size={10} />
              <span>Active</span>
            </span>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '12px', color: 'var(--primary-light)', fontWeight: 600 }}>
            <span>Manage</span>
            <ChevronRight size={14} />
          </div>
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '8px' }}>
          <span style={{ fontSize: '16px', fontWeight: 800, color: 'var(--text-primary)' }}>
            ₹{thisMonthSpent.toLocaleString('en-IN')} spent
          </span>
          <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
            Cap: ₹{budgets.reduce((s, b) => s + b.limitAmount, 0).toLocaleString('en-IN')}
          </span>
        </div>

        {/* Multi-segment progress bar for top budgets */}
        <div style={{ display: 'flex', gap: '4px', height: '6px', borderRadius: '3px', overflow: 'hidden', background: 'var(--bg-surface)' }}>
          {budgets.slice(0, 4).map((b, i) => {
            const sp = getBudgetSpending(b.category);
            const pct = Math.min(100, Math.max(10, sp.percentage));
            const colors = ['#14b8a6', '#0ea5e9', '#8b5cf6', '#f59e0b'];
            return (
              <div
                key={b.id}
                style={{
                  flex: pct,
                  height: '100%',
                  background: sp.isOverBudget ? 'var(--danger)' : colors[i % colors.length],
                  borderRadius: '3px',
                }}
              />
            );
          })}
        </div>
      </div>

      {/* 5. Upcoming Bills & Obligations */}
      {unpaidBills.length > 0 && (
        <div
          className="fp-card fp-card-interactive"
          onClick={() => onNavigate('bills')}
          style={{ marginBottom: '16px' }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
            <span style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-primary)' }}>
              Upcoming Obligations ({unpaidBills.length})
            </span>
            <span className="badge badge-warning">Due Soon</span>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div>
              <div style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)' }}>
                {unpaidBills[0].name}
              </div>
              <div style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>
                Due on {new Date(unpaidBills[0].dueDate).toLocaleDateString('en-IN', { month: 'short', day: 'numeric' })}
              </div>
            </div>
            <div style={{ fontSize: '15px', fontWeight: 800, color: 'var(--warning)' }}>
              ₹{unpaidBills[0].amount.toLocaleString('en-IN')}
            </div>
          </div>
        </div>
      )}

      {/* 6. AI Financial Spending Insight */}
      <div
        className="fp-card"
        style={{
          background: 'linear-gradient(135deg, rgba(20,184,166,0.1) 0%, rgba(14,165,233,0.08) 100%)',
          border: '1px solid rgba(20, 184, 166, 0.25)',
          marginBottom: '16px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
          <Sparkles size={16} color="var(--primary-light)" />
          <span style={{ fontSize: '12px', fontWeight: 700, color: 'var(--primary-light)' }}>
            {t.spendingInsight}
          </span>
        </div>
        <p style={{ fontSize: '13px', color: 'var(--text-primary)', lineHeight: '1.5', margin: 0 }}>
          {dailyTip}
        </p>
      </div>

      {/* 7. Recent Transactions snippet */}
      <div style={{ marginTop: '8px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
          <span style={{ fontSize: '14px', fontWeight: 700, color: 'var(--text-primary)' }}>
            Recent Transactions
          </span>
          <button
            onClick={() => onNavigate('history')}
            style={{ background: 'none', border: 'none', color: 'var(--primary-light)', fontSize: '12px', fontWeight: 600, cursor: 'pointer' }}
          >
            View All ({transactions.length})
          </button>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {transactions.slice(0, 4).map(txn => (
            <div
              key={txn.id}
              className="fp-card"
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '12px',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <div
                  style={{
                    width: '36px',
                    height: '36px',
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
                    {new Date(txn.timestamp).toLocaleDateString('en-IN', { month: 'short', day: 'numeric' })} • {txn.category}
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
                  {txn.type === 'INCOME' ? '+' : '-'}₹{txn.amount.toLocaleString('en-IN')}
                </div>
                <span style={{ fontSize: '10px', color: 'var(--text-muted)' }}>{txn.status}</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      <ExportReportModal
        isOpen={showExportModal}
        onClose={() => setShowExportModal(false)}
      />

      {showSafeToSpendModal && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.65)',
            backdropFilter: 'blur(4px)',
            zIndex: 1000,
            display: 'flex',
            alignItems: 'flex-end',
            justifyContent: 'center',
          }}
          onClick={() => setShowSafeToSpendModal(false)}
        >
          <div
            className="animate-slide-up"
            style={{
              background: 'var(--bg-card)',
              width: '100%',
              maxWidth: '480px',
              borderTopLeftRadius: '24px',
              borderTopRightRadius: '24px',
              border: '1px solid var(--border-color)',
              padding: '24px 20px',
              maxHeight: '90vh',
              overflowY: 'auto',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <div
                  style={{
                    width: '32px',
                    height: '32px',
                    borderRadius: '8px',
                    background: 'rgba(14, 165, 233, 0.2)',
                    color: 'var(--accent-blue)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <Target size={18} />
                </div>
                <div>
                  <h3 style={{ fontSize: '16px', fontWeight: 800, margin: 0, color: 'var(--text-primary)' }}>
                    Safe to Spend Breakdown
                  </h3>
                  <span style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>
                    Calculated strictly based on your total balance
                  </span>
                </div>
              </div>
              <button
                onClick={() => setShowSafeToSpendModal(false)}
                style={{
                  background: 'none',
                  border: 'none',
                  color: 'var(--text-secondary)',
                  cursor: 'pointer',
                  padding: '4px',
                }}
              >
                <X size={20} />
              </button>
            </div>

            {/* Prominent Daily Highlight Banner */}
            <div
              style={{
                background: 'linear-gradient(135deg, #0284c7 0%, #0d9488 100%)',
                borderRadius: '16px',
                padding: '16px',
                color: '#ffffff',
                marginBottom: '20px',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
              }}
            >
              <div>
                <span style={{ fontSize: '11px', fontWeight: 700, opacity: 0.9, letterSpacing: '0.5px' }}>
                  SAFE TO SPEND FOR TODAY
                </span>
                <div style={{ fontSize: '28px', fontWeight: 900, marginTop: '2px' }}>
                  ₹{safeToSpendToday.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </div>
              </div>
              <div
                style={{
                  background: 'rgba(0,0,0,0.2)',
                  borderRadius: '10px',
                  padding: '6px 12px',
                  fontSize: '12px',
                  fontWeight: 600,
                }}
              >
                {remainingDaysInMonth} days left
              </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginBottom: '20px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px' }}>
                <span style={{ color: 'var(--text-secondary)' }}>Total Available Balance</span>
                <span style={{ fontWeight: 700, color: 'var(--text-primary)' }}>₹{totalAvailableBalance.toLocaleString('en-IN')}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px' }}>
                <span style={{ color: 'var(--text-secondary)' }}>Remaining Days This Month</span>
                <span style={{ fontWeight: 700, color: 'var(--text-primary)' }}>{remainingDaysInMonth} days</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px' }}>
                <span style={{ color: 'var(--text-secondary)' }}>Daily Allocation Formula</span>
                <span style={{ fontWeight: 700, color: 'var(--accent-blue)' }}>₹{totalAvailableBalance.toLocaleString('en-IN')} ÷ {remainingDaysInMonth} days</span>
              </div>
            </div>

            <div
              style={{
                background: 'var(--bg-surface)',
                border: '1px solid var(--border-color)',
                borderRadius: '12px',
                padding: '14px',
                fontSize: '12px',
                color: 'var(--text-secondary)',
                lineHeight: 1.5,
                display: 'flex',
                gap: '10px',
              }}
            >
              <AlertCircle size={18} color="var(--primary)" style={{ flexShrink: 0, marginTop: '2px' }} />
              <div>
                Based strictly on your total balance of <strong>₹{totalAvailableBalance.toLocaleString('en-IN')}</strong>, you can spend <strong>₹{safeToSpendToday.toFixed(2)}</strong> today without exceeding your balance before month end.
              </div>
            </div>

            <button
              onClick={() => setShowSafeToSpendModal(false)}
              className="btn btn-primary"
              style={{ width: '100%', marginTop: '20px', padding: '12px' }}
            >
              Got it
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
