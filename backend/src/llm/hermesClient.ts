import * as dotenv from 'dotenv';
dotenv.config();

// ─── Multi-provider LLM configuration ───────────────────────────
// Supported providers: "openrouter" | "anthropic" | "openai"
//
//   LLM_PROVIDER=openrouter   → OPENROUTER_API_KEY   (default)
//   LLM_PROVIDER=anthropic    → ANTHROPIC_API_KEY
//   LLM_PROVIDER=openai       → OPENAI_API_KEY
// ─────────────────────────────────────────────────────────────────

export type LLMProvider = 'openrouter' | 'anthropic' | 'openai';

function detectProvider(): LLMProvider {
  const explicit = (process.env.LLM_PROVIDER || '').toLowerCase();
  if (explicit === 'anthropic' || explicit === 'claude') return 'anthropic';
  if (explicit === 'openai') return 'openai';
  if (explicit === 'openrouter') return 'openrouter';
  if (process.env.ANTHROPIC_API_KEY) return 'anthropic';
  if (process.env.OPENAI_API_KEY) return 'openai';
  return 'openrouter';
}

export const LLM_PROVIDER = detectProvider();

const PROVIDER_DEFAULTS: Record<LLMProvider, { key: string; model: string; baseUrl: string }> = {
  openrouter: {
    key: process.env.OPENROUTER_API_KEY || '',
    model: 'nousresearch/hermes-4-405b',
    baseUrl: 'https://openrouter.ai/api/v1',
  },
  anthropic: {
    key: process.env.ANTHROPIC_API_KEY || '',
    model: 'claude-sonnet-4-5-20250514',
    baseUrl: 'https://api.anthropic.com/v1',
  },
  openai: {
    key: process.env.OPENAI_API_KEY || '',
    model: 'gpt-4o',
    baseUrl: 'https://api.openai.com/v1',
  },
};

const defaults = PROVIDER_DEFAULTS[LLM_PROVIDER];
export const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY || process.env.ANTHROPIC_API_KEY || process.env.OPENAI_API_KEY || defaults.key;
export const HERMES_MODEL = process.env.HERMES_MODEL || defaults.model;
export const HERMES_BASE_URL = process.env.HERMES_BASE_URL || defaults.baseUrl;

const IS_ANTHROPIC = LLM_PROVIDER === 'anthropic' || OPENROUTER_API_KEY.startsWith('sk-ant-');

const HERMES_REFERER = 'https://hermeschain.app';
const HERMES_TITLE = 'Hermeschain';

if (!OPENROUTER_API_KEY) {
  console.warn('[HERMES] No LLM API key set — Hermes responses will fall back to offline messages.');
}
console.log(`[HERMES] LLM provider: ${LLM_PROVIDER} | model: ${HERMES_MODEL}`);

export type HermesRole = 'system' | 'user' | 'assistant' | 'tool';

export interface HermesMessage {
  role: HermesRole;
  content?: string | null;
  name?: string;
  tool_call_id?: string;
  tool_calls?: HermesToolCall[];
}

export interface HermesToolCall {
  id: string;
  type: 'function';
  function: { name: string; arguments: string };
}

export interface HermesTool {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
}

export interface HermesChatParams {
  messages: HermesMessage[];
  tools?: HermesTool[];
  temperature?: number;
  maxTokens?: number;
  topP?: number;
}

export interface HermesChoice {
  index: number;
  message: HermesMessage;
  finish_reason: string | null;
}

export interface HermesResponse {
  id: string;
  model: string;
  choices: HermesChoice[];
  usage?: { prompt_tokens: number; completion_tokens: number; total_tokens: number };
}

export type HermesStreamEvent =
  | { type: 'text'; data: string }
  | { type: 'tool_call'; data: HermesToolCall[] }
  | { type: 'done'; data: { finishReason: string | null } };

export function isConfigured(): boolean {
  return OPENROUTER_API_KEY.length > 0;
}

function headers(): Record<string, string> {
  if (IS_ANTHROPIC) {
    return {
      'x-api-key': OPENROUTER_API_KEY,
      'anthropic-version': '2023-06-01',
      'Content-Type': 'application/json',
    };
  }
  return {
    'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
    'Content-Type': 'application/json',
    'HTTP-Referer': HERMES_REFERER,
    'X-Title': HERMES_TITLE,
  };
}

function getApiUrl(): string {
  if (IS_ANTHROPIC) return `${HERMES_BASE_URL}/messages`;
  return `${HERMES_BASE_URL}/chat/completions`;
}

function toAnthropicBody(params: HermesChatParams): Record<string, unknown> {
  const systemMsg = params.messages.find(m => m.role === 'system');
  const nonSystemMsgs = params.messages.filter(m => m.role !== 'system');
  const body: Record<string, unknown> = {
    model: HERMES_MODEL,
    max_tokens: params.maxTokens ?? 1024,
    messages: nonSystemMsgs.map(m => ({ role: m.role, content: m.content || '' })),
  };
  if (systemMsg?.content) body.system = systemMsg.content;
  if (params.temperature !== undefined) body.temperature = params.temperature;
  return body;
}

function fromAnthropicResponse(data: any): HermesResponse {
  const textContent = (data.content || [])
    .filter((b: any) => b.type === 'text')
    .map((b: any) => b.text)
    .join('');
  return {
    id: data.id,
    model: data.model,
    choices: [{
      index: 0,
      message: { role: 'assistant', content: textContent },
      finish_reason: data.stop_reason || 'stop',
    }],
    usage: data.usage ? {
      prompt_tokens: data.usage.input_tokens,
      completion_tokens: data.usage.output_tokens,
      total_tokens: (data.usage.input_tokens || 0) + (data.usage.output_tokens || 0),
    } : undefined,
  };
}

/**
 * One-shot chat completion. Drop-in replacement for the old
 * anthropicChatCompletion(systemPrompt, userMessage) signature.
 * Never throws — returns a user-safe fallback string on error so
 * chat surfaces degrade gracefully.
 */
export async function hermesChatCompletion(
  systemPrompt: string,
  userMessage: string,
  opts: { temperature?: number; maxTokens?: number } = {},
): Promise<string> {
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
  } catch (err) {
    console.error('[HERMES] hermesChatCompletion error:', err);
    return '[HERMES]: communication error. Try again.';
  }
}

/**
 * Low-level single-shot call. Returns the full OpenAI-compatible response.
 * Throws on HTTP error so agent loops can react.
 */
export async function hermesChat(params: HermesChatParams): Promise<HermesResponse> {
  if (!isConfigured()) {
    throw new Error('OPENROUTER_API_KEY not configured');
  }
  let body: Record<string, unknown>;

  if (IS_ANTHROPIC) {
    body = toAnthropicBody(params);
  } else {
    body = {
      model: HERMES_MODEL,
      messages: params.messages,
      temperature: params.temperature ?? 0.7,
      max_tokens: params.maxTokens ?? 1024,
    };
    if (params.topP !== undefined) body.top_p = params.topP;
    if (params.tools && params.tools.length > 0) body.tools = params.tools;
  }

  const response = await fetch(getApiUrl(), {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Hermes API ${response.status}: ${text}`);
  }

  const data = await response.json();
  return IS_ANTHROPIC ? fromAnthropicResponse(data) : data as HermesResponse;
}

/**
 * Streaming chat. Yields text deltas as they arrive and a single
 * tool_call event once the assistant's tool_calls array is complete.
 * The caller should accumulate text and handle tool_call events before
 * feeding results back into a new hermesChat/hermesChatStream call.
 */
export async function* hermesChatStream(
  params: HermesChatParams,
): AsyncGenerator<HermesStreamEvent, void, unknown> {
  if (!isConfigured()) {
    yield { type: 'text', data: '[HERMES]: offline. Set OPENROUTER_API_KEY to wake me up.' };
    yield { type: 'done', data: { finishReason: 'error' } };
    return;
  }

  let body: Record<string, unknown>;

  if (IS_ANTHROPIC) {
    body = { ...toAnthropicBody({ ...params, maxTokens: params.maxTokens ?? 2048 }), stream: true };
  } else {
    body = {
      model: HERMES_MODEL,
      messages: params.messages,
      temperature: params.temperature ?? 0.7,
      max_tokens: params.maxTokens ?? 2048,
      stream: true,
    };
    if (params.tools && params.tools.length > 0) body.tools = params.tools;
  }

  const response = await fetch(getApiUrl(), {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify(body),
  });

  if (!response.ok || !response.body) {
    const text = response.body ? await response.text() : '(no body)';
    throw new Error(`Hermes stream ${response.status}: ${text}`);
  }

  const reader = (response.body as unknown as ReadableStream<Uint8Array>).getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let finishReason: string | null = null;

  // Accumulate tool calls across deltas — OpenAI/OpenRouter streams them
  // incrementally by index, with function.arguments as partial JSON.
  const toolSlots: Record<number, { id: string; name: string; arguments: string }> = {};

  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      // SSE framing: events are separated by blank lines, each line "data: {...}".
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const rawLine of lines) {
        const line = rawLine.trim();
        if (!line || !line.startsWith('data:')) continue;
        const payload = line.slice(5).trim();
        if (payload === '[DONE]') {
          finishReason = finishReason ?? 'stop';
          continue;
        }
        let chunk: any;
        try {
          chunk = JSON.parse(payload);
        } catch {
          continue;
        }
        const choice = chunk?.choices?.[0];
        if (!choice) continue;
        const delta = choice.delta || {};
        if (typeof delta.content === 'string' && delta.content.length > 0) {
          yield { type: 'text', data: delta.content };
        }
        if (Array.isArray(delta.tool_calls)) {
          for (const tc of delta.tool_calls) {
            const idx = typeof tc.index === 'number' ? tc.index : 0;
            const slot = (toolSlots[idx] ||= { id: '', name: '', arguments: '' });
            if (tc.id) slot.id = tc.id;
            if (tc.function?.name) slot.name = tc.function.name;
            if (tc.function?.arguments) slot.arguments += tc.function.arguments;
          }
        }
        if (choice.finish_reason) finishReason = choice.finish_reason;
      }
    }
  } finally {
    try { reader.releaseLock(); } catch { /* ignore */ }
  }

  const toolCalls: HermesToolCall[] = Object.keys(toolSlots)
    .sort((a, b) => Number(a) - Number(b))
    .map(k => toolSlots[Number(k)])
    .filter(s => s.name.length > 0)
    .map(s => ({ id: s.id || `call_${Math.random().toString(36).slice(2, 10)}`, type: 'function', function: { name: s.name, arguments: s.arguments || '{}' } }));

  if (toolCalls.length > 0) {
    yield { type: 'tool_call', data: toolCalls };
  }

  yield { type: 'done', data: { finishReason } };
}
