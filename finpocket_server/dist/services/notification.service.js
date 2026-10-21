"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.NotificationService = void 0;
const uuid_1 = require("uuid");
const database_js_1 = require("../config/database.js");
/**
 * Alert fan-out for the backend.
 *
 * Three layers, in order of reliability:
 *  1. **Persisted** into the `notifications` table so the mobile notification
 *     centre survives a device wipe / re-install.
 *  2. **WhatsApp** via the Meta Cloud API when configured.
 *  3. **SMS** via Twilio when configured.
 *
 * Delivery is strictly best-effort: a missing token or a network failure must
 * never roll back a payment or throw out of a request handler.
 */
class NotificationService {
    static whatsappWarned = false;
    static smsWarned = false;
    // ── Persistence ───────────────────────────────────────────────────────────
    static async record(userId, title, body, type) {
        const id = `ntf_${(0, uuid_1.v4)().substring(0, 8)}`;
        try {
            await (0, database_js_1.runQuery)(`INSERT INTO notifications (id, user_id, title, body, type, is_read, created_at)
         VALUES (?, ?, ?, ?, ?, 0, ?)`, [id, userId, title, body, type, new Date().toISOString()]);
        }
        catch (err) {
            console.warn(`[NotificationService] Failed to persist notification: ${err?.message}`);
        }
        return id;
    }
    static async list(userId, limit = 50) {
        const rows = await (0, database_js_1.allQuery)('SELECT * FROM notifications WHERE user_id = ? ORDER BY created_at DESC LIMIT ?', [userId, limit]);
        return rows.map((r) => ({
            id: r.id,
            title: r.title,
            body: r.body,
            type: r.type,
            is_read: r.is_read === 1 || r.is_read === true,
            created_at: r.created_at,
        }));
    }
    static async markAllRead(userId) {
        const res = await (0, database_js_1.runQuery)('UPDATE notifications SET is_read = 1 WHERE user_id = ? AND is_read = 0', [userId]);
        return res?.changes ?? 0;
    }
    // ── Anomaly detection ─────────────────────────────────────────────────────
    /**
     * Server-side mirror of the on-device heuristics. Runs against the balance
     * *before* the debit so it can flag a payment the client never saw (web,
     * scheduled, or another device).
     */
    static evaluateUnusualTransaction(params) {
        const { amount, recipient, balanceBefore } = params;
        if (amount <= 0)
            return null;
        if (balanceBefore > 0 && amount >= 1000 && amount / balanceBefore > 0.5) {
            return {
                reason: `Payment of ₹${amount.toLocaleString('en-IN')} is more than half your available balance.`,
                severity: 'HIGH',
            };
        }
        if (amount >= 20000) {
            return {
                reason: `Unusually large payment of ₹${amount.toLocaleString('en-IN')} to ${recipient}.`,
                severity: 'HIGH',
            };
        }
        return null;
    }
    /// Heavier check that needs transaction history — kept separate so the hot
    /// path above stays synchronous.
    static async detectRepeatTransfers(userId, recipient) {
        const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
        // Escape LIKE wildcards in user input to prevent pattern injection
        const escapedRecipient = recipient.toLowerCase().replace(/[%_\\]/g, (c) => '\\' + c);
        const row = await (0, database_js_1.getQuery)(`SELECT COUNT(*) as n FROM transactions
       WHERE user_id = ? AND type = 'EXPENSE'
         AND LOWER(receiver) LIKE ? ESCAPE '\\' AND transaction_date >= ?`, [userId, `%${escapedRecipient}%`, since]);
        if ((row?.n ?? 0) >= 3) {
            return {
                reason: `${row.n} transfers to "${recipient}" in the last 24 hours — possible duplicate or account takeover.`,
                severity: 'MEDIUM',
            };
        }
        return null;
    }
    // ── High-level alert ──────────────────────────────────────────────────────
    static async raiseSecurityAlert(params) {
        const { userId, reason, amount, recipient, phone } = params;
        const title = '🚨 Unusual Transaction Detected';
        const detail = [
            reason,
            amount != null ? `Amount: ₹${amount.toLocaleString('en-IN')}` : null,
            recipient ? `Recipient: ${recipient}` : null,
            'If this was not you, block your UPI apps and call your bank immediately.',
        ]
            .filter(Boolean)
            .join('\n');
        await this.record(userId, title, detail, 'security');
        const message = `FinPocket Security Alert\n\n${detail}`;
        const recipientPhone = phone ?? (await this.lookupPhone(userId));
        // Fire-and-forget: an unreachable WhatsApp/Twilio endpoint must never block
        // or fail the payment that triggered the alert.
        void this.deliverWhatsApp(recipientPhone, message);
        void this.deliverSms(recipientPhone, message);
    }
    static async raiseBudgetAlert(params) {
        const { userId, title, body, phone } = params;
        await this.record(userId, title, body, 'budgetAlert');
        const recipientPhone = phone ?? (await this.lookupPhone(userId));
        void this.deliverWhatsApp(recipientPhone, `${title}\n${body}`);
    }
    // ── Delivery ──────────────────────────────────────────────────────────────
    static async lookupPhone(userId) {
        try {
            const row = await (0, database_js_1.getQuery)('SELECT phone FROM users WHERE id = ?', [userId]);
            return row?.phone ?? null;
        }
        catch {
            return null;
        }
    }
    /** Meta WhatsApp Cloud API. Returns false when unconfigured or rejected. */
    static async deliverWhatsApp(phone, message) {
        const token = process.env.WHATSAPP_ACCESS_TOKEN;
        const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
        if (!token || !phoneNumberId) {
            if (!this.whatsappWarned) {
                this.whatsappWarned = true;
                console.warn('[NotificationService] WHATSAPP_ACCESS_TOKEN / WHATSAPP_PHONE_NUMBER_ID not set — ' +
                    'WhatsApp alerts are logged only. The app still offers a one-tap prefilled hand-off.');
            }
            return false;
        }
        if (!phone)
            return false;
        const to = phone.replace(/\D/g, '');
        if (to.length < 10)
            return false;
        try {
            const res = await fetch(`https://graph.facebook.com/v20.0/${phoneNumberId}/messages`, {
                method: 'POST',
                headers: {
                    Authorization: `Bearer ${token}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    messaging_product: 'whatsapp',
                    to: to.length === 10 ? `91${to}` : to,
                    type: 'text',
                    text: { preview_url: false, body: message },
                }),
                signal: AbortSignal.timeout(8000),
            });
            if (!res.ok) {
                const text = await res.text().catch(() => '');
                console.warn(`[NotificationService] WhatsApp rejected (${res.status}): ${text}`);
                return false;
            }
            return true;
        }
        catch (err) {
            console.warn(`[NotificationService] WhatsApp delivery failed: ${err?.message}`);
            return false;
        }
    }
    /** Twilio SMS. Returns false when unconfigured or rejected. */
    static async deliverSms(phone, message) {
        const sid = process.env.TWILIO_ACCOUNT_SID;
        const authToken = process.env.TWILIO_AUTH_TOKEN;
        const from = process.env.TWILIO_FROM_NUMBER;
        if (!sid || !authToken || !from) {
            if (!this.smsWarned) {
                this.smsWarned = true;
                console.warn('[NotificationService] Twilio not configured — SMS alerts are logged only.');
            }
            return false;
        }
        if (!phone)
            return false;
        const to = phone.replace(/\D/g, '');
        if (to.length < 10)
            return false;
        try {
            const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
                method: 'POST',
                headers: {
                    Authorization: 'Basic ' + Buffer.from(`${sid}:${authToken}`).toString('base64'),
                    'Content-Type': 'application/x-www-form-urlencoded',
                },
                body: new URLSearchParams({
                    To: to.length === 10 ? `+91${to}` : `+${to}`,
                    From: from,
                    Body: message,
                }).toString(),
                signal: AbortSignal.timeout(8000),
            });
            if (!res.ok) {
                const text = await res.text().catch(() => '');
                console.warn(`[NotificationService] Twilio rejected (${res.status}): ${text}`);
                return false;
            }
            return true;
        }
        catch (err) {
            console.warn(`[NotificationService] SMS delivery failed: ${err?.message}`);
            return false;
        }
    }
}
exports.NotificationService = NotificationService;
//# sourceMappingURL=notification.service.js.map