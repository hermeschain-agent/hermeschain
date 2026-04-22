/**
 * Bounded event queue with tiered drop policy.
 *
 * Phase-7 / backpressure / step-2. Shared by SSE and WebSocket
 * subscribers so the drop policy is consistent across channels.
 */

export type EventPriority = 'critical' | 'normal' | 'low';

export interface QueuedEvent {
  readonly type: string;
  readonly payload: string;       // already serialized (JSON string)
  readonly priority: EventPriority;
  readonly coalesceKey?: string;  // if set, replaces prior queued event with same key
  readonly enqueueMs: number;
}

export interface QueueOpts {
  readonly maxEvents: number;
  readonly maxBytes: number;
}

const DEFAULT_OPTS: QueueOpts = Object.freeze({
  maxEvents: 256,
  maxBytes: 512 * 1024,
});

export class BoundedEventQueue {
  private readonly buffer: QueuedEvent[] = [];
  private bytes = 0;
  public dropCount = 0;
  public coalesceCount = 0;
  public readonly opts: QueueOpts;

  constructor(opts?: Partial<QueueOpts>) {
    this.opts = { ...DEFAULT_OPTS, ...opts };
  }

  enqueue(event: QueuedEvent): 'ok' | 'dropped' | 'disconnect' {
    if (event.coalesceKey) {
      const existing = this.buffer.findIndex((e) => e.coalesceKey === event.coalesceKey);
      if (existing >= 0) {
        this.bytes -= this.buffer[existing].payload.length;
        this.buffer[existing] = event;
        this.bytes += event.payload.length;
        this.coalesceCount += 1;
        return 'ok';
      }
    }

    // Overflow path: drop low-priority events first.
    while (
      this.buffer.length >= this.opts.maxEvents ||
      this.bytes + event.payload.length > this.opts.maxBytes
    ) {
      const dropIdx = this.buffer.findIndex((e) => e.priority === 'low');
      if (dropIdx < 0) break;
      this.bytes -= this.buffer[dropIdx].payload.length;
      this.buffer.splice(dropIdx, 1);
      this.dropCount += 1;
    }

    // Still over? Try normal-priority.
    while (
      event.priority === 'critical' &&
      (this.buffer.length >= this.opts.maxEvents ||
       this.bytes + event.payload.length > this.opts.maxBytes)
    ) {
      const dropIdx = this.buffer.findIndex((e) => e.priority === 'normal');
      if (dropIdx < 0) break;
      this.bytes -= this.buffer[dropIdx].payload.length;
      this.buffer.splice(dropIdx, 1);
      this.dropCount += 1;
    }

    // Still can't fit? Disconnect signal.
    if (
      this.buffer.length >= this.opts.maxEvents * 2 ||
      this.bytes + event.payload.length > this.opts.maxBytes * 2
    ) {
      return 'disconnect';
    }

    if (
      this.buffer.length >= this.opts.maxEvents ||
      this.bytes + event.payload.length > this.opts.maxBytes
    ) {
      this.dropCount += 1;
      return 'dropped';
    }

    this.buffer.push(event);
    this.bytes += event.payload.length;
    return 'ok';
  }

  drain(): QueuedEvent[] {
    const out = [...this.buffer];
    this.buffer.length = 0;
    this.bytes = 0;
    return out;
  }

  size(): number {
    return this.buffer.length;
  }
}
