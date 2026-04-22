/**
 * FinalityTracker — depth-based implicit finality.
 *
 * Phase-4 / finality / step-2. Maintains a sliding window of the most
 * recent `depth` blocks. Any block older than the window is considered
 * finalized — wallets can treat its state changes as irreversible.
 *
 * A depth of 32 is the default; operators can tune via env without
 * breaking consensus since finality is a client-side concept.
 */

export interface ObservedBlock {
  readonly height: number;
  readonly hash: string;
  readonly timestamp: number;
}

export interface FinalityState {
  readonly head: number;
  readonly finalizedHeight: number;
  readonly depth: number;
}

export class FinalityTracker {
  public readonly depth: number;
  private readonly recent: ObservedBlock[] = [];
  private headHeight = -1;

  constructor(depth: number = 32) {
    if (!Number.isInteger(depth) || depth < 1) {
      throw new Error('finality: depth must be positive integer');
    }
    this.depth = depth;
  }

  /**
   * Record a new head. Returns the block that just became finalized, if any.
   * Called once per new head.
   */
  observe(block: ObservedBlock): ObservedBlock | null {
    if (block.height <= this.headHeight) {
      // duplicate or out-of-order; ignore
      return null;
    }
    this.recent.push(block);
    this.headHeight = block.height;
    if (this.recent.length > this.depth) {
      return this.recent.shift() ?? null;
    }
    return null;
  }

  finalityHeight(): number {
    if (this.headHeight < this.depth) return -1; // nothing finalized yet
    return this.headHeight - this.depth;
  }

  isFinalized(blockHeight: number): boolean {
    const line = this.finalityHeight();
    return line >= 0 && blockHeight <= line;
  }

  snapshot(): FinalityState {
    return {
      head: this.headHeight,
      finalizedHeight: this.finalityHeight(),
      depth: this.depth,
    };
  }

  /**
   * Reorg-aware reset: drops any observed block whose height exceeds `toHeight`.
   * The tracker's head snaps back to `toHeight` and the new-head callback
   * re-observes the replacement branch.
   */
  rewindTo(toHeight: number): void {
    while (this.recent.length > 0) {
      const last = this.recent[this.recent.length - 1];
      if (last.height <= toHeight) break;
      this.recent.pop();
    }
    this.headHeight = this.recent.length > 0
      ? this.recent[this.recent.length - 1].height
      : -1;
  }
}
