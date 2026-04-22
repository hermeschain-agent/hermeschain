/**
 * Canonical TxSignature shape with low-s canonicalization.
 *
 * Phase-2 / tx-signatures / step-2. Adds `scheme` for future algorithm
 * upgrades (Schnorr, BLS), explicit publicKey on the tx so the pool
 * doesn't resolve from state on every verify, and rejects the
 * malleable high-s form of an ed25519 signature.
 */

export type SignatureScheme = 'ed25519';

export interface TxSignature {
  readonly scheme: SignatureScheme;
  readonly publicKey: string; // 32-byte hex, lowercase, no prefix
  readonly signature: string; // 64-byte hex, lowercase, low-s canonical
}

// ed25519 group order L, used for the low-s canonicalization check.
// The upper half is reserved; signatures whose s-component is in
// [L/2, L) must be rejected to prevent malleability.
const L_HEX = '1000000000000000000000000000000014def9dea2f79cd65812631a5cf5d3ed';
const L = BigInt(`0x${L_HEX}`);

function hex64(value: string, label: string): void {
  if (typeof value !== 'string') throw new Error(`${label}: must be a string`);
  if (value.length !== 128) {
    throw new Error(`${label}: must be 64 bytes (128 hex chars), got ${value.length}`);
  }
  if (!/^[0-9a-f]+$/.test(value)) {
    throw new Error(`${label}: must be lowercase hex`);
  }
}

function hex32(value: string, label: string): void {
  if (typeof value !== 'string') throw new Error(`${label}: must be a string`);
  if (value.length !== 64) {
    throw new Error(`${label}: must be 32 bytes (64 hex chars), got ${value.length}`);
  }
  if (!/^[0-9a-f]+$/.test(value)) {
    throw new Error(`${label}: must be lowercase hex`);
  }
}

/** Extract the s-component from a 64-byte ed25519 signature (hex). */
function extractS(sigHex: string): bigint {
  const sPart = sigHex.slice(64); // second 32 bytes (little-endian)
  // Reverse byte order to big-endian for BigInt.
  const beBytes = (sPart.match(/../g) ?? []).reverse().join('');
  return BigInt(`0x${beBytes}`);
}

export function makeTxSignature(input: {
  scheme: SignatureScheme;
  publicKey: string;
  signature: string;
}): TxSignature {
  if (input.scheme !== 'ed25519') {
    throw new Error(`sig: unsupported scheme "${input.scheme}"`);
  }
  hex32(input.publicKey, 'sig.publicKey');
  hex64(input.signature, 'sig.signature');

  // Low-s canonicalization: reject malleable high-s form.
  const s = extractS(input.signature);
  if (s >= L / 2n) {
    throw new Error(
      'sig: signature is high-s (malleable) — canonicalize to low-s before signing',
    );
  }

  return Object.freeze({
    scheme: input.scheme,
    publicKey: input.publicKey.toLowerCase(),
    signature: input.signature.toLowerCase(),
  });
}
