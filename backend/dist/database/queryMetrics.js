"use strict";
/**
 * Query latency histogram for /api/metrics (TASK-320).
 *
 * Cumulative-bucket Prometheus histogram. Bucket boundaries chosen to
 * cover human-noticeable PG latency: 1ms (in-memory cache hit) to 5s
 * (a query you'd want a slow-log entry for).
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.recordQuery = recordQuery;
exports.recordQueryError = recordQueryError;
exports.getHistogram = getHistogram;
exports.resetHistogram = resetHistogram;
const BUCKET_BOUNDS_MS = [1, 5, 10, 50, 100, 500, 1000, 5000];
let counts = new Array(BUCKET_BOUNDS_MS.length).fill(0);
let sum = 0;
let count = 0;
let errors = 0;
function recordQuery(durationMs) {
    for (let i = 0; i < BUCKET_BOUNDS_MS.length; i++) {
        if (durationMs <= BUCKET_BOUNDS_MS[i]) {
            counts[i]++;
            break;
        }
    }
    sum += durationMs;
    count++;
}
function recordQueryError() {
    errors++;
}
function getHistogram() {
    const cumulative = [];
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
function resetHistogram() {
    counts = new Array(BUCKET_BOUNDS_MS.length).fill(0);
    sum = 0;
    count = 0;
    errors = 0;
}
//# sourceMappingURL=queryMetrics.js.map