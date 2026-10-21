import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import { v4 as uuidv4 } from 'uuid';
import { getQuery, runQuery } from '../config/database.js';
import { config } from '../config/app_config.js';
import { currentScope } from '../config/db/context.js';

export interface VerifiedMetaUser {
  sub: string;
  email: string;
  name: string;
  picture?: string;
}

export class MetaAuthService {
  /**
   * Generates appsecret_proof for secure Meta Graph API calls
   */
  private static generateAppSecretProof(accessToken: string): string | null {
    const appSecret = process.env.META_APP_SECRET;
    if (!appSecret) return null;
    return crypto.createHmac('sha256', appSecret).update(accessToken).digest('hex');
  }

  /**
   * Verifies the Meta (Facebook) User Access Token against Meta Graph API
   */
  static async verifyAccessToken(accessToken: string): Promise<VerifiedMetaUser> {
    if (!accessToken || typeof accessToken !== 'string') {
      throw new Error('Meta access token is required');
    }

    // Mock token support is gated by config.allowMockSso: enabled only in
    // TEST/DEVELOPMENT (or explicit ALLOW_MOCK_SSO=true in dev environments) —
    // DEMO/STAGING/PRODUCTION never accept forged identities.
    if (config.allowMockSso && accessToken.startsWith('mock_metatoken:')) {
      const parts = accessToken.split(':');
      const mockSub = parts[1] || 'meta_sub_test_123';
      const mockEmail = parts[2] || 'testmeta@facebook.com';
      return {
        sub: mockSub,
        email: mockEmail.toLowerCase().trim(),
        name: 'Meta User',
      };
    }

    try {
      const proof = this.generateAppSecretProof(accessToken);
      let url = `https://graph.facebook.com/v19.0/me?fields=id,name,email,picture.width(200).height(200)&access_token=${encodeURIComponent(accessToken)}`;
      if (proof) {
        url += `&appsecret_proof=${proof}`;
      }

      const res = await fetch(url, { signal: AbortSignal.timeout(10000) });
      const data: any = await res.json();

      if (data.error) {
        throw new Error(data.error.message || 'Meta token validation failed');
      }

      if (!data.id) {
        throw new Error('Meta response missing user ID');
      }

      const email = (data.email || `${data.id}@meta.finpocket.internal`).toLowerCase().trim();
      const picture = data.picture?.data?.url;

      return {
        sub: data.id,
        email,
        name: data.name || 'Meta User',
        picture,
      };
    } catch (err: any) {
      throw new Error(`Meta verification failed: ${err.message}`);
    }
  }

  /**
   * Look up user by Meta provider subject (Facebook ID)
   */
  static async findUserByMetaSub(metaSub: string): Promise<any | null> {
    const identity = await getQuery<any>(
      `SELECT ui.user_id
       FROM user_identities ui
       WHERE ui.provider = 'meta' AND ui.provider_subject = ?`,
      [metaSub]
    );
    if (!identity) return null;
    return getQuery<any>('SELECT * FROM users WHERE id = ?', [identity.user_id]);
  }

  /**
   * Link a Meta Identity to an existing authenticated FinPocket user
   */
  static async linkMetaAccount(userId: string, metaSub: string, email: string): Promise<void> {
    const existingSub = await getQuery<any>(
      'SELECT user_id FROM user_identities WHERE provider = ? AND provider_subject = ?',
      ['meta', metaSub]
    );

    if (existingSub) {
      if (existingSub.user_id === userId) {
        await runQuery(
          'UPDATE user_identities SET last_login_at = CURRENT_TIMESTAMP WHERE provider = ? AND provider_subject = ?',
          ['meta', metaSub]
        );
        return;
      }
      throw new Error('This Facebook/Meta account is already linked to another FinPocket account.');
    }

    const userMetaIdentity = await getQuery<any>(
      'SELECT id FROM user_identities WHERE user_id = ? AND provider = ?',
      [userId, 'meta']
    );

    if (userMetaIdentity) {
      await runQuery(
        'UPDATE user_identities SET provider_subject = ?, email_at_link_time = ?, last_login_at = CURRENT_TIMESTAMP WHERE id = ?',
        [metaSub, email, userMetaIdentity.id]
      );
    } else {
      const identityId = `uid_${uuidv4().substring(0, 8)}`;
      await runQuery(
        `INSERT INTO user_identities (id, user_id, provider, provider_subject, email_at_link_time)
         VALUES (?, ?, 'meta', ?, ?)`,
        [identityId, userId, metaSub, email]
      );
    }

    await runQuery('UPDATE users SET sso_provider = ? WHERE id = ?', ['meta', userId]);
  }

  /**
   * Create a new FinPocket user from a verified Meta profile
   */
  static async createMetaUser(metaUser: VerifiedMetaUser): Promise<any> {
    const userId = `usr_${uuidv4().substring(0, 8)}`;
    const randomPassword = crypto.randomBytes(32).toString('hex') + 'A1!';
    const passwordHash = await bcrypt.hash(randomPassword, 10);

    await runQuery(
      `INSERT INTO users (id, name, email, password_hash, sso_provider, phone_verified)
       VALUES (?, ?, ?, ?, 'meta', 1)`,
      [userId, metaUser.name, metaUser.email, passwordHash]
    );

    await this.linkMetaAccount(userId, metaUser.sub, metaUser.email);

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
