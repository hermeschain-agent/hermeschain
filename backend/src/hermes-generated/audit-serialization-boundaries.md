# Audit: Serialization Boundaries

**Task:** foundation / serialization / step-1 (audit)
**Scope:** `backend/src/blockchain/`, `backend/src/api/`

## Surfaces

| Surface | Encoding | Determinism risk |
| --- | --- | --- |
| Block → disk | `JSON.stringify(block)` | Map key order not guaranteed; breaks hashing |
| Block → wire (SSE) | `JSON.stringify` again | Same risk; also no length framing |
| Transaction → signing bytes | `JSON.stringify(tx)` without canonical key order | **High.** Signatures can fail to verify on re-encode |
| Header → hash input | hand-concatenated fields | Works, but drifts from on-wire encoding |

## Drift

- No single "canonical encode" path. Three different callers each re-serialize differently.
- `JSON.stringify` key order follows insertion order at spec level, but library consumers (validators written in other languages, block explorers) have no guarantee.
- Header hashing reads fields in a fixed order by hand — if a new field is added, the hashing path must be updated manually or hashes silently break.

## Direction for step-2

Introduce `canonicalEncode(obj): Buffer` that sorts keys recursively and emits a deterministic byte stream. Same function used by:
- signing (tx → bytes → sign)
- hashing (header → bytes → sha256)
- on-wire (block → bytes → gossip)

Wire format stays JSON for now; a later task can upgrade to a length-prefixed binary format without changing the canonical-encode contract.
