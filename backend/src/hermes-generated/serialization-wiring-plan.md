# Wiring plan: canonicalEncode through runtime

**Task:** foundation / serialization / step-3 (wire canonical)
**Depends on:** [canonical-encode.ts](canonical-encode.ts)

## Callers

1. `blockchain/Crypto.ts::signTransaction` — replace `JSON.stringify(tx)` with `canonicalEncode(tx)` → sign the buffer.
2. `blockchain/Crypto.ts::verifyTransactionSignature` — same swap on the verify side. Old signatures must be re-verifiable during the rollout window.
3. `blockchain/Block.ts::hashHeader` — replace the hand-concat of header fields with `sha256(canonicalEncode(header))`.
4. `events/EventBus.ts` — the on-wire encoding of SSE events. Swap `JSON.stringify` for `canonicalEncodeString` so a block announced over SSE has the same bytes it'd have on disk.

## Migration

Step (3) changes the header hash, which changes block identities. Coordinated fork at height H. Until H, new nodes accept both old (hand-concat) and new (canonical) header hashes; after H, new only.

Step (1/2) changes signature bytes. Same fork height H — a tx signed before H is verified with the legacy path; at or after, canonical only.

## Verification

Step-4 proves:
- Object-key permutation stability (`{a:1,b:2}` and `{b:2,a:1}` encode identically).
- BigInt round-trip under signing — signing a tx with a BigInt amount, re-parsing the encoded buffer, and verifying the signature all succeed.
