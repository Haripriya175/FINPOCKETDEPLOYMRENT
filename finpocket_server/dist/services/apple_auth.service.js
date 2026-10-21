"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AppleAuthService = void 0;
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const jwks_rsa_1 = __importDefault(require("jwks-rsa"));
const crypto_1 = __importDefault(require("crypto"));
const bcryptjs_1 = __importDefault(require("bcryptjs"));
const uuid_1 = require("uuid");
const database_js_1 = require("../config/database.js");
const app_config_js_1 = require("../config/app_config.js");
const context_js_1 = require("../config/db/context.js");
class AppleAuthService {
    static jwks = (0, jwks_rsa_1.default)({
        jwksUri: 'https://appleid.apple.com/auth/keys',
        cache: true,
        cacheMaxAge: 86400000, // 24 hours
        rateLimit: true,
        jwksRequestsPerMinute: 10,
    });
    static getKey(header, callback) {
        if (!header.kid) {
            return callback(new Error('Apple token header missing kid (Key ID)'));
        }
        AppleAuthService.jwks.getSigningKey(header.kid, (err, key) => {
            if (err)
                return callback(err);
            const signingKey = key?.getPublicKey();
            callback(null, signingKey);
        });
    }
    /**
     * Cryptographically verify an Apple ID Token (JWT) against Apple's public keys
     */
    static async verifyIdToken(idToken) {
        if (!idToken || typeof idToken !== 'string') {
            throw new Error('Apple ID token is required');
        }
        // Mock token support is gated by config.allowMockSso: enabled only in
        // TEST/DEVELOPMENT (or explicit ALLOW_MOCK_SSO=true in dev environments) —
        // DEMO/STAGING/PRODUCTION never accept forged identities.
        if (app_config_js_1.config.allowMockSso && idToken.startsWith('mock_appletoken:')) {
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
            jsonwebtoken_1.default.verify(idToken, this.getKey.bind(this), {
                issuer: 'https://appleid.apple.com',
                algorithms: ['RS256'],
            }, (err, decoded) => {
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
            });
        });
    }
    /**
     * Look up user by Apple provider subject (sub)
     */
    static async findUserByAppleSub(appleSub) {
        const identity = await (0, database_js_1.getQuery)(`SELECT ui.user_id
       FROM user_identities ui
       WHERE ui.provider = 'apple' AND ui.provider_subject = ?`, [appleSub]);
        if (!identity)
            return null;
        return (0, database_js_1.getQuery)('SELECT * FROM users WHERE id = ?', [identity.user_id]);
    }
    /**
     * Link an Apple Identity to an existing authenticated FinPocket user
     */
    static async linkAppleAccount(userId, appleSub, email) {
        const existingSub = await (0, database_js_1.getQuery)('SELECT user_id FROM user_identities WHERE provider = ? AND provider_subject = ?', ['apple', appleSub]);
        if (existingSub) {
            if (existingSub.user_id === userId) {
                await (0, database_js_1.runQuery)('UPDATE user_identities SET last_login_at = CURRENT_TIMESTAMP WHERE provider = ? AND provider_subject = ?', ['apple', appleSub]);
                return;
            }
            throw new Error('This Apple ID is already linked to another FinPocket account.');
        }
        const userAppleIdentity = await (0, database_js_1.getQuery)('SELECT id FROM user_identities WHERE user_id = ? AND provider = ?', [userId, 'apple']);
        if (userAppleIdentity) {
            await (0, database_js_1.runQuery)('UPDATE user_identities SET provider_subject = ?, email_at_link_time = ?, last_login_at = CURRENT_TIMESTAMP WHERE id = ?', [appleSub, email, userAppleIdentity.id]);
        }
        else {
            const identityId = `uid_${(0, uuid_1.v4)().substring(0, 8)}`;
            await (0, database_js_1.runQuery)(`INSERT INTO user_identities (id, user_id, provider, provider_subject, email_at_link_time)
         VALUES (?, ?, 'apple', ?, ?)`, [identityId, userId, appleSub, email]);
        }
        await (0, database_js_1.runQuery)('UPDATE users SET sso_provider = ? WHERE id = ?', ['apple', userId]);
    }
    /**
     * Create a new FinPocket user from a verified Apple token
     */
    static async createAppleUser(appleUser, providedName) {
        const userId = `usr_${(0, uuid_1.v4)().substring(0, 8)}`;
        const randomPassword = crypto_1.default.randomBytes(32).toString('hex') + 'A1!';
        const passwordHash = await bcryptjs_1.default.hash(randomPassword, 10);
        const displayName = providedName?.trim() || appleUser.name || 'Apple User';
        await (0, database_js_1.runQuery)(`INSERT INTO users (id, name, email, password_hash, sso_provider, phone_verified)
       VALUES (?, ?, ?, ?, 'apple', 1)`, [userId, displayName, appleUser.email, passwordHash]);
        await this.linkAppleAccount(userId, appleUser.sub, appleUser.email);
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
exports.AppleAuthService = AppleAuthService;
//# sourceMappingURL=apple_auth.service.js.map