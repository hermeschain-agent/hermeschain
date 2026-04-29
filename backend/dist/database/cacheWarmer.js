"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.warmCache = warmCache;
const db_1 = require("./db");
/**
 * Cache warmer (TASK-328).
 *
 * Cold boot leaves Redis empty; the first ~30s of traffic causes burst
 * PG reads as the cache populates. Pre-warm with the things chainState
 * is going to read anyway: latest 100 blocks, top 50 accounts by balance,
 * last block height. Runs once at boot when CACHE_WARMER_ENABLED=true.
 */
async function warmCache() {
    const startedAt = Date.now();
    let entries = 0;
    try {
        // Latest 100 blocks → block:height:N cache.
        const blocksRes = await db_1.db.query(`SELECT * FROM blocks ORDER BY height DESC LIMIT 100`);
        for (const block of blocksRes.rows) {
            await db_1.cache.setJSON(`block:height:${block.height}`, block, 300);
            entries++;
        }
        // Top 50 accounts by balance.
        const topRes = await db_1.db.query(`SELECT address, balance, nonce FROM accounts
        ORDER BY balance::numeric DESC LIMIT 50`);
        await db_1.cache.setJSON('top_accounts:50', topRes.rows, 60);
        entries++;
        // Last block height (already maintained by chainState but make sure it's there).
        const headRes = await db_1.db.query(`SELECT MAX(height) AS max_height FROM blocks`);
        const head = Number(headRes.rows[0]?.max_height ?? 0);
        if (head > 0) {
            await db_1.chainState.saveBlockHeight(head);
            entries++;
        }
    }
    catch (err) {
        console.warn(`[CACHE WARMER] partial failure: ${err?.message || err}`);
    }
    const durationMs = Date.now() - startedAt;
    console.log(`[CACHE WARMER] ${entries} entries warmed in ${durationMs}ms`);
    return { entries, durationMs };
}
//# sourceMappingURL=cacheWarmer.js.map