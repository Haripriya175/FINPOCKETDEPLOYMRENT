# Setu Live Consent Reconciliation & Webhook Security Report

**Setu Consent ID:** `473721fb-922a-4e53-a346-c22a9b1b6bdd`  
**Aggregator Instance:** OneMoney Sandbox (`@onemoney`) via Setu Bridge  
**Product Instance ID:** `33f22690-e2e1-4ab9-9ecf-b94f93c3a7b2`  
**Date of Reconciliation:** September 23, 2026  

---

## 1. Executive Status Matrix

| Component / Layer | Status | Verification Authority | Details |
|---|---|---|---|
| **Setu Provider Consent Status** | **ACTIVE** | **VERIFIED BY SETU** | `GET https://fiu-sandbox.setu.co/v2/consents/473721fb-922a-4e53-a346-c22a9b1b6bdd` returned **HTTP 200 OK** with `status: ACTIVE`. |
| **Local Status Before Fix** | **UNTRACKED** | **VERIFIED LOCALLY** | Standalone script executed direct API call without inserting tracking row in `account_consents`. |
| **Local Status After Reconciliation** | **ACTIVE** | **VERIFIED LOCALLY** | Reconciled and persisted in PostgreSQL database with valid validity window (`2026-09-22` to `2027-09-22`). |
| **Linked Bank Account** | **CONNECTED** | **VERIFIED LOCALLY** | Account `bnk_setu_779e2253` (`XXXXXXXX0235`, `SAVINGS`, `Setu Mock Bank`) persisted in `bank_accounts`. |
| **Audit Event Recording** | **PASS** | **VERIFIED LOCALLY** | Logged `SETU_CONSENT_RECONCILED` with `source: PROVIDER_STATUS_VERIFICATION` and trace metadata. |
| **RLS Multi-Tenant Isolation** | **PASS** | **AUTOMATED TEST** | Verified in PostgreSQL 18 Live Suite (**Tests 29–35 PASS**). |
| **Dual Webhook Security** | **IMPLEMENTED** | **AUTOMATED TEST** | Supports HMAC signature verification + strict sandbox compensating controls and state validation. |
| **Consent Pre-Creation Architecture** | **IMPLEMENTED** | **AUTOMATED TEST** | `create_live_consent.ts` & `AccountAggregatorProvider` pre-create local `PENDING` records before Setu API dispatch. |
| **Live Financial Data Fetch** | **NOT EXECUTED** | **NOT EXECUTED** | Data session creation remains strictly gated until user authorizes data fetch. |

---

## 2. Webhook Security Architecture & Compensating Controls

### Investigation of Setu AA Webhook Contract
- **Contract Analysis:** In the Setu Account Aggregator v2 sandbox, notification webhooks (`POST /api/v1/setu/webhook`) are dispatched upon consent updates and FI data readiness. In sandbox mode, standard HTTP POST notifications arrive without mandatory HMAC headers unless custom Bridge webhook signing keys are provisioned.
- **Fail-Closed Dual Verification Architecture:**
  1. **HMAC Signature Path:** When `x-setu-signature` / `x-provider-signature` header is present, constant-time `crypto.timingSafeEqual` HMAC-SHA256 verification is executed.
  2. **Compensating Controls Path (Sandbox / Fallback):** When unsigned notifications arrive in non-production environments, the backend enforces:
     - Strict JSON schema and event-type validation (`CONSENT_STATUS_UPDATE`, `FI_DATA_READY`).
     - Local consent session lookup against `account_consents` (rejecting unknown IDs).
     - State transition validation (terminal states like `REVOKED`/`EXPIRED` cannot revert to `ACTIVE`).
     - Replay & idempotency caching (`notificationId` / `eventId`).
     - 5-minute maximum timestamp drift validation.
     - Direct Setu API status verification (`GET /v2/consents/:id`) fallback.
  3. **Production Mode:** In `PRODUCTION`, webhook signatures are strictly mandatory (`fail-closed`).

---

## 3. Live Consent Reconciliation Details

```
[ Authoritative Setu API: GET /v2/consents/473721fb-922a-4e53-a346-c22a9b1b6bdd ]
  │  HTTP Status: 200 OK
  │  Provider Status: ACTIVE
  │  Linked Account: XXXXXXXX0235 (SAVINGS, setu-fip)
  ▼
[ Safe Local Reconciliation ]
  │  User ID: usr_fp_882910
  │  Bank Account ID: bnk_setu_779e2253 (CONNECTED)
  │  Consent Status: ACTIVE (Valid: 2026-09-22 to 2027-09-22)
  ▼
[ Tamper-Evident Audit Record ]
  │  Action: SETU_CONSENT_RECONCILED
  │  Source: PROVIDER_STATUS_VERIFICATION
  │  Trace ID: 1-6ab2ce29-4babad3709f3d1574424dc88
```

---

## 4. Test Verification Summary

- **Setu Callback Integration Suite:** **22/22 PASS** (`npm run test:setu`)
- **Phase 6 AA Sandbox Suite:** **45/45 PASS**
- **Phase 5C PostgreSQL 18 Suite:** **50/50 PASS** (`npm run test:phase5c`)
- **Phase 5B Financial Operations Suite:** **42/42 PASS**
- **Core Security & Intelligence Suites:** **99/99 PASS**
- **Total Backend Tests:** **258/258 PASS**
- **TypeScript Build (`tsc`):** **0 errors**
- **Flutter Analyzer:** **0 issues found**
- **Flutter Widget/Auth Tests:** **24/24 PASS**

---

## 5. Current Gate Status

$$\mathbf{CONSENT\ ACTIVE\ —\ READY\ FOR\ DATA\ SESSION}$$

- **Authenticated User:** `usr_fp_882910`
- **Tracked Consent ID:** `473721fb-922a-4e53-a346-c22a9b1b6bdd`
- **Provider Status:** `ACTIVE` (Verified with Setu API)
- **Linked Account:** `bnk_setu_779e2253` (`XXXXXXXX0235`, `SAVINGS`)
- **Data Session:** **NOT YET CREATED** (Gated as requested).
