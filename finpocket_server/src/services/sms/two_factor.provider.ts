import { ISmsProvider, SmsSendResult } from './sms_provider.interface.js';
import { maskPhoneNumber } from '../../utils/security.validator.js';

export interface TwoFactorConfig {
  apiKey?: string;
  timeoutMs?: number;
}

/**
 * 2Factor.in SMS Provider
 * High-delivery Indian OTP SMS gateway operating over HTTPS REST API.
 */
export class TwoFactorSmsProvider implements ISmsProvider {
  readonly name = 'TwoFactorSmsProvider';
  private readonly apiKey?: string;
  private readonly timeoutMs: number;

  constructor(config?: TwoFactorConfig) {
    this.apiKey = config?.apiKey || process.env.TWOFACTOR_API_KEY;
    this.timeoutMs = config?.timeoutMs || 8000;
  }

  async sendOtp(phone: string, otp: string): Promise<SmsSendResult> {
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

      const data = (await response.json()) as any;

      if (data && data.Status === 'Success') {
        return {
          success: true,
          providerName: this.name,
          messageId: data.Details || 'delivered',
        };
      }

      const errorMsg = data?.Details || data?.Status || `HTTP ${response.status}`;
      console.warn(`[TwoFactorSmsProvider] Delivery failed for ${maskPhoneNumber(phone)}: ${errorMsg}`);
      return {
        success: false,
        providerName: this.name,
        error: errorMsg,
      };
    } catch (err: any) {
      clearTimeout(timeout);
      const isTimeout = err?.name === 'AbortError' || err?.code === 'ETIMEDOUT';
      const errorMsg = isTimeout ? '2Factor connection timed out.' : (err instanceof Error ? err.message : 'Unknown gateway error');
      console.error(`[TwoFactorSmsProvider] Network error for ${maskPhoneNumber(phone)}: ${errorMsg}`);
      return {
        success: false,
        providerName: this.name,
        error: errorMsg,
      };
    }
  }
}
