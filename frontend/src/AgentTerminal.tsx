import React, { useCallback, useEffect, useRef, useState } from 'react';

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

interface AgentState {
  isWorking: boolean;
  currentTask: Task | null;
  currentOutput: string;
  completedTasks: CompletedTask[];
  viewerCount: number;
  brainActive: boolean;
  currentDecision: Decision | null;
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

const API_BASE =
  window.location.hostname === 'localhost' ? 'http://localhost:4000' : '';

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

const AgentTerminal: React.FC<AgentTerminalProps> = ({ variant = 'rail' }) => {
  const [state, setState] = useState<AgentState>({
    isWorking: false,
    currentTask: null,
    currentOutput: '',
    completedTasks: [],
    viewerCount: 0,
    brainActive: false,
    currentDecision: null,
  });
  const [connected, setConnected] = useState(false);
  const [displayedText, setDisplayedText] = useState('');
  const outputRef = useRef<HTMLDivElement>(null);
  const textBufferRef = useRef('');
  const displayIndexRef = useRef(0);
  const animationFrameRef = useRef<number>();

  const typewriterEffect = useCallback(() => {
    const buffer = textBufferRef.current;
    const currentIndex = displayIndexRef.current;

    if (currentIndex < buffer.length) {
      const charsToAdd = Math.min(3, buffer.length - currentIndex);
      displayIndexRef.current = currentIndex + charsToAdd;
      setDisplayedText(buffer.slice(0, displayIndexRef.current));

      animationFrameRef.current = requestAnimationFrame(typewriterEffect);
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
        const response = await fetch(`${API_BASE}/api/agent/status`);
        if (!response.ok) return;

        const data = await response.json();
        if (data.recentTasks && data.recentTasks.length > 0) {
          setState((prev) => ({
            ...prev,
            completedTasks: data.recentTasks,
            isWorking: data.isWorking,
            currentTask: data.currentTask,
            viewerCount: data.viewerCount || 0,
          }));
        }
      } catch (error) {
        console.error('[AgentTerminal] Failed to load persisted tasks:', error);
      }
    };

    void loadPersistedTasks();
  }, []);

  useEffect(() => {
    let eventSource: EventSource | null = null;
    let reconnectTimeout: NodeJS.Timeout;

    const connect = () => {
      eventSource = new EventSource(`${API_BASE}/api/agent/stream`);

      eventSource.onopen = () => {
        setConnected(true);
      };

      eventSource.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);

          switch (data.type) {
            case 'init':
              setState((prev) => ({
                ...prev,
                isWorking: data.data.isWorking,
                currentTask: data.data.currentTask,
                completedTasks: data.data.completedTasks || [],
                viewerCount: data.data.viewerCount || 1,
              }));
              if (data.data.currentOutput) {
                textBufferRef.current = data.data.currentOutput;
                displayIndexRef.current = data.data.currentOutput.length;
                setDisplayedText(data.data.currentOutput);
              }
              break;

            case 'task_start':
              resetOutput();
              setState((prev) => ({
                ...prev,
                isWorking: true,
                currentTask: data.data.task,
                brainActive: data.data.brainActive || false,
                currentDecision: data.data.decision || null,
              }));
              break;

            case 'brain_status':
              setState((prev) => ({
                ...prev,
                brainActive: data.data.active,
              }));
              break;

            case 'text':
              appendText(data.data);
              break;

            case 'tool_start':
              appendText(`\n> [TOOL] ${data.data.tool}\n`);
              break;

            case 'tool_complete':
              if (data.data.result?.error) {
                appendText(`> [ERROR] ${data.data.result.error}\n`);
              }
              break;

            case 'agent_thought':
              appendText(`\n[THINKING] ${data.data.thought}\n`);
              break;

            case 'task_complete':
              setState((prev) => ({
                ...prev,
                isWorking: false,
                completedTasks: [
                  {
                    title: data.data.title,
                    agent: prev.currentTask?.agent || 'OPEN',
                    completedAt: new Date().toISOString(),
                  },
                  ...prev.completedTasks.slice(0, 4),
                ],
              }));
              break;

            case 'git_deploy':
              appendText(
                `\n[DEPLOYED] Commit ${data.data.commit} pushed to ${
                  data.data.branch || 'main'
                }\n`
              );
              appendText(`  Message: ${data.data.message}\n`);
              appendText(
                `  View: https://github.com/OPENchain/hermeschain/commit/${data.data.commit}\n`
              );
              break;

            case 'status':
              if (data.data.status === 'idle') {
                setState((prev) => ({ ...prev, isWorking: false }));
              }
              break;

            case 'heartbeat':
              setState((prev) => ({
                ...prev,
                viewerCount: data.viewerCount || prev.viewerCount,
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
        reconnectTimeout = setTimeout(connect, 3000);
      };
    };

    connect();

    return () => {
      eventSource?.close();
      clearTimeout(reconnectTimeout);
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
              <div className="agent-row__title">
                {line.replace('> [TOOL] ', '')}
              </div>
            </div>
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

      if (line.startsWith('[THINKING]')) {
        return (
          <div key={index} className="agent-row agent-row--thought agent-row--special">
            <span className="agent-row__glyph">*</span>
            <div className="agent-row__body">
              <div className="agent-row__meta">thought_log</div>
              <div className="agent-row__title">
                {line.replace('[THINKING] ', '')}
              </div>
            </div>
          </div>
        );
      }

      if (line.startsWith('[DEPLOYED]')) {
        return (
          <div key={index} className="agent-row agent-row--deploy agent-row--special">
            <span className="agent-row__glyph">#</span>
            <div className="agent-row__body">
              <div className="agent-row__meta">git_push</div>
              <div className="agent-row__title">
                {line.replace('[DEPLOYED] ', '')}
              </div>
            </div>
          </div>
        );
      }

      if (line.includes('github.com/OPENchain')) {
        const href = line.replace('  View: ', '').trim();
        return (
          <div key={index} className="agent-row agent-row--link">
            <span className="agent-row__glyph">@</span>
            <div className="agent-row__body">
              <a href={href} target="_blank" rel="noopener noreferrer">
                {href}
              </a>
            </div>
          </div>
        );
      }

      if (line.startsWith('> [ERROR]')) {
        return (
          <div key={index} className="agent-row agent-row--error agent-row--special">
            <span className="agent-row__glyph">!</span>
            <div className="agent-row__body">
              <div className="agent-row__meta">stderr</div>
              <div className="agent-row__title">
                {line.replace('> [ERROR] ', '')}
              </div>
            </div>
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

  const connectionLabel = connected
    ? state.isWorking
      ? 'WORKING'
      : 'IDLE'
    : 'OFFLINE';

  return (
    <div className={`agent-terminal agent-terminal--${variant}`}>
      <div className="agent-terminal__topbar">
        <div className="agent-terminal__topbar-left">
          <div className="agent-terminal__lights" aria-hidden="true">
            <span className="agent-terminal__light agent-terminal__light--red" />
            <span className="agent-terminal__light agent-terminal__light--amber" />
            <span className="agent-terminal__light agent-terminal__light--green" />
          </div>
          <div className="agent-terminal__path">
            <span className="agent-terminal__prompt">$</span>
            tty://hermes-agent
          </div>
        </div>

        <div className="agent-terminal__hud">
          {state.brainActive ? (
            <div className="agent-terminal__chip agent-terminal__chip--auto">
              <span className="agent-terminal__chip-label">mode</span>
              <span className="agent-terminal__chip-value">auto</span>
            </div>
          ) : null}

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
            <span className="agent-terminal__chip-value">{connectionLabel.toLowerCase()}</span>
          </div>
        </div>
      </div>

      <div className="agent-terminal__ascii-bar">
        <span>+-- live_builder_stream</span>
        <span>{connected ? '[attached]' : '[reconnect]'}</span>
      </div>

      {state.currentTask ? (
        <div className="agent-terminal__quest">
          <div className="agent-terminal__quest-head">
            <div className="agent-terminal__quest-badge">{state.currentTask.agent}</div>

            <div className="agent-terminal__quest-copy">
              <div className="agent-terminal__quest-kicker">$ current_objective</div>
              <div className="agent-terminal__quest-title">
                {state.currentTask.title}
              </div>
            </div>

            {state.isWorking ? (
              <div className="agent-terminal__quest-pips" aria-hidden="true">
                <span />
                <span />
                <span />
              </div>
            ) : null}
          </div>

          {state.currentDecision?.action ? (
            <div className="agent-terminal__quest-action">
              $ action :: {state.currentDecision.action}
            </div>
          ) : null}

          {state.brainActive && state.currentDecision?.reasoning ? (
            <div className="agent-terminal__decision">
              <div className="agent-terminal__decision-kicker">&gt; reasoning_log</div>
              <div className="agent-terminal__decision-copy">
                {state.currentDecision.reasoning}
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
              {connected
                ? '$ waiting_for_agent_to_start...'
                : '$ connecting_to_agent_stream...'}
            </div>
          )}
        </div>
      </div>

      {state.completedTasks.length > 0 ? (
        <div className="agent-terminal__footer">
          <div className="agent-terminal__footer-label">recent_work.log</div>
          <div className="agent-terminal__inventory">
            {state.completedTasks.slice(0, 3).map((task, index) => (
              <div key={`${task.title}-${task.completedAt}-${index}`} className="agent-terminal__inventory-item">
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
