export declare const OPENROUTER_API_KEY: string;
export declare const HERMES_MODEL: string;
export declare const HERMES_BASE_URL: string;
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
    function: {
        name: string;
        arguments: string;
    };
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
    usage?: {
        prompt_tokens: number;
        completion_tokens: number;
        total_tokens: number;
    };
}
export type HermesStreamEvent = {
    type: 'text';
    data: string;
} | {
    type: 'tool_call';
    data: HermesToolCall[];
} | {
    type: 'done';
    data: {
        finishReason: string | null;
    };
};
export declare function isConfigured(): boolean;
/**
 * One-shot chat completion. Drop-in replacement for the old
 * anthropicChatCompletion(systemPrompt, userMessage) signature.
 * Never throws — returns a user-safe fallback string on error so
 * chat surfaces degrade gracefully.
 */
export declare function hermesChatCompletion(systemPrompt: string, userMessage: string, opts?: {
    temperature?: number;
    maxTokens?: number;
}): Promise<string>;
/**
 * Low-level single-shot call. Returns the full OpenAI-compatible response.
 * Throws on HTTP error so agent loops can react.
 */
export declare function hermesChat(params: HermesChatParams): Promise<HermesResponse>;
/**
 * Streaming chat. Yields text deltas as they arrive and a single
 * tool_call event once the assistant's tool_calls array is complete.
 * The caller should accumulate text and handle tool_call events before
 * feeding results back into a new hermesChat/hermesChatStream call.
 */
export declare function hermesChatStream(params: HermesChatParams): AsyncGenerator<HermesStreamEvent, void, unknown>;
//# sourceMappingURL=hermesClient.d.ts.map