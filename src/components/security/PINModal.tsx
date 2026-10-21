import React, { useState } from 'react';
import { Delete, Lock, ShieldCheck, X } from 'lucide-react';
import { useLanguage } from '../../contexts/LanguageContext';

interface PINModalProps {
  isOpen: boolean;
  title?: string;
  subtitle?: string;
  onSuccess: () => void;
  onCancel: () => void;
  validatePin: (pin: string) => boolean | Promise<boolean>;
}

export const PINModal: React.FC<PINModalProps> = ({
  isOpen,
  title = 'Enter Security PIN',
  subtitle = 'Enter your 4-digit FinPocket App PIN to authorize',
  onSuccess,
  onCancel,
  validatePin,
}) => {
  const { t } = useLanguage();
  const [pin, setPin] = useState<string>('');
  const [error, setError] = useState<string | null>(null);
  const [isVerifying, setIsVerifying] = useState<boolean>(false);

  if (!isOpen) return null;

  const handleDigit = async (digit: string) => {
    if (pin.length < 4) {
      const nextPin = pin + digit;
      setPin(nextPin);
      setError(null);

      if (nextPin.length === 4) {
        setIsVerifying(true);
        try {
          const isValid = await validatePin(nextPin);
          if (isValid) {
            setPin('');
            setError(null);
            onSuccess();
          } else {
            setError('Incorrect PIN. Please try again.');
            setPin('');
          }
        } catch {
          setError('Verification error. Please retry.');
          setPin('');
        } finally {
          setIsVerifying(false);
        }
      }
    }
  };

  const handleDelete = () => {
    setPin(prev => prev.slice(0, -1));
    setError(null);
  };

  return (
    <div className="modal-overlay animate-fade">
      <div className="modal-sheet animate-slide-up" style={{ textAlign: 'center' }}>
        <div className="sheet-handle" />

        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '-10px' }}>
          <button
            onClick={onCancel}
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

        <div
          style={{
            width: '56px',
            height: '56px',
            borderRadius: '50%',
            background: 'rgba(20, 184, 166, 0.15)',
            color: 'var(--primary)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            margin: '0 auto 12px auto',
          }}
        >
          <Lock size={26} />
        </div>

        <h3 style={{ fontSize: '18px', fontWeight: 700, margin: '0 0 6px 0', color: 'var(--text-primary)' }}>
          {title}
        </h3>
        <p style={{ fontSize: '13px', color: 'var(--text-secondary)', margin: '0 0 20px 0' }}>
          {subtitle}
        </p>

        {/* PIN Indicators */}
        <div style={{ display: 'flex', justifyContent: 'center', gap: '16px', margin: '20px 0' }}>
          {[0, 1, 2, 3].map(idx => (
            <div
              key={idx}
              style={{
                width: '18px',
                height: '18px',
                borderRadius: '50%',
                border: '2px solid ' + (pin.length > idx ? 'var(--primary)' : 'var(--border-color)'),
                backgroundColor: pin.length > idx ? 'var(--primary)' : 'transparent',
                transition: 'all 0.15s ease',
                boxShadow: pin.length > idx ? '0 0 10px var(--primary-glow)' : 'none',
              }}
            />
          ))}
        </div>

        {error && (
          <p style={{ color: 'var(--danger)', fontSize: '12px', fontWeight: 600, margin: '8px 0 14px 0' }}>
            {error}
          </p>
        )}

        {isVerifying && (
          <p style={{ color: 'var(--primary)', fontSize: '12px', fontWeight: 600, margin: '8px 0 14px 0' }}>
            Verifying security credentials...
          </p>
        )}

        {/* Numeric Keypad */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(3, 1fr)',
            gap: '12px',
            maxWidth: '300px',
            margin: '20px auto 10px auto',
          }}
        >
          {['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', 'del'].map((item, index) => {
            if (item === '') {
              return <div key={index} />;
            }
            if (item === 'del') {
              return (
                <button
                  key={index}
                  onClick={handleDelete}
                  style={{
                    height: '56px',
                    borderRadius: '16px',
                    background: 'var(--bg-card)',
                    border: '1px solid var(--border-color)',
                    color: 'var(--text-primary)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    cursor: 'pointer',
                  }}
                  aria-label="Delete digit"
                >
                  <Delete size={20} />
                </button>
              );
            }
            return (
              <button
                key={index}
                onClick={() => handleDigit(item)}
                style={{
                  height: '56px',
                  borderRadius: '16px',
                  background: 'var(--bg-card)',
                  border: '1px solid var(--border-color)',
                  color: 'var(--text-primary)',
                  fontSize: '22px',
                  fontWeight: 600,
                  cursor: 'pointer',
                  transition: 'background 0.1s ease',
                }}
              >
                {item}
              </button>
            );
          })}
        </div>

        <p style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '12px' }}>
          Default demo PIN: <strong>1234</strong>
        </p>
      </div>
    </div>
  );
};
