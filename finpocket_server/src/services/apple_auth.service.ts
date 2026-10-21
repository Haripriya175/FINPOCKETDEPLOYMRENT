import jwt, { JwtHeader, SigningKeyCallback } from 'jsonwebtoken';
import jwksClient from 'jwks-rsa';
import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import { v4 as uuidv4 } from 'uuid';
import { getQuery, runQuery } from '../config/database.js';
import { config } from '../config/app_config.js';
import { currentScope } from '../config/db/context.js';

export interface VerifiedAppleUser {
  sub: string;
  email: string;
  name?: string;
  emailVerified: boolean;
}

export class AppleAuthService {
  private static jwks = jwksClient({
    jwksUri: 'https://appleid.apple.com/auth/keys',
    cache: true,
    cacheMaxAge: 86400000, // 24 hours
    rateLimit: true,
    jwksRequestsPerMinute: 10,
  });

  private static getKey(header: JwtHeader, callback: SigningKeyCallback): void {
    if (!header.kid) {
      return callback(new Error('Apple token header missing kid (Key ID)'));
    }
    AppleAuthService.jwks.getSigningKey(header.kid, (err, key) => {
      if (err) return callback(err);
      const signingKey = key?.getPublicKey();
      callback(null, signingKey);
    });
  }

  /**
   * Cryptographically verify an Apple ID Token (JWT) against Apple's public keys
   */
  static async verifyIdToken(idToken: string): Promise<VerifiedAppleUser> {
    if (!idToken || typeof idToken !== 'string') {
      throw new Error('Apple ID token is required');
    }

    // Mock token support is gated by config.allowMockSso: enabled only in
    // TEST/DEVELOPMENT (or explicit ALLOW_MOCK_SSO=true in dev environments) —
    // DEMO/STAGING/PRODUCTION never accept forged identities.
    if (config.allowMockSso && idToken.startsWith('mock_appletoken:')) {
      const parts = idToken.split(':');
      const mockSub = parts[1] || 'apple_sub_test_123';
      const mockEmail = parts[2] || 'testuser@privaterelay.appleid.com';
      return {
        sub: mockSub,
        email: mockEmail.toLowerCase().trim(),
        name: 'Apple Verified User',
        emailVerified: true,
      };
    }

    return new Promise((resolve, reject) => {
      jwt.verify(
        idToken,
        this.getKey.bind(this),
        {
          issuer: 'https://appleid.apple.com',
          algorithms: ['RS256'],
        },
        (err, decoded: any) => {
          if (err) {
            return reject(new Error(`Apple ID token verification failed: ${err.message}`));
          }

          if (!decoded || !decoded.sub) {
            return reject(new Error('Apple token payload missing subject (sub)'));
          }

          resolve({
            sub: decoded.sub,
            email: (decoded.email || `${decoded.sub}@privaterelay.appleid.com`).toLowerCase().trim(),
            emailVerified: decoded.email_verified === 'true' || decoded.email_verified === true,
          });
        }
      );
    });
  }

  /**
   * Look up user by Apple provider subject (sub)
   */
  static async findUserByAppleSub(appleSub: string): Promise<any | null> {
    const identity = await getQuery<any>(
      `SELECT ui.user_id
       FROM user_identities ui
       WHERE ui.provider = 'apple' AND ui.provider_subject = ?`,
      [appleSub]
    );
    if (!identity) return null;
    return getQuery<any>('SELECT * FROM users WHERE id = ?', [identity.user_id]);
  }

  /**
   * Link an Apple Identity to an existing authenticated FinPocket user
   */
  static async linkAppleAccount(userId: string, appleSub: string, email: string): Promise<void> {
    const existingSub = await getQuery<any>(
      'SELECT user_id FROM user_identities WHERE provider = ? AND provider_subject = ?',
      ['apple', appleSub]
    );

    if (existingSub) {
      if (existingSub.user_id === userId) {
        await runQuery(
          'UPDATE user_identities SET last_login_at = CURRENT_TIMESTAMP WHERE provider = ? AND provider_subject = ?',
          ['apple', appleSub]
        );
        return;
      }
      throw new Error('This Apple ID is already linked to another FinPocket account.');
    }

    const userAppleIdentity = await getQuery<any>(
      'SELECT id FROM user_identities WHERE user_id = ? AND provider = ?',
      [userId, 'apple']
    );

    if (userAppleIdentity) {
      await runQuery(
        'UPDATE user_identities SET provider_subject = ?, email_at_link_time = ?, last_login_at = CURRENT_TIMESTAMP WHERE id = ?',
        [appleSub, email, userAppleIdentity.id]
      );
    } else {
      const identityId = `uid_${uuidv4().substring(0, 8)}`;
      await runQuery(
        `INSERT INTO user_identities (id, user_id, provider, provider_subject, email_at_link_time)
         VALUES (?, ?, 'apple', ?, ?)`,
        [identityId, userId, appleSub, email]
      );
    }

    await runQuery('UPDATE users SET sso_provider = ? WHERE id = ?', ['apple', userId]);
  }

  /**
   * Create a new FinPocket user from a verified Apple token
   */
  static async createAppleUser(appleUser: VerifiedAppleUser, providedName?: string): Promise<any> {
    const userId = `usr_${uuidv4().substring(0, 8)}`;
    const randomPassword = crypto.randomBytes(32).toString('hex') + 'A1!';
    const passwordHash = await bcrypt.hash(randomPassword, 10);
    const displayName = providedName?.trim() || appleUser.name || 'Apple User';

    await runQuery(
      `INSERT INTO users (id, name, email, password_hash, sso_provider, phone_verified)
       VALUES (?, ?, ?, ?, 'apple', 1)`,
      [userId, displayName, appleUser.email, passwordHash]
    );

    await this.linkAppleAccount(userId, appleUser.sub, appleUser.email);

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
