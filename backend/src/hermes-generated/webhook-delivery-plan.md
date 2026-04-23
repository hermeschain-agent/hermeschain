# Webhook Delivery

**Task:** phase-11 / webhooks / step-1 (design)

## Why

Third-party services want push notifications: "tell me when block X is finalized", "fire on every transfer to this address". A webhook subscription lets consumers register a URL and get HTTP POSTs when matching events occur.

## Subscription shape

```ts
interface WebhookSub {
  id: string;
  url: string;
  ownerApiKey: string;     // attributes usage to the key's quota
  filter: WebhookFilter;
  secret: string;          // HMAC signing key
  createdAtMs: number;
  pausedUntilMs: number | null;
}

interface WebhookFilter {
  kind: 'block_finalized' | 'tx_to_address' | 'log_topic';
  // kind-specific: {address, topic0, topic1?, ...}
  params: Record<string, string>;
}
```

## Delivery mechanics

- Event matching runs in-process on the indexer.
- Delivery uses a bounded worker pool (`WEBHOOK_POOL_SIZE=20`).
- Retries: exponential backoff at 30s, 2m, 10m, 1h, 6h, 24h. After 6 attempts, subscription paused and owner notified.
- Timeout per call: 10s.

## Signing

Every POST carries a signature header:

```
X-Hermeschain-Signature: sha256=<hmac>
X-Hermeschain-Timestamp: <unix seconds>
```

Body is the HMAC input. Consumers verify before trusting payload. Prevents a leaked URL from being pushed bogus data.

## Rate limit per subscription

- 100 deliveries/min max.
- Overflow is queued (up to 10k events); drop-oldest once queue is full. Emits `webhook_dropped_total{sub_id}` metric.

## Opt-out

- Sub owner can `DELETE /api/webhooks/:id`.
- Abuse-detection: 429 responses from the consumer count toward `pausedUntilMs` auto-pause.
- Six consecutive 5xx responses → auto-pause for 1h.

## Non-goals

- No webhook ordering guarantee — each event fires independently.
- No replay API — dropped events stay dropped. Critical consumers use SSE/WS subscriptions instead.
- No TLS client-cert auth on outbound webhooks — HMAC is the contract.
