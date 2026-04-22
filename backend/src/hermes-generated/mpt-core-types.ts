/**
 * Merkle Patricia Trie — core node types and nibble utilities.
 *
 * Phase-3 / state-trie / step-2. Pure types + helpers; the algorithm
 * (insert, lookup, proof, verify) lands in a separate module once the
 * State-Manager wiring plan is finalized.
 */

export type Nibble =
  | 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7
  | 8 | 9 | 10 | 11 | 12 | 13 | 14 | 15;

export interface BranchNode {
  readonly kind: 'branch';
  readonly children: ReadonlyArray<TrieNode | null>; // length 16
  readonly value: Uint8Array | null;
}

export interface LeafNode {
  readonly kind: 'leaf';
  readonly key: readonly Nibble[];
  readonly value: Uint8Array;
}

export interface ExtensionNode {
  readonly kind: 'extension';
  readonly key: readonly Nibble[];
  readonly child: TrieNode;
}

export type TrieNode = BranchNode | LeafNode | ExtensionNode;

/** Convert a byte buffer to its nibble (half-byte) sequence. */
export function toNibbles(bytes: Uint8Array): Nibble[] {
  const out: Nibble[] = [];
  for (const b of bytes) {
    out.push(((b >> 4) & 0x0f) as Nibble);
    out.push((b & 0x0f) as Nibble);
  }
  return out;
}

/** Count the leading nibbles where two sequences agree. */
export function commonPrefixLength(a: readonly Nibble[], b: readonly Nibble[]): number {
  let i = 0;
  const max = Math.min(a.length, b.length);
  while (i < max && a[i] === b[i]) i += 1;
  return i;
}

/** True if `a` is a prefix of `b` (or equal). */
export function isPrefix(a: readonly Nibble[], b: readonly Nibble[]): boolean {
  if (a.length > b.length) return false;
  for (let i = 0; i < a.length; i += 1) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

/** Build an empty branch (no children, no value). */
export function emptyBranch(): BranchNode {
  return {
    kind: 'branch',
    children: Object.freeze(new Array(16).fill(null)),
    value: null,
  };
}
