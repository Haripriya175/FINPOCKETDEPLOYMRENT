# FinPocket — Account Aggregator Webhook & Callback Security

**Document Version:** 1.0.0  
**Classification:** Security Architecture Specification  
**Status:** IMPLEMENTED  

---

## 1. Webhook Threat Model & Mitigations

Incoming HTTP callbacks from Account Aggregator gateways notify FinPocket of consent approvals, rejections, revocations, and ready-to-fetch encrypted data notifications.

| Threat | Attack Vector | FinPocket Mitigation Mechanism |
| :--- | :--- | :--- |
| **Forged Webhook** | Attacker crafts fake consent approval payloads | Cryptographic HMAC-SHA256 signature verification over raw request body using shared webhook secret. |
| **Replay Attack** | Attacker re-transmits valid previous callback | Unique event `eventId` / `nonce` deduplication cache + strict 300-second timestamp window. |
| **IDOR / Tenant Hijacking** | Webhook attempts to attach bank accounts to arbitrary user | Strict server-side correlation: `consent_handle` in webhook is matched exclusively against previously stored server session. Client/payload cannot specify arbitrary `userId`. |
| **Malformed Injection** | Incomplete, malicious or oversized JSON payload | Schema validation, body size caps (100KB), and sanitized error handling. |

---

## 2. Signature Verification Algorithm

```typescript
import crypto from 'crypto';

export function verifyWebhookSignature(
  rawBody: string,
  signatureHeader: string,
  secret: string
): boolean {
  if (!signatureHeader || !secret) return false;
  
  const expectedSignature = crypto
    .createHmac('sha256', secret)
    .update(rawBody)
    .digest('hex');
    
  return crypto.timingSafeEqual(
    Buffer.from(signatureHeader, 'utf8'),
    Buffer.from(expectedSignature, 'utf8')
  );
}
```

---

## 3. Webhook Handling Flow

1. **Header Extraction:** Extract signature (`x-provider-signature` or `x-setu-signature`), timestamp (`x-provider-timestamp`), and event ID (`x-event-id`).
2. **Timestamp Verification:** Calculate `Math.abs(Date.now() - Date.parse(timestamp))`. If $> 300,000\text{ ms}$ (5 minutes), reject with HTTP `400 Bad Request`.
3. **Replay Deduplication:** Check in-memory/cache store for `eventId`. If already processed, return HTTP `200 OK` (idempotent no-op).
4. **Signature Verification:** Compute HMAC-SHA256 and perform constant-time comparison `timingSafeEqual`.
5. **Session Resolution:** Query database for pending consent matching `consent_handle`. If none exists, reject with HTTP `404 Not Found`.
6. **State Mutation:** Transition consent to `APPROVED` / `REJECTED` / `REVOKED` and trigger async data fetch.
