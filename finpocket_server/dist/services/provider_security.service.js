"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ProviderSecurityService = void 0;
const crypto_1 = __importDefault(require("crypto"));
const app_config_js_1 = require("../config/app_config.js");
class ProviderSecurityService {
    static algorithm = 'aes-256-gcm';
    /**
     * Derive a dedicated 32-byte encryption key using HKDF (RFC 5869)
     * with explicit salt and domain separation context ('finpocket-provider-token-encryption-v1').
     */
    static getEncryptionKey() {
        const rawSecret = process.env.PROVIDER_ENCRYPTION_KEY || app_config_js_1.config.jwtSecret;
        if (!rawSecret) {
            // Fail closed — never fall back to a committed key for token encryption.
            throw new Error('[provider-security] PROVIDER_ENCRYPTION_KEY (or JWT_SECRET) must be configured to encrypt provider tokens.');
        }
        const salt = Buffer.from('finpocket-provider-token-salt-v1', 'utf8');
        const info = Buffer.from('finpocket-provider-token-encryption-v1', 'utf8');
        // HKDF (HMAC-based Extract-and-Expand Key Derivation)
        const derivedKey = crypto_1.default.hkdfSync('sha256', rawSecret, salt, info, 32);
        return Buffer.from(derivedKey);
    }
    /**
     * Encrypt sensitive provider tokens using AES-256-GCM.
     */
    static encryptToken(plainText) {
        if (!plainText)
            return '';
        const iv = crypto_1.default.randomBytes(12);
        const cipher = crypto_1.default.createCipheriv(this.algorithm, this.getEncryptionKey(), iv);
        let encrypted = cipher.update(plainText, 'utf8', 'hex');
        encrypted += cipher.final('hex');
        const authTag = cipher.getAuthTag().toString('hex');
        return `${iv.toString('hex')}:${authTag}:${encrypted}`;
    }
    /**
     * Decrypt sensitive provider tokens using AES-256-GCM.
     */
    static decryptToken(encryptedPayload) {
        if (!encryptedPayload)
            return '';
        const parts = encryptedPayload.split(':');
        if (parts.length !== 3) {
            throw new Error('Invalid encrypted payload format.');
        }
        const [ivHex, authTagHex, encryptedHex] = parts;
        const iv = Buffer.from(ivHex, 'hex');
        const authTag = Buffer.from(authTagHex, 'hex');
        const decipher = crypto_1.default.createDecipheriv(this.algorithm, this.getEncryptionKey(), iv);
        decipher.setAuthTag(authTag);
        let decrypted = decipher.update(encryptedHex, 'hex', 'utf8');
        decrypted += decipher.final('utf8');
        return decrypted;
    }
    /**
     * Redact sensitive provider credentials and account numbers from logs and client responses.
     */
    static maskAccountNumber(accountNumber) {
        if (!accountNumber || accountNumber.length < 4)
            return '•••• 0000';
        const last4 = accountNumber.slice(-4);
        return `•••• ${last4}`;
    }
}
exports.ProviderSecurityService = ProviderSecurityService;
//# sourceMappingURL=provider_security.service.js.map