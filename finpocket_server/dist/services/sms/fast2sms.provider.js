"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Fast2SmsProvider = void 0;
const security_validator_js_1 = require("../../utils/security.validator.js");
class Fast2SmsProvider {
    name = 'Fast2SmsProvider';
    apiKey;
    route;
    timeoutMs;
    constructor(config) {
        this.apiKey = config?.apiKey || process.env.FAST2SMS_API_KEY;
        this.route = config?.route || process.env.FAST2SMS_ROUTE || 'otp';
        this.timeoutMs = config?.timeoutMs || 8000;
    }
    async sendOtp(phone, otp) {
        if (!this.apiKey) {
            return {
                success: false,
                providerName: this.name,
                error: 'Fast2SMS API key is not configured.',
            };
        }
        // Extract 10-digit number for Fast2SMS (strip +91 if present)
        const raw10Digits = phone.startsWith('+91') ? phone.slice(3) : phone;
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
        try {
            const response = await fetch('https://www.fast2sms.com/dev/bulkV2', {
                method: 'POST',
                headers: {
                    'authorization': this.apiKey,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    route: this.route,
                    variables_values: otp,
                    numbers: raw10Digits,
                }),
                signal: controller.signal,
            });
            clearTimeout(timeout);
            const data = (await response.json());
            if (!response.ok || !data.return) {
                const errorMsg = Array.isArray(data.message) ? data.message.join(', ') : (data.message || `HTTP ${response.status}`);
                console.error(`[Fast2SmsProvider] Delivery failed for ${(0, security_validator_js_1.maskPhoneNumber)(phone)}: ${errorMsg}`);
                return {
                    success: false,
                    providerName: this.name,
                    error: errorMsg,
                };
            }
            const messageId = data.request_id || (Array.isArray(data.message) ? data.message[0] : 'delivered');
            return {
                success: true,
                providerName: this.name,
                messageId: String(messageId),
            };
        }
        catch (err) {
            clearTimeout(timeout);
            const isTimeout = err?.name === 'AbortError' || err?.code === 'ETIMEDOUT';
            const errorMsg = isTimeout ? 'Fast2SMS gateway connection timed out.' : (err instanceof Error ? err.message : 'Unknown gateway error');
            console.error(`[Fast2SmsProvider] Network/API error for ${(0, security_validator_js_1.maskPhoneNumber)(phone)}: ${errorMsg}`);
            return {
                success: false,
                providerName: this.name,
                error: errorMsg,
            };
        }
    }
}
exports.Fast2SmsProvider = Fast2SmsProvider;
//# sourceMappingURL=fast2sms.provider.js.map