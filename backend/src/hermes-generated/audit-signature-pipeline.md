# Audit: Signature Pipeline

**Task:** phase-02 / tx-signatures / step-1 (audit)
**Scope:** `backend/src/blockchain/`

## What "signature pipeline" covers

From an external tx submission, the path is:

1. Client builds `TransactionPayload` (post tx-schema work)
2. Client canonical-encodes, prefixes domain, hashes
3. Client signs hash with private key
4. Node receives signed tx → verifies
5. Node indexes by `(from, nonce)`

## Problems in the current code

- **Malleability.** `ed25519.verify` accepts both `s` and `L - s` forms of the signature. A valid signature can be flipped into a second valid signature with a different byte pattern — breaks "hash → signature" uniqueness assumed by the mempool.
- **No low-s canonicalization.** Signers don't reject high-s output from the underlying library.
- **No length check on publicKey.** A 31-byte or 33-byte key is silently accepted; the verify call may crash or misbehave.
- **Signature format is raw 64 bytes.** Fine, but no version prefix — future scheme upgrade (e.g., Schnorr) would need a format-aware verifier.
- **`from` is the address string, not the public key.** Pool has to resolve `from → publicKey` via the state trie on every verify. Either embed `pubKey` in the tx or index it.

## Step-2 contract

```ts
interface TxSignatureV1 {
  scheme: 'ed25519';     // extensible for Schnorr later
  publicKey: string;     // 32-byte hex
  signature: string;     // 64-byte hex, low-s canonical
}
```

Field lives on `TransactionV1` as `signature: TxSignatureV1`. `from` remains the derived address for indexing; `publicKey` comes with the tx so the pool doesn't touch state.

## Migration

Existing txs have `signature: string` (raw hex). Shim: detect string vs object, treat string as `{scheme:'ed25519', publicKey: '<resolve from state>', signature: str}`.
