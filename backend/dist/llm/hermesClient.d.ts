export type LLMProvider = 'anthropic';
export declare const LLM_PROVIDER: LLMProvider;
export declare const HERMES_MODEL: string;
export declare const HERMES_BASE_URL: string;
export declare const ANTHROPIC_API_KEY: string;
export type HermesErrorCode = 'missing_key' | 'provider_error' | 'timeout' | 'bad_response' | 'disabled_by_config';
export interface HermesPublicError {
    code: HermesErrorCode;
    message: string;
    status: number;
    retryable: boolean;
    provider: LLMProvider;
}
export interface HermesConfigStatus {
    provider: LLMProvider;
    configured: boolean;
    model: string;
    baseUrl: string;
}
export interface HermesChatResult {
    ok: boolean;
    text: string | null;
    error?: HermesPublicError;
}
export declare class HermesApiError extends Error {
    readonly details: HermesPublicError;
    constructor(details: HermesPublicError, cause?: unknown);
}
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
export declare function getHermesConfigStatus(): HermesConfigStatus;
export declare function isConfigured(): boolean;
export declare function getPublicHermesError(error: unknown): HermesPublicError;
export declare function hermesChatCompletion(systemPrompt: string, userMessage: string, opts?: {
    temperature?: number;
    maxTokens?: number;
}): Promise<string>;
export declare function safeHermesChatCompletion(systemPrompt: string, userMessage: string, opts?: {
    temperature?: number;
    maxTokens?: number;
}): Promise<HermesChatResult>;
export declare function hermesChat(params: HermesChatParams): Promise<HermesResponse>;
export declare function hermesChatStream(params: HermesChatParams): AsyncGenerator<HermesStreamEvent, void, unknown>;
//# sourceMappingURL=hermesClient.d.ts.map