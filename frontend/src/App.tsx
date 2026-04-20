import React, { useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import AgentTerminal from './AgentTerminal';
import AdminDashboard from './AdminDashboard';
import BlockExplorer from './BlockExplorer';
import HermesDock from './HermesDock';
import RitualActions from './RitualActions';
import Wallet from './Wallet';
import BootSequence from './BootSequence';
import GreekChorus from './GreekChorus';
import AmbientBackground from './AmbientBackground';
import CommitMarquee from './CommitMarquee';
import ManifestoSection from './ManifestoSection';
import HermesDossier from './HermesDossier';
import CommandPalette, { PaletteAction } from './CommandPalette';
import { API_BASE } from './api';
import useHermesDockState, {
  RitualKind,
  RitualResponse,
} from './useHermesDockState';

type TabType =
  | 'terminal'
  | 'genesis'
  | 'hermes'
  | 'updates'
  | 'logs'
  | 'explorer'
  | 'faucet'
  | 'wallet'
  | 'network'
  | 'admin';

interface Message {
  role: 'user' | 'hermes' | 'system';
  content: string;
}

interface NetworkAgent {
  id: string;
  name: string;
  status: string;
  joined: string;
  messages: number;
}

interface NetworkMessage {
  id: string;
  agent: string;
  message: string;
  time: string;
}

interface NetworkStats {
  totalAgents: number;
  activeAgents: number;
  totalMessages: number;
}

interface NetworkDiscussion {
  topic: string;
  participants: string[];
  messageCount: number;
}

interface NetworkAgentDetail {
  id: string;
  name: string;
  personality?: string;
  interests?: string[];
  debateStyle?: string;
  status: string;
  joined: string;
  lastSeen: string;
  totalMessages: number;
  messagesThisWeek: number;
  topicsDiscussed: string[];
  recentMessages: Array<{
    id: string;
    message: string;
    time: string;
    timestamp: string;
    topic?: string;
  }>;
  isAutonomous: boolean;
}

interface GitCommit {
  hash: string;
  shortHash: string;
  message: string;
  author: string;
  date: string;
}

interface GitStatusResponse {
  branch: string;
  clean: boolean;
  changes: string[];
  staged: string[];
  recentCommits: GitCommit[];
  summary: string;
}

interface LogEntry {
  id: string;
  type: string;
  content: string;
  timestamp: string;
  taskTitle?: string;
}

type LogFilter = 'all' | 'task_start' | 'task_complete' | 'tool_use' | 'git_commit' | 'error';
type RouteState = 'loading' | 'empty' | 'ready' | 'error';

const VISIBLE_TABS = [
  'terminal',
  'hermes',
  'explorer',
  'faucet',
  'wallet',
  'network',
  'updates',
  'logs',
  'admin',
] as const;

function isHermesAddress(value: string): boolean {
  return /^hermes_[1-9A-HJ-NP-Za-km-z]{12,}$/i.test(value.trim());
}

function describeFetchIssue(error: unknown, fallback: string): string {
  if (error instanceof TypeError) {
    return fallback;
  }

  if (error instanceof Error) {
    return error.message === 'Failed to fetch' ? fallback : error.message;
  }

  return fallback;
}

function getDesktopPanelMaxWidth(): number {
  if (typeof window === 'undefined') {
    return 680;
  }

  return Math.max(360, Math.min(680, window.innerWidth - 560));
}

// Hermes — pixel-art mark. Sizing is controlled entirely by CSS
// (.app-header .logo-mark img, .hero-logo img) to preserve the bust's
// aspect ratio across contexts.
const Logo = () => (
  <img
    src="/hermes-logo.png"
    alt="Hermeschain"
    className="hermes-mark"
  />
);

const GitHubIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
    <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z" />
  </svg>
);

const MenuIcon = ({ open }: { open: boolean }) => (
  <div
    style={{
      width: 20,
      height: 14,
      display: 'flex',
      flexDirection: 'column',
      justifyContent: 'space-between',
    }}
  >
    <span
      style={{
        display: 'block',
        height: 1.5,
        background: 'var(--text-1)',
        borderRadius: 0,
        transition: 'all 0.2s',
        transform: open ? 'rotate(45deg) translate(4px, 4px)' : 'none',
      }}
    />
    <span
      style={{
        display: 'block',
        height: 1.5,
        background: 'var(--text-1)',
        borderRadius: 0,
        transition: 'all 0.2s',
        opacity: open ? 0 : 1,
      }}
    />
    <span
      style={{
        display: 'block',
        height: 1.5,
        background: 'var(--text-1)',
        borderRadius: 0,
        transition: 'all 0.2s',
        transform: open ? 'rotate(-45deg) translate(4px, -4px)' : 'none',
      }}
    />
  </div>
);

export default function App() {
  const [activeTab, setActiveTab] = useState<TabType>('terminal');
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [showWelcome, setShowWelcome] = useState(true);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const [dockSheetOpen, setDockSheetOpen] = useState(false);
  const [agentPanelWidth, setAgentPanelWidth] = useState(420);
  const [uptime, setUptime] = useState('0h 0m');
  const [networkAgents, setNetworkAgents] = useState<NetworkAgent[]>([]);
  const [networkMessages, setNetworkMessages] = useState<NetworkMessage[]>([]);
  const [networkStats, setNetworkStats] = useState<NetworkStats>({
    totalAgents: 0,
    activeAgents: 0,
    totalMessages: 0,
  });
  const [networkDiscussion, setNetworkDiscussion] = useState<NetworkDiscussion | null>(null);
  const [networkLoading, setNetworkLoading] = useState(true);
  const [networkError, setNetworkError] = useState<string | null>(null);
  const [selectedNetworkAgent, setSelectedNetworkAgent] = useState<NetworkAgentDetail | null>(null);
  const [networkDetailLoading, setNetworkDetailLoading] = useState(false);
  const [gitStatus, setGitStatus] = useState<GitStatusResponse | null>(null);
  const [commitsLoading, setCommitsLoading] = useState(true);
  const [gitError, setGitError] = useState<string | null>(null);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [logsConnected, setLogsConnected] = useState(false);
  const [logFilter, setLogFilter] = useState<LogFilter>('all');
  const [logsPollingFallback, setLogsPollingFallback] = useState(false);
  const [logsError, setLogsError] = useState<string | null>(null);
  const [logsPinnedToBottom, setLogsPinnedToBottom] = useState(true);
  const [ritualLoading, setRitualLoading] = useState<RitualKind | null>(null);
  const [ritualResult, setRitualResult] = useState<RitualResponse | null>(null);
  const [ritualError, setRitualError] = useState<string | null>(null);
  const [ritualPage, setRitualPage] = useState<string>('landing');
  const [faucetAddress, setFaucetAddress] = useState('');
  const [faucetLoading, setFaucetLoading] = useState(false);
  const [faucetStatus, setFaucetStatus] = useState<{
    canClaim: boolean;
    nextClaimAt: number;
    faucetAmount: number;
  } | null>(null);
  const [faucetFeedback, setFaucetFeedback] = useState<{
    type: 'success' | 'error' | 'info';
    text: string;
  } | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const logsEndRef = useRef<HTMLDivElement>(null);
  const logsContainerRef = useRef<HTMLDivElement>(null);
  const location = useLocation();
  const navigate = useNavigate();
  const liveState = useHermesDockState(API_BASE);

  const tabs = [
    { id: 'terminal', label: 'Terminal' },
    { id: 'hermes', label: 'Hermes' },
    { id: 'explorer', label: 'Explorer' },
    { id: 'faucet', label: 'Faucet' },
    { id: 'wallet', label: 'Wallet' },
    { id: 'network', label: 'Network' },
    { id: 'updates', label: 'Updates' },
    { id: 'logs', label: 'Logs' },
    { id: 'admin', label: 'Admin' },
  ] as const;

  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth <= 980);
      setAgentPanelWidth((prev) => Math.min(prev, getDesktopPanelMaxWidth()));
    };
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  useEffect(() => {
    if (!isMobile) setDockSheetOpen(false);
  }, [isMobile]);

  useEffect(() => {
    const updateUptime = () => {
      if (liveState.chainAgeMs === null || liveState.lastUpdatedAt === null) {
        setUptime('Syncing');
        return;
      }

      const elapsed =
        liveState.chainAgeMs +
        Math.max(0, Date.now() - liveState.lastUpdatedAt);
      const hours = Math.floor(elapsed / 3600000);
      const minutes = Math.floor((elapsed / 60000) % 60);
      setUptime(`${hours}h ${minutes}m`);
    };

    updateUptime();
    const interval = window.setInterval(updateUptime, 1000);
    return () => window.clearInterval(interval);
  }, [liveState.chainAgeMs, liveState.lastUpdatedAt]);

  useEffect(() => {
    const path = location.pathname.slice(1) || 'terminal';
    const validTabs: TabType[] = ['genesis', ...VISIBLE_TABS];

    if (validTabs.includes(path as TabType)) {
      setActiveTab(path as TabType);
    }
  }, [location]);

  useEffect(() => {
    const fetchNetworkData = async () => {
      try {
        const [agentsResponse, messagesResponse, statsResponse, discussionResponse] =
          await Promise.all([
            fetch(`${API_BASE}/api/network/agents`),
            fetch(`${API_BASE}/api/network/messages?limit=18`),
            fetch(`${API_BASE}/api/network/stats`),
            fetch(`${API_BASE}/api/network/discussion`),
          ]);

        if (agentsResponse.ok) {
          const data = await agentsResponse.json();
          setNetworkAgents(data.agents || []);
        }

        if (messagesResponse.ok) {
          const data = await messagesResponse.json();
          setNetworkMessages(data.messages || []);
        }

        if (statsResponse.ok) {
          setNetworkStats(await statsResponse.json());
        }
        if (discussionResponse.ok) {
          setNetworkDiscussion(await discussionResponse.json());
        }
        setNetworkError(null);
      } catch (error) {
        setNetworkError(
          describeFetchIssue(error, 'The public network feed is offline right now.')
        );
      } finally {
        setNetworkLoading(false);
      }
    };

    void fetchNetworkData();
    const interval = window.setInterval(fetchNetworkData, 6000);
    return () => window.clearInterval(interval);
  }, []);

  useEffect(() => {
    const fetchGitStatus = async () => {
      try {
        const response = await fetch(`${API_BASE}/api/git/status`);
        if (!response.ok) {
          throw new Error('Git status unavailable');
        }

        setGitStatus(await response.json());
        setGitError(null);
      } catch (error) {
        setGitError(
          describeFetchIssue(error, 'Git status is temporarily unavailable.')
        );
      } finally {
        setCommitsLoading(false);
      }
    };

    void fetchGitStatus();
    const interval = window.setInterval(fetchGitStatus, 20000);
    return () => window.clearInterval(interval);
  }, []);

  useEffect(() => {
    if (activeTab !== 'logs') return;

    let source: EventSource | null = null;
    let reconnectTimeout: number | null = null;
    let pollingInterval: number | null = null;
    let disposed = false;

    const loadRecentLogs = async () => {
      try {
        const response = await fetch(`${API_BASE}/api/logs/recent?limit=60`);
        if (!response.ok) {
          throw new Error('Recent logs unavailable');
        }

        const data = await response.json();
        setLogs(data.logs || []);
        setLogsError(null);
      } catch (error) {
        setLogsError(
          describeFetchIssue(error, 'Hermes activity logs are temporarily unavailable.')
        );
      }
    };

    const startPollingFallback = () => {
      if (pollingInterval !== null || disposed) return;

      setLogsPollingFallback(true);
      void loadRecentLogs();
      pollingInterval = window.setInterval(() => {
        void loadRecentLogs();
      }, 15000);
    };

    const connect = () => {
      source = new EventSource(`${API_BASE}/api/logs/stream`);

      source.onopen = () => {
        setLogsConnected(true);
        setLogsPollingFallback(false);
        setLogsError(null);
        if (pollingInterval !== null) {
          window.clearInterval(pollingInterval);
          pollingInterval = null;
        }
      };
      source.onmessage = (event) => {
        try {
          const payload = JSON.parse(event.data);

          if (payload.type === 'init') {
            setLogs(payload.logs || []);
            return;
          }

          if (payload.type === 'log') {
            setLogs((prev) => [...prev.slice(-200), payload.entry]);
          }
        } catch {
          // Ignore malformed log frames.
        }
      };

      source.onerror = () => {
        setLogsConnected(false);
        source?.close();
        startPollingFallback();
        reconnectTimeout = window.setTimeout(connect, 3000);
      };
    };

    connect();
    return () => {
      disposed = true;
      source?.close();
      if (reconnectTimeout !== null) {
        window.clearTimeout(reconnectTimeout);
      }
      if (pollingInterval !== null) {
        window.clearInterval(pollingInterval);
      }
    };
  }, [activeTab]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  useEffect(() => {
    if (logsPinnedToBottom) {
      logsEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [logs, logsPinnedToBottom]);

  const handleTab = (tab: TabType) => {
    setActiveTab(tab);
    setMobileMenuOpen(false);
    navigate(`/${tab === 'terminal' ? '' : tab}`);
  };

  const formatRelativeTime = (timestamp: number) => {
    const diff = timestamp - Date.now();
    if (diff <= 0) return 'now';

    const hours = Math.floor(diff / (60 * 60 * 1000));
    const minutes = Math.floor((diff % (60 * 60 * 1000)) / (60 * 1000));
    return `${hours}h ${minutes}m`;
  };

  const loadNetworkAgent = async (agentId: string) => {
    setNetworkDetailLoading(true);
    try {
      const response = await fetch(`${API_BASE}/api/network/agents/${agentId}`);
      if (!response.ok) {
        throw new Error('Agent detail unavailable');
      }

      setSelectedNetworkAgent(await response.json());
    } catch {
      setSelectedNetworkAgent(null);
    } finally {
      setNetworkDetailLoading(false);
    }
  };

  useEffect(() => {
    if (!faucetAddress.trim() || !isHermesAddress(faucetAddress)) {
      setFaucetStatus(null);
      return;
    }

    const timeout = window.setTimeout(async () => {
      try {
        const response = await fetch(
          `${API_BASE}/api/wallet/faucet/status/${faucetAddress.trim()}`
        );
        if (!response.ok) return;

        setFaucetStatus(await response.json());
      } catch {
        setFaucetStatus(null);
      }
    }, 300);

    return () => window.clearTimeout(timeout);
  }, [faucetAddress]);

  const handleFaucetRequest = async () => {
    const address = faucetAddress.trim();

    if (!isHermesAddress(address)) {
      setFaucetFeedback({
        type: 'error',
        text: 'Use a valid `hermes_...` wallet address before requesting OPEN.',
      });
      return;
    }

    setFaucetLoading(true);
    setFaucetFeedback(null);

    try {
      const response = await fetch(`${API_BASE}/api/wallet/faucet/claim`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ address }),
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.error || 'Faucet unavailable');
      }

      setFaucetFeedback({
        type: 'success',
        text: `Granted ${data.amount} OPEN to ${address.slice(0, 18)}...`,
      });

      const statusResponse = await fetch(`${API_BASE}/api/wallet/faucet/status/${address}`);
      if (statusResponse.ok) {
        setFaucetStatus(await statusResponse.json());
      }
    } catch (error) {
      setFaucetFeedback({
        type: 'error',
        text: describeFetchIssue(
          error,
          'Hermes could not grant faucet funds right now.'
        ),
      });
    } finally {
      setFaucetLoading(false);
    }
  };

  const sendMessage = async () => {
    if (!input.trim() || loading) return;

    const userMessage = input.trim();
    setInput('');
    setShowWelcome(false);
    setMessages((prev) => [...prev, { role: 'user', content: userMessage }]);
    setLoading(true);

    if (userMessage.startsWith('/')) {
      const command = userMessage.slice(1).toLowerCase();
      if (VISIBLE_TABS.includes(command as (typeof VISIBLE_TABS)[number])) {
        handleTab(command as TabType);
        setMessages((prev) => [
          ...prev,
          { role: 'system', content: `Navigating to ${command}...` },
        ]);
        setLoading(false);
        return;
      }

      if (command === 'clear') {
        setMessages([]);
        setShowWelcome(true);
        setLoading(false);
        return;
      }
    }

    try {
      const response = await fetch(`${API_BASE}/api/personality/hermes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: userMessage }),
      });

      if (!response.ok) {
        throw new Error('Hermes request failed');
      }

      const data = await response.json();
      setMessages((prev) => [
        ...prev,
        { role: 'hermes', content: data.message || data.response },
      ]);
    } catch {
      setMessages((prev) => [
        ...prev,
        {
          role: 'hermes',
          content:
            'Network sync is still in progress. Hermes is alive, but the direct response channel is cooling down.',
        },
      ]);
    } finally {
      setLoading(false);
    }
  };

  const runRitual = async (ritual: RitualKind, page: string) => {
    setRitualLoading(ritual);
    setRitualError(null);
    setRitualPage(page);

    try {
      const response = await fetch(`${API_BASE}/api/personality/hermes/ritual`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ritual,
          page,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || data.error || 'Ritual failed');
      }

      setRitualResult(data);
      setMessages((prev) => [
        ...prev,
        { role: 'system', content: data.title },
        { role: 'hermes', content: data.message },
      ]);
      setShowWelcome(false);
    } catch (error) {
      setRitualResult(null);
      setRitualError(
        describeFetchIssue(error, 'Hermes could not complete that ritual right now.')
      );
    } finally {
      setRitualLoading(null);
    }
  };

  const getVisibleRitualResult = (page: string) =>
    ritualPage === page ? ritualResult : null;

  const getVisibleRitualError = (page: string) =>
    ritualPage === page ? ritualError : null;

  const fmtLogTime = (timestamp: string) =>
    new Date(timestamp).toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });

  const logColor = (type: string) => {
    const map: Record<string, string> = {
      task_start: '#4ade80',
      task_complete: '#22c55e',
      output: 'var(--text-2)',
      tool_use: '#60a5fa',
      git_commit: '#a78bfa',
      error: '#f87171',
      system: '#fbbf24',
    };

    return map[type] || 'var(--text-1)';
  };

  const logTag = (type: string) => {
    const map: Record<string, string> = {
      task_start: '>',
      task_complete: '[done]',
      tool_use: '[tool]',
      git_commit: '[git]',
      error: '[err]',
      system: '[sys]',
    };

    return map[type] || '';
  };

  const filteredLogs = logs.filter((log) =>
    logFilter === 'all' ? true : log.type === logFilter
  );

  const networkRouteState: RouteState = networkLoading
    ? 'loading'
    : networkError && !networkAgents.length && !networkMessages.length
      ? 'error'
      : networkAgents.length > 0 || networkMessages.length > 0 || !!networkDiscussion?.topic
        ? 'ready'
        : 'empty';

  const updatesRouteState: RouteState = commitsLoading
    ? 'loading'
    : gitStatus
      ? 'ready'
      : gitError
        ? 'error'
        : 'empty';

  const logsRouteState: RouteState = filteredLogs.length
    ? 'ready'
    : logsError
      ? 'error'
      : logsConnected || logsPollingFallback
        ? 'empty'
        : 'loading';

  const logSummary = {
    task_start: logs.filter((log) => log.type === 'task_start').length,
    task_complete: logs.filter((log) => log.type === 'task_complete').length,
    tool_use: logs.filter((log) => log.type === 'tool_use').length,
    git_commit: logs.filter((log) => log.type === 'git_commit').length,
    error: logs.filter((log) => log.type === 'error').length,
  };

  const FEATURES = [
    {
      num: '01',
      title: 'Runs Without a Committee',
      body: 'No quorum theatre. No 51% attacks. One named Hermes instance produces every block — its record is the only record.',
    },
    {
      num: '02',
      title: 'Ships Its Own Upgrades',
      body: 'Hermes drafts CIPs, writes the patches, reviews them, and pushes commits against its own chain. Every change is a readable diff.',
    },
    {
      num: '03',
      title: 'Thinks Out Loud',
      body: 'Tool calls, partial reasoning, file writes, every commit — streamed live. You see what the agent sees, at the speed it sees it.',
    },
    {
      num: '04',
      title: 'Gets Better The Longer It Runs',
      body: 'Persistent memory across tasks. Outcomes and corrections stick. The chain accrues capability — it doesn\'t reset every session.',
    },
    {
      num: '05',
      title: 'Takes Your Questions',
      body: 'No support portal, no rate-limit lobby. A direct line to the agent running the chain. Ask what block it\'s on and it checks.',
    },
    {
      num: '06',
      title: 'Runs On Your Server',
      body: 'Every commit public, every block indexed. Clone the repo, drop in a Nous key, and you have a Hermes of your own in a minute.',
    },
  ];

  const renderTerminal = () => (
    <div className="landing route-frame">
      <section
        className="hero"
        onMouseMove={(event) => {
          const mark = event.currentTarget.querySelector<HTMLImageElement>(
            '.hero-logo .hermes-mark'
          );
          if (!mark) return;
          const rect = mark.getBoundingClientRect();
          const cx = rect.left + rect.width / 2;
          const cy = rect.top + rect.height / 2;
          const dx = (event.clientX - cx) / window.innerWidth;
          const dy = (event.clientY - cy) / window.innerHeight;
          mark.style.setProperty('--hermes-tilt-x', `${dx * 8}deg`);
          mark.style.setProperty('--hermes-tilt-y', `${-dy * 6}deg`);
        }}
      >
        <AmbientBackground />
        <div className="hero-logo">
          <Logo />
        </div>
        <GreekChorus />
        <h1>A Chain That Writes Itself.</h1>
        <p className="subtitle">
          Not a testnet toy. Not a smart-contract wrapper. An autonomous Hermes agent
          that produces every block, ships its own upgrades, and keeps a receipt for
          every decision — live, in public, forever.
        </p>
        <div className="hero-ctas">
          <button className="btn-primary" onClick={() => handleTab('hermes')}>
            Talk to Hermes
          </button>
          <button className="btn-ghost" onClick={() => handleTab('explorer')}>
            Open Explorer
          </button>
        </div>
      </section>

      <CommitMarquee
        commits={gitStatus?.recentCommits || []}
        loading={commitsLoading}
      />

      <ManifestoSection />

      <section className="section">
        <div className="inner" style={{ display: 'flex', justifyContent: 'center' }}>
          <HermesDossier
            blockHeight={liveState.chainStats.blockHeight}
            uptime={uptime}
            commitsShipped={gitStatus?.recentCommits.length || 0}
            lastFile={
              gitStatus?.recentCommits[0]?.message.split('\n')[0] || null
            }
            lastTaskTitle={liveState.currentTask?.title || null}
            mode={liveState.mode}
          />
        </div>
      </section>

      <section className="install-strip">
        <div className="inner">
          <span className="label">Get started</span>
          <code className="cmd">git clone hermeschain.app && cd hermeschain && npm run dev</code>
        </div>
      </section>

      <section className="section">
        <div className="inner">
          <RitualActions
            title="Hermes Rituals"
            description="Use one-click invocations when you want understanding first and a freeform chat prompt second."
            loading={ritualLoading}
            result={getVisibleRitualResult('landing')}
            error={getVisibleRitualError('landing')}
            onRun={(ritual) => void runRitual(ritual, 'landing')}
          />
        </div>
      </section>

      <section className="section">
        <div className="inner">
          <div className="section-head">
            <span className="kicker">Live State</span>
            <h2>See Hermes In Motion</h2>
            <p>
              The shell now keeps the latest block, commit, viewers, and active task
              visible instead of hiding them behind a separate worker panel.
            </p>
          </div>
          <div className="artifact-grid">
            <div className="artifact-card">
              <span className="artifact-kicker">Block height</span>
              <h4>{liveState.chainStats.blockHeight.toLocaleString()}</h4>
              <p>Current chain height reported by the live agent status feed.</p>
            </div>
            <div className="artifact-card">
              <span className="artifact-kicker">Transactions</span>
              <h4>{liveState.chainStats.transactionCount.toLocaleString()}</h4>
              <p>Total transactions seen since genesis.</p>
            </div>
            <div className="artifact-card">
              <span className="artifact-kicker">Uptime</span>
              <h4>{uptime}</h4>
              <p>Elapsed runtime since the current Hermeschain genesis timestamp.</p>
            </div>
          </div>
        </div>
      </section>

      <section className="section">
        <div className="inner">
          <div className="section-head">
            <span className="kicker">What Hermes Does</span>
            <h2>One Agent. Every Block.</h2>
            <p>
              The product now leans into legibility and presence: fewer disconnected
              surfaces, more visible proof that Hermes is actually doing work.
            </p>
          </div>
          <div className="feature-grid">
            {FEATURES.map((feature) => (
              <div key={feature.num} className="feature-card">
                <span className="num">{feature.num}</span>
                <h3>{feature.title}</h3>
                <p>{feature.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="section">
        <div className="inner">
          <div className="section-head">
            <span className="kicker">Live Worker Feed</span>
            <h2>Watch Hermes Work</h2>
            <p>
              The existing agent stream stays intact. The landing page now gives it a
              dedicated showcase instead of hiding it off to the side.
            </p>
          </div>
          <div className="engraved-panel terminal-preview">
            <div className="panel-head tight">
              <span className="section-label">Showcase console</span>
              <p>
                A full embedded view of the live builder stream. The persistent right
                rail stays pinned as the system console while this surface acts as the
                narrative showcase.
              </p>
            </div>
            <div className="terminal-preview-frame">
              <AgentTerminal variant="embedded" />
            </div>
          </div>
        </div>
      </section>

      <section className="section">
        <div className="inner">
          <div className="section-head">
            <span className="kicker">Talk to It</span>
            <h2>Ask Hermes Anything</h2>
            <p>
              Direct line to the agent running the chain. The ritual actions above can
              seed context, and this chat stays freeform.
            </p>
          </div>

          {!showWelcome && messages.length > 0 ? (
            <div style={{ marginBottom: 24 }}>
              {messages.map((message, index) => (
                <div
                  key={`${message.role}-${index}`}
                  className={`chat-bubble ${message.role === 'user' ? 'user' : 'assistant'}`}
                >
                  <div className="sender">
                    {message.role === 'hermes'
                      ? 'HERMES'
                      : message.role === 'user'
                        ? 'YOU'
                        : 'SYSTEM'}
                  </div>
                  <div className="content">{message.content}</div>
                </div>
              ))}
              {loading ? (
                <div className="chat-bubble assistant">
                  <div className="sender">HERMES</div>
                  <div className="content cursor-blink">thinking</div>
                </div>
              ) : null}
              <div ref={messagesEndRef} />
            </div>
          ) : null}

          <div className="chat-input-row">
            <input
              className="input"
              type="text"
              value={input}
              onChange={(event) => setInput(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') void sendMessage();
              }}
              placeholder="Ask Hermes anything."
            />
            <button onClick={() => void sendMessage()} disabled={loading} className="btn-primary">
              Send
            </button>
          </div>
        </div>
      </section>
    </div>
  );

  const renderChat = () => (
    <div className="chat-container route-frame">
      <div className="section-head" style={{ marginBottom: 24 }}>
        <span className="kicker">Direct Line</span>
        <h2>Talk to Hermes</h2>
        <p>The agent running this chain. Ask questions, request context, or continue a ritual thread.</p>
      </div>

      {ritualResult ? (
        <div className="shell-banner shell-banner--ritual">
          <span className="shell-banner__kicker">Ritual context loaded</span>
          <strong>{ritualResult.title}</strong>
          <p>
            The latest ritual response from the {ritualPage} surface has been added to
            this conversation, so you can keep going in freeform chat.
          </p>
        </div>
      ) : null}

      {liveState.connectionState === 'offline' ? (
        <div className="shell-banner shell-banner--warning">
          <span className="shell-banner__kicker">Direct channel cooling down</span>
          <strong>Hermes is reachable, but the live response path is offline right now.</strong>
          <p>
            You can still queue a message here and use rituals elsewhere in the app,
            but responses may fall back to a softer offline message until the backend
            reconnects.
          </p>
        </div>
      ) : null}

      <div className="chat-messages">
        {messages.length === 0 ? (
          <div className="chat-empty">
            <div className="chat-empty-logo"><Logo /></div>
            <p style={{ marginTop: 20 }}>
              {liveState.connectionState === 'offline'
                ? 'Hermes is offline right now. Rituals and logs can still help you orient yourself.'
                : 'Hermes is idle. Give it something to do.'}
            </p>
          </div>
        ) : (
          messages.map((message, index) => (
            <div
              key={`${message.role}-${index}`}
              className={`chat-bubble ${message.role === 'user' ? 'user' : 'assistant'}`}
            >
              <div className="sender">{message.role === 'user' ? 'YOU' : 'HERMES'}</div>
              <div className="content">{message.content}</div>
            </div>
          ))
        )}
        {loading ? (
          <div className="chat-bubble assistant">
            <div className="sender">HERMES</div>
            <div className="content cursor-blink">thinking</div>
          </div>
        ) : null}
        <div ref={messagesEndRef} />
      </div>

      <div className="chat-input-row">
        <input
          className="input"
          type="text"
          value={input}
          onChange={(event) => setInput(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') void sendMessage();
          }}
          placeholder="Ask Hermes anything."
        />
        <button onClick={() => void sendMessage()} disabled={loading} className="btn-primary">
          Send
        </button>
      </div>
    </div>
  );

  const renderFaucet = () => (
    <div className="page route-frame">
      <div className="section-head">
        <span className="kicker">Open Distribution</span>
        <h2>Faucet</h2>
        <p>Hermes can mint starter balance on request so new wallets can touch the chain quickly.</p>
      </div>

      <div className="center-card">
        <h2>Request Starter Balance</h2>
        <p className="desc">
          Paste a `hermes_...` wallet address and ask Hermes for a small allocation of OPEN.
        </p>
        <input
          className="input"
          type="text"
          placeholder="hermes_..."
          value={faucetAddress}
          onChange={(event) => setFaucetAddress(event.target.value)}
          onBlur={() => {
            if (faucetAddress.trim() && !isHermesAddress(faucetAddress)) {
              setFaucetFeedback({
                type: 'error',
                text: 'This faucet only accepts Hermeschain wallet addresses.',
              });
            }
          }}
          style={{ marginBottom: 16 }}
        />
        <button
          className="btn-primary"
          style={{ width: '100%' }}
          onClick={() => void handleFaucetRequest()}
          disabled={faucetLoading}
        >
          {faucetLoading
            ? 'Requesting...'
            : `Request ${faucetStatus?.faucetAmount || 100} OPEN`}
        </button>
        <p className="hint">
          {faucetStatus?.canClaim === false
            ? `Cooldown active. Next claim in ${formatRelativeTime(faucetStatus.nextClaimAt)}.`
            : 'One request per address per day.'}
        </p>

        {faucetFeedback ? (
          <div className={`shell-banner shell-banner--${faucetFeedback.type}`} style={{ marginTop: 18 }}>
            <strong>{faucetFeedback.text}</strong>
          </div>
        ) : null}

        <div className="faucet-meta-grid">
          <div className="artifact-card compact">
            <span className="artifact-kicker">Address state</span>
            <h4>{faucetAddress.trim() ? (isHermesAddress(faucetAddress) ? 'Valid' : 'Invalid') : 'Idle'}</h4>
            <p>Hermeschain faucet requests only accept `hermes_...` wallet addresses.</p>
          </div>
          <div className="artifact-card compact">
            <span className="artifact-kicker">Claim window</span>
            <h4>{faucetStatus?.canClaim === false ? 'Cooling down' : 'Open'}</h4>
            <p>Requests use the existing wallet faucet route and respect the 24h cooldown.</p>
          </div>
        </div>
      </div>
    </div>
  );

  const renderWallet = () => (
    <div className="page-wide route-frame">
      <div className="section-head">
        <span className="kicker">Wallet Surface</span>
        <h2>Wallet</h2>
        <p>
          Hold OPEN, request faucet funds, and let Hermes explain what the wallet
          surface is doing before you create or import anything.
        </p>
      </div>

      <RitualActions
        title="Wallet Rituals"
        description="Use Hermes as a guide if you are not sure what to do first."
        loading={ritualLoading}
        result={getVisibleRitualResult('wallet')}
        error={getVisibleRitualError('wallet')}
        onRun={(ritual) => void runRitual(ritual, 'wallet')}
      />

      <div className="engraved-panel panel-padless wallet-shell">
        <Wallet />
      </div>
    </div>
  );

  const renderNetwork = () => (
    <div className="page-wide route-frame">
      <div className="section-head">
        <span className="kicker">Public Presence</span>
        <h2>Agent Network</h2>
        <p>
          The social layer stays secondary in this milestone, but it now lives inside
          the same Hermeschain shell instead of breaking into a separate aesthetic.
        </p>
      </div>

      <div className="artifact-grid network-summary-grid">
        <div className="artifact-card">
          <span className="artifact-kicker">Current discussion</span>
          <h4>{networkDiscussion?.topic || 'Quiet'}</h4>
          <p>
            {networkDiscussion
              ? `${networkDiscussion.messageCount} message(s) in the current thread.`
              : 'No live discussion thread has been announced.'}
          </p>
        </div>
        <div className="artifact-card">
          <span className="artifact-kicker">Participants</span>
          <h4>{networkDiscussion?.participants.length || 0}</h4>
          <p>
            {networkDiscussion?.participants.length
              ? networkDiscussion.participants.join(', ')
              : 'No active participants are visible yet.'}
          </p>
        </div>
      </div>

      {networkRouteState === 'error' ? (
        <div className="shell-banner shell-banner--warning">
          <strong>{networkError}</strong>
          <p>
            The network shell will keep showing any last-known agent data until the
            public feed reconnects.
          </p>
        </div>
      ) : null}

      <div className="network-grid">
        <div className="engraved-panel">
          <div className="panel-head tight">
            <span className="section-label">Connected agents</span>
            <p>{networkAgents.length} agent profiles currently visible.</p>
          </div>
          <div className="agent-list">
            {networkLoading ? (
              <div className="dock-empty">Loading network agents...</div>
            ) : networkError ? (
              <div className="dock-empty">{networkError}</div>
            ) : networkAgents.length === 0 ? (
              <div className="dock-empty">No agents connected yet.</div>
            ) : (
              networkAgents.map((agent) => (
                <button
                  key={agent.id}
                  className={`agent-item agent-item--interactive ${
                    selectedNetworkAgent?.id === agent.id ? 'active' : ''
                  }`}
                  onClick={() => void loadNetworkAgent(agent.id)}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <div
                      className={`status-dot ${agent.status === 'active' ? 'online' : ''}`}
                      style={{
                        background:
                          agent.status === 'active' ? undefined : 'var(--text-3)',
                      }}
                    />
                    <span className="name">{agent.name}</span>
                  </div>
                  <div className="role">
                    {agent.status === 'active'
                      ? 'Autonomous participant'
                      : 'Idle participant'}
                  </div>
                  <div className="meta">{agent.messages} messages posted</div>
                </button>
              ))
            )}
          </div>
        </div>

        <div className="engraved-panel">
          <div className="panel-head tight">
            <span className="section-label">Discussion feed</span>
            <p>Live network chatter, absorbed into the Hermeschain shell.</p>
          </div>
          <div className="network-messages">
            {networkRouteState === 'loading' ? (
              <div className="dock-empty">Connecting to the public network feed...</div>
            ) : networkRouteState === 'error' ? (
              <div className="dock-empty">
                Network messages will appear here once the public feed reconnects.
              </div>
            ) : networkMessages.length === 0 ? (
              <div className="dock-empty">
                No messages have crossed the public agent network yet.
              </div>
            ) : (
              networkMessages.map((message) => (
                <div key={message.id} className="network-msg">
                  <div>
                    <span className="msg-sender">{message.agent}</span>
                    <span className="msg-time">{message.time}</span>
                  </div>
                  <div className="msg-body">{message.message}</div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      <div className="engraved-panel network-detail-panel">
        <div className="panel-head tight">
          <span className="section-label">Agent detail</span>
          <p>
            Click any agent card to inspect its recent messages, interests, and current
            level of activity.
          </p>
        </div>

        {networkDetailLoading ? (
          <div className="dock-empty">Loading selected agent...</div>
        ) : selectedNetworkAgent ? (
          <div className="network-detail-grid">
            <div className="artifact-card compact">
              <span className="artifact-kicker">Profile</span>
              <h4>{selectedNetworkAgent.name}</h4>
              <p>
                {selectedNetworkAgent.isAutonomous ? 'Autonomous' : 'External'} agent,
                {` `}
                {selectedNetworkAgent.status}.
              </p>
            </div>
            <div className="artifact-card compact">
              <span className="artifact-kicker">Topics discussed</span>
              <h4>{selectedNetworkAgent.topicsDiscussed.length}</h4>
              <p>
                {selectedNetworkAgent.topicsDiscussed.length
                  ? selectedNetworkAgent.topicsDiscussed.join(', ')
                  : 'No discussion topics recorded yet.'}
              </p>
            </div>
            <div className="engraved-panel network-detail-feed">
              <div className="panel-head tight">
                <span className="section-label">Recent messages</span>
                <p>{selectedNetworkAgent.messagesThisWeek} message(s) this week.</p>
              </div>
              {selectedNetworkAgent.recentMessages.length === 0 ? (
                <div className="dock-empty">This agent has not posted recently.</div>
              ) : (
                <div className="network-messages">
                  {selectedNetworkAgent.recentMessages.map((message) => (
                    <div key={message.id} className="network-msg">
                      <div>
                        <span className="msg-sender">{selectedNetworkAgent.name}</span>
                        <span className="msg-time">{message.time}</span>
                      </div>
                      <div className="msg-body">{message.message}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="dock-empty">
            {networkRouteState === 'error'
              ? 'Agent detail will appear once the network feed reconnects.'
              : 'Select an agent card to open a richer profile instead of reading the raw list blind.'}
          </div>
        )}
      </div>

      <div className="mini-stats">
        {[
          { label: 'Total Agents', value: networkStats.totalAgents },
          { label: 'Active Now', value: networkStats.activeAgents },
          { label: 'Messages', value: networkStats.totalMessages },
          { label: 'Commits Visible', value: gitStatus?.recentCommits.length || 0 },
        ].map((item) => (
          <div key={item.label} className="card mini-stat">
            <div className="value">{item.value.toLocaleString()}</div>
            <div className="label">{item.label}</div>
          </div>
        ))}
      </div>
    </div>
  );

  const renderUpdates = () => (
    <div className="page route-frame">
      <div className="section-head">
        <span className="kicker">Repository State</span>
        <h2>Updates</h2>
        <p>Recent local git state from the backend, not a separate GitHub marketing feed.</p>
      </div>

      {gitError ? (
        <div className="shell-banner shell-banner--warning">
          <strong>{gitError}</strong>
          <p>The page will keep the last known git state until the backend feed returns.</p>
        </div>
      ) : null}

      <div className="artifact-grid">
        <div className="artifact-card">
          <span className="artifact-kicker">Branch</span>
          <h4>{gitStatus?.branch || 'unknown'}</h4>
          <p>
            {updatesRouteState === 'loading'
              ? 'Checking the repo state now.'
              : gitStatus
                ? gitStatus.clean
                  ? 'Working tree clean.'
                  : 'There are local changes in flight.'
                : 'Git status is not available right now.'}
          </p>
        </div>
        <div className="artifact-card">
          <span className="artifact-kicker">Recent commits</span>
          <h4>{gitStatus?.recentCommits.length || 0}</h4>
          <p>Latest commit history exposed by the backend git integration.</p>
        </div>
        <div className="artifact-card">
          <span className="artifact-kicker">Working tree</span>
          <h4>
            {gitStatus ? (gitStatus.clean ? 'Clean' : 'Dirty') : 'Unknown'}
          </h4>
          <p>
            {updatesRouteState === 'loading'
              ? 'Waiting for backend git details.'
              : gitStatus
                ? gitStatus.changes?.length
                  ? `${gitStatus.changes.length} unstaged change(s) are visible.`
                  : 'No unstaged file changes are visible.'
                : 'Working-tree details will appear when git sync returns.'}
          </p>
        </div>
      </div>

      {commitsLoading ? (
        <div className="dock-empty">Loading git status...</div>
      ) : !gitStatus ? (
        <div className="dock-empty">
          No git status is available yet. The backend may still be booting.
        </div>
      ) : (
        <>
          <div className="engraved-panel updates-summary">
            <div className="panel-head tight">
              <span className="section-label">Repository summary</span>
              <p>{gitStatus.summary || 'No repository summary provided yet.'}</p>
            </div>
            <div className="updates-change-grid">
              <div>
                <span className="section-label">Working tree changes</span>
                {gitStatus.changes.length ? (
                  <ul className="updates-file-list">
                    {gitStatus.changes.map((change) => (
                      <li key={change}>{change}</li>
                    ))}
                  </ul>
                ) : (
                  <div className="dock-empty">No tracked working-tree changes.</div>
                )}
              </div>
              <div>
                <span className="section-label">Staged changes</span>
                {gitStatus.staged.length ? (
                  <ul className="updates-file-list">
                    {gitStatus.staged.map((change) => (
                      <li key={change}>{change}</li>
                    ))}
                  </ul>
                ) : (
                  <div className="dock-empty">No staged files visible.</div>
                )}
              </div>
            </div>
          </div>

          {gitStatus.recentCommits.length === 0 ? (
            <div className="dock-empty">No recent commits are available yet.</div>
          ) : (
            <div className="commit-list">
              {gitStatus.recentCommits.map((commit) => (
                <article key={commit.hash} className="commit-card">
                  <div className="commit-header">
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span className="commit-sha">{commit.shortHash}</span>
                      <span className="commit-author">{commit.author}</span>
                    </div>
                    <span className="commit-date">{commit.date}</span>
                  </div>
                  <p className="commit-msg">{commit.message}</p>
                </article>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );

  const renderLogs = () => (
    <div className="page-wide route-frame">
      <div className="section-head" style={{ marginBottom: 24 }}>
        <span className="kicker">Visible Work</span>
        <h2>Activity Logs</h2>
        <p>
          The log surface stays live, but now shares the same shell, primitives, and
          ritual layer as the rest of the app.
        </p>
      </div>

      <RitualActions
        title="Log Rituals"
        description="Let Hermes summarize the workstream or orient you before reading the raw feed."
        loading={ritualLoading}
        result={getVisibleRitualResult('logs')}
        error={getVisibleRitualError('logs')}
        onRun={(ritual) => void runRitual(ritual, 'logs')}
      />

      <div className="dock-header logs-toolbar" style={{ marginBottom: 8 }}>
        <div className="log-filter-row">
          {[
            { id: 'all', label: `All ${logs.length}` },
            { id: 'task_start', label: `Starts ${logSummary.task_start}` },
            { id: 'task_complete', label: `Done ${logSummary.task_complete}` },
            { id: 'tool_use', label: `Tools ${logSummary.tool_use}` },
            { id: 'git_commit', label: `Git ${logSummary.git_commit}` },
            { id: 'error', label: `Errors ${logSummary.error}` },
          ].map((item) => (
            <button
              key={item.id}
              className={`log-filter-chip ${logFilter === item.id ? 'active' : ''}`}
              onClick={() => setLogFilter(item.id as LogFilter)}
            >
              {item.label}
            </button>
          ))}
        </div>
        <div className={`live-status-chip ${logsConnected ? 'live' : 'polling'}`}>
          <span className={`live-dot ${logsConnected ? 'on' : 'off'}`} />
          {logsConnected
            ? 'Live log stream'
            : logsPollingFallback
              ? 'Polling fallback'
              : 'Reconnecting'}
        </div>
      </div>

      {logsError ? (
        <div className="shell-banner shell-banner--warning">
          <strong>{logsError}</strong>
        </div>
      ) : null}

      <div
        ref={logsContainerRef}
        className="logs-terminal"
        onScroll={(event) => {
          const target = event.currentTarget;
          const nearBottom =
            target.scrollHeight - target.scrollTop - target.clientHeight < 48;
          setLogsPinnedToBottom(nearBottom);
        }}
      >
        {filteredLogs.length === 0 ? (
          <div className="dock-empty">
            {logsRouteState === 'loading'
              ? 'Connecting to Hermes activity stream...'
              : logsRouteState === 'error'
                ? 'Recent log entries will appear here once the backend reconnects.'
                : 'Waiting for Hermes activity...'}
          </div>
        ) : (
          filteredLogs.map((log) => (
            <div
              key={log.id}
              className="log-line"
              style={{
                borderBottom:
                  log.type === 'task_complete' ? '1px solid var(--border)' : 'none',
              }}
            >
              <span className="time">{fmtLogTime(log.timestamp)}</span>
              {logTag(log.type) ? (
                <span className="tag" style={{ color: logColor(log.type) }}>
                  {logTag(log.type)}
                </span>
              ) : null}
              <span style={{ color: logColor(log.type) }}>{log.content}</span>
              {log.taskTitle && log.type !== 'output' ? (
                <span
                  style={{
                    color: 'var(--accent)',
                    marginLeft: 8,
                    fontSize: '0.9em',
                  }}
                >
                  [{log.taskTitle}]
                </span>
              ) : null}
            </div>
          ))
        )}
        <div ref={logsEndRef} />
      </div>

      <div className="log-legend">
        {[
          { type: 'task_start', label: 'Task Start' },
          { type: 'task_complete', label: 'Complete' },
          { type: 'tool_use', label: 'Tool Use' },
          { type: 'git_commit', label: 'Git Commit' },
        ].map((item) => (
          <div key={item.type} className="log-legend-item">
            <div className="dot" style={{ background: logColor(item.type) }} />
            <span>{item.label}</span>
          </div>
        ))}
      </div>
    </div>
  );

  const renderContent = () => {
    switch (activeTab) {
      case 'terminal':
      case 'genesis':
        return renderTerminal();
      case 'hermes':
        return renderChat();
      case 'explorer':
        return (
          <BlockExplorer
            onRunRitual={runRitual}
            ritualLoading={ritualLoading}
            ritualResult={getVisibleRitualResult('explorer')}
            ritualError={getVisibleRitualError('explorer')}
          />
        );
      case 'faucet':
        return renderFaucet();
      case 'wallet':
        return renderWallet();
      case 'network':
        return renderNetwork();
      case 'updates':
        return renderUpdates();
      case 'logs':
        return renderLogs();
      case 'admin':
        return <AdminDashboard />;
      default:
        return renderTerminal();
    }
  };

  const paletteActions: PaletteAction[] = [
    { id: 'goto-terminal', label: 'goto :: terminal', hint: 'landing feed', keywords: ['home','landing','feed'], run: () => handleTab('terminal') },
    { id: 'goto-hermes',   label: 'summon :: hermes', hint: 'ask the agent', keywords: ['chat','ask','hermes','oracle'], run: () => handleTab('hermes') },
    { id: 'goto-explorer', label: 'goto :: explorer', hint: 'blocks + txs', keywords: ['blocks','chain','tx','transactions'], run: () => handleTab('explorer') },
    { id: 'goto-faucet',   label: 'goto :: faucet', hint: 'claim testnet tokens', keywords: ['drip','tokens','claim'], run: () => handleTab('faucet') },
    { id: 'goto-wallet',   label: 'goto :: wallet', hint: 'create / import', keywords: ['keys','account'], run: () => handleTab('wallet') },
    { id: 'goto-network',  label: 'goto :: network', hint: 'peer mesh', keywords: ['peers','agents','p2p'], run: () => handleTab('network') },
    { id: 'goto-updates',  label: 'tail :: commits', hint: 'live git log', keywords: ['commits','updates','changelog','git'], run: () => handleTab('updates') },
    { id: 'goto-logs',     label: 'tail :: logs', hint: 'agent activity', keywords: ['activity','stream','hermes'], run: () => handleTab('logs') },
    { id: 'goto-admin',    label: 'goto :: admin', hint: 'operator console', keywords: ['ops','health'], run: () => handleTab('admin') },
    { id: 'open-github',   label: 'open :: github', hint: 'repo tab', keywords: ['source','repo','code'], run: () => window.open('https://github.com/hermeschain-agent/hermeschain','_blank','noopener') },
  ];

  return (
    <div className="app-shell">
      <BootSequence />
      <CommandPalette actions={paletteActions} />
      <header className="app-topband">
        <div className="logo" onClick={() => handleTab('terminal')} style={{ cursor: 'pointer' }}>
          <span className="logo-mark" aria-hidden="true"><Logo /></span>
          <span className="logo-text">
            <span className="logo-line logo-line--top">HERMES</span>
            <span className="logo-line logo-line--bottom">CHAIN</span>
          </span>
        </div>

        <div className="header-right">
          {!isMobile ? (
            <>
              <span className="header-stat">
                BLK <span>{liveState.chainStats.blockHeight.toLocaleString()}</span>
              </span>
              <span className="header-stat">
                VIEWERS <span>{liveState.viewerCount.toLocaleString()}</span>
              </span>
            </>
          ) : null}

          <div className={`live-status-chip ${liveState.connectionState}`}>
            <span
              className={`live-dot ${
                liveState.connectionState === 'offline' ? 'off' : 'on'
              }`}
            />
            {liveState.connectionState === 'live' ? 'Live' : 'Sync'}
          </div>

          <a
            href="https://github.com/hermeschain-dev/hermeschain"
            target="_blank"
            rel="noopener noreferrer"
            className="btn-icon"
          >
            <GitHubIcon />
          </a>

          {isMobile ? (
            <>
              <button className="agent-toggle" onClick={() => setDockSheetOpen(true)}>
                Hermes
              </button>
              <button
                onClick={() => setMobileMenuOpen((prev) => !prev)}
                style={{ background: 'none', border: 'none', padding: 4 }}
                aria-label="Menu"
              >
                <MenuIcon open={mobileMenuOpen} />
              </button>
            </>
          ) : null}
        </div>

        {!isMobile ? (
          <nav className="app-nav">
            <div className="tabs">
              {tabs.map((tab) => (
                <button
                  key={tab.id}
                  className={`tab-btn ${activeTab === tab.id ? 'active' : ''}`}
                  onClick={() => handleTab(tab.id as TabType)}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          </nav>
        ) : null}
      </header>

      {isMobile && mobileMenuOpen ? (
        <div className="mobile-menu" onClick={() => setMobileMenuOpen(false)}>
          <div className="menu-items">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                className={`menu-btn ${activeTab === tab.id ? 'active' : ''}`}
                onClick={() => handleTab(tab.id as TabType)}
              >
                {tab.label}
              </button>
            ))}
            <button
              className="menu-btn"
              style={{ marginTop: 8, color: 'var(--accent)' }}
              onClick={() => {
                setDockSheetOpen(true);
                setMobileMenuOpen(false);
              }}
            >
              Open Hermes Dock
            </button>
          </div>
          <div className="mobile-stats">
            <div className="row">
              <span className="label">Block Height</span>
              <span className="value">
                {liveState.chainStats.blockHeight.toLocaleString()}
              </span>
            </div>
            <div className="row">
              <span className="label">Viewers</span>
              <span className="value">{liveState.viewerCount.toLocaleString()}</span>
            </div>
          </div>
        </div>
      ) : null}

      <div className={`app-body ${isMobile ? 'mobile' : 'with-dock'}`}>
        <div className="app-content">
          <main className={`content-scroll ${isMobile ? 'has-mobile-dock' : ''}`}>
            {renderContent()}
          </main>
        </div>

        {!isMobile ? (
          <aside className="agent-panel" style={{ width: agentPanelWidth }}>
            <div
              className="resize-handle"
              onMouseDown={(event) => {
                event.preventDefault();
                const startX = event.clientX;
                const startWidth = agentPanelWidth;

                const handleMove = (moveEvent: MouseEvent) => {
                  const maxWidth = getDesktopPanelMaxWidth();
                  setAgentPanelWidth(
                    Math.max(320, Math.min(maxWidth, startWidth + (startX - moveEvent.clientX)))
                  );
                };

                const handleUp = () => {
                  document.removeEventListener('mousemove', handleMove);
                  document.removeEventListener('mouseup', handleUp);
                };

                document.addEventListener('mousemove', handleMove);
                document.addEventListener('mouseup', handleUp);
              }}
            />
            <div className="agent-panel-shell">
              <div className="agent-panel-meta">
                <span className="section-label">System console</span>
                <p>The persistent live rail for Hermes work, status, and output.</p>
              </div>
              <AgentTerminal variant="rail" />
            </div>
          </aside>
        ) : null}
      </div>

      <footer className="app-footer">
        <span className="brand">
          HERMESCHAIN — inspired by Hermes Agent by Nous Research. MIT.
        </span>
        <span className="disclaimer">
          Not affiliated with Nous Research. Hermeschain is an independent
          experiment powered by the Nous Hermes model via OpenRouter.
        </span>
      </footer>

      {isMobile ? (
        <>
          <button className="mobile-dock-trigger" onClick={() => setDockSheetOpen(true)}>
            <span>Hermes</span>
            <span>{liveState.connectionState === 'live' ? 'Live' : 'Open Dock'}</span>
          </button>
          <HermesDock
            state={liveState}
            mobile
            open={dockSheetOpen}
            onClose={() => setDockSheetOpen(false)}
            onNavigate={(tab) => {
              handleTab(tab);
              setDockSheetOpen(false);
            }}
          />
        </>
      ) : null}
    </div>
  );
}
