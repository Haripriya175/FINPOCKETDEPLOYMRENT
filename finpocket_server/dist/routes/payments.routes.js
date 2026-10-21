"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const crypto_1 = __importDefault(require("crypto"));
const auth_middleware_js_1 = require("../middleware/auth.middleware.js");
const payments_service_js_1 = require("../services/payments.service.js");
const database_js_1 = require("../config/database.js");
const router = (0, express_1.Router)();
router.post('/simulate-affordability', auth_middleware_js_1.authMiddleware, async (req, res) => {
    try {
        const { amount } = req.body;
        if (!amount || amount <= 0) {
            res.status(400).json({ error: 'Valid payment amount is required.' });
            return;
        }
        const simulation = await payments_service_js_1.PaymentsService.simulateAffordability(req.user.id, Number(amount));
        res.json({ simulation });
    }
    catch (err) {
        res.status(500).json({ error: err.message });
    }
});
router.post('/initiate', auth_middleware_js_1.authMiddleware, async (req, res) => {
    try {
        const idempotencyKey = req.headers['idempotency-key'];
        const { recipient, amount, categoryId, note, sourceAccountId } = req.body;
        if (!idempotencyKey) {
            res.status(400).json({ error: 'Missing required Idempotency-Key header.' });
            return;
        }
        if (!recipient || !amount || amount <= 0) {
            res.status(400).json({ error: 'Valid recipient and positive amount are required.' });
            return;
        }
        const result = await payments_service_js_1.PaymentsService.initiatePayment(req.user.id, idempotencyKey, recipient, Number(amount), categoryId, note, sourceAccountId);
        res.status(200).json({ success: true, payment: result });
    }
    catch (err) {
        res.status(400).json({ error: err.message });
    }
});
router.get('/gateway/config', auth_middleware_js_1.authMiddleware, async (_req, res) => {
    try {
        const razorpayKeyId = process.env.RAZORPAY_KEY_ID || '';
        const cashfreeAppId = process.env.CASHFREE_APP_ID || '';
        res.json({
            supportedModes: ['UPI_INTENT', 'RAZORPAY', 'CASHFREE'],
            activeProvider: razorpayKeyId ? 'RAZORPAY' : cashfreeAppId ? 'CASHFREE' : 'UPI_INTENT',
            razorpayKeyId,
            cashfreeAppId,
            isRealMoneyEnabled: Boolean(razorpayKeyId && process.env.RAZORPAY_KEY_SECRET),
        });
    }
    catch (err) {
        res.status(500).json({ error: err.message });
    }
});
router.post('/gateway/order', auth_middleware_js_1.authMiddleware, async (req, res) => {
    try {
        const { amount, currency = 'INR', recipient, note } = req.body;
        if (!amount || Number(amount) <= 0) {
            res.status(400).json({ error: 'Valid positive amount is required.' });
            return;
        }
        const razorpayKeyId = process.env.RAZORPAY_KEY_ID || '';
        const razorpayKeySecret = process.env.RAZORPAY_KEY_SECRET || '';
        // Only a real id returned by Razorpay may be sent back as `orderId`.
        // Previously we generated a local `order_<timestamp>` fallback, but that id
        // does not exist on Razorpay's side, so checkout rejected it with
        // INVALID_ORDER_ID and the payment could never succeed. Returning null
        // lets the client open checkout without an `order_id` (a supported flow)
        // instead of feeding Razorpay a bogus one.
        let orderId = null;
        const amountInPaise = Math.round(Number(amount) * 100);
        // Call live Razorpay API if credentials are present
        if (razorpayKeyId && razorpayKeySecret) {
            try {
                const authHeader = 'Basic ' + Buffer.from(`${razorpayKeyId}:${razorpayKeySecret}`).toString('base64');
                const rzpResponse = await fetch('https://api.razorpay.com/v1/orders', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': authHeader,
                    },
                    body: JSON.stringify({
                        amount: amountInPaise,
                        currency,
                        receipt: `rcpt_${Date.now()}`,
                        notes: {
                            recipient: recipient || 'Merchant',
                            app: 'FinPocket',
                            note: note || 'FinPocket Real Payment',
                        },
                    }),
                    // Fail closed rather than hang: without a timeout a stalled gateway
                    // would leave the user staring at "Opening secure payment gateway..."
                    // indefinitely. Matches the timeout used by every other outbound
                    // call in this service (15s).
                    signal: AbortSignal.timeout(15000),
                });
                if (rzpResponse.ok) {
                    const rzpData = await rzpResponse.json();
                    if (rzpData && rzpData.id) {
                        orderId = rzpData.id;
                    }
                }
                else {
                    const errText = await rzpResponse.text();
                    console.warn('[PaymentsRoute] Razorpay order creation response:', errText);
                }
            }
            catch (err) {
                console.warn('[PaymentsRoute] Razorpay API call error, proceeding without order id:', err.message);
            }
        }
        res.json({
            success: true,
            orderId,
            amount: amountInPaise,
            currency,
            recipient: recipient || 'Merchant',
            note: note || 'FinPocket Real Payment',
            keyId: razorpayKeyId,
            provider: razorpayKeyId ? 'RAZORPAY' : 'UPI_INTENT',
        });
    }
    catch (err) {
        res.status(500).json({ error: err.message });
    }
});
router.post('/gateway/verify', auth_middleware_js_1.authMiddleware, async (req, res) => {
    try {
        const { orderId, paymentId, signature, recipient, amount, categoryId = 'cat_other', note } = req.body;
        if (!orderId || !paymentId || !amount) {
            res.status(400).json({ error: 'Missing required payment verification parameters.' });
            return;
        }
        const razorpayKeySecret = process.env.RAZORPAY_KEY_SECRET || '';
        if (!razorpayKeySecret) {
            res.status(500).json({ error: 'Payment verification not configured. Please contact support.' });
            return;
        }
        if (!signature) {
            res.status(400).json({ error: 'Missing payment signature.' });
            return;
        }
        const expectedSignature = crypto_1.default
            .createHmac('sha256', razorpayKeySecret)
            .update(`${orderId}|${paymentId}`)
            .digest('hex');
        if (expectedSignature !== signature) {
            res.status(400).json({ error: 'Invalid Razorpay payment cryptographic signature.' });
            return;
        }
        const txnId = `FP_GW_${Date.now()}`;
        const timestamp = new Date().toISOString();
        await (0, database_js_1.runQuery)(`
      INSERT INTO transactions (id, user_id, category_id, type, amount, merchant, sender, receiver, description, payment_method, reference_id, status, transaction_date)
      VALUES (?, ?, ?, 'EXPENSE', ?, ?, 'User', ?, ?, 'GATEWAY', ?, 'SUCCESSFUL', ?)
    `, [txnId, req.user.id, categoryId, Number(amount), recipient || 'Merchant', recipient || 'Merchant', note || `Gateway Payment (${paymentId})`, paymentId, timestamp]);
        res.json({
            success: true,
            verified: true,
            transactionId: txnId,
            referenceId: paymentId,
            amount: Number(amount),
            status: 'SUCCESSFUL',
        });
    }
    catch (err) {
        res.status(500).json({ error: err.message });
    }
});
exports.default = router;
//# sourceMappingURL=payments.routes.js.map