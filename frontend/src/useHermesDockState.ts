import { useEffect, useState } from 'react';

export type ConnectionState = 'live' | 'polling' | 'offline';
export type AgentMode = 'disabled' | 'demo' | 'real';
export type TaskRunStatus =
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
export type VerificationStatus =
  | 'pending'
  | 'running'
  | 'passed'
  | 'failed'
  | 'not_applicable';
export type RitualKind =
  | 'explain_last_block'
  | 'summarize_today'
  | 'guide_this_page';

export interface RitualSourceRef {
  kind: 'block' | 'task' | 'log' | 'commit';
  id: string;
}

export interface RitualResponse {
  title: string;
  message: string;
  sourceRefs: RitualSourceRef[];
}

export interface HermesActivityItem {
  id: string;
  type: string;
  label: string;
  content: string;
  timestamp: string;
}

export interface HermesCurrentTask {
  id: string;
  title: string;
  type: string;
  agent: string;
}

export interface HermesLatestBlock {
  height: number;
  hash: string;
  producer: string;
  timestamp: number;
  transactionCount: number;
}

export interface HermesLatestCommit {
  hash: string;
  shortHash: string;
  message: string;
  author: string;
  date: string;
}

export interface HermesTaskRunSummary {
  id: string;
  sourceTaskId: string;
  title: string;
  type: string;
  mode: AgentMode;
  status: TaskRunStatus;
  verificationStatus: VerificationStatus;
  changedFiles: string[];
  failureReason: string | null;
  blockedReason: string | null;
  completedAt?: string | null;
}

export interface HermesDockState {
  connectionState: ConnectionState;
  mode: AgentMode;
  streamMode: AgentMode;
  runStatus: TaskRunStatus;
  verificationStatus: VerificationStatus;
  blockedReason: string | null;
  lastFailure: string | null;
  repoRootHealth: 'ready' | 'missing';
  agentEnabled: boolean;
  startupIssues: string[];
  viewerCount: number;
  isWorking: boolean;
  currentTask: HermesCurrentTask | null;
  activeTool: string | null;
  recentActivity: HermesActivityItem[];
  recentRuns: HermesTaskRunSummary[];
  latestBlock: HermesLatestBlock | null;
  latestCommit: HermesLatestCommit | null;
  chainStats: {
    blockHeight: number;
    transactionCount: number;
  };
  chainAgeMs: number | null;
  lastUpdatedAt: number | null;
  error: string | null;
}

const INITIAL_STATE: HermesDockState = {
  connectionState: 'offline',
  mode: 'disabled',
  streamMode: 'disabled',
  runStatus: 'idle',
  verificationStatus: 'pending',
  blockedReason: null,
  lastFailure: null,
  repoRootHealth: 'missing',
  agentEnabled: false,
  startupIssues: [],
  viewerCount: 0,
  isWorking: false,
  currentTask: null,
  activeTool: null,
  recentActivity: [],
  recentRuns: [],
  latestBlock: null,
  latestCommit: null,
  chainStats: {
    blockHeight: 0,
    transactionCount: 0,
  },
  chainAgeMs: null,
  lastUpdatedAt: null,
  error: null,
};

function getActivityLabel(type: string): string {
  const labels: Record<string, string> = {
    task_start: 'Task',
    analysis_start: 'Analysis',
    tool_use: 'Tool',
    tool_result: 'Result',
    verification_start: 'Verify',
    verification_result: 'Verified',
    task_complete: 'Complete',
    task_blocked: 'Blocked',
    git_commit: 'Commit',
    error: 'Error',
    output: 'Output',
    system: 'System',
  };

  return labels[type] || 'Activity';
}

function toActivityItem(entry: any): HermesActivityItem {
  return {
    id: entry.id || `activity-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    type: entry.type || 'system',
    label: getActivityLabel(entry.type || 'system'),
    content: entry.content || 'No details available.',
    timestamp:
      typeof entry.timestamp === 'string'
        ? entry.timestamp
        : new Date(entry.timestamp || Date.now()).toISOString(),
  };
}

function extractToolName(content: string): string | null {
  const match = content.match(/Using tool:\s*(.+)$/i);
  return match?.[1]?.trim() || null;
}

function applyStatusPayload(
  payload: any,
  previous: HermesDockState
): HermesDockState {
  return {
    ...previous,
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
    agentEnabled:
      typeof payload?.agentEnabled === 'boolean'
        ? payload.agentEnabled
        : previous.agentEnabled,
    startupIssues: Array.isArray(payload?.startupIssues)
      ? payload.startupIssues
      : previous.startupIssues,
    viewerCount:
      typeof payload?.viewerCount === 'number'
        ? payload.viewerCount
        : previous.viewerCount,
    isWorking:
      typeof payload?.isWorking === 'boolean'
        ? payload.isWorking
        : previous.isWorking,
    currentTask: payload?.currentTask || null,
    recentRuns: Array.isArray(payload?.recentRuns)
      ? payload.recentRuns
      : previous.recentRuns,
    chainStats: {
      blockHeight:
        payload?.blockHeight ?? previous.chainStats.blockHeight,
      transactionCount:
        payload?.storedTransactionCount ??
        payload?.transactionCount ??
        previous.chainStats.transactionCount,
    },
    chainAgeMs:
      typeof payload?.chainAgeMs === 'number'
        ? payload.chainAgeMs
        : previous.chainAgeMs,
    lastUpdatedAt: Date.now(),
    error: null,
  };
}

export function useHermesDockState(apiBase: string): HermesDockState {
  const [state, setState] = useState<HermesDockState>(INITIAL_STATE);

  useEffect(() => {
    const liveConnections = { agent: false, logs: false };
    let pollingInterval: number | null = null;
    let agentReconnect: number | null = null;
    let logsReconnect: number | null = null;
    let agentSource: EventSource | null = null;
    let logsSource: EventSource | null = null;
    let isDisposed = false;

    const stopPolling = () => {
      if (pollingInterval !== null) {
        window.clearInterval(pollingInterval);
        pollingInterval = null;
      }
    };

    const updateConnectionState = () => {
      if (isDisposed) return;

      if (liveConnections.agent || liveConnections.logs) {
        stopPolling();
        setState((prev) => ({
          ...prev,
          connectionState: 'live',
          error: null,
        }));
        return;
      }

      if (pollingInterval !== null) {
        setState((prev) => ({
          ...prev,
          connectionState: 'polling',
        }));
        return;
      }

      setState((prev) => ({
        ...prev,
        connectionState: 'offline',
      }));
    };

    const refreshSnapshot = async (includeLogs: boolean = false) => {
      const requests = [
        fetch(`${apiBase}/api/agent/status`),
        fetch(`${apiBase}/api/chain/latest`),
        fetch(`${apiBase}/api/git/status`),
        fetch(`${apiBase}/api/status`),
        includeLogs ? fetch(`${apiBase}/api/logs/recent?limit=3`) : Promise.resolve(null),
      ] as const;

      const [statusResult, blockResult, gitResult, systemResult, logsResult] =
        await Promise.allSettled(requests);

      let successCount = 0;

      if (
        statusResult.status === 'fulfilled' &&
        statusResult.value &&
        statusResult.value.ok
      ) {
        const data = await statusResult.value.json();
        successCount += 1;
        setState((prev) => applyStatusPayload(data, prev));
      }

      if (
        blockResult.status === 'fulfilled' &&
        blockResult.value &&
        blockResult.value.ok
      ) {
        const data = await blockResult.value.json();
        successCount += 1;
        setState((prev) => ({
          ...prev,
          latestBlock: data,
          lastUpdatedAt: Date.now(),
        }));
      }

      if (gitResult.status === 'fulfilled' && gitResult.value && gitResult.value.ok) {
        const data = await gitResult.value.json();
        successCount += 1;
        setState((prev) => ({
          ...prev,
          latestCommit: data.recentCommits?.[0] || null,
          lastUpdatedAt: Date.now(),
        }));
      }

      if (
        systemResult.status === 'fulfilled' &&
        systemResult.value &&
        systemResult.value.ok
      ) {
        const data = await systemResult.value.json();
        successCount += 1;
        setState((prev) => ({
          ...prev,
          chainAgeMs:
            typeof data?.uptime === 'number'
              ? data.uptime
              : typeof data?.genesisTime === 'number'
                ? Date.now() - data.genesisTime
                : prev.chainAgeMs,
          chainStats: {
            blockHeight:
              typeof data?.chainLength === 'number'
                ? data.chainLength
                : prev.chainStats.blockHeight,
            transactionCount:
              data?.storedTransactions ??
              data?.totalTransactions ??
              prev.chainStats.transactionCount,
          },
          lastUpdatedAt: Date.now(),
        }));
      }

      if (
        includeLogs &&
        logsResult.status === 'fulfilled' &&
        logsResult.value &&
        logsResult.value.ok
      ) {
        const data = await logsResult.value.json();
        const recentActivity = (data.logs || []).map(toActivityItem).slice(-3).reverse();
        successCount += 1;
        setState((prev) => ({
          ...prev,
          recentActivity,
          activeTool:
            recentActivity
              .find((item) => item.type === 'tool_use')
              ?.content.match(/Using tool:\s*(.+)$/i)?.[1]
              ?.trim() || prev.activeTool,
          lastUpdatedAt: Date.now(),
        }));
      }

      if (successCount === 0) {
        setState((prev) => ({
          ...prev,
          error:
            prev.mode === 'disabled'
              ? prev.startupIssues[0] || 'Hermes is disabled.'
              : 'Hermes live feeds are temporarily unavailable.',
          connectionState: pollingInterval !== null ? 'polling' : 'offline',
        }));
      } else if (!liveConnections.agent && !liveConnections.logs) {
        setState((prev) => ({
          ...prev,
          connectionState: 'polling',
        }));
      }
    };

    const startPolling = () => {
      if (pollingInterval !== null || isDisposed) return;

      pollingInterval = window.setInterval(() => {
        void refreshSnapshot(true);
      }, 15000);

      void refreshSnapshot(true);
      updateConnectionState();
    };

    const connectAgentStream = () => {
      if (isDisposed) return;

      agentSource = new EventSource(`${apiBase}/api/agent/stream`);

      agentSource.onopen = () => {
        liveConnections.agent = true;
        updateConnectionState();
      };

      agentSource.onmessage = (event) => {
        try {
          const payload = JSON.parse(event.data);

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
                      payload.data?.status === 'idle'
                        ? false
                        : prev.isWorking,
                  },
                  prev
                )
              );
              break;
            case 'task_start':
              setState((prev) => ({
                ...applyStatusPayload(payload.data, prev),
                isWorking: true,
                currentTask: payload.data?.task || prev.currentTask,
                runStatus: payload.data?.runStatus || 'selected',
                blockedReason: null,
                lastFailure: null,
              }));
              break;
            case 'analysis_start':
              setState((prev) => ({
                ...prev,
                runStatus: 'analyzing',
                lastUpdatedAt: Date.now(),
              }));
              break;
            case 'tool_start':
              setState((prev) => ({
                ...prev,
                activeTool: payload.data?.tool || prev.activeTool,
                runStatus: 'executing',
                lastUpdatedAt: Date.now(),
              }));
              break;
            case 'tool_result':
              setState((prev) => ({
                ...prev,
                activeTool: null,
                lastFailure:
                  payload.data?.result?.error || prev.lastFailure,
                lastUpdatedAt: Date.now(),
              }));
              break;
            case 'verification_start':
              setState((prev) => ({
                ...prev,
                runStatus: 'verifying',
                verificationStatus: 'running',
                lastUpdatedAt: Date.now(),
              }));
              break;
            case 'verification_result':
              setState((prev) => ({
                ...prev,
                verificationStatus:
                  payload.data?.success === false
                    ? 'failed'
                    : prev.verificationStatus === 'running'
                      ? 'running'
                      : prev.verificationStatus,
                lastFailure:
                  payload.data?.failureReason || prev.lastFailure,
                lastUpdatedAt: Date.now(),
              }));
              break;
            case 'task_complete':
              setState((prev) => ({
                ...prev,
                isWorking: false,
                currentTask: null,
                activeTool: null,
                runStatus: 'idle',
                verificationStatus:
                  payload.data?.verificationStatus || 'passed',
                blockedReason: null,
                lastUpdatedAt: Date.now(),
              }));
              break;
            case 'task_blocked':
              setState((prev) => ({
                ...prev,
                isWorking: false,
                runStatus: 'blocked',
                blockedReason: payload.data?.reason || 'Task blocked',
                verificationStatus: 'failed',
                activeTool: null,
                lastUpdatedAt: Date.now(),
              }));
              break;
            case 'error':
              setState((prev) => ({
                ...prev,
                isWorking: false,
                runStatus: 'failed',
                verificationStatus: 'failed',
                lastFailure: payload.data?.message || 'Agent error',
                activeTool: null,
                lastUpdatedAt: Date.now(),
              }));
              break;
            case 'heartbeat':
              setState((prev) => ({
                ...prev,
                viewerCount: payload.viewerCount || prev.viewerCount,
                lastUpdatedAt: Date.now(),
              }));
              break;
            default:
              break;
          }
        } catch {
          // Ignore malformed stream messages.
        }
      };

      agentSource.onerror = () => {
        liveConnections.agent = false;
        agentSource?.close();
        startPolling();
        updateConnectionState();
        agentReconnect = window.setTimeout(connectAgentStream, 8000);
      };
    };

    const connectLogsStream = () => {
      if (isDisposed) return;

      logsSource = new EventSource(`${apiBase}/api/logs/stream`);

      logsSource.onopen = () => {
        liveConnections.logs = true;
        updateConnectionState();
      };

      logsSource.onmessage = (event) => {
        try {
          const payload = JSON.parse(event.data);

          if (payload.type === 'init') {
            const recentActivity = (payload.logs || [])
              .map(toActivityItem)
              .slice(-3)
              .reverse();

            setState((prev) => ({
              ...prev,
              recentActivity,
              activeTool:
                recentActivity
                  .find((item) => item.type === 'tool_use')
                  ?.content.match(/Using tool:\s*(.+)$/i)?.[1]
                  ?.trim() || prev.activeTool,
              lastUpdatedAt: Date.now(),
            }));
            return;
          }

          if (payload.type === 'log' && payload.entry) {
            const item = toActivityItem(payload.entry);
            setState((prev) => ({
              ...prev,
              recentActivity: [item, ...prev.recentActivity].slice(0, 3),
              activeTool:
                item.type === 'tool_use'
                  ? extractToolName(item.content) || prev.activeTool
                  : prev.activeTool,
              lastUpdatedAt: Date.now(),
            }));
          }
        } catch {
          // Ignore malformed stream messages.
        }
      };

      logsSource.onerror = () => {
        liveConnections.logs = false;
        logsSource?.close();
        startPolling();
        updateConnectionState();
        logsReconnect = window.setTimeout(connectLogsStream, 10000);
      };
    };

    void refreshSnapshot(true);
    connectAgentStream();
    connectLogsStream();

    return () => {
      isDisposed = true;
      liveConnections.agent = false;
      liveConnections.logs = false;
      stopPolling();
      agentSource?.close();
      logsSource?.close();
      if (agentReconnect !== null) window.clearTimeout(agentReconnect);
      if (logsReconnect !== null) window.clearTimeout(logsReconnect);
    };
  }, [apiBase]);

  return state;
}

export default useHermesDockState;
