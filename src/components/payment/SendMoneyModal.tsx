import React, { useState } from 'react';
import { useFinance } from '../../contexts/FinanceContext';
import { useLanguage } from '../../contexts/LanguageContext';
import { useChildCare } from '../../contexts/ChildCareContext';
import { Transaction, TransactionCategory } from '../../types';
import { X, Send, UserCheck, ShieldCheck, ArrowRight, CheckCircle2 } from 'lucide-react';
import confetti from 'canvas-confetti';

interface SendMoneyModalProps {
  isOpen: boolean;
  onClose: () => void;
  onRequestPin: (onVerified: () => void) => void;
  onPaymentComplete: (txn: Transaction) => void;
}

const frequentContacts = [
  { name: 'Rahul Verma', handle: 'rahul.verma@oksbi', avatar: 'RV' },
  { name: 'Priya Sharma', handle: 'priya.s@okhdfcbank', avatar: 'PS' },
  { name: 'Sneha Reddy', handle: 'sneha98@icici', avatar: 'SR' },
  { name: 'Amit Patel', handle: 'amit.patel@upi', avatar: 'AP' },
];

const categories: TransactionCategory[] = ['Food', 'Shopping', 'Travel', 'Bills', 'Entertainment', 'Health', 'Rent', 'Other'];

export const SendMoneyModal: React.FC<SendMoneyModalProps> = ({
  isOpen,
  onClose,
  onRequestPin,
  onPaymentComplete,
}) => {
  const { totalAvailableBalance, sendPayment } = useFinance();
  const { t } = useLanguage();
  const { isChildCareActive, showPaymentBlockedAlert } = useChildCare();

  const [step, setStep] = useState<'INPUT' | 'REVIEW' | 'PROCESSING'>('INPUT');
  const [recipient, setRecipient] = useState('');
  const [amount, setAmount] = useState('');
  const [category, setCategory] = useState<TransactionCategory>('Food');
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleSelectContact = (contact: typeof frequentContacts[0]) => {
    setRecipient(`${contact.name} (${contact.handle})`);
    setError(null);
  };

  const handleQuickAmount = (val: number) => {
    setAmount(val.toString());
    setError(null);
  };

  const handleProceedToReview = () => {
    if (isChildCareActive) {
      onClose();
      showPaymentBlockedAlert();
      return;
    }

    if (!recipient.trim()) {
      setError('Please enter a recipient UPI ID, contact, or mobile number.');
      return;
    }
    const num = parseFloat(amount);
    if (isNaN(num) || num <= 0) {
      setError('Please enter a valid transfer amount.');
      return;
    }
    if (num > totalAvailableBalance) {
      setError(`Amount exceeds your available balance of ₹${totalAvailableBalance.toLocaleString('en-IN')}.`);
      return;
    }

    setError(null);
    setStep('REVIEW');
  };

  const handleAuthorizeAndPay = () => {
    if (isChildCareActive) {
      onClose();
      showPaymentBlockedAlert();
      return;
    }

    onRequestPin(async () => {
      setStep('PROCESSING');
      setTimeout(async () => {
        const res = await sendPayment({
          receiver: recipient,
          amount: parseFloat(amount),
          category,
          note,
          paymentMethod: 'UPI',
        });

        if (res.success && res.transaction) {
          try {
            confetti({ particleCount: 80, spread: 60, origin: { y: 0.7 } });
          } catch {}
          onPaymentComplete(res.transaction);
          handleClose();
        } else {
          setError(res.message || 'Payment processing failed.');
          setStep('INPUT');
        }
      }, 1000);
    });
  };

  const handleClose = () => {
    setStep('INPUT');
    setRecipient('');
    setAmount('');
    setNote('');
    setError(null);
    onClose();
  };

  return (
    <div className="modal-overlay animate-fade">
      <div className="modal-sheet animate-slide-up">
        <div className="sheet-handle" />

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
          <h3 style={{ fontSize: '18px', fontWeight: 700, margin: 0, color: 'var(--text-primary)' }}>
            {step === 'REVIEW' ? t.reviewPayment : t.sendMoneyTitle}
          </h3>
          <button
            onClick={handleClose}
            style={{
              background: 'none',
              border: 'none',
              color: 'var(--text-secondary)',
              cursor: 'pointer',
            }}
          >
            <X size={20} />
          </button>
        </div>

        {error && (
          <div style={{ background: 'rgba(239, 68, 68, 0.15)', color: 'var(--danger)', padding: '10px 14px', borderRadius: '10px', fontSize: '12px', fontWeight: 600, marginBottom: '16px' }}>
            {error}
          </div>
        )}

        {step === 'INPUT' && (
          <div>
            {/* Frequent Contacts */}
            <div style={{ marginBottom: '16px' }}>
              <span style={{ fontSize: '12px', color: 'var(--text-secondary)', fontWeight: 600 }}>
                Frequent Contacts
              </span>
              <div style={{ display: 'flex', gap: '10px', overflowX: 'auto', padding: '8px 0', marginTop: '4px' }}>
                {frequentContacts.map((c, i) => (
                  <button
                    key={i}
                    onClick={() => handleSelectContact(c)}
                    style={{
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      background: 'none',
                      border: 'none',
                      cursor: 'pointer',
                      minWidth: '60px',
                    }}
                  >
                    <div
                      style={{
                        width: '42px',
                        height: '42px',
                        borderRadius: '50%',
                        background: 'rgba(20, 184, 166, 0.2)',
                        color: 'var(--primary-light)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: '13px',
                        fontWeight: 700,
                        border: '1px solid var(--border-color)',
                      }}
                    >
                      {c.avatar}
                    </div>
                    <span style={{ fontSize: '11px', color: 'var(--text-primary)', marginTop: '4px', maxWidth: '60px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {c.name.split(' ')[0]}
                    </span>
                  </button>
                ))}
              </div>
            </div>

            {/* Recipient Input */}
            <div style={{ marginBottom: '14px' }}>
              <label style={{ display: 'block', fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '6px', fontWeight: 600 }}>
                {t.recipient}
              </label>
              <input
                className="fp-input"
                placeholder="e.g. rahul@upi or 9876543210"
                value={recipient}
                onChange={e => setRecipient(e.target.value)}
              />
            </div>

            {/* Amount Input */}
            <div style={{ marginBottom: '14px' }}>
              <label style={{ display: 'block', fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '6px', fontWeight: 600 }}>
                {t.enterAmount}
              </label>
              <div style={{ position: 'relative' }}>
                <span style={{ position: 'absolute', left: '14px', top: '12px', fontSize: '18px', fontWeight: 700, color: 'var(--primary)' }}>
                  ₹
                </span>
                <input
                  type="number"
                  className="fp-input"
                  style={{ paddingLeft: '32px', fontSize: '20px', fontWeight: 700 }}
                  placeholder="0.00"
                  value={amount}
                  onChange={e => setAmount(e.target.value)}
                />
              </div>

              {/* Quick Amount Chips */}
              <div style={{ display: 'flex', gap: '8px', marginTop: '8px' }}>
                {[100, 500, 1000, 2000].map(val => (
                  <button
                    key={val}
                    onClick={() => handleQuickAmount(val)}
                    style={{
                      background: 'var(--bg-card)',
                      border: '1px solid var(--border-color)',
                      color: 'var(--text-primary)',
                      borderRadius: '16px',
                      padding: '4px 12px',
                      fontSize: '12px',
                      fontWeight: 600,
                      cursor: 'pointer',
                    }}
                  >
                    +₹{val}
                  </button>
                ))}
              </div>
            </div>

            {/* Category selection */}
            <div style={{ marginBottom: '14px' }}>
              <label style={{ display: 'block', fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '6px', fontWeight: 600 }}>
                Category
              </label>
              <div style={{ display: 'flex', gap: '6px', overflowX: 'auto', paddingBottom: '4px' }}>
                {categories.map(cat => (
                  <button
                    key={cat}
                    onClick={() => setCategory(cat)}
                    style={{
                      background: category === cat ? 'var(--primary)' : 'var(--bg-card)',
                      color: category === cat ? '#fff' : 'var(--text-secondary)',
                      border: '1px solid var(--border-color)',
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
            </div>

            {/* Note input */}
            <div style={{ marginBottom: '20px' }}>
              <label style={{ display: 'block', fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '6px', fontWeight: 600 }}>
                {t.noteOptional}
              </label>
              <input
                className="fp-input"
                placeholder="e.g. Lunch split, movie ticket"
                value={note}
                onChange={e => setNote(e.target.value)}
              />
            </div>

            <button className="btn-primary" onClick={handleProceedToReview}>
              <span>{t.reviewPayment}</span>
              <ArrowRight size={16} />
            </button>
          </div>
        )}

        {step === 'REVIEW' && (
          <div>
            <div className="fp-card" style={{ textAlign: 'center', margin: '10px 0 20px 0', padding: '24px 16px' }}>
              <span style={{ fontSize: '12px', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                Paying To
              </span>
              <h4 style={{ fontSize: '18px', fontWeight: 700, margin: '6px 0 16px 0', color: 'var(--text-primary)' }}>
                {recipient}
              </h4>

              <div style={{ fontSize: '32px', fontWeight: 800, color: 'var(--primary-light)', margin: '10px 0' }}>
                ₹{parseFloat(amount).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
              </div>

              <div style={{ display: 'flex', justifyContent: 'center', gap: '8px', marginTop: '12px' }}>
                <span className="badge badge-teal">{category}</span>
                <span className="badge badge-info">UPI Transfer</span>
              </div>
              {note && (
                <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '10px', fontStyle: 'italic' }}>
                  "{note}"
                </p>
              )}
            </div>

            <div style={{ display: 'flex', gap: '10px' }}>
              <button className="btn-secondary" onClick={() => setStep('INPUT')} style={{ flex: 1 }}>
                Back
              </button>
              <button className="btn-primary" onClick={handleAuthorizeAndPay} style={{ flex: 2 }}>
                <ShieldCheck size={16} />
                <span>{t.payNow}</span>
              </button>
            </div>
          </div>
        )}

        {step === 'PROCESSING' && (
          <div style={{ textAlign: 'center', padding: '30px 10px' }}>
            <div
              style={{
                width: '60px',
                height: '60px',
                borderRadius: '50%',
                border: '3px solid var(--border-color)',
                borderTopColor: 'var(--primary)',
                animation: 'spin 0.8s linear infinite',
                margin: '0 auto 20px auto',
              }}
            />
            <h4 style={{ fontSize: '16px', fontWeight: 700, color: 'var(--text-primary)' }}>
              Processing Transaction
            </h4>
            <p style={{ fontSize: '13px', color: 'var(--text-secondary)', marginTop: '4px' }}>
              Connecting to UPI banking network...
            </p>
          </div>
        )}
      </div>
    </div>
  );
};
