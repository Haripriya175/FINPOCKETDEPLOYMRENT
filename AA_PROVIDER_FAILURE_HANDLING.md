# FinPocket — Account Aggregator Resilience & Failure Handling

**Document Version:** 1.0.0  
**Classification:** Technical Resilience Architecture  
**Status:** IMPLEMENTED  

---

## 1. Resilience Philosophy

External banking gateways (AAs and FIPs) operate with varying latency, scheduled maintenance windows, and intermittent network timeouts. FinPocket's failure handling architecture guarantees:
1. **Never crash the application process.**
2. **Never overwrite valid financial data with zeros or empty states during outages.**
3. **Never retry indefinitely or retry non-retryable errors (e.g. invalid consent, 401/403).**
4. **Always preserve the last known valid financial balance and transactions while updating freshness status to `STALE` or `FAILED`.**

---

## 2. HTTP Status Code Classification & Retry Policies

| Status / Error | Category | Max Retries | Backoff Strategy | Action / Mitigation |
| :--- | :--- | :--- | :--- | :--- |
| **`400 Bad Request`** | Non-Retryable Client Error | 0 | None | Log sanitized error, mark operation FAILED, notify client. |
| **`401 Unauthorized`** | Non-Retryable Auth Error | 0 | None | Trigger server-side token refresh once; if fails, abort. |
| **`403 Forbidden` / Invalid Consent** | Non-Retryable Consent Error | 0 | None | Halt sync immediately; mark consent REVOKED or EXPIRED. |
| **`404 Not Found`** | Non-Retryable Reference Error | 0 | None | Abort operation; check consent handle or account ID. |
| **`429 Rate Limited`** | Retryable Rate Limit | 3 | Exponential backoff ($1\text{s} \rightarrow 2\text{s} \rightarrow 4\text{s}$) | Respect `Retry-After` header if present. |
| **`500 Internal Error`** | Retryable Server Error | 2 | Exponential backoff ($1.5\text{s} \rightarrow 3\text{s}$) | Fallback to last known good data. |
| **`502 Bad Gateway` / Malformed** | Retryable Gateway Error | 2 | Exponential backoff | Reject malformed payload without schema corruption. |
| **`503 Service Unavailable`** | Retryable Outage | 2 | Exponential backoff | Enter Circuit Breaker state; preserve existing data. |
| **`ETIMEDOUT` / Timeout** | Retryable Network Timeout | 2 | Linear backoff ($2\text{s} \rightarrow 4\text{s}$) | Abort pending request after 10,000ms threshold. |

---

## 3. Circuit Breaker Specification

```
         ┌────────────────┐
         │     CLOSED     │ ◄────────────────────────┐
         │ (Normal State) │                          │
         └───────┬────────┘                          │
                 │ 5 consecutive failures / 503s     │ 2 consecutive successes
                 ▼                                   │
         ┌────────────────┐                          │
         │      OPEN      │                          │
         │ (Fast Failure) │                          │
         └───────┬────────┘                          │
                 │ 60 seconds cooldown elapsed       │
                 ▼                                   │
         ┌────────────────┐                          │
         │   HALF-OPEN    │ ─────────────────────────┘
         │ (Trial State)  │
         └────────────────┘
```

* When the Circuit Breaker is **OPEN**, background sync calls return immediately with the cached dataset and status `STALE` without exhausting network sockets.
