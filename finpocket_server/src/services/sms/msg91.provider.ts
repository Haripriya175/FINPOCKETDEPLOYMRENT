import { ISmsProvider, SmsSendResult } from './sms_provider.interface.js';
import { maskPhoneNumber } from '../../utils/security.validator.js';

export interface Msg91Config {
  authKey?: string;
  templateId?: string;
  timeoutMs?: number;
}

export class Msg91Provider implements ISmsProvider {
  readonly name = 'Msg91Provider';
  private readonly authKey?: string;
  private readonly templateId?: string;
  private readonly timeoutMs: number;

  constructor(config?: Msg91Config) {
    this.authKey = config?.authKey || process.env.MSG91_AUTH_KEY;
    this.templateId = config?.templateId || process.env.MSG91_TEMPLATE_ID;
    this.timeoutMs = config?.timeoutMs || 8000;
  }

  async sendOtp(phone: string, otp: string): Promise<SmsSendResult> {
    if (!this.authKey || !this.templateId) {
      return {
        success: false,
        providerName: this.name,
        error: 'MSG91 authKey or templateId is not configured.',
      };
    }

    // MSG91 SendOTP API requires 91XXXXXXXXXX or E.164 without leading plus
    const cleanMobile = phone.startsWith('+') ? phone.slice(1) : (phone.startsWith('91') ? phone : `91${phone}`);

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const url = `https://control.msg91.com/api/v5/otp?template_id=${encodeURIComponent(this.templateId)}&mobile=${encodeURIComponent(cleanMobile)}&otp=${encodeURIComponent(otp)}`;
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'authkey': this.authKey,
          'Content-Type': 'application/json',
        },
        signal: controller.signal,
      });

      clearTimeout(timeout);

      const data = (await response.json()) as any;

      if (!response.ok || data.type === 'error') {
        const errorMsg = data.message || `HTTP ${response.status}`;
        console.error(`[Msg91Provider] Delivery failed for ${maskPhoneNumber(phone)}: ${errorMsg}`);
        return {
          success: false,
          providerName: this.name,
          error: errorMsg,
        };
      }

      return {
        success: true,
        providerName: this.name,
        messageId: data.request_id || data.message || 'delivered',
      };
    } catch (err: any) {
      clearTimeout(timeout);
      const isTimeout = err?.name === 'AbortError' || err?.code === 'ETIMEDOUT';
      const errorMsg = isTimeout ? 'MSG91 gateway connection timed out.' : (err instanceof Error ? err.message : 'Unknown gateway error');
      console.error(`[Msg91Provider] Network/API error for ${maskPhoneNumber(phone)}: ${errorMsg}`);
      return {
        success: false,
        providerName: this.name,
        error: errorMsg,
      };
    }
  }
}
