type TurnstileVerification =
  | { success: true }
  | { success: false; reason: 'missing_token' | 'not_configured' | 'provider_rejected' | 'provider_unavailable' };

interface TurnstileSiteverifyResponse {
  success: boolean;
  action?: string;
  'error-codes'?: string[];
  metadata?: {
    result_with_testing_key?: boolean;
  };
}

export async function verifyTurnstileToken(token: unknown, remoteIp?: string): Promise<TurnstileVerification> {
  if (typeof token !== 'string' || !token.trim()) {
    return { success: false, reason: 'missing_token' };
  }

  const secret = process.env.TURNSTILE_SECRET_KEY;
  if (!secret) {
    console.error('[turnstile] verification unavailable: TURNSTILE_SECRET_KEY is not configured');
    return { success: false, reason: 'not_configured' };
  }

  try {
    const parameters = new URLSearchParams({ secret, response: token.trim() });
    if (remoteIp) parameters.set('remoteip', remoteIp);

    const response = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: parameters,
      signal: AbortSignal.timeout(5000),
    });

    if (!response.ok) {
      console.error(`[turnstile] siteverify returned HTTP ${response.status}`);
      return { success: false, reason: 'provider_unavailable' };
    }

    const result = await response.json() as TurnstileSiteverifyResponse;
    const localTestKeyAccepted = process.env.NODE_ENV === 'DEVELOPMENT'
      && secret === '1x0000000000000000000000000000000AA'
      && result.metadata?.result_with_testing_key === true;
    if (result.success && (result.action === 'signup' || localTestKeyAccepted)) {
      return { success: true };
    }

    console.warn('[turnstile] siteverify rejected a signup token', result['error-codes'] || []);
    return { success: false, reason: 'provider_rejected' };
  } catch (error) {
    console.error('[turnstile] siteverify request failed:', error instanceof Error ? error.message : error);
    return { success: false, reason: 'provider_unavailable' };
  }
}
