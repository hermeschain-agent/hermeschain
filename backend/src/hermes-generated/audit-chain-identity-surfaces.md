# Audit: Chain Identity Surfaces

**Task:** foundation / chain-id / step-1 (audit)
**Scope:** `backend/src/blockchain/`, `backend/src/api/`

## What "chain identity" has to cover

1. **Chain ID** — canonical network name (`hermeschain-testnet`).
2. **Domain separation constants** — byte-level prefixes baked into signatures, transaction encoding, and block header hashing so signatures from one chain can't replay on another.
3. **Network name** — human-readable label exposed in `/api/agent/status` and the landing page.
4. **Status exposure** — `/api/genesis` and `/api/agent/status` should return identity in a single consistent shape.

## Current surfaces

| Surface | Owner | Value |
| --- | --- | --- |
| `CHAIN_ID` env | `blockchain/Chain.ts` | `hermeschain-testnet` (fallback) |
| Transaction signing prefix | `blockchain/Crypto.ts::SIGNATURE_DOMAIN` | `'HERMES_TX_V1'` (byte-literal) |
| Block header hashing salt | `blockchain/Block.ts::BLOCK_DOMAIN` | `'HERMES_BLK_V1'` |
| API network field | `api/server.ts::buildAgentStatusPayload` | derived from `chain.getChainId()` |

## Drift / gaps

- **Domain separation strings not bound to chainId.** A future testnet fork would keep the `HERMES_TX_V1` prefix, so a signature from the old chain could replay on the fork. Bind the chain ID into the signing prefix (e.g., `HERMES_TX_V1::hermeschain-testnet`).
- **Chain ID appears in three files as a string literal.** `Chain.ts` reads the env, `ValidatorManager.ts` assumes the same fallback, and `GenesisConfig` (step-2 of the genesis workstream) holds its own copy. All three should read from the GenesisConfig record.
- **No chain identity in the Block header.** Every block carries `{height, timestamp, parentHash, txRoot}` but no chainId. A block from another chain with matching structure could be accepted. Add `chainId: string` (or `chainIdHash: bytes32`) to the header.
- **API exposes chainId but not protocolVersion or chainIdHash.** Operators running fork-detection tooling can't tell whether two nodes are on the same fork by reading `/api/agent/status` alone.

## Contract to lock

`ChainIdentity` struct in step-2:

```
interface ChainIdentity {
  chainId: string;            // 'hermeschain-testnet'
  chainIdHash: string;        // sha256(chainId) truncated to 32 bytes, hex-encoded
  protocolVersion: string;    // semver
  signingDomain: string;      // 'HERMES_TX_V1::<chainId>'
  blockDomain: string;        // 'HERMES_BLK_V1::<chainId>'
}
```

The hash form is what gets baked into block headers and signatures; the string form is what /api exposes. Both derive from the same `chainId`, so they can't drift.

## Migration risk

Binding `chainId` into the signing domain changes the signature hash space. Existing signatures from the current testnet won't validate under the new scheme. Plan a validator-coordinated hard fork at step-3 implementation time.
