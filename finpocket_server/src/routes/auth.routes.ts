import { Request, Router, Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { v4 as uuidv4 } from 'uuid';
import { getQuery, runQuery } from '../config/database.js';
import { authMiddleware, AuthRequest, JWT_SECRET } from '../middleware/auth.middleware.js';
import { currentScope } from '../config/db/context.js';
import { config } from '../config/app_config.js';
import {
  validatePasswordPolicy,
  isDisposableEmail,
  maskPhoneNumber,
  maskName,
  normalizeIndianPhoneNumber,
} from '../utils/security.validator.js';
import { GoogleAuthService } from '../services/google_auth.service.js';
import { MetaAuthService } from '../services/meta_auth.service.js';
import { AppleAuthService } from '../services/apple_auth.service.js';
import { EmailService } from '../services/email.service.js';
import { SmsService } from '../services/sms/sms.service.js';
import { OtpService } from '../services/otp.service.js';
import { verifyTurnstileToken } from '../services/turnstile.service.js';

const router = Router();

// In-memory brute-force attempt tracker: email -> { attempts, lockedUntil }
const loginAttempts = new Map<string, { attempts: number; lockedUntil: number }>();

// In-memory password reset store: cleanEmail -> { otp, expiresAt, attempts, userId }
const passwordResetStore = new Map<string, { otp: string; expiresAt: number; attempts: number; userId: string }>();



function sanitizeUser(user: any) {
  return {
    id: user.id,
    name: user.name,
    maskedName: maskName(user.name),
    email: user.email,
    phone: user.phone,
    maskedPhone: maskPhoneNumber(user.phone),
    isPhoneVerified: user.phone_verified === 1,
    isEmailVerified: user.email_verified === 1,
    ssoProvider: user.sso_provider || null,
    preferredCurrency: user.preferred_currency,
    preferredLanguage: user.preferred_language,
    monthlyIncome: user.monthly_income,
    savingsTarget: user.savings_target_percentage,
    emergencyReserveTarget: user.emergency_reserve_target,
    dailyPaymentLimit: user.daily_payment_limit,
    perTxnPaymentLimit: user.per_txn_payment_limit,
    monthlyPaymentLimit: user.monthly_payment_limit,
    biometricsEnabled: user.biometrics_enabled === 1,
    appPinEnabled: !!user.app_pin_hash,
    // The user's own UPI VPA (from their PhonePe/GPay/Paytm). Null until they
    // enter it — we never invent one. Receive uses it to build the QR.
    upiId: user.upi_id || null,
    createdAt: user.created_at
  };
}

function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

async function requireSignupCaptcha(req: Request, res: Response, token: unknown): Promise<boolean> {
  // In the explicitly enabled local OTP demo, the web app presents a local
  // checkbox and doesn't depend on Cloudflare or network access.
  if (config.environment === 'DEVELOPMENT' && process.env.DEV_EXPOSE_OTP === 'true') return true;

  const verification = await verifyTurnstileToken(token, req.ip);
  if (verification.success) return true;

  const unavailable = verification.reason === 'not_configured' || verification.reason === 'provider_unavailable';
  res.status(unavailable ? 503 : 400).json({
    error: unavailable
      ? 'Security verification is temporarily unavailable. Please retry shortly.'
      : 'Security verification failed. Please complete the CAPTCHA and try again.',
  });
  return false;
}

// 1. REGISTER
router.post('/register', async (req, res: Response): Promise<void> => {
  try {
    const { name, email, password, phone, captchaToken } = req.body;
    if (!name || !email || !password) {
      res.status(400).json({ error: 'Name, email, and password are required.' });
      return;
    }
    // 1. Legitimate Email Verification (Block temporary/disposable domains)
    const cleanEmail = email.toLowerCase().trim();
    if (isDisposableEmail(cleanEmail)) {
      res.status(400).json({
        error: 'Temporary and disposable email addresses are not permitted. Please use a legitimate personal or business email address (e.g. Gmail, Outlook, Yahoo, or your company domain).'
      });
      return;
    }
    const localOtpDevelopment = config.environment === 'DEVELOPMENT' && process.env.DEV_EXPOSE_OTP === 'true';
    if (!localOtpDevelopment && !await requireSignupCaptcha(req, res, captchaToken)) return;

    // 1b. Enforce Email OTP Verification
    const isEmailVerified = await OtpService.isEmailVerifiedForRegistration(cleanEmail);
    if (!isEmailVerified) {
      res.status(400).json({
        error: 'Please verify your email address with the OTP code sent to your inbox before creating your account.'
      });
      return;
    }

    // 1c. Enforce Phone OTP Verification if phone is provided
    let cleanPhone = '';
    if (phone && typeof phone === 'string' && phone.trim()) {
      const phoneValidation = normalizeIndianPhoneNumber(phone);
      if (!phoneValidation.isValid || !phoneValidation.normalized) {
        res.status(400).json({
          error: phoneValidation.error || 'Please enter a valid 10-digit Indian mobile number.'
        });
        return;
      }
      cleanPhone = phoneValidation.normalized;

      const isPhoneVerified = await OtpService.isPhoneVerifiedForRegistration(cleanPhone);
      if (!isPhoneVerified) {
        res.status(400).json({
          error: 'Please verify your mobile phone number with the OTP code before creating your account.'
        });
        return;
      }
    }

    // 2. Strong Password Policy Enforcement
    const policy = validatePasswordPolicy(password, { name, email }, {
      // Local OTP demo users can use their chosen password even if it includes
      // their email username; production keeps the full personal-info check.
      allowEmailUsername: config.environment === 'DEVELOPMENT' && process.env.DEV_EXPOSE_OTP === 'true',
    });
    if (!policy.isValid) {
      res.status(400).json({
        error: policy.errors[0],
        details: policy.errors,
        strength: policy.strengthLabel
      });
      return;
    }

    const existing = await getQuery('SELECT id FROM users WHERE email = ?', [cleanEmail]);
    if (existing) {
      res.status(409).json({ error: 'An account with this email already exists.' });
      return;
    }

    const userId = `usr_${uuidv4().substring(0, 8)}`;
    const passwordHash = await bcrypt.hash(password, 10);

    // Phase D RLS: this request now owns the brand-new identity — bind the
    // transaction's user context BEFORE any per-user row is written
    // (emergency_funds below, session/device rows, USER_REGISTERED audit) so
    // every insert passes its WITH CHECK clause. No scope (SQLite) → no-op.
    const scope = currentScope();
    if (scope) {
      await scope.client.query(`SELECT set_config('app.current_user_id', $1, true)`, [userId]);
      scope.userId = userId;
    }

    await runQuery(`
      INSERT INTO users (id, name, email, phone, phone_verified, email_verified, password_hash)
      VALUES (?, ?, ?, ?, ?, 1, ?)
    `, [userId, name.trim(), cleanEmail, cleanPhone, cleanPhone ? 1 : 0, passwordHash]);

    // Bind registration verification record to this newly created user ID
    await OtpService.linkRegistrationUser(cleanEmail, userId);
    if (cleanPhone) {
      await OtpService.linkRegistrationPhoneUser(cleanPhone, userId);
    }

    // A new account starts with NO bank account and a ₹0 balance. The user
    // connects a real bank through the Account Aggregator flow (or imports real
    // bank SMS) and only then does anything appear here.
    //
    // This used to insert a fake 'FinPocket Primary Wallet' (FP01 / •••• 1001).
    // It produced 27 phantom accounts in the database, showed demo balances as
    // if they were real money, broke QR/UPI receive because no bank backs that
    // pseudo-VPA, and duplicated real institutions on the dashboard.
    //
    // Emergency savings still start at ₹0 saved toward the user's goal.

    await runQuery(`
      INSERT INTO emergency_funds (id, user_id, target_amount, current_amount, monthly_contribution)
      VALUES (?, ?, 100000.0, 0.0, 0.0)
    `, [`emf_${uuidv4().substring(0, 8)}`, userId]);

    // Register device and session
    const deviceId = `dev_${uuidv4().substring(0, 8)}`;
    await runQuery(`
      INSERT INTO devices (id, user_id, device_name, ip_address)
      VALUES (?, ?, 'Registered Device', ?)
    `, [deviceId, userId, req.ip || '127.0.0.1']);

    const sessionId = `sess_${uuidv4().substring(0, 8)}`;
    const rawRefreshToken = crypto.randomBytes(40).toString('hex');
    const refreshTokenHash = hashToken(rawRefreshToken);
    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(); // 30 days

    await runQuery(`
      INSERT INTO sessions (id, user_id, device_id, refresh_token_hash, expires_at, is_revoked)
      VALUES (?, ?, ?, ?, ?, 0)
    `, [sessionId, userId, deviceId, refreshTokenHash, expiresAt]);

    // Short-lived access token (15 mins)
    const token = jwt.sign({ userId, email, sessionId }, JWT_SECRET, { expiresIn: '15m' });

    await runQuery(`
      INSERT INTO audit_logs (id, user_id, action, metadata)
      VALUES (?, ?, 'USER_REGISTERED', ?)
    `, [uuidv4(), userId, JSON.stringify({ email, name })]);

    const createdUser = await getQuery<any>('SELECT * FROM users WHERE id = ?', [userId]);

    res.status(201).json({
      token,
      refreshToken: rawRefreshToken,
      deviceId,
      sessionId,
      user: sanitizeUser(createdUser || {
        id: userId,
        name: name.trim(),
        email: cleanEmail,
        phone: cleanPhone,
        phone_verified: cleanPhone ? 1 : 0,
        email_verified: 1,
      })
    });
  } catch (err: any) {
    console.error('[auth] internal error:', err instanceof Error ? err.message : err);
    res.status(500).json({ error: 'Internal server error. Please try again.' });
  }
});

// 2. LOGIN (With brute-force protection & failed login audit logging)
router.post('/login', async (req, res: Response): Promise<void> => {
  try {
    const { email, password, deviceName } = req.body;
    if (!email || !password) {
      res.status(400).json({ error: 'Email and password are required.' });
      return;
    }

    const lowerEmail = email.toLowerCase();
    const now = Date.now();
    const attemptRecord = loginAttempts.get(lowerEmail);

    if (attemptRecord && attemptRecord.lockedUntil > now) {
      const waitSeconds = Math.ceil((attemptRecord.lockedUntil - now) / 1000);
      res.status(429).json({
        error: `Too many failed login attempts. Account temporarily locked for security. Try again in ${waitSeconds} seconds.`
      });
      return;
    }

    const user = await getQuery<any>('SELECT * FROM users WHERE email = ?', [lowerEmail]);
    let isValid = false;
    if (user) {
      isValid = await bcrypt.compare(password, user.password_hash);
    }

    if (!user || !isValid) {
      // Record failed attempt
      const prevAttempts = (attemptRecord && attemptRecord.lockedUntil <= now) ? 0 : (attemptRecord?.attempts || 0);
      const newAttempts = prevAttempts + 1;
      const lockedUntil = newAttempts >= 5 ? now + 15 * 60 * 1000 : 0; // 15 mins lock after 5 fails

      loginAttempts.set(lowerEmail, { attempts: newAttempts, lockedUntil });

      // Audit log failed attempt (NEVER store password or attempt text)
      if (user) {
        await runQuery(`
          INSERT INTO audit_logs (id, user_id, action, metadata)
          VALUES (?, ?, 'LOGIN_FAILED', ?)
        `, [uuidv4(), user.id, JSON.stringify({ ip: req.ip, attempts: newAttempts, reason: 'INVALID_CREDENTIALS' })]);
      }

      res.status(401).json({ error: 'Invalid email or password.' });
      return;
    }

    // Success -> Clear failed attempts
    loginAttempts.delete(lowerEmail);

    // Phase D RLS: bind THIS request's transaction to the authenticated user
    const scope = currentScope();
    if (scope) {
      await scope.client.query(`SELECT set_config('app.current_user_id', $1, true)`, [user.id]);
      scope.userId = user.id;
    }

    // Device tracking
    const deviceId = `dev_${uuidv4().substring(0, 8)}`;
    const dName = deviceName || 'Android Mobile Client';
    await runQuery(`
      INSERT INTO devices (id, user_id, device_name, ip_address)
      VALUES (?, ?, ?, ?)
    `, [deviceId, user.id, dName, req.ip || '127.0.0.1']);

    // Create session & refresh token
    const sessionId = `sess_${uuidv4().substring(0, 8)}`;
    const rawRefreshToken = crypto.randomBytes(40).toString('hex');
    const refreshTokenHash = hashToken(rawRefreshToken);
    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();

    await runQuery(`
      INSERT INTO sessions (id, user_id, device_id, refresh_token_hash, expires_at, is_revoked)
      VALUES (?, ?, ?, ?, ?, 0)
    `, [sessionId, user.id, deviceId, refreshTokenHash, expiresAt]);

    // Short-lived access token (15 mins)
    const token = jwt.sign({ userId: user.id, email: user.email, sessionId }, JWT_SECRET, { expiresIn: '15m' });

    await runQuery(`
      INSERT INTO audit_logs (id, user_id, action, metadata)
      VALUES (?, ?, 'USER_LOGIN', ?)
    `, [uuidv4(), user.id, JSON.stringify({ device: dName, ip: req.ip, sessionId })]);

    res.json({
      token,
      refreshToken: rawRefreshToken,
      deviceId,
      sessionId,
      user: sanitizeUser(user)
    });
  } catch (err: any) {
    console.error('[auth] internal error:', err instanceof Error ? err.message : err);
    res.status(500).json({ error: 'Internal server error. Please try again.' });
  }
});

// 3. REFRESH TOKEN (With rotation & reuse detection)
router.post('/refresh', async (req, res: Response): Promise<void> => {
  try {
    const { refreshToken } = req.body;
    if (!refreshToken) {
      res.status(400).json({ error: 'Refresh token is required.' });
      return;
    }

    const incomingHash = hashToken(refreshToken);
    const session = await getQuery<any>('SELECT * FROM sessions WHERE refresh_token_hash = ?', [incomingHash]);

    if (!session) {
      res.status(401).json({ error: 'Invalid refresh token.' });
      return;
    }

    // Phase D RLS: bind session user context before updating sessions/audits
    const scope = currentScope();
    if (scope) {
      await scope.client.query(`SELECT set_config('app.current_user_id', $1, true)`, [session.user_id]);
      scope.userId = session.user_id;
    }

    // Reuse Detection: If session was already revoked, someone is trying to reuse a rotated/revoked token!
    if (session.is_revoked === 1) {
      // Immediate security containment: Revoke all active sessions for this user
      await runQuery('UPDATE sessions SET is_revoked = 1 WHERE user_id = ?', [session.user_id]);
      await runQuery(`
        INSERT INTO audit_logs (id, user_id, action, metadata)
        VALUES (?, ?, 'SECURITY_ALERT_REFRESH_REUSE', ?)
      `, [uuidv4(), session.user_id, JSON.stringify({ ip: req.ip, attemptedSession: session.id })]);

      res.status(401).json({
        error: 'Revoked refresh token reuse detected! All user sessions have been terminated for security. Please re-login.'
      });
      return;
    }

    // Check expiration
    if (new Date(session.expires_at) < new Date()) {
      res.status(401).json({ error: 'Refresh token expired. Please login again.' });
      return;
    }

    const user = await getQuery<any>('SELECT * FROM users WHERE id = ?', [session.user_id]);
    if (!user) {
      res.status(401).json({ error: 'User not found.' });
      return;
    }

    // ROTATE REFRESH TOKEN: Invalidate old token and issue new pair
    const newRawRefreshToken = crypto.randomBytes(40).toString('hex');
    const newRefreshTokenHash = hashToken(newRawRefreshToken);
    const newExpiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();

    await runQuery(`
      UPDATE sessions 
      SET refresh_token_hash = ?, expires_at = ?
      WHERE id = ?
    `, [newRefreshTokenHash, newExpiresAt, session.id]);

    const newAccessToken = jwt.sign(
      { userId: user.id, email: user.email, sessionId: session.id },
      JWT_SECRET,
      { expiresIn: '15m' }
    );

    await runQuery(`
      INSERT INTO audit_logs (id, user_id, action, metadata)
      VALUES (?, ?, 'TOKEN_ROTATED', ?)
    `, [uuidv4(), user.id, JSON.stringify({ sessionId: session.id })]);

    res.json({
      token: newAccessToken,
      refreshToken: newRawRefreshToken
    });
  } catch (err: any) {
    console.error('[auth] internal error:', err instanceof Error ? err.message : err);
    res.status(500).json({ error: 'Internal server error. Please try again.' });
  }
});

// 4. LOGOUT (Server-side session revocation)
router.post('/logout', authMiddleware, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (req.sessionId) {
      await runQuery('UPDATE sessions SET is_revoked = 1 WHERE id = ?', [req.sessionId]);
    } else {
      // Invalidate all active sessions for this user if no specific session id
      await runQuery('UPDATE sessions SET is_revoked = 1 WHERE user_id = ?', [req.user!.id]);
    }

    await runQuery(`
      INSERT INTO audit_logs (id, user_id, action, metadata)
      VALUES (?, ?, 'USER_LOGOUT', ?)
    `, [uuidv4(), req.user!.id, JSON.stringify({ sessionId: req.sessionId })]);

    res.json({ success: true, message: 'Logged out successfully. Session revoked.' });
  } catch (err: any) {
    console.error('[auth] internal error:', err instanceof Error ? err.message : err);
    res.status(500).json({ error: 'Internal server error. Please try again.' });
  }
});

// 5. FORGOT PASSWORD (Sends 6-digit reset OTP to registered email)
router.post('/forgot-password', async (req, res: Response): Promise<void> => {
  try {
    const { email } = req.body;
    if (!email || typeof email !== 'string' || !email.includes('@')) {
      res.status(400).json({ error: 'Valid registered email address is required.' });
      return;
    }
    const cleanEmail = email.toLowerCase().trim();

    const user = await getQuery<any>('SELECT id, name, email FROM users WHERE email = ?', [cleanEmail]);
    if (!user) {
      res.status(404).json({ error: 'No FinPocket account found with this email address.' });
      return;
    }

    const now = Date.now();
    const existing = passwordResetStore.get(cleanEmail);
    if (existing && existing.expiresAt > now && (now - (existing.expiresAt - 10 * 60 * 1000)) < 25000) {
      res.status(429).json({ error: 'Please wait 25 seconds before requesting another reset code.' });
      return;
    }

    const otp = crypto.randomInt(100000, 1000000).toString();
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString(); // 10 minutes
    const tokenHash = hashToken(otp);

    passwordResetStore.set(cleanEmail, { otp, expiresAt: Date.now() + 10 * 60 * 1000, attempts: 0, userId: user.id });

    await runQuery(`
      UPDATE users 
      SET password_reset_token = ?, password_reset_expires = ?
      WHERE id = ?
    `, [tokenHash, expiresAt, user.id]);

    await runQuery(`
      INSERT INTO audit_logs (id, user_id, action, metadata)
      VALUES (?, ?, 'PASSWORD_RESET_REQUESTED', ?)
    `, [uuidv4(), user.id, JSON.stringify({ ip: req.ip })]);

    const emailSent = await EmailService.sendPasswordResetOtp(cleanEmail, otp, user.name);
    if (!emailSent) {
      res.status(500).json({ error: 'Failed to send password reset email. Please try again later.' });
      return;
    }

    res.json({
      success: true,
      message: 'Password reset verification code has been sent to your email.'
    });
  } catch (err: any) {
    console.error('[auth] internal error in forgot-password:', err instanceof Error ? err.message : err);
    res.status(500).json({ error: 'Internal server error. Please try again.' });
  }
});

// 6. RESET PASSWORD (Verifies 6-digit email OTP and updates password)
router.post('/reset-password', async (req, res: Response): Promise<void> => {
  try {
    const { email, token, newPassword } = req.body;
    if (!token || !newPassword || newPassword.length < 6) {
      res.status(400).json({ error: 'Reset verification code and new password (min 6 chars) are required.' });
      return;
    }

    // Enforce strong password policy on password reset
    const policy = validatePasswordPolicy(newPassword, { email: email || '' });
    if (!policy.isValid) {
      res.status(400).json({
        error: policy.errors[0],
        details: policy.errors,
        strength: policy.strengthLabel
      });
      return;
    }

    let targetUserId: string | null = null;
    const cleanToken = token.trim();
    const cleanEmail = email ? email.toLowerCase().trim() : null;

    // 1. Check in-memory store first
    if (cleanEmail && passwordResetStore.has(cleanEmail)) {
      const record = passwordResetStore.get(cleanEmail)!;
      if (record.expiresAt < Date.now()) {
        res.status(400).json({ error: 'Reset verification code has expired. Please request a new one.' });
        return;
      }
      if (record.otp !== cleanToken) {
        record.attempts += 1;
        if (record.attempts >= 5) {
          passwordResetStore.delete(cleanEmail);
          res.status(429).json({ error: 'Too many incorrect attempts. Please request a new reset code.' });
          return;
        }
        res.status(400).json({ error: 'Invalid verification code. Please check and try again.' });
        return;
      }
      targetUserId = record.userId;
      passwordResetStore.delete(cleanEmail);
    }

    // 2. Fallback to database lookup by token hash
    if (!targetUserId) {
      const tokenHash = hashToken(cleanToken);
      const user = await getQuery<any>(
        'SELECT id, password_reset_expires FROM users WHERE password_reset_token = ?',
        [tokenHash]
      );
      if (user && new Date(user.password_reset_expires) >= new Date()) {
        targetUserId = user.id;
      }
    }

    if (!targetUserId) {
      res.status(400).json({ error: 'Invalid or expired password reset verification code.' });
      return;
    }

    // Phase D RLS: bind target user context before updating sessions/audits
    const scope = currentScope();
    if (scope) {
      await scope.client.query(`SELECT set_config('app.current_user_id', $1, true)`, [targetUserId]);
      scope.userId = targetUserId;
    }

    const newPasswordHash = await bcrypt.hash(newPassword, 10);
    await runQuery(`
      UPDATE users 
      SET password_hash = ?, password_reset_token = NULL, password_reset_expires = NULL
      WHERE id = ?
    `, [newPasswordHash, targetUserId]);

    // Revoke all existing sessions for this user on password change
    await runQuery('UPDATE sessions SET is_revoked = 1 WHERE user_id = ?', [targetUserId]);

    await runQuery(`
      INSERT INTO audit_logs (id, user_id, action, metadata)
      VALUES (?, ?, 'PASSWORD_RESET_COMPLETED', ?)
    `, [uuidv4(), targetUserId, JSON.stringify({ ip: req.ip })]);

    res.json({
      success: true,
      message: 'Password has been reset successfully. Please log in with your new password.'
    });
  } catch (err: any) {
    console.error('[auth] internal error in reset-password:', err instanceof Error ? err.message : err);
    res.status(500).json({ error: 'Internal server error. Please try again.' });
  }
});

// 7. GET /me (Current Authenticated User)
router.get('/me', authMiddleware, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const user = await getQuery<any>('SELECT * FROM users WHERE id = ?', [req.user!.id]);
    if (!user) {
      res.status(404).json({ error: 'User not found' });
      return;
    }

    res.json({ user: sanitizeUser(user) });
  } catch (err: any) {
    console.error('[auth] internal error:', err instanceof Error ? err.message : err);
    res.status(500).json({ error: 'Internal server error. Please try again.' });
  }
});

// 8. SET / REPLACE MY REAL UPI ID
//
// FinPocket is not a Payment Service Provider, so it cannot issue a UPI ID.
// Receive works by having the user type the UPI ID they already own, then
// encoding *that* into the QR. We validate the format server-side so a typo
// never turns into a QR that no bank will accept.
router.put('/upi-id', authMiddleware, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const raw = String(req.body?.upiId ?? '').trim().toLowerCase();

    if (!raw) {
      res.status(400).json({ error: 'UPI ID is required.' });
      return;
    }
    if (raw.length > 256 || !/^[a-z0-9.\-_]{2,256}@[a-z0-9.\-]{2,64}$/.test(raw)) {
      res.status(400).json({
        error: 'Enter the UPI ID from your UPI app, e.g. 9876543210@okaxis or yourname@ybl.'
      });
      return;
    }
    // These are handles we previously generated ourselves. They are not real
    // VPAs and accepting them would recreate the broken QR.
    if (raw.endsWith('@upi')) {
      res.status(400).json({
        error: '"@upi" is not a real UPI ID. Use the UPI ID shown in your PhonePe / Google Pay / Paytm app.'
      });
      return;
    }

    await runQuery('UPDATE users SET upi_id = ? WHERE id = ?', [raw, req.user!.id]);

    await runQuery(`
      INSERT INTO audit_logs (id, user_id, action, metadata)
      VALUES (?, ?, 'UPI_ID_UPDATED', ?)
    `, [uuidv4(), req.user!.id, JSON.stringify({ upiId: raw, ip: req.ip })]);

    res.json({ success: true, upiId: raw });
  } catch (err: any) {
    console.error('[auth] internal error:', err instanceof Error ? err.message : err);
    res.status(500).json({ error: 'Internal server error. Please try again.' });
  }
});

// 9. UPDATE PIN (Stored with bcrypt hashing, never plaintext)
router.post('/update-pin', authMiddleware, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { newPin } = req.body;
    if (!newPin || newPin.length < 4) {
      res.status(400).json({ error: 'PIN must be at least 4 digits.' });
      return;
    }

    const pinHash = await bcrypt.hash(newPin, 10);
    await runQuery('UPDATE users SET app_pin_hash = ? WHERE id = ?', [pinHash, req.user!.id]);

    // Audit log without PIN value
    await runQuery(`
      INSERT INTO audit_logs (id, user_id, action, metadata)
      VALUES (?, ?, 'PIN_UPDATED', ?)
    `, [uuidv4(), req.user!.id, JSON.stringify({ ip: req.ip })]);

    res.json({ success: true, message: 'App PIN updated and hashed securely with bcrypt.' });
  } catch (err: any) {
    console.error('[auth] internal error:', err instanceof Error ? err.message : err);
    res.status(500).json({ error: 'Internal server error. Please try again.' });
  }
});

// 9b. VERIFY PIN — the bcrypt digest never leaves the server, so every client
// PIN gate (child-care mode, emergency lock, savings actions) validates here
// instead of against a fabricated local value. Rate-limited like login.
router.post('/pin/verify', authMiddleware, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { pin } = req.body;
    if (!pin || typeof pin !== 'string') {
      res.status(400).json({ error: 'PIN is required.' });
      return;
    }

    const user = await getQuery<any>('SELECT app_pin_hash FROM users WHERE id = ?', [req.user!.id]);
    if (!user?.app_pin_hash) {
      // No PIN configured: there is nothing to verify (matches the savings
      // withdraw semantics — an unset PIN does not gate actions).
      res.json({ valid: true, pinConfigured: false });
      return;
    }

    const valid = await bcrypt.compare(pin, user.app_pin_hash);
    res.json({ valid, pinConfigured: true });
  } catch (err: any) {
    console.error('[auth] internal error:', err instanceof Error ? err.message : err);
    res.status(500).json({ error: 'Internal server error. Please try again.' });
  }
});

// 9. PHONE AUTH: SEND OTP (6-digit verification code with rate limiting & SMS delivery)
router.post('/phone/send-otp', async (req, res: Response): Promise<void> => {
  try {
    const { phone, captchaToken } = req.body;
    const phoneValidation = normalizeIndianPhoneNumber(phone);
    if (!phoneValidation.isValid || !phoneValidation.normalized) {
      res.status(400).json({
        error: phoneValidation.error || 'Valid Indian mobile phone number (+91) is required.'
      });
      return;
    }
    const cleanPhone = phoneValidation.normalized;

    // Check optional bearer token for authenticated phone updates
    let authenticatedUserId: string | undefined;
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      try {
        const decoded = jwt.verify(authHeader.slice(7), JWT_SECRET) as { userId?: string };
        if (decoded.userId) authenticatedUserId = decoded.userId;
      } catch { }
    }

    const bindUserId = authenticatedUserId || (typeof req.body.userId === 'string' && req.body.userId ? req.body.userId : null);
    const purpose = bindUserId ? 'UPDATE_PHONE' : 'REGISTRATION_PHONE';
    if (!authenticatedUserId && !await requireSignupCaptcha(req, res, captchaToken)) return;

    const issueRes = await OtpService.issueOtp({
      destination: cleanPhone,
      destinationType: 'PHONE',
      purpose,
      userId: bindUserId,
      ip: req.ip || null,
      userAgent: (req.headers['user-agent'] as string) || null,
    });

    if (!issueRes.success) {
      res.status(429).json({
        error: issueRes.error || 'Please wait before requesting another verification code.',
        retryAfterSeconds: issueRes.retryAfterSeconds,
        expiresInSeconds: issueRes.expiresInSeconds,
      });
      return;
    }

    const delivered = await SmsService.sendOtp(cleanPhone, issueRes.otp!);
    if (!delivered) {
      res.status(500).json({ error: 'Failed to deliver SMS verification code. Please try again later.' });
      return;
    }

    res.json({
      success: true,
      message: 'Verification code sent successfully.',
      maskedPhone: maskPhoneNumber(cleanPhone),
      expiresInSeconds: issueRes.expiresInSeconds,
      resendCooldownSeconds: issueRes.resendCooldownSeconds,
    });
  } catch (err: any) {
    console.error('[auth] internal error in phone/send-otp:', err instanceof Error ? err.message : err);
    res.status(500).json({ error: 'Internal server error. Please try again.' });
  }
});

// 10. PHONE AUTH: VERIFY OTP
router.post('/phone/verify-otp', async (req, res: Response): Promise<void> => {
  try {
    const { phone, otp, userId } = req.body;
    if (!phone || !otp) {
      res.status(400).json({ error: 'Phone and verification code are required.' });
      return;
    }

    const phoneValidation = normalizeIndianPhoneNumber(phone);
    if (!phoneValidation.isValid || !phoneValidation.normalized) {
      res.status(400).json({
        error: phoneValidation.error || 'Valid Indian mobile phone number (+91) is required.'
      });
      return;
    }
    const cleanPhone = phoneValidation.normalized;

    // Caller identity: check bearer token
    let authenticatedUserId: string | undefined;
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      try {
        const decoded = jwt.verify(authHeader.slice(7), JWT_SECRET) as { userId?: string };
        if (decoded.userId) authenticatedUserId = decoded.userId;
      } catch { }
    }

    let targetUserId: string | null = null;
    if (authenticatedUserId) {
      targetUserId = authenticatedUserId;
    } else if (userId && typeof userId === 'string') {
      targetUserId = userId;
    }

    const primaryPurpose = targetUserId ? 'UPDATE_PHONE' : 'REGISTRATION_PHONE';
    let verifyRes = await OtpService.verifyOtp({
      destination: cleanPhone,
      purpose: primaryPurpose,
      otp: String(otp).trim(),
      userId: targetUserId,
    });

    // Fallback if purpose was REGISTRATION_PHONE but user is now passing userId or vice versa
    if (!verifyRes.success && verifyRes.remainingAttempts !== 0) {
      const fallbackPurpose = targetUserId ? 'REGISTRATION_PHONE' : 'UPDATE_PHONE';
      const fallbackRes = await OtpService.verifyOtp({
        destination: cleanPhone,
        purpose: fallbackPurpose,
        otp: String(otp).trim(),
        userId: targetUserId,
      });
      if (fallbackRes.success) {
        verifyRes = fallbackRes;
      }
    }

    if (!verifyRes.success) {
      const statusCode = verifyRes.remainingAttempts === 0 ? 429 : 400;
      res.status(statusCode).json({
        error: verifyRes.error || 'Invalid verification code. Please check and try again.',
        remainingAttempts: verifyRes.remainingAttempts,
      });
      return;
    }

    res.json({
      success: true,
      verified: true,
      message: 'Phone number verified successfully.',
    });
  } catch (err: any) {
    console.error('[auth] internal error in phone/verify-otp:', err instanceof Error ? err.message : err);
    res.status(500).json({ error: 'Internal server error. Please try again.' });
  }
});

// 11. FEDERATED AUTHENTICATION: GOOGLE SSO (ID TOKEN VERIFICATION & IDENTITY MAPPING)
router.post('/google', async (req, res: Response): Promise<void> => {
  try {
    const { idToken, deviceName } = req.body;

    if (!idToken || typeof idToken !== 'string') {
      res.status(400).json({ error: 'Google ID token is required' });
      return;
    }

    // 1. Cryptographically verify Google ID token (signature, audience, issuer, exp, email_verified)
    let verifiedGoogleUser;
    try {
      verifiedGoogleUser = await GoogleAuthService.verifyIdToken(idToken);
    } catch (tokenErr: any) {
      res.status(401).json({ error: 'INVALID_GOOGLE_TOKEN', message: tokenErr.message });
      return;
    }

    // 2. Look up user by Google provider subject (sub)
    let user = await GoogleAuthService.findUserByGoogleSub(verifiedGoogleUser.sub);
    let isNewUser = false;

    if (!user) {
      // Check if user with this email already exists in FinPocket
      const existingUserByEmail = await getQuery<any>(
        'SELECT * FROM users WHERE email = ?',
        [verifiedGoogleUser.email]
      );

      if (existingUserByEmail) {
        // SECURITY PRECAUTION: Prevent automatic account takeover!
        // Require explicit account linking through existing authenticated session
        res.status(409).json({
          error: 'ACCOUNT_EXISTS_UNLINKED',
          message: 'An account with this email already exists. Please log in with your password to link your Google account.',
          email: verifiedGoogleUser.email,
        });
        return;
      }

      // Safe to create new FinPocket account for verified Google user
      user = await GoogleAuthService.createGoogleUser(verifiedGoogleUser);
      isNewUser = true;
    } else {
      // Existing Google-linked user: update last login time
      await runQuery(
        'UPDATE user_identities SET last_login_at = CURRENT_TIMESTAMP WHERE provider = ? AND provider_subject = ?',
        ['google', verifiedGoogleUser.sub]
      );
    }

    // 3. Issue FinPocket device, session, and JWT tokens
    const scope = currentScope();
    if (scope) {
      await scope.client.query(`SELECT set_config('app.current_user_id', $1, true)`, [user.id]);
      scope.userId = user.id;
    }

    const deviceId = `dev_${uuidv4().substring(0, 8)}`;
    await runQuery(`
      INSERT INTO devices (id, user_id, device_name, ip_address)
      VALUES (?, ?, ?, ?)
    `, [deviceId, user.id, deviceName || 'FinPocket Mobile (Google SSO)', req.ip || '127.0.0.1']);

    const sessionId = `sess_${uuidv4().substring(0, 8)}`;
    const rawRefreshToken = crypto.randomBytes(40).toString('hex');
    const refreshTokenHash = hashToken(rawRefreshToken);
    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();

    await runQuery(`
      INSERT INTO sessions (id, user_id, device_id, refresh_token_hash, expires_at, is_revoked)
      VALUES (?, ?, ?, ?, ?, 0)
    `, [sessionId, user.id, deviceId, refreshTokenHash, expiresAt]);

    const token = jwt.sign(
      { userId: user.id, email: user.email, sessionId },
      JWT_SECRET,
      { expiresIn: '15m' }
    );

    // Audit log
    await runQuery(`
      INSERT INTO audit_logs (id, user_id, action, metadata)
      VALUES (?, ?, 'GOOGLE_LOGIN', ?)
    `, [uuidv4(), user.id, JSON.stringify({
      ip: req.ip,
      sessionId,
      isNewUser,
      googleSub: verifiedGoogleUser.sub.substring(0, 6) + '***',
    })]);

    res.json({
      token,
      refreshToken: rawRefreshToken,
      deviceId,
      sessionId,
      isNewUser,
      user: sanitizeUser(user),
    });
  } catch (err: any) {
    console.error('[auth] internal error:', err instanceof Error ? err.message : err);
    res.status(500).json({ error: 'Internal server error. Please try again.' });
  }
});

// 12. EXPLICIT ACCOUNT LINKING: LINK GOOGLE TO LOGGED-IN ACCOUNT
router.post('/google/link', authMiddleware, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { idToken } = req.body;
    if (!idToken) {
      res.status(400).json({ error: 'Google ID token is required for linking' });
      return;
    }

    const verifiedGoogleUser = await GoogleAuthService.verifyIdToken(idToken);

    await GoogleAuthService.linkGoogleAccount(
      req.user!.id,
      verifiedGoogleUser.sub,
      verifiedGoogleUser.email
    );

    await runQuery(`
      INSERT INTO audit_logs (id, user_id, action, metadata)
      VALUES (?, ?, 'GOOGLE_ACCOUNT_LINKED', ?)
    `, [uuidv4(), req.user!.id, JSON.stringify({
      email: verifiedGoogleUser.email,
      ip: req.ip,
    })]);

    res.json({
      success: true,
      message: 'Google account successfully linked to your FinPocket profile.',
      linkedEmail: verifiedGoogleUser.email,
    });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// 13. EXPLICIT ACCOUNT UNLINKING: UNLINK GOOGLE
router.post('/google/unlink', authMiddleware, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    await GoogleAuthService.unlinkGoogleAccount(req.user!.id);

    await runQuery(`
      INSERT INTO audit_logs (id, user_id, action, metadata)
      VALUES (?, ?, 'GOOGLE_ACCOUNT_UNLINKED', ?)
    `, [uuidv4(), req.user!.id, JSON.stringify({ ip: req.ip })]);

    res.json({
      success: true,
      message: 'Google account unlinked successfully.',
    });
  } catch (err: any) {
    console.error('[auth] internal error:', err instanceof Error ? err.message : err);
    res.status(500).json({ error: 'Internal server error. Please try again.' });
  }
});

// 14. GET GOOGLE LINKED STATUS
router.get('/google/status', authMiddleware, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const identity = await getQuery<any>(
      "SELECT provider_subject, email_at_link_time, created_at, last_login_at FROM user_identities WHERE user_id = ? AND provider = 'google'",
      [req.user!.id]
    );

    res.json({
      isLinked: !!identity,
      linkedEmail: identity?.email_at_link_time || null,
      linkedAt: identity?.created_at || null,
      lastLoginAt: identity?.last_login_at || null,
    });
  } catch (err: any) {
    console.error('[auth] internal error:', err instanceof Error ? err.message : err);
    res.status(500).json({ error: 'Internal server error. Please try again.' });
  }
});


// 15. META (FACEBOOK) SSO AUTHENTICATION
router.post('/meta', async (req, res: Response): Promise<void> => {
  try {
    const { accessToken, deviceName } = req.body;

    if (!accessToken || typeof accessToken !== 'string') {
      res.status(400).json({ error: 'Meta access token is required' });
      return;
    }

    let verifiedMetaUser;
    try {
      verifiedMetaUser = await MetaAuthService.verifyAccessToken(accessToken);
    } catch (tokenErr: any) {
      res.status(401).json({ error: 'INVALID_META_TOKEN', message: tokenErr.message });
      return;
    }

    let user = await MetaAuthService.findUserByMetaSub(verifiedMetaUser.sub);
    let isNewUser = false;

    if (!user) {
      const existingUserByEmail = await getQuery<any>(
        'SELECT * FROM users WHERE email = ?',
        [verifiedMetaUser.email]
      );

      if (existingUserByEmail) {
        res.status(409).json({
          error: 'ACCOUNT_EXISTS_UNLINKED',
          message: 'An account with this email already exists. Please log in with your password to link your Facebook/Meta account.',
          email: verifiedMetaUser.email,
        });
        return;
      }

      user = await MetaAuthService.createMetaUser(verifiedMetaUser);
      isNewUser = true;
    } else {
      await runQuery(
        'UPDATE user_identities SET last_login_at = CURRENT_TIMESTAMP WHERE provider = ? AND provider_subject = ?',
        ['meta', verifiedMetaUser.sub]
      );
    }

    const scope = currentScope();
    if (scope) {
      await scope.client.query(`SELECT set_config('app.current_user_id', $1, true)`, [user.id]);
      scope.userId = user.id;
    }

    const deviceId = `dev_${uuidv4().substring(0, 8)}`;
    await runQuery(`
      INSERT INTO devices (id, user_id, device_name, ip_address)
      VALUES (?, ?, ?, ?)
    `, [deviceId, user.id, deviceName || 'FinPocket Mobile (Meta SSO)', req.ip || '127.0.0.1']);

    const sessionId = `sess_${uuidv4().substring(0, 8)}`;
    const rawRefreshToken = crypto.randomBytes(40).toString('hex');
    const refreshTokenHash = hashToken(rawRefreshToken);
    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();

    await runQuery(`
      INSERT INTO sessions (id, user_id, device_id, refresh_token_hash, expires_at, is_revoked)
      VALUES (?, ?, ?, ?, ?, 0)
    `, [sessionId, user.id, deviceId, refreshTokenHash, expiresAt]);

    const token = jwt.sign(
      { userId: user.id, email: user.email, sessionId },
      JWT_SECRET,
      { expiresIn: '15m' }
    );

    await runQuery(`
      INSERT INTO audit_logs (id, user_id, action, metadata)
      VALUES (?, ?, 'META_LOGIN', ?)
    `, [uuidv4(), user.id, JSON.stringify({
      ip: req.ip,
      sessionId,
      isNewUser,
      metaSub: verifiedMetaUser.sub.substring(0, 4) + '***',
    })]);

    res.json({
      token,
      refreshToken: rawRefreshToken,
      deviceId,
      sessionId,
      isNewUser,
      user: sanitizeUser(user),
    });
  } catch (err: any) {
    console.error('[auth] internal error:', err instanceof Error ? err.message : err);
    res.status(500).json({ error: 'Internal server error. Please try again.' });
  }
});

// 16. EXPLICIT ACCOUNT LINKING: LINK META TO LOGGED-IN ACCOUNT
router.post('/meta/link', authMiddleware, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { accessToken } = req.body;
    if (!accessToken || typeof accessToken !== 'string') {
      res.status(400).json({ error: 'Meta access token is required' });
      return;
    }

    const verifiedMetaUser = await MetaAuthService.verifyAccessToken(accessToken);
    await MetaAuthService.linkMetaAccount(req.user!.id, verifiedMetaUser.sub, verifiedMetaUser.email);

    await runQuery(`
      INSERT INTO audit_logs (id, user_id, action, metadata)
      VALUES (?, ?, 'META_ACCOUNT_LINKED', ?)
    `, [uuidv4(), req.user!.id, JSON.stringify({
      ip: req.ip,
      metaSub: verifiedMetaUser.sub.substring(0, 4) + '***',
    })]);

    res.json({
      success: true,
      message: 'Facebook/Meta account linked successfully.',
      provider: 'meta',
      email: verifiedMetaUser.email,
    });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// 17. UNLINK META ACCOUNT
router.delete('/meta/unlink', authMiddleware, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    await runQuery(
      "DELETE FROM user_identities WHERE user_id = ? AND provider = 'meta'",
      [req.user!.id]
    );
    await runQuery(
      "UPDATE users SET sso_provider = NULL WHERE id = ? AND sso_provider = 'meta'",
      [req.user!.id]
    );

    await runQuery(`
      INSERT INTO audit_logs (id, user_id, action, metadata)
      VALUES (?, ?, 'META_ACCOUNT_UNLINKED', ?)
    `, [uuidv4(), req.user!.id, JSON.stringify({ ip: req.ip })]);

    res.json({ success: true, message: 'Meta account unlinked successfully.' });
  } catch (err: any) {
    console.error('[auth] internal error:', err instanceof Error ? err.message : err);
    res.status(500).json({ error: 'Internal server error. Please try again.' });
  }
});

// 17.1 GET META LINKED STATUS
router.get('/meta/status', authMiddleware, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const identity = await getQuery<any>(
      "SELECT provider_subject, email_at_link_time, created_at, last_login_at FROM user_identities WHERE user_id = ? AND provider = 'meta'",
      [req.user!.id]
    );

    res.json({
      isLinked: !!identity,
      linkedEmail: identity?.email_at_link_time || null,
      linkedAt: identity?.created_at || null,
      lastLoginAt: identity?.last_login_at || null,
    });
  } catch (err: any) {
    console.error('[auth] internal error:', err instanceof Error ? err.message : err);
    res.status(500).json({ error: 'Internal server error. Please try again.' });
  }
});

// 18. SIGN IN WITH APPLE AUTHENTICATION
router.post('/apple', async (req, res: Response): Promise<void> => {
  try {
    const { idToken, name, deviceName } = req.body;

    if (!idToken || typeof idToken !== 'string') {
      res.status(400).json({ error: 'Apple ID token is required' });
      return;
    }

    let verifiedAppleUser;
    try {
      verifiedAppleUser = await AppleAuthService.verifyIdToken(idToken);
    } catch (tokenErr: any) {
      res.status(401).json({ error: 'INVALID_APPLE_TOKEN', message: tokenErr.message });
      return;
    }

    let user = await AppleAuthService.findUserByAppleSub(verifiedAppleUser.sub);
    let isNewUser = false;

    if (!user) {
      const existingUserByEmail = await getQuery<any>(
        'SELECT * FROM users WHERE email = ?',
        [verifiedAppleUser.email]
      );

      if (existingUserByEmail) {
        res.status(409).json({
          error: 'ACCOUNT_EXISTS_UNLINKED',
          message: 'An account with this email already exists. Please log in with your password to link your Apple ID.',
          email: verifiedAppleUser.email,
        });
        return;
      }

      user = await AppleAuthService.createAppleUser(verifiedAppleUser, name);
      isNewUser = true;
    } else {
      await runQuery(
        'UPDATE user_identities SET last_login_at = CURRENT_TIMESTAMP WHERE provider = ? AND provider_subject = ?',
        ['apple', verifiedAppleUser.sub]
      );
    }

    const scope = currentScope();
    if (scope) {
      await scope.client.query(`SELECT set_config('app.current_user_id', $1, true)`, [user.id]);
      scope.userId = user.id;
    }

    const deviceId = `dev_${uuidv4().substring(0, 8)}`;
    await runQuery(`
      INSERT INTO devices (id, user_id, device_name, ip_address)
      VALUES (?, ?, ?, ?)
    `, [deviceId, user.id, deviceName || 'FinPocket Mobile (Apple SSO)', req.ip || '127.0.0.1']);

    const sessionId = `sess_${uuidv4().substring(0, 8)}`;
    const rawRefreshToken = crypto.randomBytes(40).toString('hex');
    const refreshTokenHash = hashToken(rawRefreshToken);
    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();

    await runQuery(`
      INSERT INTO sessions (id, user_id, device_id, refresh_token_hash, expires_at, is_revoked)
      VALUES (?, ?, ?, ?, ?, 0)
    `, [sessionId, user.id, deviceId, refreshTokenHash, expiresAt]);

    const token = jwt.sign(
      { userId: user.id, email: user.email, sessionId },
      JWT_SECRET,
      { expiresIn: '15m' }
    );

    await runQuery(`
      INSERT INTO audit_logs (id, user_id, action, metadata)
      VALUES (?, ?, 'APPLE_LOGIN', ?)
    `, [uuidv4(), user.id, JSON.stringify({
      ip: req.ip,
      sessionId,
      isNewUser,
      appleSub: verifiedAppleUser.sub.substring(0, 6) + '***',
    })]);

    res.json({
      token,
      refreshToken: rawRefreshToken,
      deviceId,
      sessionId,
      isNewUser,
      user: sanitizeUser(user),
    });
  } catch (err: any) {
    console.error('[auth] internal error:', err instanceof Error ? err.message : err);
    res.status(500).json({ error: 'Internal server error. Please try again.' });
  }
});

// 19. EXPLICIT ACCOUNT LINKING: LINK APPLE TO LOGGED-IN ACCOUNT
router.post('/apple/link', authMiddleware, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { idToken } = req.body;
    if (!idToken || typeof idToken !== 'string') {
      res.status(400).json({ error: 'Apple ID token is required' });
      return;
    }

    const verifiedAppleUser = await AppleAuthService.verifyIdToken(idToken);
    await AppleAuthService.linkAppleAccount(req.user!.id, verifiedAppleUser.sub, verifiedAppleUser.email);

    await runQuery(`
      INSERT INTO audit_logs (id, user_id, action, metadata)
      VALUES (?, ?, 'APPLE_ACCOUNT_LINKED', ?)
    `, [uuidv4(), req.user!.id, JSON.stringify({
      ip: req.ip,
      appleSub: verifiedAppleUser.sub.substring(0, 6) + '***',
    })]);

    res.json({
      success: true,
      message: 'Apple ID linked successfully.',
      provider: 'apple',
      email: verifiedAppleUser.email,
    });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// 20. UNLINK APPLE ACCOUNT
router.delete('/apple/unlink', authMiddleware, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    await runQuery(
      "DELETE FROM user_identities WHERE user_id = ? AND provider = 'apple'",
      [req.user!.id]
    );
    await runQuery(
      "UPDATE users SET sso_provider = NULL WHERE id = ? AND sso_provider = 'apple'",
      [req.user!.id]
    );

    await runQuery(`
      INSERT INTO audit_logs (id, user_id, action, metadata)
      VALUES (?, ?, 'APPLE_ACCOUNT_UNLINKED', ?)
    `, [uuidv4(), req.user!.id, JSON.stringify({ ip: req.ip })]);

    res.json({ success: true, message: 'Apple ID unlinked successfully.' });
  } catch (err: any) {
    console.error('[auth] internal error:', err instanceof Error ? err.message : err);
    res.status(500).json({ error: 'Internal server error. Please try again.' });
  }
});

// 21. EMAIL AUTH: SEND VERIFICATION OTP
router.post('/email/send-otp', async (req, res: Response): Promise<void> => {
  try {
    const { email, captchaToken } = req.body;
    if (!email || typeof email !== 'string' || !email.includes('@')) {
      res.status(400).json({ error: 'Valid email address is required.' });
      return;
    }
    const cleanEmail = email.toLowerCase().trim();

    if (isDisposableEmail(cleanEmail)) {
      res.status(400).json({
        error: 'Temporary and disposable email addresses are not permitted. Please use a legitimate personal or business email address.'
      });
      return;
    }
    const localOtpDevelopment = config.environment === 'DEVELOPMENT' && process.env.DEV_EXPOSE_OTP === 'true';
    if (!localOtpDevelopment && !await requireSignupCaptcha(req, res, captchaToken)) return;

    const issueRes = await OtpService.issueOtp({
      destination: cleanEmail,
      destinationType: 'EMAIL',
      purpose: 'REGISTRATION_EMAIL',
      ip: req.ip || null,
      userAgent: (req.headers['user-agent'] as string) || null,
    });

    if (!issueRes.success) {
      res.status(429).json({
        error: issueRes.error || 'Please wait before requesting another verification code.',
        retryAfterSeconds: issueRes.retryAfterSeconds,
        expiresInSeconds: issueRes.expiresInSeconds,
      });
      return;
    }

    const exposeOtpForLocalDevelopment = config.environment === 'DEVELOPMENT' && process.env.DEV_EXPOSE_OTP === 'true';
    const delivered = exposeOtpForLocalDevelopment
      ? false
      : await EmailService.sendRegistrationOtp(cleanEmail, issueRes.otp!);
    if (!delivered && !exposeOtpForLocalDevelopment) {
      res.status(500).json({ error: 'Failed to deliver verification code. Please try again later.' });
      return;
    }

    res.json({
      success: true,
      message: delivered ? 'Verification code sent to your email address.' : 'Local development only: use the code shown below. Configure email delivery before deployment.',
      ...(delivered ? {} : { developmentOtp: issueRes.otp }),
      expiresInSeconds: issueRes.expiresInSeconds,
      resendCooldownSeconds: issueRes.resendCooldownSeconds,
    });
  } catch (err: any) {
    console.error('[auth] internal error in email/send-otp:', err instanceof Error ? err.message : err);
    res.status(500).json({ error: 'Failed to send verification code. Please try again.' });
  }
});

// 22. EMAIL AUTH: VERIFY OTP
router.post('/email/verify-otp', async (req, res: Response): Promise<void> => {
  try {
    const { email, otp } = req.body;
    if (!email || !otp) {
      res.status(400).json({ error: 'Email and verification code are required.' });
      return;
    }
    const cleanEmail = email.toLowerCase().trim();

    const verifyRes = await OtpService.verifyOtp({
      destination: cleanEmail,
      purpose: 'REGISTRATION_EMAIL',
      otp: String(otp).trim(),
    });

    if (!verifyRes.success) {
      const statusCode = verifyRes.remainingAttempts === 0 ? 429 : 400;
      res.status(statusCode).json({
        error: verifyRes.error || 'Invalid verification code. Please check and try again.',
        remainingAttempts: verifyRes.remainingAttempts,
      });
      return;
    }

    res.json({
      success: true,
      verified: true,
      message: 'Email address verified successfully!',
    });
  } catch (err: any) {
    console.error('[auth] internal error in email/verify-otp:', err instanceof Error ? err.message : err);
    res.status(500).json({ error: 'Failed to verify code. Please try again.' });
  }
});

// 23. UNIVERSAL OTP RESEND
router.post('/otp/resend', async (req, res: Response): Promise<void> => {
  try {
    const { destination, type = 'EMAIL', purpose = 'REGISTRATION_EMAIL', captchaToken } = req.body;
    if (!destination || typeof destination !== 'string') {
      res.status(400).json({ error: 'Destination is required.' });
      return;
    }

    if (type === 'EMAIL') {
      const cleanEmail = destination.toLowerCase().trim();
      if (!cleanEmail.includes('@') || isDisposableEmail(cleanEmail)) {
        res.status(400).json({ error: 'Valid personal or business email address is required.' });
        return;
      }
      const localOtpDevelopment = config.environment === 'DEVELOPMENT' && process.env.DEV_EXPOSE_OTP === 'true';
      if (!localOtpDevelopment && !await requireSignupCaptcha(req, res, captchaToken)) return;

      const issueRes = await OtpService.issueOtp({
        destination: cleanEmail,
        destinationType: 'EMAIL',
        purpose: purpose as any,
        ip: req.ip || null,
        userAgent: (req.headers['user-agent'] as string) || null,
      });

      if (!issueRes.success) {
        res.status(429).json({
          error: issueRes.error || 'Please wait before requesting another verification code.',
          retryAfterSeconds: issueRes.retryAfterSeconds,
          expiresInSeconds: issueRes.expiresInSeconds,
        });
        return;
      }

      const exposeOtpForLocalDevelopment = config.environment === 'DEVELOPMENT' && process.env.DEV_EXPOSE_OTP === 'true';
      const delivered = exposeOtpForLocalDevelopment
        ? false
        : await EmailService.sendRegistrationOtp(cleanEmail, issueRes.otp!);
      if (!delivered && !exposeOtpForLocalDevelopment) {
        res.status(500).json({ error: 'Failed to deliver verification code. Please try again later.' });
        return;
      }

      res.json({
        success: true,
        message: delivered ? 'Verification code resent successfully.' : 'Local development only: use the code shown below.',
        ...(delivered ? {} : { developmentOtp: issueRes.otp }),
        expiresInSeconds: issueRes.expiresInSeconds,
        resendCooldownSeconds: issueRes.resendCooldownSeconds,
      });
      return;
    }

    if (type === 'PHONE') {
      const phoneValidation = normalizeIndianPhoneNumber(destination);
      if (!phoneValidation.isValid || !phoneValidation.normalized) {
        res.status(400).json({ error: phoneValidation.error || 'Valid Indian mobile phone number (+91) is required.' });
        return;
      }
      const cleanPhone = phoneValidation.normalized;
      if (!await requireSignupCaptcha(req, res, captchaToken)) return;

      const issueRes = await OtpService.issueOtp({
        destination: cleanPhone,
        destinationType: 'PHONE',
        purpose: purpose as any,
        ip: req.ip || null,
        userAgent: (req.headers['user-agent'] as string) || null,
      });

      if (!issueRes.success) {
        res.status(429).json({
          error: issueRes.error || 'Please wait before requesting another verification code.',
          retryAfterSeconds: issueRes.retryAfterSeconds,
          expiresInSeconds: issueRes.expiresInSeconds,
        });
        return;
      }

      const delivered = await SmsService.sendOtp(cleanPhone, issueRes.otp!);
      if (!delivered) {
        res.status(500).json({ error: 'Failed to deliver SMS verification code. Please try again later.' });
        return;
      }

      res.json({
        success: true,
        message: 'Verification code resent successfully.',
        maskedPhone: maskPhoneNumber(cleanPhone),
        expiresInSeconds: issueRes.expiresInSeconds,
        resendCooldownSeconds: issueRes.resendCooldownSeconds,
      });
      return;
    }

    res.status(400).json({ error: 'Unsupported destination type. Expected EMAIL or PHONE.' });
  } catch (err: any) {
    console.error('[auth] internal error in /otp/resend:', err instanceof Error ? err.message : err);
    res.status(500).json({ error: 'Internal server error. Please try again.' });
  }
});

// 24. GET CURRENT USER VERIFICATION STATUS
router.get('/verification-status', authMiddleware, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const user = await getQuery<any>(
      'SELECT email, phone, email_verified, phone_verified FROM users WHERE id = ?',
      [req.user!.id]
    );

    if (!user) {
      res.status(404).json({ error: 'User not found.' });
      return;
    }

    res.json({
      email: user.email,
      maskedPhone: maskPhoneNumber(user.phone),
      emailVerified: user.email_verified === 1,
      phoneVerified: user.phone_verified === 1,
    });
  } catch (err: any) {
    console.error('[auth] internal error in /verification-status:', err instanceof Error ? err.message : err);
    res.status(500).json({ error: 'Internal server error. Please try again.' });
  }
});

export default router;
