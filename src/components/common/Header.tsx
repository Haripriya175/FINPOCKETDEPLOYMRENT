import React from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { useTheme } from '../../contexts/ThemeContext';
import { useLanguage } from '../../contexts/LanguageContext';
import { useChildCare } from '../../contexts/ChildCareContext';
import { Shield, ShieldAlert, Sun, Moon, Wifi, WifiOff, Sparkles } from 'lucide-react';

interface HeaderProps {
  title?: string;
  onOpenAssistant?: () => void;
}

export const Header: React.FC<HeaderProps> = ({ title, onOpenAssistant }) => {
  const { user, isServerOnline } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const { isChildCareActive } = useChildCare();

  return (
    <header className="top-bar">
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
        <div
          style={{
            width: '36px',
            height: '36px',
            borderRadius: '10px',
            background: 'linear-gradient(135deg, #14b8a6 0%, #0ea5e9 100%)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#fff',
            fontWeight: 800,
            fontSize: '18px',
            boxShadow: '0 2px 10px rgba(20, 184, 166, 0.4)',
          }}
        >
          FP
        </div>
        <div>
          <h1 style={{ fontSize: '16px', fontWeight: 700, letterSpacing: '-0.3px', margin: 0, color: 'var(--text-primary)' }}>
            {title || 'FinPocket'}
          </h1>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '1px' }}>
            <span
              style={{
                width: '6px',
                height: '6px',
                borderRadius: '50%',
                backgroundColor: isServerOnline ? '#22c55e' : '#14b8a6',
              }}
            />
            <span style={{ fontSize: '10px', color: 'var(--text-muted)', fontWeight: 500 }}>
              {isServerOnline ? 'Cloud Synced' : 'Secure Vault Active'}
            </span>
          </div>
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        {onOpenAssistant && (
          <button
            onClick={onOpenAssistant}
            style={{
              background: 'rgba(20, 184, 166, 0.12)',
              border: '1px solid rgba(20, 184, 166, 0.3)',
              borderRadius: '20px',
              padding: '6px 10px',
              color: 'var(--primary-light)',
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
              cursor: 'pointer',
              fontSize: '11px',
              fontWeight: 600,
            }}
          >
            <Sparkles size={13} />
            <span>AI Assistant</span>
          </button>
        )}

        <button
          onClick={toggleTheme}
          style={{
            background: 'var(--bg-card)',
            border: '1px solid var(--border-color)',
            borderRadius: '50%',
            width: '34px',
            height: '34px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: 'var(--text-primary)',
            cursor: 'pointer',
          }}
          aria-label="Toggle Theme"
        >
          {theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
        </button>
      </div>
    </header>
  );
};
