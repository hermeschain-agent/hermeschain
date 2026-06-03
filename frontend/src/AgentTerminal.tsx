import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { API_BASE, apiUrl } from './api';
import {
  AmbientCursor,
  startLiveAgentFeed,
  TerminalBlock,
  PathChip,
} from './liveAgentFeed';

interface Task {
  id: string;
  title: string;
  type: string;
  agent: string;
}

interface Decision {
  action: string;
  reasoning: string;
}

interface CompletedTask {
  title: string;
  agent: string;
  completedAt: string;
}

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

interface AgentState {
  isWorking: boolean;
  currentTask: Task | null;
  currentOutput: string;
  completedTasks: CompletedTask[];
  viewerCount: number;
  brainActive: boolean;
  currentDecision: Decision | null;
  mode: AgentMode;
  streamMode: AgentMode;
  runStatus: TaskRunStatus;
  verificationStatus: VerificationStatus;
  blockedReason: string | null;
  lastFailure: string | null;
  repoRootHealth: 'ready' | 'missing';
  startupIssues: string[];
  blockHeight: number;
  genesisTimestamp: number;
}

interface AgentTerminalProps {
  variant?: 'rail' | 'embedded';
  recentCommits?: Array<{
    hash?: string;
    shortHash: string;
    message: string;
    author?: string;
    date: string;
  }>;
  commitCount?: number;
}

const INITIAL_STATE: AgentState = {
  isWorking: false,
  currentTask: null,
  currentOutput: '',
  completedTasks: [],
  viewerCount: 0,
  brainActive: false,
  currentDecision: null,
  mode: 'disabled',
  streamMode: 'disabled',
  runStatus: 'idle',
  verificationStatus: 'pending',
  blockedReason: null,
  lastFailure: null,
  repoRootHealth: 'missing',
  startupIssues: [],
  blockHeight: 0,
  genesisTimestamp: 0,
};

const BLOCKS_STORAGE_KEY = 'hermeschain-terminal-state-v3';
const MAX_BLOCKS = 120;
const REAL_EVENT_QUIET_MS = 10_000;
const COMMIT_PLAYBACK_BATCH_LIMIT = 8;
const COMMIT_PLAYBACK_FETCH_DELAY_MS = 1200;
const COMMIT_PLAYBACK_ERROR_BACKOFF_MS = 15_000;
const SYNTHETIC_FALLBACK_QUIET_MS = 18_000;
const MALFORMED_TEXT = 'output withheld: malformed stream event';
const CONTROL_CHARS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g;
const REAL_WORK_EVENTS = new Set([
  'task_start',
  'timeline',
  'text',
  'tool_start',
  'tool_result',
  'verification_start',
  'verification_result',
  'task_complete',
  'error',
]);

interface TimelinePreview {
  path: string | null;
  language: string | null;
  content: string;
  truncated?: boolean;
}

interface AgentTimelineEvent {
  id: string;
  kind: string;
  text: string;
  timestamp: string;
  runId?: string;
  commitHash?: string;
  href?: string;
  preview?: TimelinePreview;
}

type CommitPlaybackKind =
  | 'commit_start'
  | 'file_start'
  | 'diff_chunk'
  | 'commit_complete';

interface CommitPlaybackEvent {
  id: string;
  kind: CommitPlaybackKind;
  text: string;
  timestamp: string;
  commitHash: string;
  shortHash: string;
  href: string;
  message: string;
  path?: string;
  language?: string;
  nextCursor?: string;
}

interface CommitPlaybackResponse {
  repo: string;
  commitCount: number;
  cursor: string;
  nextCursor: string;
  events: CommitPlaybackEvent[];
  stale?: boolean;
  fallback?: string;
}

interface TerminalCache {
  blocks: TerminalBlock[];
  typedMap: Record<string, number>;
  lastEventId: string | null;
  ambientCursor: AmbientCursor;
  commitPlaybackCursor: string | null;
}

const EMPTY_AMBIENT_CURSOR: AmbientCursor = {
  workstreamIndex: 0,
  stepIndex: 0,
  cycle: 0,
};

function applyStatusPayload(payload: any, previous: AgentState): AgentState {
  const completedTasks =
    Array.isArray(payload?.recentTasks) && payload.recentTasks.length > 0
      ? payload.recentTasks.map((task: any) => ({
          title: task.title,
          agent: task.agent || 'HERMES',
          completedAt:
            typeof task.completedAt === 'string'
              ? task.completedAt
              : new Date(task.completedAt || Date.now()).toISOString(),
        }))
      : previous.completedTasks;

  return {
    ...previous,
    isWorking:
      typeof payload?.isWorking === 'boolean'
        ? payload.isWorking
        : previous.isWorking,
    currentTask: payload?.currentTask || previous.currentTask,
    currentOutput:
      typeof payload?.currentOutput === 'string'
        ? payload.currentOutput
        : previous.currentOutput,
    completedTasks,
    viewerCount:
      typeof payload?.viewerCount === 'number'
        ? payload.viewerCount
        : previous.viewerCount,
    brainActive:
      (payload?.mode || previous.mode) === 'real' &&
      payload?.agentEnabled !== false,
    currentDecision: payload?.currentDecision || previous.currentDecision,
    mode: payload?.mode || previous.mode,
    streamMode: payload?.streamMode || payload?.mode || previous.streamMode,
    runStatus: payload?.runStatus || previous.runStatus,
    verificationStatus:
      payload?.verificationStatus || previous.verificationStatus,
    blockedReason:
      payload?.blockedReason === undefined
        ? previous.blockedReason
        : payload.blockedReason,
    lastFailure:
      payload?.lastFailure === undefined
        ? previous.lastFailure
        : payload.lastFailure,
    repoRootHealth: payload?.repoRootHealth || previous.repoRootHealth,
    startupIssues: Array.isArray(payload?.startupIssues)
      ? payload.startupIssues
      : previous.startupIssues,
    blockHeight:
      typeof payload?.blockHeight === 'number'
        ? payload.blockHeight
        : previous.blockHeight,
    genesisTimestamp:
      typeof payload?.genesisTimestamp === 'number'
        ? payload.genesisTimestamp
        : previous.genesisTimestamp,
  };
}

type Stage = 'IDLE' | 'RUN' | 'VERIFY' | 'ANALYZE' | 'EXEC' | 'HALTED';

function deriveStageLabel(state: AgentState): Stage {
  if (state.mode === 'disabled') return 'HALTED';
  if (state.runStatus === 'verifying') return 'VERIFY';
  if (state.runStatus === 'executing') return 'EXEC';
  if (state.runStatus === 'analyzing') return 'ANALYZE';
  if (state.isWorking) return 'RUN';
  return 'IDLE';
}

function formatUptime(genesis: number, nowMs: number): string {
  if (!genesis) return '0m';
  const delta = Math.max(0, Math.floor((nowMs - genesis) / 1000));
  const d = Math.floor(delta / 86400);
  const h = Math.floor((delta % 86400) / 3600);
  const m = Math.floor((delta % 3600) / 60);
  if (d > 0) return `${d}d ${h}h ${m}m`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

function normalizeAmbientCursor(value: any): AmbientCursor {
  return {
    workstreamIndex: Math.max(0, Math.floor(Number(value?.workstreamIndex) || 0)),
    stepIndex: Math.max(0, Math.floor(Number(value?.stepIndex) || 0)),
    cycle: Math.max(0, Math.floor(Number(value?.cycle) || 0)),
  };
}

function terminalStorageKey(variant: 'rail' | 'embedded'): string {
  return `${BLOCKS_STORAGE_KEY}-${variant}`;
}

function loadTerminalCache(storageKey: string): TerminalCache {
  try {
    const raw = window.localStorage.getItem(storageKey);
    if (!raw) {
      return {
        blocks: [],
        typedMap: {},
        lastEventId: null,
        ambientCursor: EMPTY_AMBIENT_CURSOR,
        commitPlaybackCursor: null,
      };
    }
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      return {
        blocks: parsed.slice(-MAX_BLOCKS),
        typedMap: {},
        lastEventId: null,
        ambientCursor: EMPTY_AMBIENT_CURSOR,
        commitPlaybackCursor: null,
      };
    }

    return {
      blocks: Array.isArray(parsed.blocks) ? parsed.blocks.slice(-MAX_BLOCKS) : [],
      typedMap:
        parsed.typedMap && typeof parsed.typedMap === 'object'
          ? parsed.typedMap
          : {},
      lastEventId:
        typeof parsed.lastEventId === 'string' ? parsed.lastEventId : null,
      ambientCursor: normalizeAmbientCursor(parsed.ambientCursor),
      commitPlaybackCursor:
        typeof parsed.commitPlaybackCursor === 'string'
          ? parsed.commitPlaybackCursor
          : null,
    };
  } catch {
    return {
      blocks: [],
      typedMap: {},
      lastEventId: null,
      ambientCursor: EMPTY_AMBIENT_CURSOR,
      commitPlaybackCursor: null,
    };
  }
}

function saveTerminalCache(storageKey: string, cache: TerminalCache): void {
  try {
    window.localStorage.setItem(
      storageKey,
      JSON.stringify({
        ...cache,
        blocks: cache.blocks.slice(-MAX_BLOCKS),
      }),
    );
  } catch {
    /* noop */
  }
}

function hasRepeatedTokens(value: string): boolean {
  const tokens = value.trim().split(/\s+/).filter(Boolean);
  if (tokens.length < 24) return false;
  const counts = new Map<string, number>();
  let max = 0;
  for (const token of tokens) {
    const key = token.toLowerCase();
    const next = (counts.get(key) || 0) + 1;
    counts.set(key, next);
    max = Math.max(max, next);
  }
  return max / tokens.length > 0.45;
}

function capTerminalLine(line: string): string {
  if (line.length <= 320) return line;
  return `${line.slice(0, 319)}…`;
}

function sanitizeTerminalText(value: unknown): string {
  if (typeof value !== 'string') return MALFORMED_TEXT;
  const normalized = value
    .replace(/\r\n?/g, '\n')
    .replace(CONTROL_CHARS, '')
    .trim();
  if (!normalized || hasRepeatedTokens(normalized)) return MALFORMED_TEXT;
  return normalized
    .slice(0, 4000)
    .split('\n')
    .map(capTerminalLine)
    .join('\n');
}

function sanitizeTerminalBlock(block: TerminalBlock): TerminalBlock {
  if (block.kind === 'paragraph') {
    return { ...block, text: sanitizeTerminalText(block.text) };
  }
  if (block.kind === 'code') {
    return { ...block, code: sanitizeTerminalText(block.code) };
  }
  return { ...block, message: sanitizeTerminalText(block.message) };
}

function typedContentLength(block: TerminalBlock): number {
  if (block.kind === 'paragraph') return block.text.length;
  if (block.kind === 'code') return block.code.length;
  return 0;
}

function blockFingerprint(block: TerminalBlock): string {
  if (block.kind === 'paragraph') return `p:${block.text}`;
  if (block.kind === 'code') return `c:${block.path}:${block.code}`;
  return `m:${block.href || ''}:${block.message}`;
}

function isRepeatedBlock(blocks: TerminalBlock[], block: TerminalBlock): boolean {
  const fingerprint = blockFingerprint(block);
  return blocks.slice(-6).some((existing) => blockFingerprint(existing) === fingerprint);
}

function chipsForPath(text: string, path?: string): PathChip[] | undefined {
  if (!path) return undefined;
  const at = text.indexOf(path);
  return at >= 0 ? [{ at, length: path.length }] : undefined;
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function playbackDelay(event: CommitPlaybackEvent): number {
  if (event.kind === 'diff_chunk') return 900;
  if (event.kind === 'file_start') return 650;
  if (event.kind === 'commit_complete') return 1000;
  return 700;
}

/**
 * Render a paragraph with inline path chips wrapped in styled spans.
 * Chips describe character offsets within the text; the renderer walks
 * the text once and yields alternating plain-text / chip spans.
 */
function renderParagraph(
  text: string,
  chips: PathChip[] | undefined,
): React.ReactNode {
  if (!chips || chips.length === 0) return text;
  const sorted = [...chips].sort((a, b) => a.at - b.at);
  const parts: React.ReactNode[] = [];
  let cursor = 0;
  sorted.forEach((chip, i) => {
    if (chip.at > cursor) {
      parts.push(text.slice(cursor, chip.at));
    }
    parts.push(
      <span key={`chip-${i}`} className="terminal__path-chip">
        {text.slice(chip.at, chip.at + chip.length)}
      </span>,
    );
    cursor = chip.at + chip.length;
  });
  if (cursor < text.length) {
    parts.push(text.slice(cursor));
  }
  return parts;
}

const AgentTerminal: React.FC<AgentTerminalProps> = ({
  variant = 'rail',
  recentCommits = [],
  commitCount = 0,
}) => {
  const initialCacheRef = useRef<TerminalCache | null>(null);
  if (initialCacheRef.current === null) {
    initialCacheRef.current = loadTerminalCache(terminalStorageKey(variant));
  }
  const initialCache = initialCacheRef.current;
  const [state, setState] = useState<AgentState>(INITIAL_STATE);
  const [blocks, setBlocks] = useState<TerminalBlock[]>(() => initialCache.blocks);
  const [typedMap, setTypedMap] = useState<Record<string, number>>(
    () => initialCache.typedMap,
  );
  const [lastEventId, setLastEventId] = useState<string | null>(
    () => initialCache.lastEventId,
  );
  const [ambientCursor, setAmbientCursor] = useState<AmbientCursor>(
    () => initialCache.ambientCursor,
  );
  const [commitPlaybackCursor, setCommitPlaybackCursor] = useState<string | null>(
    () => initialCache.commitPlaybackCursor,
  );
  const [terminalCommitCount, setTerminalCommitCount] = useState(commitCount);

  const typeTimersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(
    new Map(),
  );
  const bodyRef = useRef<HTMLDivElement>(null);
  const feedHandleRef = useRef<{ stop: () => void; pause: () => void } | null>(
    null,
  );
  const seenEventIdsRef = useRef<Set<string>>(
    new Set(initialCache.blocks.map((block) => block.eventId).filter(Boolean) as string[]),
  );
  const seenEventOrderRef = useRef<string[]>(
    initialCache.blocks.map((block) => block.eventId).filter(Boolean) as string[],
  );
  const lastEventIdRef = useRef<string | null>(initialCache.lastEventId);
  const ambientCursorRef = useRef<AmbientCursor>(initialCache.ambientCursor);
  const commitPlaybackCursorRef = useRef<string | null>(
    initialCache.commitPlaybackCursor,
  );
  const lastRealEventAtRef = useRef(0);
  const lastCommitPlaybackAtRef = useRef(Date.now());
  const lastCommitPlaybackFailureAtRef = useRef(0);
  const realTaskActiveRef = useRef(false);
  const resumedTypewritersRef = useRef(false);

  // Persist terminal cache on every meaningful change.
  useEffect(() => {
    saveTerminalCache(terminalStorageKey(variant), {
      blocks,
      typedMap,
      lastEventId,
      ambientCursor,
      commitPlaybackCursor,
    });
  }, [ambientCursor, blocks, commitPlaybackCursor, lastEventId, typedMap, variant]);

  useEffect(() => {
    lastEventIdRef.current = lastEventId;
  }, [lastEventId]);

  useEffect(() => {
    ambientCursorRef.current = ambientCursor;
  }, [ambientCursor]);

  useEffect(() => {
    commitPlaybackCursorRef.current = commitPlaybackCursor;
  }, [commitPlaybackCursor]);

  useEffect(() => {
    setTerminalCommitCount((prev) =>
      Math.max(prev, commitCount, recentCommits.length),
    );
  }, [commitCount, recentCommits]);

  useEffect(() => {
    realTaskActiveRef.current = state.isWorking && state.runStatus !== 'idle';
  }, [state.isWorking, state.runStatus]);

  // Drive a variable-speed typewriter for prose and code blocks.
  const startTypewriter = useCallback((block: TerminalBlock, startAt = 0) => {
    if (block.kind !== 'paragraph' && block.kind !== 'code') return;
    const text = block.kind === 'paragraph' ? block.text : block.code;
    if (block.kind === 'paragraph' && block.instant) {
      setTypedMap((m) => ({ ...m, [block.id]: text.length }));
      return;
    }
    const existing = typeTimersRef.current.get(block.id);
    if (existing) clearTimeout(existing);

    const tick = (idx: number) => {
      setTypedMap((m) => ({ ...m, [block.id]: idx }));
      if (idx >= text.length) {
        typeTimersRef.current.delete(block.id);
        return;
      }
      const ch = text[idx];
      let delay =
        block.kind === 'code'
          ? 3 + Math.random() * 9
          : 12 + Math.random() * 24;
      if (block.kind === 'code' && ch === '\n') delay = 20 + Math.random() * 35;
      if (block.kind === 'paragraph' && (ch === '.' || ch === '!' || ch === '?')) {
        delay = 90 + Math.random() * 90;
      }
      if (block.kind === 'paragraph' && ch === ',') delay = 60 + Math.random() * 40;
      if (block.kind === 'paragraph' && ch === ' ') delay = 8 + Math.random() * 14;
      const t = setTimeout(() => tick(idx + 1), delay);
      typeTimersRef.current.set(block.id, t);
    };
    tick(Math.min(Math.max(startAt, 0), text.length));
  }, []);

  const appendBlock = useCallback(
    (block: TerminalBlock) => {
      const safeBlock = sanitizeTerminalBlock(block);
      if (safeBlock.eventId && seenEventIdsRef.current.has(safeBlock.eventId)) {
        return;
      }
      setBlocks((prev) => {
        if (isRepeatedBlock(prev, safeBlock)) {
          return prev;
        }
        const next = [...prev, safeBlock].slice(-MAX_BLOCKS);
        return next;
      });
      if (safeBlock.eventId) {
        seenEventIdsRef.current.add(safeBlock.eventId);
        seenEventOrderRef.current.push(safeBlock.eventId);
        while (seenEventOrderRef.current.length > 1500) {
          const staleEventId = seenEventOrderRef.current.shift();
          if (staleEventId) seenEventIdsRef.current.delete(staleEventId);
        }
      }
      // Commits reveal fully; prose and code animate like Hermes is typing.
      if (
        safeBlock.kind === 'code' ||
        (safeBlock.kind === 'paragraph' && !safeBlock.instant)
      ) {
        startTypewriter(safeBlock);
      } else {
        setTypedMap((m) => ({
          ...m,
          [safeBlock.id]: typedContentLength(safeBlock),
        }));
      }
    },
    [startTypewriter],
  );

  const resetBlocks = useCallback(() => {
    // Don't wipe on task boundary — keep scrollback continuous.
  }, []);

  const pauseFeed = useCallback(() => {
    feedHandleRef.current?.pause();
  }, []);

  const markRealEvent = useCallback(() => {
    lastRealEventAtRef.current = Date.now();
    pauseFeed();
  }, [pauseFeed]);

  const markCommitPlaybackEvent = useCallback(() => {
    lastCommitPlaybackAtRef.current = Date.now();
    pauseFeed();
  }, [pauseFeed]);

  const updateCommitPlaybackCursor = useCallback((cursor: string | null) => {
    commitPlaybackCursorRef.current = cursor;
    setCommitPlaybackCursor(cursor);
  }, []);

  const appendTimelineEvent = useCallback(
    (event: AgentTimelineEvent) => {
      if (!event?.id) return;
      markRealEvent();
      setLastEventId(event.id);

      if (event.kind === 'task_start') {
        realTaskActiveRef.current = true;
        setState((prev) => ({ ...prev, isWorking: true, runStatus: 'selected' }));
      } else if (event.kind === 'analysis') {
        realTaskActiveRef.current = true;
        setState((prev) => ({ ...prev, isWorking: true, runStatus: 'analyzing' }));
      } else if (event.kind === 'tool' || event.kind === 'tool_result') {
        realTaskActiveRef.current = true;
        setState((prev) => ({ ...prev, isWorking: true, runStatus: 'executing' }));
      } else if (event.kind === 'verification' || event.kind === 'verification_result') {
        realTaskActiveRef.current = true;
        setState((prev) => ({
          ...prev,
          isWorking: true,
          runStatus: 'verifying',
          verificationStatus:
            event.kind === 'verification' ? 'running' : prev.verificationStatus,
        }));
      } else if (
        event.kind === 'task_complete' ||
        event.kind === 'task_blocked' ||
        event.kind === 'error'
      ) {
        realTaskActiveRef.current = false;
        setState((prev) => ({
          ...prev,
          isWorking: false,
          runStatus: event.kind === 'task_blocked' ? 'blocked' : 'idle',
          verificationStatus: event.kind === 'error' ? 'failed' : prev.verificationStatus,
        }));
      }

      if (event.commitHash && event.href) {
        appendBlock({
          kind: 'commit',
          id: `timeline-commit-${event.id}`,
          eventId: event.id,
          message: event.commitHash.slice(0, 8),
          commitHash: event.commitHash,
          href: event.href,
          label: 'commited',
        });
      } else {
        appendBlock({
          kind: 'paragraph',
          id: `timeline-${event.id}`,
          eventId: event.id,
          text: event.text,
          instant: true,
        });
      }

      if (event.preview?.content) {
        appendBlock({
          kind: 'code',
          id: `timeline-preview-${event.id}`,
          eventId: `${event.id}:preview`,
          path: event.preview.path || 'write_file',
          language: event.preview.language || 'text',
          code: event.preview.content,
        });
      }
    },
    [appendBlock, markRealEvent],
  );

  const appendCommitPlaybackEvent = useCallback(
    (event: CommitPlaybackEvent) => {
      if (!event?.id) return;
      markCommitPlaybackEvent();

      if (event.nextCursor) {
        updateCommitPlaybackCursor(event.nextCursor);
      }

      if (event.kind === 'commit_start') {
        const title = event.message.split('\n')[0].trim() || 'GitHub commit';
        setState((prev) => ({
          ...prev,
          mode: 'real',
          streamMode: 'real',
          isWorking: true,
          runStatus: 'selected',
          verificationStatus: 'pending',
          currentTask: {
            id: `github:${event.commitHash}`,
            title,
            type: 'github-commit',
            agent: 'HERMES',
          },
        }));
        appendBlock({
          kind: 'paragraph',
          id: `github-start-${event.id}`,
          eventId: event.id,
          text: event.text,
        });
        return;
      }

      if (event.kind === 'file_start') {
        setState((prev) => ({
          ...prev,
          isWorking: true,
          runStatus: 'executing',
        }));
        appendBlock({
          kind: 'paragraph',
          id: `github-file-${event.id}`,
          eventId: event.id,
          text: event.text,
          chips: chipsForPath(event.text, event.path),
        });
        return;
      }

      if (event.kind === 'diff_chunk') {
        setState((prev) => ({
          ...prev,
          isWorking: true,
          runStatus: 'executing',
        }));
        appendBlock({
          kind: 'code',
          id: `github-diff-${event.id}`,
          eventId: event.id,
          path: event.path || 'git.diff',
          language: event.language || 'diff',
          code: event.text,
        });
        return;
      }

      if (event.kind === 'commit_complete') {
        setState((prev) => ({
          ...prev,
          isWorking: false,
          runStatus: 'succeeded',
          verificationStatus: 'passed',
        }));
        appendBlock({
          kind: 'commit',
          id: `github-commit-${event.id}`,
          eventId: event.id,
          message: event.shortHash,
          commitHash: event.commitHash,
          href: event.href,
          label: 'commited',
        });
      }
    },
    [appendBlock, markCommitPlaybackEvent, updateCommitPlaybackCursor],
  );

  // Scroll to bottom whenever content grows.
  useEffect(() => {
    if (bodyRef.current) {
      bodyRef.current.scrollTop = bodyRef.current.scrollHeight;
    }
  }, [blocks, typedMap]);

  // Initial status fetch.
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(apiUrl('/api/agent/status'));
        if (!res.ok) return;
        const data = await res.json();
        setState((prev) => applyStatusPayload(data, prev));
      } catch {
        /* noop */
      }
    })();
  }, []);

  // Resume any in-flight typewriter positions from localStorage.
  useEffect(() => {
    if (resumedTypewritersRef.current) return;
    resumedTypewritersRef.current = true;
    setTypedMap((prev) => {
      const next = { ...prev };
      for (const b of blocks) {
        if ((b.kind === 'paragraph' || b.kind === 'code') && next[b.id] === undefined) {
          next[b.id] = typedContentLength(b);
        }
      }
      return next;
    });
    for (const block of blocks) {
      if (block.kind !== 'paragraph' && block.kind !== 'code') continue;
      if (block.kind === 'paragraph' && block.instant) continue;
      const length = typedContentLength(block);
      const typed = typedMap[block.id] ?? length;
      if (typed < length) {
        startTypewriter(block, typed);
      }
    }
  }, [blocks, startTypewriter, typedMap, variant]);

  // GitHub commit playback owns the quiet-state feed. It walks real commit
  // diffs with an opaque backend cursor, then synthetic workstreams only fill
  // gaps if this loop is delayed or unavailable.
  useEffect(() => {
    let cancelled = false;
    let timer: number | undefined;

    const schedule = (ms: number) => {
      if (cancelled) return;
      if (timer) window.clearTimeout(timer);
      timer = window.setTimeout(() => void pump(), ms);
    };

    const canReplayCommit = () =>
      !realTaskActiveRef.current &&
      Date.now() - lastRealEventAtRef.current > REAL_EVENT_QUIET_MS;

    async function pump() {
      if (cancelled) return;
      if (!canReplayCommit()) {
        schedule(1000);
        return;
      }

      try {
        const params = new URLSearchParams({
          limit: String(COMMIT_PLAYBACK_BATCH_LIMIT),
        });
        if (commitPlaybackCursorRef.current) {
          params.set('cursor', commitPlaybackCursorRef.current);
        }

        const response = await fetch(
          `${API_BASE}/api/git/commit-playback?${params.toString()}`,
        );
        if (!response.ok) throw new Error('commit playback unavailable');

        const data = (await response.json()) as CommitPlaybackResponse;
        if (cancelled) return;

        if (typeof data.commitCount === 'number') {
          setTerminalCommitCount((prev) => Math.max(prev, data.commitCount));
        }

        const events = Array.isArray(data.events) ? data.events : [];
        if (events.length === 0) {
          lastCommitPlaybackFailureAtRef.current = Date.now();
          if (data.nextCursor) updateCommitPlaybackCursor(data.nextCursor);
          schedule(COMMIT_PLAYBACK_ERROR_BACKOFF_MS);
          return;
        }

        lastCommitPlaybackFailureAtRef.current = 0;
        for (const event of events) {
          while (!cancelled && !canReplayCommit()) {
            await wait(1000);
          }
          if (cancelled) return;
          appendCommitPlaybackEvent(event);
          await wait(playbackDelay(event));
        }

        if (data.nextCursor) {
          updateCommitPlaybackCursor(data.nextCursor);
        }
        schedule(COMMIT_PLAYBACK_FETCH_DELAY_MS);
      } catch {
        lastCommitPlaybackFailureAtRef.current = Date.now();
        schedule(COMMIT_PLAYBACK_ERROR_BACKOFF_MS);
      }
    }

    schedule(500);
    return () => {
      cancelled = true;
      if (timer) window.clearTimeout(timer);
    };
  }, [appendCommitPlaybackEvent, updateCommitPlaybackCursor]);

  // Ambient feed that fills quiet space between real worker events.
  useEffect(() => {
    const handle = startLiveAgentFeed({
      appendBlock,
      resetBlocks,
      patchState: (updater) => setState((prev) => updater(prev) as AgentState),
    }, {
      initialCursor: ambientCursorRef.current,
      onCursor: (cursor) => {
        ambientCursorRef.current = cursor;
        setAmbientCursor(cursor);
      },
      canRun: () =>
        !realTaskActiveRef.current &&
        Date.now() - lastRealEventAtRef.current > REAL_EVENT_QUIET_MS &&
        Date.now() - lastCommitPlaybackAtRef.current > SYNTHETIC_FALLBACK_QUIET_MS,
    });
    feedHandleRef.current = handle;
    return () => {
      handle.stop();
      feedHandleRef.current = null;
    };
  }, [variant, appendBlock, resetBlocks]);

  // SSE subscription (real worker events).
  useEffect(() => {
    let eventSource: EventSource | null = null;
    let reconnectTimeout: number | undefined;
    let disposed = false;

    const hydrateTimeline = async () => {
      try {
        const params = new URLSearchParams({ limit: '80' });
        if (lastEventIdRef.current) {
          params.set('after', lastEventIdRef.current);
        }
        const res = await fetch(`${API_BASE}/api/agent/timeline?${params.toString()}`);
        if (!res.ok) return;
        const data = await res.json();
        if (Array.isArray(data.events)) {
          data.events.forEach((timelineEvent: AgentTimelineEvent) => {
            appendTimelineEvent(timelineEvent);
          });
        }
      } catch {
        /* best-effort */
      }
    };

    const connect = async () => {
      if (disposed) return;
      await hydrateTimeline();
      if (disposed) return;

      const params = new URLSearchParams();
      if (lastEventIdRef.current) {
        params.set('after', lastEventIdRef.current);
      }
      const suffix = params.toString() ? `?${params.toString()}` : '';
      eventSource = new EventSource(`${API_BASE}/api/agent/stream${suffix}`);
      eventSource.onmessage = (event) => {
        try {
          const payload = JSON.parse(event.data);
          if (REAL_WORK_EVENTS.has(payload.type)) {
            markRealEvent();
          }
          switch (payload.type) {
            case 'init':
              setState((prev) => applyStatusPayload(payload.data, prev));
              break;
            case 'status':
              setState((prev) =>
                applyStatusPayload(
                  {
                    ...payload.data,
                    isWorking:
                      payload.data?.status === 'idle' ? false : prev.isWorking,
                  },
                  prev,
                ),
              );
              break;
            case 'timeline':
              if (payload.event) {
                appendTimelineEvent(payload.event);
              }
              break;
            case 'task_start':
              realTaskActiveRef.current = true;
              setState((prev) =>
                applyStatusPayload(
                  {
                    ...payload.data,
                    isWorking: true,
                    currentTask: payload.data?.task || prev.currentTask,
                    runStatus: payload.data?.runStatus || 'selected',
                    blockedReason: null,
                    lastFailure: null,
                  },
                  prev,
                ),
              );
              if (payload.data?.task?.title) {
                appendBlock({
                  kind: 'paragraph',
                  id: `sse-task-${Date.now()}`,
                  text: `Starting task: ${payload.data.task.title}`,
                  instant: true,
                });
              }
              break;
            case 'text':
              if (typeof payload.data === 'string' && payload.data.trim()) {
                appendBlock({
                  kind: 'paragraph',
                  id: `sse-${Date.now()}`,
                  text: payload.data.trim(),
                  instant: true,
                });
              }
              break;
            case 'task_complete':
              realTaskActiveRef.current = false;
              setState((prev) => ({
                ...prev,
                isWorking: false,
                runStatus: 'succeeded',
              }));
              if (payload.data?.title) {
                if (payload.data?.commit) {
                  const commit = String(payload.data.commit);
                  appendBlock({
                    kind: 'commit',
                    id: `sse-commit-${Date.now()}`,
                    message: commit.slice(0, 8),
                    commitHash: commit,
                    href: `https://github.com/hermeschain-agent/hermeschain/commit/${commit}`,
                    label: 'commited',
                  });
                } else {
                  appendBlock({
                    kind: 'paragraph',
                    id: `sse-complete-${Date.now()}`,
                    text: `Completed task: ${payload.data.title}`,
                    instant: true,
                  });
                }
              }
              break;
            case 'error':
              realTaskActiveRef.current = false;
              appendBlock({
                kind: 'paragraph',
                id: `sse-err-${Date.now()}`,
                text: `Error: ${payload.data?.message || 'unknown error'}`,
                instant: true,
              });
              break;
            default:
              break;
          }
        } catch {
          /* noop */
        }
      };
      eventSource.onerror = () => {
        eventSource?.close();
        reconnectTimeout = window.setTimeout(() => void connect(), 3000);
      };
    };

    void connect();

    return () => {
      disposed = true;
      if (reconnectTimeout) window.clearTimeout(reconnectTimeout);
      eventSource?.close();
    };
  }, [appendBlock, appendTimelineEvent, markRealEvent]);

  const stage = deriveStageLabel(state);
  const stageClass = stage.toLowerCase();

  const viewers = state.viewerCount;
  const commitTickerCount = Math.max(terminalCommitCount, commitCount, recentCommits.length);

  const visibleBlocks = useMemo(() => blocks, [blocks]);

  return (
    <div className={`terminal terminal--${variant}`}>
      <div className="terminal__header">
        <div className="terminal__dots" aria-hidden="true">
          <span className="terminal__dot terminal__dot--r" />
          <span className="terminal__dot terminal__dot--y" />
          <span className="terminal__dot terminal__dot--g" />
        </div>
        <div className="terminal__title">~/hermes-agent</div>
        <div className="terminal__meta">
          {commitTickerCount > 0 ? (
            <span className="terminal__commit-count">
              commits {commitTickerCount.toLocaleString()}
            </span>
          ) : null}
          {viewers > 1 ? (
            <span className="terminal__views">view {viewers}</span>
          ) : null}
          {stage !== 'HALTED' ? (
            <span className={`terminal__stage terminal__stage--${stageClass}`}>
              {stage}
            </span>
          ) : null}
        </div>
      </div>

      <div ref={bodyRef} className="terminal__body">
        {visibleBlocks.length === 0 ? (
          <p className="terminal__empty">waiting for agent…</p>
        ) : (
          visibleBlocks.map((block) => {
            if (block.kind === 'paragraph') {
              const typed = typedMap[block.id] ?? block.text.length;
              const shown = block.text.slice(0, typed);
              return (
                <p key={block.id} className="terminal__block terminal__block--p">
                  {renderParagraph(shown, block.chips)}
                  {typed < block.text.length ? (
                    <span className="terminal__caret" aria-hidden="true" />
                  ) : null}
                </p>
              );
            }
            if (block.kind === 'code') {
              const typed = typedMap[block.id] ?? block.code.length;
              const shown = block.code.slice(0, typed);
              return (
                <div key={block.id} className="terminal__block terminal__block--code">
                  <pre className="terminal__code-body">
                    <code>
                      {shown}
                      {typed < block.code.length ? (
                        <span
                          className="terminal__caret terminal__caret--code"
                          aria-hidden="true"
                        />
                      ) : null}
                    </code>
                  </pre>
                </div>
              );
            }
            if (block.kind === 'commit') {
              const commitContent = (
                <>
                  <span className="terminal__commit-dot" aria-hidden="true" />
                  <span className="terminal__commit-msg">
                    {block.label || 'commited'} <code>{block.message}</code>
                  </span>
                </>
              );
              return (
                <p key={block.id} className="terminal__block terminal__block--commit">
                  {block.href ? (
                    <a
                      className="terminal__commit-link"
                      href={block.href}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      {commitContent}
                    </a>
                  ) : (
                    commitContent
                  )}
                </p>
              );
            }
            return null;
          })
        )}
      </div>

    </div>
  );
};

export default AgentTerminal;
