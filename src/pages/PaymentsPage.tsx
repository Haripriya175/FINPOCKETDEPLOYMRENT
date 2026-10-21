import React, { useState } from 'react';
import { useFinance } from '../contexts/FinanceContext';
import { useLanguage } from '../contexts/LanguageContext';
import { useChildCare } from '../contexts/ChildCareContext';
import {
  Send,
  QrCode,
  ScanLine,
  Building2,
  PlusCircle,
  Trash2,
  CheckCircle2,
  ExternalLink,
  ShieldCheck,
} from 'lucide-react';

interface PaymentsPageProps {
  onSendMoney: () => void;
  onReceiveQr: () => void;
  onScanQr: () => void;
}

const indianBanksList = ['HDFC Bank', 'State Bank of India', 'ICICI Bank', 'Axis Bank', 'Kotak Mahindra Bank', 'Punjab National Bank'];

export const PaymentsPage: React.FC<PaymentsPageProps> = ({
  onSendMoney,
  onReceiveQr,
  onScanQr,
}) => {
  const { bankAccounts, connectBank, disconnectBank } = useFinance();
  const { t } = useLanguage();
  const { isChildCareActive, showPaymentBlockedAlert } = useChildCare();

  const [showConnectBankModal, setShowConnectBankModal] = useState(false);
  const [selectedBank, setSelectedBank] = useState(indianBanksList[0]);
  const [accType, setAccType] = useState<'SAVINGS' | 'CURRENT' | 'SALARY'>('SAVINGS');
  const [accountBalance, setAccountBalance] = useState('');
  const [accountLastFour, setAccountLastFour] = useState('');

  const handleConnectSubmit = () => {
    const balance = Number(accountBalance);
    if (!Number.isFinite(balance) || balance < 0 || accountLastFour.length !== 4) return;
    connectBank(selectedBank, accType, balance, accountLastFour);
    setAccountBalance('');
    setAccountLastFour('');
    setShowConnectBankModal(false);
  };

  const handleAction = (cb: () => void) => {
    if (isChildCareActive) {
      showPaymentBlockedAlert();
      return;
    }
    cb();
  };

  return (
    <div className="mobile-body animate-fade">
      <h2 style={{ fontSize: '20px', fontWeight: 800, margin: '0 0 16px 0', color: 'var(--text-primary)' }}>
        {t.navPayments}
      </h2>

      {/* Quick Action Hub Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '10px', marginBottom: '20px' }}>
        <button
          className="fp-card fp-card-interactive"
          onClick={() => handleAction(onSendMoney)}
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '16px 8px',
            border: 'none',
            color: 'var(--text-primary)',
          }}
        >
          <div
            style={{
              width: '44px',
              height: '44px',
              borderRadius: '50%',
              background: 'rgba(20, 184, 166, 0.2)',
              color: 'var(--primary-light)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              marginBottom: '8px',
            }}
          >
            <Send size={20} />
          </div>
          <span style={{ fontSize: '12px', fontWeight: 700 }}>{t.send}</span>
        </button>

        <button
          className="fp-card fp-card-interactive"
          onClick={() => handleAction(onReceiveQr)}
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '16px 8px',
            border: 'none',
            color: 'var(--text-primary)',
          }}
        >
          <div
            style={{
              width: '44px',
              height: '44px',
              borderRadius: '50%',
              background: 'rgba(14, 165, 233, 0.2)',
              color: 'var(--accent-blue)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              marginBottom: '8px',
            }}
          >
            <QrCode size={20} />
          </div>
          <span style={{ fontSize: '12px', fontWeight: 700 }}>{t.receive}</span>
        </button>

        <button
          className="fp-card fp-card-interactive"
          onClick={() => handleAction(onScanQr)}
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '16px 8px',
            border: 'none',
            color: 'var(--text-primary)',
          }}
        >
          <div
            style={{
              width: '44px',
              height: '44px',
              borderRadius: '50%',
              background: 'rgba(139, 92, 246, 0.2)',
              color: 'var(--accent-purple)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              marginBottom: '8px',
            }}
          >
            <ScanLine size={20} />
          </div>
          <span style={{ fontSize: '12px', fontWeight: 700 }}>{t.scan}</span>
        </button>
      </div>

      {/* Connected Bank Accounts Section */}
      <div style={{ marginBottom: '20px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
          <span style={{ fontSize: '14px', fontWeight: 700, color: 'var(--text-primary)' }}>
            {t.connectedBanks} ({bankAccounts.length})
          </span>
          <button
            onClick={() => setShowConnectBankModal(true)}
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
            <span>{t.connectBank}</span>
          </button>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {bankAccounts.map(bank => (
            <div
              key={bank.id}
              className="fp-card"
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                padding: '14px',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <div
                  style={{
                    width: '40px',
                    height: '40px',
                    borderRadius: '12px',
                    background: 'var(--bg-surface)',
                    border: '1px solid var(--border-color)',
                    color: 'var(--primary)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <Building2 size={20} />
                </div>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span style={{ fontSize: '14px', fontWeight: 700, color: 'var(--text-primary)' }}>
                      {bank.bankName}
                    </span>
                    {bank.isPrimary && <span className="badge badge-teal">Primary</span>}
                  </div>
                  <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '2px' }}>
                    {bank.maskedAccountNumber} • {bank.accountType}
                  </div>
                </div>
              </div>

              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: '14px', fontWeight: 800, color: 'var(--text-primary)' }}>
                  {isChildCareActive ? '••••••' : `₹${bank.availableBalance.toLocaleString('en-IN')}`}
                </div>
                {bankAccounts.length > 1 && (
                  <button
                    onClick={() => disconnectBank(bank.id)}
                    style={{
                      background: 'none',
                      border: 'none',
                      color: 'var(--danger)',
                      fontSize: '11px',
                      cursor: 'pointer',
                      marginTop: '4px',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '2px',
                    }}
                  >
                    <Trash2 size={11} />
                    <span>Disconnect</span>
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Payment Security Notice */}
      <div
        className="fp-card"
        style={{
          background: 'rgba(20, 184, 166, 0.08)',
          border: '1px solid rgba(20, 184, 166, 0.2)',
          display: 'flex',
          gap: '12px',
          alignItems: 'center',
        }}
      >
        <ShieldCheck size={28} color="var(--primary-light)" />
        <div>
          <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--primary-light)' }}>
            Payment preview
          </div>
          <p style={{ fontSize: '11px', color: 'var(--text-secondary)', margin: '2px 0 0 0', lineHeight: '1.4' }}>
            Payment actions in this website are previews saved to your browser. They do not send money or connect to your bank.
          </p>
        </div>
      </div>

      {/* Connect Bank Modal */}
      {showConnectBankModal && (
        <div className="modal-overlay animate-fade">
          <div className="modal-sheet animate-slide-up">
            <div className="sheet-handle" />
            <h3 style={{ fontSize: '18px', fontWeight: 700, margin: '0 0 12px 0', color: 'var(--text-primary)' }}>
              Add bank account
            </h3>
            <p style={{ fontSize: '13px', color: 'var(--text-secondary)', margin: '0 0 16px 0' }}>
              Add an account for your own tracking. Enter the details shown in your banking app; no bank connection is made here.
            </p>

            <div style={{ marginBottom: '14px' }}>
              <label style={{ display: 'block', fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '6px', fontWeight: 600 }}>
                Select Bank
              </label>
              <select
                className="fp-input"
                value={selectedBank}
                onChange={e => setSelectedBank(e.target.value)}
              >
                {indianBanksList.map(b => (
                  <option key={b} value={b}>
                    {b}
                  </option>
                ))}
              </select>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '14px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '6px', fontWeight: 600 }}>Current balance (₹)</label>
                <input className="fp-input" type="number" min="0" step="0.01" value={accountBalance} onChange={e => setAccountBalance(e.target.value)} placeholder="0.00" />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '6px', fontWeight: 600 }}>Last 4 digits</label>
                <input className="fp-input" inputMode="numeric" maxLength={4} value={accountLastFour} onChange={e => setAccountLastFour(e.target.value.replace(/\D/g, '').slice(0, 4))} placeholder="1234" />
              </div>
            </div>

            <div style={{ marginBottom: '20px' }}>
              <label style={{ display: 'block', fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '6px', fontWeight: 600 }}>
                Account Type
              </label>
              <div style={{ display: 'flex', gap: '8px' }}>
                {(['SAVINGS', 'CURRENT', 'SALARY'] as const).map(type => (
                  <button
                    key={type}
                    onClick={() => setAccType(type)}
                    style={{
                      flex: 1,
                      padding: '8px',
                      borderRadius: '8px',
                      background: accType === type ? 'var(--primary)' : 'var(--bg-card)',
                      color: accType === type ? '#fff' : 'var(--text-secondary)',
                      border: '1px solid var(--border-color)',
                      fontSize: '12px',
                      fontWeight: 600,
                      cursor: 'pointer',
                    }}
                  >
                    {type}
                  </button>
                ))}
              </div>
            </div>

            <div style={{ display: 'flex', gap: '10px' }}>
              <button className="btn-secondary" onClick={() => setShowConnectBankModal(false)} style={{ flex: 1 }}>
                Cancel
              </button>
              <button className="btn-primary" onClick={handleConnectSubmit} style={{ flex: 1 }} disabled={!accountBalance || accountLastFour.length !== 4}>
                Save account
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
