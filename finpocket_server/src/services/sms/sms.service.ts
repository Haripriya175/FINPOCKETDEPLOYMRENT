import { ISmsProvider, SmsSendResult } from './sms_provider.interface.js';
import { Fast2SmsProvider } from './fast2sms.provider.js';
import { Msg91Provider } from './msg91.provider.js';
import { TwilioSmsProvider } from './twilio.provider.js';
import { TwoFactorSmsProvider } from './two_factor.provider.js';
import { MockSmsProvider } from './mock_sms.provider.js';
import { maskPhoneNumber } from '../../utils/security.validator.js';
import { config } from '../../config/app_config.js';

export class SmsService {
  private static mockProvider: ISmsProvider | null = null;
  private static activeProvider: ISmsProvider | null = null;

  /**
   * Test Hook: Set a mock SMS provider for testing without sending real SMS messages.
   */
  static setMockProvider(provider: ISmsProvider | null): void {
    this.mockProvider = provider;
  }

  /**
   * Resolves or instantiates the configured SMS provider.
   */
  static getProvider(): ISmsProvider {
    if (this.mockProvider) {
      return this.mockProvider;
    }

    if (this.activeProvider) {
      return this.activeProvider;
    }

    const providerType = (process.env.SMS_PROVIDER || config.sms?.provider || '').toLowerCase();
    const twoFactorApiKey = process.env.TWOFACTOR_API_KEY || process.env['2FACTOR_API_KEY'];

    if (twoFactorApiKey || providerType === '2factor' || providerType === 'twofactor') {
      this.activeProvider = new TwoFactorSmsProvider({
        apiKey: twoFactorApiKey,
      });
    } else if (providerType === 'fast2sms' || (!providerType && process.env.FAST2SMS_API_KEY)) {
      this.activeProvider = new Fast2SmsProvider({
        apiKey: process.env.FAST2SMS_API_KEY,
        route: process.env.FAST2SMS_ROUTE || 'otp',
      });
    } else if (providerType === 'msg91') {
      this.activeProvider = new Msg91Provider({
        authKey: process.env.MSG91_AUTH_KEY,
        templateId: process.env.MSG91_TEMPLATE_ID,
      });
    } else if (providerType === 'twilio') {
      this.activeProvider = new TwilioSmsProvider({
        accountSid: process.env.TWILIO_ACCOUNT_SID,
        authToken: process.env.TWILIO_AUTH_TOKEN,
        fromNumber: process.env.TWILIO_PHONE_NUMBER,
      });
    } else {
      // Default fallback for TEST / DEMO / DEV environments
      this.activeProvider = new MockSmsProvider();
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
  static async sendOtp(phone: string, otp: string): Promise<boolean> {
    const result = await this.sendOtpWithResult(phone, otp);
    return result.success;
  }

  /**
   * Detailed send method returning provider result metadata.
   */
  static async sendOtpWithResult(phone: string, otp: string): Promise<SmsSendResult> {
    const provider = this.getProvider();
    const maskedPhone = maskPhoneNumber(phone);

    try {
      const result = await provider.sendOtp(phone, otp);

      if (result.success) {
        console.log(`[SmsService] OTP SMS accepted by ${provider.name} for ${maskedPhone} (msgId: ${result.messageId || 'ok'})`);
      } else {
        console.warn(`[SmsService] OTP SMS delivery failed via ${provider.name} for ${maskedPhone}: ${result.error}`);
      }

      return result;
    } catch (err: any) {
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
