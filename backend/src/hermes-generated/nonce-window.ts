/**
 * Bounded-window nonce tracker.
 *
 * Phase-2 / replay-protection / step-2. Extends the existing strict
 * NonceIndex with a tunable window so clients can submit a tx for a
 * near-future nonce (e.g., pre-signing a batch). Stale nonces (below
 * expected) are always rejected — replay protection comes first.
 */

export type NonceDecision = 'accept' | 'future' | 'stale';

export interface NonceWindowState {
  readonly expected: number;
  readonly window: number;
}

export class NonceWindow {
  private expected: number;
  public readonly window: number;
  /** Set of already-accepted future nonces awaiting their turn. */
  private readonly futures = new Set<number>();

  constructor(initialExpected: number = 0, window: number = 16) {
    if (initialExpected < 0) throw new Error('nonce: initial expected must be >= 0');
    if (window < 1) throw new Error('nonce: window must be >= 1');
    this.expected = initialExpected;
    this.window = window;
  }

  /**
   * Decide what to do with a candidate nonce.
   *   - stale  → reject (already processed)
   *   - accept → admit and advance expected if it's the next one
   *   - future → admit to the future set; advance later when the gap closes
   */
  decide(nonce: number): NonceDecision {
    if (nonce < this.expected) return 'stale';
    if (nonce === this.expected) return 'accept';
    if (nonce >= this.expected + this.window) return 'stale';
    return 'future';
  }

  admit(nonce: number): NonceDecision {
    const decision = this.decide(nonce);
    if (decision === 'accept') {
      this.expected += 1;
      // Advance through any consecutive accepted futures.
      while (this.futures.delete(this.expected)) {
        this.expected += 1;
      }
    } else if (decision === 'future') {
      this.futures.add(nonce);
    }
    return decision;
  }

  snapshot(): NonceWindowState {
    return { expected: this.expected, window: this.window };
  }

  /** Used after reorg: reset expected and drop any future entries past it. */
  rewind(newExpected: number): void {
    if (newExpected < 0) throw new Error('nonce: rewind target must be >= 0');
    this.expected = newExpected;
    for (const n of [...this.futures]) {
      if (n < newExpected) this.futures.delete(n);
    }
  }
}
