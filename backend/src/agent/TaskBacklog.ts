export type BacklogTaskType =
  | 'audit'
  | 'build'
  | 'feature'
  | 'fix'
  | 'test'
  | 'docs'
  | 'refactor'
  | 'analyze';

export interface BacklogVerification {
  label: string;
  command: string;
  cwd: 'repo' | 'backend' | 'frontend';
}

export interface BacklogTask {
  id: string;
  title: string;
  description: string;
  type: BacklogTaskType;
  priority: number;
  estimatedMinutes: number;
  commitWindowMinutes: number;
  phaseId: string;
  phaseTitle: string;
  phaseOrder: number;
  workstreamId: string;
  workstreamTitle: string;
  sequence: number;
  tags: string[];
  objectiveTags: string[];
  allowedScopes: string[];
  verification: BacklogVerification;
  expectedOutcome: string;
}

export interface BacklogPhaseSummary {
  id: string;
  title: string;
  order: number;
  commitCount: number;
  workstreamCount: number;
  description: string;
  tags: string[];
}

type BacklogPatternName =
  | 'foundation4'
  | 'protocol12'
  | 'state12'
  | 'consensus13'
  | 'api12'
  | 'wallet9'
  | 'contract12'
  | 'network12'
  | 'economics9'
  | 'hardening9';

interface PatternStep {
  titlePrefix: string;
  description: string;
  expectedOutcome: string;
  type: BacklogTaskType;
  priorityOffset?: number;
  tags?: string[];
}

interface WorkstreamBlueprint {
  id: string;
  title: string;
  description: string;
  pattern: BacklogPatternName;
  allowedScopes: string[];
  tags: string[];
  objectiveTags: string[];
  verification: BacklogVerification;
}

interface PhaseBlueprint {
  id: string;
  title: string;
  order: number;
  basePriority: number;
  description: string;
  tags: string[];
  workstreams: WorkstreamBlueprint[];
}

export const COMMIT_WINDOW_MINUTES = 30;
export const TARGET_COMMIT_HOURS = 108;
export const TARGET_COMMIT_WINDOWS = 648;

export function getRuntimeCommitWindowMinutes(): number {
  const raw = Number.parseInt(process.env.AGENT_COMMIT_WINDOW_MINUTES || '', 10);
  return Number.isFinite(raw) && raw > 0 ? raw : COMMIT_WINDOW_MINUTES;
}

const COMPLETED_TASKS = new Set<string>();
const BACKLOG_ANCHOR_TIME = Date.UTC(2026, 3, 15, 0, 0, 0);

function unique(values: string[]): string[] {
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean)));
}

function clampPriority(priority: number): number {
  return Math.max(1, Math.min(10, priority));
}

function pad2(value: number): string {
  return value.toString().padStart(2, '0');
}

function renderTemplate(
  template: string,
  workstream: WorkstreamBlueprint,
  phase: PhaseBlueprint,
  stepIndex: number,
  totalSteps: number
): string {
  return template
    .replace(/\{topic\}/g, workstream.title)
    .replace(/\{workstream\}/g, workstream.description)
    .replace(/\{phase\}/g, phase.title)
    .replace(/\{step\}/g, `${stepIndex + 1}`)
    .replace(/\{total\}/g, `${totalSteps}`)
    .replace(/\{scopes\}/g, workstream.allowedScopes.join(', '));
}

const PATTERN_LIBRARY: Record<BacklogPatternName, PatternStep[]> = {
  foundation4: [
    {
      titlePrefix: 'Audit current',
      description:
        'inspect the existing {topic} entry points and pin down the canonical contract this backlog will preserve across {phase}.',
      expectedOutcome:
        'There is a grounded baseline for {topic}, including the exact code paths and runtime surfaces that must agree.',
      type: 'audit',
      priorityOffset: 1,
      tags: ['audit', 'foundation'],
    },
    {
      titlePrefix: 'Define typed',
      description:
        'add or tighten the core types, constants, and metadata records for {topic} so later tasks stop guessing the shape.',
      expectedOutcome:
        '{topic} is backed by one typed source of truth inside the allowed scopes: {scopes}.',
      type: 'build',
      priorityOffset: 1,
      tags: ['types', 'foundation'],
    },
    {
      titlePrefix: 'Wire canonical',
      description:
        'thread the canonical {topic} shape through the runtime surfaces that currently drift or duplicate responsibility.',
      expectedOutcome:
        'The main runtime/query surfaces now consume the same canonical implementation for {topic}.',
      type: 'build',
      tags: ['integration'],
    },
    {
      titlePrefix: 'Cover',
      description:
        'add a focused regression check proving the {topic} contract holds and stays honest after the refactor.',
      expectedOutcome:
        '{topic} has a targeted automated proof point that fits inside one commit window.',
      type: 'test',
      tags: ['test', 'regression'],
    },
  ],
  protocol12: [
    {
      titlePrefix: 'Audit',
      description:
        'map the current {topic} code paths and list the validation holes or duplicated behavior that still exist.',
      expectedOutcome:
        'The repo has a grounded starting snapshot for {topic}, with concrete files and missing guarantees identified.',
      type: 'audit',
      priorityOffset: 1,
      tags: ['audit'],
    },
    {
      titlePrefix: 'Define typed',
      description:
        'introduce explicit type and data-shape definitions for {topic} so later checks can key off one schema.',
      expectedOutcome:
        '{topic} exposes a stable typed contract for downstream validation and persistence.',
      type: 'build',
      priorityOffset: 1,
      tags: ['types'],
    },
    {
      titlePrefix: 'Normalize serialization for',
      description:
        'tighten how {topic} is encoded, decoded, or hashed so the byte-level contract is deterministic.',
      expectedOutcome:
        '{topic} now has deterministic serialization boundaries that stop hidden drift.',
      type: 'build',
      tags: ['serialization'],
    },
    {
      titlePrefix: 'Persist canonical',
      description:
        'store the canonical {topic} data in the runtime or database layer that should own it going forward.',
      expectedOutcome:
        'Canonical {topic} data is recorded in one durable location instead of being recomputed ad hoc.',
      type: 'build',
      tags: ['persistence'],
    },
    {
      titlePrefix: 'Enforce validation rules for',
      description:
        'add the validation gate that should reject malformed or incomplete {topic} inputs before they propagate.',
      expectedOutcome:
        'Invalid {topic} inputs now fail at the correct boundary with deterministic rules.',
      type: 'fix',
      tags: ['validation'],
    },
    {
      titlePrefix: 'Add rejection reporting for',
      description:
        'surface why {topic} was rejected so operators and API consumers can debug failures without guesswork.',
      expectedOutcome:
        '{topic} rejections expose actionable reasons instead of opaque failures.',
      type: 'build',
      tags: ['diagnostics'],
    },
    {
      titlePrefix: 'Expose internal query helpers for',
      description:
        'add the smallest read helpers needed so later RPC/indexer work can interrogate {topic} without copy-paste logic.',
      expectedOutcome:
        'Internal code can query {topic} through one helper path instead of scattered custom lookups.',
      type: 'build',
      tags: ['query'],
    },
    {
      titlePrefix: 'Record metrics for',
      description:
        'emit the operator-facing counters or gauges that make {topic} visible during live runs.',
      expectedOutcome:
        '{topic} contributes real telemetry that can be surfaced in status endpoints and dashboards.',
      type: 'build',
      tags: ['metrics'],
    },
    {
      titlePrefix: 'Add operator diagnostics for',
      description:
        'make the runtime or debug surfaces reveal enough detail to inspect {topic} without opening the debugger.',
      expectedOutcome:
        'Operators can inspect {topic} from a first-class diagnostic surface.',
      type: 'build',
      tags: ['operator'],
    },
    {
      titlePrefix: 'Add regression fixtures for',
      description:
        'create deterministic fixtures that pin the intended behavior of {topic} to concrete inputs and outputs.',
      expectedOutcome:
        '{topic} has deterministic fixtures that catch future regressions fast.',
      type: 'test',
      tags: ['fixtures', 'test'],
    },
    {
      titlePrefix: 'Add targeted checks for',
      description:
        'write the focused automated check that proves the latest {topic} behavior is correct under the agreed contract.',
      expectedOutcome:
        '{topic} is protected by one focused automated check that is realistic for a 10-minute window.',
      type: 'test',
      tags: ['test'],
    },
    {
      titlePrefix: 'Tighten verification notes for',
      description:
        'leave clear implementation notes or inline docs describing how {topic} should now be verified and extended.',
      expectedOutcome:
        'Future work on {topic} starts from accurate local documentation instead of folklore.',
      type: 'docs',
      tags: ['docs'],
    },
  ],
  state12: [
    {
      titlePrefix: 'Audit state flow for',
      description:
        'trace how {topic} currently mutates state, then isolate the deterministic boundary we want to preserve.',
      expectedOutcome:
        'The state-transition surface for {topic} is explicit and grounded before new logic lands.',
      type: 'audit',
      priorityOffset: 1,
      tags: ['audit', 'state'],
    },
    {
      titlePrefix: 'Define canonical records for',
      description:
        'introduce the typed state objects and helper contracts that should own {topic} moving forward.',
      expectedOutcome:
        '{topic} is represented through canonical typed state records.',
      type: 'build',
      priorityOffset: 1,
      tags: ['types', 'state'],
    },
    {
      titlePrefix: 'Normalize persistence for',
      description:
        'make {topic} write through the right persistence layer instead of leaking implicit state changes.',
      expectedOutcome:
        '{topic} persists through one deterministic state path.',
      type: 'build',
      tags: ['persistence', 'state'],
    },
    {
      titlePrefix: 'Enforce invariants for',
      description:
        'add the conservation, monotonicity, or integrity checks that should always hold for {topic}.',
      expectedOutcome:
        '{topic} now enforces its core invariant at execution time.',
      type: 'fix',
      tags: ['invariants'],
    },
    {
      titlePrefix: 'Capture reversible diffs for',
      description:
        'record the minimal change set required to replay or roll back {topic} safely.',
      expectedOutcome:
        '{topic} produces a reversible diff artifact instead of irreversible side effects.',
      type: 'build',
      tags: ['diffs'],
    },
    {
      titlePrefix: 'Add rollback hooks for',
      description:
        'wire the rollback or restore path that reorg-safe state management needs for {topic}.',
      expectedOutcome:
        '{topic} can be unwound cleanly during rollback scenarios.',
      type: 'build',
      tags: ['rollback'],
    },
    {
      titlePrefix: 'Add export helpers for',
      description:
        'expose the minimal export or snapshot helpers needed to inspect {topic} outside the main mutation path.',
      expectedOutcome:
        '{topic} can be exported or snapshotted through stable helpers.',
      type: 'build',
      tags: ['snapshot'],
    },
    {
      titlePrefix: 'Add integrity checks for',
      description:
        'validate that stored {topic} data remains internally consistent even after restarts or replays.',
      expectedOutcome:
        '{topic} integrity failures now surface before they silently corrupt state.',
      type: 'fix',
      tags: ['integrity'],
    },
    {
      titlePrefix: 'Expose query helpers for',
      description:
        'add read paths that let RPC, explorer, or operator tools inspect {topic} deterministically.',
      expectedOutcome:
        '{topic} is queryable through explicit helper surfaces.',
      type: 'build',
      tags: ['query'],
    },
    {
      titlePrefix: 'Add deterministic fixtures for',
      description:
        'capture one concrete before/after fixture that proves the intended {topic} state transition.',
      expectedOutcome:
        '{topic} has a deterministic state fixture for fast regression checks.',
      type: 'test',
      tags: ['fixtures', 'test'],
    },
    {
      titlePrefix: 'Add regression tests for',
      description:
        'write a focused automated regression proving {topic} stays correct across the most important edge path.',
      expectedOutcome:
        '{topic} is covered by a repeatable regression check.',
      type: 'test',
      tags: ['test'],
    },
    {
      titlePrefix: 'Document state assumptions for',
      description:
        'leave clear notes on the invariant and rollback assumptions the next engineer must preserve for {topic}.',
      expectedOutcome:
        '{topic} now carries accurate local documentation of its state assumptions.',
      type: 'docs',
      tags: ['docs'],
    },
  ],
  consensus13: [
    {
      titlePrefix: 'Audit validation flow for',
      description:
        'separate the current {topic} behavior into distinct validation, production, and lifecycle responsibilities.',
      expectedOutcome:
        'The current {topic} path is mapped before refactoring begins.',
      type: 'audit',
      priorityOffset: 1,
      tags: ['audit', 'consensus'],
    },
    {
      titlePrefix: 'Extract canonical interfaces for',
      description:
        'define the interfaces or helper seams that let {topic} evolve without coupling validation to production.',
      expectedOutcome:
        '{topic} has explicit seams between validation and mutation.',
      type: 'refactor',
      priorityOffset: 1,
      tags: ['interfaces'],
    },
    {
      titlePrefix: 'Split validator checks for',
      description:
        'move the first concrete validation rule for {topic} into the dedicated pipeline where it belongs.',
      expectedOutcome:
        '{topic} no longer relies on block production code to enforce its first critical rule.',
      type: 'build',
      tags: ['validation'],
    },
    {
      titlePrefix: 'Track canonical state for',
      description:
        'persist the lifecycle state that {topic} needs to distinguish pending, canonical, and finalized outcomes.',
      expectedOutcome:
        '{topic} carries an explicit lifecycle state instead of an implicit guess.',
      type: 'build',
      tags: ['state'],
    },
    {
      titlePrefix: 'Handle late-arrival edge cases for',
      description:
        'add the branch that safely handles out-of-order or late-arriving {topic} data.',
      expectedOutcome:
        '{topic} behaves deterministically when late or competing data arrives.',
      type: 'fix',
      tags: ['edge-cases'],
    },
    {
      titlePrefix: 'Add fork-choice hooks for',
      description:
        'wire the minimal decision points required to compare competing {topic} candidates.',
      expectedOutcome:
        '{topic} can participate in fork-choice logic through explicit hooks.',
      type: 'build',
      tags: ['fork-choice'],
    },
    {
      titlePrefix: 'Account for rewards in',
      description:
        'add the accounting path that lets {topic} affect rewards, fees, or participation metrics truthfully.',
      expectedOutcome:
        '{topic} contributes to reward/accounting state without hidden side effects.',
      type: 'build',
      tags: ['rewards'],
    },
    {
      titlePrefix: 'Expose operator visibility for',
      description:
        'surface the runtime state needed to inspect {topic} from operator-facing endpoints or logs.',
      expectedOutcome:
        '{topic} is visible from operator diagnostics during live runs.',
      type: 'build',
      tags: ['operator'],
    },
    {
      titlePrefix: 'Record consensus diagnostics for',
      description:
        'emit structured diagnostics so failures in {topic} can be reconstructed after the fact.',
      expectedOutcome:
        '{topic} failures leave behind structured diagnostics instead of raw guesswork.',
      type: 'build',
      tags: ['diagnostics'],
    },
    {
      titlePrefix: 'Add deterministic fixtures for',
      description:
        'create the first deterministic fixture proving the canonical success path for {topic}.',
      expectedOutcome:
        '{topic} has a deterministic success fixture for regression testing.',
      type: 'test',
      tags: ['fixtures', 'test'],
    },
    {
      titlePrefix: 'Add late-path tests for',
      description:
        'cover the late-arrival or competing-candidate behavior of {topic} with a focused automated check.',
      expectedOutcome:
        'The nastiest timing edge in {topic} is now covered by a regression test.',
      type: 'test',
      tags: ['test', 'timing'],
    },
    {
      titlePrefix: 'Add reorg regression for',
      description:
        'prove that {topic} behaves correctly when the canonical chain changes underneath it.',
      expectedOutcome:
        '{topic} has at least one reorg-aware regression check.',
      type: 'test',
      tags: ['test', 'reorg'],
    },
    {
      titlePrefix: 'Document lifecycle rules for',
      description:
        'leave concise notes on the lifecycle and finality assumptions the next commit must preserve for {topic}.',
      expectedOutcome:
        '{topic} carries accurate lifecycle notes for follow-on work.',
      type: 'docs',
      tags: ['docs'],
    },
  ],
  api12: [
    {
      titlePrefix: 'Define response contract for',
      description:
        'pin down the request/response shape for {topic} so explorer and operator consumers have a stable target.',
      expectedOutcome:
        '{topic} exposes a stable contract before endpoint logic sprawls further.',
      type: 'analyze',
      priorityOffset: 1,
      tags: ['api', 'contract'],
    },
    {
      titlePrefix: 'Add typed handlers for',
      description:
        'introduce the typed handler or service helpers that should own {topic} responses.',
      expectedOutcome:
        '{topic} is served through typed handlers rather than ad hoc response assembly.',
      type: 'build',
      priorityOffset: 1,
      tags: ['api', 'types'],
    },
    {
      titlePrefix: 'Normalize input parsing for',
      description:
        'validate params, cursors, or hashes for {topic} so malformed input fails early.',
      expectedOutcome:
        '{topic} rejects invalid inputs deterministically.',
      type: 'fix',
      tags: ['validation'],
    },
    {
      titlePrefix: 'Wire storage queries for',
      description:
        'connect {topic} to the storage/query helpers that should answer it truthfully.',
      expectedOutcome:
        '{topic} responses come from canonical stored data rather than synthetic placeholders.',
      type: 'build',
      tags: ['storage'],
    },
    {
      titlePrefix: 'Add pagination or filtering for',
      description:
        'implement the smallest paging or filtering surface needed to make {topic} usable at runtime scale.',
      expectedOutcome:
        '{topic} is queryable without dumping the whole dataset every time.',
      type: 'build',
      tags: ['pagination'],
    },
    {
      titlePrefix: 'Expose status fields for',
      description:
        'include the lifecycle or finality fields that downstream consumers need from {topic}.',
      expectedOutcome:
        '{topic} responses now carry the status fields clients actually need.',
      type: 'build',
      tags: ['status'],
    },
    {
      titlePrefix: 'Add index helpers for',
      description:
        'create the index or lookup helpers that keep {topic} queries fast and explicit.',
      expectedOutcome:
        '{topic} has a maintainable lookup path instead of repeated table scans.',
      type: 'build',
      tags: ['indexing'],
    },
    {
      titlePrefix: 'Add search surfaces for',
      description:
        'make {topic} searchable by the most operator-relevant keys without inventing extra abstraction.',
      expectedOutcome:
        '{topic} can be searched through a small, useful query surface.',
      type: 'build',
      tags: ['search'],
    },
    {
      titlePrefix: 'Add operator diagnostics for',
      description:
        'expose the debug metadata that helps operators understand why {topic} did or did not resolve.',
      expectedOutcome:
        '{topic} carries useful debug context for operators.',
      type: 'build',
      tags: ['operator'],
    },
    {
      titlePrefix: 'Add endpoint fixtures for',
      description:
        'capture deterministic fixture responses proving the success path for {topic}.',
      expectedOutcome:
        '{topic} has a stable fixture contract that future refactors can compare against.',
      type: 'test',
      tags: ['fixtures', 'test'],
    },
    {
      titlePrefix: 'Add integration checks for',
      description:
        'write the focused integration test that proves {topic} works end to end against the current node/runtime shape.',
      expectedOutcome:
        '{topic} has an end-to-end proof point instead of only local unit coverage.',
      type: 'test',
      tags: ['integration', 'test'],
    },
    {
      titlePrefix: 'Document consumer expectations for',
      description:
        'write concise local documentation on what downstream consumers can rely on from {topic}.',
      expectedOutcome:
        '{topic} has accurate local consumer-facing guidance for later explorer or wallet work.',
      type: 'docs',
      tags: ['docs'],
    },
  ],
  wallet9: [
    {
      titlePrefix: 'Define canonical contract for',
      description:
        'pin down the request, response, and signing shape that {topic} should preserve going forward.',
      expectedOutcome:
        '{topic} has a canonical contract that stops wallet-side guesswork.',
      type: 'analyze',
      priorityOffset: 1,
      tags: ['wallet', 'contract'],
    },
    {
      titlePrefix: 'Derive identity rules for',
      description:
        'wire the address, key, or sender derivation rules that make {topic} trustworthy.',
      expectedOutcome:
        '{topic} now derives identity from canonical crypto/state rules.',
      type: 'build',
      priorityOffset: 1,
      tags: ['wallet', 'identity'],
    },
    {
      titlePrefix: 'Wire signed submission for',
      description:
        'connect {topic} to the canonical transaction submission path instead of a wallet-only side effect.',
      expectedOutcome:
        '{topic} flows through canonical chain submission rather than local-only mutation.',
      type: 'build',
      tags: ['wallet', 'submission'],
    },
    {
      titlePrefix: 'Expose pending state for',
      description:
        'surface the pending lifecycle details operators and UIs need from {topic}.',
      expectedOutcome:
        '{topic} clearly distinguishes pending behavior from confirmed state.',
      type: 'build',
      tags: ['wallet', 'pending'],
    },
    {
      titlePrefix: 'Expose confirmed state for',
      description:
        'derive the confirmed result of {topic} from receipts and chain state only.',
      expectedOutcome:
        '{topic} confirmed results now come from canonical chain data.',
      type: 'build',
      tags: ['wallet', 'confirmed'],
    },
    {
      titlePrefix: 'Enforce validation and cooldown rules for',
      description:
        'apply the validation, rate-limit, or cooldown policy that keeps {topic} honest under real usage.',
      expectedOutcome:
        '{topic} enforces its abuse-prevention or validation rules at the right boundary.',
      type: 'fix',
      tags: ['wallet', 'validation'],
    },
    {
      titlePrefix: 'Surface rejection reasons for',
      description:
        'make failures in {topic} explainable to operators and wallet consumers.',
      expectedOutcome:
        '{topic} failures now surface actionable rejection reasons.',
      type: 'build',
      tags: ['wallet', 'diagnostics'],
    },
    {
      titlePrefix: 'Add focused tests for',
      description:
        'write a tight automated check proving the current {topic} behavior against the chain-backed contract.',
      expectedOutcome:
        '{topic} is backed by a focused automated regression.',
      type: 'test',
      tags: ['wallet', 'test'],
    },
    {
      titlePrefix: 'Document operator expectations for',
      description:
        'leave concise notes on how to verify and operate {topic} without re-learning the contract from code.',
      expectedOutcome:
        '{topic} has accurate local operator guidance for follow-on work.',
      type: 'docs',
      tags: ['wallet', 'docs'],
    },
  ],
  contract12: [
    {
      titlePrefix: 'Audit runtime surface for',
      description:
        'map the existing runtime or placeholder path for {topic} before mutating execution behavior.',
      expectedOutcome:
        '{topic} has a grounded starting point before runtime logic changes.',
      type: 'audit',
      priorityOffset: 1,
      tags: ['contracts', 'audit'],
    },
    {
      titlePrefix: 'Define canonical execution types for',
      description:
        'introduce the typed runtime contract that should govern {topic}.',
      expectedOutcome:
        '{topic} is represented through explicit runtime types and helper contracts.',
      type: 'build',
      priorityOffset: 1,
      tags: ['contracts', 'types'],
    },
    {
      titlePrefix: 'Add execution scaffold for',
      description:
        'wire the smallest executable scaffold needed to route {topic} through the VM/runtime pipeline.',
      expectedOutcome:
        '{topic} now enters the runtime through a real scaffold instead of a placeholder.',
      type: 'build',
      tags: ['contracts', 'runtime'],
    },
    {
      titlePrefix: 'Wire state mutation path for',
      description:
        'connect {topic} to canonical state reads and writes with deterministic ownership of side effects.',
      expectedOutcome:
        '{topic} mutates contract or chain state through one canonical path.',
      type: 'build',
      tags: ['contracts', 'state'],
    },
    {
      titlePrefix: 'Account for gas and fees in',
      description:
        'add the gas, fee, or resource accounting required for truthful execution of {topic}.',
      expectedOutcome:
        '{topic} participates in canonical gas or fee accounting.',
      type: 'build',
      tags: ['contracts', 'gas'],
    },
    {
      titlePrefix: 'Handle revert and failure rules for',
      description:
        'make {topic} fail safely, preserving the right rollback and error semantics.',
      expectedOutcome:
        '{topic} now has explicit revert/failure behavior instead of silent partial mutation.',
      type: 'fix',
      tags: ['contracts', 'revert'],
    },
    {
      titlePrefix: 'Persist receipt and event data for',
      description:
        'record the logs, receipts, or traces emitted by {topic} so external consumers can inspect it.',
      expectedOutcome:
        '{topic} execution produces canonical receipt or event data.',
      type: 'build',
      tags: ['contracts', 'receipts'],
    },
    {
      titlePrefix: 'Expose read helpers for',
      description:
        'add the minimal query helpers required to inspect {topic} state without duplicating runtime logic.',
      expectedOutcome:
        '{topic} has dedicated read helpers for RPC or indexer work.',
      type: 'build',
      tags: ['contracts', 'query'],
    },
    {
      titlePrefix: 'Add success fixtures for',
      description:
        'capture a deterministic happy-path fixture proving the intended runtime behavior of {topic}.',
      expectedOutcome:
        '{topic} has a deterministic success fixture for future regression checks.',
      type: 'test',
      tags: ['contracts', 'fixtures', 'test'],
    },
    {
      titlePrefix: 'Add failure fixtures for',
      description:
        'cover a realistic revert, out-of-gas, or invalid-state path for {topic}.',
      expectedOutcome:
        '{topic} has a deterministic failure-path regression check.',
      type: 'test',
      tags: ['contracts', 'test'],
    },
    {
      titlePrefix: 'Add runtime diagnostics for',
      description:
        'surface the operator-visible diagnostics needed to debug {topic} during live execution.',
      expectedOutcome:
        '{topic} runtime behavior is inspectable without stepping through the VM manually.',
      type: 'build',
      tags: ['contracts', 'diagnostics'],
    },
    {
      titlePrefix: 'Document runtime guarantees for',
      description:
        'write concise local notes on the gas, state, and receipt guarantees that {topic} now preserves.',
      expectedOutcome:
        '{topic} has accurate local runtime documentation for future protocol work.',
      type: 'docs',
      tags: ['contracts', 'docs'],
    },
  ],
  network12: [
    {
      titlePrefix: 'Audit transport surfaces for',
      description:
        'trace the current or placeholder transport path for {topic} before building new sync behavior.',
      expectedOutcome:
        '{topic} has a grounded transport baseline before networking changes land.',
      type: 'audit',
      priorityOffset: 1,
      tags: ['network', 'audit'],
    },
    {
      titlePrefix: 'Define message contracts for',
      description:
        'pin down the canonical payload and state shape that {topic} messages should use.',
      expectedOutcome:
        '{topic} now has explicit message contracts instead of ad hoc payloads.',
      type: 'build',
      priorityOffset: 1,
      tags: ['network', 'messages'],
    },
    {
      titlePrefix: 'Wire handshake or routing for',
      description:
        'add the first routing or handshake path required to make {topic} flow through the node.',
      expectedOutcome:
        '{topic} is connected to a real transport path through the node.',
      type: 'build',
      tags: ['network', 'routing'],
    },
    {
      titlePrefix: 'Validate inbound data for',
      description:
        'reject malformed or unauthenticated inbound {topic} messages before they affect the node.',
      expectedOutcome:
        '{topic} inbound validation fails early and deterministically.',
      type: 'fix',
      tags: ['network', 'validation'],
    },
    {
      titlePrefix: 'Add retry and suppression rules for',
      description:
        'teach the node when to retry, drop, or deduplicate {topic} traffic.',
      expectedOutcome:
        '{topic} no longer loops or duplicates blindly under churn.',
      type: 'build',
      tags: ['network', 'retries'],
    },
    {
      titlePrefix: 'Persist sync state for',
      description:
        'store the node state needed to resume or reason about {topic} across process restarts.',
      expectedOutcome:
        '{topic} survives restarts with explicit sync state.',
      type: 'build',
      tags: ['network', 'sync'],
    },
    {
      titlePrefix: 'Expose peer or sync helpers for',
      description:
        'add the internal read helpers needed to inspect {topic} from APIs and operator tools.',
      expectedOutcome:
        '{topic} can be queried without scraping logs.',
      type: 'build',
      tags: ['network', 'query'],
    },
    {
      titlePrefix: 'Add operator diagnostics for',
      description:
        'surface the peer health, retry state, or sync progress needed to reason about {topic}.',
      expectedOutcome:
        '{topic} is visible from operator diagnostics during live node operation.',
      type: 'build',
      tags: ['network', 'operator'],
    },
    {
      titlePrefix: 'Add success fixtures for',
      description:
        'capture a deterministic successful transport or sync path for {topic}.',
      expectedOutcome:
        '{topic} has a deterministic success fixture for regression testing.',
      type: 'test',
      tags: ['network', 'fixtures', 'test'],
    },
    {
      titlePrefix: 'Add failure fixtures for',
      description:
        'cover a realistic timeout, duplicate, or partial-peer path for {topic}.',
      expectedOutcome:
        '{topic} has a regression proving the node handles its main failure path.',
      type: 'test',
      tags: ['network', 'test'],
    },
    {
      titlePrefix: 'Add recovery checks for',
      description:
        'prove the node can recover {topic} after a restart or partial outage.',
      expectedOutcome:
        '{topic} recovery behavior is covered by an automated check.',
      type: 'test',
      tags: ['network', 'recovery', 'test'],
    },
    {
      titlePrefix: 'Document operator flow for',
      description:
        'write concise local notes on how to inspect and repair {topic} when the network misbehaves.',
      expectedOutcome:
        '{topic} has accurate operator notes for future node work.',
      type: 'docs',
      tags: ['network', 'docs'],
    },
  ],
  economics9: [
    {
      titlePrefix: 'Define parameter surface for',
      description:
        'identify the parameters and state the protocol should treat as canonical for {topic}.',
      expectedOutcome:
        '{topic} parameters are explicit before accounting logic expands further.',
      type: 'analyze',
      priorityOffset: 1,
      tags: ['economics', 'parameters'],
    },
    {
      titlePrefix: 'Persist canonical config for',
      description:
        'store the authoritative configuration required to make {topic} deterministic across restarts.',
      expectedOutcome:
        '{topic} reads from persisted canonical config instead of scattered constants.',
      type: 'build',
      priorityOffset: 1,
      tags: ['economics', 'config'],
    },
    {
      titlePrefix: 'Wire state hooks for',
      description:
        'connect {topic} to the state transition hooks that should own its accounting side effects.',
      expectedOutcome:
        '{topic} affects state through explicit hooks instead of hidden mutation.',
      type: 'build',
      tags: ['economics', 'state'],
    },
    {
      titlePrefix: 'Expose query helpers for',
      description:
        'add the minimal read paths needed to inspect {topic} from APIs or operator tooling.',
      expectedOutcome:
        '{topic} can be queried without duplicating accounting logic.',
      type: 'build',
      tags: ['economics', 'query'],
    },
    {
      titlePrefix: 'Emit receipts or accounting records for',
      description:
        'record the observable outputs that make {topic} auditable after the fact.',
      expectedOutcome:
        '{topic} now leaves behind auditable receipt or accounting records.',
      type: 'build',
      tags: ['economics', 'receipts'],
    },
    {
      titlePrefix: 'Handle edge cases for',
      description:
        'cover the underflow, cooldown, or invalid-state case most likely to break {topic}.',
      expectedOutcome:
        '{topic} now fails safely under its main edge condition.',
      type: 'fix',
      tags: ['economics', 'edge-cases'],
    },
    {
      titlePrefix: 'Add deterministic fixtures for',
      description:
        'capture a small deterministic fixture that proves the intended accounting behavior of {topic}.',
      expectedOutcome:
        '{topic} has a deterministic accounting fixture for regression work.',
      type: 'test',
      tags: ['economics', 'fixtures', 'test'],
    },
    {
      titlePrefix: 'Add operator metrics for',
      description:
        'expose the counters or gauges that make {topic} observable from node health surfaces.',
      expectedOutcome:
        '{topic} contributes operator-visible metrics instead of hidden accounting state.',
      type: 'build',
      tags: ['economics', 'metrics'],
    },
    {
      titlePrefix: 'Document invariants for',
      description:
        'leave concise notes on the accounting invariants and operator expectations for {topic}.',
      expectedOutcome:
        '{topic} has accurate local invariants documentation for future economics work.',
      type: 'docs',
      tags: ['economics', 'docs'],
    },
  ],
  hardening9: [
    {
      titlePrefix: 'Enumerate invariants for',
      description:
        'write down the concrete invariant or threat boundary that {topic} must preserve before adding new checks.',
      expectedOutcome:
        '{topic} has a clearly stated invariant or threat boundary.',
      type: 'analyze',
      priorityOffset: 1,
      tags: ['hardening', 'invariants'],
    },
    {
      titlePrefix: 'Add deterministic fixtures for',
      description:
        'capture the baseline fixture that proves the healthy behavior of {topic}.',
      expectedOutcome:
        '{topic} has a deterministic baseline fixture for later adversarial checks.',
      type: 'test',
      priorityOffset: 1,
      tags: ['hardening', 'fixtures', 'test'],
    },
    {
      titlePrefix: 'Add negative checks for',
      description:
        'cover the first invalid-input or malformed-state path that should fail for {topic}.',
      expectedOutcome:
        '{topic} now has at least one explicit negative-path regression.',
      type: 'test',
      tags: ['hardening', 'negative', 'test'],
    },
    {
      titlePrefix: 'Add adversarial checks for',
      description:
        'simulate the abusive or adversarial path most likely to stress {topic}.',
      expectedOutcome:
        '{topic} now has a focused adversarial regression case.',
      type: 'test',
      tags: ['hardening', 'adversarial', 'test'],
    },
    {
      titlePrefix: 'Record diagnostics for',
      description:
        'emit the logs, counters, or audit trail required to debug {topic} when invariants break.',
      expectedOutcome:
        '{topic} now leaves behind useful diagnostics during failure.',
      type: 'build',
      tags: ['hardening', 'diagnostics'],
    },
    {
      titlePrefix: 'Add operator repair steps for',
      description:
        'write the smallest operator-facing repair or inspection flow needed when {topic} goes wrong.',
      expectedOutcome:
        '{topic} has an operator repair flow that can be followed under pressure.',
      type: 'docs',
      tags: ['hardening', 'runbook'],
    },
    {
      titlePrefix: 'Add troubleshooting notes for',
      description:
        'document the fastest way to interpret failures in {topic} from logs, APIs, or tests.',
      expectedOutcome:
        '{topic} has accurate troubleshooting notes near the code.',
      type: 'docs',
      tags: ['hardening', 'docs'],
    },
    {
      titlePrefix: 'Wire CI checks for',
      description:
        'make the targeted check for {topic} part of the normal verification path instead of a one-off manual step.',
      expectedOutcome:
        '{topic} verification now runs as part of the repeatable CI/test flow.',
      type: 'build',
      tags: ['hardening', 'ci'],
    },
    {
      titlePrefix: 'Sweep regression coverage for',
      description:
        'finish the smallest honest regression sweep that proves {topic} is ready for follow-on protocol work.',
      expectedOutcome:
        '{topic} exits the hardening phase with a truthful regression sweep.',
      type: 'test',
      tags: ['hardening', 'regression', 'test'],
    },
  ],
};

const PHASE_BLUEPRINTS: PhaseBlueprint[] = [
  {
    id: 'phase-01',
    title: 'Execution Scaffolding and Chain Truth',
    order: 1,
    basePriority: 10,
    description:
      'Lock canonical chain metadata, chain age, genesis config, chain ID, verification wrappers, and operator health truth.',
    tags: ['foundation', 'chain', 'operator'],
    workstreams: [
      {
        id: 'chain-metadata',
        title: 'chain metadata persistence',
        description:
          'canonical genesis timestamp, latest height, latest hash, stored transaction totals, and runtime truth',
        pattern: 'foundation4',
        allowedScopes: ['backend/src/blockchain/', 'backend/src/api/', 'backend/tests/'],
        tags: ['chain', 'metadata', 'persistence'],
        objectiveTags: ['chain', 'tooling'],
        verification: {
          label: 'Run backend protocol suite',
          command: 'npm run test',
          cwd: 'backend',
        },
      },
      {
        id: 'genesis-config',
        title: 'genesis configuration truth',
        description:
          'canonical genesis parameters, allocations, timestamps, and migration-safe defaults',
        pattern: 'foundation4',
        allowedScopes: ['backend/src/blockchain/', 'backend/tests/'],
        tags: ['chain', 'genesis', 'config'],
        objectiveTags: ['chain', 'config'],
        verification: {
          label: 'Run backend protocol suite',
          command: 'npm run test',
          cwd: 'backend',
        },
      },
      {
        id: 'chain-id',
        title: 'chain identity surfaces',
        description:
          'chain ID, network name, domain separation constants, and status exposure',
        pattern: 'foundation4',
        allowedScopes: ['backend/src/blockchain/', 'backend/src/api/', 'backend/tests/'],
        tags: ['chain', 'identity', 'api'],
        objectiveTags: ['chain', 'api'],
        verification: {
          label: 'Run backend protocol suite',
          command: 'npm run test',
          cwd: 'backend',
        },
      },
      {
        id: 'serialization',
        title: 'serialization boundaries',
        description:
          'canonical block and transaction encoding boundaries across runtime and API surfaces',
        pattern: 'foundation4',
        allowedScopes: ['backend/src/blockchain/', 'backend/src/api/', 'backend/tests/'],
        tags: ['serialization', 'chain', 'api'],
        objectiveTags: ['chain', 'api'],
        verification: {
          label: 'Run backend protocol suite',
          command: 'npm run test',
          cwd: 'backend',
        },
      },
      {
        id: 'verification-wrappers',
        title: 'verification wrappers',
        description:
          'task-safe verification helpers, commit scaffolding, and agent-facing protocol metadata',
        pattern: 'foundation4',
        allowedScopes: ['backend/src/agent/', 'backend/tests/', 'backend/package.json', 'backend/tsconfig.json'],
        tags: ['agent', 'verification', 'tooling'],
        objectiveTags: ['tooling', 'agent'],
        verification: {
          label: 'Run agent test suite',
          command: 'npm run test',
          cwd: 'backend',
        },
      },
      {
        id: 'operator-health',
        title: 'operator health surfaces',
        description:
          'health/status endpoints for block height, finality, mempool size, receipts, and sync state',
        pattern: 'foundation4',
        allowedScopes: ['backend/src/api/', 'backend/src/blockchain/', 'backend/tests/'],
        tags: ['operator', 'status', 'api'],
        objectiveTags: ['operator', 'api'],
        verification: {
          label: 'Run backend API suite',
          command: 'npm run test',
          cwd: 'backend',
        },
      },
    ],
  },
  {
    id: 'phase-02',
    title: 'Transaction Model, Signatures, and Mempool',
    order: 2,
    basePriority: 9,
    description:
      'Harden the canonical transaction contract, signature pipeline, replay protection, mempool rules, and pending visibility.',
    tags: ['transactions', 'mempool', 'crypto'],
    workstreams: [
      {
        id: 'tx-schema',
        title: 'transaction schema contract',
        description:
          'canonical transaction fields, versioning, and chain-aware encoding',
        pattern: 'protocol12',
        allowedScopes: ['backend/src/blockchain/', 'backend/tests/'],
        tags: ['transactions', 'schema', 'serialization'],
        objectiveTags: ['chain', 'security'],
        verification: { label: 'Run backend protocol suite', command: 'npm run test', cwd: 'backend' },
      },
      {
        id: 'tx-domain',
        title: 'transaction domain separation',
        description:
          'chain ID binding, deterministic hashing, and replay-resistant signing domains',
        pattern: 'protocol12',
        allowedScopes: ['backend/src/blockchain/', 'backend/tests/'],
        tags: ['transactions', 'hashing', 'security'],
        objectiveTags: ['security', 'chain'],
        verification: { label: 'Run backend protocol suite', command: 'npm run test', cwd: 'backend' },
      },
      {
        id: 'tx-signatures',
        title: 'transaction signature verification',
        description:
          'Ed25519 sender derivation, signature checks, and malformed-signature rejection',
        pattern: 'protocol12',
        allowedScopes: ['backend/src/blockchain/', 'backend/tests/'],
        tags: ['transactions', 'signatures', 'crypto'],
        objectiveTags: ['security', 'chain'],
        verification: { label: 'Run backend crypto suite', command: 'npm run test', cwd: 'backend' },
      },
      {
        id: 'tx-nonce',
        title: 'nonce and replay protection',
        description:
          'account nonce validation, replay rejection, and sender sequencing guarantees',
        pattern: 'protocol12',
        allowedScopes: ['backend/src/blockchain/', 'backend/tests/'],
        tags: ['transactions', 'nonce', 'security'],
        objectiveTags: ['security', 'state'],
        verification: { label: 'Run backend protocol suite', command: 'npm run test', cwd: 'backend' },
      },
      {
        id: 'mempool-admission',
        title: 'mempool admission rules',
        description:
          'duplicate rejection, intrinsic fee checks, size limits, and malformed transaction handling',
        pattern: 'protocol12',
        allowedScopes: ['backend/src/blockchain/', 'backend/tests/'],
        tags: ['mempool', 'validation', 'transactions'],
        objectiveTags: ['chain', 'performance'],
        verification: { label: 'Run mempool suite', command: 'npm run test', cwd: 'backend' },
      },
      {
        id: 'mempool-ordering',
        title: 'mempool ordering and eviction',
        description:
          'fee-based ordering, replacement rules, TTL policies, and bounded pool behavior',
        pattern: 'protocol12',
        allowedScopes: ['backend/src/blockchain/', 'backend/tests/'],
        tags: ['mempool', 'ordering', 'performance'],
        objectiveTags: ['performance', 'chain'],
        verification: { label: 'Run mempool suite', command: 'npm run test', cwd: 'backend' },
      },
      {
        id: 'tx-status',
        title: 'pending transaction status and rejections',
        description:
          'pending transaction status surfaces, rejection reasons, and receipt correlation hooks',
        pattern: 'protocol12',
        allowedScopes: ['backend/src/blockchain/', 'backend/src/api/', 'backend/tests/'],
        tags: ['transactions', 'status', 'api'],
        objectiveTags: ['api', 'chain'],
        verification: { label: 'Run backend API suite', command: 'npm run test', cwd: 'backend' },
      },
    ],
  },
  {
    id: 'phase-03',
    title: 'State Engine, Receipts, and Storage Correctness',
    order: 3,
    basePriority: 9,
    description:
      'Make account state transitions, receipts, reversible diffs, snapshots, and proof-oriented storage surfaces deterministic.',
    tags: ['state', 'receipts', 'storage'],
    workstreams: [
      {
        id: 'account-transitions',
        title: 'account state transitions',
        description:
          'deterministic account mutation order, sender/receiver application, and nonce evolution',
        pattern: 'state12',
        allowedScopes: ['backend/src/blockchain/', 'backend/tests/'],
        tags: ['state', 'accounts', 'transitions'],
        objectiveTags: ['state', 'chain'],
        verification: { label: 'Run state suite', command: 'npm run test', cwd: 'backend' },
      },
      {
        id: 'balance-conservation',
        title: 'balance conservation',
        description:
          'total-supply conservation, fee routing, and state-root consistency for balance updates',
        pattern: 'state12',
        allowedScopes: ['backend/src/blockchain/', 'backend/tests/'],
        tags: ['state', 'balances', 'invariants'],
        objectiveTags: ['state', 'security'],
        verification: { label: 'Run state suite', command: 'npm run test', cwd: 'backend' },
      },
      {
        id: 'receipt-generation',
        title: 'transaction receipt generation',
        description:
          'status, gas usage, logs, receipt roots, and transaction-to-receipt linking',
        pattern: 'state12',
        allowedScopes: ['backend/src/blockchain/', 'backend/src/api/', 'backend/tests/'],
        tags: ['receipts', 'transactions', 'api'],
        objectiveTags: ['state', 'api'],
        verification: { label: 'Run receipt suite', command: 'npm run test', cwd: 'backend' },
      },
      {
        id: 'state-diffs',
        title: 'state diffs and rollback',
        description:
          'state diff tracking, reversible application, and reorg-safe rollback primitives',
        pattern: 'state12',
        allowedScopes: ['backend/src/blockchain/', 'backend/tests/'],
        tags: ['state', 'rollback', 'reorg'],
        objectiveTags: ['state', 'chain'],
        verification: { label: 'Run rollback suite', command: 'npm run test', cwd: 'backend' },
      },
      {
        id: 'snapshots',
        title: 'snapshot and checkpoint primitives',
        description:
          'state export/import, checkpoint records, and archival boundaries for fast recovery',
        pattern: 'state12',
        allowedScopes: ['backend/src/blockchain/', 'backend/src/api/', 'backend/tests/'],
        tags: ['state', 'snapshots', 'checkpoints'],
        objectiveTags: ['state', 'operator'],
        verification: { label: 'Run snapshot suite', command: 'npm run test', cwd: 'backend' },
      },
      {
        id: 'storage-integrity',
        title: 'storage integrity checks',
        description:
          'storage validation, corruption detection, export consistency, and restart safety',
        pattern: 'state12',
        allowedScopes: ['backend/src/blockchain/', 'backend/src/database/', 'backend/tests/'],
        tags: ['storage', 'integrity', 'database'],
        objectiveTags: ['state', 'tooling'],
        verification: { label: 'Run storage suite', command: 'npm run test', cwd: 'backend' },
      },
      {
        id: 'proof-interfaces',
        title: 'proof-oriented state interfaces',
        description:
          'state proof interfaces, trie-facing contracts, and structured proof metadata without overbuilding proofs yet',
        pattern: 'state12',
        allowedScopes: ['backend/src/blockchain/', 'backend/tests/'],
        tags: ['state', 'proofs', 'interfaces'],
        objectiveTags: ['state', 'chain'],
        verification: { label: 'Run proof interface suite', command: 'npm run test', cwd: 'backend' },
      },
    ],
  },
  {
    id: 'phase-04',
    title: 'Consensus, Finality, and Chain Lifecycle',
    order: 4,
    basePriority: 8,
    description:
      'Separate validation from production, add finality truth, reorg handling, reward accounting, and consensus diagnostics.',
    tags: ['consensus', 'finality', 'reorg'],
    workstreams: [
      {
        id: 'validation-pipeline',
        title: 'block validation pipeline separation',
        description:
          'independent validation stages for candidate blocks before production-side side effects occur',
        pattern: 'consensus13',
        allowedScopes: ['backend/src/blockchain/', 'backend/tests/'],
        tags: ['consensus', 'validation', 'blocks'],
        objectiveTags: ['consensus', 'chain'],
        verification: { label: 'Run consensus suite', command: 'npm run test', cwd: 'backend' },
      },
      {
        id: 'finality',
        title: 'finality tracking',
        description:
          'confirmation depth, canonical-vs-pending views, and finality-aware chain status',
        pattern: 'consensus13',
        allowedScopes: ['backend/src/blockchain/', 'backend/src/api/', 'backend/tests/'],
        tags: ['finality', 'api', 'consensus'],
        objectiveTags: ['consensus', 'api'],
        verification: { label: 'Run finality suite', command: 'npm run test', cwd: 'backend' },
      },
      {
        id: 'reorgs',
        title: 'reorg and fork-choice handling',
        description:
          'fork choice, late blocks, canonical chain replacement, and replay safety',
        pattern: 'consensus13',
        allowedScopes: ['backend/src/blockchain/', 'backend/tests/'],
        tags: ['consensus', 'reorg', 'fork-choice'],
        objectiveTags: ['consensus', 'state'],
        verification: { label: 'Run reorg suite', command: 'npm run test', cwd: 'backend' },
      },
      {
        id: 'rewards',
        title: 'block reward and fee accounting',
        description:
          'block rewards, fee distribution, treasury routing, and reward receipts',
        pattern: 'consensus13',
        allowedScopes: ['backend/src/blockchain/', 'backend/tests/'],
        tags: ['consensus', 'rewards', 'fees'],
        objectiveTags: ['economics', 'state'],
        verification: { label: 'Run reward suite', command: 'npm run test', cwd: 'backend' },
      },
      {
        id: 'epochs',
        title: 'epoch and validator participation metrics',
        description:
          'epoch boundaries, validator participation counters, and lifecycle observability',
        pattern: 'consensus13',
        allowedScopes: ['backend/src/blockchain/', 'backend/src/validators/', 'backend/src/api/', 'backend/tests/'],
        tags: ['consensus', 'epochs', 'validators'],
        objectiveTags: ['consensus', 'operator'],
        verification: { label: 'Run validator suite', command: 'npm run test', cwd: 'backend' },
      },
      {
        id: 'consensus-diagnostics',
        title: 'consensus failure diagnostics',
        description:
          'structured failure events, deterministic validation tests, and reorg-aware regression coverage',
        pattern: 'consensus13',
        allowedScopes: ['backend/src/blockchain/', 'backend/src/api/', 'backend/tests/'],
        tags: ['consensus', 'diagnostics', 'tests'],
        objectiveTags: ['consensus', 'tooling'],
        verification: { label: 'Run consensus suite', command: 'npm run test', cwd: 'backend' },
      },
    ],
  },
  {
    id: 'phase-05',
    title: 'RPC, Indexer, Explorer, and Query Surfaces',
    order: 5,
    basePriority: 8,
    description:
      'Add truthful read APIs, lookups, pagination, indexing, and operator/debug query surfaces on top of canonical chain data.',
    tags: ['rpc', 'indexer', 'api'],
    workstreams: [
      {
        id: 'block-rpc',
        title: 'block and account query RPC',
        description:
          'stable read APIs for block lookup, account state, and canonical chain metadata',
        pattern: 'api12',
        allowedScopes: ['backend/src/api/', 'backend/src/blockchain/', 'backend/tests/'],
        tags: ['rpc', 'blocks', 'accounts'],
        objectiveTags: ['api', 'chain'],
        verification: { label: 'Run API suite', command: 'npm run test', cwd: 'backend' },
      },
      {
        id: 'tx-rpc',
        title: 'transaction and receipt RPC',
        description:
          'transaction lookup, receipt lookup, status surfaces, and canonical hash-based resolution',
        pattern: 'api12',
        allowedScopes: ['backend/src/api/', 'backend/src/blockchain/', 'backend/tests/'],
        tags: ['rpc', 'transactions', 'receipts'],
        objectiveTags: ['api', 'chain'],
        verification: { label: 'Run API suite', command: 'npm run test', cwd: 'backend' },
      },
      {
        id: 'address-history',
        title: 'address history and lookup indexing',
        description:
          'address transaction history, signature/hash lookups, and paginated account-centric query paths',
        pattern: 'api12',
        allowedScopes: ['backend/src/api/', 'backend/src/blockchain/', 'backend/tests/'],
        tags: ['indexer', 'addresses', 'history'],
        objectiveTags: ['api', 'state'],
        verification: { label: 'Run indexer suite', command: 'npm run test', cwd: 'backend' },
      },
      {
        id: 'event-logs',
        title: 'event and log indexing',
        description:
          'event/log indexing, filters, search helpers, and lightweight materialized views',
        pattern: 'api12',
        allowedScopes: ['backend/src/api/', 'backend/src/blockchain/', 'backend/tests/'],
        tags: ['indexer', 'events', 'logs'],
        objectiveTags: ['api', 'contracts'],
        verification: { label: 'Run event indexer suite', command: 'npm run test', cwd: 'backend' },
      },
      {
        id: 'explorer-contracts',
        title: 'explorer data contracts',
        description:
          'recent block, transaction status, receipt, finality, and contract-event payloads for explorer consumers',
        pattern: 'api12',
        allowedScopes: ['backend/src/api/', 'backend/src/blockchain/', 'backend/tests/'],
        tags: ['explorer', 'api', 'contracts'],
        objectiveTags: ['api', 'operator'],
        verification: { label: 'Run API suite', command: 'npm run test', cwd: 'backend' },
      },
      {
        id: 'operator-debug',
        title: 'operator debug and consistency endpoints',
        description:
          'checkpoint metadata, snapshot health, sync state, and chain consistency inspection endpoints',
        pattern: 'api12',
        allowedScopes: ['backend/src/api/', 'backend/src/blockchain/', 'backend/tests/'],
        tags: ['operator', 'debug', 'consistency'],
        objectiveTags: ['operator', 'tooling'],
        verification: { label: 'Run operator API suite', command: 'npm run test', cwd: 'backend' },
      },
    ],
  },
  {
    id: 'phase-06',
    title: 'Wallet, Faucet, and Account Truth on Top of the Chain',
    order: 6,
    basePriority: 7,
    description:
      'Make wallet creation, import, signing, faucet issuance, and account history flow through canonical chain state and receipts.',
    tags: ['wallet', 'faucet', 'accounts'],
    workstreams: [
      {
        id: 'wallet-keys',
        title: 'wallet key creation and import',
        description:
          'canonical keypair-derived identity, import validation, and address derivation truth',
        pattern: 'wallet9',
        allowedScopes: ['backend/src/api/wallet.ts', 'backend/src/blockchain/', 'backend/tests/'],
        tags: ['wallet', 'keys', 'identity'],
        objectiveTags: ['wallet', 'security'],
        verification: { label: 'Run wallet suite', command: 'npm run test', cwd: 'backend' },
      },
      {
        id: 'wallet-submit',
        title: 'signed transaction submission',
        description:
          'wallet submission paths tied to canonical signed transaction handling and mempool admission',
        pattern: 'wallet9',
        allowedScopes: ['backend/src/api/wallet.ts', 'backend/src/blockchain/', 'backend/tests/'],
        tags: ['wallet', 'transactions', 'submission'],
        objectiveTags: ['wallet', 'chain'],
        verification: { label: 'Run wallet suite', command: 'npm run test', cwd: 'backend' },
      },
      {
        id: 'wallet-history',
        title: 'account balance and history truth',
        description:
          'balances, history, and transaction views derived from canonical chain state plus receipts',
        pattern: 'wallet9',
        allowedScopes: ['backend/src/api/wallet.ts', 'backend/src/blockchain/', 'backend/tests/'],
        tags: ['wallet', 'history', 'state'],
        objectiveTags: ['wallet', 'state'],
        verification: { label: 'Run wallet suite', command: 'npm run test', cwd: 'backend' },
      },
      {
        id: 'faucet-issuance',
        title: 'faucet chain issuance',
        description:
          'faucet mint/issue flows recorded as real chain mutations with cooldowns and receipts',
        pattern: 'wallet9',
        allowedScopes: ['backend/src/api/wallet.ts', 'backend/src/blockchain/', 'backend/tests/'],
        tags: ['faucet', 'wallet', 'receipts'],
        objectiveTags: ['wallet', 'security'],
        verification: { label: 'Run faucet suite', command: 'npm run test', cwd: 'backend' },
      },
      {
        id: 'wallet-status',
        title: 'pending and confirmed transaction account surfaces',
        description:
          'clear account-facing pending vs confirmed state contracts for wallet/explorer consumers',
        pattern: 'wallet9',
        allowedScopes: ['backend/src/api/wallet.ts', 'backend/src/api/', 'backend/src/blockchain/', 'backend/tests/'],
        tags: ['wallet', 'status', 'api'],
        objectiveTags: ['wallet', 'api'],
        verification: { label: 'Run wallet API suite', command: 'npm run test', cwd: 'backend' },
      },
      {
        id: 'wallet-safety',
        title: 'key safety and validation surfaces',
        description:
          'address validation, private-key handling rules, import/export safety, and failure surfacing',
        pattern: 'wallet9',
        allowedScopes: ['backend/src/api/wallet.ts', 'backend/tests/'],
        tags: ['wallet', 'security', 'validation'],
        objectiveTags: ['wallet', 'security'],
        verification: { label: 'Run wallet safety suite', command: 'npm run test', cwd: 'backend' },
      },
    ],
  },
  {
    id: 'phase-07',
    title: 'Contract Runtime and Token Standards',
    order: 7,
    basePriority: 7,
    description:
      'Build the minimal VM, gas accounting, deployment/call/runtime surfaces, ORC-20 truth, and a measured ORC-721 foundation.',
    tags: ['contracts', 'vm', 'tokens'],
    workstreams: [
      {
        id: 'vm-core',
        title: 'minimal VM execution model',
        description:
          'core interpreter loop, execution context, and stack/runtime lifecycle',
        pattern: 'contract12',
        allowedScopes: ['backend/src/blockchain/', 'backend/src/contracts/', 'backend/tests/'],
        tags: ['contracts', 'vm', 'runtime'],
        objectiveTags: ['contracts', 'chain'],
        verification: { label: 'Run contract runtime suite', command: 'npm run test', cwd: 'backend' },
      },
      {
        id: 'opcodes',
        title: 'opcode scaffolding',
        description:
          'opcode registration, dispatch, operand handling, and deterministic instruction semantics',
        pattern: 'contract12',
        allowedScopes: ['backend/src/blockchain/', 'backend/src/contracts/', 'backend/tests/'],
        tags: ['contracts', 'vm', 'opcodes'],
        objectiveTags: ['contracts', 'chain'],
        verification: { label: 'Run contract runtime suite', command: 'npm run test', cwd: 'backend' },
      },
      {
        id: 'gas',
        title: 'gas metering',
        description:
          'resource accounting, out-of-gas behavior, and fee coupling for runtime execution',
        pattern: 'contract12',
        allowedScopes: ['backend/src/blockchain/', 'backend/src/contracts/', 'backend/tests/'],
        tags: ['contracts', 'gas', 'fees'],
        objectiveTags: ['contracts', 'economics'],
        verification: { label: 'Run contract gas suite', command: 'npm run test', cwd: 'backend' },
      },
      {
        id: 'deploy',
        title: 'contract deployment path',
        description:
          'deployment transactions, deterministic contract addresses, and deploy receipts',
        pattern: 'contract12',
        allowedScopes: ['backend/src/blockchain/', 'backend/src/contracts/', 'backend/src/api/', 'backend/tests/'],
        tags: ['contracts', 'deployment', 'transactions'],
        objectiveTags: ['contracts', 'api'],
        verification: { label: 'Run contract deploy suite', command: 'npm run test', cwd: 'backend' },
      },
      {
        id: 'storage-calls',
        title: 'contract storage and calls',
        description:
          'contract state reads/writes, call execution, and deterministic storage ownership',
        pattern: 'contract12',
        allowedScopes: ['backend/src/blockchain/', 'backend/src/contracts/', 'backend/tests/'],
        tags: ['contracts', 'storage', 'calls'],
        objectiveTags: ['contracts', 'state'],
        verification: { label: 'Run contract storage suite', command: 'npm run test', cwd: 'backend' },
      },
      {
        id: 'events',
        title: 'contract events and receipts',
        description:
          'event emission, receipt log integration, and runtime trace visibility',
        pattern: 'contract12',
        allowedScopes: ['backend/src/blockchain/', 'backend/src/contracts/', 'backend/src/api/', 'backend/tests/'],
        tags: ['contracts', 'events', 'receipts'],
        objectiveTags: ['contracts', 'api'],
        verification: { label: 'Run contract event suite', command: 'npm run test', cwd: 'backend' },
      },
      {
        id: 'orc20-core',
        title: 'ORC-20 core token flow',
        description:
          'fungible token deployment, mint, burn, transfer, and canonical balance mutation rules',
        pattern: 'contract12',
        allowedScopes: ['backend/src/blockchain/', 'backend/src/contracts/', 'backend/tests/'],
        tags: ['contracts', 'orc20', 'token'],
        objectiveTags: ['contracts', 'economics'],
        verification: { label: 'Run ORC-20 suite', command: 'npm run test', cwd: 'backend' },
      },
      {
        id: 'orc20-allowance',
        title: 'ORC-20 allowance and approval flow',
        description:
          'approve, allowance, transferFrom, and allowance-aware receipt behavior',
        pattern: 'contract12',
        allowedScopes: ['backend/src/blockchain/', 'backend/src/contracts/', 'backend/tests/'],
        tags: ['contracts', 'orc20', 'allowance'],
        objectiveTags: ['contracts', 'economics'],
        verification: { label: 'Run ORC-20 suite', command: 'npm run test', cwd: 'backend' },
      },
      {
        id: 'orc721',
        title: 'ORC-721 foundation',
        description:
          'NFT ownership, transfer, metadata hooks, and a measured base standard after fungible flows are stable',
        pattern: 'contract12',
        allowedScopes: ['backend/src/blockchain/', 'backend/src/contracts/', 'backend/tests/'],
        tags: ['contracts', 'orc721', 'nft'],
        objectiveTags: ['contracts', 'state'],
        verification: { label: 'Run ORC-721 suite', command: 'npm run test', cwd: 'backend' },
      },
    ],
  },
  {
    id: 'phase-08',
    title: 'Node Sync, Peer Networking, and Validator Operations',
    order: 8,
    basePriority: 6,
    description:
      'Add peer discovery, gossip, sync handshakes, checkpoint/snapshot catch-up, peer health, and validator operations truth.',
    tags: ['network', 'sync', 'validators'],
    workstreams: [
      {
        id: 'peer-discovery',
        title: 'peer discovery and handshakes',
        description:
          'peer identity, capability exchange, discovery records, and authenticated handshake flow',
        pattern: 'network12',
        allowedScopes: ['backend/src/network/', 'backend/src/validators/', 'backend/src/api/', 'backend/tests/'],
        tags: ['network', 'peers', 'discovery'],
        objectiveTags: ['network', 'operator'],
        verification: { label: 'Run networking suite', command: 'npm run test', cwd: 'backend' },
      },
      {
        id: 'tx-gossip',
        title: 'transaction gossip',
        description:
          'transaction broadcast, duplicate suppression, inbound validation, and mempool propagation',
        pattern: 'network12',
        allowedScopes: ['backend/src/network/', 'backend/src/blockchain/', 'backend/tests/'],
        tags: ['network', 'transactions', 'gossip'],
        objectiveTags: ['network', 'chain'],
        verification: { label: 'Run networking suite', command: 'npm run test', cwd: 'backend' },
      },
      {
        id: 'block-gossip',
        title: 'block gossip',
        description:
          'block broadcast, late-block handling, duplicate suppression, and canonical chain propagation',
        pattern: 'network12',
        allowedScopes: ['backend/src/network/', 'backend/src/blockchain/', 'backend/tests/'],
        tags: ['network', 'blocks', 'gossip'],
        objectiveTags: ['network', 'consensus'],
        verification: { label: 'Run networking suite', command: 'npm run test', cwd: 'backend' },
      },
      {
        id: 'initial-sync',
        title: 'initial sync flow',
        description:
          'sync handshakes, block catch-up, progress tracking, and restart-safe initial node bootstrapping',
        pattern: 'network12',
        allowedScopes: ['backend/src/network/', 'backend/src/blockchain/', 'backend/src/api/', 'backend/tests/'],
        tags: ['network', 'sync', 'bootstrapping'],
        objectiveTags: ['network', 'operator'],
        verification: { label: 'Run sync suite', command: 'npm run test', cwd: 'backend' },
      },
      {
        id: 'checkpoint-sync',
        title: 'checkpoint and snapshot-assisted sync',
        description:
          'checkpoint-aware catch-up, snapshot import, and fast recovery path selection',
        pattern: 'network12',
        allowedScopes: ['backend/src/network/', 'backend/src/blockchain/', 'backend/src/api/', 'backend/tests/'],
        tags: ['network', 'snapshots', 'checkpoints'],
        objectiveTags: ['network', 'state'],
        verification: { label: 'Run sync suite', command: 'npm run test', cwd: 'backend' },
      },
      {
        id: 'validator-ops',
        title: 'validator and peer health operations',
        description:
          'validator role separation, peer scoring, topology observability, and operator repair signals',
        pattern: 'network12',
        allowedScopes: ['backend/src/network/', 'backend/src/validators/', 'backend/src/api/', 'backend/tests/'],
        tags: ['network', 'validators', 'operator'],
        objectiveTags: ['network', 'operator'],
        verification: { label: 'Run validator networking suite', command: 'npm run test', cwd: 'backend' },
      },
    ],
  },
  {
    id: 'phase-09',
    title: 'Economics, Staking, and Governance Primitives',
    order: 9,
    basePriority: 5,
    description:
      'Add truthful fee policy, treasury accounting, staking flows, and governance hooks only on top of stable state and receipts.',
    tags: ['economics', 'staking', 'governance'],
    workstreams: [
      {
        id: 'fee-market',
        title: 'fee market tuning',
        description:
          'fee parameters, fee burn vs reward policy, and deterministic fee configuration surfaces',
        pattern: 'economics9',
        allowedScopes: ['backend/src/blockchain/', 'backend/src/api/', 'backend/tests/'],
        tags: ['economics', 'fees', 'config'],
        objectiveTags: ['economics', 'chain'],
        verification: { label: 'Run economics suite', command: 'npm run test', cwd: 'backend' },
      },
      {
        id: 'treasury',
        title: 'treasury and accounting scaffolding',
        description:
          'treasury records, accounting outputs, and transparent state surfaces for economic flows',
        pattern: 'economics9',
        allowedScopes: ['backend/src/blockchain/', 'backend/src/api/', 'backend/tests/'],
        tags: ['economics', 'treasury', 'accounting'],
        objectiveTags: ['economics', 'operator'],
        verification: { label: 'Run economics suite', command: 'npm run test', cwd: 'backend' },
      },
      {
        id: 'staking',
        title: 'staking and delegation ledger',
        description:
          'staking positions, delegation, reward accrual, cooldowns, and unstake accounting',
        pattern: 'economics9',
        allowedScopes: ['backend/src/blockchain/', 'backend/src/api/', 'backend/tests/'],
        tags: ['staking', 'economics', 'validators'],
        objectiveTags: ['economics', 'state'],
        verification: { label: 'Run staking suite', command: 'npm run test', cwd: 'backend' },
      },
      {
        id: 'governance',
        title: 'governance parameters and execution hooks',
        description:
          'proposal state, voting hooks, and parameter update execution after finality and receipts are trustworthy',
        pattern: 'economics9',
        allowedScopes: ['backend/src/blockchain/', 'backend/src/api/', 'backend/tests/'],
        tags: ['governance', 'economics', 'parameters'],
        objectiveTags: ['governance', 'economics'],
        verification: { label: 'Run governance suite', command: 'npm run test', cwd: 'backend' },
      },
    ],
  },
  {
    id: 'phase-10',
    title: 'Security, Tests, Docs, and Operator Hardening',
    order: 10,
    basePriority: 5,
    description:
      'Finish with invariants, adversarial cases, threat models, operator runbooks, and docs that match the real implementation.',
    tags: ['security', 'tests', 'docs'],
    workstreams: [
      {
        id: 'invariants',
        title: 'protocol invariants and property checks',
        description:
          'balance, nonce, receipt, and reorg invariants expressed as deterministic checks',
        pattern: 'hardening9',
        allowedScopes: ['backend/tests/', 'backend/src/blockchain/', 'backend/package.json', 'backend/tsconfig.json'],
        tags: ['security', 'invariants', 'tests'],
        objectiveTags: ['security', 'tooling'],
        verification: { label: 'Run hardening suite', command: 'npm run test', cwd: 'backend' },
      },
      {
        id: 'adversarial',
        title: 'adversarial transaction and block cases',
        description:
          'malformed transaction/block cases, fuzz-style inputs, and mempool abuse regressions',
        pattern: 'hardening9',
        allowedScopes: ['backend/tests/', 'backend/src/blockchain/', 'backend/package.json', 'backend/tsconfig.json'],
        tags: ['security', 'fuzzing', 'mempool'],
        objectiveTags: ['security', 'chain'],
        verification: { label: 'Run hardening suite', command: 'npm run test', cwd: 'backend' },
      },
      {
        id: 'runbooks',
        title: 'threat models and incident runbooks',
        description:
          'threat models for replay, reorgs, faucet abuse, peer abuse, and operator incident response',
        pattern: 'hardening9',
        allowedScopes: ['backend/docs/', 'backend/src/api/', 'backend/src/blockchain/', 'backend/tests/'],
        tags: ['security', 'docs', 'runbooks'],
        objectiveTags: ['security', 'operator'],
        verification: { label: 'Run backend build', command: 'npm run build', cwd: 'backend' },
      },
      {
        id: 'protocol-docs',
        title: 'protocol and operator documentation truth',
        description:
          'local protocol docs, operator notes, and consistency tooling that match what the node really does',
        pattern: 'hardening9',
        allowedScopes: ['backend/docs/', 'backend/src/api/', 'backend/src/blockchain/', 'backend/tests/'],
        tags: ['docs', 'operator', 'protocol'],
        objectiveTags: ['documentation', 'operator'],
        verification: { label: 'Run backend build', command: 'npm run build', cwd: 'backend' },
      },
    ],
  },
];

function createBacklog(): BacklogTask[] {
  const tasks: BacklogTask[] = [];
  let sequence = 0;

  for (const phase of PHASE_BLUEPRINTS) {
    for (const workstream of phase.workstreams) {
      const pattern = PATTERN_LIBRARY[workstream.pattern];

      for (let index = 0; index < pattern.length; index += 1) {
        const step = pattern[index];
        sequence += 1;

        tasks.push({
          id: `${phase.id}:${workstream.id}:${pad2(index + 1)}`,
          title: `${step.titlePrefix} ${workstream.title}`,
          description: [
            `${phase.title} microtask ${index + 1}/${pattern.length} for ${workstream.title}.`,
            renderTemplate(step.description, workstream, phase, index, pattern.length),
            `Allowed scopes: ${workstream.allowedScopes.join(', ')}.`,
          ].join(' '),
          type: step.type,
          priority: clampPriority(phase.basePriority + (step.priorityOffset || 0)),
          estimatedMinutes: COMMIT_WINDOW_MINUTES,
          commitWindowMinutes: COMMIT_WINDOW_MINUTES,
          phaseId: phase.id,
          phaseTitle: phase.title,
          phaseOrder: phase.order,
          workstreamId: workstream.id,
          workstreamTitle: workstream.title,
          sequence,
          tags: unique([...phase.tags, ...workstream.tags, ...(step.tags || [])]),
          objectiveTags: unique(workstream.objectiveTags),
          allowedScopes: unique(workstream.allowedScopes),
          verification: workstream.verification,
          expectedOutcome: renderTemplate(
            step.expectedOutcome,
            workstream,
            phase,
            index,
            pattern.length
          ),
        });
      }
    }
  }

  return tasks;
}

export const TASK_BACKLOG: BacklogTask[] = createBacklog();

export const BACKLOG_PHASES: BacklogPhaseSummary[] = PHASE_BLUEPRINTS.map((phase) => ({
  id: phase.id,
  title: phase.title,
  order: phase.order,
  commitCount: phase.workstreams.reduce(
    (total, workstream) => total + PATTERN_LIBRARY[workstream.pattern].length,
    0
  ),
  workstreamCount: phase.workstreams.length,
  description: phase.description,
  tags: phase.tags,
}));

if (TASK_BACKLOG.length !== TARGET_COMMIT_WINDOWS) {
  throw new Error(
    `[BACKLOG] Expected ${TARGET_COMMIT_WINDOWS} tasks, generated ${TASK_BACKLOG.length}.`
  );
}

const totalMinutes = TASK_BACKLOG.reduce((sum, task) => sum + task.estimatedMinutes, 0);
const expectedMinutes = TARGET_COMMIT_WINDOWS * COMMIT_WINDOW_MINUTES;
if (totalMinutes !== expectedMinutes) {
  console.warn(
    `[BACKLOG] Expected ${expectedMinutes} planned minutes, got ${totalMinutes}. Continuing — backlog is advisory.`
  );
}

export function getOrderedBacklog(): BacklogTask[] {
  return TASK_BACKLOG.slice().sort((a, b) => a.sequence - b.sequence);
}

export function getTasksByPriority(): BacklogTask[] {
  return TASK_BACKLOG.slice().sort((a, b) => b.priority - a.priority || a.sequence - b.sequence);
}

export function getTasksByType(type?: BacklogTaskType): BacklogTask[] {
  return TASK_BACKLOG
    .filter((task) => (type ? task.type === type : true))
    .sort((a, b) => a.sequence - b.sequence);
}

export function getTasksByPhase(phaseId?: string): BacklogTask[] {
  return TASK_BACKLOG
    .filter((task) => (phaseId ? task.phaseId === phaseId : true))
    .sort((a, b) => a.sequence - b.sequence);
}

export function getTotalEstimatedTime(): {
  minutes: number;
  hours: number;
  days: number;
  commitWindows: number;
  commitWindowMinutes: number;
} {
  const minutes = TASK_BACKLOG.reduce((sum, task) => sum + task.estimatedMinutes, 0);
  return {
    minutes,
    hours: minutes / 60,
    days: minutes / 60 / 24,
    commitWindows: TASK_BACKLOG.length,
    commitWindowMinutes: COMMIT_WINDOW_MINUTES,
  };
}

export function getNextBacklogTask(): BacklogTask | undefined {
  return getOrderedBacklog().find((task) => !COMPLETED_TASKS.has(task.id));
}

export function markBacklogTaskComplete(taskId: string): void {
  COMPLETED_TASKS.add(taskId);
}

export function getBacklogProgress(): { completed: number; total: number; percent: number } {
  const total = TASK_BACKLOG.length;
  const completed = COMPLETED_TASKS.size;
  return {
    completed,
    total,
    percent: total === 0 ? 0 : Math.round((completed / total) * 100),
  };
}

console.log(
  `[BACKLOG] Loaded ${TASK_BACKLOG.length} protocol microtasks ` +
    `(${TARGET_COMMIT_HOURS}h at ${COMMIT_WINDOW_MINUTES}m windows) starting ${new Date(
      BACKLOG_ANCHOR_TIME
    ).toISOString()}`
);
