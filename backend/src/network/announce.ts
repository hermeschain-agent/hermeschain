import { peerRegistry } from './PeerRegistry';

/**
 * On startup, announce ourselves to any peers listed in
 * HERMES_BOOTSTRAP_PEERS (comma-separated URLs). Re-announces on a
 * heartbeat so the far end doesn't mark us stale.
 */

export interface SelfIdentity {
  peerId: string;
  url: string;
  publicKey: string;
  getChainHeight: () => number;
}

const HEARTBEAT_MS = 60_000;
let heartbeatInterval: NodeJS.Timeout | null = null;

function getBootstrapUrls(): string[] {
  const raw = process.env.HERMES_BOOTSTRAP_PEERS || '';
  return raw
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

async function announceOnce(targetUrl: string, self: SelfIdentity): Promise<void> {
  try {
    const body = JSON.stringify({
      peerId: self.peerId,
      url: self.url,
      publicKey: self.publicKey,
      chainHeight: self.getChainHeight(),
    });
    const res = await fetch(`${targetUrl.replace(/\/$/, '')}/api/mesh/announce`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body,
    });
    if (!res.ok) {
      console.warn(`[MESH] announce to ${targetUrl} returned ${res.status}`);
      return;
    }
    const data: any = await res.json().catch(() => ({}));
    if (Array.isArray(data.peers)) {
      for (const p of data.peers) {
        if (p?.peerId && p.peerId !== self.peerId) {
          peerRegistry.registerPeer({
            peerId: p.peerId,
            url: p.url,
            chainHeight: Number(p.chainHeight) || 0,
            publicKey: p.publicKey || '',
          });
        }
      }
    }
  } catch (err: any) {
    console.warn(`[MESH] announce to ${targetUrl} failed:`, err?.message || err);
  }
}

export function startBootstrapHeartbeat(self: SelfIdentity): void {
  const urls = getBootstrapUrls();
  if (urls.length === 0) return;

  const tick = () => {
    for (const url of urls) void announceOnce(url, self);
    peerRegistry.evictStale();
  };

  tick();
  heartbeatInterval = setInterval(tick, HEARTBEAT_MS);
  console.log(`[MESH] announcing to ${urls.length} bootstrap peer(s) every ${HEARTBEAT_MS / 1000}s`);
}

export function stopBootstrapHeartbeat(): void {
  if (heartbeatInterval) {
    clearInterval(heartbeatInterval);
    heartbeatInterval = null;
  }
}
