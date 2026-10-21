import React, { useEffect, useState } from 'react';
import { Fingerprint, CheckCircle2, ShieldCheck, X } from 'lucide-react';
import { CryptoService } from '../../services/crypto';

interface BiometricPromptModalProps {
  isOpen: boolean;
  reason?: string;
  onSuccess: () => void;
  onFallbackPin: () => void;
  onCancel: () => void;
}

export const BiometricPromptModal: React.FC<BiometricPromptModalProps> = ({
  isOpen,
  reason = 'Verify your identity to authorize transaction',
  onSuccess,
  onFallbackPin,
  onCancel,
}) => {
  const [scanning, setScanning] = useState(true);
  const [authenticated, setAuthenticated] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setScanning(true);
      setAuthenticated(false);
      CryptoService.authenticateBiometrics(reason).then(res => {
        if (res.success) {
          setScanning(false);
          setAuthenticated(true);
          setTimeout(() => {
            onSuccess();
          }, 600);
        } else {
          setScanning(false);
        }
      });
    }
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div className="modal-overlay animate-fade">
      <div className="modal-sheet animate-slide-up" style={{ textAlign: 'center', padding: '24px 20px' }}>
        <div className="sheet-handle" />

        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '-10px' }}>
          <button
            onClick={onCancel}
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

        <div
          style={{
            width: '72px',
            height: '72px',
            borderRadius: '50%',
            background: authenticated ? 'rgba(34, 197, 94, 0.15)' : 'rgba(20, 184, 166, 0.15)',
            color: authenticated ? 'var(--success)' : 'var(--primary)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            margin: '10px auto 16px auto',
            animation: scanning ? 'pulseGlow 1.5s infinite' : 'none',
          }}
        >
          {authenticated ? <CheckCircle2 size={38} /> : <Fingerprint size={40} />}
        </div>

        <h3 style={{ fontSize: '18px', fontWeight: 700, margin: '0 0 6px 0', color: 'var(--text-primary)' }}>
          {authenticated ? 'Biometric Verified' : 'Touch Sensor or Face ID'}
        </h3>
        <p style={{ fontSize: '13px', color: 'var(--text-secondary)', margin: '0 0 24px 0' }}>
          {reason}
        </p>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          <button
            className="btn-secondary"
            onClick={onFallbackPin}
            style={{ width: '100%' }}
          >
            <ShieldCheck size={16} />
            <span>Use App PIN Instead</span>
          </button>
        </div>
      </div>
    </div>
  );
};
