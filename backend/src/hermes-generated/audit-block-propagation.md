# Audit: Block Propagation

**Task:** phase-06 / block-propagation / step-1 (audit)
**Scope:** `backend/src/network/`

## Goal

When a proposer produces block H, all other validators must see H before they propose H+1, or the chain forks.

## Current state

- No peer-to-peer layer. This is a single-operator chain.
- Blocks are written locally and announced over the SSE channel to web clients only.
- There's no concept of a peer list, a gossip protocol, or a sync-from-peer path.

## Implications for multi-validator

For a multi-validator deployment:
1. A peer-registry so each node knows its neighbors.
2. A push channel for new blocks (gossip / direct notify).
3. A pull channel for catch-up when a node comes back online.
4. Signature verification on every inbound block (already covered by TransactionV1 + BlockHeader work).

## Non-goals for this audit

- Full Kademlia / libp2p integration. That's a network-layer workstream.
- Transaction-pool gossip. Separate workstream.

## Proposal: minimal HTTP gossip

For a small validator set (<10), a simple HTTP-based gossip is enough:

```
POST /api/network/block        — receive a new block from a peer
GET  /api/network/head         — return current head for sync
GET  /api/network/peers        — return peer list
POST /api/network/announce     — register as a peer
```

Each validator runs these endpoints. On producing a block, the proposer broadcasts POST /api/network/block to all known peers. On miss (fork detected via head mismatch), the out-of-date node polls GET /head and pulls missing blocks one-by-one.

## Security

All inbound blocks pass the signature + receiptsRoot + stateRoot validation already specified in earlier audits. A malicious peer can slow a node (by sending garbage) but can't corrupt state.
