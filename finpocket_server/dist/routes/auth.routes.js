"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const bcryptjs_1 = __importDefault(require("bcryptjs"));
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const crypto_1 = __importDefault(require("crypto"));
const uuid_1 = require("uuid");
const database_js_1 = require("../config/database.js");
const auth_middleware_js_1 = require("../middleware/auth.middleware.js");
const context_js_1 = require("../config/db/context.js");
const app_config_js_1 = require("../config/app_config.js");
const security_validator_js_1 = require("../utils/security.validator.js");
const google_auth_service_js_1 = require("../services/google_auth.service.js");
const meta_auth_service_js_1 = require("../services/meta_auth.service.js");
const apple_auth_service_js_1 = require("../services/apple_auth.service.js");
const email_service_js_1 = require("../services/email.service.js");
const sms_service_js_1 = require("../services/sms/sms.service.js");
const otp_service_js_1 = require("../services/otp.service.js");
const turnstile_service_js_1 = require("../services/turnstile.service.js");
const router = (0, express_1.Router)();
// In-memory brute-force attempt tracker: email -> { attempts, lockedUntil }
const loginAttempts = new Map();
// In-memory password reset store: cleanEmail -> { otp, expiresAt, attempts, userId }
const passwordResetStore = new Map();
function sanitizeUser(user) {
    return {
        id: user.id,
        name: user.name,
        maskedName: (0, security_validator_js_1.maskName)(user.name),
        email: user.email,
        phone: user.phone,
        maskedPhone: (0, security_validator_js_1.maskPhoneNumber)(user.phone),
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
function hashToken(token) {
    return crypto_1.default.createHash('sha256').update(token).digest('hex');
}
async function requireSignupCaptcha(req, res, token) {
    // In the explicitly enabled local OTP demo, the web app presents a local
    // checkbox and doesn't depend on Cloudflare or network access.
    if (app_config_js_1.config.environment === 'DEVELOPMENT' && process.env.DEV_EXPOSE_OTP === 'true')
        return true;
    const verification = await (0, turnstile_service_js_1.verifyTurnstileToken)(token, req.ip);
    if (verification.success)
        return true;
    const unavailable = verification.reason === 'not_configured' || verification.reason === 'provider_unavailable';
    res.status(unavailable ? 503 : 400).json({
        error: unavailable
            ? 'Security verification is temporarily unavailable. Please retry shortly.'
            : 'Security verification failed. Please complete the CAPTCHA and try again.',
    });
    return false;
}
// 1. REGISTER
router.post('/register', async (req, res) => {
    try {
        const { name, email, password, phone, captchaToken } = req.body;
        if (!name || !email || !password) {
            res.status(400).json({ error: 'Name, email, and password are required.' });
            return;
        }
        // 1. Legitimate Email Verification (Block temporary/disposable domains)
        const cleanEmail = email.toLowerCase().trim();
        if ((0, security_validator_js_1.isDisposableEmail)(cleanEmail)) {
            res.status(400).json({
                error: 'Temporary and disposable email addresses are not permitted. Please use a legitimate personal or business email address (e.g. Gmail, Outlook, Yahoo, or your company domain).'
            });
            return;
        }
        const localOtpDevelopment = app_config_js_1.config.environment === 'DEVELOPMENT' && process.env.DEV_EXPOSE_OTP === 'true';
        if (!localOtpDevelopment && !await requireSignupCaptcha(req, res, captchaToken))
            return;
        // 1b. Enforce Email OTP Verification
        const isEmailVerified = await otp_service_js_1.OtpService.isEmailVerifiedForRegistration(cleanEmail);
        if (!isEmailVerified) {
            res.status(400).json({
                error: 'Please verify your email address with the OTP code sent to your inbox before creating your account.'
            });
            return;
        }
        // 1c. Enforce Phone OTP Verification if phone is provided
        let cleanPhone = '';
        if (phone && typeof phone === 'string' && phone.trim()) {
            const phoneValidation = (0, security_validator_js_1.normalizeIndianPhoneNumber)(phone);
            if (!phoneValidation.isValid || !phoneValidation.normalized) {
                res.status(400).json({
                    error: phoneValidation.error || 'Please enter a valid 10-digit Indian mobile number.'
                });
                return;
            }
            cleanPhone = phoneValidation.normalized;
            const isPhoneVerified = await otp_service_js_1.OtpService.isPhoneVerifiedForRegistration(cleanPhone);
            if (!isPhoneVerified) {
                res.status(400).json({
                    error: 'Please verify your mobile phone number with the OTP code before creating your account.'
                });
                return;
            }
        }
        // 2. Strong Password Policy Enforcement
        const policy = (0, security_validator_js_1.validatePasswordPolicy)(password, { name, email }, {
            // Local OTP demo users can use their chosen password even if it includes
            // their email username; production keeps the full personal-info check.
            allowEmailUsername: app_config_js_1.config.environment === 'DEVELOPMENT' && process.env.DEV_EXPOSE_OTP === 'true',
        });
        if (!policy.isValid) {
            res.status(400).json({
                error: policy.errors[0],
                details: policy.errors,
                strength: policy.strengthLabel
            });
            return;
        }
        const existing = await (0, database_js_1.getQuery)('SELECT id FROM users WHERE email = ?', [cleanEmail]);
        if (existing) {
            res.status(409).json({ error: 'An account with this email already exists.' });
            return;
        }
        const userId = `usr_${(0, uuid_1.v4)().substring(0, 8)}`;
        const passwordHash = await bcryptjs_1.default.hash(password, 10);
        // Phase D RLS: this request now owns the brand-new identity — bind the
        // transaction's user context BEFORE any per-user row is written
        // (emergency_funds below, session/device rows, USER_REGISTERED audit) so
        // every insert passes its WITH CHECK clause. No scope (SQLite) → no-op.
        const scope = (0, context_js_1.currentScope)();
        if (scope) {
            await scope.client.query(`SELECT set_config('app.current_user_id', $1, true)`, [userId]);
            scope.userId = userId;
        }
        await (0, database_js_1.runQuery)(`
      INSERT INTO users (id, name, email, phone, phone_verified, email_verified, password_hash)
      VALUES (?, ?, ?, ?, ?, 1, ?)
    `, [userId, name.trim(), cleanEmail, cleanPhone, cleanPhone ? 1 : 0, passwordHash]);
        // Bind registration verification record to this newly created user ID
        await otp_service_js_1.OtpService.linkRegistrationUser(cleanEmail, userId);
        if (cleanPhone) {
            await otp_service_js_1.OtpService.linkRegistrationPhoneUser(cleanPhone, userId);
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
        await (0, database_js_1.runQuery)(`
      INSERT INTO emergency_funds (id, user_id, target_amount, current_amount, monthly_contribution)
      VALUES (?, ?, 100000.0, 0.0, 0.0)
    `, [`emf_${(0, uuid_1.v4)().substring(0, 8)}`, userId]);
        // Register device and session
        const deviceId = `dev_${(0, uuid_1.v4)().substring(0, 8)}`;
        await (0, database_js_1.runQuery)(`
      INSERT INTO devices (id, user_id, device_name, ip_address)
      VALUES (?, ?, 'Registered Device', ?)
    `, [deviceId, userId, req.ip || '127.0.0.1']);
        const sessionId = `sess_${(0, uuid_1.v4)().substring(0, 8)}`;
        const rawRefreshToken = crypto_1.default.randomBytes(40).toString('hex');
        const refreshTokenHash = hashToken(rawRefreshToken);
        const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(); // 30 days
        await (0, database_js_1.runQuery)(`
      INSERT INTO sessions (id, user_id, device_id, refresh_token_hash, expires_at, is_revoked)
      VALUES (?, ?, ?, ?, ?, 0)
    `, [sessionId, userId, deviceId, refreshTokenHash, expiresAt]);
        // Short-lived access token (15 mins)
        const token = jsonwebtoken_1.default.sign({ userId, email, sessionId }, auth_middleware_js_1.JWT_SECRET, { expiresIn: '15m' });
        await (0, database_js_1.runQuery)(`
      INSERT INTO audit_logs (id, user_id, action, metadata)
      VALUES (?, ?, 'USER_REGISTERED', ?)
    `, [(0, uuid_1.v4)(), userId, JSON.stringify({ email, name })]);
        const createdUser = await (0, database_js_1.getQuery)('SELECT * FROM users WHERE id = ?', [userId]);
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
    }
    catch (err) {
        console.error('[auth] internal error:', err instanceof Error ? err.message : err);
        res.status(500).json({ error: 'Internal server error. Please try again.' });
    }
});
// 2. LOGIN (With brute-force protection & failed login audit logging)
router.post('/login', async (req, res) => {
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
        const user = await (0, database_js_1.getQuery)('SELECT * FROM users WHERE email = ?', [lowerEmail]);
        let isValid = false;
        if (user) {
            isValid = await bcryptjs_1.default.compare(password, user.password_hash);
        }
        if (!user || !isValid) {
            // Record failed attempt
            const prevAttempts = (attemptRecord && attemptRecord.lockedUntil <= now) ? 0 : (attemptRecord?.attempts || 0);
            const newAttempts = prevAttempts + 1;
            const lockedUntil = newAttempts >= 5 ? now + 15 * 60 * 1000 : 0; // 15 mins lock after 5 fails
            loginAttempts.set(lowerEmail, { attempts: newAttempts, lockedUntil });
            // Audit log failed attempt (NEVER store password or attempt text)
            if (user) {
                await (0, database_js_1.runQuery)(`
          INSERT INTO audit_logs (id, user_id, action, metadata)
          VALUES (?, ?, 'LOGIN_FAILED', ?)
        `, [(0, uuid_1.v4)(), user.id, JSON.stringify({ ip: req.ip, attempts: newAttempts, reason: 'INVALID_CREDENTIALS' })]);
            }
            res.status(401).json({ error: 'Invalid email or password.' });
            return;
        }
        // Success -> Clear failed attempts
        loginAttempts.delete(lowerEmail);
        // Phase D RLS: bind THIS request's transaction to the authenticated user
        const scope = (0, context_js_1.currentScope)();
        if (scope) {
            await scope.client.query(`SELECT set_config('app.current_user_id', $1, true)`, [user.id]);
            scope.userId = user.id;
        }
        // Device tracking
        const deviceId = `dev_${(0, uuid_1.v4)().substring(0, 8)}`;
        const dName = deviceName || 'Android Mobile Client';
        await (0, database_js_1.runQuery)(`
      INSERT INTO devices (id, user_id, device_name, ip_address)
      VALUES (?, ?, ?, ?)
    `, [deviceId, user.id, dName, req.ip || '127.0.0.1']);
        // Create session & refresh token
        const sessionId = `sess_${(0, uuid_1.v4)().substring(0, 8)}`;
        const rawRefreshToken = crypto_1.default.randomBytes(40).toString('hex');
        const refreshTokenHash = hashToken(rawRefreshToken);
        const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
        await (0, database_js_1.runQuery)(`
      INSERT INTO sessions (id, user_id, device_id, refresh_token_hash, expires_at, is_revoked)
      VALUES (?, ?, ?, ?, ?, 0)
    `, [sessionId, user.id, deviceId, refreshTokenHash, expiresAt]);
        // Short-lived access token (15 mins)
        const token = jsonwebtoken_1.default.sign({ userId: user.id, email: user.email, sessionId }, auth_middleware_js_1.JWT_SECRET, { expiresIn: '15m' });
        await (0, database_js_1.runQuery)(`
      INSERT INTO audit_logs (id, user_id, action, metadata)
      VALUES (?, ?, 'USER_LOGIN', ?)
    `, [(0, uuid_1.v4)(), user.id, JSON.stringify({ device: dName, ip: req.ip, sessionId })]);
        res.json({
            token,
            refreshToken: rawRefreshToken,
            deviceId,
            sessionId,
            user: sanitizeUser(user)
        });
    }
    catch (err) {
        console.error('[auth] internal error:', err instanceof Error ? err.message : err);
        res.status(500).json({ error: 'Internal server error. Please try again.' });
    }
});
// 3. REFRESH TOKEN (With rotation & reuse detection)
router.post('/refresh', async (req, res) => {
    try {
        const { refreshToken } = req.body;
        if (!refreshToken) {
            res.status(400).json({ error: 'Refresh token is required.' });
            return;
        }
        const incomingHash = hashToken(refreshToken);
        const session = await (0, database_js_1.getQuery)('SELECT * FROM sessions WHERE refresh_token_hash = ?', [incomingHash]);
        if (!session) {
            res.status(401).json({ error: 'Invalid refresh token.' });
            return;
        }
        // Phase D RLS: bind session user context before updating sessions/audits
        const scope = (0, context_js_1.currentScope)();
        if (scope) {
            await scope.client.query(`SELECT set_config('app.current_user_id', $1, true)`, [session.user_id]);
            scope.userId = session.user_id;
        }
        // Reuse Detection: If session was already revoked, someone is trying to reuse a rotated/revoked token!
        if (session.is_revoked === 1) {
            // Immediate security containment: Revoke all active sessions for this user
            await (0, database_js_1.runQuery)('UPDATE sessions SET is_revoked = 1 WHERE user_id = ?', [session.user_id]);
            await (0, database_js_1.runQuery)(`
        INSERT INTO audit_logs (id, user_id, action, metadata)
        VALUES (?, ?, 'SECURITY_ALERT_REFRESH_REUSE', ?)
      `, [(0, uuid_1.v4)(), session.user_id, JSON.stringify({ ip: req.ip, attemptedSession: session.id })]);
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
        const user = await (0, database_js_1.getQuery)('SELECT * FROM users WHERE id = ?', [session.user_id]);
        if (!user) {
            res.status(401).json({ error: 'User not found.' });
            return;
        }
        // ROTATE REFRESH TOKEN: Invalidate old token and issue new pair
        const newRawRefreshToken = crypto_1.default.randomBytes(40).toString('hex');
        const newRefreshTokenHash = hashToken(newRawRefreshToken);
        const newExpiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
        await (0, database_js_1.runQuery)(`
      UPDATE sessions 
      SET refresh_token_hash = ?, expires_at = ?
      WHERE id = ?
    `, [newRefreshTokenHash, newExpiresAt, session.id]);
        const newAccessToken = jsonwebtoken_1.default.sign({ userId: user.id, email: user.email, sessionId: session.id }, auth_middleware_js_1.JWT_SECRET, { expiresIn: '15m' });
        await (0, database_js_1.runQuery)(`
      INSERT INTO audit_logs (id, user_id, action, metadata)
      VALUES (?, ?, 'TOKEN_ROTATED', ?)
    `, [(0, uuid_1.v4)(), user.id, JSON.stringify({ sessionId: session.id })]);
        res.json({
            token: newAccessToken,
            refreshToken: newRawRefreshToken
        });
    }
    catch (err) {
        console.error('[auth] internal error:', err instanceof Error ? err.message : err);
        res.status(500).json({ error: 'Internal server error. Please try again.' });
    }
});
// 4. LOGOUT (Server-side session revocation)
router.post('/logout', auth_middleware_js_1.authMiddleware, async (req, res) => {
    try {
        if (req.sessionId) {
            await (0, database_js_1.runQuery)('UPDATE sessions SET is_revoked = 1 WHERE id = ?', [req.sessionId]);
        }
        else {
            // Invalidate all active sessions for this user if no specific session id
            await (0, database_js_1.runQuery)('UPDATE sessions SET is_revoked = 1 WHERE user_id = ?', [req.user.id]);
        }
        await (0, database_js_1.runQuery)(`
      INSERT INTO audit_logs (id, user_id, action, metadata)
      VALUES (?, ?, 'USER_LOGOUT', ?)
    `, [(0, uuid_1.v4)(), req.user.id, JSON.stringify({ sessionId: req.sessionId })]);
        res.json({ success: true, message: 'Logged out successfully. Session revoked.' });
    }
    catch (err) {
        console.error('[auth] internal error:', err instanceof Error ? err.message : err);
        res.status(500).json({ error: 'Internal server error. Please try again.' });
    }
});
// 5. FORGOT PASSWORD (Sends 6-digit reset OTP to registered email)
router.post('/forgot-password', async (req, res) => {
    try {
        const { email } = req.body;
        if (!email || typeof email !== 'string' || !email.includes('@')) {
            res.status(400).json({ error: 'Valid registered email address is required.' });
            return;
        }
        const cleanEmail = email.toLowerCase().trim();
        const user = await (0, database_js_1.getQuery)('SELECT id, name, email FROM users WHERE email = ?', [cleanEmail]);
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
        const otp = crypto_1.default.randomInt(100000, 1000000).toString();
        const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString(); // 10 minutes
        const tokenHash = hashToken(otp);
        passwordResetStore.set(cleanEmail, { otp, expiresAt: Date.now() + 10 * 60 * 1000, attempts: 0, userId: user.id });
        await (0, database_js_1.runQuery)(`
      UPDATE users 
      SET password_reset_token = ?, password_reset_expires = ?
      WHERE id = ?
    `, [tokenHash, expiresAt, user.id]);
        await (0, database_js_1.runQuery)(`
      INSERT INTO audit_logs (id, user_id, action, metadata)
      VALUES (?, ?, 'PASSWORD_RESET_REQUESTED', ?)
    `, [(0, uuid_1.v4)(), user.id, JSON.stringify({ ip: req.ip })]);
        const emailSent = await email_service_js_1.EmailService.sendPasswordResetOtp(cleanEmail, otp, user.name);
        if (!emailSent) {
            res.status(500).json({ error: 'Failed to send password reset email. Please try again later.' });
            return;
        }
        res.json({
            success: true,
            message: 'Password reset verification code has been sent to your email.'
        });
    }
    catch (err) {
        console.error('[auth] internal error in forgot-password:', err instanceof Error ? err.message : err);
        res.status(500).json({ error: 'Internal server error. Please try again.' });
    }
});
// 6. RESET PASSWORD (Verifies 6-digit email OTP and updates password)
router.post('/reset-password', async (req, res) => {
    try {
        const { email, token, newPassword } = req.body;
        if (!token || !newPassword || newPassword.length < 6) {
            res.status(400).json({ error: 'Reset verification code and new password (min 6 chars) are required.' });
            return;
        }
        // Enforce strong password policy on password reset
        const policy = (0, security_validator_js_1.validatePasswordPolicy)(newPassword, { email: email || '' });
        if (!policy.isValid) {
            res.status(400).json({
                error: policy.errors[0],
                details: policy.errors,
                strength: policy.strengthLabel
            });
            return;
        }
        let targetUserId = null;
        const cleanToken = token.trim();
        const cleanEmail = email ? email.toLowerCase().trim() : null;
        // 1. Check in-memory store first
        if (cleanEmail && passwordResetStore.has(cleanEmail)) {
            const record = passwordResetStore.get(cleanEmail);
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
            const user = await (0, database_js_1.getQuery)('SELECT id, password_reset_expires FROM users WHERE password_reset_token = ?', [tokenHash]);
            if (user && new Date(user.password_reset_expires) >= new Date()) {
                targetUserId = user.id;
            }
        }
        if (!targetUserId) {
            res.status(400).json({ error: 'Invalid or expired password reset verification code.' });
            return;
        }
        // Phase D RLS: bind target user context before updating sessions/audits
        const scope = (0, context_js_1.currentScope)();
        if (scope) {
            await scope.client.query(`SELECT set_config('app.current_user_id', $1, true)`, [targetUserId]);
            scope.userId = targetUserId;
        }
        const newPasswordHash = await bcryptjs_1.default.hash(newPassword, 10);
        await (0, database_js_1.runQuery)(`
      UPDATE users 
      SET password_hash = ?, password_reset_token = NULL, password_reset_expires = NULL
      WHERE id = ?
    `, [newPasswordHash, targetUserId]);
        // Revoke all existing sessions for this user on password change
        await (0, database_js_1.runQuery)('UPDATE sessions SET is_revoked = 1 WHERE user_id = ?', [targetUserId]);
        await (0, database_js_1.runQuery)(`
      INSERT INTO audit_logs (id, user_id, action, metadata)
      VALUES (?, ?, 'PASSWORD_RESET_COMPLETED', ?)
    `, [(0, uuid_1.v4)(), targetUserId, JSON.stringify({ ip: req.ip })]);
        res.json({
            success: true,
            message: 'Password has been reset successfully. Please log in with your new password.'
        });
    }
    catch (err) {
        console.error('[auth] internal error in reset-password:', err instanceof Error ? err.message : err);
        res.status(500).json({ error: 'Internal server error. Please try again.' });
    }
});
// 7. GET /me (Current Authenticated User)
router.get('/me', auth_middleware_js_1.authMiddleware, async (req, res) => {
    try {
        const user = await (0, database_js_1.getQuery)('SELECT * FROM users WHERE id = ?', [req.user.id]);
        if (!user) {
            res.status(404).json({ error: 'User not found' });
            return;
        }
        res.json({ user: sanitizeUser(user) });
    }
    catch (err) {
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
router.put('/upi-id', auth_middleware_js_1.authMiddleware, async (req, res) => {
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
        await (0, database_js_1.runQuery)('UPDATE users SET upi_id = ? WHERE id = ?', [raw, req.user.id]);
        await (0, database_js_1.runQuery)(`
      INSERT INTO audit_logs (id, user_id, action, metadata)
      VALUES (?, ?, 'UPI_ID_UPDATED', ?)
    `, [(0, uuid_1.v4)(), req.user.id, JSON.stringify({ upiId: raw, ip: req.ip })]);
        res.json({ success: true, upiId: raw });
    }
    catch (err) {
        console.error('[auth] internal error:', err instanceof Error ? err.message : err);
        res.status(500).json({ error: 'Internal server error. Please try again.' });
    }
});
// 9. UPDATE PIN (Stored with bcrypt hashing, never plaintext)
router.post('/update-pin', auth_middleware_js_1.authMiddleware, async (req, res) => {
    try {
        const { newPin } = req.body;
        if (!newPin || newPin.length < 4) {
            res.status(400).json({ error: 'PIN must be at least 4 digits.' });
            return;
        }
        const pinHash = await bcryptjs_1.default.hash(newPin, 10);
        await (0, database_js_1.runQuery)('UPDATE users SET app_pin_hash = ? WHERE id = ?', [pinHash, req.user.id]);
        // Audit log without PIN value
        await (0, database_js_1.runQuery)(`
      INSERT INTO audit_logs (id, user_id, action, metadata)
      VALUES (?, ?, 'PIN_UPDATED', ?)
    `, [(0, uuid_1.v4)(), req.user.id, JSON.stringify({ ip: req.ip })]);
        res.json({ success: true, message: 'App PIN updated and hashed securely with bcrypt.' });
    }
    catch (err) {
        console.error('[auth] internal error:', err instanceof Error ? err.message : err);
        res.status(500).json({ error: 'Internal server error. Please try again.' });
    }
});
// 9b. VERIFY PIN — the bcrypt digest never leaves the server, so every client
// PIN gate (child-care mode, emergency lock, savings actions) validates here
// instead of against a fabricated local value. Rate-limited like login.
router.post('/pin/verify', auth_middleware_js_1.authMiddleware, async (req, res) => {
    try {
        const { pin } = req.body;
        if (!pin || typeof pin !== 'string') {
            res.status(400).json({ error: 'PIN is required.' });
            return;
        }
        const user = await (0, database_js_1.getQuery)('SELECT app_pin_hash FROM users WHERE id = ?', [req.user.id]);
        if (!user?.app_pin_hash) {
            // No PIN configured: there is nothing to verify (matches the savings
            // withdraw semantics — an unset PIN does not gate actions).
            res.json({ valid: true, pinConfigured: false });
            return;
        }
        const valid = await bcryptjs_1.default.compare(pin, user.app_pin_hash);
        res.json({ valid, pinConfigured: true });
    }
    catch (err) {
        console.error('[auth] internal error:', err instanceof Error ? err.message : err);
        res.status(500).json({ error: 'Internal server error. Please try again.' });
    }
});
// 9. PHONE AUTH: SEND OTP (6-digit verification code with rate limiting & SMS delivery)
router.post('/phone/send-otp', async (req, res) => {
    try {
        const { phone, captchaToken } = req.body;
        const phoneValidation = (0, security_validator_js_1.normalizeIndianPhoneNumber)(phone);
        if (!phoneValidation.isValid || !phoneValidation.normalized) {
            res.status(400).json({
                error: phoneValidation.error || 'Valid Indian mobile phone number (+91) is required.'
            });
            return;
        }
        const cleanPhone = phoneValidation.normalized;
        // Check optional bearer token for authenticated phone updates
        let authenticatedUserId;
        const authHeader = req.headers.authorization;
        if (authHeader && authHeader.startsWith('Bearer ')) {
            try {
                const decoded = jsonwebtoken_1.default.verify(authHeader.slice(7), auth_middleware_js_1.JWT_SECRET);
                if (decoded.userId)
                    authenticatedUserId = decoded.userId;
            }
            catch { }
        }
        const bindUserId = authenticatedUserId || (typeof req.body.userId === 'string' && req.body.userId ? req.body.userId : null);
        const purpose = bindUserId ? 'UPDATE_PHONE' : 'REGISTRATION_PHONE';
        if (!authenticatedUserId && !await requireSignupCaptcha(req, res, captchaToken))
            return;
        const issueRes = await otp_service_js_1.OtpService.issueOtp({
            destination: cleanPhone,
            destinationType: 'PHONE',
            purpose,
            userId: bindUserId,
            ip: req.ip || null,
            userAgent: req.headers['user-agent'] || null,
        });
        if (!issueRes.success) {
            res.status(429).json({
                error: issueRes.error || 'Please wait before requesting another verification code.',
                retryAfterSeconds: issueRes.retryAfterSeconds,
                expiresInSeconds: issueRes.expiresInSeconds,
            });
            return;
        }
        const delivered = await sms_service_js_1.SmsService.sendOtp(cleanPhone, issueRes.otp);
        if (!delivered) {
            res.status(500).json({ error: 'Failed to deliver SMS verification code. Please try again later.' });
            return;
        }
        res.json({
            success: true,
            message: 'Verification code sent successfully.',
            maskedPhone: (0, security_validator_js_1.maskPhoneNumber)(cleanPhone),
            expiresInSeconds: issueRes.expiresInSeconds,
            resendCooldownSeconds: issueRes.resendCooldownSeconds,
        });
    }
    catch (err) {
        console.error('[auth] internal error in phone/send-otp:', err instanceof Error ? err.message : err);
        res.status(500).json({ error: 'Internal server error. Please try again.' });
    }
});
// 10. PHONE AUTH: VERIFY OTP
router.post('/phone/verify-otp', async (req, res) => {
    try {
        const { phone, otp, userId } = req.body;
        if (!phone || !otp) {
            res.status(400).json({ error: 'Phone and verification code are required.' });
            return;
        }
        const phoneValidation = (0, security_validator_js_1.normalizeIndianPhoneNumber)(phone);
        if (!phoneValidation.isValid || !phoneValidation.normalized) {
            res.status(400).json({
                error: phoneValidation.error || 'Valid Indian mobile phone number (+91) is required.'
            });
            return;
        }
        const cleanPhone = phoneValidation.normalized;
        // Caller identity: check bearer token
        let authenticatedUserId;
        const authHeader = req.headers.authorization;
        if (authHeader && authHeader.startsWith('Bearer ')) {
            try {
                const decoded = jsonwebtoken_1.default.verify(authHeader.slice(7), auth_middleware_js_1.JWT_SECRET);
                if (decoded.userId)
                    authenticatedUserId = decoded.userId;
            }
            catch { }
        }
        let targetUserId = null;
        if (authenticatedUserId) {
            targetUserId = authenticatedUserId;
        }
        else if (userId && typeof userId === 'string') {
            targetUserId = userId;
        }
        const primaryPurpose = targetUserId ? 'UPDATE_PHONE' : 'REGISTRATION_PHONE';
        let verifyRes = await otp_service_js_1.OtpService.verifyOtp({
            destination: cleanPhone,
            purpose: primaryPurpose,
            otp: String(otp).trim(),
            userId: targetUserId,
        });
        // Fallback if purpose was REGISTRATION_PHONE but user is now passing userId or vice versa
        if (!verifyRes.success && verifyRes.remainingAttempts !== 0) {
            const fallbackPurpose = targetUserId ? 'REGISTRATION_PHONE' : 'UPDATE_PHONE';
            const fallbackRes = await otp_service_js_1.OtpService.verifyOtp({
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
    }
    catch (err) {
        console.error('[auth] internal error in phone/verify-otp:', err instanceof Error ? err.message : err);
        res.status(500).json({ error: 'Internal server error. Please try again.' });
    }
});
// 11. FEDERATED AUTHENTICATION: GOOGLE SSO (ID TOKEN VERIFICATION & IDENTITY MAPPING)
router.post('/google', async (req, res) => {
    try {
        const { idToken, deviceName } = req.body;
        if (!idToken || typeof idToken !== 'string') {
            res.status(400).json({ error: 'Google ID token is required' });
            return;
        }
        // 1. Cryptographically verify Google ID token (signature, audience, issuer, exp, email_verified)
        let verifiedGoogleUser;
        try {
            verifiedGoogleUser = await google_auth_service_js_1.GoogleAuthService.verifyIdToken(idToken);
        }
        catch (tokenErr) {
            res.status(401).json({ error: 'INVALID_GOOGLE_TOKEN', message: tokenErr.message });
            return;
        }
        // 2. Look up user by Google provider subject (sub)
        let user = await google_auth_service_js_1.GoogleAuthService.findUserByGoogleSub(verifiedGoogleUser.sub);
        let isNewUser = false;
        if (!user) {
            // Check if user with this email already exists in FinPocket
            const existingUserByEmail = await (0, database_js_1.getQuery)('SELECT * FROM users WHERE email = ?', [verifiedGoogleUser.email]);
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
            user = await google_auth_service_js_1.GoogleAuthService.createGoogleUser(verifiedGoogleUser);
            isNewUser = true;
        }
        else {
            // Existing Google-linked user: update last login time
            await (0, database_js_1.runQuery)('UPDATE user_identities SET last_login_at = CURRENT_TIMESTAMP WHERE provider = ? AND provider_subject = ?', ['google', verifiedGoogleUser.sub]);
        }
        // 3. Issue FinPocket device, session, and JWT tokens
        const scope = (0, context_js_1.currentScope)();
        if (scope) {
            await scope.client.query(`SELECT set_config('app.current_user_id', $1, true)`, [user.id]);
            scope.userId = user.id;
        }
        const deviceId = `dev_${(0, uuid_1.v4)().substring(0, 8)}`;
        await (0, database_js_1.runQuery)(`
      INSERT INTO devices (id, user_id, device_name, ip_address)
      VALUES (?, ?, ?, ?)
    `, [deviceId, user.id, deviceName || 'FinPocket Mobile (Google SSO)', req.ip || '127.0.0.1']);
        const sessionId = `sess_${(0, uuid_1.v4)().substring(0, 8)}`;
        const rawRefreshToken = crypto_1.default.randomBytes(40).toString('hex');
        const refreshTokenHash = hashToken(rawRefreshToken);
        const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
        await (0, database_js_1.runQuery)(`
      INSERT INTO sessions (id, user_id, device_id, refresh_token_hash, expires_at, is_revoked)
      VALUES (?, ?, ?, ?, ?, 0)
    `, [sessionId, user.id, deviceId, refreshTokenHash, expiresAt]);
        const token = jsonwebtoken_1.default.sign({ userId: user.id, email: user.email, sessionId }, auth_middleware_js_1.JWT_SECRET, { expiresIn: '15m' });
        // Audit log
        await (0, database_js_1.runQuery)(`
      INSERT INTO audit_logs (id, user_id, action, metadata)
      VALUES (?, ?, 'GOOGLE_LOGIN', ?)
    `, [(0, uuid_1.v4)(), user.id, JSON.stringify({
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
    }
    catch (err) {
        console.error('[auth] internal error:', err instanceof Error ? err.message : err);
        res.status(500).json({ error: 'Internal server error. Please try again.' });
    }
});
// 12. EXPLICIT ACCOUNT LINKING: LINK GOOGLE TO LOGGED-IN ACCOUNT
router.post('/google/link', auth_middleware_js_1.authMiddleware, async (req, res) => {
    try {
        const { idToken } = req.body;
        if (!idToken) {
            res.status(400).json({ error: 'Google ID token is required for linking' });
            return;
        }
        const verifiedGoogleUser = await google_auth_service_js_1.GoogleAuthService.verifyIdToken(idToken);
        await google_auth_service_js_1.GoogleAuthService.linkGoogleAccount(req.user.id, verifiedGoogleUser.sub, verifiedGoogleUser.email);
        await (0, database_js_1.runQuery)(`
      INSERT INTO audit_logs (id, user_id, action, metadata)
      VALUES (?, ?, 'GOOGLE_ACCOUNT_LINKED', ?)
    `, [(0, uuid_1.v4)(), req.user.id, JSON.stringify({
                email: verifiedGoogleUser.email,
                ip: req.ip,
            })]);
        res.json({
            success: true,
            message: 'Google account successfully linked to your FinPocket profile.',
            linkedEmail: verifiedGoogleUser.email,
        });
    }
    catch (err) {
        res.status(400).json({ error: err.message });
    }
});
// 13. EXPLICIT ACCOUNT UNLINKING: UNLINK GOOGLE
router.post('/google/unlink', auth_middleware_js_1.authMiddleware, async (req, res) => {
    try {
        await google_auth_service_js_1.GoogleAuthService.unlinkGoogleAccount(req.user.id);
        await (0, database_js_1.runQuery)(`
      INSERT INTO audit_logs (id, user_id, action, metadata)
      VALUES (?, ?, 'GOOGLE_ACCOUNT_UNLINKED', ?)
    `, [(0, uuid_1.v4)(), req.user.id, JSON.stringify({ ip: req.ip })]);
        res.json({
            success: true,
            message: 'Google account unlinked successfully.',
        });
    }
    catch (err) {
        console.error('[auth] internal error:', err instanceof Error ? err.message : err);
        res.status(500).json({ error: 'Internal server error. Please try again.' });
    }
});
// 14. GET GOOGLE LINKED STATUS
router.get('/google/status', auth_middleware_js_1.authMiddleware, async (req, res) => {
    try {
        const identity = await (0, database_js_1.getQuery)("SELECT provider_subject, email_at_link_time, created_at, last_login_at FROM user_identities WHERE user_id = ? AND provider = 'google'", [req.user.id]);
        res.json({
            isLinked: !!identity,
            linkedEmail: identity?.email_at_link_time || null,
            linkedAt: identity?.created_at || null,
            lastLoginAt: identity?.last_login_at || null,
        });
    }
    catch (err) {
        console.error('[auth] internal error:', err instanceof Error ? err.message : err);
        res.status(500).json({ error: 'Internal server error. Please try again.' });
    }
});
// 15. META (FACEBOOK) SSO AUTHENTICATION
router.post('/meta', async (req, res) => {
    try {
        const { accessToken, deviceName } = req.body;
        if (!accessToken || typeof accessToken !== 'string') {
            res.status(400).json({ error: 'Meta access token is required' });
            return;
        }
        let verifiedMetaUser;
        try {
            verifiedMetaUser = await meta_auth_service_js_1.MetaAuthService.verifyAccessToken(accessToken);
        }
        catch (tokenErr) {
            res.status(401).json({ error: 'INVALID_META_TOKEN', message: tokenErr.message });
            return;
        }
        let user = await meta_auth_service_js_1.MetaAuthService.findUserByMetaSub(verifiedMetaUser.sub);
        let isNewUser = false;
        if (!user) {
            const existingUserByEmail = await (0, database_js_1.getQuery)('SELECT * FROM users WHERE email = ?', [verifiedMetaUser.email]);
            if (existingUserByEmail) {
                res.status(409).json({
                    error: 'ACCOUNT_EXISTS_UNLINKED',
                    message: 'An account with this email already exists. Please log in with your password to link your Facebook/Meta account.',
                    email: verifiedMetaUser.email,
                });
                return;
            }
            user = await meta_auth_service_js_1.MetaAuthService.createMetaUser(verifiedMetaUser);
            isNewUser = true;
        }
        else {
            await (0, database_js_1.runQuery)('UPDATE user_identities SET last_login_at = CURRENT_TIMESTAMP WHERE provider = ? AND provider_subject = ?', ['meta', verifiedMetaUser.sub]);
        }
        const scope = (0, context_js_1.currentScope)();
        if (scope) {
            await scope.client.query(`SELECT set_config('app.current_user_id', $1, true)`, [user.id]);
            scope.userId = user.id;
        }
        const deviceId = `dev_${(0, uuid_1.v4)().substring(0, 8)}`;
        await (0, database_js_1.runQuery)(`
      INSERT INTO devices (id, user_id, device_name, ip_address)
      VALUES (?, ?, ?, ?)
    `, [deviceId, user.id, deviceName || 'FinPocket Mobile (Meta SSO)', req.ip || '127.0.0.1']);
        const sessionId = `sess_${(0, uuid_1.v4)().substring(0, 8)}`;
        const rawRefreshToken = crypto_1.default.randomBytes(40).toString('hex');
        const refreshTokenHash = hashToken(rawRefreshToken);
        const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
        await (0, database_js_1.runQuery)(`
      INSERT INTO sessions (id, user_id, device_id, refresh_token_hash, expires_at, is_revoked)
      VALUES (?, ?, ?, ?, ?, 0)
    `, [sessionId, user.id, deviceId, refreshTokenHash, expiresAt]);
        const token = jsonwebtoken_1.default.sign({ userId: user.id, email: user.email, sessionId }, auth_middleware_js_1.JWT_SECRET, { expiresIn: '15m' });
        await (0, database_js_1.runQuery)(`
      INSERT INTO audit_logs (id, user_id, action, metadata)
      VALUES (?, ?, 'META_LOGIN', ?)
    `, [(0, uuid_1.v4)(), user.id, JSON.stringify({
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
    }
    catch (err) {
        console.error('[auth] internal error:', err instanceof Error ? err.message : err);
        res.status(500).json({ error: 'Internal server error. Please try again.' });
    }
});
// 16. EXPLICIT ACCOUNT LINKING: LINK META TO LOGGED-IN ACCOUNT
router.post('/meta/link', auth_middleware_js_1.authMiddleware, async (req, res) => {
    try {
        const { accessToken } = req.body;
        if (!accessToken || typeof accessToken !== 'string') {
            res.status(400).json({ error: 'Meta access token is required' });
            return;
        }
        const verifiedMetaUser = await meta_auth_service_js_1.MetaAuthService.verifyAccessToken(accessToken);
        await meta_auth_service_js_1.MetaAuthService.linkMetaAccount(req.user.id, verifiedMetaUser.sub, verifiedMetaUser.email);
        await (0, database_js_1.runQuery)(`
      INSERT INTO audit_logs (id, user_id, action, metadata)
      VALUES (?, ?, 'META_ACCOUNT_LINKED', ?)
    `, [(0, uuid_1.v4)(), req.user.id, JSON.stringify({
                ip: req.ip,
                metaSub: verifiedMetaUser.sub.substring(0, 4) + '***',
            })]);
        res.json({
            success: true,
            message: 'Facebook/Meta account linked successfully.',
            provider: 'meta',
            email: verifiedMetaUser.email,
        });
    }
    catch (err) {
        res.status(400).json({ error: err.message });
    }
});
// 17. UNLINK META ACCOUNT
router.delete('/meta/unlink', auth_middleware_js_1.authMiddleware, async (req, res) => {
    try {
        await (0, database_js_1.runQuery)("DELETE FROM user_identities WHERE user_id = ? AND provider = 'meta'", [req.user.id]);
        await (0, database_js_1.runQuery)("UPDATE users SET sso_provider = NULL WHERE id = ? AND sso_provider = 'meta'", [req.user.id]);
        await (0, database_js_1.runQuery)(`
      INSERT INTO audit_logs (id, user_id, action, metadata)
      VALUES (?, ?, 'META_ACCOUNT_UNLINKED', ?)
    `, [(0, uuid_1.v4)(), req.user.id, JSON.stringify({ ip: req.ip })]);
        res.json({ success: true, message: 'Meta account unlinked successfully.' });
    }
    catch (err) {
        console.error('[auth] internal error:', err instanceof Error ? err.message : err);
        res.status(500).json({ error: 'Internal server error. Please try again.' });
    }
});
// 17.1 GET META LINKED STATUS
router.get('/meta/status', auth_middleware_js_1.authMiddleware, async (req, res) => {
    try {
        const identity = await (0, database_js_1.getQuery)("SELECT provider_subject, email_at_link_time, created_at, last_login_at FROM user_identities WHERE user_id = ? AND provider = 'meta'", [req.user.id]);
        res.json({
            isLinked: !!identity,
            linkedEmail: identity?.email_at_link_time || null,
            linkedAt: identity?.created_at || null,
            lastLoginAt: identity?.last_login_at || null,
        });
    }
    catch (err) {
        console.error('[auth] internal error:', err instanceof Error ? err.message : err);
        res.status(500).json({ error: 'Internal server error. Please try again.' });
    }
});
// 18. SIGN IN WITH APPLE AUTHENTICATION
router.post('/apple', async (req, res) => {
    try {
        const { idToken, name, deviceName } = req.body;
        if (!idToken || typeof idToken !== 'string') {
            res.status(400).json({ error: 'Apple ID token is required' });
            return;
        }
        let verifiedAppleUser;
        try {
            verifiedAppleUser = await apple_auth_service_js_1.AppleAuthService.verifyIdToken(idToken);
        }
        catch (tokenErr) {
            res.status(401).json({ error: 'INVALID_APPLE_TOKEN', message: tokenErr.message });
            return;
        }
        let user = await apple_auth_service_js_1.AppleAuthService.findUserByAppleSub(verifiedAppleUser.sub);
        let isNewUser = false;
        if (!user) {
            const existingUserByEmail = await (0, database_js_1.getQuery)('SELECT * FROM users WHERE email = ?', [verifiedAppleUser.email]);
            if (existingUserByEmail) {
                res.status(409).json({
                    error: 'ACCOUNT_EXISTS_UNLINKED',
                    message: 'An account with this email already exists. Please log in with your password to link your Apple ID.',
                    email: verifiedAppleUser.email,
                });
                return;
            }
            user = await apple_auth_service_js_1.AppleAuthService.createAppleUser(verifiedAppleUser, name);
            isNewUser = true;
        }
        else {
            await (0, database_js_1.runQuery)('UPDATE user_identities SET last_login_at = CURRENT_TIMESTAMP WHERE provider = ? AND provider_subject = ?', ['apple', verifiedAppleUser.sub]);
        }
        const scope = (0, context_js_1.currentScope)();
        if (scope) {
            await scope.client.query(`SELECT set_config('app.current_user_id', $1, true)`, [user.id]);
            scope.userId = user.id;
        }
        const deviceId = `dev_${(0, uuid_1.v4)().substring(0, 8)}`;
        await (0, database_js_1.runQuery)(`
      INSERT INTO devices (id, user_id, device_name, ip_address)
      VALUES (?, ?, ?, ?)
    `, [deviceId, user.id, deviceName || 'FinPocket Mobile (Apple SSO)', req.ip || '127.0.0.1']);
        const sessionId = `sess_${(0, uuid_1.v4)().substring(0, 8)}`;
        const rawRefreshToken = crypto_1.default.randomBytes(40).toString('hex');
        const refreshTokenHash = hashToken(rawRefreshToken);
        const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
        await (0, database_js_1.runQuery)(`
      INSERT INTO sessions (id, user_id, device_id, refresh_token_hash, expires_at, is_revoked)
      VALUES (?, ?, ?, ?, ?, 0)
    `, [sessionId, user.id, deviceId, refreshTokenHash, expiresAt]);
        const token = jsonwebtoken_1.default.sign({ userId: user.id, email: user.email, sessionId }, auth_middleware_js_1.JWT_SECRET, { expiresIn: '15m' });
        await (0, database_js_1.runQuery)(`
      INSERT INTO audit_logs (id, user_id, action, metadata)
      VALUES (?, ?, 'APPLE_LOGIN', ?)
    `, [(0, uuid_1.v4)(), user.id, JSON.stringify({
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
    }
    catch (err) {
        console.error('[auth] internal error:', err instanceof Error ? err.message : err);
        res.status(500).json({ error: 'Internal server error. Please try again.' });
    }
});
// 19. EXPLICIT ACCOUNT LINKING: LINK APPLE TO LOGGED-IN ACCOUNT
router.post('/apple/link', auth_middleware_js_1.authMiddleware, async (req, res) => {
    try {
        const { idToken } = req.body;
        if (!idToken || typeof idToken !== 'string') {
            res.status(400).json({ error: 'Apple ID token is required' });
            return;
        }
        const verifiedAppleUser = await apple_auth_service_js_1.AppleAuthService.verifyIdToken(idToken);
        await apple_auth_service_js_1.AppleAuthService.linkAppleAccount(req.user.id, verifiedAppleUser.sub, verifiedAppleUser.email);
        await (0, database_js_1.runQuery)(`
      INSERT INTO audit_logs (id, user_id, action, metadata)
      VALUES (?, ?, 'APPLE_ACCOUNT_LINKED', ?)
    `, [(0, uuid_1.v4)(), req.user.id, JSON.stringify({
                ip: req.ip,
                appleSub: verifiedAppleUser.sub.substring(0, 6) + '***',
            })]);
        res.json({
            success: true,
            message: 'Apple ID linked successfully.',
            provider: 'apple',
            email: verifiedAppleUser.email,
        });
    }
    catch (err) {
        res.status(400).json({ error: err.message });
    }
});
// 20. UNLINK APPLE ACCOUNT
router.delete('/apple/unlink', auth_middleware_js_1.authMiddleware, async (req, res) => {
    try {
        await (0, database_js_1.runQuery)("DELETE FROM user_identities WHERE user_id = ? AND provider = 'apple'", [req.user.id]);
        await (0, database_js_1.runQuery)("UPDATE users SET sso_provider = NULL WHERE id = ? AND sso_provider = 'apple'", [req.user.id]);
        await (0, database_js_1.runQuery)(`
      INSERT INTO audit_logs (id, user_id, action, metadata)
      VALUES (?, ?, 'APPLE_ACCOUNT_UNLINKED', ?)
    `, [(0, uuid_1.v4)(), req.user.id, JSON.stringify({ ip: req.ip })]);
        res.json({ success: true, message: 'Apple ID unlinked successfully.' });
    }
    catch (err) {
        console.error('[auth] internal error:', err instanceof Error ? err.message : err);
        res.status(500).json({ error: 'Internal server error. Please try again.' });
    }
});
// 21. EMAIL AUTH: SEND VERIFICATION OTP
router.post('/email/send-otp', async (req, res) => {
    try {
        const { email, captchaToken } = req.body;
        if (!email || typeof email !== 'string' || !email.includes('@')) {
            res.status(400).json({ error: 'Valid email address is required.' });
            return;
        }
        const cleanEmail = email.toLowerCase().trim();
        if ((0, security_validator_js_1.isDisposableEmail)(cleanEmail)) {
            res.status(400).json({
                error: 'Temporary and disposable email addresses are not permitted. Please use a legitimate personal or business email address.'
            });
            return;
        }
        const localOtpDevelopment = app_config_js_1.config.environment === 'DEVELOPMENT' && process.env.DEV_EXPOSE_OTP === 'true';
        if (!localOtpDevelopment && !await requireSignupCaptcha(req, res, captchaToken))
            return;
        const issueRes = await otp_service_js_1.OtpService.issueOtp({
            destination: cleanEmail,
            destinationType: 'EMAIL',
            purpose: 'REGISTRATION_EMAIL',
            ip: req.ip || null,
            userAgent: req.headers['user-agent'] || null,
        });
        if (!issueRes.success) {
            res.status(429).json({
                error: issueRes.error || 'Please wait before requesting another verification code.',
                retryAfterSeconds: issueRes.retryAfterSeconds,
                expiresInSeconds: issueRes.expiresInSeconds,
            });
            return;
        }
        const exposeOtpForLocalDevelopment = app_config_js_1.config.environment === 'DEVELOPMENT' && process.env.DEV_EXPOSE_OTP === 'true';
        const delivered = exposeOtpForLocalDevelopment
            ? false
            : await email_service_js_1.EmailService.sendRegistrationOtp(cleanEmail, issueRes.otp);
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
    }
    catch (err) {
        console.error('[auth] internal error in email/send-otp:', err instanceof Error ? err.message : err);
        res.status(500).json({ error: 'Failed to send verification code. Please try again.' });
    }
});
// 22. EMAIL AUTH: VERIFY OTP
router.post('/email/verify-otp', async (req, res) => {
    try {
        const { email, otp } = req.body;
        if (!email || !otp) {
            res.status(400).json({ error: 'Email and verification code are required.' });
            return;
        }
        const cleanEmail = email.toLowerCase().trim();
        const verifyRes = await otp_service_js_1.OtpService.verifyOtp({
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
    }
    catch (err) {
        console.error('[auth] internal error in email/verify-otp:', err instanceof Error ? err.message : err);
        res.status(500).json({ error: 'Failed to verify code. Please try again.' });
    }
});
// 23. UNIVERSAL OTP RESEND
router.post('/otp/resend', async (req, res) => {
    try {
        const { destination, type = 'EMAIL', purpose = 'REGISTRATION_EMAIL', captchaToken } = req.body;
        if (!destination || typeof destination !== 'string') {
            res.status(400).json({ error: 'Destination is required.' });
            return;
        }
        if (type === 'EMAIL') {
            const cleanEmail = destination.toLowerCase().trim();
            if (!cleanEmail.includes('@') || (0, security_validator_js_1.isDisposableEmail)(cleanEmail)) {
                res.status(400).json({ error: 'Valid personal or business email address is required.' });
                return;
            }
            const localOtpDevelopment = app_config_js_1.config.environment === 'DEVELOPMENT' && process.env.DEV_EXPOSE_OTP === 'true';
            if (!localOtpDevelopment && !await requireSignupCaptcha(req, res, captchaToken))
                return;
            const issueRes = await otp_service_js_1.OtpService.issueOtp({
                destination: cleanEmail,
                destinationType: 'EMAIL',
                purpose: purpose,
                ip: req.ip || null,
                userAgent: req.headers['user-agent'] || null,
            });
            if (!issueRes.success) {
                res.status(429).json({
                    error: issueRes.error || 'Please wait before requesting another verification code.',
                    retryAfterSeconds: issueRes.retryAfterSeconds,
                    expiresInSeconds: issueRes.expiresInSeconds,
                });
                return;
            }
            const exposeOtpForLocalDevelopment = app_config_js_1.config.environment === 'DEVELOPMENT' && process.env.DEV_EXPOSE_OTP === 'true';
            const delivered = exposeOtpForLocalDevelopment
                ? false
                : await email_service_js_1.EmailService.sendRegistrationOtp(cleanEmail, issueRes.otp);
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
            const phoneValidation = (0, security_validator_js_1.normalizeIndianPhoneNumber)(destination);
            if (!phoneValidation.isValid || !phoneValidation.normalized) {
                res.status(400).json({ error: phoneValidation.error || 'Valid Indian mobile phone number (+91) is required.' });
                return;
            }
            const cleanPhone = phoneValidation.normalized;
            if (!await requireSignupCaptcha(req, res, captchaToken))
                return;
            const issueRes = await otp_service_js_1.OtpService.issueOtp({
                destination: cleanPhone,
                destinationType: 'PHONE',
                purpose: purpose,
                ip: req.ip || null,
                userAgent: req.headers['user-agent'] || null,
            });
            if (!issueRes.success) {
                res.status(429).json({
                    error: issueRes.error || 'Please wait before requesting another verification code.',
                    retryAfterSeconds: issueRes.retryAfterSeconds,
                    expiresInSeconds: issueRes.expiresInSeconds,
                });
                return;
            }
            const delivered = await sms_service_js_1.SmsService.sendOtp(cleanPhone, issueRes.otp);
            if (!delivered) {
                res.status(500).json({ error: 'Failed to deliver SMS verification code. Please try again later.' });
                return;
            }
            res.json({
                success: true,
                message: 'Verification code resent successfully.',
                maskedPhone: (0, security_validator_js_1.maskPhoneNumber)(cleanPhone),
                expiresInSeconds: issueRes.expiresInSeconds,
                resendCooldownSeconds: issueRes.resendCooldownSeconds,
            });
            return;
        }
        res.status(400).json({ error: 'Unsupported destination type. Expected EMAIL or PHONE.' });
    }
    catch (err) {
        console.error('[auth] internal error in /otp/resend:', err instanceof Error ? err.message : err);
        res.status(500).json({ error: 'Internal server error. Please try again.' });
    }
});
// 24. GET CURRENT USER VERIFICATION STATUS
router.get('/verification-status', auth_middleware_js_1.authMiddleware, async (req, res) => {
    try {
        const user = await (0, database_js_1.getQuery)('SELECT email, phone, email_verified, phone_verified FROM users WHERE id = ?', [req.user.id]);
        if (!user) {
            res.status(404).json({ error: 'User not found.' });
            return;
        }
        res.json({
            email: user.email,
            maskedPhone: (0, security_validator_js_1.maskPhoneNumber)(user.phone),
            emailVerified: user.email_verified === 1,
            phoneVerified: user.phone_verified === 1,
        });
    }
    catch (err) {
        console.error('[auth] internal error in /verification-status:', err instanceof Error ? err.message : err);
        res.status(500).json({ error: 'Internal server error. Please try again.' });
    }
});
exports.default = router;
//# sourceMappingURL=auth.routes.js.map