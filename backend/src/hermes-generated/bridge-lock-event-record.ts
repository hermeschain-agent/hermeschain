/**
 * BridgeLockEvent — the event emitted on chain A when assets are
 * locked for cross-chain mint on chain B.
 *
 * Phase-11 / bridges / step-2. Relayers observe this shape, collect
 * M-of-N signatures, and submit a matching mint request on the
 * destination chain.
 */

export interface BridgeLockEvent {
  readonly sourceChainId: string;
  readonly destinationChainId: string;
  readonly nonce: number;           // monotonic, unique per (source, sender)
  readonly sender: string;
  readonly recipient: string;        // address on destination chain
  readonly asset: string;            // symbol or contract address on source
  readonly amount: string;           // BigInt-safe
  readonly lockHeight: number;       // block height of the lock tx
  readonly lockTxHash: string;
}

export interface BridgeMintRequest extends BridgeLockEvent {
  readonly relayerSignatures: ReadonlyArray<{
    readonly relayerAddress: string;
    readonly signature: string;
  }>;
}

const UINT = /^\d+$/;
const HEX32 = /^[0-9a-f]{64}$/;

export function makeLockEvent(input: BridgeLockEvent): BridgeLockEvent {
  if (!input.sourceChainId || !input.destinationChainId) {
    throw new Error('bridge: both chain IDs required');
  }
  if (input.sourceChainId === input.destinationChainId) {
    throw new Error('bridge: source and destination must differ');
  }
  if (!Number.isInteger(input.nonce) || input.nonce < 0) {
    throw new Error('bridge: nonce must be non-negative integer');
  }
  if (!input.sender || !input.recipient) {
    throw new Error('bridge: sender and recipient required');
  }
  if (!input.asset) throw new Error('bridge: asset required');
  if (!UINT.test(input.amount) || input.amount === '0') {
    throw new Error('bridge: amount must be positive unsigned integer');
  }
  if (!Number.isInteger(input.lockHeight) || input.lockHeight < 0) {
    throw new Error('bridge: lockHeight must be non-negative integer');
  }
  if (!HEX32.test(input.lockTxHash)) {
    throw new Error('bridge: lockTxHash must be 32-byte lowercase hex');
  }
  return Object.freeze({ ...input });
}

/**
 * Count of unique, in-set relayer signatures that have signed a mint
 * request. Duplicates and out-of-set signatures ignored (caller
 * should have verified signatures before calling).
 */
export function countUniqueRelayers(
  request: BridgeMintRequest,
  activeRelayers: ReadonlySet<string>,
): number {
  const seen = new Set<string>();
  for (const sig of request.relayerSignatures) {
    if (!activeRelayers.has(sig.relayerAddress)) continue;
    seen.add(sig.relayerAddress);
  }
  return seen.size;
}
