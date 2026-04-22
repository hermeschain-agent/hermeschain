/**
 * SlashingEvidence record.
 *
 * Phase-6 / slashing / step-2. Captures the minimum information needed
 * to re-verify a claimed offense on-chain. The verifier (step-3) takes
 * this evidence, re-fetches the two block headers or the missed-slot
 * record, and confirms the offense before applying the penalty.
 */

export type SlashingKind = 'equivocation' | 'liveness';

export interface SlashingEvidence {
  readonly kind: SlashingKind;
  readonly validatorAddress: string;
  readonly blockHeight: number;
  readonly headerA?: string;
  readonly headerB?: string;
  readonly missedSlot?: number;
  readonly collectedAtHeight: number;
  readonly collectedAtMs: number;
}

const HEX32 = /^[0-9a-f]{64}$/;

export function makeSlashingEvidence(input: {
  kind: SlashingKind;
  validatorAddress: string;
  blockHeight: number;
  headerA?: string;
  headerB?: string;
  missedSlot?: number;
  collectedAtHeight: number;
  collectedAtMs: number;
}): SlashingEvidence {
  if (!input.validatorAddress) {
    throw new Error('slashing: validatorAddress required');
  }
  if (input.blockHeight < 0) {
    throw new Error('slashing: blockHeight must be non-negative');
  }
  if (input.collectedAtHeight < input.blockHeight) {
    throw new Error('slashing: collectedAtHeight cannot be before the offense');
  }
  if (input.kind === 'equivocation') {
    if (!input.headerA || !input.headerB) {
      throw new Error('slashing: equivocation requires both headerA and headerB');
    }
    if (input.headerA === input.headerB) {
      throw new Error('slashing: equivocation requires distinct headers');
    }
    if (!HEX32.test(input.headerA) || !HEX32.test(input.headerB)) {
      throw new Error('slashing: header hashes must be 32-byte lowercase hex');
    }
  } else if (input.kind === 'liveness') {
    if (typeof input.missedSlot !== 'number' || input.missedSlot < 0) {
      throw new Error('slashing: liveness requires non-negative missedSlot');
    }
  } else {
    throw new Error(`slashing: unknown kind "${(input as any).kind}"`);
  }

  return Object.freeze({
    kind: input.kind,
    validatorAddress: input.validatorAddress,
    blockHeight: input.blockHeight,
    ...(input.headerA ? { headerA: input.headerA } : {}),
    ...(input.headerB ? { headerB: input.headerB } : {}),
    ...(input.missedSlot !== undefined ? { missedSlot: input.missedSlot } : {}),
    collectedAtHeight: input.collectedAtHeight,
    collectedAtMs: input.collectedAtMs,
  });
}
