# FinPocket — Account Aggregator Consent Lifecycle & Flow Architecture

**Document Version:** 1.0.0  
**Classification:** Technical Architecture Specification  
**Status:** IMPLEMENTED  

---

## 1. End-to-End Consent Lifecycle

The FinPocket consent architecture implements the ReBIT/Sahamati standard consent lifecycle:

```
[ User in Flutter App ]
          │
          │ 1. Initiate Account Link ("CONNECT BANK ACCOUNT")
          ▼
[ FinPocket Backend API (/api/v1/aa/consent/request) ]
          │
          │ 2. Create local Consent Session (Status: REQUESTED)
          │ 3. Sign and POST Consent Request to AA Gateway
          ▼
[ Account Aggregator Sandbox Gateway ]
          │
          │ 4. Returns consent_handle & redirect_url
          ▼
[ FinPocket Backend API ]
          │
          │ 5. Returns redirect_url to Flutter Client
          ▼
[ User Webview / Auth Redirection ]
          │
          │ 6. User logs into AA with Mobile Number / VPA
          │ 7. User selects bank accounts to discover
          │ 8. User approves consent with OTP
          ▼
[ Account Aggregator Sandbox Gateway ]
          │
          │ 9. Emits Signed Webhook Callback to FinPocket Backend
          ▼
[ FinPocket Backend (/api/v1/aa/callback) ]
          │
          │ 10. Verify Webhook Signature (HMAC-SHA256)
          │ 11. Validate Timestamp Window (<= 5 min) & Replay Protection
          │ 12. Update Consent Session (Status: APPROVED)
          │ 13. Trigger Background Account Discovery & Fetch
          ▼
[ Data Normalization & Reconciliation Engine ]
          │
          │ 14. Normalize accounts & transactions
          │ 15. Reconcile balances & prevent duplicates
          ▼
[ FinPocket Database & Flutter UI ]
          │
          │ 16. State displays: CONNECTED ACCOUNT, CURRENT, Last Synced
```

---

## 2. ReBIT Consent Artefact Parameters

| Parameter | ReBIT Definition | FinPocket Enforcement |
| :--- | :--- | :--- |
| **`consentMode`** | `VIEW` or `STORE` | `STORE` (Structured storage for offline personal budget & cashflow analysis) |
| **`fetchType`** | `ONETIME` or `PERIODIC` | `PERIODIC` (Daily automated sync for financial planning) |
| **`consentTypes`** | Requested Data Types | `['PROFILE', 'SUMMARY', 'TRANSACTIONS']` |
| **`fiTypes`** | Financial Information Types | `['DEPOSIT']` (Savings & Current Bank Accounts) |
| **`Purpose.code`** | ReBIT Purpose Identifier | `'101'` (Personal Financial Management) |
| **`DataLife`** | Data Retention Period | `unit: 'YEAR', value: 1` |
| **`Frequency`** | Fetch Frequency Constraint | `unit: 'DAY', value: 1` (Max 1 background sync per day) |
| **`validFrom`** | ISO 8601 Start Timestamp | Server-generated current UTC timestamp |
| **`validTo`** | ISO 8601 End Timestamp | Server-generated timestamp (Current + 365 days) |

---

## 3. Consent Security Validation Gates

Before any financial information is requested or synchronized, FinPocket executes server-side validation:

```typescript
// Consent Authorization Gate Check
1. Authenticated User Identity matches Consent Owner (No IDOR).
2. Consent status is strictly 'APPROVED' or 'ACTIVE'.
3. Current UTC timestamp >= consent.validFrom AND <= consent.validTo.
4. Linked Bank Account status is 'CONNECTED' (not 'DISCONNECTED' or 'UNLINKED').
5. Associated Provider Connection token is valid and decryptable.
```

If any check fails, the data fetch is **aborted immediately** without network dispatch to FIPs.
