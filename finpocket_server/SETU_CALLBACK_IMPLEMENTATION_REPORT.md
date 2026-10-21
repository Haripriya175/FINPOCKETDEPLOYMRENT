# Setu Account Aggregator Sandbox Callback Layer Implementation Report

**Product:** Account Aggregator Data  
**Environment:** TEST / SANDBOX (Setu Bridge)  
**Product Instance:** FinPocket - Account Aggregator Data  
**Product ID:** `33f22690-e2e1-4ab9-9ecf-b94f93c3a7b2`  
**KYC Status:** Incomplete (Sandbox testing only; production onboarding excluded)  
**Date:** September 2026  

---

## 1. Executive Implementation Status

| Component | Status | Verification Detail |
|---|---|---|
| **Setu AA Provider Configuration (`app_config.ts`)** | **IMPLEMENTED** | Typed environment variables, fail-closed production guards |
| **Setu Callback & Webhook Processing (`AACallbackService`)** | **IMPLEMENTED** | Constant-time HMAC-SHA256, replay protection, 5-min timestamp drift |
| **Setu Customer Redirect Return Handler (`/redirect`)** | **IMPLEMENTED** | Responsive HTML landing page + mobile deep-link emitter (`finpocket://consent-callback`) |
| **Dedicated Setu API Routes (`/api/v1/setu/*`)** | **IMPLEMENTED** | Webhook, redirect, consent request, status, revoke, and sync endpoints |
| **Multi-Tenant RLS & PostgreSQL Persistence** | **IMPLEMENTED** | Idempotent updates, audit logging, zero plain secrets |
| **Flutter Mobile Client Integration (`ApiService`)** | **IMPLEMENTED** | Deep-link return handling, consent initiation, status polling |
| **Automated Test Suites (Backend + Flutter)** | **AUTOMATED TESTED** | **254/254 Backend Tests PASS**, **24/24 Flutter Tests PASS** |
| **Live Setu Sandbox Execution** | **LIVE SETU SANDBOX NOT YET EXECUTED** | Awaiting ngrok tunnel setup and Setu Bridge URL configuration |

> [!IMPORTANT]
> **Live Setu sandbox execution is marked as `NOT YET EXECUTED`**. All cryptographic signature verification, replay protection, customer redirect handling, and state machine transitions are validated via comprehensive mock-based integration suites. No live Setu network calls were executed during testing.

---

## 2. Architecture & Security Implementation

### A. Environment Configuration & Fail-Closed Behavior
Typed configuration in `src/config/app_config.ts`:
- `SETU_ENVIRONMENT`: `SANDBOX` | `PRODUCTION` | `MOCK`
- `SETU_CLIENT_ID`: OAuth Client ID from Setu Bridge
- `SETU_CLIENT_SECRET`: OAuth Client Secret
- `SETU_PRODUCT_INSTANCE_ID`: `33f22690-e2e1-4ab9-9ecf-b94f93c3a7b2`
- `SETU_API_BASE_URL`: `https://fiu-sandbox.setu.co`
- `SETU_REDIRECT_BASE_URL`: Base URL where customer's browser returns after webview/browser authorization
- `SETU_CALLBACK_BASE_URL`: Base URL for asynchronous server-to-server webhook notifications
- `SETU_WEBHOOK_SECRET`: Shared secret for HMAC-SHA256 signature verification

### B. Cryptographic Signature Verification
- Implemented in `AACallbackService.verifySignature()` using `crypto.timingSafeEqual`.
- Supports both `hex` and `base64` digests provided in `x-setu-signature` or `x-signature` headers.
- Rejects missing, malformed, or tampered signatures before processing payload.

### C. Replay Attack & Timestamp Drift Mitigation
- In-memory event deduplication cache (`Set<string>`) rejecting repeated event IDs (`REPLAY_DETECTED`).
- Enforces strict 5-minute maximum timestamp drift (`EXPIRED_TIMESTAMP`).

### D. Single Authoritative Consent State Machine
The implementation strictly aligns with the existing lifecycle:
$$\text{DRAFT} \longrightarrow \text{REQUESTED} \longrightarrow \begin{cases} \text{ACTIVE} & \text{(Approved)} \\ \text{REJECTED} & \text{(User denied / cancelled)} \\ \text{REVOKED} & \text{(Explicit revocation)} \\ \text{EXPIRED} & \text{(Validity elapsed)} \\ \text{FAILED} & \text{(Error in consent flow)} \end{cases}$$

---

## 3. Endpoints Implemented

| Endpoint | Method | Purpose | Auth / Signature |
|---|---|---|---|
| `/api/v1/setu/webhook` | `POST` | Asynchronous server notification handler from Setu Bridge | HMAC-SHA256 Signature (`x-setu-signature`) |
| `/api/v1/setu/redirect` | `GET` | Customer browser return URL from Setu consent webview | Query params (`id`, `success`, `errorcode`) |
| `/api/v1/setu/consent/request` | `POST` | Initiates AA consent for user account | JWT Auth (`Bearer <token>`) |
| `/api/v1/setu/consent/status/:handle` | `GET` | Queries real-time consent status | JWT Auth (`Bearer <token>`) |
| `/api/v1/setu/consent/revoke/:consentId` | `POST` | Revokes active consent session | JWT Auth (`Bearer <token>`) |
| `/api/v1/setu/sync/:accountId` | `POST` | Triggers financial data synchronization | JWT Auth (`Bearer <token>`) |

---

## 4. Test Verification Summary

### Backend Suites (`npm test` & `npm run test:phase5c`)
- **Setu AA Callback Suite:** 18/18 PASS
- **Phase 6 AA Sandbox Suite:** 45/45 PASS
- **Phase 5C PostgreSQL 18 Live Suite:** 50/50 PASS
- **Phase 5B Financial Operations Suite:** 42/42 PASS
- **Security Audit & Core Suites:** 99/99 PASS
- **Total Backend Tests:** **254/254 PASS**
- **TypeScript Compilation:** **0 errors** (`tsc` build clean)

### Flutter Client Suites (`flutter analyze` & `flutter test`)
- **Flutter Analyze:** **0 issues found**
- **Flutter Tests:** **24/24 PASS**
