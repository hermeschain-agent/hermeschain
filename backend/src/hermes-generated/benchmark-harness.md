# Benchmark Harness

**Task:** phase-09 / benchmarks / step-1 (design)
**Scope:** `benchmarks/` (new directory, future)

## Scenarios to measure

| Scenario | Metric | Target |
| --- | --- | --- |
| Signature verify | ops/sec | ≥ 5,000 |
| canonicalEncode (100-field tx) | ops/sec | ≥ 50,000 |
| Tx admit (pool.accept) | ops/sec | ≥ 1,000 |
| Block production (50 txs) | ms/block | ≤ 100 |
| Block validation (50 txs) | ms/block | ≤ 150 |
| MPT put (random key, 10k state) | ops/sec | ≥ 10,000 |
| MPT prove (random key) | ops/sec | ≥ 5,000 |
| Full sync from snapshot (10k blocks delta) | wall time | ≤ 60s |

## Structure

```
benchmarks/
  bench.ts               # shared harness: runs N iterations, stats
  signatures.bench.ts
  encoding.bench.ts
  mempool.bench.ts
  block.bench.ts
  mpt.bench.ts
  sync.bench.ts
```

Each file exports a `scenarios: Scenario[]`:
```ts
interface Scenario {
  name: string;
  setup(): Promise<Ctx>;
  run(ctx: Ctx): Promise<void>;
  iterations: number;
}
```

Harness prints per-scenario: mean / median / p95 / p99 / ops-per-sec. Writes one row per scenario to `benchmarks/results/<date>.csv`.

## CI integration

Run benchmarks on every PR via `.github/workflows/bench.yml`. Compare results against `main` baseline. Fail the CI if any metric regresses > 20%.

## Observability

Benchmark runs emit Prometheus metrics (reusing the observability work from Phase-8), scraped at localhost:9091 during the run. Useful when hunting a regression interactively.

## Non-goals

- No cross-platform comparison — we publish a single "reference hardware" number.
- No end-to-end full-node throughput test beyond block production + sync; per-component benchmarks compose into the full picture.
