/**
 * Per-contract storage tree.
 *
 * Phase-3 / contract-storage / step-2. Each contract account has its
 * own MPT rooted at `account.storageRoot`. This module exposes the
 * minimal interface a VM opcode (SLOAD / SSTORE) needs; it wraps an
 * underlying MerklePatricia instance keyed by 32-byte slot.
 */

export interface StorageTree {
  /** Read a 32-byte slot value. Returns null if unset. */
  get(slot: string): string | null;
  /** Write a 32-byte slot. Empty value is equivalent to delete. */
  put(slot: string, value: string): void;
  /** Current storage root hash. */
  rootHash(): string;
  /** List of slots that have been modified in the current execution. */
  dirtySlots(): readonly string[];
  /** Revert all dirty slots to their pre-execution values. */
  revertDirty(): void;
  /** Clear the dirty set; commits persist to the account. */
  commitDirty(): void;
}

export interface StorageTreeOpts {
  initialRoot: string;
  load(slot: string): string | null;  // loads from durable store
  save(slot: string, value: string | null): void;
}

/**
 * Minimal implementation sketch — real class delegates to the MPT
 * module once its algorithm ships. Until then, a flat Map keeps the
 * VM work unblocked on state semantics.
 */
export class StorageTreeImpl implements StorageTree {
  private readonly staged = new Map<string, string>();
  private readonly snapshots = new Map<string, string | null>();
  private rootCache: string;

  constructor(private readonly opts: StorageTreeOpts) {
    this.rootCache = opts.initialRoot;
  }

  get(slot: string): string | null {
    if (this.staged.has(slot)) return this.staged.get(slot) ?? null;
    return this.opts.load(slot);
  }

  put(slot: string, value: string): void {
    if (!this.snapshots.has(slot)) {
      this.snapshots.set(slot, this.opts.load(slot));
    }
    if (value === '' || value === '0x') {
      this.staged.set(slot, '');
    } else {
      this.staged.set(slot, value);
    }
  }

  rootHash(): string {
    return this.rootCache;
  }

  dirtySlots(): readonly string[] {
    return [...this.staged.keys()];
  }

  revertDirty(): void {
    this.staged.clear();
    this.snapshots.clear();
  }

  commitDirty(): void {
    for (const [slot, value] of this.staged) {
      this.opts.save(slot, value === '' ? null : value);
    }
    this.staged.clear();
    this.snapshots.clear();
  }
}
