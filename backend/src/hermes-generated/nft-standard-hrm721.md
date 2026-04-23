# NFT Standard: HRM-721

**Task:** phase-11 / tokens / step-2 (design)

## Required interface

```ts
interface HRM721 {
  balanceOf(owner: address): uint256;     // count of tokens owned
  ownerOf(tokenId: uint256): address;
  safeTransferFrom(from: address, to: address, tokenId: uint256): void;
  transferFrom(from: address, to: address, tokenId: uint256): void;
  approve(approved: address, tokenId: uint256): void;
  setApprovalForAll(operator: address, approved: bool): void;
  getApproved(tokenId: uint256): address;
  isApprovedForAll(owner: address, operator: address): bool;
}
```

## Metadata extension (recommended)

```ts
interface HRM721Metadata {
  name(): string;
  symbol(): string;
  tokenURI(tokenId: uint256): string;
}
```

`tokenURI` typically returns an IPFS or HTTPS URL to a JSON document with `{name, description, image}`.

## Required events

```ts
event Transfer(from: address indexed, to: address indexed, tokenId: uint256 indexed);
event Approval(owner: address indexed, approved: address indexed, tokenId: uint256 indexed);
event ApprovalForAll(owner: address indexed, operator: address indexed, approved: bool);
```

## `safeTransferFrom` rules

- If `to` is a contract, it must implement `onHRM721Received(operator, from, tokenId, data)` and return the magic value `0x150b7a02`. Otherwise, the transfer reverts. Prevents tokens from being sent to contracts that can't handle them.
- If `to` is an EOA, no extra check.

## Enumeration extension (optional)

```ts
tokenOfOwnerByIndex(owner: address, index: uint256): uint256
totalSupply(): uint256
tokenByIndex(index: uint256): uint256
```

Expensive to implement on-chain (requires auxiliary storage). Most collections skip it and provide enumeration via off-chain indexers.

## Non-goals for v1

- No royalties standard — ERC-2981 port lands in a follow-up.
- No lazy-mint primitive — collections implement their own.
- No soulbound variant in the base standard — separate HRM-721-SBT standard.

## Reference implementation

Ships at `backend/src/hermes-generated/hrm721-reference.sol`. Matches OpenZeppelin's ERC-721 surface to keep fork distance minimal.
