import crypto from 'crypto';
import { v4 as uuidv4 } from 'uuid';
import { getQuery, runQuery, withTransaction } from '../config/database.js';
import { config } from '../config/app_config.js';

export type OtpDestinationType = 'EMAIL' | 'PHONE';

export type OtpPurpose =
  | 'REGISTRATION_EMAIL'
  | 'REGISTRATION_PHONE'
  | 'PASSWORD_RESET'
  | 'UPDATE_EMAIL'
  | 'UPDATE_PHONE';

export interface OtpRecord {
  id: string;
  user_id: string | null;
  destination: string;
  destination_type: OtpDestinationType;
  purpose: OtpPurpose;
  otp_hash: string;
  salt: string;
  expires_at: string;
  consumed_at: string | null;
  attempts: number;
  max_attempts: number;
  resend_after: string;
  ip_address: string | null;
  user_agent: string | null;
  created_at: string;
}

export interface IssueOtpResult {
  success: boolean;
  otp?: string; // Plaintext returned ONLY to calling delivery service; never sent to client API
  expiresInSeconds: number;
  resendCooldownSeconds: number;
  error?: string;
  retryAfterSeconds?: number;
}

export interface VerifyOtpResult {
  success: boolean;
  verified: boolean;
  error?: string;
  remainingAttempts?: number;
}

export class OtpService {
  private static readonly OTP_TTL_MS = 5 * 60 * 1000; // 5 minutes
  private static readonly RESEND_COOLDOWN_MS = 30 * 1000; // 30 seconds
  private static readonly MAX_ATTEMPTS = 5;

  /**
   * Computes a keyed HMAC digest over the destination, salt, plaintext OTP, and purpose.
   * Keyed HMAC prevents dictionary/rainbow table attacks over the 6-digit space.
   */
  private static computeHash(destination: string, salt: string, otp: string, purpose: OtpPurpose): string {
    const key = config.jwtSecret;
    return crypto
      .createHmac('sha256', key)
      .update(`${destination.toLowerCase().trim()}:${salt}:${otp.trim()}:${purpose}`)
      .digest('hex');
  }

  /**
   * Generates a cryptographically secure 6-digit OTP, records it in the database with a 5-minute
   * expiration, invalidates superseded codes, and enforces a 30-second cooldown.
   */
  static async issueOtp({
    destination,
    destinationType,
    purpose,
    userId = null,
    ip = null,
    userAgent = null,
  }: {
    destination: string;
    destinationType: OtpDestinationType;
    purpose: OtpPurpose;
    userId?: string | null;
    ip?: string | null;
    userAgent?: string | null;
  }): Promise<IssueOtpResult> {
    const cleanDestination = destination.toLowerCase().trim();
    const now = new Date();

    // 1. Check existing active code for resend cooldown
    const active = await getQuery<OtpRecord>(
      `SELECT * FROM otp_verifications 
       WHERE destination = ? AND purpose = ? AND consumed_at IS NULL 
       ORDER BY created_at DESC LIMIT 1`,
      [cleanDestination, purpose]
    );

    if (active) {
      const resendAfter = new Date(active.resend_after);
      if (resendAfter > now) {
        const remainingSeconds = Math.ceil((resendAfter.getTime() - now.getTime()) / 1000);
        return {
          success: false,
          error: `Please wait ${remainingSeconds} seconds before requesting another verification code.`,
          expiresInSeconds: Math.max(0, Math.ceil((new Date(active.expires_at).getTime() - now.getTime()) / 1000)),
          resendCooldownSeconds: remainingSeconds,
          retryAfterSeconds: remainingSeconds,
        };
      }
    }

    // 2. Generate 6-digit cryptographic random code (100000 - 999999)
    const otp = crypto.randomInt(100000, 1000000).toString();
    const salt = crypto.randomBytes(16).toString('hex');
    const otpHash = this.computeHash(cleanDestination, salt, otp, purpose);

    const expiresAt = new Date(now.getTime() + this.OTP_TTL_MS).toISOString();
    const resendAfter = new Date(now.getTime() + this.RESEND_COOLDOWN_MS).toISOString();
    const otpId = `otp_${uuidv4().substring(0, 8)}`;

    await withTransaction(async () => {
      // Invalidate any previous unconsumed codes for this destination & purpose
      await runQuery(
        `UPDATE otp_verifications 
         SET consumed_at = ? 
         WHERE destination = ? AND purpose = ? AND consumed_at IS NULL`,
        [now.toISOString(), cleanDestination, purpose]
      );

      // Insert fresh OTP verification record
      await runQuery(
        `INSERT INTO otp_verifications (
          id, user_id, destination, destination_type, purpose,
          otp_hash, salt, expires_at, consumed_at, attempts,
          max_attempts, resend_after, ip_address, user_agent, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL, 0, ?, ?, ?, ?, ?)`,
        [
          otpId,
          userId,
          cleanDestination,
          destinationType,
          purpose,
          otpHash,
          salt,
          expiresAt,
          this.MAX_ATTEMPTS,
          resendAfter,
          ip,
          userAgent,
          now.toISOString(),
        ]
      );
    });

    return {
      success: true,
      otp, // For internal delivery only
      expiresInSeconds: 300,
      resendCooldownSeconds: 30,
    };
  }

  /**
   * Concurrency-safe atomic verification of an OTP code.
   * Single-use: once verified, the record is immediately consumed.
   */
  static async verifyOtp({
    destination,
    purpose,
    otp,
    userId = null,
  }: {
    destination: string;
    purpose: OtpPurpose;
    otp: string;
    userId?: string | null;
  }): Promise<VerifyOtpResult> {
    const cleanDestination = destination.toLowerCase().trim();
    const cleanOtp = otp.trim();
    const now = new Date();

    return withTransaction(async () => {
      // Find latest unconsumed record for this destination & purpose
      const record = await getQuery<OtpRecord>(
        `SELECT * FROM otp_verifications 
         WHERE destination = ? AND purpose = ? AND consumed_at IS NULL 
         ORDER BY created_at DESC LIMIT 1`,
        [cleanDestination, purpose]
      );

      if (!record) {
        return {
          success: false,
          verified: false,
          error: 'Verification code has expired or is invalid. Please request a new code.',
        };
      }

      // Check expiration
      if (new Date(record.expires_at) < now) {
        await runQuery(`UPDATE otp_verifications SET consumed_at = ? WHERE id = ?`, [now.toISOString(), record.id]);
        return {
          success: false,
          verified: false,
          error: 'Verification code has expired. Please request a new code.',
        };
      }

      // Check max attempts
      if (record.attempts >= record.max_attempts) {
        await runQuery(`UPDATE otp_verifications SET consumed_at = ? WHERE id = ?`, [now.toISOString(), record.id]);
        return {
          success: false,
          verified: false,
          error: 'Too many incorrect attempts. This code has been invalidated. Please request a new code.',
        };
      }

      // User binding check (if bound)
      if (record.user_id && userId && record.user_id !== userId) {
        return {
          success: false,
          verified: false,
          error: 'This verification code was issued for a different account.',
        };
      }

      // Keyed HMAC constant-time comparison
      const candidateHash = this.computeHash(cleanDestination, record.salt, cleanOtp, purpose);
      const isMatch =
        candidateHash.length === record.otp_hash.length &&
        crypto.timingSafeEqual(Buffer.from(candidateHash), Buffer.from(record.otp_hash));

      if (!isMatch) {
        const nextAttempts = record.attempts + 1;
        const remaining = Math.max(0, record.max_attempts - nextAttempts);

        if (nextAttempts >= record.max_attempts) {
          await runQuery(
            `UPDATE otp_verifications SET attempts = ?, consumed_at = ? WHERE id = ?`,
            [nextAttempts, now.toISOString(), record.id]
          );
          return {
            success: false,
            verified: false,
            error: 'Too many incorrect attempts. This code has been invalidated. Please request a new code.',
            remainingAttempts: 0,
          };
        } else {
          await runQuery(`UPDATE otp_verifications SET attempts = ? WHERE id = ?`, [nextAttempts, record.id]);
          return {
            success: false,
            verified: false,
            error: 'Invalid verification code. Please check and try again.',
            remainingAttempts: remaining,
          };
        }
      }

      // Valid match: Atomically mark consumed
      const updateResult = await runQuery(
        `UPDATE otp_verifications SET consumed_at = ? WHERE id = ? AND consumed_at IS NULL`,
        [now.toISOString(), record.id]
      );

      // Race condition check: ensure exactly one concurrent process consumed this row
      const changes = (updateResult as any)?.changes ?? (updateResult as any)?.rowCount ?? 1;
      if (changes === 0) {
        return {
          success: false,
          verified: false,
          error: 'Verification code has already been used.',
        };
      }

      // If this was for an existing user, update users.email_verified or users.phone_verified
      const targetUserId = userId || record.user_id;
      if (targetUserId) {
        if (purpose === 'REGISTRATION_EMAIL' || purpose === 'UPDATE_EMAIL') {
          await runQuery(`UPDATE users SET email_verified = 1 WHERE id = ?`, [targetUserId]);
        } else if (purpose === 'REGISTRATION_PHONE' || purpose === 'UPDATE_PHONE') {
          await runQuery(`UPDATE users SET phone = ?, phone_verified = 1 WHERE id = ?`, [cleanDestination, targetUserId]);
        }
      }

      return {
        success: true,
        verified: true,
      };
    });
  }

  /**
   * Verifies whether an email address has a valid consumed verification within the registration
   * window (15 minutes). Used by POST /auth/register to confirm pre-registration verification.
   */
  static async isEmailVerifiedForRegistration(email: string): Promise<boolean> {
    const cleanEmail = email.toLowerCase().trim();
    const fifteenMinutesAgo = new Date(Date.now() - 15 * 60 * 1000).toISOString();

    const verifiedRecord = await getQuery<{ id: string }>(
      `SELECT id FROM otp_verifications 
       WHERE destination = ? 
         AND purpose = 'REGISTRATION_EMAIL' 
         AND consumed_at IS NOT NULL 
         AND user_id IS NULL
         AND consumed_at >= ?
       ORDER BY consumed_at DESC LIMIT 1`,
      [cleanEmail, fifteenMinutesAgo]
    );

    return Boolean(verifiedRecord);
  }

  /**
   * Binds a newly registered user ID to the consumed pre-registration email verification record.
   */
  static async linkRegistrationUser(email: string, userId: string): Promise<void> {
    const cleanEmail = email.toLowerCase().trim();
    await runQuery(
      `UPDATE otp_verifications 
       SET user_id = ? 
       WHERE destination = ? AND purpose = 'REGISTRATION_EMAIL' AND user_id IS NULL`,
      [userId, cleanEmail]
    );
  }

  /**
   * Verifies whether a phone number has a valid consumed verification within the registration
   * window (15 minutes). Used by POST /auth/register to confirm pre-registration mobile verification.
   */
  static async isPhoneVerifiedForRegistration(phone: string): Promise<boolean> {
    const cleanPhone = phone.toLowerCase().trim();
    const fifteenMinutesAgo = new Date(Date.now() - 15 * 60 * 1000).toISOString();

    const verifiedRecord = await getQuery<{ id: string }>(
      `SELECT id FROM otp_verifications 
       WHERE destination = ? 
         AND purpose = 'REGISTRATION_PHONE' 
         AND consumed_at IS NOT NULL 
         AND user_id IS NULL
         AND consumed_at >= ?
       ORDER BY consumed_at DESC LIMIT 1`,
      [cleanPhone, fifteenMinutesAgo]
    );

    return Boolean(verifiedRecord);
  }

  /**
   * Binds a newly registered user ID to the consumed pre-registration phone verification record.
   */
  static async linkRegistrationPhoneUser(phone: string, userId: string): Promise<void> {
    const cleanPhone = phone.toLowerCase().trim();
    await runQuery(
      `UPDATE otp_verifications 
       SET user_id = ? 
       WHERE destination = ? AND purpose = 'REGISTRATION_PHONE' AND user_id IS NULL`,
      [userId, cleanPhone]
    );
  }

  /**
   * Maintenance cleanup of expired OTP records older than N days.
   */
  static async cleanupExpiredOtps(olderThanDays = 7): Promise<number> {
    const cutoff = new Date(Date.now() - olderThanDays * 24 * 60 * 60 * 1000).toISOString();
    const res = await runQuery(`DELETE FROM otp_verifications WHERE expires_at < ?`, [cutoff]);
    return (res as any)?.changes ?? (res as any)?.rowCount ?? 0;
  }
}
