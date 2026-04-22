# Audit: Transaction Schema Contract

**Task:** phase-02 / tx-schema / step-1 (audit)
**Scope:** `backend/src/blockchain/`

## Current transaction shape (inferred)

```ts
interface Transaction {
  from: string;
  to: string;
  amount: number;     // ← number. precision risk.
  nonce: number;
  signature: string;
  hash: string;
}
```

Fields live implicitly — no central `Transaction` type, just JSON-shaped objects passed around.

## Drift / gaps

- **`amount: number`** breaks for values > 2^53. Should be `string` (BigInt-safe) across the wire.
- **No chain-id binding.** A tx signed on testnet could replay on mainnet since the signing bytes don't bind the chain. (Foundation/chain-id work addresses the domain prefix; this task makes the binding explicit in the tx schema itself.)
- **No typed field for gas / fee.** Implicit zero-fee. When gas metering lands, the schema needs `gasLimit`, `gasPrice` (both big-number strings).
- **`hash` is included in the signed bytes.** Recursive: the signed hash covers the hash field. Exclude `signature` + `hash` from the canonical pre-sign bytes.
- **No version field.** A tx-schema bump silently accepts or rejects depending on which validator reads the bytes.

## Step-2 contract

```ts
interface TransactionV1 {
  version: 1;
  chainId: string;
  from: string;
  to: string;
  amount: string;        // BigInt-safe
  gasLimit: string;
  gasPrice: string;
  nonce: number;
  validAfterTimestampMs: number;
  validBeforeTimestampMs: number;
  data: string;          // hex or empty
  // computed:
  signature: string;
  hash: string;
}
```

`signature` and `hash` are derived. The canonical pre-sign bytes cover all other fields via `canonicalEncode` from [canonical-encode.ts](canonical-encode.ts).

## Migration

Existing txs have no `version`, no `chainId`, and `amount: number`. Accept both shapes during a 1-block-window transition. After transition, reject legacy.
