import { Router } from 'express';
import type { Chain } from '../blockchain/Chain';
import type { TransactionPool } from '../blockchain/TransactionPool';
/**
 * Prometheus exposition (TASK-152). Plain-text format consumed by
 * Prometheus, Datadog (with the prom integration), Grafana cloud, etc.
 *
 * GET /api/metrics  →  text/plain; version=0.0.4
 *
 * Metrics:
 *   hermes_chain_height
 *   hermes_mempool_size
 *   hermes_pg_pool_{total,idle,waiting,max}
 *   hermes_pg_query_count
 *   hermes_pg_query_errors_total
 *   hermes_pg_query_duration_ms_bucket{le=...}
 *   hermes_pg_query_duration_ms_sum
 *   hermes_pg_query_duration_ms_count
 *   hermes_peers_active
 */
export declare function createMetricsRouter(chain: Chain, txPool: TransactionPool): Router;
//# sourceMappingURL=metrics.d.ts.map