/**
 * Landing-page showcase stream.
 *
 * Runs a rotating catalogue of agent workstreams through the existing terminal
 * renderer. Used to keep the landing hero terminal visually alive during
 * quiet periods between real worker pushes — the terminal looks the same
 * whether the events are arriving from the worker's SSE channel or from the
 * local showcase loop, since both funnel through the same callback surface.
 *
 * The loop is strictly a frontend concern. It never touches the network
 * and consumes no server-side resources. Any incoming real-stream event
 * preempts it immediately via `pause()`.
 */

import type { Dispatch, SetStateAction } from 'react';

type AgentMode = 'disabled' | 'demo' | 'real';
type TaskRunStatus =
  | 'idle'
  | 'queued'
  | 'selected'
  | 'analyzing'
  | 'executing'
  | 'verifying'
  | 'succeeded'
  | 'failed'
  | 'blocked'
  | 'discarded';
type VerificationStatus =
  | 'pending'
  | 'running'
  | 'passed'
  | 'failed'
  | 'not_applicable';

interface ShowcaseTask {
  id: string;
  title: string;
  type: string;
  agent: string;
}

interface ShowcaseState {
  isWorking: boolean;
  currentTask: ShowcaseTask | null;
  runStatus: TaskRunStatus;
  verificationStatus: VerificationStatus;
  mode: AgentMode;
  streamMode: AgentMode;
  [key: string]: unknown;
}

export interface AmbientCallbacks {
  appendText(text: string): void;
  resetOutput(): void;
  patchState(updater: (prev: any) => any): void;
}

interface Script {
  id: string;
  title: string;
  type: string;
  agent: string;
  scope: string;
  steps: ScriptStep[];
}

type ScriptStep =
  | { kind: 'line'; text: string; delay?: number }
  | { kind: 'tool'; tool: string; path?: string; pattern?: string; delay?: number }
  | { kind: 'result'; text: string; delay?: number }
  | { kind: 'analysis'; text: string; delay?: number }
  | { kind: 'file'; path: string; language: string; code: string; delay?: number }
  | { kind: 'verify'; label: string; delay?: number }
  | { kind: 'pass'; label: string; delay?: number }
  | { kind: 'done'; text: string; delay?: number }
  | { kind: 'pause'; ms: number };

const SCRIPTS: Script[] = [
  {
    id: 'chain:nonce-tracking',
    title: 'Add transaction nonce tracking',
    type: 'build',
    agent: 'HERMES',
    scope: 'backend/src/blockchain/',
    steps: [
      { kind: 'line', text: '> context_pack :: 4 files, 312 lines' },
      { kind: 'tool', tool: 'read_file', path: 'backend/src/blockchain/TransactionPool.ts' },
      { kind: 'result', text: 'read backend/src/blockchain/TransactionPool.ts (5.2 KB)' },
      { kind: 'analysis', text: 'Pool tracks hashes but no per-account nonce. Replays are possible.' },
      { kind: 'tool', tool: 'search_code', pattern: 'nonce' },
      { kind: 'result', text: '3 matches in Block.ts, StateManager.ts' },
      { kind: 'tool', tool: 'read_file', path: 'backend/src/blockchain/StateManager.ts' },
      { kind: 'result', text: 'read backend/src/blockchain/StateManager.ts (7.8 KB)' },
      { kind: 'line', text: '' },
      { kind: 'analysis', text: 'Plan: attach `nextNonce` to AccountState, reject tx if nonce <= last.' },
      { kind: 'tool', tool: 'write_file', path: 'backend/src/blockchain/NonceIndex.ts' },
      {
        kind: 'file',
        path: 'backend/src/blockchain/NonceIndex.ts',
        language: 'typescript',
        code:
`import { Address } from './types';

export class NonceIndex {
  private nextNonce = new Map<string, number>();

  expected(address: Address): number {
    return this.nextNonce.get(address) ?? 0;
  }

  accept(address: Address, nonce: number): boolean {
    const expected = this.expected(address);
    if (nonce !== expected) return false;
    this.nextNonce.set(address, expected + 1);
    return true;
  }

  rewind(address: Address, to: number): void {
    this.nextNonce.set(address, to);
  }
}
`,
      },
      { kind: 'result', text: 'wrote backend/src/blockchain/NonceIndex.ts (+24 lines)' },
      { kind: 'verify', label: 'backend build' },
      { kind: 'pause', ms: 1400 },
      { kind: 'pass', label: 'backend build :: tsc 0 errors' },
      { kind: 'done', text: 'committed feat(chain): add transaction nonce tracking' },
    ],
  },
  {
    id: 'chain:merkle-patricia',
    title: 'Implement proper Merkle Patricia Trie',
    type: 'build',
    agent: 'HERMES',
    scope: 'backend/src/blockchain/',
    steps: [
      { kind: 'line', text: '> context_pack :: 2 files, 180 lines' },
      { kind: 'tool', tool: 'read_file', path: 'backend/src/blockchain/StateManager.ts' },
      { kind: 'result', text: 'read backend/src/blockchain/StateManager.ts (7.8 KB)' },
      { kind: 'analysis', text: 'Current state root is a flat sha256 hash. Need prefix-trie for proofs.' },
      { kind: 'tool', tool: 'list_files', path: 'backend/src/blockchain' },
      { kind: 'result', text: '11 entries' },
      { kind: 'tool', tool: 'write_file', path: 'backend/src/blockchain/MerklePatricia.ts' },
      {
        kind: 'file',
        path: 'backend/src/blockchain/MerklePatricia.ts',
        language: 'typescript',
        code:
`import { createHash } from 'crypto';

type Nibble = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 | 13 | 14 | 15;
type Node =
  | { kind: 'branch'; children: Array<Node | null>; value: Uint8Array | null }
  | { kind: 'leaf'; key: Nibble[]; value: Uint8Array }
  | { kind: 'extension'; key: Nibble[]; child: Node };

export class MerklePatricia {
  private root: Node | null = null;

  put(key: Uint8Array, value: Uint8Array): void {
    this.root = this.insert(this.root, toNibbles(key), value);
  }

  get(key: Uint8Array): Uint8Array | null {
    return this.lookup(this.root, toNibbles(key));
  }

  rootHash(): string {
    return this.root ? hashNode(this.root) : 'EMPTY';
  }
  // ...implementation elided for brevity
}
`,
      },
      { kind: 'result', text: 'wrote backend/src/blockchain/MerklePatricia.ts (+118 lines)' },
      { kind: 'verify', label: 'backend build' },
      { kind: 'pause', ms: 1800 },
      { kind: 'pass', label: 'backend build :: tsc 0 errors' },
      { kind: 'done', text: 'committed feat(state): implement proper Merkle Patricia Trie' },
    ],
  },
  {
    id: 'crypto:ed25519-verify',
    title: 'Audit ed25519 signature verification',
    type: 'audit',
    agent: 'HERMES',
    scope: 'backend/src/blockchain/',
    steps: [
      { kind: 'line', text: '> context_pack :: signature paths' },
      { kind: 'tool', tool: 'read_file', path: 'backend/src/blockchain/Crypto.ts' },
      { kind: 'result', text: 'read backend/src/blockchain/Crypto.ts (4.1 KB)' },
      { kind: 'tool', tool: 'search_code', pattern: 'verifyTransactionSignature' },
      { kind: 'result', text: '5 call-sites found' },
      { kind: 'analysis', text: 'Verifier accepts malleable signatures; should enforce low-s form.' },
      { kind: 'tool', tool: 'read_file', path: 'backend/src/blockchain/TransactionPool.ts' },
      { kind: 'result', text: 'read backend/src/blockchain/TransactionPool.ts (5.2 KB)' },
      { kind: 'tool', tool: 'write_file', path: 'backend/src/hermes-generated/ed25519-audit.md' },
      {
        kind: 'file',
        path: 'backend/src/hermes-generated/ed25519-audit.md',
        language: 'markdown',
        code:
`# ed25519 Signature Verification Audit

## Findings
- verifyTransactionSignature accepts the high-s form. Malleability risk.
- No length check on publicKey (32 byte enforcement missing).
- Replay window is unbounded; add nonce / chain-id binding.

## Recommended fix
Pin to @noble/ed25519, canonicalise the s value, reject any signature
where s >= L/2. Bind chain-id into the message prefix.
`,
      },
      { kind: 'result', text: 'wrote backend/src/hermes-generated/ed25519-audit.md (+14 lines)' },
      { kind: 'verify', label: 'artifact present' },
      { kind: 'pause', ms: 900 },
      { kind: 'pass', label: 'artifact present :: 1 file' },
      { kind: 'done', text: 'committed docs(security): audit ed25519 signature verification' },
    ],
  },
  {
    id: 'vm:gas-metering',
    title: 'Add gas metering to VM',
    type: 'build',
    agent: 'HERMES',
    scope: 'backend/src/vm/',
    steps: [
      { kind: 'tool', tool: 'list_files', path: 'backend/src/vm' },
      { kind: 'result', text: '6 files' },
      { kind: 'tool', tool: 'read_file', path: 'backend/src/vm/Interpreter.ts' },
      { kind: 'result', text: 'read backend/src/vm/Interpreter.ts (9.4 KB)' },
      { kind: 'analysis', text: 'Opcodes execute without cost. Need per-opcode gas + out-of-gas halt.' },
      { kind: 'tool', tool: 'write_file', path: 'backend/src/vm/GasSchedule.ts' },
      {
        kind: 'file',
        path: 'backend/src/vm/GasSchedule.ts',
        language: 'typescript',
        code:
`export const GAS: Record<string, number> = {
  PUSH: 3, POP: 2,
  ADD: 3, MUL: 5, DIV: 5, MOD: 5,
  SLOAD: 800, SSTORE: 20000,
  KECCAK256: 30, SHA256: 60,
  CALL: 700, RETURN: 0,
  REVERT: 0, STOP: 0,
};

export class GasMeter {
  constructor(private remaining: number) {}
  consume(op: string): void {
    const cost = GAS[op] ?? 1;
    if (this.remaining < cost) throw new Error('out of gas');
    this.remaining -= cost;
  }
  left(): number { return this.remaining; }
}
`,
      },
      { kind: 'result', text: 'wrote backend/src/vm/GasSchedule.ts (+20 lines)' },
      { kind: 'verify', label: 'backend build' },
      { kind: 'pause', ms: 1500 },
      { kind: 'pass', label: 'backend build :: tsc 0 errors' },
      { kind: 'done', text: 'committed feat(vm): add gas metering to VM' },
    ],
  },
  {
    id: 'api:getbalance-rpc',
    title: 'Add getBalance RPC method',
    type: 'build',
    agent: 'HERMES',
    scope: 'backend/src/api/',
    steps: [
      { kind: 'tool', tool: 'read_file', path: 'backend/src/api/server.ts' },
      { kind: 'result', text: 'read backend/src/api/server.ts (52 KB)' },
      { kind: 'tool', tool: 'search_code', pattern: 'accountBalance' },
      { kind: 'result', text: '2 matches in StateManager.ts' },
      { kind: 'tool', tool: 'write_file', path: 'backend/src/api/rpc/getBalance.ts' },
      {
        kind: 'file',
        path: 'backend/src/api/rpc/getBalance.ts',
        language: 'typescript',
        code:
`import { Request, Response } from 'express';
import { stateManager } from '../../blockchain/StateManager';

export async function getBalance(req: Request, res: Response): Promise<void> {
  const address = String(req.params.address || '').trim();
  if (!/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(address)) {
    res.status(400).json({ error: 'invalid address' });
    return;
  }
  const account = await stateManager.getAccount(address);
  res.json({
    address,
    balance: account?.balance.toString() ?? '0',
    nonce: account?.nonce ?? 0,
  });
}
`,
      },
      { kind: 'result', text: 'wrote backend/src/api/rpc/getBalance.ts (+17 lines)' },
      { kind: 'verify', label: 'backend build' },
      { kind: 'pause', ms: 1400 },
      { kind: 'pass', label: 'backend build :: tsc 0 errors' },
      { kind: 'done', text: 'committed feat(api): add getBalance RPC method' },
    ],
  },
  {
    id: 'faucet:rate-limit',
    title: 'Add faucet rate limiting',
    type: 'build',
    agent: 'HERMES',
    scope: 'backend/src/api/',
    steps: [
      { kind: 'tool', tool: 'read_file', path: 'backend/src/api/wallet.ts' },
      { kind: 'result', text: 'read backend/src/api/wallet.ts (6.1 KB)' },
      { kind: 'analysis', text: 'Faucet endpoint has no per-address or per-IP throttling.' },
      { kind: 'tool', tool: 'write_file', path: 'backend/src/api/faucetRateLimit.ts' },
      {
        kind: 'file',
        path: 'backend/src/api/faucetRateLimit.ts',
        language: 'typescript',
        code:
`const WINDOW_MS = 24 * 60 * 60 * 1000;
const DROPS_PER_WINDOW = 1;

const lastDrop = new Map<string, number>();

export function canClaim(key: string, now = Date.now()): boolean {
  const previous = lastDrop.get(key) ?? 0;
  if (now - previous < WINDOW_MS / DROPS_PER_WINDOW) return false;
  lastDrop.set(key, now);
  return true;
}

export function resetFaucetState(): void {
  lastDrop.clear();
}
`,
      },
      { kind: 'result', text: 'wrote backend/src/api/faucetRateLimit.ts (+13 lines)' },
      { kind: 'verify', label: 'backend build' },
      { kind: 'pause', ms: 1300 },
      { kind: 'pass', label: 'backend build :: tsc 0 errors' },
      { kind: 'done', text: 'committed feat(faucet): add per-address rate limit' },
    ],
  },
  {
    id: 'chain:finality',
    title: 'Create block finality mechanism',
    type: 'build',
    agent: 'HERMES',
    scope: 'backend/src/blockchain/',
    steps: [
      { kind: 'tool', tool: 'read_file', path: 'backend/src/blockchain/Chain.ts' },
      { kind: 'result', text: 'read backend/src/blockchain/Chain.ts (11.2 KB)' },
      { kind: 'analysis', text: 'Blocks commit immediately; no finality depth. Reorgs cross committed state.' },
      { kind: 'tool', tool: 'write_file', path: 'backend/src/blockchain/Finality.ts' },
      {
        kind: 'file',
        path: 'backend/src/blockchain/Finality.ts',
        language: 'typescript',
        code:
`import { Block } from './Block';

export class FinalityTracker {
  private readonly depth: number;
  private readonly recent: Block[] = [];

  constructor(depth = 32) { this.depth = depth; }

  observe(block: Block): Block | null {
    this.recent.push(block);
    if (this.recent.length <= this.depth) return null;
    return this.recent.shift() ?? null;
  }

  finalityHeight(headHeight: number): number {
    return Math.max(0, headHeight - this.depth);
  }
}
`,
      },
      { kind: 'result', text: 'wrote backend/src/blockchain/Finality.ts (+16 lines)' },
      { kind: 'verify', label: 'backend build' },
      { kind: 'pause', ms: 1400 },
      { kind: 'pass', label: 'backend build :: tsc 0 errors' },
      { kind: 'done', text: 'committed feat(chain): create block finality mechanism' },
    ],
  },
  {
    id: 'agent:cimonitor-tests',
    title: 'Write unit tests for CIMonitor',
    type: 'test',
    agent: 'HERMES',
    scope: 'backend/tests/',
    steps: [
      { kind: 'tool', tool: 'read_file', path: 'backend/src/agent/CIMonitor.ts' },
      { kind: 'result', text: 'read backend/src/agent/CIMonitor.ts (8.9 KB)' },
      { kind: 'tool', tool: 'list_files', path: 'backend/tests' },
      { kind: 'result', text: '3 files' },
      { kind: 'tool', tool: 'write_file', path: 'backend/tests/ci-monitor.test.js' },
      {
        kind: 'file',
        path: 'backend/tests/ci-monitor.test.js',
        language: 'javascript',
        code:
`const { test } = require('node:test');
const assert = require('node:assert/strict');
const { CIMonitor } = require('../dist/agent/CIMonitor');

test('CIMonitor.classify bucketizes build vs lint failures', () => {
  const monitor = new CIMonitor({ watch: [] });
  assert.equal(monitor.classify('tsc ... error TS2304'), 'build');
  assert.equal(monitor.classify('eslint 1 problem'), 'lint');
  assert.equal(monitor.classify('jest 2 failing'), 'test');
});

test('CIMonitor.shouldSkip honors cooldown window', () => {
  const monitor = new CIMonitor({ cooldownMs: 1000 });
  monitor.recordFailure('build');
  assert.equal(monitor.shouldSkip('build'), true);
});
`,
      },
      { kind: 'result', text: 'wrote backend/tests/ci-monitor.test.js (+16 lines)' },
      { kind: 'verify', label: 'backend tests' },
      { kind: 'pause', ms: 1200 },
      { kind: 'pass', label: 'backend tests :: 2 passing' },
      { kind: 'done', text: 'committed test(agent): unit tests for CIMonitor' },
    ],
  },
];

const TYPE_WORDS_PER_TICK = 2;
const MIN_STEP_DELAY = 380;
const MAX_STEP_DELAY = 1600;
const INTER_SCRIPT_DELAY = 3500;
const YIELD_WINDOW_MS = 30_000; // how long to stay quiet after a real event

function randomDelay(min: number, max: number): number {
  return Math.floor(min + Math.random() * (max - min));
}

function stepDelay(step: ScriptStep): number {
  if (step.kind === 'pause') return step.ms;
  if ('delay' in step && typeof step.delay === 'number') return step.delay;
  if (step.kind === 'file') return 1200;
  if (step.kind === 'verify') return 600;
  if (step.kind === 'pass') return 400;
  if (step.kind === 'done') return 900;
  return randomDelay(MIN_STEP_DELAY, MAX_STEP_DELAY);
}

function pickNextScript(lastId: string | null): Script {
  const candidates = SCRIPTS.filter((s) => s.id !== lastId);
  const pool = candidates.length ? candidates : SCRIPTS;
  return pool[Math.floor(Math.random() * pool.length)];
}

function shortOutput(text: string, max = 800): string {
  if (text.length <= max) return text;
  return `${text.slice(0, max)}\n... truncated ${text.length - max} chars ...`;
}

/**
 * Stream a string character-at-a-time through the append callback so the
 * existing typewriter effect renders it. Uses async pause to keep the browser
 * responsive for other work.
 */
async function typeOut(
  callbacks: AmbientCallbacks,
  text: string,
  shouldStop: () => boolean,
): Promise<void> {
  const chunks = text.match(/.{1,4}/g) || [];
  for (const chunk of chunks) {
    if (shouldStop()) return;
    callbacks.appendText(chunk);
    await sleep(12 + Math.random() * 18);
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function runAmbientStream(callbacks: AmbientCallbacks): {
  stop: () => void;
  pause: () => void;
} {
  let stopped = false;
  let yieldUntil = 0;

  const stop = () => {
    stopped = true;
  };

  const pause = () => {
    yieldUntil = Date.now() + YIELD_WINDOW_MS;
  };

  const shouldStop = () => stopped;
  const shouldYield = () => Date.now() < yieldUntil;

  const waitForTurn = async () => {
    while (!shouldStop() && shouldYield()) {
      await sleep(1000);
    }
  };

  const runScript = async (script: Script): Promise<void> => {
    callbacks.resetOutput();
    callbacks.patchState((prev: ShowcaseState) => ({
      ...prev,
      mode: 'real',
      streamMode: 'real',
      isWorking: true,
      runStatus: 'selected',
      verificationStatus: 'pending',
      currentTask: {
        id: script.id,
        title: script.title,
        type: script.type,
        agent: script.agent,
      },
      blockedReason: null,
      lastFailure: null,
    }));

    await typeOut(
      callbacks,
      `$ begin_task :: ${script.title}\n`,
      shouldStop,
    );
    await sleep(280);

    callbacks.patchState((prev: ShowcaseState) => ({
      ...prev,
      runStatus: 'analyzing',
    }));
    await typeOut(callbacks, '\n> [ANALYSIS] evidence_attached\n', shouldStop);

    for (const step of script.steps) {
      if (shouldStop()) return;
      await waitForTurn();
      if (shouldStop()) return;

      switch (step.kind) {
        case 'line':
          await typeOut(callbacks, `${step.text}\n`, shouldStop);
          break;
        case 'tool': {
          const args = step.path
            ? ` ${step.path}`
            : step.pattern
              ? ` pattern=${step.pattern}`
              : '';
          await typeOut(
            callbacks,
            `\n> [TOOL] ${step.tool}${args}\n`,
            shouldStop,
          );
          break;
        }
        case 'result':
          await typeOut(callbacks, `> [RESULT] ${step.text}\n`, shouldStop);
          break;
        case 'analysis':
          await typeOut(
            callbacks,
            `\n> [ANALYSIS] ${step.text}\n`,
            shouldStop,
          );
          break;
        case 'file':
          callbacks.patchState((prev: ShowcaseState) => ({
            ...prev,
            runStatus: 'executing',
          }));
          await typeOut(
            callbacks,
            `\n[FILE] ${step.path}\n\`\`\`${step.language}\n${shortOutput(step.code, 1600)}\n\`\`\`\n`,
            shouldStop,
          );
          break;
        case 'verify':
          callbacks.patchState((prev: ShowcaseState) => ({
            ...prev,
            runStatus: 'verifying',
            verificationStatus: 'running',
          }));
          await typeOut(callbacks, `\n> [VERIFY] ${step.label}\n`, shouldStop);
          break;
        case 'pass':
          callbacks.patchState((prev: ShowcaseState) => ({
            ...prev,
            verificationStatus: 'passed',
          }));
          await typeOut(callbacks, `> [PASS] ${step.label}\n`, shouldStop);
          break;
        case 'done':
          callbacks.patchState((prev: ShowcaseState) => ({
            ...prev,
            runStatus: 'succeeded',
            isWorking: false,
          }));
          await typeOut(callbacks, `\n> [DONE] ${step.text}\n`, shouldStop);
          break;
        case 'pause':
          // just wait
          break;
      }

      await sleep(stepDelay(step));
    }
  };

  const loop = async () => {
    let lastId: string | null = null;
    while (!shouldStop()) {
      await waitForTurn();
      if (shouldStop()) return;

      const script = pickNextScript(lastId);
      lastId = script.id;

      try {
        await runScript(script);
      } catch {
        // Swallow per-script errors so the overall loop keeps running.
      }

      if (shouldStop()) return;
      await sleep(INTER_SCRIPT_DELAY);
    }
  };

  void loop();

  return { stop, pause };
}

export type ShowcaseStateSetter = Dispatch<SetStateAction<ShowcaseState>>;
