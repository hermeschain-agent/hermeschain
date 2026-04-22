/**
 * StateCheckpoint ring buffer.
 *
 * Phase-4 / reorg / step-2. Holds the last REORG_DEPTH checkpoints
 * for fast reorg rollback. Finalized blocks (past the depth window)
 * are discarded — no rollback past finality.
 */

export interface StateCheckpoint {
  readonly blockHeight: number;
  readonly blockHash: string;
  readonly stateRoot: string;
  readonly dirtyKeys: readonly string[];
  readonly prevValues: ReadonlyMap<string, string | null>;
  readonly reAdmittedTxHashes: readonly string[];
}

export class CheckpointRing {
  private readonly ring: StateCheckpoint[] = [];

  constructor(public readonly capacity: number = 32) {
    if (capacity < 1) throw new Error('checkpoint-ring: capacity >= 1');
  }

  push(cp: StateCheckpoint): void {
    this.ring.push(cp);
    if (this.ring.length > this.capacity) {
      this.ring.shift();
    }
  }

  /** Return checkpoints from the ring with height > target, in reverse order
   *  (most recent first) so a caller can revert them sequentially. */
  rollbackPlan(targetHeight: number): StateCheckpoint[] {
    const plan: StateCheckpoint[] = [];
    for (let i = this.ring.length - 1; i >= 0; i -= 1) {
      const cp = this.ring[i];
      if (cp.blockHeight <= targetHeight) break;
      plan.push(cp);
    }
    return plan;
  }

  /** Drop entries up to and including targetHeight. Called on rollback confirm. */
  truncateAbove(targetHeight: number): void {
    while (this.ring.length > 0 && this.ring[this.ring.length - 1].blockHeight > targetHeight) {
      this.ring.pop();
    }
  }

  /** Lowest height currently held. -1 if empty. */
  minHeight(): number {
    return this.ring.length > 0 ? this.ring[0].blockHeight : -1;
  }

  size(): number {
    return this.ring.length;
  }
}
