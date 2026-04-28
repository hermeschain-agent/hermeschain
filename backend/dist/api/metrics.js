"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createMetricsRouter = createMetricsRouter;
const express_1 = require("express");
const db_1 = require("../database/db");
const queryMetrics_1 = require("../database/queryMetrics");
const PeerRegistry_1 = require("../network/PeerRegistry");
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
function createMetricsRouter(chain, txPool) {
    const router = (0, express_1.Router)();
    router.get('/', (_req, res) => {
        const lines = [];
        function gauge(name, value, help) {
            lines.push(`# HELP ${name} ${help}`);
            lines.push(`# TYPE ${name} gauge`);
            lines.push(`${name} ${value}`);
        }
        function counter(name, value, help) {
            lines.push(`# HELP ${name} ${help}`);
            lines.push(`# TYPE ${name} counter`);
            lines.push(`${name} ${value}`);
        }
        // Chain
        gauge('hermes_chain_height', chain.getChainLength(), 'Synthetic chain height');
        gauge('hermes_mempool_size', txPool.getPendingCount(), 'Pending tx count');
        // PG pool
        const pool = db_1.db.poolStats();
        gauge('hermes_pg_pool_total', pool.total, 'Total PG connections');
        gauge('hermes_pg_pool_idle', pool.idle, 'Idle PG connections');
        gauge('hermes_pg_pool_waiting', pool.waiting, 'Clients waiting for a PG connection');
        gauge('hermes_pg_pool_max', pool.max, 'Max PG connections');
        // PG query histogram
        const h = (0, queryMetrics_1.getHistogram)();
        counter('hermes_pg_query_count', h.count, 'Total PG queries observed');
        counter('hermes_pg_query_errors_total', h.errors, 'Total PG query errors');
        lines.push('# HELP hermes_pg_query_duration_ms PG query latency in ms');
        lines.push('# TYPE hermes_pg_query_duration_ms histogram');
        for (let i = 0; i < h.buckets.length; i++) {
            lines.push(`hermes_pg_query_duration_ms_bucket{le="${h.buckets[i]}"} ${h.cumulativeCounts[i]}`);
        }
        lines.push(`hermes_pg_query_duration_ms_bucket{le="+Inf"} ${h.count}`);
        lines.push(`hermes_pg_query_duration_ms_sum ${h.sum}`);
        lines.push(`hermes_pg_query_duration_ms_count ${h.count}`);
        // Peers
        gauge('hermes_peers_active', PeerRegistry_1.peerRegistry.listPeers().length, 'Active peers (last_seen within 180s)');
        res.set('Content-Type', 'text/plain; version=0.0.4');
        res.send(lines.join('\n') + '\n');
    });
    return router;
}
//# sourceMappingURL=metrics.js.map