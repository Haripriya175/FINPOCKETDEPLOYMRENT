import React, { useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { useLanguage } from '../../contexts/LanguageContext';
import { X, QrCode, Copy, Check, Share2, Download } from 'lucide-react';

interface ReceiveQrModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const ReceiveQrModal: React.FC<ReceiveQrModalProps> = ({ isOpen, onClose }) => {
  const { user } = useAuth();
  const { t } = useLanguage();
  const [copied, setCopied] = useState(false);
  const [customAmount, setCustomAmount] = useState('');

  if (!isOpen) return null;

  const upiId = `${user?.email?.split('@')[0] || 'jithendra'}@finpocket`;

  const handleCopy = () => {
    navigator.clipboard.writeText(upiId);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  return (
    <div className="modal-overlay animate-fade">
      <div className="modal-sheet animate-slide-up" style={{ textAlign: 'center' }}>
        <div className="sheet-handle" />

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
          <h3 style={{ fontSize: '18px', fontWeight: 700, margin: 0, color: 'var(--text-primary)' }}>
            {t.receiveQrTitle}
          </h3>
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

        {/* QR Card Container */}
        <div
          style={{
            background: '#ffffff',
            borderRadius: '16px',
            padding: '24px 16px',
            display: 'inline-block',
            margin: '0 auto 16px auto',
            boxShadow: '0 8px 24px rgba(0,0,0,0.2)',
          }}
        >
          {/* Simulated clean QR code matrix */}
          <div
            style={{
              width: '180px',
              height: '180px',
              margin: '0 auto',
              background: 'repeating-conic-gradient(#0f172a 0% 25%, #ffffff 0% 50%) 50% / 18px 18px',
              position: 'relative',
              borderRadius: '8px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <div
              style={{
                width: '42px',
                height: '42px',
                borderRadius: '8px',
                background: '#14b8a6',
                color: '#fff',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontWeight: 800,
                fontSize: '18px',
                border: '3px solid #fff',
              }}
            >
              FP
            </div>
          </div>

          <div style={{ marginTop: '12px', color: '#0f172a' }}>
            <h4 style={{ fontSize: '15px', fontWeight: 700, margin: 0 }}>
              {user?.fullName || 'FinPocket User'}
            </h4>
            <p style={{ fontSize: '12px', color: '#64748b', margin: '2px 0 0 0' }}>
              {upiId}
            </p>
            {customAmount && parseFloat(customAmount) > 0 && (
              <div style={{ marginTop: '6px', fontSize: '16px', fontWeight: 800, color: '#0d9488' }}>
                ₹{parseFloat(customAmount).toLocaleString('en-IN')}
              </div>
            )}
          </div>
        </div>

        {/* Amount customizer */}
        <div style={{ maxWidth: '280px', margin: '0 auto 16px auto' }}>
          <input
            type="number"
            className="fp-input"
            style={{ textAlign: 'center', fontSize: '14px' }}
            placeholder="Set specific amount (optional)"
            value={customAmount}
            onChange={e => setCustomAmount(e.target.value)}
          />
        </div>

        {/* Copy UPI Button */}
        <button
          className="btn-secondary"
          onClick={handleCopy}
          style={{ width: '100%', marginBottom: '10px' }}
        >
          {copied ? <Check size={16} color="var(--success)" /> : <Copy size={16} />}
          <span>{copied ? t.upiCopied : t.copyUpi}</span>
        </button>

        <div style={{ display: 'flex', gap: '10px' }}>
          <button className="btn-secondary" onClick={handleCopy} style={{ flex: 1 }}>
            <Share2 size={16} />
            <span>Share</span>
          </button>
          <button className="btn-secondary" onClick={handleCopy} style={{ flex: 1 }}>
            <Download size={16} />
            <span>Save Image</span>
          </button>
        </div>
      </div>
    </div>
  );
};
