"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.sanitizeErrorResponse = sanitizeErrorResponse;
exports.errorHandler = errorHandler;
const app_config_js_1 = require("../config/app_config.js");
function sanitizeErrorResponse(err, requestId, isProduction = true) {
    const code = err.code || 'INTERNAL_SERVER_ERROR';
    const safeMessage = isProduction
        ? 'An unexpected error occurred. Please contact support with your Request ID.'
        : err.message || 'Internal Server Error';
    return {
        code,
        message: safeMessage,
        requestId,
        ...(!isProduction ? { debugDetails: err.message } : {})
    };
}
function errorHandler(err, req, res, _next) {
    const statusCode = err.statusCode || 500;
    const requestId = req.requestId || res.getHeader('x-request-id') || 'req_unknown';
    const code = err.code || (statusCode === 404 ? 'NOT_FOUND' : statusCode === 400 ? 'BAD_REQUEST' : statusCode === 401 ? 'UNAUTHORIZED' : statusCode === 403 ? 'FORBIDDEN' : 'INTERNAL_SERVER_ERROR');
    // Log internal details securely
    console.error(`[ERROR HANDLER] [${requestId}] ${err.name}: ${err.message}`, {
        stack: app_config_js_1.config.environment !== 'PRODUCTION' ? err.stack : undefined,
        url: req.originalUrl,
        method: req.method,
        statusCode,
    });
    const responseBody = sanitizeErrorResponse(err, requestId, app_config_js_1.config.environment === 'PRODUCTION' && statusCode >= 500);
    res.status(statusCode).json({
        ...responseBody,
        code,
    });
}
//# sourceMappingURL=error_handler.middleware.js.map