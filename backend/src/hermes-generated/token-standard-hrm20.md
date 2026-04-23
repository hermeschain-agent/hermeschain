# Token Standard: HRM-20

**Task:** phase-11 / tokens / step-1 (design)
**Scope:** `docs/reference/hrm-20.md`

## Motivation

Fungible tokens on Hermeschain need a standard so wallets, DEXes, and indexers can interact with any compliant token without per-token integration.

## Required interface

```ts
interface HRM20 {
  name(): string;
  symbol(): string;
  decimals(): number;            // typically 18
  totalSupply(): uint256;

  balanceOf(owner: address): uint256;
  transfer(to: address, amount: uint256): bool;
  transferFrom(from: address, to: address, amount: uint256): bool;

  allowance(owner: address, spender: address): uint256;
  approve(spender: address, amount: uint256): bool;
}
```

## Required events

```ts
event Transfer(from: address indexed, to: address indexed, amount: uint256);
event Approval(owner: address indexed, spender: address indexed, amount: uint256);
```

Minting is modeled as `Transfer(address(0), recipient, amount)`; burning as `Transfer(holder, address(0), amount)`. Wallets don't need a separate mint/burn event shape.

## Optional extensions

- `HRM20Burnable`: `burn(amount)` + event.
- `HRM20Permit`: gasless approvals via signed messages.
- `HRM20Snapshot`: checkpoint balances for governance voting.

## Non-goals

- No `transferAndCall` — keep the surface minimal and deterministic.
- No native "hooks" on transfer — contracts that want to react to incoming tokens implement their own pattern.
- No rebasing tokens in the standard — those work but downstream integrations break; mark them clearly.

## Reference implementation

Ships at `backend/src/hermes-generated/hrm20-reference.sol`. Audited reference contract that new projects fork-and-customize.

## Relationship to ERC-20

HRM-20 is intentionally ERC-20-compatible at the method-signature level so existing Ethereum tooling (hardhat, ethers.js) works with zero modification. Event signatures differ only in that HRM chain IDs bind via the `chainIdHash` in the emitting block header; contract-level events are identical.
