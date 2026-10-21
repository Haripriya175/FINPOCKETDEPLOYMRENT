"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const auth_middleware_js_1 = require("../middleware/auth.middleware.js");
const ai_service_js_1 = require("../services/ai.service.js");
const router = (0, express_1.Router)();
router.post('/query', auth_middleware_js_1.authMiddleware, async (req, res) => {
    try {
        const { query } = req.body;
        if (!query || typeof query !== 'string') {
            res.status(400).json({ error: 'Query string is required.' });
            return;
        }
        const response = await ai_service_js_1.AIAssistantService.processQuery(req.user.id, query);
        res.json({ response });
    }
    catch (err) {
        res.status(500).json({ error: err.message });
    }
});
exports.default = router;
//# sourceMappingURL=ai.routes.js.map