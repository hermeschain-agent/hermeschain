/**
 * Bounded LRU of seen tx hashes per chain.
 *
 * Phase-2 / replay-protection / step-3 (companion to NonceWindow).
 * A reorg that rolls the account state back to a pre-tx nonce would
 * otherwise let an attacker replay the same tx if the pool hadn't
 * seen it recently. This set remembers tx hashes across the last N
 * blocks regardless of nonce state.
 *
 * Keyed by `chainIdHash + txHash` so one node can participate in
 * multiple chains without cross-talk.
 */

export interface SeenTxEntry {
  readonly txHash: string;
  readonly chainIdHash: string;
  readonly firstSeenHeight: number;
  readonly firstSeenMs: number;
}

export class SeenTxSet {
  private readonly capacity: number;
  private readonly order: string[] = [];
  private readonly map = new Map<string, SeenTxEntry>();

  constructor(capacity: number = 10_000) {
    if (capacity < 1) throw new Error('seen-tx: capacity must be >= 1');
    this.capacity = capacity;
  }

  private key(chainIdHash: string, txHash: string): string {
    return `${chainIdHash}:${txHash}`;
  }

  has(chainIdHash: string, txHash: string): boolean {
    return this.map.has(this.key(chainIdHash, txHash));
  }

  remember(entry: SeenTxEntry): void {
    const k = this.key(entry.chainIdHash, entry.txHash);
    if (this.map.has(k)) return; // idempotent
    this.map.set(k, entry);
    this.order.push(k);
    while (this.order.length > this.capacity) {
      const evicted = this.order.shift();
      if (evicted !== undefined) this.map.delete(evicted);
    }
  }

  size(): number {
    return this.map.size;
  }

  /** Used by reorg recovery: drop any entry whose firstSeenHeight > after. */
  rewindTo(height: number): void {
    const survivors = this.order.filter((k) => {
      const entry = this.map.get(k);
      if (!entry) return false;
      if (entry.firstSeenHeight > height) {
        this.map.delete(k);
        return false;
      }
      return true;
    });
    this.order.length = 0;
    this.order.push(...survivors);
  }
}
