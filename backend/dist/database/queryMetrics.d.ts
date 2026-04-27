/**
 * Query latency histogram for /api/metrics (TASK-320).
 *
 * Cumulative-bucket Prometheus histogram. Bucket boundaries chosen to
 * cover human-noticeable PG latency: 1ms (in-memory cache hit) to 5s
 * (a query you'd want a slow-log entry for).
 */
export declare function recordQuery(durationMs: number): void;
export declare function recordQueryError(): void;
export interface HistogramSnapshot {
    buckets: readonly number[];
    counts: number[];
    cumulativeCounts: number[];
    sum: number;
    count: number;
    errors: number;
    meanMs: number;
}
export declare function getHistogram(): HistogramSnapshot;
export declare function resetHistogram(): void;
//# sourceMappingURL=queryMetrics.d.ts.map