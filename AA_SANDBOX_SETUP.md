# FinPocket — Account Aggregator Sandbox Setup & Developer Guide

**Document Version:** 1.0.0  
**Classification:** Developer Integration Guide  
**Status:** COMPLETE  

---

## 1. Environment Configuration

To enable the Account Aggregator sandbox provider in your **STAGING** or **DEVELOPMENT** environment, configure the following environment variables in `.env` (or server environment settings):

```bash
# Environment Mode (DEVELOPMENT | TEST | DEMO | STAGING | PRODUCTION)
NODE_ENV=STAGING

# Account Aggregator Provider Settings
AA_PROVIDER_ENABLED=true
AA_PROVIDER_NAME=SETU_AA_SANDBOX
AA_API_BASE_URL=https://ae-sandbox.setu.co
AA_CLIENT_ID=finpocket_sandbox_client_id
AA_CLIENT_SECRET=finpocket_sandbox_client_secret_64chars_long_entropy_key!!
AA_REDIRECT_URI=https://app.finpocket.com/aa/callback
AA_CALLBACK_URL=https://api.finpocket.com/api/v1/aa/callback
AA_WEBHOOK_SECRET=finpocket_webhook_hmac_secret_32chars!!
```

> [!CAUTION]
> **Production Protection Guard:**
> * If `NODE_ENV=PRODUCTION`, setting `AA_PROVIDER_NAME=SETU_AA_SANDBOX` or using sandbox endpoints will trigger an immediate **fatal fail-closed startup abort**.
> * Production requires certified RBI NBFC-AA mTLS endpoints and production client certificates.

---

## 2. Testing with Sandbox Simulator

For automated CI/CD and unit testing without network dependencies:
* FinPocket includes `FakeAccountAggregatorProvider` which simulates complete ReBIT request/response cycles, fault injection, timeouts, and multi-page responses deterministically.
* Configure `NODE_ENV=TEST` to automatically use `FakeAccountAggregatorProvider`.
