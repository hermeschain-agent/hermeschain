# Multi-Tenant RPC

**Task:** phase-07 / multi-tenant / step-1 (design)

## Why

Public RPC endpoints get hammered. A single noisy consumer (broken bot, scraping crawler) can hog rate-limit budget and starve legitimate users. Multi-tenancy lets us issue per-API-key budgets and bill (or revoke) abusers without affecting everyone.

## API key shape

```ts
interface ApiKey {
  id: string;                    // 'pk_live_abcd1234'
  ownerEmail: string;
  tier: 'free' | 'starter' | 'pro';
  createdAtMs: number;
  expiresAtMs: number | null;
  revokedAt: number | null;
}
```

Tiers map to limits:

| Tier | RPS | Daily req cap | Burst |
| --- | --- | --- | --- |
| free | 5 | 50,000 | 25 |
| starter | 50 | 1,000,000 | 200 |
| pro | 500 | unlimited | 2,000 |

## Header

`Authorization: Bearer pk_live_<key>` or `X-API-Key: pk_live_<key>`. Missing header → free tier with IP-based bucketing.

## Quota enforcement

Reuse the `TokenBucketLimiter` per-key (replacing per-IP for keyed traffic). Daily caps tracked in Redis with a midnight UTC reset.

## Issue + revoke

- `hermes admin keys create --owner email --tier starter` — operator only.
- `hermes admin keys revoke <key-id>` — immediate; cached as `revoked-keys` set.
- Revoked keys return HTTP 401 + body `{error: 'key_revoked'}`.

## Per-key observability

- `hermes_api_requests_total{key_id, route}` — usage attribution.
- `hermes_api_quota_used_basis_points{key_id}` — % of daily cap.
- `hermes_api_throttled_total{key_id}` — 429 events.

## Non-goals

- No payment integration in this rev — tier is set by operator.
- No usage-based billing — flat tier cost only.
- No multi-key-per-owner — one owner, many keys is a follow-up.
