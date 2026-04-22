# Wiring plan: TxSignature through signer + verifier

**Task:** phase-02 / tx-signatures / step-3 (wire canonical)
**Depends on:** [tx-signature-record.ts](tx-signature-record.ts), [transaction-v1-record.ts](transaction-v1-record.ts)

## Sign

```ts
function signTx(payload: TransactionPayload, pk: PrivateKey, identity: ChainIdentity): TransactionV1 {
  const bytes = canonicalEncode(payload);
  const hash = sha256(applySigningDomain(identity, bytes)).toString('hex');
  const rawSig = ed25519.sign(hash, pk);            // returns possibly-high-s
  const lowSSig = canonicalizeLowS(rawSig);         // flip s → L - s if high
  const signature = makeTxSignature({
    scheme: 'ed25519',
    publicKey: pk.publicKey.toString('hex'),
    signature: lowSSig.toString('hex'),
  });
  return { ...payload, signature, hash };
}
```

The `canonicalizeLowS` step is the critical addition. Without it, half the library's random signatures would fail our `makeTxSignature` high-s rejection.

## Verify

```ts
function verifyTx(tx: TransactionV1, identity: ChainIdentity): boolean {
  const payload = toSignablePayload(tx);
  validatePayload(payload);
  const bytes = canonicalEncode(payload);
  const expectedHash = sha256(applySigningDomain(identity, bytes)).toString('hex');
  if (tx.hash !== expectedHash) return false;                  // tampered
  if (tx.chainId !== identity.chainId) return false;           // cross-chain
  // makeTxSignature was called on ingest; still assert in case of bypass:
  if (!isLowS(tx.signature.signature)) return false;
  return ed25519.verify(tx.signature.signature, tx.hash, tx.signature.publicKey);
}
```

## Address derivation

`from` on the tx must derive from `signature.publicKey`. Add `deriveAddress(pubKeyHex): string` alongside the signer so pool admission can assert `deriveAddress(tx.signature.publicKey) === tx.from`.

## Rollout

Co-ordinated with the TransactionV1 rollout — same legacy-accept window, same fork height.
