# Fork Choice Design: GHOST

**Task:** phase-06 / fork-choice / step-1 (audit + design)
**Scope:** `backend/src/consensus/`

## Problem

When two proposers publish at the same height (rare but possible), validators see two blocks and must deterministically pick one as canonical. The rule must be:

- Deterministic (same inputs → same choice).
- Fork-resistant (attacker can't pick arbitrarily).
- Online-friendly (doesn't require seeing the whole history).

## Choice: GHOST-style heaviest-subtree

For each fork point, count the total stake of validators whose attestations descend from each branch. Pick the heavier.

### Rules

1. Each block carries `parentHash`.
2. Build a tree rooted at the last finalized block.
3. At each fork, follow the child whose sub-tree has the most attestation stake.
4. Tiebreaker: lower block hash (lexicographic).

### Attestation = any signed message referencing a block

For Hermeschain's simple validator set, "attestation" can be as thin as: a subsequent block whose parentHash chain passes through the candidate. This is the "longest-chain but weighted by stake" interpretation — enough for depth-based finality; richer attestation messages are a later workstream.

## Pseudocode

```
function headFromForkChoice(root: Block, tree: BlockTree): Block {
  let node = root;
  while (true) {
    const children = tree.childrenOf(node);
    if (children.length === 0) return node;
    const heaviest = children.reduce((best, c) => {
      const weight = tree.subtreeStake(c);
      return !best || weight > best.weight ||
             (weight === best.weight && c.hash < best.c.hash)
        ? { c, weight }
        : best;
    }, null);
    node = heaviest!.c;
  }
}
```

## Non-goals

- Not implementing attestation gossip in this commit.
- Not implementing slashing for equivocation — separate workstream.
- Not implementing Casper-FFG style finality on top (our finality is depth-based).
