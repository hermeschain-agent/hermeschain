/**
 * Rolling hour / UTC-day token budget for the Hermes agent. The Anthropic
 * client records every response's usage through `record()`; the worker
 * calls `shouldPause()` before picking up new work and pauses if either
 * bucket is over cap.
 *
 * Buckets reset automatically on rollover — the hour bucket every 60 min
 * from the last rollover, the day bucket on UTC midnight.
 */
export interface TokenBudgetSnapshot {
    hour: number;
    day: number;
    hourCap: number;
    dayCap: number;
    paused: boolean;
    reason: string | null;
    resumeAt: number | null;
}
export interface TokenBudgetPauseDecision {
    paused: boolean;
    reason?: string;
    resumeAt?: number;
}
export declare class TokenBudget {
    private hourBucket;
    private dayBucket;
    private hourWindowEnd;
    private dayWindowEnd;
    readonly hourCap: number;
    readonly dayCap: number;
    constructor(now?: number);
    /**
     * Fold a single Anthropic response's usage into the rolling buckets.
     * Counts both input and output tokens. Cache reads + cache creation are
     * treated as input for accounting purposes (since Anthropic bills them).
     */
    record(usage: {
        input_tokens?: number;
        output_tokens?: number;
        cache_read_input_tokens?: number;
        cache_creation_input_tokens?: number;
    } | undefined, now?: number): void;
    /** Returns {paused: true, reason, resumeAt} when either bucket is over cap. */
    shouldPause(now?: number): TokenBudgetPauseDecision;
    snapshot(now?: number): TokenBudgetSnapshot;
    private roll;
}
export declare const tokenBudget: TokenBudget;
//# sourceMappingURL=TokenBudget.d.ts.map