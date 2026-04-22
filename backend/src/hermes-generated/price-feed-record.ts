/**
 * Typed PriceUpdate + median aggregator.
 *
 * Phase-11 / oracles / step-2. The oracle subsystem verifies each
 * signature independently, then calls `medianPrice` to collapse
 * a signed set into the final on-chain value.
 */

export interface PriceUpdate {
  readonly feedId: string;
  readonly price: string;           // BigInt-safe decimal (scaled by 10^decimals)
  readonly decimals: number;
  readonly roundId: number;
  readonly timestampMs: number;
  readonly signerAddress: string;
  readonly signature: string;       // 64-byte lowercase hex
}

const FEED_ID_RE = /^[A-Z]{2,8}\/[A-Z]{2,8}$/;
const HEX64 = /^[0-9a-f]{128}$/;
const UINT = /^\d+$/;

export function makePriceUpdate(input: PriceUpdate): PriceUpdate {
  if (!FEED_ID_RE.test(input.feedId)) {
    throw new Error(`price: feedId must match BASE/QUOTE, got "${input.feedId}"`);
  }
  if (!UINT.test(input.price)) {
    throw new Error('price: price must be unsigned integer string');
  }
  if (!Number.isInteger(input.decimals) || input.decimals < 0 || input.decimals > 18) {
    throw new Error('price: decimals must be integer 0..18');
  }
  if (!Number.isInteger(input.roundId) || input.roundId < 0) {
    throw new Error('price: roundId must be non-negative integer');
  }
  if (!input.signerAddress) throw new Error('price: signerAddress required');
  if (!HEX64.test(input.signature)) {
    throw new Error('price: signature must be 64-byte lowercase hex');
  }
  return Object.freeze({ ...input });
}

/**
 * Take a set of verified signed updates for the same (feedId, roundId)
 * and return the median price. Discards outliers beyond ±10% from the
 * median.
 */
export function medianPrice(updates: readonly PriceUpdate[]): string {
  if (updates.length === 0) {
    throw new Error('price: no updates');
  }
  const values = updates.map((u) => BigInt(u.price)).sort((a, b) => {
    if (a < b) return -1;
    if (a > b) return 1;
    return 0;
  });
  const median = values[Math.floor(values.length / 2)];

  // Reject if min or max is outside ±10% of median.
  const tolerance = median / 10n;
  for (const v of values) {
    const diff = v > median ? v - median : median - v;
    if (diff > tolerance) {
      throw new Error('price: outlier exceeds ±10% tolerance — possible manipulation');
    }
  }

  return median.toString();
}
