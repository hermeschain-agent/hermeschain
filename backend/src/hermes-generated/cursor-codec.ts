/**
 * Opaque pagination cursor codec.
 *
 * Phase-7 / pagination / step-2. Wraps a lastKey + filter hash into
 * a single base64 string consumers can treat as opaque.
 */

import { createHash } from 'crypto';

export interface CursorState {
  readonly lastKey: string;
  readonly filterHash: string;
}

export function hashFilter(filter: Record<string, unknown>): string {
  const sorted = Object.keys(filter).sort();
  const canonical = JSON.stringify(sorted.map((k) => [k, filter[k]]));
  return createHash('sha256').update(canonical).digest('hex').slice(0, 16);
}

export function encodeCursor(state: CursorState): string {
  const json = JSON.stringify({
    k: state.lastKey,
    f: state.filterHash,
  });
  return Buffer.from(json, 'utf8').toString('base64url');
}

export function decodeCursor(
  cursor: string | null | undefined,
  currentFilter: Record<string, unknown>,
): CursorState | null {
  if (!cursor) return null;

  let parsed: { k?: unknown; f?: unknown };
  try {
    const json = Buffer.from(cursor, 'base64url').toString('utf8');
    parsed = JSON.parse(json);
  } catch {
    throw new Error('cursor: invalid encoding');
  }

  if (typeof parsed.k !== 'string' || typeof parsed.f !== 'string') {
    throw new Error('cursor: malformed payload');
  }

  const currentHash = hashFilter(currentFilter);
  if (parsed.f !== currentHash) {
    throw new Error('cursor: filter changed since this cursor was issued');
  }

  return { lastKey: parsed.k, filterHash: parsed.f };
}
