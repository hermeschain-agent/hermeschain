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
exports.HermesApiError = exports.ANTHROPIC_API_KEY = exports.HERMES_BASE_URL = exports.HERMES_MODEL = exports.LLM_PROVIDER = void 0;
exports.getHermesConfigStatus = getHermesConfigStatus;
exports.isConfigured = isConfigured;
exports.getPublicHermesError = getPublicHermesError;
exports.hermesChatCompletion = hermesChatCompletion;
exports.safeHermesChatCompletion = safeHermesChatCompletion;
exports.hermesChat = hermesChat;
exports.hermesChatStream = hermesChatStream;
const dotenv = __importStar(require("dotenv"));
const TokenBudget_1 = require("../agent/TokenBudget");
dotenv.config();
exports.LLM_PROVIDER = 'anthropic';
exports.HERMES_MODEL = process.env.HERMES_MODEL || 'claude-haiku-4-5-20251001';
exports.HERMES_BASE_URL = process.env.HERMES_BASE_URL || 'https://api.anthropic.com/v1';
exports.ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY || '';
const HERMES_TIMEOUT_MS = Number(process.env.HERMES_TIMEOUT_MS || 30000);
class HermesApiError extends Error {
    constructor(details, cause) {
        super(details.message);
        this.name = 'HermesApiError';
        this.details = details;
        if (cause) {
            this.cause = cause;
        }
    }
}
exports.HermesApiError = HermesApiError;
function publicError(code, overrides = {}) {
    const defaults = {
        missing_key: {
            message: 'Hermes is not configured yet. Set ANTHROPIC_API_KEY to wake the Claude runtime.',
            status: 503,
            retryable: false,
            provider: 'anthropic',
        },
        provider_error: {
            message: 'Anthropic rejected the request. Hermes could not answer right now.',
            status: 502,
            retryable: true,
            provider: 'anthropic',
        },
        timeout: {
            message: 'Anthropic timed out while Hermes was thinking. Try again in a moment.',
            status: 504,
            retryable: true,
            provider: 'anthropic',
        },
        bad_response: {
            message: 'Anthropic returned an unexpected response format.',
            status: 502,
            retryable: true,
            provider: 'anthropic',
        },
        disabled_by_config: {
            message: 'Hermes is disabled by configuration.',
            status: 503,
            retryable: false,
            provider: 'anthropic',
        },
    };
    return {
        code,
        ...defaults[code],
        ...overrides,
    };
}
function createError(code, overrides = {}, cause) {
    return new HermesApiError(publicError(code, overrides), cause);
}
function getHermesConfigStatus() {
    return {
        provider: exports.LLM_PROVIDER,
        configured: exports.ANTHROPIC_API_KEY.length > 0,
        model: exports.HERMES_MODEL,
        baseUrl: exports.HERMES_BASE_URL,
    };
}
function isConfigured() {
    return exports.ANTHROPIC_API_KEY.length > 0;
}
function getPublicHermesError(error) {
    if (error instanceof HermesApiError) {
        return error.details;
    }
    return publicError('provider_error', {
        message: 'Hermes encountered an unexpected provider failure.',
    });
}
function anthropicHeaders() {
    return {
        'x-api-key': exports.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
        'Content-Type': 'application/json',
    };
}
function asTextBlock(content) {
    if (!content || !content.trim())
        return [];
    return [{ type: 'text', text: content }];
}
function toAnthropicMessages(messages) {
    const converted = [];
    for (const message of messages) {
        if (message.role === 'system')
            continue;
        if (message.role === 'tool') {
            // Anthropic requires non-empty content on tool_result blocks.
            const toolText = typeof message.content === 'string' && message.content.length > 0
                ? message.content
                : '(no result)';
            converted.push({
                role: 'user',
                content: [
                    {
                        type: 'tool_result',
                        tool_use_id: message.tool_call_id,
                        content: toolText,
                    },
                ],
            });
            continue;
        }
        const role = message.role === 'assistant' ? 'assistant' : 'user';
        const content = asTextBlock(message.content);
        if (role === 'assistant' && Array.isArray(message.tool_calls)) {
            for (const toolCall of message.tool_calls) {
                let parsedArgs = {};
                try {
                    parsedArgs = toolCall.function.arguments
                        ? JSON.parse(toolCall.function.arguments)
                        : {};
                }
                catch {
                    parsedArgs = { raw: toolCall.function.arguments || '' };
                }
                content.push({
                    type: 'tool_use',
                    id: toolCall.id,
                    name: toolCall.function.name,
                    input: parsedArgs,
                });
            }
        }
        // Anthropic rejects empty text blocks. If there are no real blocks,
        // skip the message entirely instead of pushing a placeholder.
        if (content.length === 0) {
            continue;
        }
        converted.push({ role, content });
    }
    return converted;
}
/**
 * Convert Hermes tool specs to Anthropic's shape. The last tool carries an
 * ephemeral `cache_control` marker so Anthropic caches the full tool block
 * (tools are read as a contiguous prefix — marking the last one caches
 * everything up to and including it). The cache cuts input-token billing
 * from ~$3/MTok to ~$0.30/MTok on cached re-reads across iterations.
 */
function toAnthropicTools(tools, cache = true) {
    const list = (tools || []).map((tool) => ({
        name: tool.function.name,
        description: tool.function.description,
        input_schema: tool.function.parameters,
    }));
    if (cache && list.length > 0) {
        list[list.length - 1].cache_control = { type: 'ephemeral' };
    }
    return list;
}
function toAnthropicBody(params) {
    const system = params.messages
        .filter((message) => message.role === 'system' && message.content)
        .map((message) => message.content)
        .join('\n\n');
    const body = {
        model: exports.HERMES_MODEL,
        max_tokens: params.maxTokens ?? 1024,
        messages: toAnthropicMessages(params.messages),
    };
    if (system) {
        // Structured system prompt with ephemeral cache_control so Anthropic
        // can cache it across subsequent calls in the same task. The entire
        // system string is a single cached block; the context pack that
        // varies per task is already in user messages, so the cache stays
        // warm iteration-to-iteration.
        body.system = [
            {
                type: 'text',
                text: system,
                cache_control: { type: 'ephemeral' },
            },
        ];
    }
    if (params.temperature !== undefined)
        body.temperature = params.temperature;
    if (params.topP !== undefined)
        body.top_p = params.topP;
    const tools = toAnthropicTools(params.tools);
    if (tools.length > 0) {
        body.tools = tools;
    }
    return body;
}
function fromAnthropicResponse(data) {
    const contentBlocks = Array.isArray(data?.content) ? data.content : [];
    const text = contentBlocks
        .filter((block) => block?.type === 'text')
        .map((block) => block.text)
        .join('');
    const toolCalls = contentBlocks
        .filter((block) => block?.type === 'tool_use')
        .map((block) => ({
        id: String(block.id),
        type: 'function',
        function: {
            name: String(block.name),
            arguments: JSON.stringify(block.input || {}),
        },
    }));
    return {
        id: String(data?.id || `anthropic-${Date.now()}`),
        model: String(data?.model || exports.HERMES_MODEL),
        choices: [
            {
                index: 0,
                message: {
                    role: 'assistant',
                    content: text || null,
                    tool_calls: toolCalls.length > 0 ? toolCalls : undefined,
                },
                finish_reason: data?.stop_reason || 'stop',
            },
        ],
        usage: data?.usage
            ? {
                prompt_tokens: Number(data.usage.input_tokens || 0),
                completion_tokens: Number(data.usage.output_tokens || 0),
                total_tokens: Number(data.usage.input_tokens || 0) +
                    Number(data.usage.output_tokens || 0),
            }
            : undefined,
    };
}
// Anti-guzzler circuit breaker: when Anthropic says we're out of credits
// (or auth-broken), pause all calls for a long cooldown instead of retrying
// every few seconds. Avoids burning rate-limit headroom and spamming logs.
const CREDIT_BACKOFF_MS = Number(process.env.HERMES_CREDIT_BACKOFF_MS) || 60 * 60 * 1000;
let circuitBreakerUntil = 0;
let circuitBreakerReason = '';
function isFatalProviderBody(text) {
    const lower = text.toLowerCase();
    return (lower.includes('credit balance is too low') ||
        lower.includes('insufficient_quota') ||
        lower.includes('billing') ||
        lower.includes('authentication_error'));
}
async function fetchAnthropic(body) {
    if (!isConfigured()) {
        throw createError('missing_key');
    }
    const now = Date.now();
    if (circuitBreakerUntil > now) {
        const minutesLeft = Math.ceil((circuitBreakerUntil - now) / 60000);
        throw createError('provider_error', {
            message: `Hermes circuit breaker open for ${minutesLeft}m: ${circuitBreakerReason}`,
            status: 503,
        });
    }
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), HERMES_TIMEOUT_MS);
    try {
        const response = await fetch(`${exports.HERMES_BASE_URL}/messages`, {
            method: 'POST',
            headers: anthropicHeaders(),
            body: JSON.stringify(body),
            signal: controller.signal,
        });
        if (!response.ok) {
            const text = await response.text();
            // Surface the Anthropic error body in the message itself so it shows
            // up in lastFailure / logs without needing to inspect cause.
            const snippet = text.slice(0, 400).replace(/\s+/g, ' ');
            console.error(`[HERMES] Anthropic ${response.status} error body: ${text.slice(0, 800)}`);
            // Trip the circuit breaker on fatal billing/auth errors so we stop
            // burning calls until a human top-ups credits or rotates the key.
            if (response.status === 400 || response.status === 401 || response.status === 403) {
                if (isFatalProviderBody(text)) {
                    circuitBreakerUntil = Date.now() + CREDIT_BACKOFF_MS;
                    circuitBreakerReason = snippet;
                    console.error(`[HERMES] Circuit breaker OPEN for ${CREDIT_BACKOFF_MS / 60000}min — ${snippet}`);
                }
            }
            throw createError('provider_error', {
                message: `Anthropic returned HTTP ${response.status}: ${snippet}`,
                status: response.status,
            }, text);
        }
        const data = await response.json();
        if (!data || !Array.isArray(data.content)) {
            throw createError('bad_response');
        }
        // Record token spend for the hour/day budget so the worker can pause
        // itself before Anthropic tripping the billing-level circuit breaker.
        if (data.usage) {
            TokenBudget_1.tokenBudget.record(data.usage);
            const cacheRead = Number(data.usage.cache_read_input_tokens || 0);
            if (cacheRead > 0) {
                console.log(`[HERMES] usage — in:${data.usage.input_tokens} out:${data.usage.output_tokens} cache_read:${cacheRead}`);
            }
        }
        return data;
    }
    catch (error) {
        if (error?.name === 'AbortError') {
            throw createError('timeout', undefined, error);
        }
        if (error instanceof HermesApiError) {
            throw error;
        }
        throw createError('provider_error', undefined, error);
    }
    finally {
        clearTimeout(timeout);
    }
}
async function hermesChatCompletion(systemPrompt, userMessage, opts = {}) {
    const response = await hermesChat({
        messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userMessage },
        ],
        temperature: opts.temperature ?? 0.7,
        maxTokens: opts.maxTokens ?? 500,
    });
    const content = response.choices?.[0]?.message?.content;
    if (typeof content === 'string' && content.trim().length > 0) {
        return content.trim();
    }
    throw createError('bad_response', {
        message: 'Anthropic returned an empty completion.',
    });
}
async function safeHermesChatCompletion(systemPrompt, userMessage, opts = {}) {
    try {
        const text = await hermesChatCompletion(systemPrompt, userMessage, opts);
        return { ok: true, text };
    }
    catch (error) {
        return {
            ok: false,
            text: null,
            error: getPublicHermesError(error),
        };
    }
}
async function hermesChat(params) {
    const data = await fetchAnthropic(toAnthropicBody(params));
    return fromAnthropicResponse(data);
}
async function* hermesChatStream(params) {
    const response = await hermesChat(params);
    const choice = response.choices?.[0];
    if (choice?.message?.content) {
        yield { type: 'text', data: choice.message.content };
    }
    if (Array.isArray(choice?.message?.tool_calls) && choice.message.tool_calls.length > 0) {
        yield { type: 'tool_call', data: choice.message.tool_calls };
    }
    yield {
        type: 'done',
        data: {
            finishReason: choice?.finish_reason || 'stop',
        },
    };
}
if (!isConfigured()) {
    console.warn('[HERMES] ANTHROPIC_API_KEY is not set — Hermes chat, rituals, and real worker reasoning will stay unavailable.');
}
console.log(`[HERMES] LLM provider: ${exports.LLM_PROVIDER} | model: ${exports.HERMES_MODEL}`);
//# sourceMappingURL=hermesClient.js.map