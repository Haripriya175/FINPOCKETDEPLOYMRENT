"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.aiLimiter = exports.paymentsLimiter = exports.authLimiter = exports.generalLimiter = void 0;
const express_rate_limit_1 = __importDefault(require("express-rate-limit"));
const app_config_js_1 = require("../config/app_config.js");
exports.generalLimiter = (0, express_rate_limit_1.default)({
    windowMs: app_config_js_1.config.rateLimits.generalWindowMs,
    max: app_config_js_1.config.rateLimits.generalMax,
    standardHeaders: true,
    legacyHeaders: false,
    message: {
        code: 'RATE_LIMIT_EXCEEDED',
        message: 'Too many requests from this IP, please try again later.',
    }
});
exports.authLimiter = (0, express_rate_limit_1.default)({
    windowMs: app_config_js_1.config.rateLimits.authWindowMs,
    max: app_config_js_1.config.rateLimits.authMax,
    standardHeaders: true,
    legacyHeaders: false,
    message: {
        code: 'AUTH_RATE_LIMIT_EXCEEDED',
        message: 'Too many authentication attempts. Account access is temporarily throttled for security.',
    }
});
exports.paymentsLimiter = (0, express_rate_limit_1.default)({
    windowMs: app_config_js_1.config.rateLimits.paymentsWindowMs,
    max: app_config_js_1.config.rateLimits.paymentsMax,
    standardHeaders: true,
    legacyHeaders: false,
    message: {
        code: 'PAYMENT_RATE_LIMIT_EXCEEDED',
        message: 'Payment initiation rate limit exceeded. Please wait before submitting another transaction.',
    }
});
exports.aiLimiter = (0, express_rate_limit_1.default)({
    windowMs: app_config_js_1.config.rateLimits.aiWindowMs,
    max: app_config_js_1.config.rateLimits.aiMax,
    standardHeaders: true,
    legacyHeaders: false,
    message: {
        code: 'AI_RATE_LIMIT_EXCEEDED',
        message: 'AI assistant query rate limit reached. Please wait before asking more questions.',
    }
});
//# sourceMappingURL=rate_limit.middleware.js.map