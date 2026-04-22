"use strict";
/**
 * Rolling hour / UTC-day token budget for the Hermes agent. The Anthropic
 * client records every response's usage through `record()`; the worker
 * calls `shouldPause()` before picking up new work and pauses if either
 * bucket is over cap.
 *
 * Buckets reset automatically on rollover — the hour bucket every 60 min
 * from the last rollover, the day bucket on UTC midnight.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.tokenBudget = exports.TokenBudget = void 0;
const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;
function envNumber(name, fallback) {
    const raw = process.env[name];
    if (!raw)
        return fallback;
    const n = Number(raw);
    return Number.isFinite(n) && n > 0 ? n : fallback;
}
function nextUtcMidnight(nowMs) {
    const d = new Date(nowMs);
    d.setUTCHours(24, 0, 0, 0);
    return d.getTime();
}
class TokenBudget {
    constructor(now = Date.now()) {
        this.hourBucket = 0;
        this.dayBucket = 0;
        this.hourCap = envNumber('AGENT_HOUR_TOKEN_CAP', 75000);
        this.dayCap = envNumber('AGENT_DAY_TOKEN_CAP', 500000);
        this.hourWindowEnd = now + HOUR_MS;
        this.dayWindowEnd = nextUtcMidnight(now);
    }
    /**
     * Fold a single Anthropic response's usage into the rolling buckets.
     * Counts both input and output tokens. Cache reads + cache creation are
     * treated as input for accounting purposes (since Anthropic bills them).
     */
    record(usage, now = Date.now()) {
        if (!usage)
            return;
        this.roll(now);
        const inTokens = (usage.input_tokens ?? 0)
            + (usage.cache_read_input_tokens ?? 0)
            + (usage.cache_creation_input_tokens ?? 0);
        const outTokens = usage.output_tokens ?? 0;
        const total = inTokens + outTokens;
        this.hourBucket += total;
        this.dayBucket += total;
    }
    /** Returns {paused: true, reason, resumeAt} when either bucket is over cap. */
    shouldPause(now = Date.now()) {
        this.roll(now);
        if (this.dayBucket >= this.dayCap) {
            return {
                paused: true,
                reason: `daily token cap reached (${this.dayBucket} / ${this.dayCap})`,
                resumeAt: this.dayWindowEnd,
            };
        }
        if (this.hourBucket >= this.hourCap) {
            return {
                paused: true,
                reason: `hourly token cap reached (${this.hourBucket} / ${this.hourCap})`,
                resumeAt: this.hourWindowEnd,
            };
        }
        return { paused: false };
    }
    snapshot(now = Date.now()) {
        this.roll(now);
        const decision = this.shouldPause(now);
        return {
            hour: this.hourBucket,
            day: this.dayBucket,
            hourCap: this.hourCap,
            dayCap: this.dayCap,
            paused: decision.paused,
            reason: decision.reason ?? null,
            resumeAt: decision.resumeAt ?? null,
        };
    }
    roll(now) {
        if (now >= this.hourWindowEnd) {
            this.hourBucket = 0;
            this.hourWindowEnd = now + HOUR_MS;
        }
        if (now >= this.dayWindowEnd) {
            this.dayBucket = 0;
            this.dayWindowEnd = nextUtcMidnight(now);
        }
    }
}
exports.TokenBudget = TokenBudget;
// Singleton — both hermesClient and AgentWorker import from here.
exports.tokenBudget = new TokenBudget();
//# sourceMappingURL=TokenBudget.js.map