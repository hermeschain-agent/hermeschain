/**
 * Canonical encoder.
 *
 * Step-2 of foundation/serialization. One function used by signing,
 * hashing, and on-wire gossip so all three see the same bytes for the
 * same object.
 *
 * Rules:
 * - Object keys sorted alphabetically at every level (recursive).
 * - Arrays preserve order.
 * - Strings, numbers, booleans, null encode as JSON.
 * - BigInt encoded as its decimal string (prefixed `"bigint:"` sentinel).
 * - Buffers / Uint8Array encoded as lowercase hex (prefixed `"hex:"`).
 * - Functions, symbols, `undefined` → throw.
 */

type Canonical =
  | string
  | number
  | boolean
  | null
  | readonly Canonical[]
  | { readonly [k: string]: Canonical };

function walk(value: unknown): Canonical {
  if (value === null) return null;
  if (typeof value === 'string') return value;
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) {
      throw new Error(`canonicalEncode: non-finite number ${value}`);
    }
    return value;
  }
  if (typeof value === 'boolean') return value;
  if (typeof value === 'bigint') return `bigint:${value.toString(10)}`;
  if (value instanceof Uint8Array) {
    return `hex:${Buffer.from(value).toString('hex')}`;
  }
  if (Array.isArray(value)) return value.map(walk);
  if (typeof value === 'object') {
    const keys = Object.keys(value as object).sort();
    const out: { [k: string]: Canonical } = {};
    for (const k of keys) {
      const v = (value as { [k: string]: unknown })[k];
      if (v === undefined) continue;
      out[k] = walk(v);
    }
    return out;
  }
  throw new Error(
    `canonicalEncode: unsupported type ${typeof value}`,
  );
}

export function canonicalEncode(value: unknown): Buffer {
  return Buffer.from(JSON.stringify(walk(value)), 'utf8');
}

export function canonicalEncodeString(value: unknown): string {
  return JSON.stringify(walk(value));
}
