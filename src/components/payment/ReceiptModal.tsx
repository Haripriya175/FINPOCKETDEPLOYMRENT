import React from 'react';
import { Transaction } from '../../types';
import { useLanguage } from '../../contexts/LanguageContext';
import { CheckCircle2, Download, Share2, X, ShieldCheck } from 'lucide-react';

interface ReceiptModalProps {
  transaction: Transaction | null;
  isOpen: boolean;
  onClose: () => void;
}

export const ReceiptModal: React.FC<ReceiptModalProps> = ({ transaction, isOpen, onClose }) => {
  const { t } = useLanguage();

  if (!isOpen || !transaction) return null;

  const handleShare = () => {
    if (navigator.share) {
      navigator.share({
        title: 'FinPocket Payment Receipt',
        text: `Paid ₹${transaction.amount} to ${transaction.receiver} via FinPocket (Ref: ${transaction.referenceId})`,
      }).catch(() => {});
    } else {
      alert(`Receipt Details copied:\nPaid ₹${transaction.amount} to ${transaction.receiver}\nRef: ${transaction.referenceId}`);
    }
  };

  const handleDownload = () => {
    window.print();
  };

  return (
    <div className="modal-overlay animate-fade">
      <div className="modal-sheet animate-slide-up" style={{ textAlign: 'center' }}>
        <div className="sheet-handle" />

        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '-10px' }}>
          <button
            onClick={onClose}
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

        {/* Success Icon Badge */}
        <div
          style={{
            width: '68px',
            height: '68px',
            borderRadius: '50%',
            background: 'rgba(34, 197, 94, 0.15)',
            color: 'var(--success)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            margin: '0 auto 12px auto',
          }}
        >
          <CheckCircle2 size={40} />
        </div>

        <h3 style={{ fontSize: '20px', fontWeight: 800, margin: '0 0 4px 0', color: 'var(--text-primary)' }}>
          {t.paymentSuccess}
        </h3>
        <p style={{ fontSize: '13px', color: 'var(--text-secondary)', margin: '0 0 20px 0' }}>
          {new Date(transaction.timestamp).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })}
        </p>

        {/* Receipt Slip Container */}
        <div
          className="fp-card"
          style={{
            textAlign: 'left',
            background: 'var(--bg-surface)',
            border: '1px dashed var(--border-color)',
            borderRadius: '16px',
            padding: '18px',
            margin: '0 0 20px 0',
          }}
        >
          <div style={{ textAlign: 'center', paddingBottom: '14px', borderBottom: '1px solid var(--border-color)' }}>
            <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Amount Paid</span>
            <div style={{ fontSize: '30px', fontWeight: 800, color: 'var(--primary-light)', marginTop: '2px' }}>
              ₹{transaction.amount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginTop: '14px', fontSize: '13px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: 'var(--text-muted)' }}>{t.paidTo}</span>
              <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{transaction.receiver}</span>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: 'var(--text-muted)' }}>{t.transactionId}</span>
              <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{transaction.id}</span>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: 'var(--text-muted)' }}>UPI Reference</span>
              <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{transaction.referenceId}</span>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: 'var(--text-muted)' }}>Category</span>
              <span className="badge badge-teal">{transaction.category}</span>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: 'var(--text-muted)' }}>Payment Method</span>
              <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{transaction.paymentMethod}</span>
            </div>
          </div>

          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '6px',
              marginTop: '16px',
              paddingTop: '12px',
              borderTop: '1px solid var(--border-color)',
              color: 'var(--success)',
              fontSize: '11px',
              fontWeight: 600,
            }}
          >
            <ShieldCheck size={14} />
            <span>FinPocket Secure End-to-End Verified</span>
          </div>
        </div>

        {/* Buttons */}
        <div style={{ display: 'flex', gap: '10px', marginBottom: '10px' }}>
          <button className="btn-secondary" onClick={handleShare} style={{ flex: 1 }}>
            <Share2 size={16} />
            <span>{t.shareReceipt}</span>
          </button>
          <button className="btn-secondary" onClick={handleDownload} style={{ flex: 1 }}>
            <Download size={16} />
            <span>{t.downloadReceipt}</span>
          </button>
        </div>

        <button className="btn-primary" onClick={onClose}>
          {t.done}
        </button>
      </div>
    </div>
  );
};
