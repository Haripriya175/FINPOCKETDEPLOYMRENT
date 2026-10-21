import { OAuth2Client, TokenPayload } from 'google-auth-library';
import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import { v4 as uuidv4 } from 'uuid';
import { getQuery, runQuery } from '../config/database';
import { AppConfig, config } from '../config/app_config';
import { currentScope } from '../config/db/context.js';

export interface VerifiedGoogleUser {
  sub: string;
  email: string;
  name: string;
  picture?: string;
  emailVerified: boolean;
}

export class GoogleAuthService {
  private static oauthClient = new OAuth2Client();

  /**
   * Allowed Google Client IDs across environments (server/web, Android, iOS)
   */
  private static getAllowedAudiences(): string[] {
    // The audience allow-list comes EXCLUSIVELY from configuration — baked-in
    // client IDs (including the old 'dummy-*' placeholders) would be honoured
    // in every environment forever. Configure GOOGLE_CLIENT_ID /
    // GOOGLE_SERVER_CLIENT_ID (the app's web/server client) and
    // GOOGLE_EXTRA_CLIENT_IDS (comma-separated Android/iOS OAuth clients).
    const audiences = [
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_SERVER_CLIENT_ID,
      ...(process.env.GOOGLE_EXTRA_CLIENT_IDS || '').split(','),
    ].map((s) => (s || '').trim()).filter(Boolean);
    return [...new Set(audiences)];
  }

  /**
   * Cryptographically verify the Google ID token using Google Public Keys
   * Validates: signature, issuer, audience, exp, email_verified
   */
  static async verifyIdToken(idToken: string): Promise<VerifiedGoogleUser> {
    if (!idToken || typeof idToken !== 'string') {
      throw new Error('Google ID token is required');
    }

    // Mock token support ('mock_gtoken:') is gated by config.allowMockSso:
    // enabled only in TEST/DEVELOPMENT (or an explicit ALLOW_MOCK_SSO=true
    // in dev environments) — DEMO/STAGING/PRODUCTION never accept forged
    // identities as verified users (Phase A finding, CRITICAL 2).
    if (config.allowMockSso && idToken.startsWith('mock_gtoken:')) {
      const parts = idToken.split(':');
      const mockSub = parts[1] || 'google_sub_test_123';
      const mockEmail = parts[2] || 'testuser@gmail.com';
      return {
        sub: mockSub,
        email: mockEmail.toLowerCase().trim(),
        name: 'Mock Verified Google User',
        emailVerified: true,
      };
    }

    try {
      const allowedAudiences = this.getAllowedAudiences();
      if (allowedAudiences.length === 0) {
        // Fail closed: without a configured audience the server cannot tell a
        // genuine Google token for OUR app from one minted for any other app.
        throw new Error('Google Sign-In is not configured on this server (set GOOGLE_CLIENT_ID).');
      }
      const ticket = await this.oauthClient.verifyIdToken({
        idToken,
        audience: allowedAudiences,
      });

      const payload: TokenPayload | undefined = ticket.getPayload();
      if (!payload) {
        throw new Error('Invalid Google ID token payload');
      }

      // 1. Verify Issuer
      const validIssuers = ['accounts.google.com', 'https://accounts.google.com'];
      if (!payload.iss || !validIssuers.includes(payload.iss)) {
        throw new Error(`Invalid token issuer: ${payload.iss}`);
      }

      // 2. Verify Expiration
      const nowSeconds = Math.floor(Date.now() / 1000);
      if (!payload.exp || payload.exp < nowSeconds) {
        throw new Error('Google ID token has expired');
      }

      // 3. Verify stable subject identifier
      if (!payload.sub) {
        throw new Error('Missing Google sub identifier');
      }

      // 4. Verify Email & Email Verification status
      if (!payload.email) {
        throw new Error('Google account has no associated email');
      }

      if (!payload.email_verified) {
        throw new Error('Google email address is not verified by Google');
      }

      return {
        sub: payload.sub,
        email: payload.email.toLowerCase().trim(),
        name: payload.name || payload.email.split('@')[0],
        picture: payload.picture,
        emailVerified: true,
      };
    } catch (error: any) {
      throw new Error(`Google token verification failed: ${error.message}`);
    }
  }

  /**
   * Look up user by Google sub identifier
   */
  static async findUserByGoogleSub(googleSub: string): Promise<any | null> {
    const identity = await getQuery<any>(
      `SELECT ui.user_id
       FROM user_identities ui
       WHERE ui.provider = 'google' AND ui.provider_subject = ?`,
      [googleSub]
    );
    if (!identity) return null;
    return getQuery<any>('SELECT * FROM users WHERE id = ?', [identity.user_id]);
  }

  /**
   * Link a Google Identity to an existing authenticated FinPocket user
   * Strictly prevents duplicate sub linking across different users
   */
  static async linkGoogleAccount(userId: string, googleSub: string, email: string): Promise<void> {
    // 1. Check if this Google sub is already linked to anyone
    const existingSub = await getQuery<any>(
      'SELECT user_id FROM user_identities WHERE provider = ? AND provider_subject = ?',
      ['google', googleSub]
    );

    if (existingSub) {
      if (existingSub.user_id === userId) {
        // Already linked to this user, update last_login_at
        await runQuery(
          'UPDATE user_identities SET last_login_at = CURRENT_TIMESTAMP WHERE provider = ? AND provider_subject = ?',
          ['google', googleSub]
        );
        return;
      }
      throw new Error('This Google account is already linked to another FinPocket account.');
    }

    // 2. Check if user already has a Google identity linked
    const userGoogleIdentity = await getQuery<any>(
      'SELECT id FROM user_identities WHERE user_id = ? AND provider = ?',
      [userId, 'google']
    );

    if (userGoogleIdentity) {
      // Update the subject
      await runQuery(
        'UPDATE user_identities SET provider_subject = ?, email_at_link_time = ?, last_login_at = CURRENT_TIMESTAMP WHERE id = ?',
        [googleSub, email, userGoogleIdentity.id]
      );
    } else {
      // Insert new identity mapping
      const identityId = `uid_${uuidv4().substring(0, 8)}`;
      await runQuery(
        `INSERT INTO user_identities (id, user_id, provider, provider_subject, email_at_link_time)
         VALUES (?, ?, 'google', ?, ?)`,
        [identityId, userId, googleSub, email]
      );
    }

    // Mark SSO provider flag on user for quick reference
    await runQuery('UPDATE users SET sso_provider = ? WHERE id = ?', ['google', userId]);
  }

  /**
   * Unlink Google Identity for an authenticated user
   */
  static async unlinkGoogleAccount(userId: string): Promise<void> {
    await runQuery(
      'DELETE FROM user_identities WHERE user_id = ? AND provider = ?',
      [userId, 'google']
    );
    await runQuery(
      "UPDATE users SET sso_provider = NULL WHERE id = ? AND sso_provider = 'google'",
      [userId]
    );
  }

  /**
   * Create a new FinPocket user from a verified Google token
   */
  static async createGoogleUser(googleUser: VerifiedGoogleUser): Promise<any> {
    const userId = `usr_${uuidv4().substring(0, 8)}`;
    const randomPassword = crypto.randomBytes(32).toString('hex') + 'A1!';
    const passwordHash = await bcrypt.hash(randomPassword, 10);

    await runQuery(
      `INSERT INTO users (id, name, email, password_hash, sso_provider, phone_verified)
       VALUES (?, ?, ?, ?, 'google', 1)`,
      [userId, googleUser.name, googleUser.email, passwordHash]
    );

    // Create the identity link
    await this.linkGoogleAccount(userId, googleUser.sub, googleUser.email);

    // Phase D RLS: bind new identity context before writing emergency_funds
    const scope = currentScope();
    if (scope) {
      await scope.client.query(`SELECT set_config('app.current_user_id', $1, true)`, [userId]);
      scope.userId = userId;
    }

    // No fake bank account is created on signup — a new user starts with zero
    // accounts and a ₹0 balance until they connect a real bank (AA consent or
    // real bank SMS import). See auth.routes.ts for the full rationale.
    await runQuery(
      `INSERT INTO emergency_funds (id, user_id, target_amount, current_amount, monthly_contribution)
       VALUES (?, ?, 100000.0, 0.0, 0.0)`,
      [`emf_${uuidv4().substring(0, 8)}`, userId]
    );

    return getQuery<any>('SELECT * FROM users WHERE id = ?', [userId]);
  }
}
