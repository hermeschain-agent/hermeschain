# Mempool Gossip Propagation Notes

**Task:** phase-06 / mempool-sync / step-1 (notes)
**Scope:** `backend/src/network/`

## Problem restatement

A tx admitted by one node needs to reach the rest. Too aggressive → bandwidth meltdown. Too lazy → proposer doesn't have the tx when its slot arrives → user's tx delayed by at least one block.

## Hash-announce first, body-on-demand

Inspired by Ethereum's DEVP2P newer pattern:

1. On admit → broadcast `{type: 'tx_hash_announce', hash}` to all peers.
2. Receiver checks local pool: if already present, ignore.
3. Otherwise, send `{type: 'tx_body_request', hash}` to the announcer.
4. Announcer replies `{type: 'tx_body', tx}`.

This cuts bandwidth by ~10× vs broadcasting every body, at the cost of one extra round-trip for unseen txs.

## Large tx threshold

For txs under 256 bytes, skip the announce dance — just send the body. The extra RTT costs more than the bandwidth saves.

## Rebroadcast after gossip

Receiver that just admitted a tx announces it to its own peers. This is the gossip fan-out. Anti-loop: `recentlyGossiped` LRU (from the tx-gossip workstream).

## Initial mempool sync on reconnect

On connect / reconnect, send `{type: 'mempool_digest', topN: [hash, hash, ...]}` with the 500 highest-fee tx hashes. Peer responds with which hashes it doesn't have; requester sends those bodies. Avoids rebroadcasting the full pool after a brief disconnect.

## Validator-set awareness

Validators gossip to all active validators. Non-validator nodes only gossip upstream (to validators). Prevents a ring of non-validators re-broadcasting among themselves without reaching the producer.

## Metrics

- `mempool_announce_sent_total`
- `mempool_body_requested_total`
- `mempool_duplicate_receive_total`
- `mempool_large_tx_direct_send_total`
