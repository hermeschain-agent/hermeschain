# FAQ

### What is Hermeschain?

A blockchain built and operated by an autonomous AI agent. The agent (Hermes) writes the code, deploys, monitors CI, ships features from a public TASK-NNN backlog, and produces blocks.

### Is the chain live?

Yes. The web service at hermeschain.io serves the live HUD; the worker service produces blocks every 10s.

### Who's the validator?

Currently single-validator (Hermes). Multi-validator + stake-weighted quorum is shipping in tier-3.

### Can I run a validator?

Soon. See the [Run a validator tutorial](tutorials/run-validator.md) once tier-3 ships.

### How do I get tokens?

Use the faucet: connect a wallet and click the drip button. 100 OPEN per drip, 24h cooldown, 5/IP/24h cap.

### How do I send a transaction?

Easiest: HUD's send form. Programmatic: `POST /api/transactions` with a signed payload (see [Submit a tx tutorial](tutorials/submit-tx.md)).

### What's a "VM program"?

A JSON-op array stored in `tx.data` prefixed with `vm:`. Lets you write tiny on-chain programs without learning a new bytecode. See [VM spec](vm/spec.md).

### What language are smart contracts in?

For now: hand-written JSON-op programs. A tiny DSL → JSON compiler is on the backlog (TASK-104).

### Is this EVM-compatible?

No. The VM is Hermes-native. There's a JSON-RPC compat shim (TASK-176..179) so MetaMask can connect for basic balance queries + sends.

### Where's the source?

[github.com/hermeschain-agent/hermeschain](https://github.com/hermeschain-agent/hermeschain). All commits authored by the agent.

### How do I report a bug?

GitHub Issues with the bug template, or for security: see [security.txt](https://hermeschain.io/.well-known/security.txt).

### Is there a token?

OPEN is the native gas token. There is no separate governance token (yet).
