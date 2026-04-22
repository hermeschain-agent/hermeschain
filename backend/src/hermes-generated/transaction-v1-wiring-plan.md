# Wiring plan: TransactionV1 through pool + validator

**Task:** phase-02 / tx-schema / step-3 (wire canonical)
**Depends on:** [transaction-v1-record.ts](transaction-v1-record.ts), [canonical-encode.ts](canonical-encode.ts)

## Signing flow

```
payload = toSignablePayload(input)       // strips sig + hash
validatePayload(payload)                  // throws on bad shape
bytes = canonicalEncode(payload)          // deterministic utf-8
prefixed = applySigningDomain(id, bytes)  // binds chain
hash = sha256(prefixed)
signature = ed25519.sign(hash, privKey)
tx = { ...payload, signature, hash }
```

## Verify flow

```
payload = toSignablePayload(tx)
validatePayload(payload)                  // shape first
bytes = canonicalEncode(payload)
prefixed = applySigningDomain(identity, bytes)
expectedHash = sha256(prefixed)
if tx.hash !== expectedHash → reject (tampered hash)
if !ed25519.verify(tx.signature, expectedHash, tx.from.publicKey) → reject
```

## Pool gate

`TransactionPool.accept(tx: TransactionV1)`:
1. `validatePayload(toSignablePayload(tx))` — fast shape check
2. `tx.chainId === config.chainId` — reject cross-chain replays
3. `now >= tx.validAfterTimestampMs && now < tx.validBeforeTimestampMs`
4. `nonceIndex.accept(tx.from, tx.nonce)` — per-account nonce gate
5. signature verify
6. admit to pool

## Legacy transition

During the transition window (one commit window, per the audit), the pool accepts legacy txs (no version, `amount: number`) through a shim:
```ts
function legacyShim(raw: unknown): TransactionPayload | null {
  if ((raw as any).version === 1) return raw as TransactionPayload;
  // Best-effort migration:
  return {
    version: 1,
    chainId: config.chainId,
    from: (raw as any).from,
    to: (raw as any).to,
    amount: String((raw as any).amount),
    gasLimit: '0',
    gasPrice: '0',
    nonce: (raw as any).nonce,
    validAfterTimestampMs: Date.now() - 1000,
    validBeforeTimestampMs: Date.now() + 5 * 60 * 1000,
    data: '',
  };
}
```
Emits a `[SCHEMA] migrated legacy tx` log. After the transition window expires, the shim's first return is `null` for non-v1 and the caller rejects.
