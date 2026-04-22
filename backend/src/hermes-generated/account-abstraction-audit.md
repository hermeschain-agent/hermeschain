# Account Abstraction Audit

**Task:** phase-09 / account-abstraction / step-1 (audit)
**Scope:** future `backend/src/aa/`

## Why account abstraction

Currently, every account is an externally-owned address with a single ed25519 keypair. That's fine for CLI users but rough for wallet UX — key loss means funds loss, no multi-sig, no session keys, no social recovery.

Account abstraction unifies EOAs and contracts under one model where the account itself defines how signatures are validated. Losing one key becomes recoverable.

## Minimum viable AA

A contract-based account ("smart account") specifies its own verification logic via a `validateUserOp(op, hash)` function. Bundlers pick up user operations, wrap them into transactions, and submit to the mempool.

## UserOperation shape

```ts
interface UserOperation {
  sender: address;                 // the smart account
  nonce: number;                   // account-specific, not per-key
  initCode?: hex;                  // for first-time deployment
  callData: hex;                   // what the account should do
  callGasLimit: string;
  verificationGasLimit: string;
  preVerificationGas: string;
  maxFeePerGas: string;
  maxPriorityFeePerGas: string;
  paymaster?: hex;                 // optional sponsor for gas
  signature: hex;                  // format defined by the account
}
```

## Validation flow

1. Bundler receives UserOperation.
2. Call `sender.validateUserOp(op, opHash)` via a `staticcall` with capped gas.
3. If return === 0 → valid. Otherwise reject.
4. Optionally call `paymaster.validatePaymasterUserOp(op, opHash)` if paymaster set.

## Benefits

- Multi-sig: account contract does N-of-M signature validation.
- Session keys: account holds a whitelist of limited keys that can sign low-value ops.
- Social recovery: account has guardian addresses that can rotate the primary signer.
- Gas abstraction: user pays in USDC, paymaster converts to native.

## Scope for first landing

- UserOperation record type.
- EntryPoint contract shape (validation + bundling).
- Bundler mempool (separate from tx mempool).
- No paymaster infrastructure yet — schema supports it, but marketplace lands later.

## Non-goals

- No ERC-4337 full compatibility — start with a Hermes-native shape, bridge to 4337 later if demand.
- No key rotation primitives beyond what account contracts implement themselves.
