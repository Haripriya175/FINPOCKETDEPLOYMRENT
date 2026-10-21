import React, { useState } from 'react';
import { useLanguage } from '../../contexts/LanguageContext';
import { useChildCare } from '../../contexts/ChildCareContext';
import { X, Camera, Flashlight, Image as ImageIcon, QrCode } from 'lucide-react';

interface ScanQrModalProps {
  isOpen: boolean;
  onClose: () => void;
  onQrScanned: (merchantName: string, defaultAmount?: number) => void;
}

const mockMerchants = [
  { name: 'Starbucks Coffee Hitech City', upi: 'starbucks@icici', defaultAmount: 340 },
  { name: 'Supermarket Groceries Mart', upi: 'mart@paytm', defaultAmount: 650 },
  { name: 'Indian Oil Fuel Station', upi: 'indianoil@axis', defaultAmount: 500 },
];

export const ScanQrModal: React.FC<ScanQrModalProps> = ({ isOpen, onClose, onQrScanned }) => {
  const { t } = useLanguage();
  const { isChildCareActive, showPaymentBlockedAlert } = useChildCare();
  const [torchOn, setTorchOn] = useState(false);

  if (!isOpen) return null;

  const handleSimulatedScan = (merchant: typeof mockMerchants[0]) => {
    if (isChildCareActive) {
      onClose();
      showPaymentBlockedAlert();
      return;
    }
    onClose();
    onQrScanned(`${merchant.name} (${merchant.upi})`, merchant.defaultAmount);
  };

  return (
    <div className="modal-overlay animate-fade">
      <div
        className="modal-sheet animate-slide-up"
        style={{
          height: '80vh',
          display: 'flex',
          flexDirection: 'column',
          background: '#090d16',
          color: '#fff',
        }}
      >
        <div className="sheet-handle" />

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
          <h3 style={{ fontSize: '16px', fontWeight: 700, margin: 0 }}>
            {t.scanQrTitle}
          </h3>
          <button
            onClick={onClose}
            style={{
              background: 'none',
              border: 'none',
              color: '#94a3b8',
              cursor: 'pointer',
            }}
          >
            <X size={20} />
          </button>
        </div>

        {/* Camera Viewport Simulation */}
        <div
          style={{
            flex: 1,
            position: 'relative',
            background: '#0f172a',
            borderRadius: '16px',
            overflow: 'hidden',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            border: '2px solid rgba(20, 184, 166, 0.4)',
          }}
        >
          {/* Scanner viewfinder corners */}
          <div
            style={{
              width: '200px',
              height: '200px',
              border: '2px dashed var(--primary)',
              borderRadius: '16px',
              position: 'relative',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            {/* Animated scan line */}
            <div
              style={{
                position: 'absolute',
                left: 0,
                right: 0,
                height: '2px',
                background: 'linear-gradient(90deg, transparent, #14b8a6, transparent)',
                boxShadow: '0 0 10px #14b8a6',
                animation: 'slideUp 2s ease-in-out infinite alternate',
              }}
            />
            <span style={{ fontSize: '11px', color: '#94a3b8', textAlign: 'center', padding: '10px' }}>
              Align QR Code within frame
            </span>
          </div>

          <div
            style={{
              position: 'absolute',
              bottom: '16px',
              display: 'flex',
              gap: '16px',
            }}
          >
            <button
              onClick={() => setTorchOn(!torchOn)}
              style={{
                width: '40px',
                height: '40px',
                borderRadius: '50%',
                background: torchOn ? 'var(--primary)' : 'rgba(255,255,255,0.15)',
                border: 'none',
                color: '#fff',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer',
              }}
            >
              <Flashlight size={18} />
            </button>
          </div>
        </div>

        {/* Demo QR Presets */}
        <div style={{ marginTop: '14px' }}>
          <span style={{ fontSize: '12px', color: '#94a3b8', fontWeight: 600 }}>
            Simulate Merchant QR Code:
          </span>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '8px' }}>
            {mockMerchants.map((m, idx) => (
              <button
                key={idx}
                onClick={() => handleSimulatedScan(m)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  background: 'rgba(255,255,255,0.06)',
                  border: '1px solid rgba(255,255,255,0.1)',
                  borderRadius: '10px',
                  padding: '10px 12px',
                  color: '#fff',
                  cursor: 'pointer',
                  textAlign: 'left',
                }}
              >
                <div>
                  <div style={{ fontSize: '13px', fontWeight: 600 }}>{m.name}</div>
                  <div style={{ fontSize: '11px', color: '#94a3b8' }}>{m.upi}</div>
                </div>
                <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--primary-light)' }}>
                  Pay ₹{m.defaultAmount}
                </div>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};
