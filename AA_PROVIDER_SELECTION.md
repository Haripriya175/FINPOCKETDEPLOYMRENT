# FinPocket — Account Aggregator Provider Selection & Evaluation (2026)

**Document Version:** 1.0.0  
**Classification:** Objective Technical Evaluation  
**Status:** COMPLETE EVALUATION  

---

## 1. Evaluation Methodology & Ground Rules

In strict adherence to project standards:
* **No marketing claims or subjective scoring** are used.
* **No unsupported rankings** or arbitrary scores are assigned.
* Every provider is categorized using objective status tags:
  * `CANDIDATE`
  * `SUITABLE FOR TECHNICAL EVALUATION`
  * `REQUIRES ONBOARDING`
  * `REQUIRES INFORMATION`

---

## 2. Comparative Matrix of Available Certified AA Providers / Gateways

| Provider / Gateway | Regulatory / Operating Status | Sandbox Availability | ReBIT v1.1.2 Support | Consent Redirection & SDK | Webhook / Async Notification | Developer Onboarding Barrier | FinPocket Evaluation Classification |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **Setu AA (Bridge / Pine Labs)** | Licensed TSP / FIU Integration Gateway | Public Developer Sandbox & Mock FIPs available | Full REST ReBIT compliant bridge | Webview redirect & JS/Flutter SDKs | HMAC-SHA256 Signed Webhooks | Instant developer registration & self-serve API keys | **SUITABLE FOR TECHNICAL EVALUATION** |
| **OneMoney (Finsec AA Pvt Ltd)** | RBI NBFC-AA Licensed (First Operating AA) | Developer Sandbox available on partner request | Native ReBIT Spec v1.1.2 | Webview / Mobile Deep Link redirect | Signature-verified HTTP Callbacks | Partner registration & business verification required | **REQUIRES ONBOARDING** |
| **Finvu (Cookiejar Technologies)** | RBI NBFC-AA Licensed | Sandbox available for registered partners | Native ReBIT Spec v1.1.2 | Hosted consent webview & Android/iOS SDKs | Asynchronous notification webhooks | Partner NDA and FIU registration review | **REQUIRES ONBOARDING** |
| **Anumati (Perfios AA)** | RBI NBFC-AA Licensed | Sandbox available via Perfios Developer Portal | Native ReBIT Spec v1.1.2 | Hosted Webview & Mobile Intent | ReBIT compliant callback notifications | Enterprise onboarding & contract required | **REQUIRES ONBOARDING** |
| **Protean AA (formerly NSDL)** | RBI NBFC-AA Licensed | Institutional Sandbox available | Native ReBIT Spec v1.1.2 | Webview redirect | HTTP Asynchronous Callbacks | Institutional contract required | **REQUIRES ONBOARDING** |
| **PhonePe Technology Services (AA)** | RBI NBFC-AA Licensed | Sandbox for ecosystem partners | Native ReBIT Spec v1.1.2 | Deep linking & Webview | Webhook notifications | Partner approval required | **REQUIRES ONBOARDING** |
| **Nadishti (TSP Gateway)** | FIU TSP Integration Node | Available via partner agreement | ReBIT REST Bridge | Embed SDK & API | Webhook notifications | Formal TSP agreement required | **REQUIRES INFORMATION** |

---

## 3. Detailed Provider Technical Profiles

### 3.1 Setu AA (Bridge Gateway)
* **Architecture:** RESTful API abstraction on top of certified NBFC-AAs.
* **Sandbox Environment:** Provides instant mock FIPs (e.g. HDFC Mock Bank, SBI Mock Bank) for simulating full consent request, OTP authorization, account discovery, and multi-page encrypted transaction fetches.
* **Consent Model:**
  * POST `/v2/consents` returns `consent_handle` and `redirect_url`.
  * Status polling via GET `/v2/consents/{handle}` or webhook notifications.
* **Security & Auth:** Bearer API tokens (`client_id`, `client_secret`) with HMAC-SHA256 signature verification on webhooks.
* **Classification:** `SUITABLE FOR TECHNICAL EVALUATION` (Selected as reference sandbox provider for FinPocket Phase 6 technical adapter implementation).

### 3.2 OneMoney AA
* **Architecture:** Direct NBFC-AA node compliant with ReBIT FIU/FIP specifications.
* **Sandbox Environment:** Requires pre-registered FIU certificates and partner credentials.
* **Consent Model:** Standard ReBIT Consent Request payload with `Customer.id = mobile@onemoney`.
* **Security & Auth:** Mutual TLS (mTLS) with client certificates + JWS signature verification on payload headers.
* **Classification:** `REQUIRES ONBOARDING` (Enterprise deployment candidate).

### 3.3 Finvu AA
* **Architecture:** Native NBFC-AA node with extensive banking FIP coverage.
* **Sandbox Environment:** Available through partner portal with simulated bank FIP accounts.
* **Classification:** `REQUIRES ONBOARDING` (Enterprise deployment candidate).

### 3.4 Anumati (Perfios)
* **Architecture:** Enterprise AA with built-in financial categorization and statement analytics.
* **Classification:** `REQUIRES ONBOARDING` (Enterprise deployment candidate).

---

## 4. Technical Selection & Adapter Strategy

FinPocket utilizes an **Open Provider Adapter Boundary**:

```
                 FinancialDataProvider
                   (Interface Boundary)
                            │
      ┌─────────────────────┼─────────────────────┐
      ▼                     ▼                     ▼
MockFinancial      FakeAccountAggregator   AccountAggregatorProvider
DataProvider             Provider             (Sandbox / ReBIT)
(DEMO runtime)       (TEST simulation)             │
                                                   ├── Setu AA Sandbox (Staging Reference)
                                                   └── ReBIT Certified AA Nodes
```

* In **DEMO Mode**: `MockFinancialDataProvider` operates in-memory with deterministic fixtures.
* In **TEST Mode**: `FakeAccountAggregatorProvider` executes deterministic simulation with timeout, outage, and fault-injection hooks.
* In **STAGING / SANDBOX Mode**: `AccountAggregatorProvider` connects to the verified AA sandbox gateway using environment-injected credentials.
* In **PRODUCTION Mode**: `AccountAggregatorProvider` connects to the certified production gateway with strict fail-closed guards (no mock or sandbox credentials allowed).
