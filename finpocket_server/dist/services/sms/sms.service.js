"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SmsService = void 0;
const fast2sms_provider_js_1 = require("./fast2sms.provider.js");
const msg91_provider_js_1 = require("./msg91.provider.js");
const twilio_provider_js_1 = require("./twilio.provider.js");
const two_factor_provider_js_1 = require("./two_factor.provider.js");
const mock_sms_provider_js_1 = require("./mock_sms.provider.js");
const security_validator_js_1 = require("../../utils/security.validator.js");
const app_config_js_1 = require("../../config/app_config.js");
class SmsService {
    static mockProvider = null;
    static activeProvider = null;
    /**
     * Test Hook: Set a mock SMS provider for testing without sending real SMS messages.
     */
    static setMockProvider(provider) {
        this.mockProvider = provider;
    }
    /**
     * Resolves or instantiates the configured SMS provider.
     */
    static getProvider() {
        if (this.mockProvider) {
            return this.mockProvider;
        }
        if (this.activeProvider) {
            return this.activeProvider;
        }
        const providerType = (process.env.SMS_PROVIDER || app_config_js_1.config.sms?.provider || '').toLowerCase();
        const twoFactorApiKey = process.env.TWOFACTOR_API_KEY || process.env['2FACTOR_API_KEY'];
        if (twoFactorApiKey || providerType === '2factor' || providerType === 'twofactor') {
            this.activeProvider = new two_factor_provider_js_1.TwoFactorSmsProvider({
                apiKey: twoFactorApiKey,
            });
        }
        else if (providerType === 'fast2sms' || (!providerType && process.env.FAST2SMS_API_KEY)) {
            this.activeProvider = new fast2sms_provider_js_1.Fast2SmsProvider({
                apiKey: process.env.FAST2SMS_API_KEY,
                route: process.env.FAST2SMS_ROUTE || 'otp',
            });
        }
        else if (providerType === 'msg91') {
            this.activeProvider = new msg91_provider_js_1.Msg91Provider({
                authKey: process.env.MSG91_AUTH_KEY,
                templateId: process.env.MSG91_TEMPLATE_ID,
            });
        }
        else if (providerType === 'twilio') {
            this.activeProvider = new twilio_provider_js_1.TwilioSmsProvider({
                accountSid: process.env.TWILIO_ACCOUNT_SID,
                authToken: process.env.TWILIO_AUTH_TOKEN,
                fromNumber: process.env.TWILIO_PHONE_NUMBER,
            });
        }
        else {
            // Default fallback for TEST / DEMO / DEV environments
            this.activeProvider = new mock_sms_provider_js_1.MockSmsProvider();
        }
        return this.activeProvider;
    }
    /**
     * Sends an OTP verification code via the configured SMS gateway.
     * Logs only masked phone numbers and operational status. Never logs the OTP or credentials.
     *
     * @param phone Normalized E.164 phone number (+91XXXXXXXXXX)
     * @param otp 6-digit cryptographic verification code
     * @returns boolean true if SMS gateway accepted the delivery request
     */
    static async sendOtp(phone, otp) {
        const result = await this.sendOtpWithResult(phone, otp);
        return result.success;
    }
    /**
     * Detailed send method returning provider result metadata.
     */
    static async sendOtpWithResult(phone, otp) {
        const provider = this.getProvider();
        const maskedPhone = (0, security_validator_js_1.maskPhoneNumber)(phone);
        try {
            const result = await provider.sendOtp(phone, otp);
            if (result.success) {
                console.log(`[SmsService] OTP SMS accepted by ${provider.name} for ${maskedPhone} (msgId: ${result.messageId || 'ok'})`);
            }
            else {
                console.warn(`[SmsService] OTP SMS delivery failed via ${provider.name} for ${maskedPhone}: ${result.error}`);
            }
            return result;
        }
        catch (err) {
            const errorMsg = err instanceof Error ? err.message : 'Unknown gateway dispatch error';
            console.error(`[SmsService] Unexpected exception sending SMS via ${provider.name} to ${maskedPhone}: ${errorMsg}`);
            return {
                success: false,
                providerName: provider.name,
                error: errorMsg,
            };
        }
    }
}
exports.SmsService = SmsService;
//# sourceMappingURL=sms.service.js.map