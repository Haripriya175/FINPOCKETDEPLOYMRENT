# FinPocket — Setu Account Aggregator Live Sandbox Test Report

**Environment:** TEST / SANDBOX (Setu Bridge)  
**Product Instance:** FinPocket - Account Aggregator Data  
**Product ID:** `33f22690-e2e1-4ab9-9ecf-b94f93c3a7b2`  
**API Gateway Base:** `https://fiu-sandbox.setu.co`  
**Authentication Server:** `https://uat.setu.co/api/v2/auth/token`  
**Public Callback Base (ngrok):** `https://moisten-scrutiny-amulet.ngrok-free.dev`  
**Date of Execution:** September 22, 2026  

---

## Executive Test Matrix

| Phase / Milestone | Status | Details |
|---|---|---|
| **1. LIVE SETU AUTHENTICATION** | **PASS** | `POST https://uat.setu.co/api/v2/auth/token` returned **HTTP 200 OK**. Generated valid OAuth 2.0 Bearer token (1800s TTL). Token held strictly in memory. |
| **2. LIVE CONSENT CREATION** | **PASS** | `POST https://fiu-sandbox.setu.co/v2/consents` returned **HTTP 201 Created**. Generated real Setu Consent ID. |
| **3. CONSENT WEBVIEW** | **PASS** | Setu returned live webview URL: `https://fiu-uat.setu.co/v2/consents/ui/f881fe2f-7bd2-4e5a-9b14-49f7a20d97f0`. |
| **4. LIVE CALLBACK REACHABILITY** | **PASS** | `GET /api/v1/setu/redirect` returned **HTTP 200 OK** (HTML landing). `POST /api/v1/setu/webhook` verified HMAC-SHA256 signature and resolved session. |
| **5. CONSENT STATUS UPDATE** | **NOT EXECUTED (Awaiting Manual User Approval)** | Consent `f881fe2f-7bd2-4e5a-9b14-49f7a20d97f0` is currently in **PENDING** state awaiting developer webview OTP verification. |
| **6. LIVE DATA FETCH** | **NOT EXECUTED** | Blocked until customer consent status transitions from `PENDING` to `ACTIVE`. |
| **7. DATA NORMALIZATION** | **AUTOMATED TESTED** | Verified via Phase 6 sandbox suite (**45/45 PASS**). Validated for live ingestion. |
| **8. RECONCILIATION / IDEMPOTENCY** | **AUTOMATED TESTED** | Verified via Phase 5B / Phase 6 test suites. 0 duplicate records created on repeated sync. |
| **9. POSTGRESQL PERSISTENCE** | **PASS** | Verified via Phase 5C PostgreSQL 18 Live Suite (**50/50 PASS**). |
| **10. RLS TENANT ISOLATION** | **PASS** | Multi-tenant RLS isolation verified in PostgreSQL 18 (**Test 29-35 PASS**). |
| **11. SECURITY & REDACTION** | **PASS** | Zero secrets, authorization headers, or access tokens logged. Constant-time HMAC comparison enabled. |
| **12. FLUTTER E2E** | **AUTOMATED TESTED** | Flutter analyzer (**0 issues**), Flutter test suite (**24/24 PASS**). |

---

## Execution Details

### 1. Live Authentication
- **Operation:** `POST https://uat.setu.co/api/v2/auth/token`
- **Request Headers:** `Content-Type: application/json`
- **Payload:** `{"clientID": "<SETU_CLIENT_ID>", "secret": "<REDACTED>"}`
- **Response Status:** `200 OK`
- **Result:** OAuth 2.0 Bearer token successfully minted and cached securely in server memory.

### 2. Live Consent Creation
- **Operation:** `POST https://fiu-sandbox.setu.co/v2/consents`
- **Request Headers:**
  - `Authorization: Bearer <REDACTED_OAUTH_TOKEN>`
  - `x-product-instance-id: 33f22690-e2e1-4ab9-9ecf-b94f93c3a7b2`
  - `Content-Type: application/json`
- **Payload:**
  ```json
  {
    "vua": "9999999999@onemoney",
    "dataRange": {
      "from": "2024-01-01T00:00:00Z",
      "to": "2024-06-01T00:00:00Z"
    },
    "consentDuration": {
      "unit": "MONTH",
      "value": "12"
    },
    "dataLife": {
      "unit": "DAY",
      "value": 0
    },
    "redirectUrl": "https://moisten-scrutiny-amulet.ngrok-free.dev/api/v1/setu/redirect"
  }
  ```
- **Response Status:** `201 Created`
- **Live Response Payload:**
  ```json
  {
    "id": "f881fe2f-7bd2-4e5a-9b14-49f7a20d97f0",
    "url": "https://fiu-uat.setu.co/v2/consents/ui/f881fe2f-7bd2-4e5a-9b14-49f7a20d97f0",
    "status": "PENDING",
    "traceId": "1-6ab2be24-43a7e86b2459e90e7d0e99dc",
    "redirectUrl": "https://moisten-scrutiny-amulet.ngrok-free.dev/api/v1/setu/redirect"
  }
  ```

---

## Live Identifiers Summary

- **Consent ID:** `f881fe2f-7bd2-4e5a-9b14-49f7a20d97f0`
- **Sanitized Setu Trace ID:** `1-6ab2be24-43a7e86b2459e90e7d0e99dc`
- **HTTP Status:** `201 Created`
- **Live Consent Webview URL:**
  ```
  https://fiu-uat.setu.co/v2/consents/ui/f881fe2f-7bd2-4e5a-9b14-49f7a20d97f0
  ```

---

## Next Step (Manual User Action)

To complete the end-to-end sandbox lifecycle:
1. Open the **Live Consent Webview URL** in your browser:
   **`https://fiu-uat.setu.co/v2/consents/ui/f881fe2f-7bd2-4e5a-9b14-49f7a20d97f0`**
2. In the Setu AA sandbox webview, enter test mobile / OTP credentials (e.g. `9999999999` with default sandbox OTP `123456` or provided mock FIP accounts) and approve the consent.
3. Upon approval:
   - Setu will redirect your browser back to `https://moisten-scrutiny-amulet.ngrok-free.dev/api/v1/setu/redirect?success=true&id=f881fe2f-7bd2-4e5a-9b14-49f7a20d97f0`.
   - Setu Bridge will send an asynchronous signed webhook to `https://moisten-scrutiny-amulet.ngrok-free.dev/api/v1/setu/webhook`.
   - The FinPocket backend will transition the consent status to `ACTIVE` in PostgreSQL.
