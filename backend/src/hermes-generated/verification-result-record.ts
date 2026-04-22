/**
 * Canonical VerificationResult shape.
 *
 * Step-2 of foundation/verification-wrappers. One struct used by both
 * AgentWorker.verifyRun and CIMonitor.probe so downstream consumers
 * (status payload, retry logic, failure logger) key off one status
 * field instead of string-matching stdout.
 */

export type VerificationStatus = 'passed' | 'failed' | 'timeout' | 'error';

export interface VerificationResult {
  readonly label: string;
  readonly command: string;
  readonly status: VerificationStatus;
  readonly passed: boolean;
  readonly exitCode: number | null;
  readonly stdout: string;
  readonly stderr: string;
  readonly durationMs: number;
}

export function makeVerificationResult(input: {
  label: string;
  command: string;
  exitCode: number | null;
  stdout: string;
  stderr: string;
  durationMs: number;
  timedOut?: boolean;
  errorReason?: string;
}): VerificationResult {
  let status: VerificationStatus;
  if (input.timedOut) {
    status = 'timeout';
  } else if (input.errorReason) {
    status = 'error';
  } else if (input.exitCode === 0) {
    status = 'passed';
  } else {
    status = 'failed';
  }

  return Object.freeze({
    label: input.label,
    command: input.command,
    status,
    passed: status === 'passed',
    exitCode: input.exitCode,
    stdout: input.stdout,
    stderr: input.stderr,
    durationMs: input.durationMs,
  });
}

/** Short headline safe for broadcast / logs. */
export function summarize(result: VerificationResult): string {
  const prefix = `[${result.status.toUpperCase()}] ${result.label}`;
  if (result.status === 'passed') {
    return `${prefix} (${result.durationMs}ms)`;
  }
  return `${prefix} — exit ${result.exitCode ?? 'n/a'}, ${result.durationMs}ms`;
}
