"use strict";
/**
 * FinPocket Comprehensive Security & Validation Utility
 * Enforces Banking-grade Password Policy, Disposable Email Detection,
 * and Privacy Masking.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.validatePasswordPolicy = validatePasswordPolicy;
exports.isDisposableEmail = isDisposableEmail;
exports.maskPhoneNumber = maskPhoneNumber;
exports.maskName = maskName;
exports.normalizeIndianPhoneNumber = normalizeIndianPhoneNumber;
// Comprehensive blacklist of temporary and disposable email providers
const DISPOSABLE_EMAIL_DOMAINS = new Set([
    'mailinator.com',
    'tempmail.com',
    'temp-mail.org',
    '10minutemail.com',
    'guerrillamail.com',
    'guerrillamail.net',
    'guerrillamail.org',
    'throwawaymail.com',
    'yopmail.com',
    'sharklasers.com',
    'dispostable.com',
    'getairmail.com',
    'fakemailgenerator.com',
    'trashmail.com',
    'trashmail.net',
    'nada.ltd',
    'mohmal.com',
    'crazymailing.com',
    'inboxkitten.com',
    'fakeinbox.com',
    'burnermail.io',
    'mytemp.email',
    'emailondeck.com',
    'maildrop.cc',
    'generator.email',
    'tempail.com',
    'disposablemail.com',
    'dropmail.me',
    'getnada.com',
    'airmail.news',
    'armyspy.com',
    'cuvox.de',
    'dayrep.com',
    'fleckens.hu',
    'gustr.com',
    'jourrapide.com',
    'rhyta.com',
    'superrito.com',
    'teleworm.us',
    'tinypaste.com'
]);
// Top common insecure passwords blocked outright
const COMMON_WEAK_PASSWORDS = new Set([
    'password', 'password123', 'admin', 'admin123', '12345678', '123456789',
    'qwerty', 'qwerty123', 'welcome', 'welcome123', 'finpocket', 'finpocket123',
    'letmein', 'monkey', 'dragon', 'football', 'master', 'sunshine', 'iloveyou'
]);
function validatePasswordPolicy(password, userDetails, options = {}) {
    const errors = [];
    let score = 0;
    if (!password || typeof password !== 'string') {
        return {
            isValid: false,
            score: 0,
            strengthLabel: 'Weak',
            errors: ['Password is required.']
        };
    }
    // 1. Length Requirement (Min 8, Max 64)
    if (password.length < 8) {
        errors.push('Password must be at least 8 characters long.');
    }
    else if (password.length >= 12) {
        score += 1;
    }
    // 2. Character Complexity Checks
    const hasUpper = /[A-Z]/.test(password);
    const hasLower = /[a-z]/.test(password);
    const hasDigit = /[0-9]/.test(password);
    const hasSpecial = /[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?`~]/.test(password);
    if (!hasUpper)
        errors.push('Must contain at least one uppercase letter (A-Z).');
    if (!hasLower)
        errors.push('Must contain at least one lowercase letter (a-z).');
    if (!hasDigit)
        errors.push('Must contain at least one number (0-9).');
    if (!hasSpecial)
        errors.push('Must contain at least one special character (!@#$%^&*...).');
    const complexityCount = [hasUpper, hasLower, hasDigit, hasSpecial].filter(Boolean).length;
    if (complexityCount >= 3)
        score += 1;
    if (complexityCount === 4)
        score += 1;
    // 3. Common Password Rejection
    if (COMMON_WEAK_PASSWORDS.has(password.toLowerCase())) {
        errors.push('This password is too common and easily guessable.');
        score = 0;
    }
    // 4. Personal Information Disallowance
    if (userDetails?.name && userDetails.name.length > 3) {
        const nameParts = userDetails.name.toLowerCase().split(/\s+/);
        for (const part of nameParts) {
            if (part.length >= 3 && password.toLowerCase().includes(part)) {
                errors.push('Password cannot contain parts of your name.');
                break;
            }
        }
    }
    if (!options.allowEmailUsername && userDetails?.email && userDetails.email.includes('@')) {
        const emailPrefix = userDetails.email.split('@')[0].toLowerCase();
        if (emailPrefix.length >= 3 && password.toLowerCase().includes(emailPrefix)) {
            errors.push('Password cannot contain your email username.');
        }
    }
    if (errors.length === 0 && score >= 2)
        score += 1;
    score = Math.min(4, Math.max(score, errors.length === 0 ? 3 : 1));
    const strengthLabel = score >= 4 ? 'Strong' : score >= 3 ? 'Good' : score >= 2 ? 'Fair' : 'Weak';
    return {
        isValid: errors.length === 0,
        score,
        strengthLabel,
        errors
    };
}
function isDisposableEmail(email) {
    if (!email || !email.includes('@'))
        return false;
    const domain = email.split('@')[1]?.toLowerCase().trim();
    if (!domain)
        return false;
    return DISPOSABLE_EMAIL_DOMAINS.has(domain);
}
function maskPhoneNumber(phone) {
    if (!phone)
        return '';
    const cleaned = phone.replace(/\s+/g, '');
    if (cleaned.length <= 4)
        return '••••';
    const prefix = cleaned.startsWith('+') ? cleaned.slice(0, 3) : '';
    const lastFour = cleaned.slice(-4);
    return `${prefix} ******${lastFour}`;
}
function maskName(fullName) {
    if (!fullName)
        return '';
    const parts = fullName.trim().split(/\s+/);
    return parts.map(part => {
        if (part.length <= 1)
            return part;
        return part[0] + '*'.repeat(Math.max(1, part.length - 1));
    }).join(' ');
}
/**
 * Normalizes and validates Indian mobile phone numbers (+91).
 * Accepts formats: +919876543210, 919876543210, 09876543210, 9876543210 (with optional spaces/hyphens).
 * Validates that the number has exactly 10 digits and starts with 6, 7, 8, or 9 (TRAI mobile numbering plan).
 * Rejects non-Indian numbers and invalid lengths.
 */
function normalizeIndianPhoneNumber(phone) {
    if (!phone || typeof phone !== 'string') {
        return {
            isValid: false,
            error: 'Mobile phone number is required.'
        };
    }
    // Strip whitespace, hyphens, parentheses, and dots
    let cleaned = phone.replace(/[\s\-\(\)\.]+/g, '').trim();
    // If starts with +91, strip it
    if (cleaned.startsWith('+91')) {
        cleaned = cleaned.substring(3);
    }
    else if (cleaned.startsWith('+')) {
        return {
            isValid: false,
            error: 'Only Indian mobile numbers with +91 country code are supported.'
        };
    }
    else if (cleaned.startsWith('0')) {
        // 0 trunk prefix commonly used in India
        cleaned = cleaned.substring(1);
    }
    else if (cleaned.startsWith('91') && cleaned.length === 12) {
        // 91 prefix without plus sign
        cleaned = cleaned.substring(2);
    }
    // Check 10-digit requirement
    if (!/^\d{10}$/.test(cleaned)) {
        return {
            isValid: false,
            error: 'Mobile number must be a valid 10-digit number.'
        };
    }
    // Indian mobile numbering plan: must start with 6, 7, 8, or 9
    if (!/^[6-9]/.test(cleaned)) {
        return {
            isValid: false,
            error: 'Invalid Indian mobile number. Mobile numbers must start with 6, 7, 8, or 9.'
        };
    }
    return {
        isValid: true,
        normalized: `+91${cleaned}`,
        raw10Digits: cleaned
    };
}
//# sourceMappingURL=security.validator.js.map