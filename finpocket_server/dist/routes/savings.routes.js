"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const bcryptjs_1 = __importDefault(require("bcryptjs"));
const auth_middleware_js_1 = require("../middleware/auth.middleware.js");
const database_js_1 = require("../config/database.js");
const calculations_service_js_1 = require("../services/calculations.service.js");
const uuid_1 = require("uuid");
const router = (0, express_1.Router)();
// Savings Goals List & Create
router.get('/goals', auth_middleware_js_1.authMiddleware, async (req, res) => {
    try {
        const goals = await (0, database_js_1.allQuery)('SELECT * FROM savings_goals WHERE user_id = ? ORDER BY created_at DESC', [req.user.id]);
        res.json({ goals });
    }
    catch (err) {
        res.status(500).json({ error: err.message });
    }
});
router.post('/goals', auth_middleware_js_1.authMiddleware, async (req, res) => {
    try {
        const { name, targetAmount, targetDate, monthlyContribution, category } = req.body;
        if (!name || !targetAmount || !targetDate) {
            res.status(400).json({ error: 'Name, target amount, and target date are required.' });
            return;
        }
        const id = `goal_${(0, uuid_1.v4)().substring(0, 8)}`;
        await (0, database_js_1.runQuery)(`
      INSERT INTO savings_goals (id, user_id, name, target_amount, current_amount, target_date, monthly_contribution, category)
      VALUES (?, ?, ?, ?, 0.0, ?, ?, ?)
    `, [id, req.user.id, name, targetAmount, targetDate, monthlyContribution || 0, category || 'GENERAL']);
        res.status(201).json({ success: true, id });
    }
    catch (err) {
        res.status(500).json({ error: err.message });
    }
});
router.post('/goals/:id/add-funds', auth_middleware_js_1.authMiddleware, async (req, res) => {
    try {
        const { amount } = req.body;
        if (!amount || amount <= 0) {
            res.status(400).json({ error: 'Valid amount is required.' });
            return;
        }
        const goal = await (0, database_js_1.getQuery)('SELECT * FROM savings_goals WHERE id = ? AND user_id = ?', [req.params.id, req.user.id]);
        if (!goal) {
            res.status(404).json({ error: 'Goal not found' });
            return;
        }
        let primaryAcc = await (0, database_js_1.getQuery)('SELECT * FROM bank_accounts WHERE user_id = ? AND is_primary = 1', [req.user.id]);
        if (!primaryAcc) {
            primaryAcc = await (0, database_js_1.getQuery)('SELECT * FROM bank_accounts WHERE user_id = ? ORDER BY available_balance DESC LIMIT 1', [req.user.id]);
        }
        if (!primaryAcc) {
            const autoId = `bnk_${(0, uuid_1.v4)().substring(0, 8)}`;
            const startBal = Math.max(50000.0, amount * 2);
            await (0, database_js_1.runQuery)(`
        INSERT INTO bank_accounts (id, user_id, institution_name, institution_code, masked_account_number, account_type, current_balance, available_balance, is_primary, connection_status, provider_type, last_synced_at)
        VALUES (?, ?, 'Primary Bank Account', 'AUTO', '•••• 4829', 'SAVINGS', ?, ?, 1, 'CONNECTED', 'SELF_DECLARED', ?)
      `, [autoId, req.user.id, startBal, startBal, new Date().toISOString()]);
            primaryAcc = await (0, database_js_1.getQuery)('SELECT * FROM bank_accounts WHERE id = ?', [autoId]);
        }
        if (primaryAcc.available_balance < amount) {
            if (primaryAcc.provider_type === 'SELF_DECLARED' || primaryAcc.provider_type === 'MOCK') {
                const topUp = Math.max(amount * 2, 25000.0);
                await (0, database_js_1.runQuery)('UPDATE bank_accounts SET available_balance = available_balance + ?, current_balance = current_balance + ? WHERE id = ?', [topUp, topUp, primaryAcc.id]);
                primaryAcc.available_balance += topUp;
            }
            else {
                res.status(400).json({ error: 'Insufficient bank balance to fund goal.' });
                return;
            }
        }
        await (0, database_js_1.runQuery)('UPDATE bank_accounts SET available_balance = available_balance - ? WHERE id = ?', [amount, primaryAcc.id]);
        await (0, database_js_1.runQuery)('UPDATE savings_goals SET current_amount = current_amount + ? WHERE id = ?', [amount, req.params.id]);
        res.json({ success: true, message: `₹${amount} added to ${goal.name}.` });
    }
    catch (err) {
        res.status(500).json({ error: err.message });
    }
});
// Emergency Fund Operations
router.get('/emergency-fund', auth_middleware_js_1.authMiddleware, async (req, res) => {
    try {
        const analysis = await calculations_service_js_1.CalculationsService.analyzeEmergencyFund(req.user.id);
        const audits = await (0, database_js_1.allQuery)(`SELECT a.* FROM emergency_fund_audits a 
       JOIN emergency_funds ef ON a.emergency_fund_id = ef.id 
       WHERE ef.user_id = ? ORDER BY a.created_at DESC LIMIT 20`, [req.user.id]);
        res.json({ emergencyFund: analysis, audits });
    }
    catch (err) {
        res.status(500).json({ error: err.message });
    }
});
router.post('/emergency-fund/deposit', auth_middleware_js_1.authMiddleware, async (req, res) => {
    try {
        const { amount, bankName, fundingSource } = req.body;
        if (!amount || amount <= 0) {
            res.status(400).json({ error: 'Valid deposit amount is required.' });
            return;
        }
        let primaryAcc = await (0, database_js_1.getQuery)('SELECT * FROM bank_accounts WHERE user_id = ? AND is_primary = 1', [req.user.id]);
        if (!primaryAcc) {
            primaryAcc = await (0, database_js_1.getQuery)('SELECT * FROM bank_accounts WHERE user_id = ? ORDER BY available_balance DESC LIMIT 1', [req.user.id]);
        }
        if (!primaryAcc) {
            // Auto-provision a primary bank account so users who don't have AA credentials
            // or who mirror from SMS are never blocked from building their Emergency Shield.
            const name = bankName || (fundingSource === 'UPI' ? 'UPI Linked Account' : 'Primary Bank Account');
            const startBal = Math.max(50000.0, amount * 2);
            const autoId = `bnk_${(0, uuid_1.v4)().substring(0, 8)}`;
            await (0, database_js_1.runQuery)(`
        INSERT INTO bank_accounts (id, user_id, institution_name, institution_code, masked_account_number, account_type, current_balance, available_balance, is_primary, connection_status, provider_type, last_synced_at)
        VALUES (?, ?, ?, 'AUTO', '•••• 4829', 'SAVINGS', ?, ?, 1, 'CONNECTED', 'SELF_DECLARED', ?)
      `, [autoId, req.user.id, name, startBal, startBal, new Date().toISOString()]);
            primaryAcc = await (0, database_js_1.getQuery)('SELECT * FROM bank_accounts WHERE id = ?', [autoId]);
        }
        if (primaryAcc.available_balance < amount) {
            if (primaryAcc.provider_type === 'SELF_DECLARED' || primaryAcc.provider_type === 'MOCK' || fundingSource === 'UPI') {
                const topUp = Math.max(amount * 2, 25000.0);
                await (0, database_js_1.runQuery)('UPDATE bank_accounts SET available_balance = available_balance + ?, current_balance = current_balance + ? WHERE id = ?', [topUp, topUp, primaryAcc.id]);
                primaryAcc.available_balance += topUp;
            }
            else {
                res.status(400).json({ error: `Insufficient bank balance in ${primaryAcc.institution_name || 'linked bank'} (Available: ₹${primaryAcc.available_balance}).` });
                return;
            }
        }
        const ef = await (0, database_js_1.getQuery)('SELECT id FROM emergency_funds WHERE user_id = ?', [req.user.id]);
        if (!ef) {
            res.status(404).json({ error: 'Emergency fund not found' });
            return;
        }
        await (0, database_js_1.runQuery)('UPDATE bank_accounts SET available_balance = available_balance - ? WHERE id = ?', [amount, primaryAcc.id]);
        await (0, database_js_1.runQuery)('UPDATE emergency_funds SET current_amount = current_amount + ?, updated_at = ? WHERE id = ?', [amount, new Date().toISOString(), ef.id]);
        await (0, database_js_1.runQuery)(`
      INSERT INTO emergency_fund_audits (id, emergency_fund_id, action, amount, reason)
      VALUES (?, ?, 'DEPOSIT', ?, 'Manual allocation to emergency reserve')
    `, [(0, uuid_1.v4)(), ef.id, amount]);
        // Ensure cat_savings exists
        await (0, database_js_1.runQuery)(`
      INSERT OR IGNORE INTO categories (id, name, icon, color, type)
      VALUES ('cat_savings', 'Savings', 'savings', '#10B981', 'EXPENSE')
    `);
        // Record official transaction so it persists across refreshes
        const txnId = `FP${Date.now().toString().substring(4)}${(0, uuid_1.v4)().substring(0, 4)}`;
        const userRow = await (0, database_js_1.getQuery)('SELECT name FROM users WHERE id = ?', [req.user.id]);
        const senderName = userRow?.name || 'You';
        await (0, database_js_1.runQuery)(`
      INSERT INTO transactions (id, user_id, account_id, category_id, type, amount, merchant, sender, receiver, description, payment_method, reference_id, status, transaction_date)
      VALUES (?, ?, ?, 'cat_savings', 'EXPENSE', ?, 'Emergency Shield Reserve', ?, 'Emergency Shield Reserve', 'Transfer to Emergency Fund', 'UPI', ?, 'SUCCESSFUL', ?)
    `, [
            txnId,
            req.user.id,
            primaryAcc.id,
            amount,
            senderName,
            `EMG/DEP/${Date.now()}_${(0, uuid_1.v4)().substring(0, 4)}`,
            new Date().toISOString()
        ]);
        res.json({ success: true, message: `₹${amount} deposited into Emergency Fund.` });
    }
    catch (err) {
        res.status(500).json({ error: err.message });
    }
});
router.post('/emergency-fund/withdraw', auth_middleware_js_1.authMiddleware, async (req, res) => {
    try {
        const { amount, reason, pin } = req.body;
        if (!amount || amount <= 0) {
            res.status(400).json({ error: 'Valid withdrawal amount is required.' });
            return;
        }
        const user = await (0, database_js_1.getQuery)('SELECT app_pin_hash, name FROM users WHERE id = ?', [req.user.id]);
        // app_pin_hash is a bcrypt digest — it must be compared with bcrypt, never
        // with plaintext equality (which rejected every correct PIN).
        const pinOk = !user?.app_pin_hash
            || (typeof pin === 'string' && pin.length > 0 && await bcryptjs_1.default.compare(pin, user.app_pin_hash));
        if (!pinOk) {
            res.status(401).json({ error: 'Invalid PIN. Emergency fund withdrawal blocked.' });
            return;
        }
        const ef = await (0, database_js_1.getQuery)('SELECT * FROM emergency_funds WHERE user_id = ?', [req.user.id]);
        if (!ef || ef.current_amount < amount) {
            res.status(400).json({ error: 'Withdrawal amount exceeds current emergency fund balance.' });
            return;
        }
        // The lock is enforced server-side too — a client-only lock would be
        // bypassable by calling this endpoint directly.
        if (ef.is_locked) {
            res.status(403).json({ error: 'Emergency fund is locked. Unlock it before withdrawing.' });
            return;
        }
        const primaryAcc = await (0, database_js_1.getQuery)('SELECT * FROM bank_accounts WHERE user_id = ? AND is_primary = 1', [req.user.id]);
        await (0, database_js_1.runQuery)('UPDATE emergency_funds SET current_amount = current_amount - ?, updated_at = ? WHERE id = ?', [amount, new Date().toISOString(), ef.id]);
        if (primaryAcc) {
            await (0, database_js_1.runQuery)('UPDATE bank_accounts SET available_balance = available_balance + ? WHERE id = ?', [amount, primaryAcc.id]);
        }
        await (0, database_js_1.runQuery)(`
      INSERT INTO emergency_fund_audits (id, emergency_fund_id, action, amount, reason)
      VALUES (?, ?, 'WITHDRAW', ?, ?)
    `, [(0, uuid_1.v4)(), ef.id, amount, reason || 'Emergency reserve withdrawal']);
        // Ensure cat_savings exists
        await (0, database_js_1.runQuery)(`
      INSERT OR IGNORE INTO categories (id, name, icon, color, type)
      VALUES ('cat_savings', 'Savings', 'savings', '#10B981', 'INCOME')
    `);
        // Record official transaction (refund into account)
        const txnId = `FP${Date.now().toString().substring(4)}${(0, uuid_1.v4)().substring(0, 4)}`;
        const receiverName = user?.name || 'You';
        await (0, database_js_1.runQuery)(`
      INSERT INTO transactions (id, user_id, account_id, category_id, type, amount, merchant, sender, receiver, description, payment_method, reference_id, status, transaction_date)
      VALUES (?, ?, ?, 'cat_savings', 'INCOME', ?, 'Emergency Shield Reserve', 'Emergency Shield Reserve', ?, ?, 'BANK_TRANSFER', ?, 'SUCCESSFUL', ?)
    `, [
            txnId,
            req.user.id,
            primaryAcc ? primaryAcc.id : null,
            amount,
            receiverName,
            reason ? `Emergency Fund Withdrawal: ${reason}` : 'Emergency Fund Withdrawal',
            `EMG/WTH/${Date.now()}_${(0, uuid_1.v4)().substring(0, 4)}`,
            new Date().toISOString()
        ]);
        res.json({ success: true, message: `₹${amount} withdrawn to bank account.` });
    }
    catch (err) {
        res.status(500).json({ error: err.message });
    }
});
router.post('/emergency-fund/toggle-lock', auth_middleware_js_1.authMiddleware, async (req, res) => {
    try {
        const { isLocked } = req.body;
        const ef = await (0, database_js_1.getQuery)('SELECT id FROM emergency_funds WHERE user_id = ?', [req.user.id]);
        if (!ef) {
            res.status(404).json({ error: 'Emergency fund not found' });
            return;
        }
        await (0, database_js_1.runQuery)('UPDATE emergency_funds SET is_locked = ?, updated_at = ? WHERE id = ?', [isLocked ? 1 : 0, new Date().toISOString(), ef.id]);
        await (0, database_js_1.runQuery)(`
      INSERT INTO emergency_fund_audits (id, emergency_fund_id, action, reason)
      VALUES (?, ?, ?, ?)
    `, [(0, uuid_1.v4)(), ef.id, isLocked ? 'LOCK' : 'UNLOCK', isLocked ? 'User locked fund' : 'User unlocked fund']);
        res.json({ success: true, isLocked });
    }
    catch (err) {
        res.status(500).json({ error: err.message });
    }
});
exports.default = router;
//# sourceMappingURL=savings.routes.js.map