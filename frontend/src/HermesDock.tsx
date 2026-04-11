import React from 'react';
import { ConnectionState, HermesDockState } from './useHermesDockState';

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

function connectionCopy(connectionState: ConnectionState): string {
  const labels: Record<ConnectionState, string> = {
    live: 'Live',
    polling: 'Polling fallback',
    offline: 'Offline',
  };

  return labels[connectionState];
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
              <span className="artifact-kicker">Current task</span>
              <span className="artifact-sources">
                {state.viewerCount} viewer{state.viewerCount === 1 ? '' : 's'}
              </span>
            </div>
            <h4>{state.currentTask?.title || 'Hermes is idle between blocks'}</h4>
            <p>
              {state.activeTool
                ? `Active tool: ${state.activeTool}.`
                : state.isWorking
                  ? 'The chain is mid-task and still producing activity.'
                  : 'Watching the chain, waiting for the next meaningful action.'}
            </p>
          </div>

          <div className="artifact-grid dock-metrics">
            <div className="artifact-card">
              <span className="artifact-kicker">Latest block</span>
              <h4>
                {state.latestBlock ? `#${state.latestBlock.height}` : 'Awaiting block'}
              </h4>
              <p>
                {state.latestBlock
                  ? `${state.latestBlock.transactionCount} tx • ${formatRelativeTime(
                      state.latestBlock.timestamp
                    )}`
                  : 'No block data yet.'}
              </p>
            </div>

            <div className="artifact-card">
              <span className="artifact-kicker">Latest commit</span>
              <h4>{state.latestCommit?.shortHash || 'No commit yet'}</h4>
              <p>
                {state.latestCommit
                  ? `${state.latestCommit.message} • ${state.latestCommit.date}`
                  : 'Hermes has not reported a recent commit.'}
              </p>
            </div>

            <div className="artifact-card">
              <span className="artifact-kicker">Chain state</span>
              <h4>{state.chainStats.blockHeight.toLocaleString()}</h4>
              <p>
                {state.chainStats.transactionCount.toLocaleString()} total transactions
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
                  {state.error || 'The dock is waiting for the first live event.'}
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
