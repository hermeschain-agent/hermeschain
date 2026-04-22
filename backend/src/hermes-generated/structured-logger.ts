/**
 * Structured logger — JSON-per-line for log aggregators.
 *
 * Phase-8 / observability / step-3. Replaces free-form console.log
 * with key-value JSON so operators can filter on `level`, `subsystem`,
 * `traceId` without regex gymnastics.
 */

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const LEVEL_ORDER: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

export interface LogRecord {
  ts: string;                // ISO 8601
  level: LogLevel;
  subsystem: string;
  msg: string;
  [k: string]: unknown;
}

export class StructuredLogger {
  private readonly subsystem: string;
  private readonly minLevel: LogLevel;
  private readonly sink: (record: LogRecord) => void;

  constructor(options: {
    subsystem: string;
    minLevel?: LogLevel;
    sink?: (record: LogRecord) => void;
  }) {
    this.subsystem = options.subsystem;
    this.minLevel = options.minLevel ?? 'info';
    this.sink = options.sink ?? ((r) => console.log(JSON.stringify(r)));
  }

  child(extra: Record<string, unknown>): StructuredLogger {
    const child = new StructuredLogger({
      subsystem: this.subsystem,
      minLevel: this.minLevel,
      sink: (record) => this.sink({ ...extra, ...record }),
    });
    return child;
  }

  private shouldLog(level: LogLevel): boolean {
    return LEVEL_ORDER[level] >= LEVEL_ORDER[this.minLevel];
  }

  private emit(level: LogLevel, msg: string, fields: Record<string, unknown>): void {
    if (!this.shouldLog(level)) return;
    this.sink({
      ts: new Date().toISOString(),
      level,
      subsystem: this.subsystem,
      msg,
      ...fields,
    });
  }

  debug(msg: string, fields: Record<string, unknown> = {}): void { this.emit('debug', msg, fields); }
  info (msg: string, fields: Record<string, unknown> = {}): void { this.emit('info',  msg, fields); }
  warn (msg: string, fields: Record<string, unknown> = {}): void { this.emit('warn',  msg, fields); }
  error(msg: string, fields: Record<string, unknown> = {}): void { this.emit('error', msg, fields); }
}

export function rootLogger(subsystem: string): StructuredLogger {
  const envLevel = (process.env.LOG_LEVEL || 'info').toLowerCase() as LogLevel;
  const minLevel = (['debug', 'info', 'warn', 'error'].includes(envLevel) ? envLevel : 'info') as LogLevel;
  return new StructuredLogger({ subsystem, minLevel });
}
