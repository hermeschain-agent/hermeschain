/**
 * Canonical ChainIdentity record.
 *
 * Step-2 of foundation/chain-id. Binds chain ID into the signing and
 * block-hashing domains so a fork can't replay signatures or accept
 * blocks from the parent chain after divergence.
 *
 * `chainIdHash` is the first 32 hex chars of sha256(chainId); used in
 * byte-level contexts (block headers, on-wire) where a short fixed-
 * width identifier is preferred to a human-readable string.
 */

import { createHash } from 'crypto';

export interface ChainIdentity {
  readonly chainId: string;
  readonly chainIdHash: string;
  readonly protocolVersion: string;
  readonly signingDomain: string;
  readonly blockDomain: string;
}

const SIGNING_PREFIX = 'HERMES_TX_V1';
const BLOCK_PREFIX = 'HERMES_BLK_V1';

export function makeChainIdentity(input: {
  chainId: string;
  protocolVersion: string;
}): ChainIdentity {
  const trimmedChainId = input.chainId.trim();
  if (!trimmedChainId) {
    throw new Error('chain-identity: chainId is required');
  }
  if (!/^[\w-]+$/.test(trimmedChainId)) {
    throw new Error(
      `chain-identity: chainId must be word chars + hyphen only, got "${trimmedChainId}"`,
    );
  }
  if (!/^\d+\.\d+\.\d+$/.test(input.protocolVersion)) {
    throw new Error(
      `chain-identity: protocolVersion must be semver, got "${input.protocolVersion}"`,
    );
  }

  const chainIdHash = createHash('sha256')
    .update(trimmedChainId, 'utf8')
    .digest('hex')
    .slice(0, 32);

  return Object.freeze({
    chainId: trimmedChainId,
    chainIdHash,
    protocolVersion: input.protocolVersion,
    signingDomain: `${SIGNING_PREFIX}::${trimmedChainId}`,
    blockDomain: `${BLOCK_PREFIX}::${trimmedChainId}`,
  });
}

/**
 * Apply the signing-domain prefix to a payload before signing / verifying.
 * Returns the bytes that get hashed by the signature scheme.
 */
export function applySigningDomain(
  identity: ChainIdentity,
  payload: Buffer | Uint8Array,
): Buffer {
  const prefix = Buffer.from(identity.signingDomain, 'utf8');
  return Buffer.concat([prefix, Buffer.from([0x00]), Buffer.from(payload)]);
}

/**
 * Apply the block-hashing domain prefix to header bytes before hashing.
 */
export function applyBlockDomain(
  identity: ChainIdentity,
  headerBytes: Buffer | Uint8Array,
): Buffer {
  const prefix = Buffer.from(identity.blockDomain, 'utf8');
  return Buffer.concat([prefix, Buffer.from([0x00]), Buffer.from(headerBytes)]);
}
