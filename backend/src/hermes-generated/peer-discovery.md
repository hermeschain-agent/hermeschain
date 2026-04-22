# Peer Discovery: Bootstrap Path

**Task:** phase-06 / peer-discovery / step-1 (design)
**Scope:** `backend/src/network/`

## Three discovery sources, in priority order

### 1. Static seed list

Hardcoded in `GenesisConfig.bootstrapPeers`. The smallest possible quorum that ships with the binary. A node with no other source can always start.

```ts
bootstrapPeers: [
  'https://node-a.hermeschain.xyz',
  'https://node-b.hermeschain.xyz',
  'https://node-c.hermeschain.xyz',
]
```

### 2. Operator-supplied list

`PEER_LIST` env var, comma-separated URLs. Overrides seed list. Used for private deployments and testing.

### 3. Peer-of-peer expansion

After connecting to any source-1 or source-2 peer, query `GET /api/network/peers` to learn its known peers. Add to local registry. This is the live mesh; once warmed, the static list isn't needed for the running node.

## Local registry

`PeerRegistry` (in-memory + persisted to `peers.json`):

```ts
interface KnownPeer {
  url: string;
  firstSeenMs: number;
  lastReachableMs: number | null;
  failureStreak: number;
  banUntilMs: number | null;
}
```

Reuses the backoff logic from [gossip-peer-record.ts](gossip-peer-record.ts). Capacity: 256 (FIFO eviction).

## Heartbeat

Every 60s, ping a random subset (5) of known peers via `GET /api/network/head`. Update `lastReachableMs`. A peer not reachable for 24h is dropped from the registry.

## Privacy considerations

The `peers.json` file holds URLs (no addresses, no auth tokens). Public network — leaking this is fine.
