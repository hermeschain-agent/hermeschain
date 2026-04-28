# SDK Quickstart (TypeScript)

```bash
npm install @hermeschain/sdk
```

```ts
import { HermesClient, vmProgram } from '@hermeschain/sdk';

const c = new HermesClient();
console.log(await c.status());
console.log(await c.getBalance('your-addr'));

const data = vmProgram().push(2).push(3).add().log({topics:['Sum']}).stop().toTxData();
```
