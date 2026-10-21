import React, { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useLanguage } from '../contexts/LanguageContext';
import { ApiService } from '../services/api';
import { Shield, Sparkles, TrendingUp, Lock, FileText, ArrowRight, Check } from 'lucide-react';

interface OnboardingPageProps {
  onComplete: () => void;
}

const steps = [
  {
    icon: Sparkles,
    title: 'Your Money. Your Control.',
    desc: 'Store, manage, and track all your money with military-grade financial security in one unified mobile wallet.',
    color: '#14b8a6',
  },
  {
    icon: TrendingUp,
    title: 'Track Every Transaction.',
    desc: 'Instant UPI payments, real-time transaction categorisation, and intelligent long-term monthly analytics.',
    color: '#0ea5e9',
  },
  {
    icon: Lock,
    title: 'Build Your Emergency Fund.',
    desc: 'Grow a locked emergency buffer that safeguards your financial future from unplanned expenses.',
    color: '#8b5cf6',
  },
  {
    icon: Shield,
    title: 'Understand Your Spending.',
    desc: 'Personalized AI financial insights, health scores, and smart daily saving suggestions tailored for you.',
    color: '#10b981',
  },
  {
    icon: FileText,
    title: 'Secure Your Important Documents.',
    desc: 'Encrypted document vault for Aadhaar, PAN, Driving Licence, and Passport with automated expiry reminders.',
    color: '#f59e0b',
  },
];

export const OnboardingPage: React.FC<OnboardingPageProps> = ({ onComplete }) => {
  const { register, login } = useAuth();
  const { availableLanguages, language, setLanguage } = useLanguage();

  const [currentStep, setCurrentStep] = useState<number>(0);
  const [showRegisterForm, setShowRegisterForm] = useState<boolean>(false);

  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [pin, setPin] = useState('');
  const [emailOtp, setEmailOtp] = useState('');
  const [otpSent, setOtpSent] = useState(false);
  const [statusMessage, setStatusMessage] = useState('');
  const [developmentOtp, setDevelopmentOtp] = useState('');
  const [loginMode, setLoginMode] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleNext = () => {
    if (currentStep < steps.length - 1) {
      setCurrentStep(prev => prev + 1);
    } else {
      setShowRegisterForm(true);
    }
  };

  const handleRegisterSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (loginMode) {
      const success = await login(email, password);
      if (success) onComplete();
      else setError('Sign in failed. Check your email and password, and make sure the server is available.');
      return;
    }
    if (!fullName.trim() || !email.trim() || !pin.trim()) {
      setError('Please fill in all required fields.');
      return;
    }
    if (pin.length !== 4) {
      setError('PIN must be exactly 4 digits.');
      return;
    }

    if (!otpSent) {
      const result = await ApiService.sendRegistrationOtp(email.trim());
      if (!result.success) { setError(result.message || 'Could not send verification code.'); return; }
      setOtpSent(true);
      setStatusMessage(result.message || `Verification code sent to ${email}.`);
      setDevelopmentOtp((result.data as { developmentOtp?: string } | undefined)?.developmentOtp || '');
      return;
    }
    if (!emailOtp.trim()) { setError('Enter the verification code sent to your email.'); return; }
    const verification = await ApiService.verifyRegistrationOtp(email.trim(), emailOtp.trim());
    if (!verification.success) { setError(verification.message || 'That verification code could not be confirmed.'); return; }

    const success = await register(fullName, email, '', password, pin);
    if (success) {
      onComplete();
    } else setError('Account creation failed. Check your details and try again.');
  };

  const StepIcon = steps[currentStep].icon;

  return (
      <div
      className="onboarding-shell"
      style={{
        minHeight: '100vh',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        padding: '24px 20px',
        background: 'linear-gradient(160deg, #0b1120 0%, #111e38 50%, #0b1120 100%)',
        color: '#f8fafc',
      }}
    >
      {/* Top Language Switcher */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <div
            style={{
              width: '32px',
              height: '32px',
              borderRadius: '8px',
              background: 'linear-gradient(135deg, #14b8a6, #0ea5e9)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontWeight: 800,
              fontSize: '16px',
            }}
          >
            FP
          </div>
          <span style={{ fontWeight: 800, fontSize: '16px', letterSpacing: '-0.3px' }}>FinPocket</span>
        </div>

        <select
          value={language}
          onChange={e => setLanguage(e.target.value as any)}
          style={{
            background: 'rgba(30, 41, 59, 0.8)',
            color: '#94a3b8',
            border: '1px solid rgba(148, 163, 184, 0.2)',
            borderRadius: '12px',
            padding: '4px 8px',
            fontSize: '12px',
            outline: 'none',
          }}
        >
          {availableLanguages.map(l => (
            <option key={l.code} value={l.code}>
              {l.nativeName}
            </option>
          ))}
        </select>
      </div>

      {!showRegisterForm ? (
        <div style={{ textAlign: 'center', margin: '40px 0' }} className="animate-fade">
          <div
            style={{
              width: '90px',
              height: '90px',
              borderRadius: '50%',
              background: `rgba(20, 184, 166, 0.15)`,
              color: steps[currentStep].color,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              margin: '0 auto 28px auto',
              boxShadow: `0 0 40px rgba(20, 184, 166, 0.3)`,
            }}
          >
            <StepIcon size={46} />
          </div>

          <h2 style={{ fontSize: '24px', fontWeight: 800, margin: '0 0 12px 0', lineHeight: '1.3' }}>
            {steps[currentStep].title}
          </h2>

          <p style={{ fontSize: '14px', color: '#94a3b8', lineHeight: '1.6', maxWidth: '320px', margin: '0 auto' }}>
            {steps[currentStep].desc}
          </p>

          {/* Dots Indicator */}
          <div style={{ display: 'flex', justifyContent: 'center', gap: '8px', marginTop: '36px' }}>
            {steps.map((_, i) => (
              <div
                key={i}
                style={{
                  width: i === currentStep ? '24px' : '8px',
                  height: '8px',
                  borderRadius: '4px',
                  backgroundColor: i === currentStep ? '#14b8a6' : 'rgba(148, 163, 184, 0.3)',
                  transition: 'all 0.3s ease',
                }}
              />
            ))}
          </div>
        </div>
      ) : (
        <div className="animate-fade" style={{ margin: '20px 0' }}>
          <h2 style={{ fontSize: '22px', fontWeight: 800, margin: '0 0 6px 0' }}>{loginMode ? 'Sign in to FinPocket' : 'Create Your Account'}</h2>
          <p style={{ fontSize: '13px', color: '#94a3b8', margin: '0 0 20px 0' }}>
            {loginMode ? 'Use your registered email and password.' : 'Your account is private and linked to your verified email.'}
          </p>

          {error && (
            <div style={{ background: 'rgba(239, 68, 68, 0.2)', color: '#ef4444', padding: '10px', borderRadius: '10px', fontSize: '12px', marginBottom: '14px' }}>
              {error}
            </div>
          )}
          {statusMessage && (
            <div style={{ background: 'rgba(20, 184, 166, 0.14)', color: '#99f6e4', padding: '10px', borderRadius: '10px', fontSize: '12px', marginBottom: '14px' }}>
              {statusMessage}
              {developmentOtp && <div style={{ fontSize: '22px', fontWeight: 800, letterSpacing: '6px', marginTop: '8px' }}>{developmentOtp}</div>}
            </div>
          )}

          <form onSubmit={handleRegisterSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {!loginMode && <div>
              <label style={{ display: 'block', fontSize: '12px', color: '#94a3b8', marginBottom: '4px' }}>Full Name</label>
              <input className="fp-input" value={fullName} onChange={e => setFullName(e.target.value)} required />
            </div>}

            <div>
              <label style={{ display: 'block', fontSize: '12px', color: '#94a3b8', marginBottom: '4px' }}>Email Address</label>
              <input type="email" className="fp-input" value={email} onChange={e => setEmail(e.target.value)} required />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '12px', color: '#94a3b8', marginBottom: '4px' }}>Password</label>
              <input type="password" autoComplete={loginMode ? 'current-password' : 'new-password'} className="fp-input" value={password} onChange={e => setPassword(e.target.value)} required />
              {!loginMode && <span style={{ display: 'block', fontSize: '11px', color: '#94a3b8', marginTop: '5px' }}>Use 8+ characters with uppercase and lowercase letters, a number, and a symbol.</span>}
            </div>

            {!loginMode && <div>
              <label style={{ display: 'block', fontSize: '12px', color: '#94a3b8', marginBottom: '4px' }}>Create 4-Digit Security PIN</label>
              <input
                type="password"
                maxLength={4}
                className="fp-input"
                style={{ letterSpacing: '8px', fontSize: '18px', textAlign: 'center' }}
                value={pin}
                onChange={e => setPin(e.target.value.replace(/\D/g, '').slice(0, 4))}
                placeholder="â€¢â€¢â€¢â€¢"
                required
              />
            </div>}

            {!loginMode && otpSent && <div>
              <label style={{ display: 'block', fontSize: '12px', color: '#94a3b8', marginBottom: '4px' }}>Email verification code</label>
              <input inputMode="numeric" autoComplete="one-time-code" className="fp-input" value={emailOtp} onChange={e => setEmailOtp(e.target.value.replace(/\D/g, '').slice(0, 6))} required />
              <span style={{ display: 'block', fontSize: '11px', color: '#94a3b8', marginTop: '5px' }}>Enter the code sent to {email}.</span>
            </div>}

            <button type="submit" className="btn-primary" style={{ marginTop: '12px' }}>
              <Check size={18} />
              <span>{loginMode ? 'Sign in' : otpSent ? 'Verify & create account' : 'Send verification code'}</span>
            </button>

            <button type="button" onClick={() => { setLoginMode(!loginMode); setError(null); setOtpSent(false); setEmailOtp(''); setStatusMessage(''); setDevelopmentOtp(''); }} style={{ background: 'none', border: 0, color: '#5eead4', cursor: 'pointer', padding: 8 }}>
              {loginMode ? 'New to FinPocket? Create an account' : 'Already have an account? Sign in'}
            </button>

          </form>
        </div>
      )}

      {!showRegisterForm ? (
        <div style={{ display: 'flex', gap: '12px' }}>
          <button
            onClick={() => { setLoginMode(true); setShowRegisterForm(true); }}
            style={{
              background: 'none',
              border: 'none',
              color: '#94a3b8',
              fontSize: '14px',
              fontWeight: 600,
              cursor: 'pointer',
              padding: '12px',
            }}
          >
            Sign in
          </button>
          <button className="btn-primary" onClick={handleNext} style={{ flex: 1 }}>
            <span>{currentStep === steps.length - 1 ? 'Get Started' : 'Next'}</span>
            <ArrowRight size={16} />
          </button>
        </div>
      ) : null}
    </div>
  );
};
