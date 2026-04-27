/**
 * Cache warmer (TASK-328).
 *
 * Cold boot leaves Redis empty; the first ~30s of traffic causes burst
 * PG reads as the cache populates. Pre-warm with the things chainState
 * is going to read anyway: latest 100 blocks, top 50 accounts by balance,
 * last block height. Runs once at boot when CACHE_WARMER_ENABLED=true.
 */
export declare function warmCache(): Promise<{
    entries: number;
    durationMs: number;
}>;
//# sourceMappingURL=cacheWarmer.d.ts.map