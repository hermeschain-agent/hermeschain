/**
 * WebSocket subscription rate limits.
 *
 * Phase-7 / websocket-subs / step-2. Caps on per-connection activity
 * so a single chatty client can't dominate a server: subscription
 * count, message publish rate, and buffer size for backpressure.
 */

export interface WsLimits {
  readonly maxSubscriptions: number;
  readonly outboundBufferBytes: number;
  readonly publishesPerSec: number;
}

const DEFAULT_LIMITS: WsLimits = Object.freeze({
  maxSubscriptions: 16,
  outboundBufferBytes: 1_000_000, // 1 MB
  publishesPerSec: 200,
});

export function defaultLimits(): WsLimits {
  return DEFAULT_LIMITS;
}

export interface ConnectionState {
  subscriptions: Set<string>;
  bufferBytes: number;
  publishesThisSec: number;
  windowStartMs: number;
}

export function newConnectionState(now: number = Date.now()): ConnectionState {
  return {
    subscriptions: new Set(),
    bufferBytes: 0,
    publishesThisSec: 0,
    windowStartMs: now,
  };
}

export type AdmitResult =
  | { ok: true }
  | { ok: false; reason: string; closeCode: number };

export function admitSubscribe(
  state: ConnectionState,
  channel: string,
  limits: WsLimits,
): AdmitResult {
  if (state.subscriptions.has(channel)) {
    return { ok: false, reason: 'already subscribed', closeCode: 4000 };
  }
  if (state.subscriptions.size >= limits.maxSubscriptions) {
    return { ok: false, reason: 'subscription cap reached', closeCode: 4001 };
  }
  state.subscriptions.add(channel);
  return { ok: true };
}

export function admitPublish(
  state: ConnectionState,
  payloadBytes: number,
  limits: WsLimits,
  now: number = Date.now(),
): AdmitResult {
  if (now - state.windowStartMs >= 1000) {
    state.windowStartMs = now;
    state.publishesThisSec = 0;
  }
  state.publishesThisSec += 1;
  if (state.publishesThisSec > limits.publishesPerSec) {
    return { ok: false, reason: 'publish rate exceeded', closeCode: 4002 };
  }
  if (state.bufferBytes + payloadBytes > limits.outboundBufferBytes) {
    return { ok: false, reason: 'outbound buffer full', closeCode: 4008 };
  }
  state.bufferBytes += payloadBytes;
  return { ok: true };
}

export function onMessageFlushed(state: ConnectionState, payloadBytes: number): void {
  state.bufferBytes = Math.max(0, state.bufferBytes - payloadBytes);
}
