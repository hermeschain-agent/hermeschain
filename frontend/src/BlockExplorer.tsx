import React, { useEffect, useMemo, useState } from 'react';
import RitualActions from './RitualActions';
import { RitualKind, RitualResponse } from './useHermesDockState';

interface BlockSummary {
  height: number;
  hash: string;
  parentHash: string;
  producer: string;
  timestamp: number;
  transactionCount: number;
  gasUsed: string;
  gasLimit: string;
  stateRoot: string;
}

interface ExplorerTransaction {
  hash: string;
  from: string;
  to: string;
  value: string;
  gasPrice: string;
  gasLimit: string;
  nonce: number;
  timestamp: number;
  blockHeight: number;
  blockHash: string;
  producer: string;
}

interface BlockDetail extends BlockSummary {
  transactions?: Array<{
    hash: string;
    from: string;
    to: string;
    value: string;
    gasPrice: string;
    nonce: number;
  }>;
}

interface BlockExplorerProps {
  onRunRitual: (ritual: RitualKind, page: string) => void;
  ritualLoading: RitualKind | null;
  ritualResult: RitualResponse | null;
  ritualError: string | null;
}

type ExplorerRouteState = 'loading' | 'empty' | 'ready' | 'error';

const API_BASE =
  window.location.hostname === 'localhost'
    ? 'http://localhost:4000'
    : import.meta.env.VITE_API_URL || '';

export default function BlockExplorer({
  onRunRitual,
  ritualLoading,
  ritualResult,
  ritualError,
}: BlockExplorerProps) {
  const [blocks, setBlocks] = useState<BlockSummary[]>([]);
  const [transactions, setTransactions] = useState<ExplorerTransaction[]>([]);
  const [selectedBlock, setSelectedBlock] = useState<BlockDetail | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchBlockResult, setSearchBlockResult] = useState<BlockDetail | null>(null);
  const [searchTransactionResult, setSearchTransactionResult] =
    useState<ExplorerTransaction | null>(null);
  const [searchAttempted, setSearchAttempted] = useState(false);
  const [loadingBlocks, setLoadingBlocks] = useState(true);
  const [loadingTransactions, setLoadingTransactions] = useState(true);
  const [searching, setSearching] = useState(false);
  const [view, setView] = useState<'blocks' | 'transactions'>('blocks');
  const [stats, setStats] = useState({
    blockHeight: 0,
    totalTransactions: 0,
    avgBlockTime: 0,
  });
  const [error, setError] = useState<string | null>(null);

  const describeExplorerIssue = (fetchError: unknown, fallback: string) => {
    if (fetchError instanceof TypeError) {
      return fallback;
    }

    if (fetchError instanceof Error) {
      return fetchError.message === 'Failed to fetch' ? fallback : fetchError.message;
    }

    return fallback;
  };

  useEffect(() => {
    const refresh = async () => {
      await Promise.all([fetchBlocks(), fetchTransactions(), fetchStats()]);
    };

    void refresh();
    const interval = window.setInterval(refresh, 5000);
    return () => window.clearInterval(interval);
  }, []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setSelectedBlock(null);
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  const fetchBlocks = async () => {
    try {
      const response = await fetch(`${API_BASE}/api/chain/blocks?limit=16`);
      if (!response.ok) {
        throw new Error('Recent blocks unavailable');
      }

      const data = await response.json();
      setBlocks(data.blocks || []);
      setStats((prev) => ({
        ...prev,
        blockHeight: data.total || prev.blockHeight,
      }));
      setError(null);
    } catch (fetchError) {
      setError(
        describeExplorerIssue(fetchError, 'The explorer backend is offline right now.')
      );
    } finally {
      setLoadingBlocks(false);
    }
  };

  const fetchTransactions = async (query: string = '') => {
    try {
      const qs = new URLSearchParams();
      qs.set('limit', '24');
      if (query.trim()) {
        qs.set('query', query.trim());
      }

      const response = await fetch(`${API_BASE}/api/chain/transactions?${qs.toString()}`);
      if (!response.ok) {
        throw new Error('Recent transactions unavailable');
      }

      const data = await response.json();
      setTransactions(data.transactions || []);
      setError(null);
      return data.transactions || [];
    } catch (fetchError) {
      setError(
        describeExplorerIssue(fetchError, 'Recent transactions are temporarily unavailable.')
      );
      return [];
    } finally {
      setLoadingTransactions(false);
    }
  };

  const fetchStats = async () => {
    try {
      const response = await fetch(`${API_BASE}/api/chain/stats`);
      if (!response.ok) return;

      const data = await response.json();
      setStats({
        blockHeight: data.height || 0,
        totalTransactions: data.storedTransactions ?? data.totalTransactions ?? 0,
        avgBlockTime: Math.round((data.avgBlockTime || 10000) / 1000),
      });
    } catch (fetchError) {
      console.error('Failed to fetch explorer stats:', fetchError);
    }
  };

  const openBlock = async (height: number) => {
    try {
      const response = await fetch(`${API_BASE}/api/chain/block/${height}`);
      if (!response.ok) {
        throw new Error('Block detail unavailable');
      }

      const data = await response.json();
      setSelectedBlock(data);
    } catch (fetchError) {
      console.error('Failed to fetch block detail:', fetchError);
      setError(
        describeExplorerIssue(fetchError, 'Block detail is temporarily unavailable.')
      );
    }
  };

  const handleSearch = async () => {
    const normalized = searchQuery.trim();
    if (!normalized) {
      setSearchAttempted(false);
      setSearchBlockResult(null);
      setSearchTransactionResult(null);
      return;
    }

    setSearching(true);
    setSearchAttempted(true);
    setSearchBlockResult(null);
    setSearchTransactionResult(null);

    try {
      if (/^\d+$/.test(normalized)) {
        const response = await fetch(`${API_BASE}/api/chain/block/${normalized}`);
        if (response.ok) {
          setSearchBlockResult(await response.json());
          return;
        }
      }

      const blockMatch = blocks.find(
        (block) =>
          block.hash.toLowerCase().includes(normalized.toLowerCase()) ||
          block.parentHash.toLowerCase().includes(normalized.toLowerCase())
      );

      if (blockMatch) {
        setSearchBlockResult({
          ...blockMatch,
          transactions: [],
        });
        return;
      }

      const transactionMatches = await fetchTransactions(normalized);
      if (transactionMatches.length > 0) {
        setSearchTransactionResult(transactionMatches[0]);
      }
    } finally {
      setSearching(false);
    }
  };

  const formatHash = (hash: string) => {
    if (!hash) return 'unknown';
    return `${hash.slice(0, 10)}...${hash.slice(-8)}`;
  };

  const formatAddress = (value: string) => {
    if (!value) return 'unknown';
    return `${value.slice(0, 12)}...${value.slice(-8)}`;
  };

  const formatTimeAgo = (timestamp: number) => {
    const seconds = Math.max(0, Math.floor((Date.now() - timestamp) / 1000));
    if (seconds < 60) return `${seconds}s ago`;
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
    if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
    return `${Math.floor(seconds / 86400)}d ago`;
  };

  const visibleTransactions = useMemo(
    () => (searchQuery.trim() && searchTransactionResult ? [searchTransactionResult] : transactions),
    [searchQuery, searchTransactionResult, transactions]
  );

  const blocksState: ExplorerRouteState = loadingBlocks
    ? 'loading'
    : error && blocks.length === 0
      ? 'error'
      : blocks.length > 0
        ? 'ready'
        : 'empty';

  const transactionsState: ExplorerRouteState = loadingTransactions
    ? 'loading'
    : error && visibleTransactions.length === 0
      ? 'error'
      : visibleTransactions.length > 0
        ? 'ready'
        : 'empty';

  return (
    <div className="page-wide route-frame">
      <div className="section-head explorer-head">
        <span className="kicker">Chain Archive</span>
        <h2>Block Explorer</h2>
        <p>
          Inspect recent blocks, trace the latest state changes, and let Hermes
          narrate what the chain just did.
        </p>
      </div>

      <RitualActions
        title="Explorer Rituals"
        description="Use Hermes as an interpreter for the raw chain data below."
        loading={ritualLoading}
        result={ritualResult}
        error={ritualError}
        onRun={(ritual) => onRunRitual(ritual, 'explorer')}
      />

      {error ? (
        <div className="shell-banner shell-banner--warning">
          <strong>{error}</strong>
        </div>
      ) : null}

      <div className="artifact-grid explorer-stats">
        <div className="artifact-card">
          <span className="artifact-kicker">Block height</span>
          <h4>{stats.blockHeight.toLocaleString()}</h4>
          <p>Latest recorded height from the live chain.</p>
        </div>
        <div className="artifact-card">
          <span className="artifact-kicker">Transactions</span>
          <h4>{stats.totalTransactions.toLocaleString()}</h4>
          <p>Total transactions observed since genesis.</p>
        </div>
        <div className="artifact-card">
          <span className="artifact-kicker">Average cadence</span>
          <h4>~{stats.avgBlockTime || 10}s</h4>
          <p>The rough time between recent blocks.</p>
        </div>
      </div>

      <div className="engraved-panel explorer-search">
        <div className="panel-head tight">
          <span className="section-label">Search</span>
          <p>Look up a block height, block hash prefix, or transaction hash prefix.</p>
        </div>

        <div className="chat-input-row">
          <input
            className="input"
            type="text"
            placeholder="Try block 42, a recent block hash, or a transaction hash"
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') void handleSearch();
            }}
          />
          <button className="btn-primary" onClick={() => void handleSearch()}>
            {searching ? 'Searching...' : 'Search'}
          </button>
        </div>

        {searchAttempted && !searchBlockResult && !searchTransactionResult && !searching ? (
          <p className="shell-note">
            No block or transaction matched that query yet. The explorer only searches
            what the backend currently exposes.
          </p>
        ) : null}

        {searchBlockResult ? (
          <div className="artifact-card explorer-search-result">
            <div className="artifact-meta">
              <span className="artifact-kicker">Block result</span>
              <span className="artifact-sources">
                {formatTimeAgo(searchBlockResult.timestamp)}
              </span>
            </div>
            <h4>Block #{searchBlockResult.height}</h4>
            <p>{formatHash(searchBlockResult.hash)}</p>
            <button
              className="btn-ghost"
              onClick={() => void openBlock(searchBlockResult.height)}
            >
              Inspect Block
            </button>
          </div>
        ) : null}

        {searchTransactionResult ? (
          <div className="artifact-card explorer-search-result">
            <div className="artifact-meta">
              <span className="artifact-kicker">Transaction result</span>
              <span className="artifact-sources">
                Block #{searchTransactionResult.blockHeight}
              </span>
            </div>
            <h4>{formatHash(searchTransactionResult.hash)}</h4>
            <p>
              {formatAddress(searchTransactionResult.from)} →{' '}
              {formatAddress(searchTransactionResult.to)}
            </p>
            <button
              className="btn-ghost"
              onClick={() => void openBlock(searchTransactionResult.blockHeight)}
            >
              Open Containing Block
            </button>
          </div>
        ) : null}
      </div>

      <div className="explorer-view-toggle">
        <button
          className={`tab-btn ${view === 'blocks' ? 'active' : ''}`}
          onClick={() => setView('blocks')}
        >
          Recent Blocks
        </button>
        <button
          className={`tab-btn ${view === 'transactions' ? 'active' : ''}`}
          onClick={() => setView('transactions')}
        >
          Transactions
        </button>
      </div>

      {view === 'blocks' ? (
        <div className="engraved-panel explorer-table">
          <div className="panel-head tight">
            <span className="section-label">Recent ledger</span>
            <p>Click any row for the full block artifact.</p>
          </div>

          <div className="explorer-list explorer-list-head">
            <span>Height</span>
            <span>Hash</span>
            <span>Producer</span>
            <span>Tx</span>
            <span>Age</span>
          </div>

          {blocksState === 'loading' ? (
            <div className="dock-empty">Loading recent blocks...</div>
          ) : blocksState === 'error' ? (
            <div className="dock-empty">
              The block index is unavailable right now. Hermes can still explain the
              latest block once the backend reconnects.
            </div>
          ) : blocks.length === 0 ? (
            <div className="dock-empty">No blocks have been indexed yet.</div>
          ) : (
            blocks.map((block) => (
              <button
                key={block.height}
                className="explorer-list explorer-row"
                onClick={() => void openBlock(block.height)}
              >
                <span className="mono accent">#{block.height}</span>
                <span className="mono">{formatHash(block.hash)}</span>
                <span>{block.producer}</span>
                <span className="mono">{block.transactionCount}</span>
                <span>{formatTimeAgo(block.timestamp)}</span>
              </button>
            ))
          )}
        </div>
      ) : (
        <div className="engraved-panel explorer-table">
          <div className="panel-head tight">
            <span className="section-label">Recent transfers</span>
            <p>Transaction-level browsing now uses the live chain transaction feed.</p>
          </div>

          <div className="explorer-list explorer-list-head explorer-list-head--transactions">
            <span>Hash</span>
            <span>Route</span>
            <span>Value</span>
            <span>Block</span>
            <span>Age</span>
          </div>

          {transactionsState === 'loading' ? (
            <div className="dock-empty">Loading recent transactions...</div>
          ) : transactionsState === 'error' ? (
            <div className="dock-empty">
              The transaction feed is offline right now, so only cached block context
              is available.
            </div>
          ) : visibleTransactions.length === 0 ? (
            <div className="dock-empty">No transactions have been indexed yet.</div>
          ) : (
            visibleTransactions.map((transaction) => (
              <button
                key={`${transaction.hash}-${transaction.blockHeight}`}
                className="explorer-list explorer-row explorer-row--transaction"
                onClick={() => void openBlock(transaction.blockHeight)}
              >
                <span className="mono">{formatHash(transaction.hash)}</span>
                <span>
                  {formatAddress(transaction.from)} → {formatAddress(transaction.to)}
                </span>
                <span className="mono">{transaction.value} OPEN</span>
                <span className="mono">#{transaction.blockHeight}</span>
                <span>{formatTimeAgo(transaction.timestamp)}</span>
              </button>
            ))
          )}
        </div>
      )}

      {selectedBlock ? (
        <div className="explorer-modal-backdrop" onClick={() => setSelectedBlock(null)}>
          <div
            className="engraved-panel explorer-modal"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="dock-header">
              <div>
                <span className="section-label">Block artifact</span>
                <h3>Block #{selectedBlock.height}</h3>
              </div>
              <button className="btn-icon" onClick={() => setSelectedBlock(null)}>
                ×
              </button>
            </div>

            <div className="artifact-grid explorer-modal-grid">
              <div className="artifact-card">
                <span className="artifact-kicker">Hash</span>
                <p className="mono">{selectedBlock.hash}</p>
              </div>
              <div className="artifact-card">
                <span className="artifact-kicker">Parent</span>
                <p className="mono">{selectedBlock.parentHash}</p>
              </div>
              <div className="artifact-card">
                <span className="artifact-kicker">Producer</span>
                <h4>{selectedBlock.producer}</h4>
                <p>{new Date(selectedBlock.timestamp).toLocaleString()}</p>
              </div>
              <div className="artifact-card">
                <span className="artifact-kicker">Gas</span>
                <h4>{selectedBlock.gasUsed}</h4>
                <p>Limit {selectedBlock.gasLimit}</p>
              </div>
            </div>

            <div className="engraved-panel explorer-tx-panel">
              <div className="panel-head tight">
                <span className="section-label">Transactions</span>
                <p>
                  {selectedBlock.transactions?.length
                    ? `${selectedBlock.transactions.length} transaction(s) recorded in this block.`
                    : 'No user transactions were included in this block.'}
                </p>
              </div>

              {selectedBlock.transactions?.length ? (
                <div className="dock-activity-list">
                  {selectedBlock.transactions.map((transaction) => (
                    <article key={transaction.hash} className="dock-activity-item">
                      <div className="dock-activity-meta">
                        <span>{formatHash(transaction.hash)}</span>
                        <span>{transaction.value} OPEN</span>
                      </div>
                      <p className="mono">
                        {transaction.from} → {transaction.to}
                      </p>
                    </article>
                  ))}
                </div>
              ) : (
                <div className="dock-empty">
                  This block was produced without any new wallet transfers.
                </div>
              )}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
