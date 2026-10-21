import { ISmsProvider, SmsSendResult } from './sms_provider.interface.js';

export interface MockSmsEntry {
  phone: string;
  otp: string;
  timestamp: Date;
}

export class MockSmsProvider implements ISmsProvider {
  readonly name = 'MockSmsProvider';

  private sentMessages: MockSmsEntry[] = [];
  private simulateFailure = false;
  private failureError = 'Simulated SMS gateway failure';
  private simulateTimeout = false;

  async sendOtp(phone: string, otp: string): Promise<SmsSendResult> {
    if (this.simulateTimeout) {
      await new Promise((_, reject) => setTimeout(() => reject(new Error('SMS Gateway connection timed out')), 50));
    }

    if (this.simulateFailure) {
      return {
        success: false,
        providerName: this.name,
        error: this.failureError,
      };
    }

    this.sentMessages.push({
      phone,
      otp,
      timestamp: new Date(),
    });

    return {
      success: true,
      providerName: this.name,
      messageId: `mock_msg_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
    };
  }

  getLastSentOtp(phone?: string): string | undefined {
    if (phone) {
      const match = this.sentMessages.filter(m => m.phone === phone);
      return match[match.length - 1]?.otp;
    }
    return this.sentMessages[this.sentMessages.length - 1]?.otp;
  }

  getSentCount(phone?: string): number {
    if (phone) {
      return this.sentMessages.filter(m => m.phone === phone).length;
    }
    return this.sentMessages.length;
  }

  clear(): void {
    this.sentMessages = [];
    this.simulateFailure = false;
    this.simulateTimeout = false;
  }

  setSimulateFailure(fail: boolean, error?: string): void {
    this.simulateFailure = fail;
    if (error) this.failureError = error;
  }

  setSimulateTimeout(timeout: boolean): void {
    this.simulateTimeout = timeout;
  }
}
