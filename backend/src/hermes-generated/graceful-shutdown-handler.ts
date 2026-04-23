/**
 * Graceful shutdown handler.
 *
 * Phase-8 / shutdown / step-2. On SIGTERM/SIGINT, flip readiness
 * to false, drain in-flight work, then exit. Prevents dropped
 * requests during rolling deploys.
 */

import { StructuredLogger } from './structured-logger';

export interface ShutdownHook {
  readonly name: string;
  /** Max time this hook should take, ms. The orchestrator enforces. */
  readonly timeoutMs: number;
  /** Called in registration order. */
  run(): Promise<void>;
}

export class GracefulShutdown {
  private readonly hooks: ShutdownHook[] = [];
  private ready = true;
  private shuttingDown = false;

  constructor(private readonly log: StructuredLogger) {}

  register(hook: ShutdownHook): void {
    if (this.shuttingDown) {
      throw new Error(`shutdown: can't register "${hook.name}" after shutdown started`);
    }
    this.hooks.push(hook);
  }

  isReady(): boolean {
    return this.ready && !this.shuttingDown;
  }

  attachSignalHandlers(): void {
    const signal = async (name: string) => {
      if (this.shuttingDown) return;
      this.log.info(`shutdown: received ${name}, draining`);
      this.ready = false;
      this.shuttingDown = true;

      for (const hook of this.hooks) {
        try {
          await Promise.race([
            hook.run(),
            new Promise<void>((_, reject) =>
              setTimeout(
                () => reject(new Error(`hook "${hook.name}" timed out`)),
                hook.timeoutMs,
              ),
            ),
          ]);
          this.log.info(`shutdown: hook "${hook.name}" done`);
        } catch (err) {
          this.log.error(`shutdown: hook "${hook.name}" failed`, {
            error: (err as Error).message,
          });
        }
      }

      this.log.info('shutdown: drained, exiting');
      process.exit(0);
    };

    process.on('SIGTERM', () => signal('SIGTERM'));
    process.on('SIGINT', () => signal('SIGINT'));
  }
}
