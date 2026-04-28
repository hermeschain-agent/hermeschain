# Tx signing helper (TASK-275/277)

```ts
import { signTransaction } from '@hermeschain/sdk/wallet';

const tx = { from, to, value, gasPrice, gasLimit, nonce, data: '' };
const { signature, hash } = signTransaction(tx, privateKey);
await client.submitTx({ ...tx, signature, hash });
```

Hash is deterministic from canonical message (createTransactionMessage in Crypto.ts). Signature is Ed25519 over that message.
