# Audit: Replay Protection

**Task:** phase-02 / replay-protection / step-1 (audit)
**Scope:** `backend/src/blockchain/`

## Replay vectors

An attacker wants to get the same tx accepted twice. The possible paths:

| Vector | Current defense | Gap |
| --- | --- | --- |
| Same tx submitted twice to same node | hash dedup in mempool | ✓ — but only as long as tx is in the pool |
| Same tx submitted after it's been included in a block | `NonceIndex` on account (existing) | ✓ — but only if the nonce was incremented |
| Same tx submitted on a fork | chainId binding (new, from TransactionV1 work) | ✓ |
| Same tx submitted after the account is reset / reorged | ✗ no durable "seen-tx" set | **gap** |
| A tx with a recycled nonce (replaced-by-fee style) | no replace-by-fee policy | **gap** |

## Nonce window

Current `NonceIndex` rejects `nonce !== expected`. But there's no concept of a future-nonce window (tx for nonce 5 when expected is 3). For signaling future txs (needed by some wallets), a bounded window helps.

Step-2 contract:
```ts
interface NonceWindow {
  expected: number;
  window: number; // default 16
  accept(nonce: number): 'accept' | 'future' | 'stale';
}
```

## Seen-tx set

A bounded LRU of `hash → blockHeight` keyed by `chainIdHash + hash`. Size: 10,000 entries per node (configurable). A tx whose hash is already there gets rejected regardless of nonce state.

## Replace-by-fee

Out of scope for this audit. Documented as a follow-up workstream; a replacement policy must be designed with the auction-pricing workstream.
