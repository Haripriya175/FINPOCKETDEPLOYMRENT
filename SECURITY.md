# FinPocket Security Policy & Architecture

## 1. Authentication & Session Architecture

FinPocket implements a hardened authentication and session management layer:
- **Password Hashing**: Industry-standard Argon2id / bcrypt hashing with per-user salt and configurable cost parameters. Passwords are never stored in plaintext.
- **Access Tokens**: Short-lived JWTs (default: 15 minutes) signed using asymmetric algorithms or high-entropy HMAC keys (minimum 32 bytes in production). Access tokens derive user identity and roles directly from the cryptographically verified token payload.
- **Refresh Token Lifecycle**:
  - Refresh tokens are hashed using SHA-256 before storage at rest.
  - Refresh tokens employ strict single-use rotation: upon use, the old token is invalidated and replaced with a new cryptographically generated token.
  - Token reuse detection automatically revokes the entire active session family upon detecting a used refresh token.
- **Device / Session Management**:
  - Each login creates a discrete session bound to `device_id` and metadata.
  - Users can list active sessions and revoke any individual device or all sessions remotely.
  - Session revocation takes immediate effect across all endpoints.

## 2. Authorization & Data Isolation (IDOR Defense)

- **Zero-Trust Client Identity**: Endpoints never trust client-supplied `userId` or `accountId` parameters in request bodies or query strings. User identity is derived exclusively from the authenticated session context (`req.user.id`).
- **Data Scope Enforcement**: Every database query joins on `user_id = ?`, ensuring complete tenant isolation. User A cannot view, query, or mutate financial records belonging to User B.

## 3. Financial Calculations & State Integrity

- **Authoritative Backend**: Financial balances, Safe-to-Spend, commitments, budgets, and forecasts are calculated exclusively by the backend calculation engine. Flutter and AI services serve strictly as presentation/explanation layers.
- **Zero Hardcoding**: Financial values (e.g. ₹57,980, ₹15,731) are never hardcoded in client models or services. In the absence of server data, the UI displays explicit loading, cached, or error states.
- **Atomic Mutations**: All payment transactions and balance changes occur inside atomic database transactions (`runTransaction`), preventing partial writes and ensuring rollback on failure.
- **Concurrency & Idempotency**: Payment processing utilizes idempotency keys (`Idempotency-Key` header) and balance locks to prevent double-spending or race conditions.
- **Strict Payment Limits**: Transactions enforce per-transaction, cumulative daily, and cumulative monthly payment limits.

## 4. AI Security & Guardrails

- **Strictly Read-Only**: The AI assistant operates under an explicit tool allowlist dispatcher.
- **No Mutation Capabilities**: The AI service has zero access to payment execution, balance modification, user setting alteration, or limit modification tools.
- **User Scoping**: Every AI data retrieval tool verifies the authenticated user session context before fetching financial context.
- **Output Grounding**: AI classifies figures as `AUTHORITATIVE`, `ESTIMATED`, `SIMULATED`, or `CACHED` to prevent user deception.

## 5. Defense in Depth & Rate Limiting

- **Layered Rate Limiting**: Dedicated rate limiters protect authentication (`15/15m`), payment operations (`30/1h`), AI queries (`40/15m`), and general API routes (`300/15m`).
- **Request Correlation**: All requests receive a unique `x-request-id` header traced across server logs and error bodies.
- **Sanitized Error Responses**: Production error handlers strip SQL messages, stack traces, and internal secrets, returning `{ code, message, requestId }`.
- **Sensitive Log Redaction**: Middleware automatically redacts passwords, PINs, JWTs, refresh tokens, and Authorization headers from application logs.
- **Security Headers & CORS**: Strict CORS origin allowlists and security headers (CSP, X-Content-Type-Options, HSTS) are enforced.

## 6. Incident Response & Reporting

To report security vulnerabilities, contact the security team at `security@finpocket.com`.
Critical vulnerabilities will be triaged within 24 hours.
