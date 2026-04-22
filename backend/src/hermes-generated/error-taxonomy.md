# Error Taxonomy

**Task:** phase-08 / errors / step-1 (design)

## Goal

A small fixed set of error codes the API and SDK both use, so consumers can branch on stable identifiers instead of regex-matching message strings.

## Codes

| Code | HTTP | When |
| --- | --- | --- |
| `BAD_REQUEST` | 400 | Malformed input (parse failure, missing required field) |
| `INVALID_SIGNATURE` | 400 | Signature format / curve / low-s check failed |
| `INVALID_NONCE` | 400 | Nonce stale, future-out-of-window, or wrong-format |
| `INSUFFICIENT_BALANCE` | 400 | Sender can't cover amount + max fee |
| `MEMPOOL_FULL` | 503 | Pool is at capacity and incoming fee can't evict |
| `MEMPOOL_DUPLICATE` | 409 | Same hash already in pool or seen-set |
| `RATE_LIMITED` | 429 | Per-IP or per-key bucket exhausted |
| `KEY_REVOKED` | 401 | API key revoked |
| `KEY_EXPIRED` | 401 | API key past expiresAt |
| `NOT_FOUND` | 404 | Block/tx/account hash unknown |
| `CHAIN_ERROR` | 500 | Internal chain or state corruption |
| `BUDGET_EXCEEDED` | 503 | Agent token budget tripped (worker only) |
| `CIRCUIT_BREAKER_OPEN` | 503 | Anthropic / billing circuit breaker open (worker only) |
| `UNAVAILABLE` | 503 | Generic service-down |

## Response shape

```json
{
  "error": {
    "code": "INVALID_NONCE",
    "message": "Nonce 7 is below expected 8",
    "details": { "expectedNonce": 8, "providedNonce": 7 }
  }
}
```

`code` is the stable enum. `message` is human-readable but unstable. `details` is structured + optional.

## Rules

- Every error response carries the same shape.
- Adding new codes requires a minor API version bump (additive).
- Removing a code requires a major bump.
- Never reuse a code for a different meaning — soft-deprecate instead.

## SDK behavior

`HermeschainClient` throws `HermesApiError` with `.code`, `.message`, `.details`. Consumers do `if (err.code === 'INVALID_NONCE') retry()` instead of string matching.

## Non-goals

- No localized error messages — `message` is always English. Localization happens at the SDK consumer layer if needed.
