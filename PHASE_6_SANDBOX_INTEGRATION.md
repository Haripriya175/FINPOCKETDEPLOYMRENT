# FinPocket Phase 6: Account Aggregator Sandbox Integration Specification

**Document Version:** 1.0.0  
**Classification:** Phase Specification & Engineering Blueprint  
**Status:** IMPLEMENTATION ACTIVE  

---

## 1. Scope & Objective

Phase 6 implements the complete architectural and operational readiness for **RBI Account Aggregator (AA) Sandbox Integration**.

This includes:
1. **Centralized Environment Configuration** with strict production fail-closed security.
2. **Provider Adapter Boundary** with zero provider leakage into core calculation and AI engines.
3. **ReBIT-compliant Sandbox Provider** supporting consent creation, account discovery, and financial information fetch.
4. **Cryptographic Webhook & Callback Verification** (HMAC-SHA256, replay protection, timestamp window).
5. **Authoritative Balance & Transaction Reconciliation** with duplicate-prevention composite keys.
6. **Token Security & Key Derivation** (AES-256-GCM + HKDF) ensuring zero plaintext tokens in storage or logs.
7. **Cross-Platform UI Integration** in Flutter with explicit connection badges (`DEMO ACCOUNT` vs `CONNECTED ACCOUNT`, `CURRENT`, `STALE`, `SYNCING`, `FAILED`, `NEVER SYNCED`).
8. **Comprehensive 40+ Test Suite** covering provider states, security invariants, failure recovery, and tenant isolation.
