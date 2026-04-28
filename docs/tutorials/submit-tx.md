# Tutorial: Submit a tx from a script

```ts
import { HermesClient, vmProgram } from '@hermeschain/sdk';
import { signTransaction } from '@hermeschain/sdk/wallet';

const c = new HermesClient();
const nonce = await c.getNextNonce(myAddr);
const tx = { from: myAddr, to: target, value: '1000', gasPrice: '1', gasLimit: '21000', nonce, data: '', signature: '' };
const { signature, hash } = signTransaction(tx, myPrivateKey);
await c.submitTx({ ...tx, signature, hash });
```

Signing helper lands in TASK-275/277.
