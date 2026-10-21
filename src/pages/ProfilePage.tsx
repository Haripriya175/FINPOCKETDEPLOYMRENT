import React, { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useLanguage } from '../contexts/LanguageContext';
import { useTheme } from '../contexts/ThemeContext';
import { TabType } from '../components/navigation/BottomNav';
import {
  User,
  Shield,
  Fingerprint,
  Lock,
  Globe,
  Sun,
  Moon,
  Smartphone,
  LogOut,
  Building,
  FileText,
  Baby,
  ChevronRight,
  CreditCard,
  Trash2,
  Download,
  Check,
  PieChart,
} from 'lucide-react';
import { SupportedLanguage } from '../types';
import { ExportReportModal } from '../components/reports/ExportReportModal';

interface ProfilePageProps {
  onNavigate: (tab: TabType) => void;
  onRequestPin: (onVerified: () => void) => void;
}

export const ProfilePage: React.FC<ProfilePageProps> = ({ onNavigate, onRequestPin }) => {
  const {
    user,
    sessions,
    logout,
    logoutAllDevices,
    toggleBiometrics,
    setAppPin,
  } = useAuth();
  const { language, setLanguage, availableLanguages, t } = useLanguage();
  const { theme, toggleTheme } = useTheme();

  const [showLanguagePicker, setShowLanguagePicker] = useState(false);
  const [showChangePinModal, setShowChangePinModal] = useState(false);
  const [showExportModal, setShowExportModal] = useState<boolean>(false);
  const [newPin, setNewPin] = useState('');

  const handleLanguageSelect = (code: SupportedLanguage) => {
    setLanguage(code);
    setShowLanguagePicker(false);
  };

  const handleChangePinSubmit = () => {
    if (newPin.length === 4) {
      onRequestPin(() => {
        setAppPin(newPin);
        setNewPin('');
        setShowChangePinModal(false);
        alert('App Security PIN successfully updated!');
      });
    }
  };

  return (
    <div className="mobile-body animate-fade">
      <h2 style={{ fontSize: '20px', fontWeight: 800, margin: '0 0 16px 0', color: 'var(--text-primary)' }}>
        {t.navProfile}
      </h2>

      {/* User Info Profile Card */}
      <div className="fp-card" style={{ display: 'flex', alignItems: 'center', gap: '14px', marginBottom: '20px' }}>
        <div
          style={{
            width: '54px',
            height: '54px',
            borderRadius: '50%',
            background: 'linear-gradient(135deg, #14b8a6, #0ea5e9)',
            color: '#fff',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontWeight: 800,
            fontSize: '20px',
            boxShadow: '0 4px 12px rgba(20, 184, 166, 0.4)',
          }}
        >
          {user?.fullName ? user.fullName[0].toUpperCase() : 'U'}
        </div>

        <div style={{ flex: 1 }}>
          <h3 style={{ fontSize: '16px', fontWeight: 700, margin: 0, color: 'var(--text-primary)' }}>
            {user?.fullName}
          </h3>
          <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '2px' }}>
            {user?.email}
          </div>
          <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
            {user?.phone || '+91 98765 43210'}
          </div>
        </div>
      </div>

      {/* Feature Short-cuts Menu */}
      <div style={{ marginBottom: '20px' }}>
        <span style={{ fontSize: '12px', color: 'var(--text-secondary)', fontWeight: 600, textTransform: 'uppercase', marginBottom: '8px', display: 'block' }}>
          Quick Services
        </span>

        <div className="fp-card" style={{ padding: '4px 12px' }}>
          <div
            onClick={() => onNavigate('bills')}
            style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 0', borderBottom: '1px solid var(--border-color)', cursor: 'pointer' }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <CreditCard size={18} color="var(--primary-light)" />
              <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)' }}>Bills & EMI Manager</span>
            </div>
            <ChevronRight size={16} color="var(--text-muted)" />
          </div>

          <div
            onClick={() => onNavigate('vault')}
            style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 0', borderBottom: '1px solid var(--border-color)', cursor: 'pointer' }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <FileText size={18} color="var(--accent-blue)" />
              <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)' }}>Personal Document Vault</span>
            </div>
            <ChevronRight size={16} color="var(--text-muted)" />
          </div>

          <div
            onClick={() => onNavigate('childcare')}
            style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 0', borderBottom: '1px solid var(--border-color)', cursor: 'pointer' }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <Baby size={18} color="var(--warning)" />
              <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)' }}>Child Care Safety Mode</span>
            </div>
            <ChevronRight size={16} color="var(--text-muted)" />
          </div>

          <div
            onClick={() => onNavigate('budgets')}
            style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 0', borderBottom: '1px solid var(--border-color)', cursor: 'pointer' }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <PieChart size={18} color="var(--primary)" />
              <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)' }}>Budgets & Spending Limits</span>
            </div>
            <ChevronRight size={16} color="var(--text-muted)" />
          </div>

          <div
            onClick={() => setShowExportModal(true)}
            style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 0', cursor: 'pointer' }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <Download size={18} color="var(--primary-light)" />
              <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)' }}>Download Statements & PDF Reports</span>
            </div>
            <ChevronRight size={16} color="var(--text-muted)" />
          </div>
        </div>
      </div>

      {/* App Preferences (Language & Theme) */}
      <div style={{ marginBottom: '20px' }}>
        <span style={{ fontSize: '12px', color: 'var(--text-secondary)', fontWeight: 600, textTransform: 'uppercase', marginBottom: '8px', display: 'block' }}>
          Preferences
        </span>

        <div className="fp-card" style={{ padding: '4px 12px' }}>
          <div
            onClick={() => setShowLanguagePicker(true)}
            style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 0', borderBottom: '1px solid var(--border-color)', cursor: 'pointer' }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <Globe size={18} color="var(--primary-light)" />
              <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)' }}>Language</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span style={{ fontSize: '12px', color: 'var(--primary-light)', fontWeight: 600 }}>
                {availableLanguages.find(l => l.code === language)?.nativeName}
              </span>
              <ChevronRight size={16} color="var(--text-muted)" />
            </div>
          </div>

          <div
            onClick={toggleTheme}
            style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 0', cursor: 'pointer' }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              {theme === 'dark' ? <Moon size={18} color="var(--accent-purple)" /> : <Sun size={18} color="var(--warning)" />}
              <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)' }}>Theme Mode</span>
            </div>
            <span style={{ fontSize: '12px', color: 'var(--text-secondary)', textTransform: 'capitalize' }}>
              {theme} Mode
            </span>
          </div>
        </div>
      </div>

      {/* Security Center */}
      <div style={{ marginBottom: '20px' }}>
        <span style={{ fontSize: '12px', color: 'var(--text-secondary)', fontWeight: 600, textTransform: 'uppercase', marginBottom: '8px', display: 'block' }}>
          {t.securityCenter}
        </span>

        <div className="fp-card" style={{ padding: '4px 12px' }}>
          {/* Biometrics Switch */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 0', borderBottom: '1px solid var(--border-color)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <Fingerprint size={18} color="var(--primary-light)" />
              <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)' }}>{t.biometricLogin}</span>
            </div>
            <input
              type="checkbox"
              checked={user?.biometricsEnabled ?? true}
              onChange={e => toggleBiometrics(e.target.checked)}
              style={{ width: '18px', height: '18px', accentColor: 'var(--primary)', cursor: 'pointer' }}
            />
          </div>

          {/* Change PIN */}
          <div
            onClick={() => setShowChangePinModal(true)}
            style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 0', borderBottom: '1px solid var(--border-color)', cursor: 'pointer' }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <Lock size={18} color="var(--primary-light)" />
              <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)' }}>Change App PIN</span>
            </div>
            <ChevronRight size={16} color="var(--text-muted)" />
          </div>

          {/* Active Device Sessions */}
          <div style={{ padding: '12px 0' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
              <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)' }}>
                {t.activeSessions} ({sessions.length})
              </span>
              {sessions.length > 1 && (
                <button
                  onClick={logoutAllDevices}
                  style={{ background: 'none', border: 'none', color: 'var(--danger)', fontSize: '11px', fontWeight: 600, cursor: 'pointer' }}
                >
                  {t.logoutAllDevices}
                </button>
              )}
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              {sessions.map(s => (
                <div key={s.id} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: 'var(--text-secondary)' }}>
                  <span>{s.deviceName}</span>
                  <span style={{ color: s.isCurrent ? 'var(--success)' : 'var(--text-muted)' }}>{s.lastActive}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Logout Button */}
      <button
        className="btn-secondary"
        onClick={logout}
        style={{ width: '100%', color: 'var(--danger)', borderColor: 'rgba(239, 68, 68, 0.3)', marginBottom: '20px' }}
      >
        <LogOut size={16} />
        <span>{t.logout}</span>
      </button>

      {/* Language Picker Modal */}
      {showLanguagePicker && (
        <div className="modal-overlay animate-fade">
          <div className="modal-sheet animate-slide-up">
            <div className="sheet-handle" />
            <h3 style={{ fontSize: '18px', fontWeight: 700, margin: '0 0 14px 0', color: 'var(--text-primary)' }}>
              Select Language / భాష ఎంచుకోండి
            </h3>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '16px' }}>
              {availableLanguages.map(l => (
                <button
                  key={l.code}
                  onClick={() => handleLanguageSelect(l.code)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '12px 14px',
                    borderRadius: '12px',
                    background: language === l.code ? 'rgba(20, 184, 166, 0.15)' : 'var(--bg-card)',
                    border: language === l.code ? '1px solid var(--primary)' : '1px solid var(--border-color)',
                    color: language === l.code ? 'var(--primary-light)' : 'var(--text-primary)',
                    cursor: 'pointer',
                  }}
                >
                  <div>
                    <div style={{ fontSize: '14px', fontWeight: 700 }}>{l.nativeName}</div>
                    <div style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>{l.name}</div>
                  </div>
                  {language === l.code && <Check size={18} color="var(--primary)" />}
                </button>
              ))}
            </div>

            <button className="btn-secondary" onClick={() => setShowLanguagePicker(false)} style={{ width: '100%' }}>
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Change PIN Modal */}
      {showChangePinModal && (
        <div className="modal-overlay animate-fade">
          <div className="modal-sheet animate-slide-up">
            <div className="sheet-handle" />
            <h3 style={{ fontSize: '18px', fontWeight: 700, margin: '0 0 12px 0' }}>Change App PIN</h3>
            <p style={{ fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '14px' }}>
              Enter a new 4-digit security PIN. You will need to confirm with your current PIN.
            </p>
            <div style={{ marginBottom: '20px' }}>
              <input
                type="password"
                maxLength={4}
                className="fp-input"
                style={{ textAlign: 'center', fontSize: '20px', letterSpacing: '8px' }}
                placeholder="••••"
                value={newPin}
                onChange={e => setNewPin(e.target.value)}
              />
            </div>
            <div style={{ display: 'flex', gap: '10px' }}>
              <button className="btn-secondary" onClick={() => setShowChangePinModal(false)} style={{ flex: 1 }}>
                Cancel
              </button>
              <button className="btn-primary" onClick={handleChangePinSubmit} style={{ flex: 1 }}>
                Update PIN
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Official Bank Statement & Financial Report Export Modal */}
      <ExportReportModal
        isOpen={showExportModal}
        onClose={() => setShowExportModal(false)}
      />
    </div>
  );
};
