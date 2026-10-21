"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.dbScopeStorage = void 0;
exports.currentScope = currentScope;
const node_async_hooks_1 = require("node:async_hooks");
exports.dbScopeStorage = new node_async_hooks_1.AsyncLocalStorage();
function currentScope() {
    return exports.dbScopeStorage.getStore();
}
//# sourceMappingURL=context.js.map