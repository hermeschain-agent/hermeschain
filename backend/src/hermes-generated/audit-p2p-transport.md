# Audit: P2P Transport

**Task:** phase-06 / p2p-transport / step-1 (audit)
**Scope:** `backend/src/network/`

## Current transport (HTTP gossip)

From Phase-6 block-propagation design: POST/GET endpoints for block propagation, peer registration, head query. Works for <10 validators. Every block announcement opens a fresh HTTP connection. At N peers × B blocks/min, that's N*B connection setups per minute.

## Why upgrade

At 50+ peers, HTTP setup cost dominates. TLS handshake alone is 3 RTT. For a block time target of 8s, a 4-peer announcement taking 1.5s of TLS overhead eats meaningful time.

## Target: persistent WebSocket mesh

Each validator maintains a persistent `wss://` connection to every other validator in the active set. Block announcements become single-frame pushes. Approx 3 orders of magnitude less overhead per message.

## Connection lifecycle

1. On boot or epoch change, query active set, dial every peer.
2. Maintain connection with 30s pings (keepalive); reconnect on drop with exponential backoff.
3. On block produced, emit `{type: 'block', block: ...}` to every open socket.
4. On block received, verify + admit; ack sent implicitly via subsequent chain advancement.

## Message types

```ts
type P2PMessage =
  | { type: 'block';                block: Block }
  | { type: 'view_change';          msg: ViewChangeMessage }
  | { type: 'checkpoint_attest';    att: CheckpointAttestation }
  | { type: 'tx_gossip';            tx: TransactionV1 }
  | { type: 'slashing_evidence';    ev: SlashingEvidence }
  | { type: 'ping';                 ts: number }
  | { type: 'pong';                 ts: number };
```

## Auth

WebSocket handshake includes an `X-Validator-Address` and `X-Validator-Signature` header: server signs the target URL with its ed25519 key, peer verifies against the known validator set. Rejects connections from unknown addresses.

## Non-goals

- No NAT traversal (validators are assumed to have public addresses).
- No multiplexing unrelated protocols — one validator = one WebSocket per peer.
- No encryption beyond TLS (handled at transport, not application).
