import crypto from 'crypto';
import { config } from '../config/app_config.js';

/**
 * Phase D — signed consent-return state for GET /api/v1/setu/redirect.
 *
 * The browser redirect from the aggregator is an UNAUTHENTICATED request:
 * anyone who knows a consent id could otherwise flip its status (ACTIVE /
 * REJECTED) by crafting a URL. At consent-creation time we append
 * `fp_state=<localConsentId>.<HMAC>` to the redirect URL we hand the
 * provider; on return we verify the MAC before any local mutation.
 *
 * The MAC key is the server's JWT secret (>= 32 chars, mandatory in
 * production) under a dedicated domain separator, so state signatures can
 * never be confused with session tokens. Comparison is timing-safe.
 */

const STATE_DOMAIN = 'finpocket:setu-redirect:v1';

function macFor(consentLocalId: string): string {
  return crypto
    .createHmac('sha256', config.jwtSecret)
    .update(`${STATE_DOMAIN}:${consentLocalId}`)
    .digest('hex');
}

/** Sign a local consent record id for embedding into the redirect URL. */
export function signRedirectState(consentLocalId: string): string {
  if (!consentLocalId) {
    throw new Error('signRedirectState: consent id is required');
  }
  return `${consentLocalId}.${macFor(consentLocalId)}`;
}

export type RedirectStateVerification =
  | { valid: true; consentLocalId: string }
  | { valid: false; reason: 'absent' | 'malformed' | 'bad-mac' };

/** Verify a state value received back on the redirect URL. Timing-safe. */
export function verifyRedirectState(
  state: string | undefined | null
): RedirectStateVerification {
  if (!state || typeof state !== 'string') {
    return { valid: false, reason: 'absent' };
  }
  const sep = state.lastIndexOf('.');
  if (sep <= 0 || sep === state.length - 1) {
    return { valid: false, reason: 'malformed' };
  }
  const consentLocalId = state.slice(0, sep);
  const presented = state.slice(sep + 1);
  const expected = macFor(consentLocalId);
  const a = Buffer.from(presented, 'utf8');
  const b = Buffer.from(expected, 'utf8');
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    return { valid: false, reason: 'bad-mac' };
  }
  return { valid: true, consentLocalId };
}

/** Append the signed state to a redirect URL (handles pre-existing query). */
export function withRedirectState(baseUrl: string, consentLocalId: string): string {
  const sep = baseUrl.includes('?') ? '&' : '?';
  return `${baseUrl}${sep}fp_state=${encodeURIComponent(signRedirectState(consentLocalId))}`;
}
