# Audit: Verification Wrappers

**Task:** foundation / verification-wrappers / step-1 (audit)
**Scope:** `backend/src/agent/`, `backend/tests/`

## Current verification surfaces

| Caller | What it runs | Result shape |
| --- | --- | --- |
| `AgentWorker.verifyRun()` | shells out `npm run build` / `npm run test` per task's `verification.command` | `{ passed, output, exitCode }` |
| `CIMonitor.probe()` | shells `tsc --noEmit`, `eslint`, `jest` on a timer | `{ tsc, eslint, jest }` classified |
| `TaskBacklog` blueprint | declares `verification: { label, command, cwd }` | just metadata |

## Drift

- `verifyRun` inspects `result.exitCode === 0` but captures stderr mixed with stdout — a test run with benign warnings can look identical to a pass.
- `CIMonitor` and `verifyRun` don't share a format. Same failure (e.g., a `tsc` error) produces `{ passed: false, output: "..." }` in one and `{ tsc: 'failed', details: [...] }` in the other.
- No structured error type. A failed build returns a raw stdout blob; the agent has to string-match to decide "did the build fail" vs "did it not even start".
- Timeouts aren't uniform. `verifyRun` inherits child-process defaults; `CIMonitor` has its own `timeoutMs` env. Two tasks can time out at different bounds for the same command.

## Contract step-2 will lock

`VerificationResult`:
```
interface VerificationResult {
  label: string;
  passed: boolean;
  status: 'passed' | 'failed' | 'timeout' | 'error';
  exitCode: number | null;
  stdout: string;
  stderr: string;
  durationMs: number;
  command: string;
}
```

Both `verifyRun` and `CIMonitor` return this shape. String-matching goes away; the agent checks `result.status`.
