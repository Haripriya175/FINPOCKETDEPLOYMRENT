import React, { useState } from 'react';
import { useFinance } from '../contexts/FinanceContext';
import { useLanguage } from '../contexts/LanguageContext';
import {
  Calendar,
  CheckCircle2,
  AlertCircle,
  PlusCircle,
  CreditCard,
  Building,
  Zap,
  Wifi,
  Tv,
  HelpCircle,
  Home,
} from 'lucide-react';
import confetti from 'canvas-confetti';

export const BillsPage: React.FC = () => {
  const { bills, emis, markBillPaid, markEmiPaid } = useFinance();
  const { t } = useLanguage();

  const totalMonthlyBills = bills.reduce((sum, b) => sum + b.amount, 0);
  const totalPaidBills = bills.filter(b => b.isPaidThisMonth).reduce((sum, b) => sum + b.amount, 0);
  const totalRemainingBills = totalMonthlyBills - totalPaidBills;

  const handlePayBill = (id: string) => {
    markBillPaid(id);
    try {
      confetti({ particleCount: 40, spread: 40 });
    } catch {}
  };

  const handlePayEmi = (id: string) => {
    markEmiPaid(id);
    try {
      confetti({ particleCount: 40, spread: 40 });
    } catch {}
  };

  const getCategoryIcon = (cat: string) => {
    switch (cat) {
      case 'Electricity':
        return <Zap size={18} color="#f59e0b" />;
      case 'Internet':
        return <Wifi size={18} color="#0ea5e9" />;
      case 'Rent':
        return <Home size={18} color="#14b8a6" />;
      case 'Subscription':
        return <Tv size={18} color="#8b5cf6" />;
      default:
        return <CreditCard size={18} color="#10b981" />;
    }
  };

  return (
    <div className="mobile-body animate-fade">
      <h2 style={{ fontSize: '20px', fontWeight: 800, margin: '0 0 16px 0', color: 'var(--text-primary)' }}>
        {t.billsTitle}
      </h2>

      {/* Monthly Bills Summary Card */}
      <div className="fp-card" style={{ marginBottom: '20px' }}>
        <span style={{ fontSize: '12px', color: 'var(--text-secondary)', textTransform: 'uppercase', fontWeight: 600 }}>
          This Month's Obligations
        </span>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px', marginTop: '10px', textAlign: 'center' }}>
          <div style={{ background: 'var(--bg-surface)', padding: '10px 4px', borderRadius: '10px' }}>
            <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Total</span>
            <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-primary)', marginTop: '2px' }}>
              ₹{totalMonthlyBills.toLocaleString('en-IN')}
            </div>
          </div>

          <div style={{ background: 'var(--bg-surface)', padding: '10px 4px', borderRadius: '10px' }}>
            <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Paid</span>
            <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--success)', marginTop: '2px' }}>
              ₹{totalPaidBills.toLocaleString('en-IN')}
            </div>
          </div>

          <div style={{ background: 'var(--bg-surface)', padding: '10px 4px', borderRadius: '10px' }}>
            <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Remaining</span>
            <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--warning)', marginTop: '2px' }}>
              ₹{totalRemainingBills.toLocaleString('en-IN')}
            </div>
          </div>
        </div>
      </div>

      {/* Active Loans & EMIs Section */}
      <div style={{ marginBottom: '24px' }}>
        <span style={{ fontSize: '14px', fontWeight: 700, color: 'var(--text-primary)', display: 'block', marginBottom: '10px' }}>
          {t.emiLoanTitle} ({emis.length})
        </span>

        {emis.map(emi => (
          <div key={emi.id} className="fp-card" style={{ marginBottom: '10px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '8px' }}>
              <div>
                <h4 style={{ fontSize: '14px', fontWeight: 700, margin: 0, color: 'var(--text-primary)' }}>
                  {emi.loanName}
                </h4>
                <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                  Total Loan: ₹{emi.totalAmount.toLocaleString('en-IN')} @ {emi.interestRate}% p.a.
                </span>
              </div>
              <span className={emi.isPaidThisMonth ? 'badge badge-success' : 'badge badge-warning'}>
                {emi.isPaidThisMonth ? 'Paid for Month' : 'Due Oct 5'}
              </span>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '10px', background: 'var(--bg-surface)', padding: '10px', borderRadius: '10px', margin: '10px 0' }}>
              <div>
                <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Monthly EMI</span>
                <div style={{ fontSize: '15px', fontWeight: 800, color: 'var(--primary-light)' }}>
                  ₹{emi.monthlyEMI.toLocaleString('en-IN')}
                </div>
              </div>
              <div>
                <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Remaining Principal</span>
                <div style={{ fontSize: '15px', fontWeight: 800, color: 'var(--text-primary)' }}>
                  ₹{emi.remainingAmount.toLocaleString('en-IN')}
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: 'var(--text-secondary)' }}>
              <span>Installments Paid: {emi.paidMonths} / {emi.totalTenureMonths} months</span>
              <span>Next Due: {emi.nextDueDate}</span>
            </div>

            {!emi.isPaidThisMonth && (
              <button
                className="btn-primary"
                onClick={() => handlePayEmi(emi.id)}
                style={{ marginTop: '12px', padding: '8px', fontSize: '12px' }}
              >
                <CheckCircle2 size={14} />
                <span>Pay Monthly EMI (₹{emi.monthlyEMI})</span>
              </button>
            )}
          </div>
        ))}
      </div>

      {/* Recurring Bills List */}
      <div>
        <span style={{ fontSize: '14px', fontWeight: 700, color: 'var(--text-primary)', display: 'block', marginBottom: '10px' }}>
          Monthly Recurring Bills ({bills.length})
        </span>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {bills.map(bill => (
            <div key={bill.id} className="fp-card" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <div
                  style={{
                    width: '38px',
                    height: '38px',
                    borderRadius: '10px',
                    background: 'var(--bg-surface)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    border: '1px solid var(--border-color)',
                  }}
                >
                  {getCategoryIcon(bill.category)}
                </div>

                <div>
                  <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-primary)' }}>
                    {bill.name}
                  </div>
                  <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                    Due on {new Date(bill.dueDate).toLocaleDateString('en-IN', { month: 'short', day: 'numeric' })} • {bill.recurrence}
                  </div>
                </div>
              </div>

              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: '14px', fontWeight: 800, color: 'var(--text-primary)' }}>
                  ₹{bill.amount.toLocaleString('en-IN')}
                </div>
                {bill.isPaidThisMonth ? (
                  <span className="badge badge-success" style={{ fontSize: '9px', marginTop: '4px' }}>
                    Paid
                  </span>
                ) : (
                  <button
                    className="btn-primary"
                    onClick={() => handlePayBill(bill.id)}
                    style={{ padding: '4px 10px', fontSize: '11px', marginTop: '4px', width: 'auto' }}
                  >
                    Pay Bill
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
