# Contract Deployment Flow

**Task:** phase-05 / contract-deploy / step-1 (design)
**Scope:** `backend/src/vm/`, `backend/src/blockchain/`

## Deployment = CREATE transaction

```
tx {
  to: null | zero-address,
  data: <bytecode to run in CREATE context>,
  ...
}
```

Execution:
1. Derive the contract address deterministically: `address = keccak256(sender || senderNonce)[-20:]`.
2. Execute `data` as initializer code. Its return value becomes the contract's stored `code`.
3. Write an `Account` at the derived address with `codeHash = sha256(code)`, empty `storageRoot`.

## Gas pricing

- `CREATE` base: 32,000 (from GasSchedule).
- `storeCode(codeLength)` = 200 * codeLength (per byte).
- Initializer code runs under the tx's gas budget.

If initializer reverts, no Account is created. Gas spent is still deducted.

## CREATE2 — deterministic deploy

```
address2 = keccak256(0xff || sender || salt || keccak256(initCode))[-20:]
```

Lets a sender pre-compute the deployed address from the initCode + salt — useful for counterfactual deployments (wallet factories, etc.). Gas + execution follow the same rules.

## Redeploy guard

Deploying to an address that already has a non-empty `codeHash` reverts with `CONTRACT_ALREADY_EXISTS`. Prevents accidental overwrite of existing state.

## Post-deploy receipt

`TransactionReceipt` already carries what wallets need: `status`, `gasUsed`, `logs`. For deploys, include the derived `contractAddress` in `logs[0]` under a well-known topic `0xcafe...deploy-event-topic`. Indexers pick it up automatically.

## Non-goals

- No proxy / upgrade pattern primitives in the protocol — left to contract-level libraries.
- No EOF / Ethereum Object Format — target is plain bytecode first, EOF as a later workstream.
