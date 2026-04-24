import * as fs from 'fs';
import * as path from 'path';

/**
 * HTTP-gossip peer registry. Peers announce themselves periodically;
 * anyone who hasn't reheartbeat within STALE_MS is evicted. The in-memory
 * map is authoritative; the JSON file on disk is a crash-recovery aid.
 */

export interface Peer {
  peerId: string;
  url: string;
  chainHeight: number;
  publicKey: string;
  lastSeenMs: number;
}

const DATA_DIR = path.join(process.cwd(), 'data');
const PEERS_FILE = path.join(DATA_DIR, 'peers.json');
export const STALE_MS = 180_000;

export class PeerRegistry {
  private peers = new Map<string, Peer>();

  constructor() {
    this.load();
  }

  registerPeer(input: Omit<Peer, 'lastSeenMs'>): Peer {
    const peer: Peer = { ...input, lastSeenMs: Date.now() };
    this.peers.set(peer.peerId, peer);
    this.persist();
    return peer;
  }

  listPeers(): Peer[] {
    const cutoff = Date.now() - STALE_MS;
    return Array.from(this.peers.values()).filter((p) => p.lastSeenMs >= cutoff);
  }

  allPeers(): Peer[] {
    return Array.from(this.peers.values());
  }

  getPeer(peerId: string): Peer | undefined {
    return this.peers.get(peerId);
  }

  evictStale(): number {
    const cutoff = Date.now() - STALE_MS;
    let evicted = 0;
    for (const [id, p] of this.peers.entries()) {
      if (p.lastSeenMs < cutoff) {
        this.peers.delete(id);
        evicted++;
      }
    }
    if (evicted > 0) this.persist();
    return evicted;
  }

  private load(): void {
    try {
      if (!fs.existsSync(PEERS_FILE)) return;
      const raw = fs.readFileSync(PEERS_FILE, 'utf-8');
      const list: Peer[] = JSON.parse(raw);
      for (const p of list) {
        if (p && p.peerId && p.url) this.peers.set(p.peerId, p);
      }
    } catch (err: any) {
      console.warn('[PEERS] load failed:', err?.message || err);
    }
  }

  private persist(): void {
    try {
      if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
      fs.writeFileSync(PEERS_FILE, JSON.stringify(this.allPeers(), null, 2));
    } catch (err: any) {
      console.warn('[PEERS] persist failed:', err?.message || err);
    }
  }
}

export const peerRegistry = new PeerRegistry();
