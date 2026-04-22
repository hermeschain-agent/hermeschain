# Wiring plan: ChainIdentity through signing + block paths

**Task:** foundation / chain-id / step-3 (wire canonical)
**Depends on:** [chain-identity-record.ts](chain-identity-record.ts)

## Consumers

| File | Current | After |
| --- | --- | --- |
| `blockchain/Crypto.ts` | hardcoded `SIGNATURE_DOMAIN = 'HERMES_TX_V1'` | reads `identity.signingDomain`; all `sign()` / `verify()` routes through `applySigningDomain()` |
| `blockchain/Block.ts` | hardcoded `BLOCK_DOMAIN = 'HERMES_BLK_V1'` | reads `identity.blockDomain`; header hashing routes through `applyBlockDomain()` |
| `blockchain/Block.ts::Header` | no `chainIdHash` field | adds `chainIdHash: string` (first 32 hex); rejected at validation if mismatch |
| `api/server.ts::buildAgentStatusPayload` | returns `chainId: string` only | returns `{ chainId, chainIdHash, protocolVersion }` |

## Rollout

1. Ship `makeChainIdentity` + helpers (already done in step-2).
2. Emit both old + new signatures in parallel for one commit window — validators accept either.
3. Flip validator-side accept to new-only at a coordinated height `H`. Record `H` in `GenesisConfig.forkHeights`.
4. Drop the legacy `SIGNATURE_DOMAIN` / `BLOCK_DOMAIN` constants.

## Risk

Step 3 is a consensus-breaking change. Missing the height → chain split. Document in operator runbook.
