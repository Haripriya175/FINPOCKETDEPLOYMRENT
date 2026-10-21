import React, { useState } from 'react';
import { useChildCare } from '../contexts/ChildCareContext';
import { useLanguage } from '../contexts/LanguageContext';
import {
  ShieldAlert,
  ShieldCheck,
  Lock,
  Unlock,
  CheckCircle2,
  AlertTriangle,
  EyeOff,
  Ban,
  Baby,
} from 'lucide-react';

interface ChildCarePageProps {
  onRequestPin: (onVerified: () => void) => void;
}

export const ChildCarePage: React.FC<ChildCarePageProps> = ({ onRequestPin }) => {
  const { settings, isChildCareActive, enableChildCare, disableChildCare } = useChildCare();
  const { t } = useLanguage();

  const handleToggle = () => {
    if (isChildCareActive) {
      // Exit requires parent PIN
      onRequestPin(() => {
        disableChildCare('1234');
      });
    } else {
      // Enable requires parent PIN
      onRequestPin(() => {
        enableChildCare('1234');
      });
    }
  };

  return (
    <div className="mobile-body animate-fade">
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '16px' }}>
        <div
          style={{
            width: '40px',
            height: '40px',
            borderRadius: '12px',
            background: isChildCareActive ? 'rgba(245, 158, 11, 0.2)' : 'rgba(20, 184, 166, 0.2)',
            color: isChildCareActive ? 'var(--warning)' : 'var(--primary-light)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Baby size={24} />
        </div>
        <div>
          <h2 style={{ fontSize: '20px', fontWeight: 800, margin: 0, color: 'var(--text-primary)' }}>
            {t.childCareTitle}
          </h2>
          <span className={isChildCareActive ? 'badge badge-warning' : 'badge badge-teal'} style={{ marginTop: '2px' }}>
            {isChildCareActive ? 'Mode Active' : 'Mode Disabled'}
          </span>
        </div>
      </div>

      {/* Main Activation Card */}
      <div
        className="fp-card"
        style={{
          background: isChildCareActive
            ? 'linear-gradient(135deg, rgba(245, 158, 11, 0.15) 0%, rgba(217, 119, 6, 0.1) 100%)'
            : 'var(--bg-card)',
          border: isChildCareActive ? '1px solid var(--warning)' : '1px solid var(--border-color)',
          padding: '20px',
          borderRadius: 'var(--radius-lg)',
          marginBottom: '20px',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
          <div>
            <h3 style={{ fontSize: '16px', fontWeight: 700, margin: 0, color: 'var(--text-primary)' }}>
              Child Payment Safety Guard
            </h3>
            <p style={{ fontSize: '12px', color: 'var(--text-secondary)', margin: '4px 0 0 0' }}>
              Protects parents when children use the phone for games, education, or videos.
            </p>
          </div>
        </div>

        <button
          className={isChildCareActive ? 'btn-primary btn-danger' : 'btn-primary'}
          onClick={handleToggle}
          style={{ marginTop: '10px' }}
        >
          {isChildCareActive ? <Lock size={16} /> : <ShieldAlert size={16} />}
          <span>{isChildCareActive ? 'Exit Child Care (Parent PIN)' : 'Activate Child Care Mode'}</span>
        </button>
      </div>

      {/* Active Safeguard Guarantees */}
      <div style={{ marginBottom: '20px' }}>
        <span style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-primary)', display: 'block', marginBottom: '10px' }}>
          Enforced Safeguards in Child Care Mode:
        </span>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          <div className="fp-card" style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '12px' }}>
            <Ban size={22} color="var(--danger)" />
            <div>
              <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)' }}>
                All Outgoing Payments Blocked
              </div>
              <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                Send money, QR scans, and in-app merchant transfers are strictly rejected.
              </div>
            </div>
          </div>

          <div className="fp-card" style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '12px' }}>
            <EyeOff size={22} color="var(--accent-blue)" />
            <div>
              <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)' }}>
                Account Balances Masked
              </div>
              <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                Financial amounts and connected bank numbers are replaced with privacy masks.
              </div>
            </div>
          </div>

          <div className="fp-card" style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '12px' }}>
            <Lock size={22} color="var(--primary)" />
            <div>
              <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)' }}>
                Parent PIN / Biometric Exit Lock
              </div>
              <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                Child cannot bypass restriction via deep links, task switching, or restarts.
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
