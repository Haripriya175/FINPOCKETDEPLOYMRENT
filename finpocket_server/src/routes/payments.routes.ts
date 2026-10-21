import { Router, Response } from 'express';
import crypto from 'crypto';
import { AuthRequest, authMiddleware } from '../middleware/auth.middleware.js';
import { PaymentsService } from '../services/payments.service.js';
import { runQuery } from '../config/database.js';

const router = Router();

router.post('/simulate-affordability', authMiddleware, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { amount } = req.body;
    if (!amount || amount <= 0) {
      res.status(400).json({ error: 'Valid payment amount is required.' });
      return;
    }

    const simulation = await PaymentsService.simulateAffordability(req.user!.id, Number(amount));
    res.json({ simulation });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/initiate', authMiddleware, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const idempotencyKey = req.headers['idempotency-key'] as string;
    const { recipient, amount, categoryId, note, sourceAccountId } = req.body;

    if (!idempotencyKey) {
      res.status(400).json({ error: 'Missing required Idempotency-Key header.' });
      return;
    }
    if (!recipient || !amount || amount <= 0) {
      res.status(400).json({ error: 'Valid recipient and positive amount are required.' });
      return;
    }

    const result = await PaymentsService.initiatePayment(
      req.user!.id,
      idempotencyKey,
      recipient,
      Number(amount),
      categoryId,
      note,
      sourceAccountId
    );

    res.status(200).json({ success: true, payment: result });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

router.get('/gateway/config', authMiddleware, async (_req: AuthRequest, res: Response): Promise<void> => {
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
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/gateway/order', authMiddleware, async (req: AuthRequest, res: Response): Promise<void> => {
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
    let orderId: string | null = null;
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
          const rzpData: any = await rzpResponse.json();
          if (rzpData && rzpData.id) {
            orderId = rzpData.id;
          }
        } else {
          const errText = await rzpResponse.text();
          console.warn('[PaymentsRoute] Razorpay order creation response:', errText);
        }
      } catch (err: any) {
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
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/gateway/verify', authMiddleware, async (req: AuthRequest, res: Response): Promise<void> => {
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
    const expectedSignature = crypto
      .createHmac('sha256', razorpayKeySecret)
      .update(`${orderId}|${paymentId}`)
      .digest('hex');

    if (expectedSignature !== signature) {
      res.status(400).json({ error: 'Invalid Razorpay payment cryptographic signature.' });
      return;
    }

    const txnId = `FP_GW_${Date.now()}`;
    const timestamp = new Date().toISOString();

    await runQuery(`
      INSERT INTO transactions (id, user_id, category_id, type, amount, merchant, sender, receiver, description, payment_method, reference_id, status, transaction_date)
      VALUES (?, ?, ?, 'EXPENSE', ?, ?, 'User', ?, ?, 'GATEWAY', ?, 'SUCCESSFUL', ?)
    `, [txnId, req.user!.id, categoryId, Number(amount), recipient || 'Merchant', recipient || 'Merchant', note || `Gateway Payment (${paymentId})`, paymentId, timestamp]);

    res.json({
      success: true,
      verified: true,
      transactionId: txnId,
      referenceId: paymentId,
      amount: Number(amount),
      status: 'SUCCESSFUL',
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;

