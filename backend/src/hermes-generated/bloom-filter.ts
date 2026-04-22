/**
 * Block-header Bloom filter for log topics.
 *
 * Phase-7 / log-indexer / step-2. 2048-bit Bloom over every log's
 * address and each topic. Enables O(1) filter-miss decision for a
 * given query before touching the database.
 */

import { createHash } from 'crypto';

const BITS = 2048;
const HASH_COUNT = 3;

export class BloomFilter {
  private readonly bits: Uint8Array;

  constructor(seed?: Uint8Array) {
    this.bits = seed ? new Uint8Array(seed) : new Uint8Array(BITS / 8);
    if (this.bits.length !== BITS / 8) {
      throw new Error(`bloom: expected ${BITS / 8} bytes, got ${this.bits.length}`);
    }
  }

  add(value: string): void {
    for (const index of this.indices(value)) {
      const byte = index >> 3;
      const bit = index & 7;
      this.bits[byte] |= 1 << bit;
    }
  }

  mightContain(value: string): boolean {
    for (const index of this.indices(value)) {
      const byte = index >> 3;
      const bit = index & 7;
      if ((this.bits[byte] & (1 << bit)) === 0) return false;
    }
    return true;
  }

  /** OR this filter into another. Used to combine per-tx filters into per-block. */
  union(other: BloomFilter): void {
    for (let i = 0; i < this.bits.length; i += 1) {
      this.bits[i] |= other.bits[i];
    }
  }

  toHex(): string {
    return Buffer.from(this.bits).toString('hex');
  }

  static fromHex(hex: string): BloomFilter {
    const buf = Buffer.from(hex, 'hex');
    return new BloomFilter(new Uint8Array(buf));
  }

  private *indices(value: string): Generator<number> {
    const digest = createHash('sha256').update(value).digest();
    for (let i = 0; i < HASH_COUNT; i += 1) {
      // Take 11-bit windows (0 .. 2047).
      const offset = i * 2;
      const raw = (digest[offset] << 8) | digest[offset + 1];
      yield raw & (BITS - 1);
    }
  }
}
