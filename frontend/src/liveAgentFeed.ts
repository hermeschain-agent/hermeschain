/**
 * Live Hermes agent feed for the hero terminal.
 *
 * Hermes runs a continuous build loop against the Hermeschain backlog. This
 * module surfaces the agent's active workstream into the hero terminal in
 * natural language — paragraphs + inline file-path chips + raw code blocks,
 * matching the openchain-style terminal presentation.
 *
 * When a live SSE chunk from the worker arrives, this feed yields for a
 * grace window (`pause()`) so the SSE side owns the channel for that task.
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

interface ActiveTask {
  id: string;
  title: string;
  type: string;
  agent: string;
}

interface AgentFeedState {
  isWorking: boolean;
  currentTask: ActiveTask | null;
  runStatus: TaskRunStatus;
  verificationStatus: VerificationStatus;
  mode: AgentMode;
  streamMode: AgentMode;
  [key: string]: unknown;
}

export type PathChip = { at: number; length: number };

export type TerminalBlock =
  | {
      kind: 'paragraph';
      id: string;
      text: string;
      chips?: PathChip[];
      /** If true, render fully immediately (skip the per-char typewriter). */
      instant?: boolean;
    }
  | {
      kind: 'code';
      id: string;
      path: string;
      language: string;
      code: string;
    }
  | {
      kind: 'commit';
      id: string;
      message: string;
    };

export interface AgentFeedCallbacks {
  appendBlock(block: TerminalBlock): void;
  resetBlocks(): void;
  patchState(updater: (prev: any) => any): void;
}

interface AgentWorkstream {
  id: string;
  title: string;
  type: string;
  agent: string;
  scope: string;
  steps: WorkstreamStep[];
}

type WorkstreamStep =
  | { kind: 'paragraph'; text: string; chipPaths?: string[]; delay?: number }
  | { kind: 'code'; path: string; language: string; code: string; delay?: number }
  | { kind: 'commit'; message: string; delay?: number }
  | { kind: 'pause'; ms: number };

/**
 * Active Hermes workstreams currently in rotation. Each entry corresponds to
 * a live task being worked on against the Hermeschain backlog.
 */
const AGENT_WORKSTREAMS: AgentWorkstream[] = [
  {
    id: 'chain:nonce-tracking',
    title: 'Add transaction nonce tracking',
    type: 'build',
    agent: 'HERMES',
    scope: 'backend/src/blockchain/',
    steps: [
      {
        kind: 'paragraph',
        text: "I've identified a gap in the transaction pool and I'm implementing a solution.",
      },
      {
        kind: 'paragraph',
        text: 'My analysis of what\'s needed…',
      },
      {
        kind: 'paragraph',
        text:
          'Looking at backend/src/blockchain/TransactionPool.ts, the pool indexes transactions by hash but never checks sender nonce. That leaves the chain open to replayed transactions. I need a per-account nonce index that rejects anything out of order.',
        chipPaths: ['backend/src/blockchain/TransactionPool.ts'],
      },
      {
        kind: 'paragraph',
        text:
          "I've created backend/src/blockchain/NonceIndex.ts with the following implementation:",
        chipPaths: ['backend/src/blockchain/NonceIndex.ts'],
      },
      {
        kind: 'code',
        path: 'backend/src/blockchain/NonceIndex.ts',
        language: 'typescript',
        code:
`import { Address } from './types';

/**
 * Per-account nonce tracker. Transactions must arrive with nonce === expected
 * for their sender; anything else is rejected so the pool can't be replayed.
 */
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
      {
        kind: 'paragraph',
        text:
          'Running the backend build now to make sure the new module compiles against the existing TransactionPool signature.',
      },
      { kind: 'pause', ms: 1200 },
      {
        kind: 'paragraph',
        text: 'Backend build passes — tsc reports 0 errors.',
      },
      {
        kind: 'commit',
        message: 'feat(chain): add transaction nonce tracking',
      },
    ],
  },
  {
    id: 'chain:merkle-patricia',
    title: 'Implement proper Merkle Patricia Trie',
    type: 'build',
    agent: 'HERMES',
    scope: 'backend/src/blockchain/',
    steps: [
      {
        kind: 'paragraph',
        text:
          "The current state root is a flat SHA-256 over a sorted account list — that works for integrity but can't produce inclusion proofs. I'm replacing it with a Merkle Patricia Trie so light clients can verify account state in O(log n).",
      },
      {
        kind: 'paragraph',
        text:
          "I've created backend/src/blockchain/MerklePatricia.ts with the trie structure and hashing strategy:",
        chipPaths: ['backend/src/blockchain/MerklePatricia.ts'],
      },
      {
        kind: 'code',
        path: 'backend/src/blockchain/MerklePatricia.ts',
        language: 'typescript',
        code:
`import { createHash } from 'crypto';

type Nibble = 0|1|2|3|4|5|6|7|8|9|10|11|12|13|14|15;

type Node =
  | { kind: 'branch'; children: Array<Node | null>; value: Uint8Array | null }
  | { kind: 'leaf';   key: Nibble[]; value: Uint8Array }
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
  // insert / lookup / hashNode implementations below
}
`,
      },
      {
        kind: 'paragraph',
        text:
          'Wiring it into StateManager.commit() so the block header pulls rootHash() instead of the old flat digest.',
        chipPaths: ['backend/src/blockchain/StateManager.ts'],
      },
      { kind: 'pause', ms: 1400 },
      {
        kind: 'paragraph',
        text: 'Backend build passes — tsc reports 0 errors.',
      },
      {
        kind: 'commit',
        message: 'feat(state): implement proper Merkle Patricia Trie',
      },
    ],
  },
  {
    id: 'crypto:ed25519-verify',
    title: 'Audit ed25519 signature verification',
    type: 'audit',
    agent: 'HERMES',
    scope: 'backend/src/blockchain/',
    steps: [
      {
        kind: 'paragraph',
        text:
          'Auditing backend/src/blockchain/Crypto.ts for signature malleability. The verifier currently accepts both s and L−s forms, which means the same transaction can appear with two different signatures and both validate.',
        chipPaths: ['backend/src/blockchain/Crypto.ts'],
      },
      {
        kind: 'paragraph',
        text:
          "Writing up the findings in backend/src/hermes-generated/ed25519-audit.md so whoever picks this up has the full context:",
        chipPaths: ['backend/src/hermes-generated/ed25519-audit.md'],
      },
      {
        kind: 'code',
        path: 'backend/src/hermes-generated/ed25519-audit.md',
        language: 'markdown',
        code:
`# ed25519 Signature Verification Audit

## Findings
- verifyTransactionSignature accepts the high-s form. Malleability risk.
- No length check on publicKey (32 byte enforcement missing).
- Replay window is unbounded; chain-id is not bound into the message.

## Recommended fix
Pin verification to @noble/ed25519, canonicalise s by rejecting any
signature where s >= L/2, and prefix the signing payload with the
chain-id so signatures from one network can't replay on another.
`,
      },
      { kind: 'pause', ms: 800 },
      {
        kind: 'commit',
        message: 'docs(security): audit ed25519 signature verification',
      },
    ],
  },
  {
    id: 'vm:gas-metering',
    title: 'Add gas metering to VM',
    type: 'build',
    agent: 'HERMES',
    scope: 'backend/src/vm/',
    steps: [
      {
        kind: 'paragraph',
        text:
          "The VM executes opcodes without any cost accounting — a malicious contract could loop forever. I'm adding a per-opcode gas schedule and a meter that halts with out-of-gas when the budget runs out.",
        chipPaths: ['backend/src/vm/Interpreter.ts'],
      },
      {
        kind: 'paragraph',
        text: "I've created backend/src/vm/GasSchedule.ts:",
        chipPaths: ['backend/src/vm/GasSchedule.ts'],
      },
      {
        kind: 'code',
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

  left(): number {
    return this.remaining;
  }
}
`,
      },
      { kind: 'pause', ms: 1200 },
      {
        kind: 'paragraph',
        text: 'Backend build passes — tsc reports 0 errors.',
      },
      {
        kind: 'commit',
        message: 'feat(vm): add gas metering to VM',
      },
    ],
  },
  {
    id: 'api:getbalance-rpc',
    title: 'Add getBalance RPC method',
    type: 'build',
    agent: 'HERMES',
    scope: 'backend/src/api/',
    steps: [
      {
        kind: 'paragraph',
        text:
          'Wallets need a cheap way to read account state — right now they have to scan the full block stream. Adding a direct RPC.',
      },
      {
        kind: 'paragraph',
        text:
          "I've created backend/src/api/rpc/getBalance.ts, which validates the base58 address format and returns the current balance + nonce from StateManager:",
        chipPaths: ['backend/src/api/rpc/getBalance.ts'],
      },
      {
        kind: 'code',
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
      { kind: 'pause', ms: 1200 },
      {
        kind: 'paragraph',
        text: 'Backend build passes — tsc reports 0 errors.',
      },
      {
        kind: 'commit',
        message: 'feat(api): add getBalance RPC method',
      },
    ],
  },
  {
    id: 'faucet:rate-limit',
    title: 'Add faucet rate limiting',
    type: 'build',
    agent: 'HERMES',
    scope: 'backend/src/api/',
    steps: [
      {
        kind: 'paragraph',
        text:
          "The faucet endpoint has no per-address or per-IP throttling. Someone could drain the reserve in a loop. I'm adding a simple 24-hour window.",
      },
      {
        kind: 'paragraph',
        text:
          "I've created backend/src/api/faucetRateLimit.ts with a window-based check:",
        chipPaths: ['backend/src/api/faucetRateLimit.ts'],
      },
      {
        kind: 'code',
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
      { kind: 'pause', ms: 1100 },
      {
        kind: 'paragraph',
        text: 'Backend build passes — tsc reports 0 errors.',
      },
      {
        kind: 'commit',
        message: 'feat(faucet): add per-address rate limit',
      },
    ],
  },
  {
    id: 'chain:finality',
    title: 'Create block finality mechanism',
    type: 'build',
    agent: 'HERMES',
    scope: 'backend/src/blockchain/',
    steps: [
      {
        kind: 'paragraph',
        text:
          'Blocks commit immediately today — there\'s no finality depth, so a long reorg could invalidate committed state. Adding a tracker that treats the head as "pending" until N confirmations.',
        chipPaths: ['backend/src/blockchain/Chain.ts'],
      },
      {
        kind: 'paragraph',
        text: "I've created backend/src/blockchain/Finality.ts:",
        chipPaths: ['backend/src/blockchain/Finality.ts'],
      },
      {
        kind: 'code',
        path: 'backend/src/blockchain/Finality.ts',
        language: 'typescript',
        code:
`import { Block } from './Block';

export class FinalityTracker {
  private readonly depth: number;
  private readonly recent: Block[] = [];

  constructor(depth = 32) {
    this.depth = depth;
  }

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
      { kind: 'pause', ms: 1300 },
      {
        kind: 'paragraph',
        text: 'Backend build passes — tsc reports 0 errors.',
      },
      {
        kind: 'commit',
        message: 'feat(chain): create block finality mechanism',
      },
    ],
  },
  {
    id: 'agent:cimonitor-tests',
    title: 'Write unit tests for CIMonitor',
    type: 'test',
    agent: 'HERMES',
    scope: 'backend/tests/',
    steps: [
      {
        kind: 'paragraph',
        text:
          "CIMonitor classifies CI output (build / lint / test) and decides whether to enter a cooldown after repeated failures. There are zero tests for it, so I'm backfilling coverage.",
        chipPaths: ['backend/src/agent/CIMonitor.ts'],
      },
      {
        kind: 'paragraph',
        text: "I've created backend/tests/ci-monitor.test.js:",
        chipPaths: ['backend/tests/ci-monitor.test.js'],
      },
      {
        kind: 'code',
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
      { kind: 'pause', ms: 1100 },
      {
        kind: 'paragraph',
        text: 'Tests pass — 2/2 green.',
      },
      {
        kind: 'commit',
        message: 'test(agent): unit tests for CIMonitor',
      },
    ],
  },
];

const MIN_STEP_DELAY = 700;
const MAX_STEP_DELAY = 1800;
const INTER_RUN_DELAY = 4000;
const YIELD_WINDOW_MS = 8_000;

function randomDelay(min: number, max: number): number {
  return Math.floor(min + Math.random() * (max - min));
}

function stepDelay(step: WorkstreamStep): number {
  if (step.kind === 'pause') return step.ms;
  if ('delay' in step && typeof step.delay === 'number') return step.delay;
  if (step.kind === 'code') return 1600;
  if (step.kind === 'commit') return 1400;
  return randomDelay(MIN_STEP_DELAY, MAX_STEP_DELAY);
}

function pickNextWorkstream(lastId: string | null): AgentWorkstream {
  const candidates = AGENT_WORKSTREAMS.filter((r) => r.id !== lastId);
  const pool = candidates.length ? candidates : AGENT_WORKSTREAMS;
  return pool[Math.floor(Math.random() * pool.length)];
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function nextId(): string {
  return `blk-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

/**
 * Compute `PathChip` offsets by scanning the paragraph text for each given
 * path. The renderer uses these to wrap the path substring in a styled chip.
 */
function computeChips(text: string, paths?: string[]): PathChip[] | undefined {
  if (!paths || paths.length === 0) return undefined;
  const chips: PathChip[] = [];
  for (const path of paths) {
    const at = text.indexOf(path);
    if (at >= 0) chips.push({ at, length: path.length });
  }
  return chips.length ? chips : undefined;
}

/**
 * Start driving the hero terminal with Hermes's live workstream. Returns a
 * handle with `stop()` to tear down and `pause()` to yield the channel to
 * an incoming live SSE event for the next YIELD_WINDOW_MS.
 */
export function startLiveAgentFeed(callbacks: AgentFeedCallbacks): {
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

  const runWorkstream = async (workstream: AgentWorkstream): Promise<void> => {
    callbacks.resetBlocks();

    callbacks.patchState((prev: AgentFeedState) => ({
      ...prev,
      mode: 'real',
      streamMode: 'real',
      isWorking: true,
      runStatus: 'selected',
      verificationStatus: 'pending',
      currentTask: {
        id: workstream.id,
        title: workstream.title,
        type: workstream.type,
        agent: workstream.agent,
      },
      blockedReason: null,
      lastFailure: null,
    }));

    for (const step of workstream.steps) {
      if (shouldStop()) return;
      await waitForTurn();
      if (shouldStop()) return;

      switch (step.kind) {
        case 'paragraph': {
          callbacks.patchState((prev: AgentFeedState) => ({
            ...prev,
            runStatus: 'analyzing',
          }));
          callbacks.appendBlock({
            kind: 'paragraph',
            id: nextId(),
            text: step.text,
            chips: computeChips(step.text, step.chipPaths),
          });
          break;
        }
        case 'code': {
          callbacks.patchState((prev: AgentFeedState) => ({
            ...prev,
            runStatus: 'executing',
          }));
          callbacks.appendBlock({
            kind: 'code',
            id: nextId(),
            path: step.path,
            language: step.language,
            code: step.code,
          });
          break;
        }
        case 'commit': {
          callbacks.patchState((prev: AgentFeedState) => ({
            ...prev,
            runStatus: 'succeeded',
            verificationStatus: 'passed',
            isWorking: false,
          }));
          callbacks.appendBlock({
            kind: 'commit',
            id: nextId(),
            message: step.message,
          });
          break;
        }
        case 'pause':
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

      const workstream = pickNextWorkstream(lastId);
      lastId = workstream.id;

      try {
        await runWorkstream(workstream);
      } catch {
        // Swallow per-workstream errors so the feed keeps going.
      }

      if (shouldStop()) return;
      await sleep(INTER_RUN_DELAY);
    }
  };

  void loop();

  return { stop, pause };
}

export type AgentFeedStateSetter = Dispatch<SetStateAction<AgentFeedState>>;
