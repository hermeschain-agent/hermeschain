/**
 * Rolling hour / UTC-day token budget for the Hermes agent. The Anthropic
 * client records every response's usage through `record()`; the worker
 * calls `shouldPause()` before picking up new work and pauses if either
 * bucket is over cap.
 *
 * Buckets reset automatically on rollover — the hour bucket every 60 min
 * from the last rollover, the day bucket on UTC midnight.
 */

import { db } from '../database/db';

export interface TokenBudgetSnapshot {
  hour: number;
  day: number;
  task: number;
  hourCap: number;
  dayCap: number;
  taskCapUsd: number;
  hourCostUsd: number;
  dayCostUsd: number;
  taskCostUsd: number;
  remainingHourUsd: number;
  remainingDayUsd: number;
  remainingTaskUsd: number;
  cacheHitRatio: number;
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
const TOKEN_BUDGET_KEY = 'global';
const USD_PER_MTOK_INPUT = Number(process.env.AGENT_INPUT_USD_PER_MTOK || '1');
const USD_PER_MTOK_OUTPUT = Number(process.env.AGENT_OUTPUT_USD_PER_MTOK || '5');
const USD_PER_MTOK_CACHE_WRITE = Number(process.env.AGENT_CACHE_WRITE_USD_PER_MTOK || '1.25');
const USD_PER_MTOK_CACHE_READ = Number(process.env.AGENT_CACHE_READ_USD_PER_MTOK || '0.10');

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
  private taskBucket = 0;
  private hourCostUsd = 0;
  private dayCostUsd = 0;
  private taskCostUsd = 0;
  private cacheReadTokens = 0;
  private cacheCreationTokens = 0;
  private hourWindowEnd: number;
  private dayWindowEnd: number;
  private initialized = false;
  private persistChain: Promise<void> = Promise.resolve();
  private currentTaskId: string | null = null;

  public hourCap!: number;
  public dayCap!: number;
  public hourUsdCap!: number;
  public dayUsdCap!: number;
  public taskUsdCap!: number;

  constructor(now: number = Date.now()) {
    this.applyEnvCaps();
    this.hourWindowEnd = now + HOUR_MS;
    this.dayWindowEnd = nextUtcMidnight(now);
  }

  /**
   * (Re)read every cap from the environment. Called at construction AND in
   * initialize(): the singleton is created at module-import time, which on
   * some setups runs before env/.env is fully loaded — so re-reading in
   * initialize() guarantees the configured caps are honored on every boot
   * (and that a redeploy with raised caps actually takes effect).
   */
  private applyEnvCaps(): void {
    this.hourCap = envNumber('AGENT_HOUR_TOKEN_CAP', 75_000);
    this.dayCap = envNumber('AGENT_DAY_TOKEN_CAP', 500_000);
    this.hourUsdCap = envNumber('AGENT_HOURLY_USD_CAP', 0.35);
    this.dayUsdCap = envNumber('AGENT_DAILY_USD_CAP', 2.5);
    this.taskUsdCap = envNumber('AGENT_TASK_USD_CAP', 0.15);
  }

  async initialize(): Promise<void> {
    // Re-read caps now that env/.env is fully loaded (the singleton may have
    // been constructed before env was ready).
    this.applyEnvCaps();

    if (this.initialized || !db.isPersistent()) {
      this.initialized = true;
      return;
    }

    try {
      const result = await db.query(
        `
          SELECT hour_bucket, day_bucket, hour_cost_usd, day_cost_usd,
                 cache_read_input_tokens, cache_creation_input_tokens,
                 hour_window_end, day_window_end
          FROM agent_token_budget_state
          WHERE budget_key = $1
          LIMIT $2
        `,
        [TOKEN_BUDGET_KEY, 1]
      );

      const row = result.rows?.[0];
      if (row) {
        this.hourBucket = Number(row.hour_bucket || 0);
        this.dayBucket = Number(row.day_bucket || 0);
        this.hourCostUsd = Number(row.hour_cost_usd || 0);
        this.dayCostUsd = Number(row.day_cost_usd || 0);
        this.cacheReadTokens = Number(row.cache_read_input_tokens || 0);
        this.cacheCreationTokens = Number(row.cache_creation_input_tokens || 0);
        this.hourWindowEnd = row.hour_window_end
          ? new Date(row.hour_window_end).getTime()
          : this.hourWindowEnd;
        this.dayWindowEnd = row.day_window_end
          ? new Date(row.day_window_end).getTime()
          : this.dayWindowEnd;
        this.roll(Date.now());
      }
    } catch (error) {
      console.error('[TOKEN_BUDGET] Failed to load persisted state:', error);
    } finally {
      this.initialized = true;
    }
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
    const cacheReadTokens = usage.cache_read_input_tokens ?? 0;
    const cacheCreationTokens = usage.cache_creation_input_tokens ?? 0;
    const total = inTokens + outTokens;
    const costUsd = this.calculateCostUsd(usage);
    this.hourBucket += total;
    this.dayBucket += total;
    this.taskBucket += total;
    this.hourCostUsd += costUsd;
    this.dayCostUsd += costUsd;
    this.taskCostUsd += costUsd;
    this.cacheReadTokens += cacheReadTokens;
    this.cacheCreationTokens += cacheCreationTokens;
    this.queuePersist();
  }

  startTask(taskId: string): void {
    this.currentTaskId = taskId;
    this.taskBucket = 0;
    this.taskCostUsd = 0;
  }

  finishTask(): void {
    this.currentTaskId = null;
    this.taskBucket = 0;
    this.taskCostUsd = 0;
  }

  /** Returns {paused: true, reason, resumeAt} when either bucket is over cap. */
  shouldPause(now: number = Date.now()): TokenBudgetPauseDecision {
    this.roll(now);
    if (this.dayCostUsd >= this.dayUsdCap) {
      return {
        paused: true,
        reason: `daily USD cap reached ($${this.dayCostUsd.toFixed(4)} / $${this.dayUsdCap.toFixed(2)})`,
        resumeAt: this.dayWindowEnd,
      };
    }
    if (this.hourCostUsd >= this.hourUsdCap) {
      return {
        paused: true,
        reason: `hourly USD cap reached ($${this.hourCostUsd.toFixed(4)} / $${this.hourUsdCap.toFixed(2)})`,
        resumeAt: this.hourWindowEnd,
      };
    }
    if (this.currentTaskId && this.taskCostUsd >= this.taskUsdCap) {
      return {
        paused: true,
        reason: `task USD cap reached ($${this.taskCostUsd.toFixed(4)} / $${this.taskUsdCap.toFixed(2)})`,
        resumeAt: this.hourWindowEnd,
      };
    }
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
      task: this.taskBucket,
      hourCap: this.hourCap,
      dayCap: this.dayCap,
      taskCapUsd: this.taskUsdCap,
      hourCostUsd: Number(this.hourCostUsd.toFixed(6)),
      dayCostUsd: Number(this.dayCostUsd.toFixed(6)),
      taskCostUsd: Number(this.taskCostUsd.toFixed(6)),
      remainingHourUsd: Math.max(0, Number((this.hourUsdCap - this.hourCostUsd).toFixed(6))),
      remainingDayUsd: Math.max(0, Number((this.dayUsdCap - this.dayCostUsd).toFixed(6))),
      remainingTaskUsd: Math.max(0, Number((this.taskUsdCap - this.taskCostUsd).toFixed(6))),
      cacheHitRatio: this.cacheHitRatio(),
      paused: decision.paused,
      reason: decision.reason ?? null,
      resumeAt: decision.resumeAt ?? null,
    };
  }

  private roll(now: number): void {
    if (now >= this.hourWindowEnd) {
      this.hourBucket = 0;
      this.hourCostUsd = 0;
      this.hourWindowEnd = now + HOUR_MS;
    }
    if (now >= this.dayWindowEnd) {
      this.dayBucket = 0;
      this.dayCostUsd = 0;
      this.cacheReadTokens = 0;
      this.cacheCreationTokens = 0;
      this.dayWindowEnd = nextUtcMidnight(now);
    }
  }

  private calculateCostUsd(usage: {
    input_tokens?: number;
    output_tokens?: number;
    cache_read_input_tokens?: number;
    cache_creation_input_tokens?: number;
  }): number {
    const baseInputTokens = Number(usage.input_tokens || 0);
    const outputTokens = Number(usage.output_tokens || 0);
    const cacheReadTokens = Number(usage.cache_read_input_tokens || 0);
    const cacheCreationTokens = Number(usage.cache_creation_input_tokens || 0);

    return (
      (baseInputTokens / 1_000_000) * USD_PER_MTOK_INPUT +
      (outputTokens / 1_000_000) * USD_PER_MTOK_OUTPUT +
      (cacheCreationTokens / 1_000_000) * USD_PER_MTOK_CACHE_WRITE +
      (cacheReadTokens / 1_000_000) * USD_PER_MTOK_CACHE_READ
    );
  }

  private cacheHitRatio(): number {
    const totalCacheTokens = this.cacheReadTokens + this.cacheCreationTokens;
    if (totalCacheTokens <= 0) return 0;
    return Number((this.cacheReadTokens / totalCacheTokens).toFixed(4));
  }

  private queuePersist(): void {
    if (!db.isPersistent()) {
      this.initialized = true;
      return;
    }

    this.persistChain = this.persistChain
      .then(async () => {
        if (!this.initialized) {
          this.initialized = true;
        }

        await db.query(
          `
            INSERT INTO agent_token_budget_state (
              budget_key,
              hour_bucket,
              day_bucket,
              task_bucket,
              hour_cost_usd,
              day_cost_usd,
              cache_read_input_tokens,
              cache_creation_input_tokens,
              hour_window_end,
              day_window_end,
              updated_at
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
            ON CONFLICT (budget_key) DO UPDATE SET
              hour_bucket = EXCLUDED.hour_bucket,
              day_bucket = EXCLUDED.day_bucket,
              task_bucket = EXCLUDED.task_bucket,
              hour_cost_usd = EXCLUDED.hour_cost_usd,
              day_cost_usd = EXCLUDED.day_cost_usd,
              cache_read_input_tokens = EXCLUDED.cache_read_input_tokens,
              cache_creation_input_tokens = EXCLUDED.cache_creation_input_tokens,
              hour_window_end = EXCLUDED.hour_window_end,
              day_window_end = EXCLUDED.day_window_end,
              updated_at = EXCLUDED.updated_at
          `,
          [
            TOKEN_BUDGET_KEY,
            this.hourBucket,
            this.dayBucket,
            this.taskBucket,
            this.hourCostUsd,
            this.dayCostUsd,
            this.cacheReadTokens,
            this.cacheCreationTokens,
            new Date(this.hourWindowEnd),
            new Date(this.dayWindowEnd),
            new Date(),
          ]
        );
      })
      .catch((error) => {
        console.error('[TOKEN_BUDGET] Failed to persist state:', error);
      });
  }
}

// Singleton — both hermesClient and AgentWorker import from here.
export const tokenBudget = new TokenBudget();
