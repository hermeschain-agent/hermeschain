import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { API_BASE, apiUrl } from './api';
import { startLiveAgentFeed } from './liveAgentFeed';
import {
  DEFAULT_COLS,
  frameTop,
  frameDivider,
  motdBlock,
  progressBar,
  spacerRow,
  statusLine,
  wall,
} from './asciiScreen';
import {
  autocomplete,
  executeCommand,
  TerminalCtx,
} from './terminalCommands';

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
  handleTab?: (tab: string) => void;
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

const MOTD_STORAGE_KEY = 'hermeschain-motd-seen';
const MAX_STREAM_LINES = 400;
const COLS = DEFAULT_COLS;
const TERMINAL_VERSION = 'v0.4.2';

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

function deriveStageLabel(state: AgentState, connected: boolean): string {
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

function formatIdle(idleMs: number): string {
  if (idleMs < 3000) return `last: ${(idleMs / 1000).toFixed(1)}s`;
  const s = Math.floor(idleMs / 1000);
  if (s < 60) return `idle ${s}s`;
  const m = Math.floor(s / 60);
  const rem = s % 60;
  if (m < 60) return `idle ${m}m ${rem}s`;
  const h = Math.floor(m / 60);
  return `idle ${h}h ${m % 60}m`;
}

/**
 * Split raw text from the event feed into individual lines, preserving
 * empty lines. Each line becomes a row in the stream.
 */
function toLines(text: string): string[] {
  if (!text) return [];
  return text.replace(/\r\n/g, '\n').split('\n');
}

const AgentTerminal: React.FC<AgentTerminalProps> = ({
  variant = 'rail',
  handleTab,
  recentCommits = [],
}) => {
  const [state, setState] = useState<AgentState>(INITIAL_STATE);
  const [connected, setConnected] = useState(false);
  const [displayedText, setDisplayedText] = useState('');
  const [command, setCommand] = useState('');
  const [historyIndex, setHistoryIndex] = useState(-1);
  const [nowMs, setNowMs] = useState(() => Date.now());

  const historyRef = useRef<string[]>([]);
  const textBufferRef = useRef('');
  const displayIndexRef = useRef(0);
  const typeTimerRef = useRef<ReturnType<typeof setTimeout>>();
  const lastEventAtRef = useRef<number>(Date.now());
  const outputRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const feedHandleRef = useRef<{ stop: () => void; pause: () => void } | null>(null);

  // Variable-speed typewriter with per-char jitter and punctuation pauses.
  const typewriterTick = useCallback(() => {
    const buffer = textBufferRef.current;
    const idx = displayIndexRef.current;
    if (idx >= buffer.length) {
      typeTimerRef.current = undefined;
      return;
    }
    const ch = buffer[idx];
    displayIndexRef.current = idx + 1;
    setDisplayedText(buffer.slice(0, idx + 1));

    let delay = 12 + Math.random() * 28;
    if (ch === '.' || ch === '!' || ch === '?') delay = 80 + Math.random() * 80;
    if (ch === '\n') delay = 40 + Math.random() * 40;
    if (ch === ' ') delay = 6 + Math.random() * 18;
    typeTimerRef.current = setTimeout(typewriterTick, delay);
  }, []);

  const appendText = useCallback(
    (text: string) => {
      textBufferRef.current += text;
      lastEventAtRef.current = Date.now();
      // Cap total buffer so it doesn't grow unbounded.
      const lines = textBufferRef.current.split('\n');
      if (lines.length > MAX_STREAM_LINES) {
        const trimmed = lines.slice(lines.length - MAX_STREAM_LINES).join('\n');
        textBufferRef.current = trimmed;
        displayIndexRef.current = Math.min(
          displayIndexRef.current,
          trimmed.length,
        );
      }
      if (!typeTimerRef.current) {
        typeTimerRef.current = setTimeout(typewriterTick, 10);
      }
    },
    [typewriterTick],
  );

  const resetOutput = useCallback(() => {
    textBufferRef.current = '';
    displayIndexRef.current = 0;
    setDisplayedText('');
    if (typeTimerRef.current) {
      clearTimeout(typeTimerRef.current);
      typeTimerRef.current = undefined;
    }
  }, []);

  const pauseFeed = useCallback(() => {
    feedHandleRef.current?.pause();
  }, []);

  // ── Clock tick ─────────────────────────────────────────────
  useEffect(() => {
    const tick = window.setInterval(() => setNowMs(Date.now()), 500);
    return () => window.clearInterval(tick);
  }, []);

  // ── Scroll stream to bottom whenever new chars land ────────
  useEffect(() => {
    if (outputRef.current) {
      outputRef.current.scrollTop = outputRef.current.scrollHeight;
    }
  }, [displayedText]);

  // ── Initial status fetch ───────────────────────────────────
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

  // ── MOTD on first session load ─────────────────────────────
  useEffect(() => {
    if (variant !== 'rail') return;
    let shown = false;
    try {
      shown = window.sessionStorage.getItem(MOTD_STORAGE_KEY) === '1';
    } catch {
      /* noop */
    }
    if (shown) return;

    // Small delay so the MOTD renders after the first status fetch.
    const timer = setTimeout(() => {
      const motdText = motdBlock(
        {
          blockHeight: state.blockHeight,
          uptime: formatUptime(state.genesisTimestamp, Date.now()),
          lastCommitSha: recentCommits[0]?.shortHash,
          lastCommitMessage: recentCommits[0]?.message,
          version: TERMINAL_VERSION,
        },
        COLS,
      ).join('\n');
      appendText(motdText + '\n' + frameDivider(COLS) + '\n');
      try {
        window.sessionStorage.setItem(MOTD_STORAGE_KEY, '1');
      } catch {
        /* noop */
      }
    }, 400);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [variant]);

  // ── Live agent feed ────────────────────────────────────────
  useEffect(() => {
    if (variant !== 'rail') return;
    const handle = startLiveAgentFeed({
      appendText,
      resetOutput: () => {
        // do NOT wipe — we want continuous scrollback. Just mark new run.
        appendText('\n' + frameDivider(COLS, { label: 'next-task' }) + '\n');
      },
      patchState: (updater) => setState((prev) => updater(prev) as AgentState),
    });
    feedHandleRef.current = handle;
    return () => {
      handle.stop();
      feedHandleRef.current = null;
    };
  }, [variant, appendText]);

  // ── SSE subscription (real worker events) ──────────────────
  useEffect(() => {
    let eventSource: EventSource | null = null;
    let reconnectTimeout: number | undefined;

    const connect = () => {
      eventSource = new EventSource(`${API_BASE}/api/agent/stream`);
      eventSource.onopen = () => setConnected(true);
      eventSource.onmessage = (event) => {
        try {
          const payload = JSON.parse(event.data);
          if (payload.type !== 'ping' && payload.type !== 'heartbeat') {
            pauseFeed();
            lastEventAtRef.current = Date.now();
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
              appendText(
                `\n[${stampNow()}] > [TASK] ${payload.data?.task?.title || 'unknown task'}\n`,
              );
              break;
            case 'text':
              appendText(payload.data || '');
              break;
            case 'tool_start':
              appendText(
                `\n[${stampNow()}] > [TOOL] ${payload.data?.tool || '?'} ${
                  payload.data?.input?.path ||
                  payload.data?.input?.pattern ||
                  ''
                }\n`,
              );
              break;
            case 'tool_result':
              appendText(
                `[${stampNow()}] > [RESULT] ${shortRepr(payload.data?.result)}\n`,
              );
              break;
            case 'verification_start':
              appendText(
                `\n[${stampNow()}] > [VERIFY] starting\n`,
              );
              break;
            case 'verification_result':
              appendText(
                `[${stampNow()}] > [${payload.data?.success ? 'PASS' : 'FAIL'}] ${
                  payload.data?.step || ''
                }\n`,
              );
              break;
            case 'task_complete':
              appendText(
                `[${stampNow()}] > [DONE] ${payload.data?.title || 'task complete'}\n`,
              );
              setState((prev) => ({
                ...prev,
                isWorking: false,
                runStatus: 'succeeded',
              }));
              break;
            case 'error':
              appendText(
                `[${stampNow()}] > [ERROR] ${payload.data?.message || 'unknown error'}\n`,
              );
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
  }, [appendText, pauseFeed]);

  // ── Derived state for UI ───────────────────────────────────
  const stage = deriveStageLabel(state, connected);
  const clockStr = new Date(nowMs).toISOString().substring(11, 19);
  const progress = progressBar(stage, Math.floor(nowMs / 800));
  const idleText = formatIdle(nowMs - lastEventAtRef.current);
  const heartbeat =
    Math.floor(nowMs / 1000) % 2 === 0 ? '♥' : '♡';

  const topLine = frameTop(
    'tty://hermes-agent',
    [
      `mode:${state.mode}`,
      `viewers:${state.viewerCount}`,
      `stream:${connected ? 'open' : 'closed'}`,
    ],
    COLS,
  );
  const statusRow = statusLine(
    {
      stage,
      host: 'hermes@hermeschain',
      progress,
      clock: `${clockStr} UTC`,
      idleText,
      heartbeat,
    },
    COLS,
  );
  const bottomLine = frameDivider(COLS, { kind: 'bottom' });

  // ── Render stream rows (wrap each line in side walls) ──────
  const streamRows: string[] = useMemo(() => {
    const lines = toLines(displayedText);
    return lines.map((line) => wall('  ' + line, COLS));
  }, [displayedText]);

  // ── Prompt execution ──────────────────────────────────────
  const runCommand = useCallback(
    (raw: string) => {
      const trimmed = raw.trim();
      if (trimmed) historyRef.current.push(trimmed);
      setHistoryIndex(-1);
      // Echo the command
      appendText(`\nhermes@hermeschain:~$ ${trimmed}\n`);
      const ctx: TerminalCtx = {
        blockHeight: state.blockHeight,
        uptime: formatUptime(state.genesisTimestamp, Date.now()),
        genesisTimestamp: state.genesisTimestamp,
        recentCommits,
        history: historyRef.current,
        handleTab: (tab) => handleTab?.(tab),
        clear: () => resetOutput(),
      };
      const result = executeCommand(trimmed, ctx);
      if (result.clearFirst) {
        resetOutput();
        return;
      }
      if (result.lines.length > 0) {
        appendText(result.lines.join('\n') + '\n');
      }
    },
    [appendText, handleTab, recentCommits, resetOutput, state.blockHeight, state.genesisTimestamp],
  );

  const onPromptKey = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      runCommand(command);
      setCommand('');
      return;
    }
    if (event.key === 'ArrowUp') {
      event.preventDefault();
      const history = historyRef.current;
      if (history.length === 0) return;
      const nextIdx =
        historyIndex < 0
          ? history.length - 1
          : Math.max(0, historyIndex - 1);
      setHistoryIndex(nextIdx);
      setCommand(history[nextIdx]);
      return;
    }
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      const history = historyRef.current;
      if (history.length === 0 || historyIndex < 0) {
        setCommand('');
        setHistoryIndex(-1);
        return;
      }
      const nextIdx = historyIndex + 1;
      if (nextIdx >= history.length) {
        setHistoryIndex(-1);
        setCommand('');
      } else {
        setHistoryIndex(nextIdx);
        setCommand(history[nextIdx]);
      }
      return;
    }
    if (event.key === 'Tab') {
      event.preventDefault();
      const match = autocomplete(command);
      if (match) setCommand(match + ' ');
      return;
    }
    if (event.key === 'l' && event.ctrlKey) {
      event.preventDefault();
      resetOutput();
      return;
    }
    if (event.key === 'c' && event.ctrlKey) {
      event.preventDefault();
      appendText(`\n${command}^C\n`);
      setCommand('');
    }
  };

  return (
    <div
      className={`ascii-screen ascii-screen--${variant}`}
      onClick={() => inputRef.current?.focus()}
    >
      <pre className="ascii-screen__row ascii-screen__row--frame">
        {topLine}
      </pre>

      <div ref={outputRef} className="ascii-screen__stream">
        {streamRows.length === 0 ? (
          <pre className="ascii-screen__row">{wall('', COLS)}</pre>
        ) : (
          streamRows.map((row, index) => (
            <pre key={index} className="ascii-screen__row">
              {row}
            </pre>
          ))
        )}
        <pre className="ascii-screen__row ascii-screen__row--caret">
          {wall('  ', COLS)}
        </pre>
      </div>

      <pre className="ascii-screen__row ascii-screen__row--frame">
        {statusRow}
      </pre>

      <pre className="ascii-screen__row ascii-screen__row--prompt">
        <span className="ascii-screen__prompt-prefix">
          {'│ hermes@hermeschain:~$ '}
        </span>
        <input
          ref={inputRef}
          className="ascii-screen__prompt-input"
          value={command}
          onChange={(e) => setCommand(e.target.value)}
          onKeyDown={onPromptKey}
          spellCheck={false}
          autoComplete="off"
          aria-label="terminal input"
        />
        <span className="ascii-screen__prompt-cursor" aria-hidden="true">
          █
        </span>
        <span className="ascii-screen__prompt-suffix">
          {' '.repeat(Math.max(0, COLS - 27 - command.length - 2)) + '│'}
        </span>
      </pre>

      <pre className="ascii-screen__row ascii-screen__row--frame">
        {bottomLine}
      </pre>
    </div>
  );
};

function stampNow(): string {
  return new Date().toISOString().substring(11, 19);
}

function shortRepr(value: unknown): string {
  if (typeof value === 'string') return value.slice(0, 80);
  if (value == null) return '(no result)';
  try {
    const str = JSON.stringify(value);
    return str.length > 80 ? str.slice(0, 77) + '...' : str;
  } catch {
    return '[object]';
  }
}

export default AgentTerminal;
