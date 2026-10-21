import React from 'react';
import { ShieldAlert, X } from 'lucide-react';
import { useLanguage } from '../../contexts/LanguageContext';

interface ChildCareBlockModalProps {
  isOpen: boolean;
  onClose: () => void;
  onParentUnlock: () => void;
}

export const ChildCareBlockModal: React.FC<ChildCareBlockModalProps> = ({
  isOpen,
  onClose,
  onParentUnlock,
}) => {
  const { t } = useLanguage();

  if (!isOpen) return null;

  return (
    <div className="modal-overlay animate-fade">
      <div className="modal-sheet animate-slide-up" style={{ textAlign: 'center', padding: '24px 20px' }}>
        <div className="sheet-handle" />

        <div
          style={{
            width: '68px',
            height: '68px',
            borderRadius: '50%',
            background: 'rgba(239, 68, 68, 0.15)',
            color: 'var(--danger)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            margin: '10px auto 16px auto',
          }}
        >
          <ShieldAlert size={36} />
        </div>

        <h3 style={{ fontSize: '18px', fontWeight: 800, margin: '0 0 8px 0', color: 'var(--danger)' }}>
          Payment Blocked
        </h3>

        <p style={{ fontSize: '14px', color: 'var(--text-secondary)', lineHeight: '1.5', margin: '0 0 20px 0' }}>
          {t.paymentBlockedChildCare}
        </p>

        <div style={{ background: 'var(--bg-card)', padding: '12px', borderRadius: '12px', marginBottom: '20px', fontSize: '12px', color: 'var(--text-muted)' }}>
          FinPocket Child Care Mode prevents all accidental outgoing payments, masking account balances and keeping family finances safe.
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          <button className="btn-primary" onClick={onParentUnlock}>
            Exit Child Care (Parent PIN)
          </button>
          <button className="btn-secondary" onClick={onClose}>
            Back to Safety View
          </button>
        </div>
      </div>
    </div>
  );
};
