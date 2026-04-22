/**
 * Typed Validator record + stake-weighted proposer selection.
 *
 * Phase-6 / consensus-validators / step-2. Selection is deterministic
 * given the previous block hash, so all honest nodes agree without
 * network round-trips.
 */

import { createHash } from 'crypto';

export interface Validator {
  readonly address: string;
  readonly publicKey: string;
  readonly stake: string;          // BigInt-safe unsigned integer
  readonly joined: number;         // block height
  readonly online: boolean;
  readonly lastSeenMs: number | null;
}

const HEX32 = /^[0-9a-f]{64}$/;
const UINT = /^\d+$/;

export function makeValidator(input: Validator): Validator {
  if (!input.address) throw new Error('validator: address required');
  if (!HEX32.test(input.publicKey)) {
    throw new Error('validator: publicKey must be 32-byte lowercase hex');
  }
  if (!UINT.test(input.stake) || input.stake === '0') {
    throw new Error('validator: stake must be positive unsigned integer string');
  }
  if (!Number.isInteger(input.joined) || input.joined < 0) {
    throw new Error('validator: joined must be non-negative integer');
  }
  return Object.freeze({ ...input });
}

/**
 * Stake-weighted pseudo-random proposer selection. Uses `blockHash` as
 * entropy, scales onto cumulative stake, and picks the validator whose
 * stake window contains the draw.
 *
 * Returns null if the set is empty or no validator is online.
 */
export function selectProposer(
  set: readonly Validator[],
  blockHash: string,
): Validator | null {
  const active = set.filter((v) => v.online);
  if (active.length === 0) return null;

  const total = active.reduce((sum, v) => sum + BigInt(v.stake), 0n);
  if (total === 0n) return null;

  // 32 bytes of entropy from blockHash → BigInt → modulo total
  const digest = createHash('sha256').update(blockHash, 'utf8').digest('hex');
  const draw = BigInt(`0x${digest}`) % total;

  let cumulative = 0n;
  for (const v of active) {
    cumulative += BigInt(v.stake);
    if (draw < cumulative) return v;
  }
  // unreachable if stake arithmetic is correct
  return active[active.length - 1];
}
