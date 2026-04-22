/**
 * Base-fee adjustment model (EIP-1559 style).
 *
 * Phase-7 / fee-market / step-2. Deterministic per-block rule so
 * every validator computes the same baseFee from the same inputs.
 */

const ELASTICITY_MULTIPLIER = 2n;  // targetGas = maxGas / 2
const MAX_CHANGE_DENOMINATOR = 8n; // caps change at 1/8 (12.5%) per block

export interface BaseFeeInputs {
  readonly parentBaseFeePerGas: string;
  readonly parentGasUsed: string;
  readonly parentGasLimit: string;
}

export function computeNextBaseFee(inputs: BaseFeeInputs): string {
  const baseFee = BigInt(inputs.parentBaseFeePerGas);
  const gasUsed = BigInt(inputs.parentGasUsed);
  const gasLimit = BigInt(inputs.parentGasLimit);
  const gasTarget = gasLimit / ELASTICITY_MULTIPLIER;

  if (gasUsed === gasTarget) {
    return baseFee.toString();
  }

  if (gasUsed > gasTarget) {
    // Over-target: bump baseFee.
    const gasUsedDelta = gasUsed - gasTarget;
    const baseFeeDelta = max1(
      (baseFee * gasUsedDelta) / gasTarget / MAX_CHANGE_DENOMINATOR,
    );
    return (baseFee + baseFeeDelta).toString();
  }

  // Under-target: decrease baseFee, never below 0.
  const gasUsedDelta = gasTarget - gasUsed;
  const baseFeeDelta = (baseFee * gasUsedDelta) / gasTarget / MAX_CHANGE_DENOMINATOR;
  const next = baseFee - baseFeeDelta;
  return (next < 0n ? 0n : next).toString();
}

function max1(n: bigint): bigint {
  return n < 1n ? 1n : n;
}

/** Wallet-side suggestion: baseFee * 2 (covers one period of growth). */
export function suggestMaxFeePerGas(currentBaseFeePerGas: string, priorityFee: string): string {
  const base = BigInt(currentBaseFeePerGas);
  const tip = BigInt(priorityFee);
  return (base * 2n + tip).toString();
}
