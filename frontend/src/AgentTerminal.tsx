import React, { useCallback, useEffect, useRef, useState } from 'react';
import { API_BASE, apiUrl } from './api';
import { startLiveAgentFeed } from './liveAgentFeed';

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
}

interface AgentTerminalProps {
  variant?: 'rail' | 'embedded';
}

interface StreamRowSegment {
  kind: 'row';
  line: string;
}

interface StreamCodeSegment {
  kind: 'code';
  path: string | null;
  language: string;
  code: string;
  complete: boolean;
}

type StreamSegment = StreamRowSegment | StreamCodeSegment;

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
};

function trimTaskTitle(title: string): string {
  return title.replace(
    /^(Building|Auditing|Analyzing|Proposing|Documenting|Writing):\s*/i,
    ''
  );
}

function renderInlineMarkup(line: string): React.ReactNode {
  const parts = line.split(/(`[^`]+`|\*\*[^*]+\*\*)/g);

  return parts.map((part, index) => {
    if (!part) return null;

    if (part.startsWith('`') && part.endsWith('`')) {
      return (
        <code key={index} className="agent-row__code">
          {part.slice(1, -1)}
        </code>
      );
    }

    if (part.startsWith('**') && part.endsWith('**')) {
      return (
        <strong key={index} className="agent-row__accent">
          {part.slice(2, -2)}
        </strong>
      );
    }

    return <span key={index}>{part}</span>;
  });
}

function parseStreamSegments(text: string): StreamSegment[] {
  const lines = text.replace(/\r\n/g, '\n').split('\n');
  const segments: StreamSegment[] = [];
  let pendingFilePath: string | null = null;

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];

    if (line.startsWith('[FILE] ')) {
      pendingFilePath = line.replace('[FILE] ', '').trim();
      continue;
    }

    if (line.startsWith('```')) {
      const language = line.slice(3).trim();
      const codeLines: string[] = [];
      let complete = false;

      index += 1;
      while (index < lines.length) {
        if (lines[index].startsWith('```')) {
          complete = true;
          break;
        }

        codeLines.push(lines[index]);
        index += 1;
      }

      segments.push({
        kind: 'code',
        path: pendingFilePath,
        language,
        code: codeLines.join('\n'),
        complete,
      });
      pendingFilePath = null;
      continue;
    }

    if (pendingFilePath && line.trim()) {
      segments.push({ kind: 'row', line: `$ file ${pendingFilePath}` });
      pendingFilePath = null;
    }

    segments.push({ kind: 'row', line });
  }

  if (pendingFilePath) {
    segments.push({ kind: 'row', line: `$ file ${pendingFilePath}` });
  }

  return segments;
}

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
  };
}

function summarizeStatus(state: AgentState, connected: boolean): string {
  if (!connected) return 'OFFLINE';
  if (state.mode === 'disabled') return 'DISABLED';
  if (state.mode === 'demo') return state.isWorking ? 'DEMO LIVE' : 'DEMO IDLE';
  if (state.runStatus === 'blocked') return 'BLOCKED';
  if (state.verificationStatus === 'failed') return 'VERIFY FAIL';
  if (state.isWorking) return state.runStatus.replace(/_/g, ' ').toUpperCase();
  return 'IDLE';
}

function buildIdleMessage(state: AgentState, connected: boolean): string {
  if (!connected) return '$ connecting_to_agent_stream...';
  if (state.mode === 'disabled') {
    return `$ agent_disabled :: ${state.startupIssues[0] || 'autorun is off'}`;
  }
  if (state.mode === 'demo') {
    return '$ demo_stream_ready :: no repository writes allowed';
  }
  if (state.blockedReason) {
    return `$ task_blocked :: ${state.blockedReason}`;
  }
  if (state.lastFailure) {
    return `$ verification_failed :: ${state.lastFailure}`;
  }
  return '$ waiting_for_scoped_task...';
}

const AgentTerminal: React.FC<AgentTerminalProps> = ({ variant = 'rail' }) => {
  const [state, setState] = useState<AgentState>(INITIAL_STATE);
  const [connected, setConnected] = useState(false);
  const [displayedText, setDisplayedText] = useState('');
  const outputRef = useRef<HTMLDivElement>(null);
  const textBufferRef = useRef('');
  const displayIndexRef = useRef(0);
  const animationFrameRef = useRef<number>();
  const feedHandleRef = useRef<{ stop: () => void; pause: () => void } | null>(null);
  // Yield the live agent feed whenever a real SSE chunk arrives.
  const pauseFeed = useCallback(() => {
    feedHandleRef.current?.pause();
  }, []);

  const typewriterEffect = useCallback(() => {
    const buffer = textBufferRef.current;
    const currentIndex = displayIndexRef.current;

    if (currentIndex < buffer.length) {
      const charsToAdd = Math.min(3, buffer.length - currentIndex);
      displayIndexRef.current = currentIndex + charsToAdd;
      setDisplayedText(buffer.slice(0, displayIndexRef.current));

      animationFrameRef.current = requestAnimationFrame(typewriterEffect);
    } else {
      animationFrameRef.current = undefined;
    }
  }, []);

  const appendText = useCallback(
    (text: string) => {
      textBufferRef.current += text;
      if (!animationFrameRef.current) {
        animationFrameRef.current = requestAnimationFrame(typewriterEffect);
      }
    },
    [typewriterEffect]
  );

  const resetOutput = useCallback(() => {
    textBufferRef.current = '';
    displayIndexRef.current = 0;
    setDisplayedText('');
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = undefined;
    }
  }, []);

  useEffect(() => {
    if (outputRef.current) {
      outputRef.current.scrollTop = outputRef.current.scrollHeight;
    }
  }, [displayedText]);

  useEffect(() => {
    const loadPersistedTasks = async () => {
      try {
        const response = await fetch(apiUrl('/api/agent/status'));
        if (!response.ok) return;

        const data = await response.json();
        setState((prev) => applyStatusPayload(data, prev));

        if (data.currentOutput) {
          textBufferRef.current = data.currentOutput;
          displayIndexRef.current = data.currentOutput.length;
          setDisplayedText(data.currentOutput);
        }
      } catch (error) {
        console.error('[AgentTerminal] Failed to load persisted tasks:', error);
      }
    };

    void loadPersistedTasks();
  }, []);

  // Surface Hermes's live workstream into the hero terminal. Yields to any
  // real SSE chunk for the duration of that task.
  useEffect(() => {
    if (variant !== 'rail') return;
    const handle = startLiveAgentFeed({
      appendText,
      resetOutput,
      patchState: (updater) => setState((prev) => updater(prev) as AgentState),
    });
    feedHandleRef.current = handle;
    return () => {
      handle.stop();
      feedHandleRef.current = null;
    };
  }, [variant, appendText, resetOutput]);

  useEffect(() => {
    let eventSource: EventSource | null = null;
    let reconnectTimeout: number | undefined;

    const connect = () => {
      eventSource = new EventSource(`${API_BASE}/api/agent/stream`);

      eventSource.onopen = () => {
        setConnected(true);
      };

      eventSource.onmessage = (event) => {
        try {
          const payload = JSON.parse(event.data);

          // Live worker stream takes priority — pause the hero feed.
          if (payload.type !== 'ping' && payload.type !== 'heartbeat') {
            pauseFeed();
          }

          switch (payload.type) {
            case 'init':
              setState((prev) => applyStatusPayload(payload.data, prev));
              if (payload.data?.currentOutput) {
                textBufferRef.current = payload.data.currentOutput;
                displayIndexRef.current = payload.data.currentOutput.length;
                setDisplayedText(payload.data.currentOutput);
              }
              break;

            case 'status':
              setState((prev) =>
                applyStatusPayload(
                  {
                    ...payload.data,
                    isWorking:
                      payload.data?.status === 'idle'
                        ? false
                        : prev.isWorking,
                  },
                  prev
                )
              );
              break;

            case 'task_start':
              resetOutput();
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
                  prev
                )
              );
              appendText(
                `$ begin_task :: ${payload.data?.task?.title || 'unknown task'}\n`
              );
              break;

            case 'analysis_start':
              setState((prev) => ({
                ...prev,
                runStatus: 'analyzing',
              }));
              appendText('\n> [ANALYSIS] evidence_attached\n');
              break;

            case 'text':
              appendText(payload.data);
              break;

            case 'tool_start':
              setState((prev) => ({
                ...prev,
                runStatus: 'executing',
              }));
              appendText(`\n> [TOOL] ${payload.data?.tool}\n`);
              break;

            case 'tool_result': {
              const preview = payload.data?.preview;
              const toolName = payload.data?.tool || 'tool';
              const result = payload.data?.result;

              if (preview?.path && typeof preview?.content === 'string') {
                appendText(
                  `[FILE] ${preview.path}\n\`\`\`${preview.language || 'text'}\n${preview.content}${
                    preview.truncated ? '\n// ...truncated' : ''
                  }\n\`\`\`\n`
                );
              } else if (result?.error) {
                appendText(`> [ERROR] ${result.error}\n`);
              } else {
                appendText(`> [RESULT] ${toolName} ok\n`);
              }
              break;
            }

            case 'verification_start':
              setState((prev) => ({
                ...prev,
                runStatus: 'verifying',
                verificationStatus: 'running',
              }));
              appendText('\n> [VERIFY] running verification plan\n');
              break;

            case 'verification_result':
              if (payload.data?.success === false) {
                setState((prev) => ({
                  ...prev,
                  verificationStatus: 'failed',
                  lastFailure:
                    payload.data?.failureReason ||
                    payload.data?.summary ||
                    prev.lastFailure,
                }));
                appendText(
                  `> [FAIL] ${
                    payload.data?.failureReason ||
                    payload.data?.summary ||
                    'verification failed'
                  }\n`
                );
              } else if (payload.data?.step) {
                appendText(`> [PASS] ${payload.data.step}\n`);
              }
              break;

            case 'task_complete':
              setState((prev) =>
                applyStatusPayload(
                  {
                    isWorking: false,
                    currentTask: null,
                    runStatus: 'idle',
                    verificationStatus:
                      payload.data?.verificationStatus || 'passed',
                    recentTasks: [
                      {
                        title: payload.data?.title,
                        agent: prev.currentTask?.agent || 'HERMES',
                        completedAt: new Date().toISOString(),
                      },
                      ...prev.completedTasks,
                    ].slice(0, 5),
                  },
                  prev
                )
              );
              appendText(
                `> [DONE] ${payload.data?.title || 'task complete'} :: ${
                  payload.data?.verificationStatus || 'passed'
                }\n`
              );
              break;

            case 'task_blocked':
              setState((prev) => ({
                ...prev,
                isWorking: false,
                runStatus: 'blocked',
                verificationStatus: 'failed',
                blockedReason: payload.data?.reason || 'Task blocked',
              }));
              appendText(`> [BLOCKED] ${payload.data?.reason || 'Task blocked'}\n`);
              break;

            case 'error':
              setState((prev) => ({
                ...prev,
                isWorking: false,
                runStatus: 'failed',
                verificationStatus: 'failed',
                lastFailure: payload.data?.message || 'Agent error',
              }));
              appendText(`> [ERROR] ${payload.data?.message || 'Agent error'}\n`);
              break;

            case 'heartbeat':
              setState((prev) => ({
                ...prev,
                viewerCount: payload.viewerCount || prev.viewerCount,
              }));
              break;

            default:
              break;
          }
        } catch (error) {
          console.error('[AgentTerminal] Parse error:', error);
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
      eventSource?.close();
      if (reconnectTimeout) {
        window.clearTimeout(reconnectTimeout);
      }
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, [appendText, resetOutput]);

  const renderStreamRow = (line: string, index: number) => {
    if (!line) {
      return (
        <div key={index} className="agent-row agent-row--blank" aria-hidden="true">
          <span className="agent-row__glyph" />
          <span className="agent-row__body">&nbsp;</span>
        </div>
      );
    }

    if (line.startsWith('> [TOOL]')) {
      return (
        <div key={index} className="agent-row agent-row--tool agent-row--special">
          <span className="agent-row__glyph">$</span>
          <div className="agent-row__body">
            <div className="agent-row__meta">tool_start</div>
            <div className="agent-row__title">{line.replace('> [TOOL] ', '')}</div>
          </div>
        </div>
      );
    }

    if (line.startsWith('> [RESULT]')) {
      return (
        <div key={index} className="agent-row agent-row--command">
          <span className="agent-row__glyph">=</span>
          <div className="agent-row__body">{line.replace('> [RESULT] ', '')}</div>
        </div>
      );
    }

    if (line.startsWith('> [ANALYSIS]')) {
      return (
        <div key={index} className="agent-row agent-row--thought agent-row--special">
          <span className="agent-row__glyph">*</span>
          <div className="agent-row__body">
            <div className="agent-row__meta">analysis_start</div>
            <div className="agent-row__title">
              {line.replace('> [ANALYSIS] ', '')}
            </div>
          </div>
        </div>
      );
    }

    if (line.startsWith('> [VERIFY]')) {
      return (
        <div key={index} className="agent-row agent-row--thought agent-row--special">
          <span className="agent-row__glyph">?</span>
          <div className="agent-row__body">
            <div className="agent-row__meta">verification_start</div>
            <div className="agent-row__title">
              {line.replace('> [VERIFY] ', '')}
            </div>
          </div>
        </div>
      );
    }

    if (line.startsWith('> [PASS]')) {
      return (
        <div key={index} className="agent-row agent-row--deploy agent-row--special">
          <span className="agent-row__glyph">+</span>
          <div className="agent-row__body">
            <div className="agent-row__meta">verification_result</div>
            <div className="agent-row__title">
              {line.replace('> [PASS] ', '')}
            </div>
          </div>
        </div>
      );
    }

    if (line.startsWith('> [FAIL]') || line.startsWith('> [ERROR]') || line.startsWith('> [BLOCKED]')) {
      return (
        <div key={index} className="agent-row agent-row--error agent-row--special">
          <span className="agent-row__glyph">!</span>
          <div className="agent-row__body">
            <div className="agent-row__meta">
              {line.startsWith('> [BLOCKED]') ? 'task_blocked' : 'stderr'}
            </div>
            <div className="agent-row__title">
              {line
                .replace('> [FAIL] ', '')
                .replace('> [ERROR] ', '')
                .replace('> [BLOCKED] ', '')}
            </div>
          </div>
        </div>
      );
    }

    if (line.startsWith('> [DONE]')) {
      return (
        <div key={index} className="agent-row agent-row--deploy agent-row--special">
          <span className="agent-row__glyph">#</span>
          <div className="agent-row__body">
            <div className="agent-row__meta">task_complete</div>
            <div className="agent-row__title">{line.replace('> [DONE] ', '')}</div>
          </div>
        </div>
      );
    }

    if (line.startsWith('$ begin_task ::')) {
      return (
        <div key={index} className="agent-row agent-row--header">
          <span className="agent-row__glyph">{'>'}</span>
          <div className="agent-row__body">{line.replace('$ begin_task :: ', '')}</div>
        </div>
      );
    }

    if (line.startsWith('[Executing:')) {
      const command = line.replace('[Executing:', '').replace(']', '').trim();
      return (
        <div key={index} className="agent-row agent-row--command">
          <span className="agent-row__glyph">$</span>
          <div className="agent-row__body">{command}</div>
        </div>
      );
    }

    if (line.startsWith('## ')) {
      return (
        <div key={index} className="agent-row agent-row--header">
          <span className="agent-row__glyph">{'>'}</span>
          <div className="agent-row__body">{line.replace('## ', '')}</div>
        </div>
      );
    }

    if (line.startsWith('- ') || line.startsWith('• ')) {
      return (
        <div key={index} className="agent-row agent-row--list">
          <span className="agent-row__glyph">+</span>
          <div className="agent-row__body">{renderInlineMarkup(line.slice(2))}</div>
        </div>
      );
    }

    if (/^\d+\.\s/.test(line)) {
      const number = line.match(/^(\d+)\./)?.[1] || index + 1;
      return (
        <div key={index} className="agent-row agent-row--numbered">
          <span className="agent-row__glyph">{number}</span>
          <div className="agent-row__body">
            {renderInlineMarkup(line.replace(/^\d+\.\s/, ''))}
          </div>
        </div>
      );
    }

    return (
      <div key={index} className="agent-row agent-row--plain">
        <span className="agent-row__glyph">.</span>
        <div className="agent-row__body">{renderInlineMarkup(line)}</div>
      </div>
    );
  };

  const renderCodeSegment = (segment: StreamCodeSegment, index: number) => {
    const codeLines = segment.code.split('\n');
    const visibleLines =
      codeLines.length === 1 && codeLines[0] === '' ? [''] : codeLines;

    return (
      <div key={index} className="agent-row agent-row--code-panel agent-row--special">
        <span className="agent-row__glyph">{'/>'}</span>
        <div className="agent-row__body">
          <div
            className={`agent-code-block ${
              segment.complete ? '' : 'agent-code-block--live'
            }`.trim()}
          >
            <div className="agent-code-block__head">
              <span className="agent-code-block__label">+-- file_write</span>
              <span className="agent-code-block__path">
                {segment.path || 'stdout'}
              </span>
              <span className="agent-code-block__lang">
                {segment.language || 'text'}
              </span>
            </div>

            <div className="agent-code-block__body">
              {visibleLines.map((codeLine, lineIndex) => (
                <div
                  key={`${index}-${lineIndex}`}
                  className="agent-code-block__line"
                >
                  <span className="agent-code-block__line-no">
                    {String(lineIndex + 1).padStart(2, '0')}
                  </span>
                  <span className="agent-code-block__line-text">
                    {codeLine || ' '}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  };

  const renderOutput = (text: string) =>
    parseStreamSegments(text).map((segment, index) =>
      segment.kind === 'code'
        ? renderCodeSegment(segment, index)
        : renderStreamRow(segment.line, index)
    );

  const formatTime = (isoString: string) => {
    const date = new Date(isoString);
    return date.toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const connectionLabel = summarizeStatus(state, connected);
  const questBadge = state.currentTask?.agent || state.mode.toUpperCase();
  const questTitle =
    state.currentTask?.title ||
    (state.mode === 'demo'
      ? 'Read-only demo stream active'
      : state.mode === 'disabled'
        ? 'Hermes is disabled'
        : state.lastFailure || state.blockedReason || 'Awaiting next scoped task');
  const questKicker = state.currentTask ? '$ current_objective' : '$ agent_state';
  const questSubline =
    state.currentDecision?.action
      ? `$ action :: ${state.currentDecision.action}`
      : state.mode === 'real'
        ? `$ run_status :: ${state.runStatus}`
        : '$ stream_status :: read_only';

  return (
    <div className={`agent-terminal agent-terminal--${variant}`}>
      <div className="agent-terminal__topbar">
        <div className="agent-terminal__topbar-left">
          <div className="agent-terminal__path">
            <span className="agent-terminal__prompt">$</span>
            tty://hermes-agent
          </div>
        </div>

        <div className="agent-terminal__hud">
          <div className="agent-terminal__chip agent-terminal__chip--auto">
            <span className="agent-terminal__chip-label">mode</span>
            <span className="agent-terminal__chip-value">{state.mode}</span>
          </div>

          <div className="agent-terminal__chip agent-terminal__chip--viewers">
            <span className="agent-terminal__chip-label">viewers</span>
            <span className="agent-terminal__chip-value">{state.viewerCount}</span>
          </div>

          <div
            className={`agent-terminal__chip agent-terminal__chip--state ${
              connected
                ? state.isWorking
                  ? 'is-working'
                  : 'is-idle'
                : 'is-offline'
            }`}
          >
            <span className="agent-terminal__state-led" />
            <span className="agent-terminal__chip-value">
              {connectionLabel.toLowerCase()}
            </span>
          </div>
        </div>
      </div>

      <div className="agent-terminal__ascii-bar">
        <span>+-- {state.mode === 'demo' ? 'demo_builder_stream' : 'live_builder_stream'}</span>
        <span>
          {connected
            ? state.repoRootHealth === 'ready'
              ? '[repo-ready]'
              : '[repo-missing]'
            : '[reconnect]'}
        </span>
      </div>

      {(state.currentTask || state.mode !== 'real' || state.lastFailure || state.blockedReason) ? (
        <div className="agent-terminal__quest">
          <div className="agent-terminal__quest-head">
            <div className="agent-terminal__quest-badge">{questBadge}</div>

            <div className="agent-terminal__quest-copy">
              <div className="agent-terminal__quest-kicker">{questKicker}</div>
              <div className="agent-terminal__quest-title">{questTitle}</div>
            </div>

            {state.isWorking ? (
              <div className="agent-terminal__quest-pips" aria-hidden="true">
                <span />
                <span />
                <span />
              </div>
            ) : null}
          </div>

          <div className="agent-terminal__quest-action">{questSubline}</div>

          {(state.currentDecision?.reasoning ||
            state.startupIssues[0] ||
            state.lastFailure ||
            state.blockedReason) ? (
            <div className="agent-terminal__decision">
              <div className="agent-terminal__decision-kicker">&gt; reasoning_log</div>
              <div className="agent-terminal__decision-copy">
                {state.currentDecision?.reasoning ||
                  state.blockedReason ||
                  state.lastFailure ||
                  state.startupIssues[0]}
              </div>
            </div>
          ) : null}
        </div>
      ) : null}

      <div ref={outputRef} className="agent-terminal__viewport">
        <div className="agent-terminal__viewport-inner">
          {displayedText ? (
            <div className="agent-terminal__stream">
              {renderOutput(displayedText)}
              {state.isWorking ? (
                <span className="agent-terminal__cursor" aria-hidden="true" />
              ) : null}
            </div>
          ) : (
            <div className="agent-terminal__empty">
              {buildIdleMessage(state, connected)}
            </div>
          )}
        </div>
      </div>

      {state.completedTasks.length > 0 ? (
        <div className="agent-terminal__footer">
          <div className="agent-terminal__footer-label">recent_work.log</div>
          <div className="agent-terminal__inventory">
            {state.completedTasks.slice(0, 3).map((task, index) => (
              <div
                key={`${task.title}-${task.completedAt}-${index}`}
                className="agent-terminal__inventory-item"
              >
                <span className="agent-terminal__inventory-icon">&gt;</span>
                <span className="agent-terminal__inventory-title">
                  {trimTaskTitle(task.title)}
                </span>
                <span className="agent-terminal__inventory-time">
                  [{formatTime(task.completedAt)}]
                </span>
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
};

export default AgentTerminal;
