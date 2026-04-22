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

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

function envNumber(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

function nextUtcMidnight(nowMs: number): number {
  const d = new Date(nowMs);
  d.setUTCHours(24, 0, 0, 0);
  return d.getTime();
}

export class TokenBudget {
  private hourBucket = 0;
  private dayBucket = 0;
  private hourWindowEnd: number;
  private dayWindowEnd: number;

  public readonly hourCap: number;
  public readonly dayCap: number;

  constructor(now: number = Date.now()) {
    this.hourCap = envNumber('AGENT_HOUR_TOKEN_CAP', 75_000);
    this.dayCap = envNumber('AGENT_DAY_TOKEN_CAP', 500_000);
    this.hourWindowEnd = now + HOUR_MS;
    this.dayWindowEnd = nextUtcMidnight(now);
  }

  /**
   * Fold a single Anthropic response's usage into the rolling buckets.
   * Counts both input and output tokens. Cache reads + cache creation are
   * treated as input for accounting purposes (since Anthropic bills them).
   */
  record(
    usage:
      | {
          input_tokens?: number;
          output_tokens?: number;
          cache_read_input_tokens?: number;
          cache_creation_input_tokens?: number;
        }
      | undefined,
    now: number = Date.now(),
  ): void {
    if (!usage) return;
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
  shouldPause(now: number = Date.now()): TokenBudgetPauseDecision {
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

  snapshot(now: number = Date.now()): TokenBudgetSnapshot {
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

  private roll(now: number): void {
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

// Singleton — both hermesClient and AgentWorker import from here.
export const tokenBudget = new TokenBudget();
