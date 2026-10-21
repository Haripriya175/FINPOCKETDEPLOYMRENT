# FinPocket — Account Aggregator Ecosystem & Provider Research (2026)

**Document Version:** 1.0.0  
**Classification:** Technical & Regulatory Research  
**Last Updated:** September 2026  
**Status:** ACTIVE RESEARCH BASELINE  

---

## 1. Executive Summary & Purpose

This research document analyzes the **Reserve Bank of India (RBI) Account Aggregator (AA) Framework**, technical specifications defined by the **Reserve Bank Information Technology Pvt. Ltd. (ReBIT)**, and ecosystem operational guidelines established by **Sahamati (Collective of Account Aggregator Ecosystem)** applicable in 2026.

The goal is to provide an authoritative, primary-source basis for FinPocket's sandbox readiness, provider adapter architecture, consent lifecycle, data governance, and security model while maintaining zero hardcoding, strict tenant isolation, and explicit regulatory compliance boundaries.

---

## 2. Regulatory & Technical Framework Sources

| Source Name | Organization | Primary Reference / Specification | Publication / Update | Status in FinPocket |
| :--- | :--- | :--- | :--- | :--- |
| **Master Direction - Non-Banking Financial Company - Account Aggregator (Reserve Bank) Directions, 2016** | Reserve Bank of India (RBI) | RBI/DNBR/2016-17/45 Master Direction DNBR.PD.009/03.10.119/2016-17 (Updated 2023–2025) | Official RBI Master Directions | **CONFIRMED REQUIREMENT** |
| **ReBIT Account Aggregator Technical Specifications** | Reserve Bank Information Technology Pvt. Ltd. (ReBIT) | Financial Information User (FIU) & Financial Information Provider (FIP) API Spec v1.1.2 & v2.0-Draft | ReBIT Standards Committee | **CONFIRMED REQUIREMENT** |
| **Sahamati Ecosystem Guidelines & Certification Framework** | Sahamati (AA Alliance) | Sahamati Technical & Business Operating Guidelines v3.2 | Sahamati Alliance (2024–2026) | **CONFIRMED REQUIREMENT** |
| **Digital Personal Data Protection Act, 2023 (DPDPA)** | Ministry of Electronics and IT (MeitY), Govt. of India | Act No. 22 of 2023 & Implementing Rules (2024–2026) | Legislative & Regulatory | **CONFIRMED REQUIREMENT** |
| **National Financial Switch & UPI Guidelines** | NPCI / RBI | Operational Circulars on Open Banking Interfaces | NPCI/RBI Technical Bulletins | **CONFIRMED REQUIREMENT** |

---

## 3. Confirmed Ecosystem Roles & FinPocket Positioning

### 3.1 Ecosystem Roles

```
┌─────────────────┐       Consent Flow        ┌─────────────────────────┐
│                 │ ◄───────────────────────► │                         │
│  Customer /     │                           │   Account Aggregator    │
│  Data Principal │ ◄───────────────────────► │   (NBFC-AA, e.g. Setu,  │
│                 │   Encrypted Data Flow     │   OneMoney, Anumati)    │
└────────┬────────┘       (Decoupled)         └────────────┬────────────┘
         │                                                 │
         │ Authorization / Redirection                     │ Direct Consent
         ▼                                                 ▼ Notifications
┌─────────────────┐   Direct ReBIT Encrypted Fetch  ┌─────────────────────────┐
│ Financial       │ ◄────────────────────────────── │ Financial               │
│ Information User│                                 │ Information Provider    │
│ (FIU / FinPocket│                                 │ (FIP - e.g. HDFC, SBI,  │
│ via TSP Gateway)│                                 │ ICICI, Axis Bank)       │
└─────────────────┘                                 └─────────────────────────┘
```

1. **Financial Information Provider (FIP):**
   Institutions holding customer financial data (Scheduled Commercial Banks, Mutual Funds, Insurance Repositories, Pension Funds, Depositories). FIPs authenticate customers, verify consent artefacts with the AA, and provide end-to-end encrypted financial data.
2. **Account Aggregator (AA):**
   RBI-regulated NBFC-AA entity acting as a data-blind consent intermediary. The AA never sees or decrypts customer financial data; it manages consent lifecycle, customer discovery, and consent artefact validation.
3. **Financial Information User (FIU):**
   RBI-regulated entity (or entity regulated by SEBI, IRDAI, PFRDA) registered to request consent and consume financial information to deliver a service (such as lending, wealth management, or personal financial management).
4. **Technology Service Provider (TSP):**
   Technical gateway and integration partner (e.g. Setu, Finvu, Nadishti) providing standardized SDKs and REST APIs connecting client applications with certified AA nodes.

### 3.2 FinPocket's Intended Role

> [!IMPORTANT]
> **FinPocket Product Role Classification:**
> - FinPocket is architected as a **Personal Financial Management (PFM)** and financial intelligence application.
> - FinPocket connects to the AA ecosystem either as:
>   1. An **Independent Application operating via an accredited FIU Partner / TSP Gateway**, OR
>   2. An **Accredited FIU** once formal corporate entity licensing/registration is established.
> - **Regulatory Note:** Operating as a direct FIU requires registration with an applicable financial regulator (RBI, SEBI, IRDAI, or PFRDA) and Sahamati certification.
> - **Status:** `REQUIRES LEGAL/COMPLIANCE CONFIRMATION` for production deployment; fully `SANDBOX READY` for technical integration testing.

---

## 4. Confirmed Technical Requirements (ReBIT Standard)

### 4.1 Consent Artefact Specification
A ReBIT-compliant Consent Artefact is a tamper-evident digital object containing:
* **`consentId` / `consentHandle`:** Cryptographically unique UUID.
* **`consentMode`:** `VIEW` (view only) or `STORE` (store for processing).
* **`fetchType`:** `ONETIME` or `PERIODIC`.
* **`consentTypes`:** Array of data types requested (`PROFILE`, `SUMMARY`, `TRANSACTIONS`).
* **`fiTypes`:** Array of Financial Information Types (`DEPOSIT`, `TERM_DEPOSIT`, `RECURRING_DEPOSIT`, `MUTUAL_FUNDS`).
* **`Purpose`:** Standard ReBIT purpose code (e.g., `101` - Personal Financial Management).
* **`DataFilter`:** Date range filters (`from`, `to`), transaction amount thresholds.
* **`DataLife`:** Duration of stored data retention (unit: `MONTH`, `YEAR`, `DAY`).
* **`Frequency`:** Frequency constraint for recurring fetches (e.g., `unit: DAY, value: 1`).
* **`DataConsumer` / `DataProvider`:** FIU and FIP identifiers.
* **`Customer`:** Data principal handle (`username@aa_provider`).

### 4.2 Consent Lifecycle States

```
                 ┌───────────────┐
                 │   REQUESTED   │
                 └───────┬───────┘
                         │
         ┌───────────────┼───────────────┐
         ▼                               ▼
  ┌───────────────┐               ┌───────────────┐
  │   APPROVED    │               │   REJECTED    │
  │   (ACTIVE)    │               └───────────────┘
  └───────┬───────┘
          │
  ┌───────┼───────┐
  ▼               ▼
┌───────────┐   ┌───────────┐
│  EXPIRED  │   │  REVOKED  │
└───────────┘   └───────────┘
```

* **CONFIRMED REQUIREMENT:** Data fetch must be rejected if consent is not in `APPROVED` / `ACTIVE` state.
* **CONFIRMED REQUIREMENT:** Consent revocation must immediately halt subsequent automated data synchronization.

### 4.3 End-to-End Encryption & Key Exchange
* Data transmitted from FIP to FIU is encrypted at the application layer using **ECDH (Elliptic Curve Diffie-Hellman on Curve25519)** and **AES-GCM-256**.
* The AA only transmits the encrypted ciphertext payload; it does not possess the FIU private key.
* The FIU decrypts the financial data payload locally within its secure boundary.

---

## 5. Summary of Regulatory & Engineering Classifications

### 5.1 CONFIRMED REQUIREMENTS
1. **Zero Hardcoding:** All credentials, tokens, endpoints, and tenant data must be dynamically loaded from environment configuration or database.
2. **Fail-Closed Security:** Production environment must refuse startup if AA provider is enabled without valid production configuration or with sandbox/mock credentials.
3. **Balance Authority:** Provider-reported account balance (`currentBalance` / `availableBalance`) is the authoritative source-of-truth; balance must never be synthesized by summing transactions.
4. **Transaction Deduplication:** Composite uniqueness key `(accountId, providerTransactionId)` must prevent duplicate transaction ingestion across recurring sync runs.
5. **Token Secrecy:** Provider access and refresh tokens must be encrypted with AES-256-GCM + HKDF at rest and never exposed to client applications, AI models, logs, or error responses.
6. **Read-Only AI Assistant:** AI models may consume normalized data for insights but are strictly forbidden from initiating consent, revoking consent, linking accounts, or moving funds.

### 5.2 PROVIDER-SPECIFIC REQUIREMENTS
1. **Webhook Signature Header:** Varies by provider (e.g., `x-setu-signature`, `x-onemoney-hmac`, `x-finvu-signature`). FinPocket provides an abstraction supporting standard HMAC-SHA256 and RSA-SHA256 headers.
2. **Consent Redirection Mechanism:** Webview URL vs Deep Link vs Embed SDK. FinPocket provides standard redirect URI handling compatible with both web and mobile flows.

### 5.3 LEGAL / COMPLIANCE QUESTIONS (`REQUIRES LEGAL/COMPLIANCE CONFIRMATION`)
1. Formal selection of direct FIU license vs regulated FIU partner entity.
2. Sahamati Membership Level and FIU Participant Registration submission.
3. Data retention and deletion schedules in accordance with DPDPA 2023 guidelines.

### 5.4 ENGINEERING ASSUMPTIONS
1. During local development, test, and demo modes, in-memory/mock/fake providers are permitted.
2. Staging environment connects to official provider sandboxes (e.g. Setu Bridge Sandbox / OneMoney Sandbox).
3. SQLite is used for local demo/test storage while PostgreSQL 15+ remains the production target.
