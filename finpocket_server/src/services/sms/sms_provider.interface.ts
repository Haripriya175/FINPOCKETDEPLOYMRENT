/**
 * FinPocket SMS Provider Interface
 * Defines the contract for pluggable SMS delivery providers (Fast2SMS, MSG91, Twilio, Mock).
 * Ensures zero vendor lock-in and isolates provider-specific API details.
 */

export interface SmsSendResult {
  success: boolean;
  providerName: string;
  messageId?: string;
  error?: string;
}

export interface ISmsProvider {
  readonly name: string;
  /**
   * Dispatches a 6-digit OTP verification SMS to a normalized Indian phone number (+91XXXXXXXXXX).
   * @param phone Normalized E.164 phone number (+91XXXXXXXXXX)
   * @param otp 6-digit plaintext OTP
   */
  sendOtp(phone: string, otp: string): Promise<SmsSendResult>;
}
