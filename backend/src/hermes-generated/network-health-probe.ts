/**
 * Network health probe.
 *
 * Phase-6 / network-health / step-2. One call that rolls up the status
 * of every peer in the registry into a single summary: how many are
 * reachable, what head height they report, how far apart they
 * disagree. Fed into OperatorHealth + the landing-page status chip.
 */

export interface PeerProbeResult {
  readonly url: string;
  readonly reachable: boolean;
  readonly reportedHeight: number | null;
  readonly latencyMs: number | null;
  readonly errorReason: string | null;
}

export interface NetworkHealthSnapshot {
  readonly peerCount: number;
  readonly reachableCount: number;
  readonly headHeightsByCount: ReadonlyMap<number, number>;
  readonly maxHeadDivergence: number;
  readonly medianLatencyMs: number | null;
  readonly probedAtMs: number;
}

export function rollupHealth(results: readonly PeerProbeResult[], probedAtMs: number = Date.now()): NetworkHealthSnapshot {
  const peerCount = results.length;
  const reachable = results.filter((r) => r.reachable);
  const reachableCount = reachable.length;

  // Count how many peers reported each head height.
  const byHeight = new Map<number, number>();
  for (const r of reachable) {
    if (r.reportedHeight !== null) {
      byHeight.set(r.reportedHeight, (byHeight.get(r.reportedHeight) ?? 0) + 1);
    }
  }

  // Divergence = max height - min height, zero if fewer than 2 peers reported.
  const heights = [...byHeight.keys()];
  const maxHeadDivergence = heights.length >= 2
    ? Math.max(...heights) - Math.min(...heights)
    : 0;

  // Median latency (ignore unreachable).
  const latencies = reachable
    .map((r) => r.latencyMs)
    .filter((ms): ms is number => ms !== null)
    .sort((a, b) => a - b);
  const medianLatencyMs = latencies.length > 0
    ? latencies[Math.floor(latencies.length / 2)]
    : null;

  return Object.freeze({
    peerCount,
    reachableCount,
    headHeightsByCount: byHeight,
    maxHeadDivergence,
    medianLatencyMs,
    probedAtMs,
  });
}

/** Simple health status for the operator pill. */
export function summarizeHealth(snapshot: NetworkHealthSnapshot): 'green' | 'amber' | 'red' {
  if (snapshot.reachableCount === 0) return 'red';
  if (snapshot.maxHeadDivergence > 3) return 'amber';
  if (snapshot.reachableCount < Math.ceil(snapshot.peerCount / 2)) return 'amber';
  return 'green';
}
