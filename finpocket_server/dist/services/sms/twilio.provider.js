"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.TwilioSmsProvider = void 0;
const security_validator_js_1 = require("../../utils/security.validator.js");
class TwilioSmsProvider {
    name = 'TwilioSmsProvider';
    accountSid;
    authToken;
    fromNumber;
    timeoutMs;
    constructor(config) {
        this.accountSid = config?.accountSid || process.env.TWILIO_ACCOUNT_SID;
        this.authToken = config?.authToken || process.env.TWILIO_AUTH_TOKEN;
        this.fromNumber = config?.fromNumber || process.env.TWILIO_PHONE_NUMBER;
        this.timeoutMs = config?.timeoutMs || 8000;
    }
    async sendOtp(phone, otp) {
        if (!this.accountSid || !this.authToken || !this.fromNumber) {
            return {
                success: false,
                providerName: this.name,
                error: 'Twilio credentials (accountSid, authToken, fromNumber) are not fully configured.',
            };
        }
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
        try {
            const url = `https://api.twilio.com/2010-04-01/Accounts/${this.accountSid}/Messages.json`;
            const basicAuth = Buffer.from(`${this.accountSid}:${this.authToken}`).toString('base64');
            const bodyParams = new URLSearchParams({
                To: phone.startsWith('+') ? phone : `+${phone}`,
                From: this.fromNumber,
                Body: `Your FinPocket security verification code is: ${otp}. Valid for 5 minutes. Do not share this code with anyone.`,
            });
            const response = await fetch(url, {
                method: 'POST',
                headers: {
                    'Authorization': `Basic ${basicAuth}`,
                    'Content-Type': 'application/x-www-form-urlencoded',
                },
                body: bodyParams.toString(),
                signal: controller.signal,
            });
            clearTimeout(timeout);
            const data = (await response.json());
            if (!response.ok) {
                const errorMsg = data.message || `Twilio error code ${data.code || response.status}`;
                console.error(`[TwilioSmsProvider] Delivery failed for ${(0, security_validator_js_1.maskPhoneNumber)(phone)}: ${errorMsg}`);
                return {
                    success: false,
                    providerName: this.name,
                    error: errorMsg,
                };
            }
            return {
                success: true,
                providerName: this.name,
                messageId: data.sid || 'delivered',
            };
        }
        catch (err) {
            clearTimeout(timeout);
            const isTimeout = err?.name === 'AbortError' || err?.code === 'ETIMEDOUT';
            const errorMsg = isTimeout ? 'Twilio gateway connection timed out.' : (err instanceof Error ? err.message : 'Unknown gateway error');
            console.error(`[TwilioSmsProvider] Network/API error for ${(0, security_validator_js_1.maskPhoneNumber)(phone)}: ${errorMsg}`);
            return {
                success: false,
                providerName: this.name,
                error: errorMsg,
            };
        }
    }
}
exports.TwilioSmsProvider = TwilioSmsProvider;
//# sourceMappingURL=twilio.provider.js.map