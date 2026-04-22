/**
 * GossipPeer record for the minimal HTTP gossip layer.
 *
 * Phase-6 / block-propagation / step-2. Captures one peer's identity,
 * reachability, and recent-sync state. The ValidatorManager reads this
 * to decide which peers to announce to on a new block.
 */

export interface GossipPeer {
  readonly address: string;      // validator address
  readonly url: string;           // http(s)://host:port, no trailing slash
  readonly lastSeenMs: number | null;
  readonly lastKnownHead: number;
  readonly failureStreak: number;
  readonly banUntilMs: number | null;
}

const URL_RE = /^https?:\/\/[^\s/]+(?::\d+)?$/;

export function makePeer(input: Partial<GossipPeer> & { address: string; url: string }): GossipPeer {
  if (!input.address) throw new Error('peer: address required');
  if (!URL_RE.test(input.url)) {
    throw new Error(`peer: url must be http(s)://host[:port] with no path, got "${input.url}"`);
  }
  return Object.freeze({
    address: input.address,
    url: input.url.replace(/\/+$/, ''),
    lastSeenMs: input.lastSeenMs ?? null,
    lastKnownHead: input.lastKnownHead ?? -1,
    failureStreak: input.failureStreak ?? 0,
    banUntilMs: input.banUntilMs ?? null,
  });
}

/** A peer is available iff it's not currently banned. */
export function isAvailable(peer: GossipPeer, now = Date.now()): boolean {
  return peer.banUntilMs === null || peer.banUntilMs <= now;
}

const BACKOFF_BASE_MS = 30_000;
const BACKOFF_CAP_MS = 15 * 60 * 1000;

/** After a failed gossip attempt, compute a capped exponential backoff ban. */
export function markFailure(peer: GossipPeer, now = Date.now()): GossipPeer {
  const nextStreak = peer.failureStreak + 1;
  const banDuration = Math.min(BACKOFF_CAP_MS, BACKOFF_BASE_MS * (1 << Math.min(nextStreak, 10)));
  return makePeer({
    ...peer,
    failureStreak: nextStreak,
    banUntilMs: now + banDuration,
  });
}

/** On any success, reset failure counter and clear ban. */
export function markSuccess(peer: GossipPeer, knownHead: number, now = Date.now()): GossipPeer {
  return makePeer({
    ...peer,
    lastSeenMs: now,
    lastKnownHead: knownHead,
    failureStreak: 0,
    banUntilMs: null,
  });
}
