/**
 * Token-bucket rate limiter for per-IP API gating.
 *
 * Phase-7 / wallet-rpc / step-2. One bucket per (ip, route-class).
 * Refill continuously; `consume()` returns the ms to retry after if
 * the bucket can't cover the request.
 */

export interface RateLimiterConfig {
  readonly capacity: number;   // max tokens in bucket
  readonly refillPerSec: number;
}

interface Bucket {
  tokens: number;
  lastRefillMs: number;
}

export class TokenBucketLimiter {
  private readonly buckets = new Map<string, Bucket>();

  constructor(private readonly config: RateLimiterConfig) {
    if (config.capacity <= 0) throw new Error('rate: capacity > 0');
    if (config.refillPerSec <= 0) throw new Error('rate: refillPerSec > 0');
  }

  /**
   * Attempt to take 1 token.
   * Returns 0 if allowed; or the milliseconds to wait before retry.
   */
  consume(key: string, now = Date.now()): number {
    const bucket = this.getOrCreate(key, now);
    this.refill(bucket, now);
    if (bucket.tokens >= 1) {
      bucket.tokens -= 1;
      return 0;
    }
    const deficit = 1 - bucket.tokens;
    const secondsNeeded = deficit / this.config.refillPerSec;
    return Math.ceil(secondsNeeded * 1000);
  }

  snapshot(key: string, now = Date.now()): { tokens: number; capacity: number } {
    const bucket = this.getOrCreate(key, now);
    this.refill(bucket, now);
    return { tokens: bucket.tokens, capacity: this.config.capacity };
  }

  private getOrCreate(key: string, now: number): Bucket {
    let bucket = this.buckets.get(key);
    if (!bucket) {
      bucket = { tokens: this.config.capacity, lastRefillMs: now };
      this.buckets.set(key, bucket);
    }
    return bucket;
  }

  private refill(bucket: Bucket, now: number): void {
    const elapsedSec = (now - bucket.lastRefillMs) / 1000;
    if (elapsedSec <= 0) return;
    const add = elapsedSec * this.config.refillPerSec;
    bucket.tokens = Math.min(this.config.capacity, bucket.tokens + add);
    bucket.lastRefillMs = now;
  }

  /** Garbage-collect idle buckets (no activity for ttlMs). */
  gc(ttlMs = 10 * 60 * 1000, now = Date.now()): number {
    let dropped = 0;
    for (const [key, bucket] of this.buckets) {
      if (now - bucket.lastRefillMs > ttlMs && bucket.tokens >= this.config.capacity) {
        this.buckets.delete(key);
        dropped += 1;
      }
    }
    return dropped;
  }
}
