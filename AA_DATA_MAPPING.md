# FinPocket — Account Aggregator Data Mapping & Balance Authority

**Document Version:** 1.0.0  
**Classification:** Technical Data Architecture Specification  
**Status:** IMPLEMENTED  

---

## 1. Balance Authority Architecture

> [!IMPORTANT]
> **Authoritative Source-of-Truth Rule:**
> * Provider-reported account balance (`currentBalance` / `availableBalance`) is strictly **AUTHORITATIVE** for all connected accounts.
> * Account balances must **NEVER** be synthesized by calculating `sum(all transactions)`.
> * The source-of-truth metadata for balances is explicitly tracked:
>   * Connected accounts: `sourceOfTruth = 'AUTHORITATIVE_EXTERNAL_AA'`
>   * Demo accounts: `sourceOfTruth = 'DEMO_MOCK'`

---

## 2. ReBIT Payload to FinPocket Entity Mapping

### 2.1 Account Mapping (`FinancialAccountEntity`)

| ReBIT Spec Field (`Account`) | FinPocket Field | Transformation & Normalization Logic |
| :--- | :--- | :--- |
| `accountRefNumber` | `id` | Unique account identifier in FinPocket (`acc_<fip>_<ref>`) |
| `fipId` | `institutionCode` | Uppercase FIP code (e.g., `HDFC`, `SBIN`, `ICIC`, `UTIB`) |
| `fipName` / `institutionName` | `institutionName` | Standardized bank display name |
| `maskedAccNumber` | `maskedAccountNumber` | Standardized `•••• 1234` masking (last 4 digits only) |
| `accountType` | `accountType` | Standardized uppercase: `SAVINGS`, `CURRENT`, `DEPOSIT` |
| `summary.currentBalance` | `currentBalance` | Parsed positive floating-point number |
| `summary.availableBalance` | `availableBalance` | Parsed positive floating-point number |
| `summary.currency` | `currency` | Standard ISO 4217 code (default: `INR`) |
| System Metadata | `providerType` | `SETU_AA_SANDBOX` / `REBIT_AA` / `MOCK` |
| System Metadata | `freshnessStatus` | Evaluated based on `lastSyncedAt` (`CURRENT` vs `STALE`) |

### 2.2 Transaction Mapping (`FinancialTransactionEntity`)

| ReBIT Spec Field (`Transaction`) | FinPocket Field | Transformation & Normalization Logic |
| :--- | :--- | :--- |
| `txnId` / `reference` | `providerTransactionId` | Raw unique transaction ID from FIP |
| System Generated | `id` | Composite `txn_<providerTransactionId>` |
| `amount` | `amount` | Absolute floating-point value (`Math.abs(amount)`) |
| `type` (`DEBIT` / `CREDIT`) | `type` | `DEBIT` $\rightarrow$ `EXPENSE`, `CREDIT` $\rightarrow$ `INCOME` |
| `narration` / `description` | `description` | Sanitized transaction narration |
| `narration` (Keyword extraction) | `category` | Deterministic auto-categorization (`cat_salary`, `cat_food`, `cat_travel`, `cat_bills`, etc.) |
| `timestamp` / `txnDateTime` | `timestamp` | Normalized ISO 8601 UTC timestamp |
| `valueDate` | `valueDate` | ISO 8601 Date string |
| System Metadata | `reconciliationStatus` | `NEW`, `UNCHANGED`, `UPDATED` |

---

## 3. Transaction Reconciliation & Deduplication Key

To guarantee zero duplicate transactions across recurring or pagination fetches:
* FinPocket enforces a composite uniqueness constraint on **`(account_id, provider_transaction_id)`**.
* Ingesting the same batch repeatedly produces **0 new rows** and marks records as `UNCHANGED`.
* If a provider updates an existing transaction's description or status, FinPocket updates the record in-place (`UPDATED`) without duplicating.
