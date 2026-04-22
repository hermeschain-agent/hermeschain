/**
 * StagedStateView — copy-on-write overlay over the live state.
 *
 * Phase-5 / simulation / step-2. Reads fall through to the backing
 * store. Writes stay in the overlay Map. Useful for: tx simulation,
 * speculative execution, revert handling inside a frame.
 */

export interface StateBacking {
  get(key: string): string | null;
}

export interface StagedView {
  get(key: string): string | null;
  put(key: string, value: string): void;
  delete(key: string): void;
  diff(): Array<{ key: string; before: string | null; after: string | null }>;
  discard(): void;
}

export function stageView(backing: StateBacking): StagedView {
  const overlay = new Map<string, string | null>();
  const originals = new Map<string, string | null>();

  function snapshotOriginal(key: string): void {
    if (!originals.has(key)) {
      originals.set(key, backing.get(key));
    }
  }

  return {
    get(key: string): string | null {
      if (overlay.has(key)) return overlay.get(key) ?? null;
      return backing.get(key);
    },

    put(key: string, value: string): void {
      snapshotOriginal(key);
      overlay.set(key, value);
    },

    delete(key: string): void {
      snapshotOriginal(key);
      overlay.set(key, null);
    },

    diff(): Array<{ key: string; before: string | null; after: string | null }> {
      const out: Array<{ key: string; before: string | null; after: string | null }> = [];
      for (const [key, after] of overlay) {
        const before = originals.get(key) ?? null;
        if (before === after) continue; // no-op write
        out.push({ key, before, after });
      }
      return out;
    },

    discard(): void {
      overlay.clear();
      originals.clear();
    },
  };
}
