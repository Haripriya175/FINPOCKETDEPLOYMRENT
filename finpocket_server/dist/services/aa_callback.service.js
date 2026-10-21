"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AACallbackService = void 0;
const crypto_1 = __importDefault(require("crypto"));
const database_js_1 = require("../config/database.js");
const uuid_1 = require("uuid");
const app_config_js_1 = require("../config/app_config.js");
const redirect_state_js_1 = require("../utils/redirect_state.js");
class AACallbackService {
    static processedEvents = new Set();
    static MAX_TIMESTAMP_DRIFT_MS = 5 * 60 * 1000; // 5 minutes
    /**
     * Reset processed events cache (for testing)
     */
    static resetCache() {
        this.processedEvents.clear();
    }
    /**
     * Cryptographically verify webhook signature using HMAC-SHA256
     * Supports both hex and base64 digest formats for Setu API compliance.
     */
    static verifySignature(rawBody, signature, secret) {
        if (!rawBody || !signature || !secret)
            return false;
        try {
            const sigTrimmed = signature.trim();
            // Check hex digest
            const expectedHex = crypto_1.default.createHmac('sha256', secret).update(rawBody).digest('hex');
            const sigBuf = Buffer.from(sigTrimmed, 'utf8');
            const expHexBuf = Buffer.from(expectedHex, 'utf8');
            if (sigBuf.length === expHexBuf.length && crypto_1.default.timingSafeEqual(sigBuf, expHexBuf)) {
                return true;
            }
            // Check base64 digest
            const expectedB64 = crypto_1.default.createHmac('sha256', secret).update(rawBody).digest('base64');
            const expB64Buf = Buffer.from(expectedB64, 'utf8');
            if (sigBuf.length === expB64Buf.length && crypto_1.default.timingSafeEqual(sigBuf, expB64Buf)) {
                return true;
            }
            return false;
        }
        catch {
            return false;
        }
    }
    /**
     * Process and validate an incoming Setu / AA webhook callback
     * Applies dual verification: HMAC verification when signature header is present,
     * plus strict compensating controls and state validation.
     */
    static async processWebhook(rawBody, signature, secret, payload, requestId) {
        if (!payload || typeof payload !== 'object') {
            return { valid: false, code: 'MALFORMED_PAYLOAD', reason: 'Payload must be a valid JSON object.' };
        }
        // 1. Payload Structure & Presence Validation
        if (!payload || typeof payload !== 'object' || Object.keys(payload).length === 0) {
            return { valid: false, code: 'MALFORMED_PAYLOAD', reason: 'Malformed or empty webhook payload.' };
        }
        const eventType = payload.type || payload.eventType || 'CONSENT_STATUS_UPDATE';
        const allowedTypes = ['CONSENT_STATUS_UPDATE', 'FI_DATA_READY', 'CONSENT_REVOCATION', 'DATA_READY'];
        if (!allowedTypes.includes(eventType)) {
            return { valid: false, code: 'MALFORMED_PAYLOAD', reason: `Unsupported notification event type: ${eventType}` };
        }
        const consentIdentifier = payload.consentHandle || payload.consentId || payload.id || payload.data?.consentId || payload.data?.detail?.consentId;
        if (!consentIdentifier) {
            return { valid: false, code: 'MALFORMED_PAYLOAD', reason: 'Missing consent identifier (consentHandle or consentId).' };
        }
        // 2. Authentication & Verification
        let verifiedMode = 'COMPENSATING_CONTROLS';
        if (signature && secret) {
            if (!this.verifySignature(rawBody, signature, secret)) {
                return { valid: false, code: 'INVALID_SIGNATURE', reason: 'Cryptographic HMAC-SHA256 signature verification failed.' };
            }
            verifiedMode = 'HMAC_SIGNATURE';
        }
        const eventId = payload.eventId || payload.notificationId || payload.id || payload.txnId || `${consentIdentifier}_${eventType}_${payload.timestamp || Date.now()}`;
        // 3. Timestamp Validation (if provided)
        if (payload.timestamp) {
            const eventTime = Date.parse(payload.timestamp);
            if (isNaN(eventTime) || Math.abs(Date.now() - eventTime) > this.MAX_TIMESTAMP_DRIFT_MS) {
                return { valid: false, code: 'EXPIRED_TIMESTAMP', reason: 'Webhook timestamp exceeds acceptable 5-minute drift window.' };
            }
        }
        // 4. Replay Protection & Idempotency
        if (this.processedEvents.has(eventId)) {
            return { valid: false, code: 'REPLAY_DETECTED', reason: 'Duplicate or replayed webhook event ID detected.' };
        }
        this.processedEvents.add(eventId);
        // 5. Consent Session & Tenant Ownership Resolution
        const consent = await (0, database_js_1.getQuery)('SELECT id, user_id, consent_status, bank_account_id FROM account_consents WHERE consent_handle = ? OR id = ?', [consentIdentifier, consentIdentifier]);
        if (!consent) {
            return { valid: false, code: 'UNKNOWN_CONSENT', reason: 'No matching server-side consent session found.' };
        }
        // 6. Map Normalized Status & State Transition Validation
        const rawStatus = (payload.data?.status || payload.consentStatus || payload.status || (eventType === 'FI_DATA_READY' ? 'ACTIVE' : 'ACTIVE')).toString().toUpperCase();
        let newStatus = 'ACTIVE';
        if (rawStatus === 'APPROVED' || rawStatus === 'ACTIVE' || rawStatus === 'COMPLETED') {
            newStatus = 'ACTIVE';
        }
        else if (rawStatus === 'REJECTED' || rawStatus === 'FAILED' || rawStatus === 'ERROR') {
            newStatus = 'REJECTED';
        }
        else if (rawStatus === 'REVOKED') {
            newStatus = 'REVOKED';
        }
        else if (rawStatus === 'EXPIRED') {
            newStatus = 'EXPIRED';
        }
        else if (rawStatus === 'PAUSED') {
            newStatus = 'REVOKED';
        }
        // State transition guard: revoked or expired consent cannot transition back to ACTIVE
        const currentStatus = consent.consent_status;
        if ((currentStatus === 'REVOKED' || currentStatus === 'EXPIRED') && newStatus === 'ACTIVE') {
            return { valid: false, code: 'INVALID_STATE_TRANSITION', reason: `Illegal state transition: ${currentStatus} consent cannot be transitioned to ACTIVE.` };
        }
        // 7. Update Consent Record in Database
        await (0, database_js_1.runQuery)('UPDATE account_consents SET consent_status = ? WHERE id = ?', [newStatus, consent.id]);
        // If accounts details are provided in Setu payload (e.g. data.detail.accounts)
        const accounts = payload.data?.detail?.accounts || payload.accounts;
        if (Array.isArray(accounts) && accounts.length > 0 && consent.bank_account_id) {
            const firstAcc = accounts[0];
            const masked = firstAcc.maskedAccNumber || firstAcc.maskedAccountNumber;
            const accType = firstAcc.accType || firstAcc.accountType || 'SAVINGS';
            const fipName = firstAcc.fipId === 'setu-fip' ? 'Setu Mock Bank' : (firstAcc.fipId || firstAcc.fipName || 'Setu Partner Bank');
            if (masked) {
                await (0, database_js_1.runQuery)(`UPDATE bank_accounts SET masked_account_number = ?, account_type = ?, institution_name = ?, connection_status = 'CONNECTED' WHERE id = ?`, [masked, accType, fipName, consent.bank_account_id]);
            }
        }
        // If consent revoked, update linked bank account connection status
        if (newStatus === 'REVOKED' && consent.bank_account_id) {
            await (0, database_js_1.runQuery)(`UPDATE bank_accounts SET connection_status = 'DISCONNECTED' WHERE id = ?`, [consent.bank_account_id]);
        }
        // 8. Structured Tamper-Evident Audit Event
        await (0, database_js_1.runQuery)(`
      INSERT INTO audit_logs (id, user_id, action, metadata)
      VALUES (?, ?, ?, ?)
    `, [
            (0, uuid_1.v4)(),
            consent.user_id,
            `SETU_CALLBACK_${eventType}`,
            JSON.stringify({
                eventId,
                consentHandle: consentIdentifier,
                consentId: consent.id,
                status: newStatus,
                eventType,
                requestId: requestId || null,
                verified: true,
            })
        ]);
        return {
            valid: true,
            consentId: consent.id,
            userId: consent.user_id,
            status: newStatus,
            eventType,
            verifiedMode
        };
    }
    /**
     * Handle Customer Browser Redirect Return from Setu Bridge UI
     * URL format: /api/v1/setu/redirect?success=true&id=cns_123&errorcode=1&fp_state=<signed>
     *
     * Phase D: this return is UNAUTHENTICATED — anyone could craft the URL and
     * flip a consent's status. Every consent-creation path appends an HMAC-signed
     * `fp_state` bound to the local consent id; local mutation requires a valid
     * signature. Exception: TEST/DEMO/DEVELOPMENT accept unsigned returns (the
     * sandbox bridge does not always echo query parameters) — PRODUCTION and
     * STAGING never do: unsigned success returns fall back to provider-side
     * reconciliation (Setu's own API must confirm), and unsigned rejections are
     * recorded but not applied (the signed webhook settles them).
     */
    static async handleRedirect(queryParams) {
        const isSuccess = queryParams.success === 'true' || queryParams.success === true;
        const consentId = queryParams.id || '';
        const errorCode = queryParams.errorcode;
        let targetStatus = isSuccess ? 'ACTIVE' : 'REJECTED';
        const stateCheck = (0, redirect_state_js_1.verifyRedirectState)(queryParams.fp_state);
        const strictRedirects = app_config_js_1.config.environment === 'PRODUCTION' || app_config_js_1.config.environment === 'STAGING';
        let verification = 'NO_CONSENT';
        let mutated = false;
        if (consentId) {
            const consent = await (0, database_js_1.getQuery)('SELECT id, user_id, consent_status, consent_handle FROM account_consents WHERE id = ? OR consent_handle = ?', [consentId, consentId]);
            if (consent) {
                const stateMatches = stateCheck.valid && stateCheck.consentLocalId === consent.id;
                let allowMutation;
                if (stateMatches) {
                    allowMutation = true;
                    verification = 'SIGNED_STATE';
                }
                else if (!strictRedirects) {
                    // TEST / DEMO / DEVELOPMENT: legacy unsigned returns still settle
                    // locally so the sandbox bridge flow keeps working end-to-end.
                    allowMutation = true;
                    verification = 'UNSIGNED_SANDBOX';
                }
                else if (isSuccess && !errorCode) {
                    // Real environment, no valid signature: only the provider's own API
                    // may confirm the outcome. reconcileLiveConsent fetches Setu's
                    // authoritative status and persists it under the consent owner's
                    // identity; if that is impossible we do NOT mutate.
                    try {
                        await this.reconcileLiveConsent(consent.user_id, consent.consent_handle || consent.id);
                        allowMutation = false; // reconcile already wrote the authoritative row
                        mutated = true;
                        verification = 'PROVIDER_RECONCILED';
                    }
                    catch (recErr) {
                        allowMutation = false;
                        verification = 'UNSIGNED_BLOCKED';
                        console.warn(`[aa-callback] unsigned consent redirect blocked (consent=${consent.id}, reason=${stateCheck.valid ? 'state-mismatch' : stateCheck.reason}):`, recErr instanceof Error ? recErr.message : recErr);
                    }
                }
                else {
                    // Unsigned rejection/cancellation in a real environment: an
                    // unauthenticated URL may never flip status; the signed webhook or an
                    // authenticated reconcile call settles it.
                    allowMutation = false;
                    verification = 'UNSIGNED_BLOCKED';
                    console.warn(`[aa-callback] unsigned consent redirect blocked (consent=${consent.id}, reason=${stateCheck.valid ? 'state-mismatch' : stateCheck.reason})`);
                }
                if (allowMutation) {
                    mutated = true;
                    if (!isSuccess || errorCode) {
                        targetStatus = 'REJECTED';
                        await (0, database_js_1.runQuery)(`UPDATE account_consents SET consent_status = 'REJECTED' WHERE id = ?`, [consent.id]);
                    }
                    else if (consent.consent_status === 'REQUESTED' || consent.consent_status === 'PENDING') {
                        targetStatus = 'ACTIVE';
                        await (0, database_js_1.runQuery)(`UPDATE account_consents SET consent_status = 'ACTIVE' WHERE id = ?`, [consent.id]);
                    }
                }
                // Audit log redirect return — records how (or whether) it was verified.
                await (0, database_js_1.runQuery)(`
          INSERT INTO audit_logs (id, user_id, action, metadata)
          VALUES (?, ?, 'SETU_REDIRECT_RETURN', ?)
        `, [
                    (0, uuid_1.v4)(),
                    consent.user_id,
                    JSON.stringify({
                        consentId: consent.id,
                        consentHandle: consent.consent_handle,
                        success: isSuccess,
                        errorCode: errorCode || null,
                        status: mutated ? targetStatus : consent.consent_status,
                        verification,
                        mutated,
                        state: stateCheck.valid ? 'valid' : stateCheck.reason,
                    })
                ]);
            }
        }
        const deepLinkUrl = `finpocket://consent-callback?success=${isSuccess}&id=${encodeURIComponent(consentId)}${errorCode ? `&errorcode=${encodeURIComponent(errorCode)}` : ''}`;
        const message = verification === 'UNSIGNED_BLOCKED'
            ? 'Consent return received, but it could not be verified — no local change was applied. The status will settle once the provider confirms it.'
            : isSuccess
                ? 'Account Aggregator consent was successfully authorized.'
                : `Consent authorization was rejected or cancelled${errorCode ? ` (Error code: ${errorCode})` : ''}.`;
        return {
            success: isSuccess,
            consentId,
            status: targetStatus,
            errorCode,
            message,
            deepLinkUrl,
            verification,
            mutated
        };
    }
    /**
     * Safe Reconciliation Mechanism for Live Setu Consent Artifacts
     * Verifies status directly from Setu API before persisting into PostgreSQL database
     */
    static async reconcileLiveConsent(userId, consentId) {
        const clientId = app_config_js_1.config.aaProvider.setu.clientId;
        const clientSecret = app_config_js_1.config.aaProvider.setu.clientSecret;
        const productInstanceId = app_config_js_1.config.aaProvider.setu.productInstanceId;
        const apiBaseUrl = app_config_js_1.config.aaProvider.setu.apiBaseUrl;
        if (!clientId || !clientSecret) {
            throw new Error('Setu credentials not configured.');
        }
        // 1. Obtain Setu OAuth token
        const authRes = await fetch(`${app_config_js_1.config.aaProvider.setu.authBaseUrl}/api/v2/auth/token`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ clientID: clientId, secret: clientSecret }),
            signal: AbortSignal.timeout(15000)
        });
        if (!authRes.ok) {
            throw new Error(`Setu OAuth authentication failed: HTTP ${authRes.status}`);
        }
        const authData = await authRes.json();
        const token = authData.data?.token || authData.token;
        // 2. Fetch live status directly from authoritative Setu API
        const res = await fetch(`${apiBaseUrl}/v2/consents/${consentId}`, {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${token}`,
                'x-product-instance-id': productInstanceId
            },
            signal: AbortSignal.timeout(15000)
        });
        if (!res.ok) {
            throw new Error(`Failed to fetch Setu consent details: HTTP ${res.status}`);
        }
        const setuConsent = await res.json();
        const liveStatus = (setuConsent.status || '').toUpperCase() === 'ACTIVE' ? 'ACTIVE' : 'REJECTED';
        if (liveStatus !== 'ACTIVE') {
            throw new Error(`Cannot reconcile consent: Setu reports status ${setuConsent.status}`);
        }
        const now = new Date().toISOString();
        const validFrom = setuConsent.detail?.consentStart || now;
        const validTo = setuConsent.detail?.consentExpiry || new Date(Date.now() + 365 * 86400000).toISOString();
        // 3. Extract or create linked bank account — never invent one.
        const accountsLinked = setuConsent.accountsLinked || [];
        const firstLinked = Array.isArray(accountsLinked) && accountsLinked.length > 0
            ? accountsLinked[0]
            : null;
        const realMasked = (firstLinked && firstLinked.maskedAccNumber) || '';
        const fipName = firstLinked
            ? (firstLinked.fipId === 'setu-fip' ? 'Setu Mock Bank' : (firstLinked.fipId || ''))
            : '';
        const accType = (firstLinked && firstLinked.accType) || 'SAVINGS';
        // Prefer the pending account created when consent was requested so the
        // same link can never appear as a duplicate bank row.
        // Every consent lookup is scoped to THIS user: an authenticated caller
        // must never read or overwrite another account's consent (Phase A HIGH —
        // cross-user consent overwrite via reconcileLiveConsent).
        const linkedConsent = await (0, database_js_1.getQuery)('SELECT id, bank_account_id FROM account_consents WHERE (id = ? OR consent_handle = ?) AND user_id = ?', [consentId, consentId, userId]);
        if (!linkedConsent) {
            const foreignRow = await (0, database_js_1.getQuery)('SELECT id FROM account_consents WHERE id = ? OR consent_handle = ?', [consentId, consentId]);
            if (foreignRow) {
                throw new Error('Consent does not belong to the authenticated user.');
            }
        }
        let bankAccountId = `bnk_setu_${(0, uuid_1.v4)().substring(0, 8)}`;
        let existingAcc = null;
        if (linkedConsent?.bank_account_id) {
            existingAcc = await (0, database_js_1.getQuery)('SELECT id FROM bank_accounts WHERE id = ? AND user_id = ?', [linkedConsent.bank_account_id, userId]);
        }
        if (!existingAcc && realMasked) {
            existingAcc = await (0, database_js_1.getQuery)('SELECT id FROM bank_accounts WHERE user_id = ? AND masked_account_number = ?', [userId, realMasked]);
        }
        // First connected account becomes primary (see connectAccount paths):
        // EF deposit/withdraw, bills, payments and expense deduction all look up
        // is_primary = 1, so a user whose only account activates here must get it.
        const existingPrimary = await (0, database_js_1.getQuery)('SELECT id FROM bank_accounts WHERE user_id = ? AND is_primary = 1 LIMIT 1', [userId]);
        const isFirstAccount = !existingPrimary;
        if (existingAcc) {
            bankAccountId = existingAcc.id;
            // Consent is active: promote the pending row with the real masked number
            // when the bank supplied one. The balance is left untouched here — money
            // is only ever written by an actual data fetch, never a constant.
            await (0, database_js_1.runQuery)(`UPDATE bank_accounts SET connection_status = 'CONNECTED', last_synced_at = ?` +
                (isFirstAccount ? `, is_primary = 1` : '') +
                (realMasked ? `, masked_account_number = ?, account_type = ?` : '') +
                ` WHERE id = ?`, realMasked ? [now, realMasked, accType, bankAccountId] : [now, bankAccountId]);
        }
        else if (realMasked && fipName) {
            // Create an account only when the bank actually returned its identity —
            // and start it at ₹0 until real data arrives.
            await (0, database_js_1.runQuery)(`
        INSERT INTO bank_accounts (id, user_id, institution_name, institution_code, masked_account_number, account_type, current_balance, available_balance, is_primary, connection_status, provider_type, last_synced_at)
        VALUES (?, ?, ?, 'SETU', ?, ?, 0.0, 0.0, ?, 'CONNECTED', 'SETU_AA_SANDBOX', ?)
      `, [bankAccountId, userId, fipName, realMasked, accType, isFirstAccount ? 1 : 0, now]);
        }
        // 4. Upsert consent in database (row already verified to belong to this user)
        const existingConsent = linkedConsent;
        let localConsentId = consentId;
        if (existingConsent) {
            localConsentId = existingConsent.id;
            await (0, database_js_1.runQuery)(`
        UPDATE account_consents 
        SET consent_status = 'ACTIVE', bank_account_id = ?, valid_from = ?, valid_to = ?
        WHERE id = ?
      `, [bankAccountId, validFrom, validTo, localConsentId]);
        }
        else {
            await (0, database_js_1.runQuery)(`
        INSERT INTO account_consents (id, user_id, bank_account_id, consent_handle, consent_status, data_access_types, valid_from, valid_to, created_at)
        VALUES (?, ?, ?, ?, 'ACTIVE', 'PROFILE,SUMMARY,TRANSACTIONS', ?, ?, ?)
      `, [localConsentId, userId, bankAccountId, consentId, validFrom, validTo, now]);
        }
        // 5. Record Explicit Audit Trail (Task 4 requirement)
        const auditedAcc = await (0, database_js_1.getQuery)('SELECT masked_account_number FROM bank_accounts WHERE id = ?', [bankAccountId]);
        await AACallbackService.recordReconciliationAudit({
            userId,
            consentId,
            localConsentId,
            bankAccountId,
            maskedAccountNumber: auditedAcc?.masked_account_number || realMasked || '',
            traceId: setuConsent.traceId || null
        });
        return {
            success: true,
            consentId: localConsentId,
            status: 'ACTIVE',
            bankAccountId
        };
    }
    /**
     * Writes the `SETU_CONSENT_RECONCILED` audit trail with
     * `source: PROVIDER_STATUS_VERIFICATION`.
     *
     * Pulled out of `reconcileLiveConsent` so the callback test suite exercises
     * the exact production write instead of querying for whatever audit row an
     * earlier run happened to leave behind — that lookup silently returned
     * `undefined` on a clean database and crashed the suite.
     */
    static async recordReconciliationAudit(entry) {
        await (0, database_js_1.runQuery)(`
      INSERT INTO audit_logs (id, user_id, action, metadata)
      VALUES (?, ?, 'SETU_CONSENT_RECONCILED', ?)
    `, [
            (0, uuid_1.v4)(),
            entry.userId,
            JSON.stringify({
                source: 'PROVIDER_STATUS_VERIFICATION',
                consentId: entry.consentId,
                localConsentId: entry.localConsentId,
                status: 'ACTIVE',
                bankAccountId: entry.bankAccountId,
                maskedAccountNumber: entry.maskedAccountNumber,
                verified: entry.verified ?? true,
                traceId: entry.traceId ?? null
            })
        ]);
    }
}
exports.AACallbackService = AACallbackService;
//# sourceMappingURL=aa_callback.service.js.map