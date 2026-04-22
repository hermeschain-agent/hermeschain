/**
 * MPT proof verifier.
 *
 * Phase-3 / state-trie / step-6. The light-client side of the proof
 * system: given (proof, key, value, expectedRoot), recompute the
 * root by walking the proof nodes bottom-up and confirm it matches.
 */

import { createHash } from 'crypto';
import { TrieNode, Nibble, toNibbles } from './mpt-core-types';

export interface MPTProof {
  readonly nodes: readonly TrieNode[];
}

/**
 * Hash a node deterministically. Must match the hashing done inside
 * the live trie on the producer side.
 */
export function hashNode(node: TrieNode): string {
  const h = createHash('sha256');
  switch (node.kind) {
    case 'leaf':
      h.update('leaf');
      h.update(JSON.stringify(node.key));
      h.update(node.value);
      break;
    case 'extension':
      h.update('ext');
      h.update(JSON.stringify(node.key));
      h.update(hashNode(node.child));
      break;
    case 'branch':
      h.update('branch');
      for (const c of node.children) {
        h.update(c === null ? 'null' : hashNode(c));
      }
      if (node.value !== null) h.update(node.value);
      break;
  }
  return h.digest('hex');
}

/**
 * Verify a proof. Returns true iff the recomputed root matches
 * `expectedRoot` AND the proof lookup path produces `expectedValue`.
 */
export function verifyProof(
  proof: MPTProof,
  keyBytes: Uint8Array,
  expectedValue: Uint8Array | null,
  expectedRoot: string,
): boolean {
  if (proof.nodes.length === 0) {
    return expectedValue === null && expectedRoot === 'EMPTY';
  }

  const root = proof.nodes[0];
  const recomputed = hashNode(root);
  if (recomputed !== expectedRoot) return false;

  const path = toNibbles(keyBytes);
  const found = walkForValue(root, path);
  if (expectedValue === null) return found === null;
  if (found === null) return false;
  return Buffer.compare(found, expectedValue) === 0;
}

function walkForValue(node: TrieNode, path: readonly Nibble[]): Uint8Array | null {
  if (node.kind === 'leaf') {
    if (pathEqual(node.key, path)) return node.value;
    return null;
  }
  if (node.kind === 'extension') {
    if (!startsWith(path, node.key)) return null;
    return walkForValue(node.child, path.slice(node.key.length));
  }
  // branch
  if (path.length === 0) return node.value;
  const child = node.children[path[0]];
  if (child === null) return null;
  return walkForValue(child, path.slice(1));
}

function pathEqual(a: readonly Nibble[], b: readonly Nibble[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i += 1) if (a[i] !== b[i]) return false;
  return true;
}

function startsWith(path: readonly Nibble[], prefix: readonly Nibble[]): boolean {
  if (prefix.length > path.length) return false;
  for (let i = 0; i < prefix.length; i += 1) if (path[i] !== prefix[i]) return false;
  return true;
}
