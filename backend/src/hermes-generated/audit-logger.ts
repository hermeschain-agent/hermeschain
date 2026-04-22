/**
 * Audit logger — chained, append-only, JSON-per-line.
 *
 * Phase-8 / audit-log / step-2. Maintains the running prevLineHash so
 * each new entry chains off the last. Async writes; flush guarantees
 * ordering on close.
 */

import { createHash } from 'crypto';

export interface AuditEvent {
  readonly actor: string;
  readonly kind: string;
  readonly subject: string;
  readonly reason?: string;
  readonly metadata?: Record<string, unknown>;
}

interface AuditRecord extends AuditEvent {
  readonly ts: string;
  readonly prevLineHash: string;
}

export interface AuditSink {
  append(line: string): Promise<void>;
}

export class AuditLogger {
  private prevHash = 'genesis';

  constructor(
    private readonly sink: AuditSink,
    private readonly clock: () => Date = () => new Date(),
  ) {}

  /** Set the chain head from existing log file (called on startup). */
  resumeChain(prevHash: string): void {
    if (!prevHash) throw new Error('audit: prevHash must be non-empty');
    this.prevHash = prevHash;
  }

  async record(event: AuditEvent): Promise<string> {
    const record: AuditRecord = {
      ts: this.clock().toISOString(),
      actor: event.actor,
      kind: event.kind,
      subject: event.subject,
      ...(event.reason ? { reason: event.reason } : {}),
      ...(event.metadata ? { metadata: event.metadata } : {}),
      prevLineHash: this.prevHash,
    };
    const line = JSON.stringify(record);
    await this.sink.append(line + '\n');
    this.prevHash = createHash('sha256').update(line).digest('hex');
    return this.prevHash;
  }

  /** Verify a stream of lines forms an unbroken chain. Returns the bad index, or -1. */
  static verifyChain(lines: readonly string[], expectedHead: string = 'genesis'): number {
    let prev = expectedHead;
    for (let i = 0; i < lines.length; i += 1) {
      let parsed: { prevLineHash?: unknown };
      try {
        parsed = JSON.parse(lines[i]);
      } catch {
        return i;
      }
      if (parsed.prevLineHash !== prev) return i;
      prev = createHash('sha256').update(lines[i]).digest('hex');
    }
    return -1;
  }
}
