/**
 * Typed UserOperation (account abstraction).
 *
 * Phase-9 / account-abstraction / step-2. The pseudo-transaction
 * format bundlers relay on behalf of smart accounts.
 */

export interface UserOperation {
  readonly sender: string;
  readonly nonce: number;
  readonly initCode: string;
  readonly callData: string;
  readonly callGasLimit: string;
  readonly verificationGasLimit: string;
  readonly preVerificationGas: string;
  readonly maxFeePerGas: string;
  readonly maxPriorityFeePerGas: string;
  readonly paymasterAndData: string;
  readonly signature: string;
}

const HEX = /^0x[0-9a-fA-F]*$/;
const UINT = /^\d+$/;

export function makeUserOperation(input: UserOperation): UserOperation {
  if (!input.sender) throw new Error('userop: sender required');
  if (!Number.isInteger(input.nonce) || input.nonce < 0) {
    throw new Error('userop: nonce must be non-negative integer');
  }
  if (!HEX.test(input.initCode)) throw new Error('userop: initCode must be 0x-hex');
  if (!HEX.test(input.callData)) throw new Error('userop: callData must be 0x-hex');
  for (const field of ['callGasLimit', 'verificationGasLimit', 'preVerificationGas', 'maxFeePerGas', 'maxPriorityFeePerGas'] as const) {
    if (!UINT.test(input[field])) {
      throw new Error(`userop: ${field} must be unsigned integer string`);
    }
  }
  if (!HEX.test(input.paymasterAndData)) {
    throw new Error('userop: paymasterAndData must be 0x-hex');
  }
  if (!HEX.test(input.signature)) throw new Error('userop: signature must be 0x-hex');
  return Object.freeze({ ...input });
}

/** Total gas this op can consume. */
export function totalGasLimit(op: UserOperation): bigint {
  return (
    BigInt(op.callGasLimit) +
    BigInt(op.verificationGasLimit) +
    BigInt(op.preVerificationGas)
  );
}

/** Max total fee the sender can be charged. */
export function maxFeeTotal(op: UserOperation): bigint {
  return totalGasLimit(op) * BigInt(op.maxFeePerGas);
}
