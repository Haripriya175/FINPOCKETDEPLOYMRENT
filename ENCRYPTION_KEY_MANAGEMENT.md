# Provider Token Encryption & Key Management Architecture

## 1. Cryptographic Design Overview

FinPocket encrypts all external provider access and refresh tokens at rest using **AES-256-GCM** with **HKDF (RFC 5869)** key derivation.

```
┌────────────────────────────────────────────────────────┐
│  Environment Master Secret (PROVIDER_ENCRYPTION_KEY)   │
└───────────────────────────┬────────────────────────────┘
                            │
                            ▼
┌────────────────────────────────────────────────────────┐
│             HKDF Key Derivation (RFC 5869)             │
│   • Hash: SHA-256                                      │
│   • Salt: 'finpocket-provider-token-salt-v1'           │
│   • Info Context: 'finpocket-provider-token-encryption-v1'
│   • Output Key Length: 32 Bytes (256-bit symmetric)    │
└───────────────────────────┬────────────────────────────┘
                            │
                            ▼
┌────────────────────────────────────────────────────────┐
│             AES-256-GCM Authenticated Cipher           │
│   • Nonce / IV: 12-byte random per operation           │
│   • Auth Tag: 16-byte GCM authentication tag           │
│   • Ciphertext Payload: hex-encoded                    │
└───────────────────────────┬────────────────────────────┘
                            │
                            ▼
┌────────────────────────────────────────────────────────┐
│  Storage Format: "<iv_hex>:<auth_tag_hex>:<cipher_hex>"│
└────────────────────────────────────────────────────────┘
```

---

## 2. Key Separation & Zero Static Hash Derivation

1. **Elimination of Bare SHA-256 Hashes**: Rather than hashing an arbitrary secret directly, HKDF applies HMAC extraction followed by expansion to generate a cryptographically strong pseudo-random key with high entropy.
2. **Context & Domain Separation**: The `info` parameter binds the derived key strictly to provider token encryption, ensuring keys cannot be cross-used across disparate subsystems (such as JWT signing or PIN hashing).
3. **Nonce / IV Uniqueness**: Every encryption invocation generates a fresh 12-byte cryptographic random nonce (`crypto.randomBytes(12)`). Repeated encryption of the exact same token produces completely distinct ciphertexts, preventing traffic analysis and ciphertext collision.

---

## 3. Threat Model & Tampering Defense

| Attack Vector | Defense Mechanism | Behavior on Detection |
| :--- | :--- | :--- |
| **Ciphertext Bit Flipping** | GCM 128-bit Authentication Tag | Decryption fails immediately with authentication error. |
| **Tag Substitution** | Tag verified against GCM State | `setAuthTag()` verification failure; operation rejected. |
| **Mismatched Master Secret** | HKDF Key Divergence | Decryption fails authentication check; zero plaintext returned. |
| **Database Exfiltration** | AES-256-GCM at rest | Plaintext tokens unrecoverable without external KMS secret. |
| **Log Leakage** | Client DTO & Error Redaction | Provider tokens are stripped before logging or API serialization. |

---

## 4. Key Management & Rotation Strategy in Staging/Production

1. **Secret Sourcing**: `PROVIDER_ENCRYPTION_KEY` must be injected via AWS Secrets Manager, Google Cloud Secret Manager, or HashiCorp Vault.
2. **Rotation Protocol**:
   - Introduce versioned prefix to encrypted tokens (e.g. `v1:<iv>:<tag>:<cipher>`).
   - Re-encrypt stored records during scheduled maintenance using new master keys.
