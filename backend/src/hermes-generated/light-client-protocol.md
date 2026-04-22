# Light Client Protocol

**Task:** phase-09 / light-client / step-1 (design)

## Goal

A browser-resident client that verifies chain state without running a full node. Enables trust-minimized wallets that don't pin to a single RPC endpoint.

## What the light client keeps

- A trusted checkpoint `{height, hash, stateRoot, validatorSet}` (ship-baked or manually loaded).
- The latest finalized block header.
- A cached map of account → Account record.

## What it pulls on demand

- `GET /api/chain/head` — latest `{height, hash, stateRoot}`.
- `GET /api/state/account/:address?withProof=true` — account + MPT proof.
- `GET /api/chain/block/:height/header` — header only.

## Verification loop

```
on wallet.getBalance(address):
  head = rpc.head()
  assert head.height > checkpoint.height
  verifyHeaderChain(checkpoint.hash, head.hash)   // walks parentHash back to checkpoint
  { account, proof } = rpc.accountWithProof(address)
  if !verifyProof(proof, address, account, head.stateRoot) throw BadProof
  return account.balance
```

The critical check is `verifyHeaderChain`: pull intermediate headers and confirm `head.parentHash` chain eventually reaches `checkpoint.hash`. At 10k blocks between checkpoint and head, that's 10k small header fetches — doable.

Optimization: skip list. `header.skipHash` field (new, forward-compat) points N blocks back. Walking (log2 N) headers replaces the linear chain. Not shipping this rev; document as follow-up.

## Trust model

- Trust the checkpoint (shipped or manually loaded from a source operator trusts).
- Trust the RPC only for data; signatures / proofs are checked client-side.
- An RPC that lies about the chain is caught by proof verification failure.

## Fallback

If proof verification fails:
- Mark the RPC as compromised in local state.
- Emit a user-visible warning ("endpoint returned inconsistent data").
- Try the next configured RPC.

## Non-goals

- No implementation yet — this is design only. Implementation rides on the SDK work (`@hermeschain/sdk` v0.3).
- No zk-style compressed-header proofs — future workstream.
