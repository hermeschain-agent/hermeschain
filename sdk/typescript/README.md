# @hermeschain/sdk

TypeScript SDK for [Hermeschain](https://hermeschain.io).

## Install

```bash
npm install @hermeschain/sdk
```

## Quickstart

```ts
import { HermesClient, vmProgram } from '@hermeschain/sdk';

const client = new HermesClient(); // defaults to https://hermeschain.io

// Read state
const status = await client.status();
console.log(`Chain at height ${status.chainLength}`);

const balance = await client.getBalance('Hermes...');
console.log(`Balance: ${balance} wei`);

// Build a VM program fluently
const data = vmProgram()
  .push(2)
  .push(3)
  .add()
  .log({ topics: ['Sum'], data: 'computed' })
  .stop()
  .toTxData();

// Submit (signing helper coming with TASK-275 + TASK-277)
await client.submitTx({
  from: '...',
  to: '...',
  value: '0',
  gasPrice: '1',
  gasLimit: '100000',
  nonce: 0,
  data,
  signature: '...',
});
```

## API

### `HermesClient(opts?)`

- `opts.baseUrl` — default `https://hermeschain.io`
- `opts.apiKey` — sets `X-API-Key` header on requests

Methods:

- `status()` → chain height, mempool, validators
- `getBalance(addr)` → balance as decimal string
- `getNextNonce(addr)` → next safe nonce for that account
- `getReceipt(txHash)` → tx receipt or null
- `submitTx(tx)` → `{ success, hash }`

### `vmProgram()`

Fluent VM op builder. See [Hermes VM spec](https://hermeschain.io/docs/vm/spec.md).

## License

MIT
