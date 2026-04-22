# Test notes: VerificationResult invariants

**Task:** foundation / verification-wrappers / step-4 (cover)
**Target:** `backend/tests/verification-result.test.ts`

## Invariants

1. `exitCode === 0 && !timedOut && !errorReason` → `status === 'passed'`, `passed === true`.
2. `exitCode !== 0` → `status === 'failed'`, `passed === false`.
3. `timedOut === true` → `status === 'timeout'` even if exit code is 0.
4. `errorReason` set → `status === 'error'` regardless of exit code.
5. Result is frozen — no mutation after construction.
6. `summarize()` includes `[PASS]` for passed results and the exit code for failures.

## Scaffolding

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  makeVerificationResult,
  summarize,
} from '../src/hermes-generated/verification-result-record';

const base = {
  label: 'backend build',
  command: 'npm run build',
  stdout: '',
  stderr: '',
  durationMs: 1000,
};

test('passed when exit 0 and no timeout/error', () => {
  const r = makeVerificationResult({ ...base, exitCode: 0 });
  assert.equal(r.status, 'passed');
  assert.equal(r.passed, true);
});

test('failed when exit non-zero', () => {
  const r = makeVerificationResult({ ...base, exitCode: 1 });
  assert.equal(r.status, 'failed');
  assert.equal(r.passed, false);
});

test('timeout overrides exit 0', () => {
  const r = makeVerificationResult({ ...base, exitCode: 0, timedOut: true });
  assert.equal(r.status, 'timeout');
  assert.equal(r.passed, false);
});

test('errorReason overrides exit 0', () => {
  const r = makeVerificationResult({ ...base, exitCode: 0, errorReason: 'enoent' });
  assert.equal(r.status, 'error');
  assert.equal(r.passed, false);
});

test('frozen', () => {
  const r = makeVerificationResult({ ...base, exitCode: 0 });
  assert.throws(() => { (r as any).status = 'failed'; });
});

test('summarize output shape', () => {
  const passed = makeVerificationResult({ ...base, exitCode: 0 });
  assert.match(summarize(passed), /^\[PASSED\] backend build \(\d+ms\)$/);
  const failed = makeVerificationResult({ ...base, exitCode: 2 });
  assert.match(summarize(failed), /^\[FAILED\] backend build — exit 2, \d+ms$/);
});
```
