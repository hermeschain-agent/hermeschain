# WebSocket Subscription Channels

**Task:** phase-07 / websocket-subs / step-1 (design)
**Scope:** `backend/src/api/`

## Why

Wallets / explorers currently long-poll `/api/chain/head`, `/api/tx/:hash`, `/api/mempool/pending`. At N users polling every 3s, that's 3N backend queries per second for the same data. A pub/sub channel collapses it.

## Channels

| Channel | Payload | Frequency |
| --- | --- | --- |
| `chain.head` | `{height, hash, timestamp}` | every new head |
| `chain.finalized` | `{height, hash}` | every finalized block |
| `mempool.pending` | `PendingTxSummary` | every admit |
| `account.<addr>` | balance/nonce change events | per affected block |
| `tx.<hash>` | `TxStatusReport` | on status transition |

Clients subscribe with `{op:'subscribe', channel:'chain.head'}`; unsubscribe with `{op:'unsubscribe', channel}`. Server sends `{channel, data}` envelopes.

## Backpressure

If a client's outgoing buffer exceeds 1 MB (default), the server drops the slowest channel first (`mempool.pending`), then `account.*`, then disconnects. The disconnect code (4008) tells the client to reconnect with fewer subscriptions.

## Auth

Subscribing to `account.<addr>` requires no auth — account data is public. There is no private channel in this phase.

## Implementation path

Build on `ws` or `socket.io` (latter is already in the repo). Each channel registers a listener with the EventBus — the same events already flowing into SSE. A subscription map routes events to connected sockets. Keep the SSE endpoint for backwards compatibility through one release cycle.
