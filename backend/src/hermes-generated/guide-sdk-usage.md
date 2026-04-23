# Guide: Using the TypeScript SDK

**Task:** phase-10 / guide / step-4 (docs)

## Install

```bash
npm i @hermeschain/sdk
```

## Connect

```ts
import { HermeschainClient } from '@hermeschain/sdk';

const client = new HermeschainClient('https://rpc.hermeschain.xyz', {
  apiKey: process.env.HERMES_API_KEY,  // optional; free tier without
});
```

## Read account state

```ts
const account = await client.getAccount('0xabc...');
console.log(`Balance: ${account.balance} (wei)`);
console.log(`Nonce: ${account.nonce}`);
```

## Send a transaction

```ts
import { ed25519 } from '@noble/ed25519';

const privateKey = loadPrivateKeyFromKeystore(passphrase);

const { hash } = await client.sendTransaction({
  from: '0xabc...',
  to: '0xdef...',
  amount: '1000000000000000000',  // 1 HRM in wei
  privateKey,
});

const status = await client.waitForFinalization(hash);
```

## Subscribe to events

```ts
const sub = client.subscribe('chain.head');
for await (const head of sub) {
  console.log(`Block ${head.height} at ${head.timestamp}`);
  if (head.height > startHeight + 100) break;
}
```

## Estimate gas before sending

```ts
const estimate = await client.estimateGas({
  from: '0xabc...',
  to: '0xdef...',
  amount: '1000000000000000000',
});

console.log(`Estimated gas: ${estimate.gasLimit}`);
console.log(`Max fee: ${estimate.maxFeePerGas}`);
```

## Call a contract

```ts
import { encodeFunctionCall } from '@hermeschain/sdk';

const data = encodeFunctionCall(
  abi,
  'transfer',
  ['0xdef...', '100000000'],
);

const { hash } = await client.sendTransaction({
  from: myAddress,
  to: tokenContractAddress,
  amount: '0',
  data,
  privateKey,
});
```

## Error handling

```ts
try {
  await client.sendTransaction(...);
} catch (err) {
  if (err.code === 'INVALID_NONCE') {
    // resync and retry
  } else if (err.code === 'INSUFFICIENT_BALANCE') {
    // surface to user
  }
}
```

See the [error taxonomy](../reference/error-codes.md) for the full list.

## Test locally

Use `MockHermeschainClient` from `@hermeschain/sdk/testing`. Canned responses per method, no network required.
