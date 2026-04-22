# TypeScript SDK Shape

**Task:** phase-09 / sdk / step-1 (design)
**Scope:** `sdk/` (new package, future)

## Goal

A thin client library that wallets, bots, and explorers import instead of reimplementing RPC calls. Publishes as `@hermeschain/sdk` on npm.

## Public surface

```ts
import { HermeschainClient } from '@hermeschain/sdk';

const client = new HermeschainClient('https://rpc.hermeschain.xyz');

// Account reads
const account = await client.getAccount('0x...');
const nonce = await client.getNonce('0x...');

// Tx submission
const tx = await client.sendTransaction({
  from: '0x...',
  to: '0x...',
  amount: '1000',
  privateKey: '...',          // local-only, never leaves the caller
});

// Status polling
const status = await client.getTxStatus(tx.hash);

// Subscription
const sub = client.subscribe('chain.head');
for await (const head of sub) { ... }

// Utilities
const gas = await client.estimateGas({ from, to, amount });
const fee = await client.suggestFee();
```

## Dependencies

- `@noble/ed25519` — client-side signing.
- `ws` — optional, for `subscribe`. Falls back to polling if not available.
- Zero heavy dependencies otherwise. Runs in Node and browsers.

## Versioning

Matches chain protocol version. SDK v0.5.x speaks to chain v0.5.x. SDK emits a `ClientProtocolMismatchError` if the `/api/chain/head` response reports a protocol version outside the SDK's supported range.

## Testing surface

Internal `MockHermeschainClient` for downstream projects to unit-test against without a running node. Emits canned responses for each method.

## Rollout

- v0.1: read-only methods (`getAccount`, `getNonce`, `getTxStatus`, `getBlock`).
- v0.2: tx submission (`sendTransaction`, signed locally).
- v0.3: subscribe + estimation helpers.
- v1.0: stable API after one full release cycle in production.

## Non-goals

- No wallet UI primitives — just the transport / signing.
- No chain indexing — SDK queries, doesn't index.
- No browser-only features relying on `window` — stays isomorphic.
