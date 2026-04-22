/**
 * Typed event-emitter registry.
 *
 * Phase-6 / event-bus / step-2. Replaces ad-hoc EventEmitter usage
 * with a typed channel registry so consumers can't subscribe to a
 * non-existent channel, and event payloads are type-checked at the
 * emit site.
 */

export type ChannelMap = Record<string, (payload: any) => void>;

export class TypedEmitter<M extends ChannelMap> {
  private readonly handlers = new Map<keyof M, Set<(payload: any) => void>>();

  on<K extends keyof M>(channel: K, handler: M[K]): () => void {
    let set = this.handlers.get(channel);
    if (!set) {
      set = new Set();
      this.handlers.set(channel, set);
    }
    set.add(handler);
    return () => set!.delete(handler);
  }

  emit<K extends keyof M>(channel: K, payload: Parameters<M[K]>[0]): void {
    const set = this.handlers.get(channel);
    if (!set) return;
    for (const handler of set) {
      try {
        handler(payload);
      } catch (err) {
        // Handler errors are isolated; one bad handler doesn't stop the others.
        console.error(`[emitter] handler for "${String(channel)}" threw:`, err);
      }
    }
  }

  listenerCount(channel: keyof M): number {
    return this.handlers.get(channel)?.size ?? 0;
  }

  clear(channel?: keyof M): void {
    if (channel === undefined) {
      this.handlers.clear();
    } else {
      this.handlers.delete(channel);
    }
  }
}

/** Channel map for the chain runtime. */
export interface ChainChannels {
  'block.produced':   (block: { height: number; hash: string }) => void;
  'block.finalized':  (block: { height: number; hash: string }) => void;
  'tx.admitted':      (tx: { hash: string; from: string }) => void;
  'tx.evicted':       (tx: { hash: string; reason: string }) => void;
  'validator.joined': (v: { address: string; stake: string }) => void;
  'validator.slash':  (ev: { address: string; kind: string }) => void;
}

export const chainEmitter = new TypedEmitter<ChainChannels>();
