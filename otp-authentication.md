# FinPocket OTP Authentication Architecture & Security Specification

This document provides a comprehensive technical reference for FinPocket's multi-channel OTP (One-Time Password) authentication system, covering architecture, verification flows, cryptographic controls, database persistence, and API endpoint contracts.

---

## 1. Architecture Overview

FinPocket provides verification for both email addresses and Indian mobile phone numbers (+91). The architecture is designed with a defense-in-depth security model:

```
+-----------------------------------------------------------------------------------------+
|                                     FinPocket Client                                     |
|                               (Flutter Mobile Application)                              |
+-----------------------------------------------------------------------------------------+
       |                                   |                                   |
       | POST /auth/email/send-otp         | POST /auth/phone/send-otp         | GET /auth/verification-status
       v                                   v                                   v
+-----------------------------------------------------------------------------------------+
|                                  Express / Node.js API                                  |
|                            [RateLimiter: 15 req / 15 mins]                              |
+-----------------------------------------------------------------------------------------+
       |                                   |                                   |
       v                                   v                                   v
+-----------------------------------------------------------------------------------------+
|                                    OtpService (Backend)                                 |
|  - Cryptographically Secure RNG (crypto.randomInt)                                      |
|  - Salted HMAC-SHA256 Digest Generation (salt:hash)                                     |
|  - Pre-Registration Invalidation & Single-Use Enforcement                              |
|  - 30-Second Universal Cooldown & 5-Attempt Maximum Lockout                             |
+-----------------------------------------------------------------------------------------+
       |                                   |                                   |
       | Delivery                          | Delivery                          | Persistence
       v                                   v                                   v
+-----------------------+       +------------------------+      +-------------------------+
|   EmailService        |       |   SmsService           |      |   PostgreSQL / SQLite   |
| (Nodemailer / Gmail)  |       | (Fast2SMS/MSG91/Twilio)|      |  otp_verifications      |
| - HTML / Plain text   |       | - TRAI DLT Compliant   |      |  users (email_verified, |
| - Responsive template |       | - Masked destination   |      |         phone_verified) |
+-----------------------+       +------------------------+      +-------------------------+
```

---

## 2. Core Security Controls

| Security Objective | Implementation Mechanism | Verification / Enforcement |
| :--- | :--- | :--- |
| **CSPRNG Generation** | `crypto.randomInt(100000, 1000000)` | Generates uniform 6-digit numeric codes with high entropy. Avoids pseudo-random `Math.random()`. |
| **Salted Digest Storage** | HMAC-SHA256 with 16-byte random hex salt (`crypto.randomBytes(16)`) | Plaintext OTP is NEVER persisted in SQLite, PostgreSQL, or application logs. Format: `salt:hmacDigest`. |
| **Time-to-Live (TTL)** | 10-minute expiration window | Verified via `expires_at > CURRENT_TIMESTAMP`. Expired tokens are immediately rejected. |
| **Single-Use Replay Prevention**| Atomic SQL state transition: `UPDATE otp_verifications SET consumed_at = NOW() WHERE id = ? AND consumed_at IS NULL` | Concurrency-safe TOCTOU defense. Parallel requests race; only 1 updates a row (`changes === 1`). |
| **Superseded Invalidation** | Automatic invalidation of previous unconsumed codes | When a new OTP is requested for `(destination, purpose)`, prior unconsumed records are marked consumed. |
| **Pre-Registration Claim Isolation** | Query predicate `AND user_id IS NULL` during pre-registration verification check | Once an OTP verification is claimed by an account registration (`linkRegistrationUser`), it cannot be reused to register another account. |
| **Destination & Purpose Binding** | Schema fields: `destination`, `destination_type` (`email` \| `phone`), `purpose` (`REGISTRATION` \| `PASSWORD_RESET`) | An OTP issued for email cannot verify mobile; an OTP issued for password reset cannot register an account. |
| **Attempt Limiting** | Max 5 failed attempts per OTP record | On incorrect entry, `attempts` is incremented. If `attempts >= max_attempts`, the OTP is permanently locked. |
| **Resend Cooldown** | 30-second cooldown per destination | Enforced via `resend_after > CURRENT_TIMESTAMP`. Requests received within 30s return HTTP 429 with remaining seconds. |
| **Secret Sanitization** | `devOtp` and `resetToken` strictly suppressed in non-TEST environments | Production/Staging API responses and logs NEVER leak OTP values or secrets. Masked phone logging (`+91 ******1234`). |
| **PostgreSQL RLS & Tenant Isolation** | Row-Level Security enabled on user data tables; `otp_verifications` scoped by `user_id` and pre-auth grants | Tenant isolation prevents cross-tenant access. Runtime roles: `finpocket_app` (request role) & `finpocket_system`. |

---

## 3. Detailed Verification Flows

### Flow A: Pre-Registration Verification (Guided Flow)
1. User enters Full Name, Email, Mobile Number, and Password on Flutter `RegisterScreen`.
2. Client sends `POST /auth/email/send-otp`.
   - Backend invalidates previous pending codes for this email.
   - Generates 6-digit code, hashes it with HMAC-SHA256 and unique salt, and stores in `otp_verifications` with `user_id = NULL`.
   - Sends email via Gmail SMTP.
3. User receives email, enters code into `OtpVerificationSheet`.
4. Client sends `POST /auth/email/verify-otp`.
   - Backend locates active record, verifies salt/hash, verifies `attempts < 5` and `expires_at > NOW()`.
   - Atomically sets `consumed_at = NOW()`.
5. If phone is supplied, the modal transitions seamlessly to Mobile OTP:
   - Client sends `POST /auth/phone/send-otp`.
   - Backend normalizes number to E.164 (`+91XXXXXXXXXX`), invalidates previous codes, creates OTP record, and dispatches SMS via Indian SMS provider.
   - User enters 6-digit SMS code.
   - Client sends `POST /auth/phone/verify-otp`.
6. Client submits `POST /auth/register`:
   - Backend verifies `isEmailVerifiedForRegistration(email)` (`consumed_at IS NOT NULL AND user_id IS NULL`).
   - If phone was provided, verifies `isPhoneVerifiedForRegistration(phone)`.
   - Inserts user into `users` table with `email_verified = 1` and `phone_verified = 1`.
   - Links verification records via `linkRegistrationUser(email, newUserId)` to prevent reuse.
   - Issues JWT access and refresh tokens.

### Flow B: Account Takeover & Reset Flow
1. User clicks "Forgot Password" on Flutter `LoginScreen`.
2. Client submits `POST /auth/forgot-password` with user's email.
3. Backend checks user existence, issues OTP with `purpose = 'PASSWORD_RESET'`, and delivers it via Gmail SMTP.
4. User enters code into reset screen.
5. Client submits `POST /auth/reset-password` with `email`, `otp`, and `newPassword`.
6. Backend verifies OTP against `purpose = 'PASSWORD_RESET'`, updates user password hash, revokes existing sessions, and marks OTP consumed.

---

## 4. API Endpoint Specifications

### 1. `POST /auth/email/send-otp`
Initiates email OTP delivery.
- **Rate Limit:** 15 requests / 15 minutes
- **Request Body:**
  ```json
  {
    "email": "user@example.com",
    "purpose": "REGISTRATION"
  }
  ```
- **Success Response (200 OK):**
  ```json
  {
    "success": true,
    "message": "Verification code sent to your email address",
    "destination": "user@example.com",
    "expiresInSeconds": 600,
    "resendCooldownSeconds": 30
  }
  ```
- **Error Responses:**
  - `400 Bad Request`: Missing or invalid email address.
  - `429 Too Many Requests`: Resend cooldown active (`"Please wait 24 seconds before requesting a new code"`).

---

### 2. `POST /auth/email/verify-otp`
Validates an email OTP.
- **Request Body:**
  ```json
  {
    "email": "user@example.com",
    "otp": "492817",
    "purpose": "REGISTRATION"
  }
  ```
- **Success Response (200 OK):**
  ```json
  {
    "success": true,
    "message": "Email verified successfully",
    "verified": true
  }
  ```
- **Error Responses:**
  - `400 Bad Request`: Incorrect OTP (`"Invalid verification code. 4 attempts remaining."`) or expired code.
  - `429 Too Many Requests`: Maximum attempts exceeded (`"Too many failed attempts. This code has been invalidated. Please request a new code."`).

---

### 3. `POST /auth/phone/send-otp`
Initiates mobile SMS OTP delivery.
- **Request Body:**
  ```json
  {
    "phone": "+91 98765 43210",
    "purpose": "REGISTRATION"
  }
  ```
- **Success Response (200 OK):**
  ```json
  {
    "success": true,
    "message": "Verification code sent to your mobile phone",
    "destination": "+919876543210",
    "expiresInSeconds": 600,
    "resendCooldownSeconds": 30
  }
  ```
- **Error Responses:**
  - `400 Bad Request`: Invalid Indian mobile phone number (must be 10 digits starting with 6, 7, 8, or 9).
  - `429 Too Many Requests`: Resend cooldown active.

---

### 4. `POST /auth/phone/verify-otp`
Validates a mobile SMS OTP.
- **Request Body:**
  ```json
  {
    "phone": "+919876543210",
    "otp": "839201",
    "purpose": "REGISTRATION"
  }
  ```
- **Success Response (200 OK):**
  ```json
  {
    "success": true,
    "message": "Mobile number verified successfully",
    "verified": true
  }
  ```

---

### 5. `POST /auth/otp/resend`
Universal resend endpoint supporting either email or mobile destinations.
- **Request Body:**
  ```json
  {
    "destination": "user@example.com",
    "type": "email",
    "purpose": "REGISTRATION"
  }
  ```
- **Success Response (200 OK):**
  ```json
  {
    "success": true,
    "message": "Verification code resent successfully",
    "destination": "user@example.com",
    "expiresInSeconds": 600,
    "resendCooldownSeconds": 30
  }
  ```

---

### 6. `GET /auth/verification-status`
Returns independent verification status flags for the authenticated user.
- **Headers:** `Authorization: Bearer <JWT_ACCESS_TOKEN>`
- **Success Response (200 OK):**
  ```json
  {
    "success": true,
    "email": "user@example.com",
    "emailVerified": true,
    "phone": "+919876543210",
    "phoneVerified": true,
    "isFullyVerified": true
  }
  ```

---

## 5. Indian SMS Provider Integration Architecture

FinPocket uses a pluggable `SmsProvider` interface (`src/services/sms.service.ts`):

```typescript
export interface SmsProvider {
  name: string;
  sendOtp(phoneNumber: string, otp: string, purpose: string): Promise<SmsDeliveryResult>;
}
```

### Provider Implementations:
1. **Fast2SMS (`Fast2SmsProvider`)**:
   - Best suited for Indian startups and rapid testing.
   - Uses Fast2SMS Quick OTP Route (`https://www.fast2sms.com/dev/bulkV2`).
   - Does not require upfront TRAI DLT template registration for testing.
2. **MSG91 (`Msg91SmsProvider`)**:
   - Enterprise-grade Indian SMS aggregator.
   - Fully compliant with TRAI DLT regulations.
   - Uses SendOTP API (`https://control.msg91.com/api/v5/otp`). Requires pre-registered DLT Principal Entity ID, Header, and Template ID.
3. **Twilio (`TwilioSmsProvider`)**:
   - International fallback. Note: Sending to Indian numbers (+91) requires pre-registered Entity ID and Template ID under TRAI guidelines.
4. **Mock Provider (`MockSmsProvider`)**:
   - Used for unit/integration testing and local offline development.
   - Logs masked dispatch without outbound network requests.
