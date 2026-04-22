/**
 * HD wallet derivation (BIP-32 path walk).
 *
 * Phase-9 / wallet-derivation / step-2. Given a seed + derivation
 * path, returns the child keypair. Uses HMAC-SHA512 per the standard
 * so derived keys are compatible with any BIP-32 implementation.
 */

import { createHmac } from 'crypto';

export interface KeyPair {
  readonly privateKey: Buffer;  // 32 bytes
  readonly chainCode: Buffer;   // 32 bytes
}

const HARDENED_OFFSET = 0x80000000;

export function masterKey(seed: Buffer): KeyPair {
  if (seed.length < 16 || seed.length > 64) {
    throw new Error(`hd: seed must be 16-64 bytes, got ${seed.length}`);
  }
  const I = createHmac('sha512', 'ed25519 seed').update(seed).digest();
  return Object.freeze({
    privateKey: I.subarray(0, 32),
    chainCode: I.subarray(32),
  });
}

/** Parse a derivation path like `m/44'/501'/0'/0/5`. */
export function parsePath(path: string): number[] {
  if (!path.startsWith('m/')) {
    throw new Error(`hd: path must start with 'm/', got "${path}"`);
  }
  const segments = path.slice(2).split('/');
  return segments.map((seg) => {
    const hardened = seg.endsWith("'");
    const raw = hardened ? seg.slice(0, -1) : seg;
    const n = Number.parseInt(raw, 10);
    if (!Number.isInteger(n) || n < 0) {
      throw new Error(`hd: invalid segment "${seg}"`);
    }
    return hardened ? n + HARDENED_OFFSET : n;
  });
}

/**
 * Derive a child key from a parent. `index` is the 32-bit index, with
 * the hardened bit set by the caller (via parsePath).
 *
 * ed25519 convention: all steps are hardened. If `index` isn't,
 * throws — non-hardened derivation doesn't work for ed25519 without
 * leaking the master.
 */
export function deriveChild(parent: KeyPair, index: number): KeyPair {
  if (index < HARDENED_OFFSET) {
    throw new Error(`hd: ed25519 requires hardened derivation, got index ${index}`);
  }
  const indexBuf = Buffer.alloc(4);
  indexBuf.writeUInt32BE(index, 0);
  const data = Buffer.concat([Buffer.from([0x00]), parent.privateKey, indexBuf]);
  const I = createHmac('sha512', parent.chainCode).update(data).digest();
  return Object.freeze({
    privateKey: I.subarray(0, 32),
    chainCode: I.subarray(32),
  });
}

export function deriveFromPath(seed: Buffer, path: string): KeyPair {
  let current = masterKey(seed);
  for (const index of parsePath(path)) {
    current = deriveChild(current, index);
  }
  return current;
}
