import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { API_BASE, apiUrl } from './api';
import { startLiveAgentFeed, TerminalBlock, PathChip } from './liveAgentFeed';

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
  recentCommits?: Array<{ shortHash: string; message: string; date: string }>;
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

const BLOCKS_STORAGE_KEY = 'hermeschain-terminal-blocks-v2';
const MAX_BLOCKS = 80;
const REAL_WORK_EVENTS = new Set([
  'task_start',
  'text',
  'tool_start',
  'tool_result',
  'verification_start',
  'verification_result',
  'task_complete',
  'error',
]);

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

type Stage = 'IDLE' | 'RUN' | 'VERIFY' | 'ANALYZE' | 'EXEC' | 'HALTED' | 'OFFLINE';

function deriveStageLabel(state: AgentState, connected: boolean): Stage {
  if (!connected) return 'OFFLINE';
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

function loadBlocks(): TerminalBlock[] {
  try {
    const raw = window.sessionStorage.getItem(BLOCKS_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.slice(-MAX_BLOCKS);
  } catch {
    return [];
  }
}

function saveBlocks(blocks: TerminalBlock[]): void {
  try {
    window.sessionStorage.setItem(
      BLOCKS_STORAGE_KEY,
      JSON.stringify(blocks.slice(-MAX_BLOCKS)),
    );
  } catch {
    /* noop */
  }
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
}) => {
  const [state, setState] = useState<AgentState>(INITIAL_STATE);
  const [connected, setConnected] = useState(false);
  const [blocks, setBlocks] = useState<TerminalBlock[]>(() =>
    variant === 'rail' ? loadBlocks() : [],
  );
  const [typedMap, setTypedMap] = useState<Record<string, number>>({});

  const typeTimersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(
    new Map(),
  );
  const bodyRef = useRef<HTMLDivElement>(null);
  const feedHandleRef = useRef<{ stop: () => void; pause: () => void } | null>(
    null,
  );

  // Persist blocks to sessionStorage on every change (rail variant only).
  useEffect(() => {
    if (variant !== 'rail') return;
    saveBlocks(blocks);
  }, [blocks, variant]);

  // Drive a variable-speed typewriter for each paragraph block.
  const startTypewriter = useCallback((block: TerminalBlock) => {
    if (block.kind !== 'paragraph') return;
    if (block.instant) {
      setTypedMap((m) => ({ ...m, [block.id]: block.text.length }));
      return;
    }
    const existing = typeTimersRef.current.get(block.id);
    if (existing) clearTimeout(existing);

    const tick = (idx: number) => {
      setTypedMap((m) => ({ ...m, [block.id]: idx }));
      if (idx >= block.text.length) {
        typeTimersRef.current.delete(block.id);
        return;
      }
      const ch = block.text[idx];
      let delay = 12 + Math.random() * 24;
      if (ch === '.' || ch === '!' || ch === '?') delay = 90 + Math.random() * 90;
      if (ch === ',') delay = 60 + Math.random() * 40;
      if (ch === ' ') delay = 8 + Math.random() * 14;
      const t = setTimeout(() => tick(idx + 1), delay);
      typeTimersRef.current.set(block.id, t);
    };
    tick(0);
  }, []);

  const appendBlock = useCallback(
    (block: TerminalBlock) => {
      setBlocks((prev) => {
        const next = [...prev, block].slice(-MAX_BLOCKS);
        return next;
      });
      // code/commit blocks reveal fully; paragraphs animate.
      if (block.kind === 'paragraph' && !block.instant) {
        startTypewriter(block);
      } else {
        setTypedMap((m) => ({
          ...m,
          [block.id]: block.kind === 'paragraph' ? block.text.length : 0,
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

  // On mount, make sure any rehydrated paragraph blocks get revealed instantly
  // (we don't re-type them on refresh — that would be jarring).
  useEffect(() => {
    if (variant !== 'rail') return;
    setTypedMap((prev) => {
      const next = { ...prev };
      for (const b of blocks) {
        if (b.kind === 'paragraph' && next[b.id] === undefined) {
          next[b.id] = b.text.length;
        }
      }
      return next;
    });
    // intentionally only once after mount / initial load
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Live synthetic agent feed (rail variant).
  useEffect(() => {
    if (variant !== 'rail') return;
    const handle = startLiveAgentFeed({
      appendBlock,
      resetBlocks,
      patchState: (updater) => setState((prev) => updater(prev) as AgentState),
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

    const connect = () => {
      eventSource = new EventSource(`${API_BASE}/api/agent/stream`);
      eventSource.onopen = () => setConnected(true);
      eventSource.onmessage = (event) => {
        try {
          const payload = JSON.parse(event.data);
          if (REAL_WORK_EVENTS.has(payload.type)) {
            pauseFeed();
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
            case 'task_start':
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
              setState((prev) => ({
                ...prev,
                isWorking: false,
                runStatus: 'succeeded',
              }));
              if (payload.data?.title) {
                appendBlock({
                  kind: 'commit',
                  id: `sse-commit-${Date.now()}`,
                  message: payload.data.title,
                });
              }
              break;
            case 'error':
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
        setConnected(false);
        eventSource?.close();
        reconnectTimeout = window.setTimeout(connect, 3000);
      };
    };

    connect();

    return () => {
      if (reconnectTimeout) window.clearTimeout(reconnectTimeout);
      eventSource?.close();
    };
  }, [appendBlock, pauseFeed]);

  const stage = deriveStageLabel(state, connected);
  const stageClass = stage.toLowerCase();

  const viewers = state.viewerCount;

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
          {viewers > 1 ? (
            <span className="terminal__views">view {viewers}</span>
          ) : null}
          <span className={`terminal__stage terminal__stage--${stageClass}`}>
            {stage}
          </span>
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
              return (
                <div key={block.id} className="terminal__block terminal__block--code">
                  <pre className="terminal__code-body">
                    <code>{block.code}</code>
                  </pre>
                </div>
              );
            }
            if (block.kind === 'commit') {
              return (
                <p key={block.id} className="terminal__block terminal__block--commit">
                  <span className="terminal__commit-dot" aria-hidden="true" />
                  <span className="terminal__commit-msg">
                    committed <code>{block.message}</code>
                  </span>
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
