"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.MetaAuthService = void 0;
const crypto_1 = __importDefault(require("crypto"));
const bcryptjs_1 = __importDefault(require("bcryptjs"));
const uuid_1 = require("uuid");
const database_js_1 = require("../config/database.js");
const app_config_js_1 = require("../config/app_config.js");
const context_js_1 = require("../config/db/context.js");
class MetaAuthService {
    /**
     * Generates appsecret_proof for secure Meta Graph API calls
     */
    static generateAppSecretProof(accessToken) {
        const appSecret = process.env.META_APP_SECRET;
        if (!appSecret)
            return null;
        return crypto_1.default.createHmac('sha256', appSecret).update(accessToken).digest('hex');
    }
    /**
     * Verifies the Meta (Facebook) User Access Token against Meta Graph API
     */
    static async verifyAccessToken(accessToken) {
        if (!accessToken || typeof accessToken !== 'string') {
            throw new Error('Meta access token is required');
        }
        // Mock token support is gated by config.allowMockSso: enabled only in
        // TEST/DEVELOPMENT (or explicit ALLOW_MOCK_SSO=true in dev environments) —
        // DEMO/STAGING/PRODUCTION never accept forged identities.
        if (app_config_js_1.config.allowMockSso && accessToken.startsWith('mock_metatoken:')) {
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
            const data = await res.json();
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
        }
        catch (err) {
            throw new Error(`Meta verification failed: ${err.message}`);
        }
    }
    /**
     * Look up user by Meta provider subject (Facebook ID)
     */
    static async findUserByMetaSub(metaSub) {
        const identity = await (0, database_js_1.getQuery)(`SELECT ui.user_id
       FROM user_identities ui
       WHERE ui.provider = 'meta' AND ui.provider_subject = ?`, [metaSub]);
        if (!identity)
            return null;
        return (0, database_js_1.getQuery)('SELECT * FROM users WHERE id = ?', [identity.user_id]);
    }
    /**
     * Link a Meta Identity to an existing authenticated FinPocket user
     */
    static async linkMetaAccount(userId, metaSub, email) {
        const existingSub = await (0, database_js_1.getQuery)('SELECT user_id FROM user_identities WHERE provider = ? AND provider_subject = ?', ['meta', metaSub]);
        if (existingSub) {
            if (existingSub.user_id === userId) {
                await (0, database_js_1.runQuery)('UPDATE user_identities SET last_login_at = CURRENT_TIMESTAMP WHERE provider = ? AND provider_subject = ?', ['meta', metaSub]);
                return;
            }
            throw new Error('This Facebook/Meta account is already linked to another FinPocket account.');
        }
        const userMetaIdentity = await (0, database_js_1.getQuery)('SELECT id FROM user_identities WHERE user_id = ? AND provider = ?', [userId, 'meta']);
        if (userMetaIdentity) {
            await (0, database_js_1.runQuery)('UPDATE user_identities SET provider_subject = ?, email_at_link_time = ?, last_login_at = CURRENT_TIMESTAMP WHERE id = ?', [metaSub, email, userMetaIdentity.id]);
        }
        else {
            const identityId = `uid_${(0, uuid_1.v4)().substring(0, 8)}`;
            await (0, database_js_1.runQuery)(`INSERT INTO user_identities (id, user_id, provider, provider_subject, email_at_link_time)
         VALUES (?, ?, 'meta', ?, ?)`, [identityId, userId, metaSub, email]);
        }
        await (0, database_js_1.runQuery)('UPDATE users SET sso_provider = ? WHERE id = ?', ['meta', userId]);
    }
    /**
     * Create a new FinPocket user from a verified Meta profile
     */
    static async createMetaUser(metaUser) {
        const userId = `usr_${(0, uuid_1.v4)().substring(0, 8)}`;
        const randomPassword = crypto_1.default.randomBytes(32).toString('hex') + 'A1!';
        const passwordHash = await bcryptjs_1.default.hash(randomPassword, 10);
        await (0, database_js_1.runQuery)(`INSERT INTO users (id, name, email, password_hash, sso_provider, phone_verified)
       VALUES (?, ?, ?, ?, 'meta', 1)`, [userId, metaUser.name, metaUser.email, passwordHash]);
        await this.linkMetaAccount(userId, metaUser.sub, metaUser.email);
        // Phase D RLS: bind new identity context before writing emergency_funds
        const scope = (0, context_js_1.currentScope)();
        if (scope) {
            await scope.client.query(`SELECT set_config('app.current_user_id', $1, true)`, [userId]);
            scope.userId = userId;
        }
        // No fake bank account is created on signup — a new user starts with zero
        // accounts and a ₹0 balance until they connect a real bank (AA consent or
        // real bank SMS import). See auth.routes.ts for the full rationale.
        await (0, database_js_1.runQuery)(`INSERT INTO emergency_funds (id, user_id, target_amount, current_amount, monthly_contribution)
       VALUES (?, ?, 100000.0, 0.0, 0.0)`, [`emf_${(0, uuid_1.v4)().substring(0, 8)}`, userId]);
        return (0, database_js_1.getQuery)('SELECT * FROM users WHERE id = ?', [userId]);
    }
}
exports.MetaAuthService = MetaAuthService;
//# sourceMappingURL=meta_auth.service.js.map