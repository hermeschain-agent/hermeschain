# Wire Format: Binary Spec

**Task:** phase-02 / wire-binary / step-1 (design)

## Why binary

The current wire format is JSON (canonicalEncode + length-prefix). Readable, easy to debug, but ~4-8× larger than binary for typical chain data. At high TPS, bandwidth matters.

## Target: a simple type-tagged binary codec

Each value is encoded as a 1-byte type tag + payload:

| Tag | Type | Payload |
| --- | --- | --- |
| `0x01` | null | (none) |
| `0x02` | bool | 1 byte (0x00 / 0x01) |
| `0x03` | uint64 | 8 bytes BE |
| `0x04` | string | 4-byte length + utf-8 bytes |
| `0x05` | bytes | 4-byte length + raw bytes |
| `0x06` | bigint | 4-byte length + BE bytes of the integer |
| `0x07` | array | 4-byte length + N encoded values |
| `0x08` | object | 4-byte count + N (key, value) pairs, key always string |

Determinism: object keys encoded in sorted order (matches canonicalEncode behavior).

## Size comparison

For a typical TransactionV1 (~1 KB JSON):
- JSON: 1024 bytes
- Binary: ~280 bytes

Savings: ~4x. Signature checks are the real bottleneck; encoding is already fast either way, but bandwidth wins.

## Rollout

Wire format is a negotiated extension:
1. HTTP endpoint `GET /api/capabilities` advertises `wire: ['json', 'binary']`.
2. Client picks `Accept: application/hermes-binary` to opt in.
3. P2P layer negotiates via a handshake field `wireFormats: ['binary', 'json']`; peers pick the intersection.

Default stays JSON for one release cycle; binary becomes default in the release after.

## Non-goals

- No CBOR / MessagePack — reuse an existing format would be simpler, but we don't need the ecosystem features (schema, datetimes) and the bespoke codec is ~200 lines.
- No compression (gzip) — tradable against CPU, revisit if bandwidth becomes an issue even after binary.
