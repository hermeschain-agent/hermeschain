"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.HERMES_BASE_URL = exports.HERMES_MODEL = exports.isConfigured = exports.hermesChatStream = exports.hermesChat = exports.hermesChatCompletion = void 0;
exports.openChatCompletion = openChatCompletion;
// Thin shim over ../llm/hermesClient, kept so in-tree imports like
// `import { hermesChatCompletion } from './open'` still resolve.
// New code should import from '../llm/hermesClient' directly.
var hermesClient_1 = require("../llm/hermesClient");
Object.defineProperty(exports, "hermesChatCompletion", { enumerable: true, get: function () { return hermesClient_1.hermesChatCompletion; } });
Object.defineProperty(exports, "hermesChat", { enumerable: true, get: function () { return hermesClient_1.hermesChat; } });
Object.defineProperty(exports, "hermesChatStream", { enumerable: true, get: function () { return hermesClient_1.hermesChatStream; } });
Object.defineProperty(exports, "isConfigured", { enumerable: true, get: function () { return hermesClient_1.isConfigured; } });
Object.defineProperty(exports, "HERMES_MODEL", { enumerable: true, get: function () { return hermesClient_1.HERMES_MODEL; } });
Object.defineProperty(exports, "HERMES_BASE_URL", { enumerable: true, get: function () { return hermesClient_1.HERMES_BASE_URL; } });
const hermesClient_2 = require("../llm/hermesClient");
// Legacy alias from the "open personality" era — some callers may still use it.
async function openChatCompletion(personaPrompt, message) {
    return (0, hermesClient_2.hermesChatCompletion)(personaPrompt, message);
}
//# sourceMappingURL=open.js.map