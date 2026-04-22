/**
 * Redis cache helper with stampede lock + version prefix.
 *
 * Phase-7 / caching / step-2. Minimum surface a caller needs: getOr
 * (read-through with compute-on-miss), invalidate, bypass.
 */

export interface CacheBackend {
  get(key: string): Promise<string | null>;
  set(key: string, value: string, ttlSec: number): Promise<void>;
  del(key: string): Promise<void>;
  /** SET NX EX; returns true if lock acquired. */
  tryLock(key: string, ttlMs: number): Promise<boolean>;
}

export interface CacheOpts {
  ttlSec: number;
  lockTtlMs?: number;
  bypass?: boolean;
}

const VERSION = 'v1';

function prefixed(key: string): string {
  return `${VERSION}:${key}`;
}

export class Cache {
  constructor(private readonly backend: CacheBackend) {}

  async getOr<T>(key: string, compute: () => Promise<T>, opts: CacheOpts): Promise<T> {
    const fullKey = prefixed(key);
    if (!opts.bypass) {
      const hit = await this.backend.get(fullKey);
      if (hit !== null) {
        return JSON.parse(hit) as T;
      }
    }

    // Miss — try to acquire the stampede lock so only one worker computes.
    const lockKey = `lock:${fullKey}`;
    const lockTtl = opts.lockTtlMs ?? 500;
    const acquired = await this.backend.tryLock(lockKey, lockTtl);

    if (!acquired) {
      // Someone else is computing — wait briefly and re-read.
      await sleep(Math.min(lockTtl, 250));
      const second = await this.backend.get(fullKey);
      if (second !== null) return JSON.parse(second) as T;
      // Still missing — fall through and compute ourselves.
    }

    const value = await compute();
    await this.backend.set(fullKey, JSON.stringify(value), opts.ttlSec);
    return value;
  }

  async invalidate(key: string): Promise<void> {
    await this.backend.del(prefixed(key));
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
