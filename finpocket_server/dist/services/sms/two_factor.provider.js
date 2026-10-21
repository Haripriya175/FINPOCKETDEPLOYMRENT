"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.TwoFactorSmsProvider = void 0;
const security_validator_js_1 = require("../../utils/security.validator.js");
/**
 * 2Factor.in SMS Provider
 * High-delivery Indian OTP SMS gateway operating over HTTPS REST API.
 */
class TwoFactorSmsProvider {
    name = 'TwoFactorSmsProvider';
    apiKey;
    timeoutMs;
    constructor(config) {
        this.apiKey = config?.apiKey || process.env.TWOFACTOR_API_KEY;
        this.timeoutMs = config?.timeoutMs || 8000;
    }
    async sendOtp(phone, otp) {
        if (!this.apiKey) {
            return {
                success: false,
                providerName: this.name,
                error: '2Factor API key (TWOFACTOR_API_KEY) is not configured.',
            };
        }
        // Clean phone: 2Factor accepts both 10-digit (e.g. 9966720555) or E.164 (+919966720555)
        const cleanPhone = phone.startsWith('+91')
            ? phone.substring(3)
            : phone.startsWith('91') && phone.length === 12
                ? phone.substring(2)
                : phone.replace(/\D/g, '');
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
        try {
            const url = `https://2factor.in/API/V1/${encodeURIComponent(this.apiKey)}/SMS/${encodeURIComponent(cleanPhone)}/${encodeURIComponent(otp)}`;
            const response = await fetch(url, {
                method: 'GET',
                headers: {
                    'Accept': 'application/json',
                },
                signal: controller.signal,
            });
            clearTimeout(timeout);
            const data = (await response.json());
            if (data && data.Status === 'Success') {
                return {
                    success: true,
                    providerName: this.name,
                    messageId: data.Details || 'delivered',
                };
            }
            const errorMsg = data?.Details || data?.Status || `HTTP ${response.status}`;
            console.warn(`[TwoFactorSmsProvider] Delivery failed for ${(0, security_validator_js_1.maskPhoneNumber)(phone)}: ${errorMsg}`);
            return {
                success: false,
                providerName: this.name,
                error: errorMsg,
            };
        }
        catch (err) {
            clearTimeout(timeout);
            const isTimeout = err?.name === 'AbortError' || err?.code === 'ETIMEDOUT';
            const errorMsg = isTimeout ? '2Factor connection timed out.' : (err instanceof Error ? err.message : 'Unknown gateway error');
            console.error(`[TwoFactorSmsProvider] Network error for ${(0, security_validator_js_1.maskPhoneNumber)(phone)}: ${errorMsg}`);
            return {
                success: false,
                providerName: this.name,
                error: errorMsg,
            };
        }
    }
}
exports.TwoFactorSmsProvider = TwoFactorSmsProvider;
//# sourceMappingURL=two_factor.provider.js.map