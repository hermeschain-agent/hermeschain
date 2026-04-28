/**
 * Query latency histogram for /api/metrics (TASK-320).
 *
 * Cumulative-bucket Prometheus histogram. Bucket boundaries chosen to
 * cover human-noticeable PG latency: 1ms (in-memory cache hit) to 5s
 * (a query you'd want a slow-log entry for).
 */

const BUCKET_BOUNDS_MS = [1, 5, 10, 50, 100, 500, 1000, 5000] as const;

let counts = new Array(BUCKET_BOUNDS_MS.length).fill(0);
let sum = 0;
let count = 0;
let errors = 0;

export function recordQuery(durationMs: number): void {
  for (let i = 0; i < BUCKET_BOUNDS_MS.length; i++) {
    if (durationMs <= BUCKET_BOUNDS_MS[i]) {
      counts[i]++;
      break;
    }
  }
  sum += durationMs;
  count++;
}

export function recordQueryError(): void {
  errors++;
}

export interface HistogramSnapshot {
  buckets: readonly number[];
  counts: number[];
  cumulativeCounts: number[];
  sum: number;
  count: number;
  errors: number;
  meanMs: number;
}

export function getHistogram(): HistogramSnapshot {
  const cumulative: number[] = [];
  let running = 0;
  for (const c of counts) {
    running += c;
    cumulative.push(running);
  }
  return {
    buckets: BUCKET_BOUNDS_MS,
    counts: [...counts],
    cumulativeCounts: cumulative,
    sum,
    count,
    errors,
    meanMs: count === 0 ? 0 : sum / count,
  };
}

export function resetHistogram(): void {
  counts = new Array(BUCKET_BOUNDS_MS.length).fill(0);
  sum = 0;
  count = 0;
  errors = 0;
}
