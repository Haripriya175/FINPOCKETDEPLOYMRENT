import React from 'react';
import { useChildCare } from '../../contexts/ChildCareContext';
import { useLanguage } from '../../contexts/LanguageContext';
import { ShieldAlert, Lock } from 'lucide-react';

interface ChildCareBannerProps {
  onExitClick: () => void;
}

export const ChildCareBanner: React.FC<ChildCareBannerProps> = ({ onExitClick }) => {
  const { isChildCareActive } = useChildCare();
  const { t } = useLanguage();

  if (!isChildCareActive) return null;

  return (
    <div className="child-care-banner animate-fade">
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        <ShieldAlert size={18} />
        <span>{t.childCareActive} — {t.childCareDesc}</span>
      </div>
      <button
        onClick={onExitClick}
        style={{
          background: 'rgba(15, 23, 42, 0.9)',
          color: '#f8fafc',
          border: 'none',
          padding: '4px 10px',
          borderRadius: '12px',
          fontSize: '11px',
          fontWeight: 700,
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          gap: '4px',
        }}
      >
        <Lock size={11} />
        <span>{t.exitChildCare}</span>
      </button>
    </div>
  );
};
