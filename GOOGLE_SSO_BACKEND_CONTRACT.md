# FinPocket Google SSO Backend API Contract & Verification Specification

## 1. Overview
FinPocket utilizes **Google Sign-In as an external identity provider** while maintaining authoritative ownership over its own users, sessions, and financial data boundaries.

The mobile client never authenticates simply by transmitting an unverified email address or display name. Instead, the native client presents an **OpenID Connect ID Token** issued and signed by Google, which the FinPocket backend cryptographically validates against Google's public JSON Web Key Sets (JWKS).

---

## 2. Authentication Flow

```text
       USER
         │
         ▼
  [ Google Sign-In ]
  (Native Play Services / iOS ASWebAuthenticationSession)
         │
         ▼
   Google ID Token (JWT)
         │
         ▼ (HTTPS POST /api/v1/auth/google)
[ FinPocket Backend Server ]
         │
         ├─► 1. Verify Cryptographic Signature (Google Public Keys)
         ├─► 2. Validate Claims: iss (accounts.google.com), aud (ClientID), exp
         ├─► 3. Enforce email_verified == true
         ├─► 4. Extract Stable Google 'sub' claim
         │
         ├─► 5. Database Identity Lookup (user_identities WHERE provider = 'google' AND provider_subject = sub)
         │       │
         │       ├─► [MATCH FOUND] ──► Issue FinPocket Access & Refresh Tokens
         │       │
         │       └─► [NO MATCH]
         │             │
         │             ├─► Check if email exists in 'users' table
         │             │     │
         │             │     ├─► [EMAIL EXISTS] ──► 409 ACCOUNT_EXISTS_UNLINKED
         │             │     │   (Prevents Account Takeover! Requires user to sign in
         │             │     │    with password first and link Google explicitly)
         │             │     │
         │             │     └─► [EMAIL NOT FOUND] ──► Create new FinPocket User & link sub
         │             │
         ▼
Issue FinPocket Session (Access JWT + Refresh Token)
         │
         ▼
Secure Storage (Android Keystore / iOS Keychain)
         │
         ▼
Authenticated FinPocket Application
```

---

## 3. Canonical Endpoints

### 3.1. Federated Google Login / Sign-Up
- **Method:** `POST`
- **Route:** `/api/v1/auth/google`
- **Auth:** Public
- **Request Headers:**
  - `Content-Type: application/json`
  - `x-device-id: <device_uuid>`
- **Request Body:**
```json
{
  "idToken": "eyJhbGciOiJSUzI1NiIsImtpZCI6...",
  "deviceName": "Google Pixel 8 (Android 14)"
}
```

- **Success Response (200 OK):**
```json
{
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "refreshToken": "7c8e9b01f...",
  "deviceId": "dev_a1b2c3d4",
  "sessionId": "sess_e5f6g7h8",
  "isNewUser": false,
  "user": {
    "id": "usr_10293847",
    "name": "Alex Johnson",
    "maskedName": "A*** J******",
    "email": "alex.johnson@gmail.com",
    "phone": "+91 9876543210",
    "maskedPhone": "+91 ******3210",
    "phoneVerified": true,
    "role": "USER",
    "ssoProvider": "google"
  }
}
```

- **Account Takeover Prevention Response (409 Conflict):**
```json
{
  "error": "ACCOUNT_EXISTS_UNLINKED",
  "message": "An account with this email already exists. Please log in with your password to link your Google account.",
  "email": "alex.johnson@gmail.com"
}
```

- **Invalid Token Response (401 Unauthorized):**
```json
{
  "error": "INVALID_GOOGLE_TOKEN",
  "message": "Google ID token has expired"
}
```

---

### 3.2. Explicit Account Linking
- **Method:** `POST`
- **Route:** `/api/v1/auth/google/link`
- **Auth:** Bearer Token (Existing FinPocket JWT)
- **Request Body:**
```json
{
  "idToken": "eyJhbGciOiJSUzI1NiIsImtpZCI6..."
}
```
- **Success Response (200 OK):**
```json
{
  "success": true,
  "message": "Google account successfully linked to your FinPocket profile.",
  "linkedEmail": "alex.johnson@gmail.com"
}
```

---

### 3.3. Explicit Account Unlinking
- **Method:** `POST`
- **Route:** `/api/v1/auth/google/unlink`
- **Auth:** Bearer Token (Existing FinPocket JWT)
- **Success Response (200 OK):**
```json
{
  "success": true,
  "message": "Google account unlinked successfully."
}
```

---

### 3.4. Google Linked Status
- **Method:** `GET`
- **Route:** `/api/v1/auth/google/status`
- **Auth:** Bearer Token (Existing FinPocket JWT)
- **Success Response (200 OK):**
```json
{
  "isLinked": true,
  "linkedEmail": "alex.johnson@gmail.com",
  "linkedAt": "2026-10-05T20:15:00Z",
  "lastLoginAt": "2026-10-05T21:40:00Z"
}
```

---

## 4. Database Identity Model (`user_identities`)

```sql
CREATE TABLE IF NOT EXISTS user_identities (
  id VARCHAR(64) PRIMARY KEY,
  user_id VARCHAR(64) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  provider VARCHAR(32) NOT NULL,
  provider_subject VARCHAR(255) NOT NULL,
  email_at_link_time VARCHAR(255),
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  last_login_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT uq_user_identity UNIQUE (provider, provider_subject)
);
```

- `provider_subject`: Stable Google `sub` claim (NOT the email address).
- Uniqueness constraint prevents a single Google identity from being hijacked or attached to multiple FinPocket users.

---

## 5. Security Checklist
- [x] Zero hard-coded credentials in client or server.
- [x] ID token signature verified with Google Public JWKS (`google-auth-library`).
- [x] Audience verified against configured web/server client IDs.
- [x] Issuer verified (`https://accounts.google.com`).
- [x] `email_verified` claim strictly required.
- [x] `sub` used as the immutable identity key.
- [x] Silent account takeover strictly prevented via 409 conflict when password account exists.
- [x] FinPocket issues its own signed JWTs and rotates refresh tokens; Google tokens are never echoed back as app sessions.
