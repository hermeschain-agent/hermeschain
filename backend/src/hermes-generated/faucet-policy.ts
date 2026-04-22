/**
 * Faucet policy.
 *
 * Phase-7 / faucet / step-2. Per-address window + per-IP window, both
 * must pass. Drop amount is fixed via env.
 */

export interface FaucetPolicy {
  readonly dropAmount: string;         // BigInt-safe
  readonly windowMs: number;
  readonly dropsPerAddressWindow: number;
  readonly dropsPerIpWindow: number;
  readonly maxBalanceEligible: string; // if recipient already has this much, reject
}

const UINT = /^\d+$/;

export function makeFaucetPolicy(input: Partial<FaucetPolicy> = {}): FaucetPolicy {
  const dropAmount = input.dropAmount ?? '1000000000000000000'; // 1 token
  const windowMs = input.windowMs ?? 24 * 60 * 60 * 1000;
  const dropsPerAddressWindow = input.dropsPerAddressWindow ?? 1;
  const dropsPerIpWindow = input.dropsPerIpWindow ?? 3;
  const maxBalanceEligible = input.maxBalanceEligible ?? '10000000000000000000';

  if (!UINT.test(dropAmount) || dropAmount === '0') {
    throw new Error('faucet: dropAmount must be positive unsigned integer string');
  }
  if (windowMs < 60_000) throw new Error('faucet: windowMs must be >= 60_000');
  if (dropsPerAddressWindow < 1) throw new Error('faucet: dropsPerAddressWindow >= 1');
  if (dropsPerIpWindow < 1) throw new Error('faucet: dropsPerIpWindow >= 1');
  if (!UINT.test(maxBalanceEligible)) {
    throw new Error('faucet: maxBalanceEligible must be unsigned integer string');
  }

  return Object.freeze({
    dropAmount,
    windowMs,
    dropsPerAddressWindow,
    dropsPerIpWindow,
    maxBalanceEligible,
  });
}

export interface FaucetHistory {
  /** Last N drop timestamps for a key (address or IP), newest first. */
  readonly recent: readonly number[];
}

export function canClaim(
  history: FaucetHistory,
  policy: FaucetPolicy,
  windowKind: 'address' | 'ip',
  now = Date.now(),
): boolean {
  const cap = windowKind === 'address'
    ? policy.dropsPerAddressWindow
    : policy.dropsPerIpWindow;
  const windowStart = now - policy.windowMs;
  const inWindow = history.recent.filter((t) => t >= windowStart).length;
  return inWindow < cap;
}
