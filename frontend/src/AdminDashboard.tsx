import React, { useEffect, useState } from 'react';

interface HealthCheck {
  name: string;
  status: 'ok' | 'warning' | 'error';
  details: string;
}

interface SystemHealth {
  status: string;
  timestamp: string;
  checks: HealthCheck[];
}

interface SystemStats {
  agent: {
    isWorking: boolean;
    currentTask: string | null;
    completedTasks: number;
    brainActive: boolean;
    uptime: number;
  };
  system: {
    platform: string;
    nodeVersion: string;
    memory: {
      heapUsed: number;
      heapTotal: number;
      rss: number;
    };
    cpu: {
      loadAvg1m: string;
      cores: number;
    };
  };
  api: {
    totalCalls: number;
    tokensIn: number;
    tokensOut: number;
    estimatedCost: string;
  };
}

interface ActivityEntry {
  timestamp: string;
  type: string;
  message: string;
}

interface GitStatus {
  branch: string;
  clean: boolean;
  changes: number;
  recentCommits: { shortHash: string; message: string; date: string }[];
  summary?: string;
}

const API_BASE =
  window.location.hostname === 'localhost' ? 'http://localhost:4000' : '';

const AdminDashboard: React.FC = () => {
  const [health, setHealth] = useState<SystemHealth | null>(null);
  const [stats, setStats] = useState<SystemStats | null>(null);
  const [activity, setActivity] = useState<ActivityEntry[]>([]);
  const [git, setGit] = useState<GitStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [pageError, setPageError] = useState<string | null>(null);
  const [actionMessage, setActionMessage] = useState<{
    type: 'success' | 'error' | 'info';
    text: string;
  } | null>(null);
  const [runningAction, setRunningAction] = useState<'ci' | 'reset' | null>(null);

  const fetchData = async () => {
    const [healthRes, statsRes, activityRes, gitRes] = await Promise.allSettled([
      fetch(`${API_BASE}/api/admin/health`),
      fetch(`${API_BASE}/api/admin/stats`),
      fetch(`${API_BASE}/api/admin/activity?limit=20`),
      fetch(`${API_BASE}/api/admin/git`),
    ]);

    let successCount = 0;

    if (
      healthRes.status === 'fulfilled' &&
      healthRes.value.ok
    ) {
      setHealth(await healthRes.value.json());
      successCount += 1;
    }

    if (
      statsRes.status === 'fulfilled' &&
      statsRes.value.ok
    ) {
      setStats(await statsRes.value.json());
      successCount += 1;
    }

    if (
      activityRes.status === 'fulfilled' &&
      activityRes.value.ok
    ) {
      const data = await activityRes.value.json();
      setActivity(data.entries || []);
      successCount += 1;
    }

    if (
      gitRes.status === 'fulfilled' &&
      gitRes.value.ok
    ) {
      setGit(await gitRes.value.json());
      successCount += 1;
    }

    setPageError(
      successCount === 0 ? 'Admin data is unavailable right now.' : null
    );
    setLoading(false);
  };

  useEffect(() => {
    void fetchData();
    const interval = window.setInterval(() => {
      void fetchData();
    }, 10000);
    return () => window.clearInterval(interval);
  }, []);

  const formatUptime = (seconds: number) => {
    const days = Math.floor(seconds / 86400);
    const hours = Math.floor((seconds % 86400) / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    if (days > 0) return `${days}d ${hours}h`;
    if (hours > 0) return `${hours}h ${mins}m`;
    return `${mins}m`;
  };

  const runCIChecks = async () => {
    setRunningAction('ci');
    setActionMessage(null);
    try {
      const response = await fetch(`${API_BASE}/api/admin/ci/run`, { method: 'POST' });
      if (!response.ok) {
        throw new Error('Failed to run CI checks');
      }
      setActionMessage({
        type: 'success',
        text: 'CI checks completed. Fresh results are loading below.',
      });
      await fetchData();
    } catch (error) {
      setActionMessage({
        type: 'error',
        text: error instanceof Error ? error.message : 'Failed to run CI checks',
      });
    } finally {
      setRunningAction(null);
    }
  };

  const resetStats = async () => {
    setRunningAction('reset');
    setActionMessage({
      type: 'info',
      text: 'Resetting API usage counters...',
    });

    try {
      const response = await fetch(`${API_BASE}/api/admin/reset-stats`, {
        method: 'POST',
      });
      if (!response.ok) {
        throw new Error('Failed to reset API usage stats');
      }
      setActionMessage({
        type: 'success',
        text: 'API usage stats reset successfully.',
      });
      await fetchData();
    } catch (error) {
      setActionMessage({
        type: 'error',
        text:
          error instanceof Error ? error.message : 'Failed to reset API usage stats',
      });
    } finally {
      setRunningAction(null);
    }
  };

  if (loading) {
    return (
      <div className="page-wide route-frame">
        <div className="dock-empty">Loading admin dashboard...</div>
      </div>
    );
  }

  return (
    <div className="page-wide route-frame admin-dashboard">
      <div className="section-head">
        <span className="kicker">Operator surface</span>
        <h2>Admin Dashboard</h2>
        <p>
          Internal health, agent runtime, API usage, and recent operational activity.
        </p>
      </div>

      {pageError ? (
        <div className="shell-banner shell-banner--warning">
          <strong>{pageError}</strong>
        </div>
      ) : null}

      {actionMessage ? (
        <div className={`shell-banner shell-banner--${actionMessage.type}`}>
          <strong>{actionMessage.text}</strong>
        </div>
      ) : null}

      <div className="admin-grid">
        <div className="engraved-panel">
          <div className="panel-head tight">
            <span className="section-label">System health</span>
            <p>
              {health
                ? `${health.status} as of ${new Date(health.timestamp).toLocaleTimeString()}`
                : 'No health data available.'}
            </p>
          </div>
          {health?.checks.length ? (
            <div className="admin-list">
              {health.checks.map((check) => (
                <div key={check.name} className={`admin-list-item is-${check.status}`}>
                  <div>
                    <strong>{check.name}</strong>
                    <p>{check.details}</p>
                  </div>
                  <span>{check.status.toUpperCase()}</span>
                </div>
              ))}
            </div>
          ) : (
            <div className="dock-empty">No system health checks are available.</div>
          )}
        </div>

        <div className="engraved-panel">
          <div className="panel-head tight">
            <span className="section-label">Agent runtime</span>
            <p>Current Hermes worker state and task throughput.</p>
          </div>
          <div className="admin-stat-list">
            <div><span>Status</span><strong>{stats?.agent.isWorking ? 'WORKING' : 'IDLE'}</strong></div>
            <div><span>Current task</span><strong>{stats?.agent.currentTask || 'None'}</strong></div>
            <div><span>Completed tasks</span><strong>{stats?.agent.completedTasks || 0}</strong></div>
            <div><span>Brain</span><strong>{stats?.agent.brainActive ? 'ACTIVE' : 'INACTIVE'}</strong></div>
            <div><span>Uptime</span><strong>{formatUptime(stats?.agent.uptime || 0)}</strong></div>
          </div>
        </div>

        <div className="engraved-panel">
          <div className="panel-head tight">
            <span className="section-label">API usage</span>
            <p>Token volume and rough cost estimate from the admin backend.</p>
          </div>
          <div className="admin-stat-list">
            <div><span>Total calls</span><strong>{stats?.api.totalCalls || 0}</strong></div>
            <div><span>Tokens in</span><strong>{(stats?.api.tokensIn || 0).toLocaleString()}</strong></div>
            <div><span>Tokens out</span><strong>{(stats?.api.tokensOut || 0).toLocaleString()}</strong></div>
            <div><span>Estimated cost</span><strong>{stats?.api.estimatedCost || '$0.00'}</strong></div>
          </div>
          <div className="admin-actions">
            <button
              className="btn-ghost"
              onClick={() => void resetStats()}
              disabled={runningAction === 'reset'}
            >
              {runningAction === 'reset' ? 'Resetting...' : 'Reset stats'}
            </button>
          </div>
        </div>

        <div className="engraved-panel">
          <div className="panel-head tight">
            <span className="section-label">System resources</span>
            <p>Current process memory and CPU overview.</p>
          </div>
          <div className="admin-stat-list">
            <div>
              <span>Memory (heap)</span>
              <strong>
                {stats?.system.memory.heapUsed ?? 0}MB / {stats?.system.memory.heapTotal ?? 0}MB
              </strong>
            </div>
            <div><span>Memory (RSS)</span><strong>{stats?.system.memory.rss ?? 0}MB</strong></div>
            <div><span>CPU load</span><strong>{stats?.system.cpu.loadAvg1m || '0.00'}</strong></div>
            <div><span>CPU cores</span><strong>{stats?.system.cpu.cores ?? 0}</strong></div>
            <div><span>Platform</span><strong>{stats?.system.platform || 'unknown'}</strong></div>
            <div><span>Node</span><strong>{stats?.system.nodeVersion || 'unknown'}</strong></div>
          </div>
        </div>
      </div>

      <div className="admin-grid admin-grid--secondary">
        <div className="engraved-panel">
          <div className="panel-head tight">
            <span className="section-label">Git state</span>
            <p>{git?.summary || 'No git summary is available right now.'}</p>
          </div>
          <div className="admin-stat-list">
            <div><span>Branch</span><strong>{git?.branch || 'unknown'}</strong></div>
            <div><span>Working tree</span><strong>{git?.clean ? 'Clean' : `${git?.changes ?? 0} changes`}</strong></div>
          </div>
          {git?.recentCommits?.length ? (
            <div className="admin-list">
              {git.recentCommits.map((commit) => (
                <div key={`${commit.shortHash}-${commit.date}`} className="admin-list-item">
                  <div>
                    <strong>{commit.shortHash}</strong>
                    <p>{commit.message}</p>
                  </div>
                  <span>{commit.date}</span>
                </div>
              ))}
            </div>
          ) : (
            <div className="dock-empty">No recent commits are visible yet.</div>
          )}
        </div>

        <div className="engraved-panel">
          <div className="panel-head tight">
            <span className="section-label">Actions</span>
            <p>Run operational actions without leaving the dashboard.</p>
          </div>
          <div className="admin-actions">
            <button
              className="btn-primary"
              onClick={() => void runCIChecks()}
              disabled={runningAction === 'ci'}
            >
              {runningAction === 'ci' ? 'Running CI...' : 'Run CI checks'}
            </button>
            <button className="btn-ghost" onClick={() => void fetchData()}>
              Refresh data
            </button>
          </div>
        </div>

        <div className="engraved-panel">
          <div className="panel-head tight">
            <span className="section-label">Recent activity</span>
            <p>Latest admin-side events and operational traces.</p>
          </div>
          {activity.length ? (
            <div className="admin-list">
              {activity.map((entry) => (
                <div key={`${entry.timestamp}-${entry.message}`} className="admin-list-item">
                  <div>
                    <strong>{entry.type}</strong>
                    <p>{entry.message}</p>
                  </div>
                  <span>
                    {new Date(entry.timestamp).toLocaleTimeString('en-US', {
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <div className="dock-empty">No recent admin activity has been recorded.</div>
          )}
        </div>
      </div>
    </div>
  );
};

export default AdminDashboard;
