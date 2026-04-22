/**
 * ABI selector decoder.
 *
 * Phase-9 / contract-abi / step-2. Given a function-call hex blob and
 * the ABI for the target address, returns {functionName, args}. Just
 * the dispatch path; argument decoding for each type is a follow-up
 * (uint256, address, bytes32 each need their own decoder).
 */

export interface AbiFunction {
  readonly type: 'function';
  readonly name: string;
  readonly inputs: ReadonlyArray<{ name: string; type: string }>;
  readonly selector: string;  // 4-byte hex with 0x prefix
}

export interface AbiEvent {
  readonly type: 'event';
  readonly name: string;
  readonly inputs: ReadonlyArray<{ name: string; type: string; indexed: boolean }>;
  readonly topic0: string;
}

export type AbiEntry = AbiFunction | AbiEvent;

export interface DecodedCall {
  readonly functionName: string;
  readonly args: ReadonlyArray<{ name: string; type: string; rawHex: string }>;
}

export function selectorOf(callData: string): string {
  if (!callData.startsWith('0x')) {
    throw new Error('decoder: callData must be 0x-prefixed');
  }
  if (callData.length < 10) {
    throw new Error(`decoder: callData too short (${callData.length} chars)`);
  }
  return callData.slice(0, 10).toLowerCase();
}

export function findFunction(
  abi: readonly AbiEntry[],
  selector: string,
): AbiFunction | null {
  for (const entry of abi) {
    if (entry.type === 'function' && entry.selector.toLowerCase() === selector.toLowerCase()) {
      return entry;
    }
  }
  return null;
}

export function findEvent(
  abi: readonly AbiEntry[],
  topic0: string,
): AbiEvent | null {
  for (const entry of abi) {
    if (entry.type === 'event' && entry.topic0.toLowerCase() === topic0.toLowerCase()) {
      return entry;
    }
  }
  return null;
}

/**
 * Slice raw arguments into per-input chunks (32 bytes each, the EVM
 * convention). Doesn't decode the type — returns raw hex per input
 * so callers can apply the appropriate decoder.
 */
export function sliceArgs(
  callData: string,
  fn: AbiFunction,
): DecodedCall {
  const argBytes = callData.slice(10); // past selector
  const args = fn.inputs.map((input, i) => ({
    name: input.name,
    type: input.type,
    rawHex: '0x' + argBytes.slice(i * 64, (i + 1) * 64),
  }));
  return Object.freeze({
    functionName: fn.name,
    args: Object.freeze(args),
  });
}
