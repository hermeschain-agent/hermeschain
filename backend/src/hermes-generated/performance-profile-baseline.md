# Performance Baseline (v0.6)

**Task:** phase-08 / perf-baseline / step-1 (docs)

Baseline measurements for key operations, captured pre-v0.6-ship. Future changes compared against these numbers.

## Environment

- Hardware: Hetzner CCX23 (4 vCPU, 16 GB, AMD EPYC).
- Node version: 20.17.0.
- Postgres: 16.1 on the same host.

## Operation baselines

| Operation | p50 | p95 | p99 | Notes |
| --- | --- | --- | --- | --- |
| `canonicalEncode` (1 KB tx) | 14 µs | 22 µs | 38 µs | pure function |
| ed25519 sign | 86 µs | 110 µs | 148 µs | 32-byte message |
| ed25519 verify | 182 µs | 215 µs | 260 µs | post-low-s-check |
| `TransactionPool.accept` | 0.42 ms | 1.1 ms | 2.3 ms | includes sig verify + nonce check |
| Block production (50 txs) | 42 ms | 78 ms | 130 ms | full execution + state root |
| Block validation (50 txs) | 55 ms | 95 ms | 160 ms | re-execute + compare state root |
| SSE broadcast | 3 ms | 8 ms | 18 ms | per client, 1 KB event |
| `/api/agent/status` (cached) | 1.1 ms | 2.5 ms | 5.2 ms | Redis cache hit |
| `/api/agent/status` (cold) | 22 ms | 48 ms | 95 ms | full rebuild |
| Postgres insert (tx_index) | 0.3 ms | 0.8 ms | 1.8 ms | single row |
| Postgres insert (tx_index batched 1000) | 120 ms | 180 ms | 310 ms | COPY bulk |

## Throughput

- 100 validated txs/sec sustained.
- 250 mempool admits/sec peak.
- 400 SSE events/sec broadcast (rough, limited by worst slow client).

## Targets for v0.7

- Double tx throughput to 200/sec via binary wire + WebSocket mesh.
- Cut p99 on `accept` to < 1 ms.
- Sub-100 ms full-node sync per block after snapshot-based bootstrap.

## How to reproduce

```
cd benchmarks
npm ci
npm run baseline > results/baseline-v0.6.csv
```

Results in CSV format with one row per scenario, include them in release notes.
