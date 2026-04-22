/**
 * P2P message codec.
 *
 * Phase-6 / p2p-transport / step-2. Encode + decode wire messages
 * with length prefix so the receiver can frame them out of a byte
 * stream without ambiguity. Length prefix = 4 bytes big-endian
 * unsigned int. Payload = canonical-encoded message.
 */

import { canonicalEncode } from './canonical-encode';

const MAX_MESSAGE_BYTES = 2 * 1024 * 1024; // 2 MB hard cap

export function encodeFrame(message: unknown): Buffer {
  const payload = canonicalEncode(message);
  if (payload.length > MAX_MESSAGE_BYTES) {
    throw new Error(`p2p: message too large (${payload.length} bytes)`);
  }
  const header = Buffer.alloc(4);
  header.writeUInt32BE(payload.length, 0);
  return Buffer.concat([header, payload]);
}

export interface FrameReader {
  /** Feed in bytes; returns any complete frames decoded. */
  push(chunk: Buffer): unknown[];
}

/**
 * Streaming reader for length-prefixed frames. Handles TCP-level
 * chunking where one application-level message may arrive across
 * multiple `push()` calls, or multiple messages in one call.
 */
export function makeFrameReader(): FrameReader {
  let buffer = Buffer.alloc(0);

  return {
    push(chunk: Buffer): unknown[] {
      buffer = Buffer.concat([buffer, chunk]);
      const messages: unknown[] = [];

      while (buffer.length >= 4) {
        const len = buffer.readUInt32BE(0);
        if (len > MAX_MESSAGE_BYTES) {
          throw new Error(`p2p: frame length ${len} exceeds cap`);
        }
        if (buffer.length < 4 + len) break; // incomplete; wait for more bytes

        const payload = buffer.subarray(4, 4 + len);
        try {
          messages.push(JSON.parse(payload.toString('utf8')));
        } catch (err) {
          throw new Error(`p2p: frame payload is not JSON: ${(err as Error).message}`);
        }

        buffer = buffer.subarray(4 + len);
      }

      return messages;
    },
  };
}
