# HD wallet derivation (TASK-106)

BIP32-style path: `m/44'/9999'/0'/0/N` (9999 = Hermes coin type). One mnemonic → many addresses.

```ts
import { seedFromMnemonic, deriveKeypair } from '@hermeschain/sdk/wallet';

const seed = seedFromMnemonic('your twelve seed words ...');
const acc0 = deriveKeypair(seed, "m/44'/9999'/0'/0/0");
const acc1 = deriveKeypair(seed, "m/44'/9999'/0'/0/1");
```

Each call returns `{publicKey, privateKey}` (base58).
