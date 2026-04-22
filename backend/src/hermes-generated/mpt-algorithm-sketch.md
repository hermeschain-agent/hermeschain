# MPT Algorithm: insert / lookup / prove

**Task:** phase-03 / state-trie / step-5 (algorithm)
**Depends on:** [mpt-core-types.ts](mpt-core-types.ts)

## insert(node, key, value)

Recursive walk by nibble path. At each step:

- **null node** → become a leaf with (key, value).
- **branch** → if key is empty, set `value` on the branch; else recurse into `children[key[0]]` with `key.slice(1)`.
- **leaf** — compare the existing leaf's key with the incoming key:
  - identical → overwrite value.
  - divergent → split into a branch at the common prefix; existing leaf and new leaf hang off different children.
- **extension** — find the common prefix with the extension's key:
  - full prefix match → recurse into the extension's child with `key.slice(ext.key.length)`.
  - partial match → split: shorten the extension to the common prefix, create a branch at the divergence, put both the old extension's child and the new leaf on it.

## lookup(node, key)

Mirror image of insert but read-only:

- **null** → return null.
- **leaf** → return `value` iff `leaf.key === key`, else null.
- **branch** — if `key` is empty, return `branch.value`; else recurse into `children[key[0]]` with `key.slice(1)`.
- **extension** — if `key` starts with `ext.key`, recurse into the child with `key.slice(ext.key.length)`; else null.

## prove(node, key) → Proof

Proof = the ordered list of nodes traversed from root to the target leaf. Verifier rehashes each node bottom-up and confirms the final hash matches the advertised root.

## Hashing

Each node's hash:
- branch: `sha256(canonicalEncode([children*hashes, value]))`
- leaf: `sha256(canonicalEncode(['leaf', key, value]))`
- extension: `sha256(canonicalEncode(['ext', key, childHash]))`

`canonicalEncode` from the serialization workstream guarantees identical bytes for identical trees regardless of construction order.

## Complexity

- `insert` / `lookup`: O(key_nibbles) per operation = O(log N) in the keyspace size.
- `prove`: O(log N) nodes, ~32 * log N bytes on the wire.

## Follow-ups

- In-place mutation vs. persistent tree — start with the latter (copy on write) so rollback is O(1) by swapping root pointers.
- Lazy hashing — compute hashes once per root, cache on each node.
