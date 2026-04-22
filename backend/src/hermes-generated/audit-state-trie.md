# Audit: State Trie

**Task:** phase-03 / state-trie / step-1 (audit)
**Scope:** `backend/src/blockchain/`

## Current state storage

- `StateManager.ts` keeps balances in a flat `Map<Address, BigInt>`.
- `stateRoot` on the block header is `sha256(JSON.stringify(allAccountsSorted))`.
- On a chain of 382k blocks with N accounts, producing a state root is O(N) per block.

## Problems

1. **No inclusion proofs.** A light client can't prove that account X holds balance Y without the entire state map.
2. **O(N) per block.** Scales poorly past 100k accounts.
3. **No incremental updates.** Every state change recomputes the full root.
4. **No storage for contract state.** When the VM workstream lands, each contract needs its own sub-trie — the flat map can't host that.

## Target: Merkle Patricia Trie

```ts
type Nibble = 0 | 1 | ... | 15;
type Node =
  | { kind: 'branch'; children: Array<Node | null>; value: Uint8Array | null }
  | { kind: 'leaf'; key: Nibble[]; value: Uint8Array }
  | { kind: 'extension'; key: Nibble[]; child: Node };
```

Patricia encoding gives:
- O(log N) per update.
- Constant-size inclusion proof (~32 * log N bytes).
- Natural nesting for contract state (each contract is a sub-trie rooted at a single hash in the parent).

## Step-2

Ship a reusable `MerklePatricia` class with `put(key, value)`, `get(key)`, `delete(key)`, `rootHash()`, `prove(key)`, `verify(proof, root, key, value)`.
