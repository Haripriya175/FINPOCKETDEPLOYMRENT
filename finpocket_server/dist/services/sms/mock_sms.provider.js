"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.MockSmsProvider = void 0;
class MockSmsProvider {
    name = 'MockSmsProvider';
    sentMessages = [];
    simulateFailure = false;
    failureError = 'Simulated SMS gateway failure';
    simulateTimeout = false;
    async sendOtp(phone, otp) {
        if (this.simulateTimeout) {
            await new Promise((_, reject) => setTimeout(() => reject(new Error('SMS Gateway connection timed out')), 50));
        }
        if (this.simulateFailure) {
            return {
                success: false,
                providerName: this.name,
                error: this.failureError,
            };
        }
        this.sentMessages.push({
            phone,
            otp,
            timestamp: new Date(),
        });
        return {
            success: true,
            providerName: this.name,
            messageId: `mock_msg_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
        };
    }
    getLastSentOtp(phone) {
        if (phone) {
            const match = this.sentMessages.filter(m => m.phone === phone);
            return match[match.length - 1]?.otp;
        }
        return this.sentMessages[this.sentMessages.length - 1]?.otp;
    }
    getSentCount(phone) {
        if (phone) {
            return this.sentMessages.filter(m => m.phone === phone).length;
        }
        return this.sentMessages.length;
    }
    clear() {
        this.sentMessages = [];
        this.simulateFailure = false;
        this.simulateTimeout = false;
    }
    setSimulateFailure(fail, error) {
        this.simulateFailure = fail;
        if (error)
            this.failureError = error;
    }
    setSimulateTimeout(timeout) {
        this.simulateTimeout = timeout;
    }
}
exports.MockSmsProvider = MockSmsProvider;
//# sourceMappingURL=mock_sms.provider.js.map