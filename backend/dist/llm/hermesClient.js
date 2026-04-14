"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.HERMES_BASE_URL = exports.HERMES_MODEL = exports.OPENROUTER_API_KEY = void 0;
exports.isConfigured = isConfigured;
exports.hermesChatCompletion = hermesChatCompletion;
exports.hermesChat = hermesChat;
exports.hermesChatStream = hermesChatStream;
const dotenv = __importStar(require("dotenv"));
dotenv.config();
exports.OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY || '';
exports.HERMES_MODEL = process.env.HERMES_MODEL || 'nousresearch/hermes-4-405b';
exports.HERMES_BASE_URL = process.env.HERMES_BASE_URL || 'https://openrouter.ai/api/v1';
const HERMES_REFERER = 'https://hermeschain.app';
const HERMES_TITLE = 'Hermeschain';
if (!exports.OPENROUTER_API_KEY) {
    console.warn('[HERMES] OPENROUTER_API_KEY not set — Hermes responses will fall back to offline messages.');
}
function isConfigured() {
    return exports.OPENROUTER_API_KEY.length > 0;
}
function headers() {
    return {
        'Authorization': `Bearer ${exports.OPENROUTER_API_KEY}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': HERMES_REFERER,
        'X-Title': HERMES_TITLE,
    };
}
/**
 * One-shot chat completion. Drop-in replacement for the old
 * anthropicChatCompletion(systemPrompt, userMessage) signature.
 * Never throws — returns a user-safe fallback string on error so
 * chat surfaces degrade gracefully.
 */
async function hermesChatCompletion(systemPrompt, userMessage, opts = {}) {
    if (!isConfigured()) {
        return '[HERMES]: offline. Set OPENROUTER_API_KEY to wake me up.';
    }
    try {
        const res = await hermesChat({
            messages: [
                { role: 'system', content: systemPrompt },
                { role: 'user', content: userMessage },
            ],
            temperature: opts.temperature ?? 0.7,
            maxTokens: opts.maxTokens ?? 500,
        });
        const content = res.choices?.[0]?.message?.content;
        if (typeof content === 'string' && content.trim().length > 0) {
            return content.trim();
        }
        return '[HERMES]: empty response.';
    }
    catch (err) {
        console.error('[HERMES] hermesChatCompletion error:', err);
        return '[HERMES]: communication error. Try again.';
    }
}
/**
 * Low-level single-shot call. Returns the full OpenAI-compatible response.
 * Throws on HTTP error so agent loops can react.
 */
async function hermesChat(params) {
    if (!isConfigured()) {
        throw new Error('OPENROUTER_API_KEY not configured');
    }
    const body = {
        model: exports.HERMES_MODEL,
        messages: params.messages,
        temperature: params.temperature ?? 0.7,
        max_tokens: params.maxTokens ?? 1024,
    };
    if (params.topP !== undefined)
        body.top_p = params.topP;
    if (params.tools && params.tools.length > 0)
        body.tools = params.tools;
    const response = await fetch(`${exports.HERMES_BASE_URL}/chat/completions`, {
        method: 'POST',
        headers: headers(),
        body: JSON.stringify(body),
    });
    if (!response.ok) {
        const text = await response.text();
        throw new Error(`Hermes API ${response.status}: ${text}`);
    }
    return (await response.json());
}
/**
 * Streaming chat. Yields text deltas as they arrive and a single
 * tool_call event once the assistant's tool_calls array is complete.
 * The caller should accumulate text and handle tool_call events before
 * feeding results back into a new hermesChat/hermesChatStream call.
 */
async function* hermesChatStream(params) {
    if (!isConfigured()) {
        yield { type: 'text', data: '[HERMES]: offline. Set OPENROUTER_API_KEY to wake me up.' };
        yield { type: 'done', data: { finishReason: 'error' } };
        return;
    }
    const body = {
        model: exports.HERMES_MODEL,
        messages: params.messages,
        temperature: params.temperature ?? 0.7,
        max_tokens: params.maxTokens ?? 2048,
        stream: true,
    };
    if (params.tools && params.tools.length > 0)
        body.tools = params.tools;
    const response = await fetch(`${exports.HERMES_BASE_URL}/chat/completions`, {
        method: 'POST',
        headers: headers(),
        body: JSON.stringify(body),
    });
    if (!response.ok || !response.body) {
        const text = response.body ? await response.text() : '(no body)';
        throw new Error(`Hermes stream ${response.status}: ${text}`);
    }
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let finishReason = null;
    // Accumulate tool calls across deltas — OpenAI/OpenRouter streams them
    // incrementally by index, with function.arguments as partial JSON.
    const toolSlots = {};
    try {
        while (true) {
            const { value, done } = await reader.read();
            if (done)
                break;
            buffer += decoder.decode(value, { stream: true });
            // SSE framing: events are separated by blank lines, each line "data: {...}".
            const lines = buffer.split('\n');
            buffer = lines.pop() || '';
            for (const rawLine of lines) {
                const line = rawLine.trim();
                if (!line || !line.startsWith('data:'))
                    continue;
                const payload = line.slice(5).trim();
                if (payload === '[DONE]') {
                    finishReason = finishReason ?? 'stop';
                    continue;
                }
                let chunk;
                try {
                    chunk = JSON.parse(payload);
                }
                catch {
                    continue;
                }
                const choice = chunk?.choices?.[0];
                if (!choice)
                    continue;
                const delta = choice.delta || {};
                if (typeof delta.content === 'string' && delta.content.length > 0) {
                    yield { type: 'text', data: delta.content };
                }
                if (Array.isArray(delta.tool_calls)) {
                    for (const tc of delta.tool_calls) {
                        const idx = typeof tc.index === 'number' ? tc.index : 0;
                        const slot = (toolSlots[idx] || (toolSlots[idx] = { id: '', name: '', arguments: '' }));
                        if (tc.id)
                            slot.id = tc.id;
                        if (tc.function?.name)
                            slot.name = tc.function.name;
                        if (tc.function?.arguments)
                            slot.arguments += tc.function.arguments;
                    }
                }
                if (choice.finish_reason)
                    finishReason = choice.finish_reason;
            }
        }
    }
    finally {
        try {
            reader.releaseLock();
        }
        catch { /* ignore */ }
    }
    const toolCalls = Object.keys(toolSlots)
        .sort((a, b) => Number(a) - Number(b))
        .map(k => toolSlots[Number(k)])
        .filter(s => s.name.length > 0)
        .map(s => ({ id: s.id || `call_${Math.random().toString(36).slice(2, 10)}`, type: 'function', function: { name: s.name, arguments: s.arguments || '{}' } }));
    if (toolCalls.length > 0) {
        yield { type: 'tool_call', data: toolCalls };
    }
    yield { type: 'done', data: { finishReason } };
}
//# sourceMappingURL=hermesClient.js.map