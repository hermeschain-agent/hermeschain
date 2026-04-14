import React from 'react';
import {
  ConnectionState,
  HermesDockState,
  VerificationStatus,
} from './useHermesDockState';

interface HermesDockProps {
  state: HermesDockState;
  mobile?: boolean;
  open?: boolean;
  onClose?: () => void;
  onNavigate?: (tab: 'terminal' | 'hermes' | 'logs') => void;
}

function formatRelativeTime(value?: string | number | null): string {
  if (!value) return 'Waiting';

  const timestamp = typeof value === 'number' ? value : new Date(value).getTime();
  const diff = Math.max(0, Date.now() - timestamp);
  const seconds = Math.floor(diff / 1000);

  if (seconds < 60) return `${seconds}s ago`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  return `${Math.floor(seconds / 86400)}d ago`;
}

function formatDuration(value?: number | null): string {
  if (!value || value <= 0) return 'Syncing';

  const hours = Math.floor(value / 3600000);
  const minutes = Math.floor((value % 3600000) / 60000);
  return `${hours}h ${minutes}m`;
}

function connectionCopy(connectionState: ConnectionState): string {
  const labels: Record<ConnectionState, string> = {
    live: 'Live',
    polling: 'Polling fallback',
    offline: 'Offline',
  };

  return labels[connectionState];
}

function verificationCopy(status: VerificationStatus): string {
  const labels: Record<VerificationStatus, string> = {
    pending: 'Pending',
    running: 'Running',
    passed: 'Passed',
    failed: 'Failed',
    not_applicable: 'N/A',
  };

  return labels[status];
}

function modeCopy(state: HermesDockState): string {
  if (!state.agentEnabled || state.mode === 'disabled') {
    return 'Disabled';
  }

  if (state.mode === 'demo') {
    return 'Demo';
  }

  return 'Real';
}

function priorityCopy(state: HermesDockState): string {
  if (!state.agentEnabled || state.mode === 'disabled') {
    return state.startupIssues[0] || 'Hermes is currently disabled.';
  }

  if (state.mode === 'demo') {
    return 'Hermes is streaming a read-only demo. No repository files are being changed.';
  }

  if (state.runStatus === 'blocked') {
    return state.blockedReason || 'The current task is blocked and needs operator input.';
  }

  if (state.verificationStatus === 'failed') {
    return state.lastFailure || 'The last verification pass failed.';
  }

  if (state.activeTool) {
    return `Active tool: ${state.activeTool}.`;
  }

  if (state.isWorking) {
    return `Hermes is ${state.runStatus.replace(/_/g, ' ')} a scoped task.`;
  }

  return 'Watching the chain, waiting for the next verified task.';
}

export default function HermesDock({
  state,
  mobile = false,
  open = true,
  onClose,
  onNavigate,
}: HermesDockProps) {
  const dockClassName = mobile
    ? `hermes-sheet ${open ? 'open' : ''}`
    : 'hermes-dock';

  return (
    <>
      {mobile && open ? <div className="hermes-sheet-backdrop" onClick={onClose} /> : null}
      <aside className={dockClassName} aria-hidden={mobile ? !open : false}>
        <div className="dock-frame">
          <div className="dock-header">
            <div>
              <span className="section-label">Hermes Presence</span>
              <h3>Living Hermes Shell</h3>
            </div>
            <div className={`live-status-chip ${state.connectionState}`}>
              <span
                className={`live-dot ${
                  state.connectionState === 'offline' ? 'off' : 'on'
                }`}
              />
              {connectionCopy(state.connectionState)}
            </div>
          </div>

          <div className="sigil-divider" />

          <div className="artifact-card dock-priority-card">
            <div className="artifact-meta">
              <span className="artifact-kicker">
                {state.currentTask ? 'Current task' : 'Agent state'}
              </span>
              <span className="artifact-sources">
                {state.viewerCount} viewer{state.viewerCount === 1 ? '' : 's'}
              </span>
            </div>
            <h4>
              {state.currentTask?.title ||
                (state.mode === 'demo'
                  ? 'Read-only demo stream'
                  : state.mode === 'disabled'
                    ? 'Hermes is disabled'
                    : 'Hermes is idle between verified runs')}
            </h4>
            <p>{priorityCopy(state)}</p>
          </div>

          <div className="artifact-grid dock-metrics">
            <div className="artifact-card">
              <span className="artifact-kicker">Mode</span>
              <h4>{modeCopy(state)}</h4>
              <p>
                {state.runStatus === 'idle'
                  ? 'No active run.'
                  : `Run status: ${state.runStatus.replace(/_/g, ' ')}`}
              </p>
            </div>

            <div className="artifact-card">
              <span className="artifact-kicker">Verification</span>
              <h4>{verificationCopy(state.verificationStatus)}</h4>
              <p>
                {state.verificationStatus === 'failed'
                  ? state.lastFailure || 'The latest run did not pass verification.'
                  : state.blockedReason || 'Verification state is being tracked live.'}
              </p>
            </div>

            <div className="artifact-card">
              <span className="artifact-kicker">Chain age</span>
              <h4>{formatDuration(state.chainAgeMs)}</h4>
              <p>
                {state.latestBlock
                  ? `Latest block ${state.latestBlock.height.toLocaleString()} • ${formatRelativeTime(
                      state.latestBlock.timestamp
                    )}`
                  : 'Awaiting latest block data.'}
              </p>
            </div>

            <div className="artifact-card">
              <span className="artifact-kicker">Latest commit</span>
              <h4>{state.latestCommit?.shortHash || 'No commit yet'}</h4>
              <p>
                {state.latestCommit
                  ? `${state.latestCommit.message} • ${state.latestCommit.date}`
                  : state.mode === 'demo'
                    ? 'Demo mode does not create commits.'
                    : 'Hermes has not reported a recent verified commit.'}
              </p>
            </div>

            <div className="artifact-card">
              <span className="artifact-kicker">Chain state</span>
              <h4>{state.chainStats.blockHeight.toLocaleString()}</h4>
              <p>
                {state.chainStats.transactionCount.toLocaleString()} stored transactions
              </p>
            </div>

            <div className="artifact-card">
              <span className="artifact-kicker">Repo root</span>
              <h4>{state.repoRootHealth === 'ready' ? 'Resolved' : 'Missing'}</h4>
              <p>
                {state.repoRootHealth === 'ready'
                  ? 'Real mode can target the repository safely.'
                  : 'Real mode is unavailable until the repo root resolves cleanly.'}
              </p>
            </div>
          </div>

          <div className="engraved-panel dock-activity-panel">
            <div className="panel-head tight">
              <span className="section-label">Recent activity</span>
              <p>Last three visible actions from Hermes.</p>
            </div>

            <div className="dock-activity-list">
              {state.recentActivity.length === 0 ? (
                <div className="dock-empty">
                  {state.error || state.startupIssues[0] || 'The dock is waiting for the first live event.'}
                </div>
              ) : (
                state.recentActivity.map((item) => (
                  <article key={item.id} className="dock-activity-item">
                    <div className="dock-activity-meta">
                      <span>{item.label}</span>
                      <span>{formatRelativeTime(item.timestamp)}</span>
                    </div>
                    <p>{item.content}</p>
                  </article>
                ))
              )}
            </div>
          </div>

          <div className="dock-actions">
            <button className="btn-ghost" onClick={() => onNavigate?.('terminal')}>
              Open Terminal
            </button>
            <button className="btn-primary" onClick={() => onNavigate?.('logs')}>
              Watch Logs
            </button>
            {mobile ? (
              <button className="btn-ghost" onClick={onClose}>
                Close Dock
              </button>
            ) : null}
          </div>
        </div>
      </aside>
    </>
  );
}
