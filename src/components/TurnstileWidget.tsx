import { useEffect, useRef, useState } from 'react';

interface TurnstileApi {
  render: (
    container: HTMLElement,
    options: {
      sitekey: string;
      action: string;
      callback: (token: string) => void;
      'expired-callback': () => void;
      'error-callback': () => void;
    },
  ) => string;
  remove: (widgetId: string) => void;
}

declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

interface TurnstileWidgetProps {
  onTokenChange: (token: string) => void;
  resetKey: number;
}

let turnstileScript: Promise<void> | null = null;

function loadTurnstile(): Promise<void> {
  if (window.turnstile) return Promise.resolve();
  if (!turnstileScript) {
    turnstileScript = new Promise<void>((resolve, reject) => {
      const script = document.createElement('script');
      script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
      script.async = true;
      script.defer = true;
      script.onload = () => window.turnstile ? resolve() : reject(new Error('CAPTCHA script did not initialize.'));
      script.onerror = () => reject(new Error('CAPTCHA script could not be loaded.'));
      document.head.appendChild(script);
    }).catch((error: unknown) => {
      turnstileScript = null;
      throw error;
    });
  }
  return turnstileScript;
}

export function TurnstileWidget({ onTokenChange, resetKey }: TurnstileWidgetProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [retryKey, setRetryKey] = useState(0);
  const [widgetState, setWidgetState] = useState<{
    attemptKey: string;
    status: 'loading' | 'ready' | 'complete' | 'error';
    errorMessage: string;
  }>({ attemptKey: '', status: 'loading', errorMessage: '' });
  const siteKey = import.meta.env.VITE_TURNSTILE_SITE_KEY?.trim();
  const attemptKey = `${resetKey}:${retryKey}`;
  const activeState = widgetState.attemptKey === attemptKey
    ? widgetState
    : { attemptKey, status: 'loading' as const, errorMessage: '' };
  const { status, errorMessage } = siteKey
    ? activeState
    : {
        status: 'error' as const,
        errorMessage: 'Security verification is not configured. Set VITE_TURNSTILE_SITE_KEY and reload.',
      };

  useEffect(() => {
    let cancelled = false;
    let widgetId: string | undefined;

    if (!siteKey) {
      return () => { cancelled = true; };
    }

    loadTurnstile().then(() => {
      if (cancelled || !containerRef.current || !window.turnstile) return;
      containerRef.current.replaceChildren();
      setWidgetState({ attemptKey, status: 'ready', errorMessage: '' });
      widgetId = window.turnstile.render(containerRef.current, {
        sitekey: siteKey,
        action: 'signup',
        callback: token => {
          onTokenChange(token);
          setWidgetState({ attemptKey, status: 'complete', errorMessage: '' });
        },
        'expired-callback': () => {
          onTokenChange('');
          setWidgetState({ attemptKey, status: 'error', errorMessage: 'The security check expired. Please complete it again.' });
        },
        'error-callback': () => {
          onTokenChange('');
          setWidgetState({ attemptKey, status: 'error', errorMessage: 'The security check could not be completed. Retry it or check your connection.' });
        },
      });
    }).catch(() => {
      if (!cancelled) {
        setWidgetState({ attemptKey, status: 'error', errorMessage: 'The security check could not be loaded. Check your connection and retry.' });
      }
    });

    return () => {
      cancelled = true;
      if (widgetId && window.turnstile) window.turnstile.remove(widgetId);
    };
  }, [attemptKey, onTokenChange, siteKey]);

  const retry = () => {
    onTokenChange('');
    setRetryKey(key => key + 1);
  };

  return (
    <div role="group" aria-label="Security verification">
      <div ref={containerRef} />
      <p role={status === 'error' ? 'alert' : 'status'} aria-live="polite" style={{ color: '#94a3b8', fontSize: '12px', margin: '6px 0 0' }}>
        {status === 'loading' && 'Loading security check…'}
        {status === 'ready' && 'Complete the security check to continue.'}
        {status === 'complete' && 'Security check complete.'}
        {status === 'error' && errorMessage}
      </p>
      {status === 'error' && siteKey && (
        <button type="button" onClick={retry} style={{ background: 'none', border: 0, color: '#5eead4', cursor: 'pointer', padding: '6px 0' }}>
          Retry security check
        </button>
      )}
    </div>
  );
}
