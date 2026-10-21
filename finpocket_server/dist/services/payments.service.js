"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PaymentsService = void 0;
const database_js_1 = require("../config/database.js");
const calculations_service_js_1 = require("./calculations.service.js");
const notification_service_js_1 = require("./notification.service.js");
const app_config_js_1 = require("../config/app_config.js");
const uuid_1 = require("uuid");
class PaymentsService {
    static async simulateAffordability(userId, amount) {
        const user = await (0, database_js_1.getQuery)('SELECT daily_payment_limit, per_txn_payment_limit, monthly_payment_limit FROM users WHERE id = ?', [userId]);
        const dailyLimit = user?.daily_payment_limit ?? app_config_js_1.config.paymentLimits.daily;
        const monthlyLimit = user?.monthly_payment_limit ?? app_config_js_1.config.paymentLimits.monthly;
        // Calculate today's spent amount
        const today = new Date().toISOString().split('T')[0];
        const todaySpentRow = await (0, database_js_1.getQuery)(`SELECT SUM(amount) as sum FROM transactions WHERE user_id = ? AND type = 'EXPENSE' AND transaction_date LIKE ?`, [userId, `${today}%`]);
        const dailySpentSoFar = todaySpentRow?.sum || 0;
        // Calculate month's spent amount
        const now = new Date();
        const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
        const monthlySpentRow = await (0, database_js_1.getQuery)(`SELECT SUM(amount) as sum FROM transactions WHERE user_id = ? AND type = 'EXPENSE' AND transaction_date >= ?`, [userId, startOfMonth]);
        const monthlySpentSoFar = monthlySpentRow?.sum || 0;
        const safeData = await calculations_service_js_1.CalculationsService.calculateSafeToSpend(userId);
        const currentAvailable = safeData.availableBalance;
        const currentSafeToSpend = safeData.safeToSpend;
        const balanceAfterPayment = Math.max(0, currentAvailable - amount);
        const safeToSpendAfterPayment = Math.max(0, currentSafeToSpend - amount);
        const exceedsBalance = amount > currentAvailable;
        const exceedsSafeToSpend = amount > currentSafeToSpend;
        const exceedsDailyLimit = (dailySpentSoFar + amount) > dailyLimit;
        const exceedsMonthlyLimit = (monthlySpentSoFar + amount) > monthlyLimit;
        let impactExplanation = `Payment of ₹${amount.toLocaleString()} leaves ₹${balanceAfterPayment.toLocaleString()} in your account and leaves Safe-to-Spend at ₹${safeToSpendAfterPayment.toLocaleString()}.`;
        if (exceedsBalance) {
            impactExplanation = `Insufficient funds: Required ₹${amount.toLocaleString()} exceeds your available bank balance of ₹${currentAvailable.toLocaleString()}.`;
        }
        else if (exceedsDailyLimit) {
            impactExplanation = `Limit breached: Payment pushes daily total (₹${(dailySpentSoFar + amount).toLocaleString()}) beyond your daily limit of ₹${dailyLimit.toLocaleString()}.`;
        }
        else if (exceedsSafeToSpend) {
            impactExplanation = `Warning: Payment of ₹${amount.toLocaleString()} dips into reserves allocated for upcoming bills and committed savings.`;
        }
        return {
            currentAvailableBalance: currentAvailable,
            paymentAmount: amount,
            balanceAfterPayment,
            currentSafeToSpend,
            safeToSpendAfterPayment,
            isAffordable: !exceedsBalance && !exceedsDailyLimit && !exceedsMonthlyLimit,
            upcomingObligationsTotal: safeData.upcomingMandatoryBills + safeData.activeEmiObligations,
            impactExplanation,
            exceedsSafeToSpend,
            exceedsBalance,
            exceedsDailyLimit,
            exceedsMonthlyLimit,
            dailyLimit,
            dailySpentSoFar,
            monthlyLimit,
            monthlySpentSoFar
        };
    }
    static async initiatePayment(userId, idempotencyKey, recipient, amount, categoryId = 'cat_other', note = '', sourceAccountId) {
        if (!idempotencyKey || typeof idempotencyKey !== 'string' || idempotencyKey.trim().length === 0) {
            throw new Error('Idempotency-Key header is required for all payment executions.');
        }
        if (amount <= 0 || isNaN(amount)) {
            throw new Error('Payment amount must be a positive valid number.');
        }
        if (!recipient || recipient.trim().length === 0) {
            throw new Error('Valid recipient identifier is required.');
        }
        // Wrap execution inside atomic database transaction with IMMEDIATE lock
        return await (0, database_js_1.withTransaction)(async () => {
            // 1. Idempotency Check: check if request was already processed
            const existingPayment = await (0, database_js_1.getQuery)('SELECT * FROM payment_requests WHERE idempotency_key = ? AND user_id = ?', [idempotencyKey, userId]);
            if (existingPayment) {
                const safeData = await calculations_service_js_1.CalculationsService.calculateSafeToSpend(userId);
                return {
                    paymentId: existingPayment.id,
                    referenceId: `UPI/${existingPayment.id}`,
                    status: existingPayment.state === 'SUCCESS' ? 'SUCCESS' : 'FAILED',
                    amount: existingPayment.amount,
                    recipient: existingPayment.recipient_identifier,
                    timestamp: existingPayment.created_at,
                    remainingAvailableBalance: safeData.availableBalance,
                    remainingSafeToSpend: safeData.safeToSpend,
                    auditId: 'IDEMPOTENT_REPLAY'
                };
            }
            // 2. Select and Lock Source Account
            let account;
            if (sourceAccountId) {
                account = await (0, database_js_1.getQuery)(`SELECT * FROM bank_accounts WHERE user_id = ? AND id = ? AND connection_status = 'CONNECTED'`, [userId, sourceAccountId]);
            }
            if (!account) {
                account = await (0, database_js_1.getQuery)(`SELECT * FROM bank_accounts WHERE user_id = ? AND is_primary = 1 AND connection_status = 'CONNECTED'`, [userId]);
            }
            if (!account) {
                account = await (0, database_js_1.getQuery)(`SELECT * FROM bank_accounts WHERE user_id = ? AND connection_status = 'CONNECTED' LIMIT 1`, [userId]);
            }
            if (!account) {
                throw new Error('No active connected bank account available for payment.');
            }
            // 3. Balance Validation
            if (account.available_balance < amount) {
                throw new Error(`Insufficient funds: available balance is ₹${account.available_balance.toLocaleString()}, required ₹${amount.toLocaleString()}.`);
            }
            // 4. Server-Side Cumulative Limits Enforcement
            const user = await (0, database_js_1.getQuery)('SELECT per_txn_payment_limit, daily_payment_limit, monthly_payment_limit FROM users WHERE id = ?', [userId]);
            const perTxnLimit = user?.per_txn_payment_limit ?? app_config_js_1.config.paymentLimits.perTransaction;
            const dailyLimit = user?.daily_payment_limit ?? app_config_js_1.config.paymentLimits.daily;
            const monthlyLimit = user?.monthly_payment_limit ?? app_config_js_1.config.paymentLimits.monthly;
            if (amount > perTxnLimit) {
                throw new Error(`Transaction amount ₹${amount.toLocaleString()} exceeds per-transaction limit of ₹${perTxnLimit.toLocaleString()}.`);
            }
            // Calculate today's cumulative spent
            const today = new Date().toISOString().split('T')[0];
            const todaySpentRow = await (0, database_js_1.getQuery)(`SELECT SUM(amount) as sum FROM transactions WHERE user_id = ? AND type = 'EXPENSE' AND transaction_date LIKE ?`, [userId, `${today}%`]);
            const dailySpentSoFar = todaySpentRow?.sum || 0;
            if (dailySpentSoFar + amount > dailyLimit) {
                throw new Error(`Transaction exceeds daily payment limit. Spent today: ₹${dailySpentSoFar.toLocaleString()}, Limit: ₹${dailyLimit.toLocaleString()}.`);
            }
            // Calculate month's cumulative spent
            const now = new Date();
            const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
            const monthlySpentRow = await (0, database_js_1.getQuery)(`SELECT SUM(amount) as sum FROM transactions WHERE user_id = ? AND type = 'EXPENSE' AND transaction_date >= ?`, [userId, startOfMonth]);
            const monthlySpentSoFar = monthlySpentRow?.sum || 0;
            if (monthlySpentSoFar + amount > monthlyLimit) {
                throw new Error(`Transaction exceeds monthly payment cap. Spent this month: ₹${monthlySpentSoFar.toLocaleString()}, Limit: ₹${monthlyLimit.toLocaleString()}.`);
            }
            // 5. Create Payment Request Record (State = PROCESSING)
            const paymentId = `pmt_${(0, uuid_1.v4)().substring(0, 8)}`;
            const timestamp = new Date().toISOString();
            await (0, database_js_1.runQuery)(`
        INSERT INTO payment_requests (id, idempotency_key, user_id, source_account_id, recipient_identifier, amount, category_id, note, state, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'PROCESSING', ?)
      `, [paymentId, idempotencyKey, userId, account.id, recipient, amount, categoryId, note, timestamp]);
            // 6. Atomic Debit & Transaction Entry
            const newBalance = account.available_balance - amount;
            await (0, database_js_1.runQuery)('UPDATE bank_accounts SET available_balance = ?, current_balance = ? WHERE id = ?', [newBalance, newBalance, account.id]);
            const txnId = `FP${Date.now().toString().substring(5)}`;
            const refId = `UPI/${Date.now()}`;
            await (0, database_js_1.runQuery)(`
        INSERT INTO transactions (id, user_id, account_id, category_id, type, amount, merchant, sender, receiver, description, payment_method, reference_id, status, transaction_date)
        VALUES (?, ?, ?, ?, 'EXPENSE', ?, ?, 'User', ?, ?, 'UPI', ?, 'SUCCESSFUL', ?)
      `, [txnId, userId, account.id, categoryId, amount, recipient, recipient, note || `Payment to ${recipient}`, refId, timestamp]);
            // 7. Transition Payment State to SUCCESS
            await (0, database_js_1.runQuery)(`UPDATE payment_requests SET state = 'SUCCESS', updated_at = ? WHERE id = ?`, [new Date().toISOString(), paymentId]);
            // 8. Security Audit Trail (No secret exposure)
            const auditId = (0, uuid_1.v4)();
            await (0, database_js_1.runQuery)(`
        INSERT INTO audit_logs (id, user_id, action, metadata)
        VALUES (?, ?, 'PAYMENT_SUCCESS', ?)
      `, [auditId, userId, JSON.stringify({
                    paymentId,
                    amount,
                    recipient,
                    sourceAccountMasked: account.masked_account_number,
                    referenceId: refId
                })]);
            // 9. Anomaly screening + multi-channel alert.
            //    Runs server-side too, so a payment made outside this app (web,
            //    another device, scheduled) is still screened. Channel delivery is
            //    fire-and-forget inside the service — an unreachable WhatsApp/Twilio
            //    endpoint can never fail the payment.
            const anomaly = notification_service_js_1.NotificationService.evaluateUnusualTransaction({
                userId,
                amount,
                recipient,
                balanceBefore: account.available_balance,
            }) ??
                (await notification_service_js_1.NotificationService.detectRepeatTransfers(userId, recipient));
            if (anomaly) {
                await notification_service_js_1.NotificationService.raiseSecurityAlert({
                    userId,
                    reason: anomaly.reason,
                    amount,
                    recipient,
                });
                await (0, database_js_1.runQuery)('INSERT INTO audit_logs (id, user_id, action, metadata) VALUES (?, ?, ?, ?)', [
                    (0, uuid_1.v4)(),
                    userId,
                    'UNUSUAL_TRANSACTION_FLAGGED',
                    JSON.stringify({
                        paymentId,
                        amount,
                        recipient,
                        severity: anomaly.severity,
                        reason: anomaly.reason,
                    }),
                ]);
            }
            const updatedSafe = await calculations_service_js_1.CalculationsService.calculateSafeToSpend(userId);
            return {
                paymentId,
                referenceId: refId,
                status: 'SUCCESS',
                amount,
                recipient,
                timestamp,
                remainingAvailableBalance: newBalance,
                remainingSafeToSpend: updatedSafe.safeToSpend,
                auditId
            };
        });
    }
}
exports.PaymentsService = PaymentsService;
//# sourceMappingURL=payments.service.js.map