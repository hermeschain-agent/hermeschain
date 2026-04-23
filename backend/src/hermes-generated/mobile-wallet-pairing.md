# Mobile Wallet Pairing

**Task:** phase-11 / mobile-wallet / step-1 (design)

## Goal

A mobile wallet app on a phone signs transactions for dApps running in a desktop browser. The phone holds the keys; the dApp never touches them.

## Pattern: WalletConnect-like session

1. dApp generates a session proposal (topic, optional metadata).
2. Encodes it as a URL: `hermes://connect?topic=<t>&relayer=<url>&pubkey=<dApp-ephemeral>`.
3. User scans URL as QR code in the mobile wallet.
4. Wallet opens a paired WebSocket connection to the relayer.
5. All subsequent signing requests travel `dApp ↔ relayer ↔ wallet` encrypted end-to-end.

## Key exchange

Diffie-Hellman: both sides generate ephemeral X25519 keypairs, exchange publics via the relayer, derive a shared symmetric key. Every message on the channel is authenticated + encrypted with this key.

The relayer sees ciphertext only.

## Message types

```ts
type WalletMessage =
  | { kind: 'session_propose'; dAppMeta: AppMeta }
  | { kind: 'session_approve'; accounts: string[] }
  | { kind: 'session_reject'; reason: string }
  | { kind: 'sign_tx_request'; tx: TransactionPayload; requestId: string }
  | { kind: 'sign_tx_response'; requestId: string; signature: string } 
  | { kind: 'sign_tx_error'; requestId: string; reason: string }
  | { kind: 'session_close' };
```

## Session lifetime

- Sessions last 7 days by default; renew on each signing op.
- User can revoke from the wallet's settings screen.
- dApp can request session close on disconnect.

## Privacy

The relayer sees topic IDs, timing, and traffic volume — but not content. A sophisticated adversary can correlate topics to dApps; no defense at this layer.

## Non-goals

- No federated relayer network (single relayer per deploy).
- No hardware-wallet bridge over this channel (dedicated HID connection).
- No cross-device session migration — scan again from the new device.
