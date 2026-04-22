# Wiring plan: MPT into StateManager

**Task:** phase-03 / state-trie / step-3 (wire canonical)
**Depends on:** [mpt-core-types.ts](mpt-core-types.ts)

## StateManager changes

```ts
class StateManager {
  private trie = new MerklePatricia();

  getAccount(address: string): Account | null {
    const bytes = this.trie.get(addressToKey(address));
    return bytes ? decodeAccount(bytes) : null;
  }

  setAccount(address: string, account: Account): void {
    this.trie.put(addressToKey(address), encodeAccount(account));
  }

  rootHash(): string {
    return this.trie.rootHash();
  }

  proveAccount(address: string): Proof {
    return this.trie.prove(addressToKey(address));
  }
}

function addressToKey(address: string): Uint8Array {
  // Hash addresses before insertion so the trie is balanced regardless of
  // prefix clustering (e.g., EVM-style addresses sharing 0x00 prefixes).
  return sha256(Buffer.from(address, 'utf8'));
}
```

## Block header integration

`block.header.stateRoot = stateManager.rootHash()` after all txs in the block apply. Validators reject if the recomputed root differs.

## Rollback on reorg

Store per-block state snapshots as `{height, rootHash, dirtyKeys}` so `rewindTo(height)` can replay or revert without full re-execution. For depth-bounded reorgs (≤ finalityDepth), this is bounded memory.

## Contract state (forward-compat)

Each contract address hosts a nested trie. The account record's `storageRoot: string` is the hash of that sub-trie. Reads / writes go through `contract.storage.put(slot, value)` → updates the storage sub-trie → propagates to the account → propagates to the state root.

## Rollout

Consensus-breaking: state root computation changes. Coordinated fork height `H`; pre-H blocks keep the old flat-sha root, post-H blocks use MPT. A one-time migration pass computes the MPT root at `H` and pins it.
