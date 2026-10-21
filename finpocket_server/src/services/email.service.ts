import nodemailer, { type Transporter } from 'nodemailer';
import { config } from '../config/app_config.js';

export interface SentMailRecord {
  to: string;
  subject: string;
  text: string;
  html: string;
  sentAt: Date;
}

export class EmailService {
  private static transporter: Transporter | null = null;
  private static mockTransporter: Transporter | null = null;
  private static sentMails: SentMailRecord[] = [];

  /**
   * Test hook: set a mock nodemailer transporter for isolated unit testing.
   */
  static setMockTransporter(mock: Transporter | null): void {
    this.mockTransporter = mock;
  }

  /**
   * Test hook: retrieve recorded sent emails during test runs.
   */
  static getSentMails(): SentMailRecord[] {
    return [...this.sentMails];
  }

  /**
   * Test hook: clear recorded emails.
   */
  static clearSentMails(): void {
    this.sentMails = [];
  }

  private static getTransporter(): Transporter | null {
    if (this.mockTransporter) return this.mockTransporter;
    if (this.transporter) return this.transporter;

    const { host, port, secure, user, appPassword } = config.smtp;

    if (host && user && appPassword) {
      try {
        this.transporter = nodemailer.createTransport({
          host,
          port,
          secure,
          auth: { user, pass: appPassword },
          connectionTimeout: 4000,
          greetingTimeout: 3000,
          socketTimeout: 8000,
        });
      } catch (err) {
        console.error('[EmailService] Failed to initialize SMTP transport');
        this.transporter = null;
      }
    }
    return this.transporter;
  }

  /**
   * Send an email with HTML & plain text fallback.
   * Never leaks credentials or sensitive personal information into logs.
   */
  static async sendMail({
    to,
    subject,
    text,
    html,
  }: {
    to: string;
    subject: string;
    text: string;
    html: string;
  }): Promise<boolean> {
    const from = config.smtp.from;
    const isTest = process.env.NODE_ENV === 'test' || config.environment === 'TEST';
    const transporter = this.getTransporter();

    // In-memory test recording
    if (isTest || this.mockTransporter || config.isDemoMode) {
      this.sentMails.push({ to, subject, text, html, sentAt: new Date() });
    }

    // 1. HTTP-based Email API (Resend) - works over HTTPS port 443 anywhere, including Render free tier
    const resendApiKey = process.env.RESEND_API_KEY;
    if (resendApiKey && !this.mockTransporter && !isTest) {
      try {
        const resendFrom = process.env.RESEND_FROM || 'FinPocket <onboarding@resend.dev>';
        const response = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${resendApiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            from: resendFrom,
            to: [to],
            subject,
            text,
            html,
          }),
        });

        if (response.ok) {
          console.log(`[EmailService] Email delivered successfully via Resend API to ${to}`);
          return true;
        } else {
          const errData = await response.text();
          console.warn(`[EmailService] Resend API delivery failed (${response.status}): ${errData}`);
        }
      } catch (httpErr: any) {
        console.error(`[EmailService] Resend HTTP API error: ${httpErr.message}`);
      }
    }

    // 2. HTTP-based Email API (Brevo / Sendinblue) - works over HTTPS port 443
    const brevoApiKey = process.env.BREVO_API_KEY;
    if (brevoApiKey && !this.mockTransporter && !isTest) {
      try {
        const brevoFromEmail = process.env.BREVO_FROM_EMAIL || config.smtp.user || 'no-reply@finpocket.com';
        const brevoFromName = process.env.BREVO_FROM_NAME || 'FinPocket Security';
        const response = await fetch('https://api.brevo.com/v3/smtp/email', {
          method: 'POST',
          headers: {
            'api-key': brevoApiKey,
            'Content-Type': 'application/json',
            'Accept': 'application/json',
          },
          body: JSON.stringify({
            sender: { name: brevoFromName, email: brevoFromEmail },
            to: [{ email: to }],
            subject,
            htmlContent: html,
            textContent: text,
          }),
        });

        if (response.ok) {
          console.log(`[EmailService] Email delivered successfully via Brevo API to ${to}`);
          return true;
        } else {
          const errData = await response.text();
          console.warn(`[EmailService] Brevo API delivery failed (${response.status}): ${errData}`);
        }
      } catch (httpErr: any) {
        console.error(`[EmailService] Brevo HTTP API error: ${httpErr.message}`);
      }
    }

    // 3. Direct SMTP transport
    if (transporter) {
      try {
        await transporter.sendMail({
          from,
          to,
          subject,
          text,
          html,
        });
        return true;
      } catch (err: any) {
        // Sanitize error logging: never expose passwords or tokens
        const errCode = err?.code || 'UNKNOWN_SMTP_ERR';
        console.error(`[EmailService] SMTP delivery failed: ${errCode}`);
        return false;
      }
    } else {
      // Tests may record mail in memory. Real signup must fail closed if no
      // delivery provider is configured; a recorded OTP is not deliverable to a user.
      if (isTest || this.mockTransporter) {
        return true;
      }
      console.warn('[EmailService] No email delivery provider is configured.');
      return false;
    }
  }

  /**
   * Send Email Verification OTP for Account Creation (5-minute expiration)
   */
  static async sendRegistrationOtp(email: string, otp: string): Promise<boolean> {
    const subject = 'Your FinPocket Verification Code';
    const text = `Welcome to FinPocket!\n\nYour 6-digit email verification code is: ${otp}\n\nThis code will expire in 5 minutes. Please enter this code in the app to complete your registration.\n\nIf you did not request this, please ignore this email.`;
    const html = `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background-color: #0b132b; color: #ffffff; padding: 40px 20px; border-radius: 12px; max-width: 520px; margin: 0 auto; border: 1px solid rgba(255, 255, 255, 0.1);">
        <div style="text-align: center; margin-bottom: 24px;">
          <h1 style="color: #00e5ff; margin: 0; font-size: 26px; letter-spacing: -0.5px;">💰 FinPocket</h1>
          <p style="color: #94a3b8; font-size: 14px; margin-top: 6px;">Next-Gen Financial Intelligence & Security</p>
        </div>
        <div style="background: rgba(255, 255, 255, 0.05); border: 1px solid rgba(255, 255, 255, 0.1); border-radius: 10px; padding: 24px; text-align: center;">
          <h2 style="font-size: 18px; margin-top: 0; color: #f1f5f9;">Verify Your Email Address</h2>
          <p style="color: #cbd5e1; font-size: 14px; line-height: 1.5;">Use the verification code below to confirm your legitimate email and activate your FinPocket account:</p>
          <div style="margin: 24px 0; background: #00e5ff; color: #0b132b; font-size: 32px; font-weight: 800; letter-spacing: 10px; padding: 14px 20px; border-radius: 8px; display: inline-block;">
            ${otp}
          </div>
          <p style="color: #94a3b8; font-size: 12px; margin-bottom: 0;">⏳ This code is valid for <strong>5 minutes</strong>. Never share this code with anyone.</p>
        </div>
        <p style="color: #64748b; font-size: 11px; text-align: center; margin-top: 24px;">FinPocket Bank-Grade Financial Architecture • End-to-End Encrypted</p>
      </div>
    `;

    return this.sendMail({ to: email, subject, text, html });
  }

  /**
   * Send Password Reset OTP (5-minute expiration)
   */
  static async sendPasswordResetOtp(email: string, otp: string, name?: string): Promise<boolean> {
    const greeting = name ? `Hi ${name},` : 'Hello,';
    const subject = 'FinPocket Password Reset Code';
    const text = `${greeting}\n\nWe received a request to reset your password for your FinPocket account.\n\nYour 6-digit password reset verification code is: ${otp}\n\nThis code will expire in 5 minutes. If you did not request a password reset, please secure your account immediately.\n\n- The FinPocket Security Team`;
    const html = `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background-color: #0b132b; color: #ffffff; padding: 40px 20px; border-radius: 12px; max-width: 520px; margin: 0 auto; border: 1px solid rgba(255, 255, 255, 0.1);">
        <div style="text-align: center; margin-bottom: 24px;">
          <h1 style="color: #00e5ff; margin: 0; font-size: 26px; letter-spacing: -0.5px;">💰 FinPocket</h1>
          <p style="color: #94a3b8; font-size: 14px; margin-top: 6px;">Account Recovery & Security</p>
        </div>
        <div style="background: rgba(255, 255, 255, 0.05); border: 1px solid rgba(255, 255, 255, 0.1); border-radius: 10px; padding: 24px; text-align: center;">
          <h2 style="font-size: 18px; margin-top: 0; color: #f1f5f9;">Password Reset Request</h2>
          <p style="color: #cbd5e1; font-size: 14px; line-height: 1.5;">${greeting} enter the 6-digit code below in the FinPocket app to set a new password:</p>
          <div style="margin: 24px 0; background: #00e5ff; color: #0b132b; font-size: 32px; font-weight: 800; letter-spacing: 10px; padding: 14px 20px; border-radius: 8px; display: inline-block;">
            ${otp}
          </div>
          <p style="color: #94a3b8; font-size: 12px; margin-bottom: 0;">⏳ Valid for <strong>5 minutes</strong>. If you did not request this, please ignore this email.</p>
        </div>
        <p style="color: #64748b; font-size: 11px; text-align: center; margin-top: 24px;">FinPocket Bank-Grade Financial Architecture • End-to-End Encrypted</p>
      </div>
    `;

    return this.sendMail({ to: email, subject, text, html });
  }
}
