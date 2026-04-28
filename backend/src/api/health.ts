import { Router } from 'express';
import { db, cache } from '../database/db';
import type { Chain } from '../blockchain/Chain';

/**
 * Three-tier health checks (TASK-149).
 *
 *   /health/live   — process is up (no dependencies)
 *   /health/ready  — can serve traffic (DB pool capacity, Redis up, chain bootstrapped)
 *   /health/deep   — exercises full read paths with timing (slower)
 *
 * Shutdown handler (existing) flips a flag to make /live also return 503
 * during drain so load balancers stop routing immediately.
 */

let isShuttingDown = false;

export function markShuttingDown(): void {
  isShuttingDown = true;
}

export function createHealthRouter(chain: Chain): Router {
  const router = Router();

  router.get('/live', (_req, res) => {
    if (isShuttingDown) {
      return res.status(503).json({ status: 'draining' });
    }
    res.status(200).json({ status: 'live' });
  });

  router.get('/ready', async (_req, res) => {
    if (isShuttingDown) {
      return res.status(503).json({ ready: false, failures: [{ check: 'shutdown', reason: 'draining' }] });
    }
    const failures: Array<{ check: string; reason: string }> = [];
    const stats = db.poolStats();
    if (stats.max > 0 && stats.total >= stats.max && stats.idle === 0) {
      failures.push({ check: 'pg_pool', reason: 'no idle connections' });
    }
    if (process.env.REDIS_URL && !cache.isConnected()) {
      failures.push({ check: 'redis', reason: 'disconnected' });
    }
    if (chain.getChainLength() === 0) {
      failures.push({ check: 'chain', reason: 'genesis not loaded' });
    }
    if (failures.length > 0) {
      return res.status(503).json({ ready: false, failures });
    }
    res.json({ ready: true, checks: { pg: 'ok', redis: process.env.REDIS_URL ? 'ok' : 'skipped', chain: 'ok' } });
  });

  router.get('/deep', async (_req, res) => {
    const failures: Array<{ check: string; reason: string }> = [];
    const latency: Record<string, number> = {};

    let t = Date.now();
    try {
      await db.query(`SELECT 1`);
      latency.db = Date.now() - t;
    } catch (err: any) {
      failures.push({ check: 'db', reason: err?.message || 'query failed' });
    }

    if (process.env.REDIS_URL) {
      t = Date.now();
      try {
        await cache.get('health:deep:probe');
        latency.redis = Date.now() - t;
      } catch (err: any) {
        failures.push({ check: 'redis', reason: err?.message || 'get failed' });
      }
    }

    t = Date.now();
    try {
      chain.getLatestBlock();
      latency.chainHead = Date.now() - t;
    } catch (err: any) {
      failures.push({ check: 'chainHead', reason: err?.message || 'fetch failed' });
    }

    if (failures.length > 0) {
      return res.status(503).json({ ready: false, failures, latencyMs: latency });
    }
    res.json({ ready: true, latencyMs: latency });
  });

  return router;
}
