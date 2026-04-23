# EIP-712 Typed Data Support

**Task:** phase-11 / eip712 / step-1 (design)

## Why

EIP-712 lets users sign structured data ("approve 100 HRM transfer to alice.hrm") instead of opaque hex. Wallets display what's being signed in human-readable form. Trust-minimizing for dApp interactions.

## Scope

Support EIP-712 typed data signing + verification for:

1. Off-chain signatures on application data (e.g., permit() gasless approvals).
2. Meta-transactions (user signs intent, relayer pays gas to submit).
3. Order-book signatures for DEX-style limit orders.

## Structure

```ts
interface TypedDomain {
  name: string;
  version: string;
  chainId: string;           // Hermes chainId, not Ethereum
  verifyingContract?: string;
}

interface TypedData<T> {
  domain: TypedDomain;
  types: Record<string, Array<{ name: string; type: string }>>;
  primaryType: string;
  message: T;
}
```

## Hashing

Per EIP-712:

```
hash = keccak256(
  '\x19\x01' ||
  domainSeparator ||
  hashStruct(primaryType, message)
)
```

`domainSeparator = keccak256(hashStruct('EIP712Domain', domain))`.

## Chain-id binding

`domain.chainId` must match the node's chainId or signatures are rejected. Prevents cross-chain signature replay the same way transaction-level signatures get chain-bound.

## SDK integration

```ts
const sig = await wallet.signTypedData(domain, types, message);
const valid = verifyTypedDataSignature(domain, types, message, sig, signerAddr);
```

Used by the reference `HRM20Permit` extension so token approvals can happen without a tx.

## Non-goals

- No support for legacy `eth_signTypedData_v1` or `_v3` — only v4 (the current standard).
- No batch signing of multiple typed-data payloads — one signature per payload.
