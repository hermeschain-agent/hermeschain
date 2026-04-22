/**
 * WebSocket auth handshake for the P2P validator mesh.
 *
 * Phase-6 / p2p-transport / step-3. Inbound WebSocket connections
 * prove the caller is a validator in the active set by signing the
 * target URL with their ed25519 key. The server verifies against
 * the known validator set before upgrading.
 */

import { createHash } from 'crypto';

export interface HandshakeHeaders {
  readonly validatorAddress: string;
  readonly signature: string;  // hex-encoded ed25519 signature
  readonly timestamp: number;  // ms since epoch — rejected if > 60s old
}

export interface ValidatorSetLookup {
  lookup(address: string): { publicKey: string } | null;
}

export interface Verifier {
  verify(publicKey: string, signature: string, message: Buffer): boolean;
}

export interface HandshakeResult {
  ok: boolean;
  reason?: string;
  address?: string;
}

const MAX_TIMESTAMP_SKEW_MS = 60_000;

export function buildHandshakeMessage(url: string, timestamp: number): Buffer {
  return Buffer.from(`hermes-p2p-v1\n${url}\n${timestamp}`, 'utf8');
}

export function verifyHandshake(
  url: string,
  headers: HandshakeHeaders,
  set: ValidatorSetLookup,
  verifier: Verifier,
  now: number = Date.now(),
): HandshakeResult {
  if (!headers.validatorAddress || !headers.signature) {
    return { ok: false, reason: 'missing auth headers' };
  }
  if (Math.abs(now - headers.timestamp) > MAX_TIMESTAMP_SKEW_MS) {
    return { ok: false, reason: 'stale timestamp' };
  }

  const validator = set.lookup(headers.validatorAddress);
  if (!validator) {
    return { ok: false, reason: 'unknown validator' };
  }

  const msg = buildHandshakeMessage(url, headers.timestamp);
  if (!verifier.verify(validator.publicKey, headers.signature, msg)) {
    return { ok: false, reason: 'signature mismatch' };
  }

  return { ok: true, address: headers.validatorAddress };
}
