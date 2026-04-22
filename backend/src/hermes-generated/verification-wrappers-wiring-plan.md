# Wiring plan: VerificationResult through verifyRun + CIMonitor

**Task:** foundation / verification-wrappers / step-3 (wire canonical)
**Depends on:** [verification-result-record.ts](verification-result-record.ts)

## Unified shape at the call sites

### `AgentWorker.verifyRun(selection, changedFiles)`

Before:
```ts
return { passed: exitCode === 0, output: mergedOut, exitCode };
```

After:
```ts
import { makeVerificationResult } from '../hermes-generated/verification-result-record';

return makeVerificationResult({
  label: selection.verification.label,
  command: selection.verification.command,
  exitCode,
  stdout,
  stderr,
  durationMs,
  timedOut,
});
```

### `CIMonitor.probe()` — returns `VerificationResult[]`

One entry per check (`tsc`, `eslint`, `jest`). The old per-tool object-with-enum mapping collapses into a flat array.

## Consumer updates

- `AgentWorker.handleFailedRun` — keys off `result.status === 'timeout'` to decide retry-with-bigger-timeout vs retry-as-is.
- `TaskSources.retryDelay` — `timeout` gets a 2x delay multiplier; `error` (setup failure) gets no retry.
- `/api/agent/status` — `verificationStatus` field becomes `result.status` verbatim.
- Frontend terminal — `[PASS] label (312ms)` and `[FAIL] label — exit 1, 450ms` readouts from `summarize(result)`.

## Uniform timeout

Read `AGENT_VERIFY_TIMEOUT_MS` (default 10 min) in one place. Both callers honor it, and `summarize()` shows the duration so operators can tune.
