# RPC Endpoint Documentation Template

**Task:** phase-10 / docs-template / step-1 (docs convention)

Every HTTP endpoint in the Reference section follows this structure. Copy-paste for new endpoints.

---

## `VERB /api/...`

One-sentence summary. What does this endpoint do?

### Path parameters

| Name | Type | Description |
| --- | --- | --- |
| `:param` | `string` | What it means |

### Query parameters

| Name | Type | Default | Description |
| --- | --- | --- | --- |
| `limit` | `number` | `50` | Max items returned |

### Request body (for POST/PUT)

```json
{
  "field": "example"
}
```

| Field | Type | Required | Description |
| --- | --- | --- | --- |
| `field` | `string` | yes | What it is |

### Response (200 OK)

```json
{
  "result": "example"
}
```

| Field | Type | Description |
| --- | --- | --- |
| `result` | `string` | What it means |

### Errors

| Code | HTTP | When |
| --- | --- | --- |
| `BAD_REQUEST` | 400 | Malformed input |
| `NOT_FOUND` | 404 | Subject not found |

### Example

```bash
curl -X POST https://rpc.hermeschain.xyz/api/tx/submit \
  -H 'Content-Type: application/json' \
  -H 'Authorization: Bearer pk_live_...' \
  -d '{"tx": {...}}'
```

```ts
// via SDK
const hash = await client.sendTransaction({...});
```

### Rate limit

This endpoint counts against the standard per-key bucket. Free tier: 5 rps.

### Caching

`Cache-Control: no-store` — responses always fresh.

### Versioning

Added in `v1.0.0`. Deprecated in `v2.0.0` in favor of `...` (when applicable).

---

The template is strict — every endpoint has every section. Missing a section is a signal to go fill it in, not skip it.
