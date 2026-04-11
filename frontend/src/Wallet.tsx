import React, { useEffect, useState } from 'react';

const API_BASE =
  window.location.hostname === 'localhost' ? 'http://localhost:4000' : '';

interface Transaction {
  id: string;
  type: 'send' | 'receive' | 'faucet';
  amount: number;
  fromAddress: string;
  toAddress: string;
  hash: string;
  timestamp: number;
  status: string;
}

interface WalletData {
  id: string;
  address: string;
  privateKey?: string;
  balance: number;
  createdAt: number;
  lastFaucetClaim: number;
  totalReceived: number;
  totalSent: number;
  txCount: number;
  transactions: Transaction[];
}

interface FaucetStatus {
  canClaim: boolean;
  nextClaimAt: number;
  faucetAmount: number;
}

interface LeaderboardEntry {
  address: string;
  balance: number;
  tx_count: number;
}

type WalletView = 'connect' | 'wallet' | 'send' | 'leaderboard';

function describeWalletIssue(error: unknown, fallback: string): string {
  if (error instanceof TypeError) {
    return fallback;
  }

  if (error instanceof Error) {
    return error.message === 'Failed to fetch' ? fallback : error.message;
  }

  return fallback;
}

function normalizeTransaction(raw: any): Transaction {
  return {
    id: raw.id,
    type: raw.type,
    amount: Number(raw.amount || 0),
    fromAddress: raw.from_address || raw.fromAddress || '',
    toAddress: raw.to_address || raw.toAddress || '',
    hash: raw.hash || '',
    timestamp: Number(raw.timestamp || Date.now()),
    status: raw.status || 'confirmed',
  };
}

function normalizeWallet(raw: any, savedPrivateKey?: string): WalletData {
  return {
    id: raw.id || '',
    address: raw.address || '',
    privateKey: raw.privateKey || raw.private_key || savedPrivateKey,
    balance: Number(raw.balance || 0),
    createdAt: Number(raw.createdAt || raw.created_at || Date.now()),
    lastFaucetClaim: Number(raw.lastFaucetClaim || raw.last_faucet_claim || 0),
    totalReceived: Number(raw.totalReceived || raw.total_received || 0),
    totalSent: Number(raw.totalSent || raw.total_sent || 0),
    txCount: Number(raw.txCount || raw.tx_count || 0),
    transactions: Array.isArray(raw.transactions)
      ? raw.transactions.map(normalizeTransaction)
      : [],
  };
}

function isHermesAddress(value: string): boolean {
  return /^hermes_[1-9A-HJ-NP-Za-km-z]{12,}$/i.test(value.trim());
}

const Wallet: React.FC = () => {
  const [wallet, setWallet] = useState<WalletData | null>(null);
  const [view, setView] = useState<WalletView>('connect');
  const [isLoading, setIsLoading] = useState(false);
  const [showPrivateKey, setShowPrivateKey] = useState(false);
  const [faucetStatus, setFaucetStatus] = useState<FaucetStatus | null>(null);
  const [claimingFaucet, setClaimingFaucet] = useState(false);
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [copied, setCopied] = useState<string | null>(null);
  const [message, setMessage] = useState<{
    type: 'success' | 'error' | 'info';
    text: string;
  } | null>(null);
  const [sendForm, setSendForm] = useState({ toAddress: '', amount: '' });
  const [sendLoading, setSendLoading] = useState(false);
  const [importAddress, setImportAddress] = useState('');

  useEffect(() => {
    const savedWallet = localStorage.getItem('hermeschain_wallet');
    if (!savedWallet) return;

    try {
      const parsed = JSON.parse(savedWallet);
      if (parsed.address) {
        void fetchWallet(parsed.address, parsed.privateKey);
      }
    } catch (error) {
      console.error('Failed to parse saved wallet:', error);
      localStorage.removeItem('hermeschain_wallet');
    }
  }, []);

  useEffect(() => {
    if (!wallet) return;

    void fetchFaucetStatus(wallet.address);
    const interval = window.setInterval(() => {
      void fetchFaucetStatus(wallet.address);
    }, 30000);

    return () => window.clearInterval(interval);
  }, [wallet?.address]);

  const persistWallet = (nextWallet: WalletData | null) => {
    if (!nextWallet) {
      localStorage.removeItem('hermeschain_wallet');
      return;
    }

    localStorage.setItem(
      'hermeschain_wallet',
      JSON.stringify({
        id: nextWallet.id,
        address: nextWallet.address,
        privateKey: nextWallet.privateKey || null,
      })
    );
  };

  const fetchWallet = async (address: string, savedPrivateKey?: string) => {
    try {
      const response = await fetch(`${API_BASE}/api/wallet/address/${address}`);
      const data = await response.json();

      if (data.success && data.wallet) {
        const nextWallet = normalizeWallet(data.wallet, savedPrivateKey);
        setWallet(nextWallet);
        persistWallet(nextWallet);
        setView('wallet');
      } else if (response.status === 404) {
        persistWallet(null);
        setWallet(null);
        setView('connect');
      } else {
        throw new Error(data.error || 'Wallet lookup unavailable');
      }
    } catch (error) {
      console.error('Failed to fetch wallet:', error);
      if (address) {
        setMessage({
          type: 'error',
          text: describeWalletIssue(
            error,
            'Wallet is available locally, but the backend sync is offline right now.'
          ),
        });
      }
    }
  };

  const fetchFaucetStatus = async (address: string) => {
    try {
      const response = await fetch(`${API_BASE}/api/wallet/faucet/status/${address}`);
      if (!response.ok) return;

      setFaucetStatus(await response.json());
    } catch (error) {
      console.error('Failed to fetch faucet status:', error);
    }
  };

  const fetchLeaderboard = async () => {
    try {
      const response = await fetch(`${API_BASE}/api/wallet/leaderboard`);
      const data = await response.json();
      setLeaderboard(data.wallets || []);
    } catch (error) {
      console.error('Failed to fetch leaderboard:', error);
      setMessage({
        type: 'error',
        text: describeWalletIssue(
          error,
          'Wallet leaderboard is temporarily unavailable.'
        ),
      });
    }
  };

  const createWallet = async () => {
    setIsLoading(true);
    setMessage(null);

    try {
      const response = await fetch(`${API_BASE}/api/wallet/create`, { method: 'POST' });
      const data = await response.json();

      if (!data.success) {
        throw new Error(data.error || 'Failed to create wallet');
      }

      const nextWallet = normalizeWallet(data.wallet);
      setWallet(nextWallet);
      persistWallet(nextWallet);
      setView('wallet');
      setShowPrivateKey(true);
      setMessage({
        type: 'success',
        text: 'Wallet created. Save the private key before you move on.',
      });
    } catch (error) {
      setMessage({
        type: 'error',
        text: error instanceof Error ? error.message : 'Failed to create wallet',
      });
    } finally {
      setIsLoading(false);
    }
  };

  const importWallet = async () => {
    if (!isHermesAddress(importAddress)) {
      setMessage({
        type: 'error',
        text: 'Imported wallets must use the `hermes_...` address format.',
      });
      return;
    }

    setIsLoading(true);
    setMessage(null);

    try {
      const response = await fetch(`${API_BASE}/api/wallet/import`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ address: importAddress.trim() }),
      });
      const data = await response.json();

      if (!data.success) {
        throw new Error(data.error || 'Failed to import wallet');
      }

      const nextWallet = normalizeWallet(data.wallet);
      setWallet(nextWallet);
      persistWallet(nextWallet);
      setView('wallet');
      setMessage({
        type: 'success',
        text: 'Wallet imported successfully.',
      });
    } catch (error) {
      setMessage({
        type: 'error',
        text: error instanceof Error ? error.message : 'Failed to import wallet',
      });
    } finally {
      setIsLoading(false);
    }
  };

  const claimFaucet = async () => {
    if (!wallet) return;

    setClaimingFaucet(true);
    setMessage(null);

    try {
      const response = await fetch(`${API_BASE}/api/wallet/faucet/claim`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ address: wallet.address }),
      });
      const data = await response.json();

      if (!data.success) {
        throw new Error(data.error || 'Faucet unavailable');
      }

      setMessage({
        type: 'success',
        text: `Claimed ${data.amount} OPEN from the faucet.`,
      });

      await fetchWallet(wallet.address, wallet.privateKey);
      await fetchFaucetStatus(wallet.address);
    } catch (error) {
      setMessage({
        type: 'error',
        text: error instanceof Error ? error.message : 'Failed to claim faucet funds',
      });
    } finally {
      setClaimingFaucet(false);
    }
  };

  const sendTokens = async () => {
    if (!wallet) return;

    const amount = Number(sendForm.amount);

    if (!isHermesAddress(sendForm.toAddress)) {
      setMessage({
        type: 'error',
        text: 'Recipient must be a valid `hermes_...` address.',
      });
      return;
    }

    if (!Number.isFinite(amount) || amount <= 0) {
      setMessage({
        type: 'error',
        text: 'Enter a positive amount of OPEN to send.',
      });
      return;
    }

    if (sendForm.toAddress.trim() === wallet.address) {
      setMessage({
        type: 'error',
        text: 'Sending OPEN to the same wallet is not supported here.',
      });
      return;
    }

    if (amount > wallet.balance) {
      setMessage({
        type: 'error',
        text: 'You do not have enough OPEN in this wallet for that transfer.',
      });
      return;
    }

    setSendLoading(true);
    setMessage(null);

    try {
      const response = await fetch(`${API_BASE}/api/wallet/send`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fromAddress: wallet.address,
          toAddress: sendForm.toAddress.trim(),
          amount,
        }),
      });
      const data = await response.json();

      if (!data.success) {
        throw new Error(data.error || 'Send failed');
      }

      setMessage({
        type: 'success',
        text: `Sent ${data.amount} OPEN.`,
      });
      setSendForm({ toAddress: '', amount: '' });
      await fetchWallet(wallet.address, wallet.privateKey);
      setView('wallet');
    } catch (error) {
      setMessage({
        type: 'error',
        text: error instanceof Error ? error.message : 'Failed to send tokens',
      });
    } finally {
      setSendLoading(false);
    }
  };

  const copyToClipboard = (text: string, label: string) => {
    void navigator.clipboard
      .writeText(text)
      .then(() => {
        setCopied(label);
        window.setTimeout(() => setCopied(null), 2000);
      })
      .catch(() => {
        setMessage({
          type: 'error',
          text: 'Clipboard access is unavailable in this browser context.',
        });
      });
  };

  const disconnectWallet = () => {
    persistWallet(null);
    setWallet(null);
    setView('connect');
    setShowPrivateKey(false);
    setMessage(null);
  };

  const formatTimeUntil = (timestamp: number) => {
    const now = Date.now();
    const diff = timestamp - now;
    if (diff <= 0) return 'Now';
    const hours = Math.floor(diff / (60 * 60 * 1000));
    const mins = Math.floor((diff % (60 * 60 * 1000)) / (60 * 1000));
    return `${hours}h ${mins}m`;
  };

  const formatTimeAgo = (timestamp: number) => {
    const seconds = Math.floor((Date.now() - timestamp) / 1000);
    if (seconds < 60) return `${seconds}s ago`;
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
    if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
    return `${Math.floor(seconds / 86400)}d ago`;
  };

  const renderMessage = () =>
    message ? (
      <div className={`wallet-banner wallet-banner--${message.type}`}>{message.text}</div>
    ) : null;

  const renderConnect = () => (
    <div className="wallet-app__section">
      <div className="wallet-hero">
        <div className="wallet-hero__mark">{'<>'}</div>
        <div>
          <span className="section-label">Wallet ingress</span>
          <h3>Hermeschain Wallet</h3>
          <p>Create a new wallet or reconnect an existing `hermes_...` address.</p>
        </div>
      </div>

      {renderMessage()}

      <div className="wallet-grid wallet-grid--connect">
        <div className="artifact-card wallet-card">
          <span className="artifact-kicker">Create new wallet</span>
          <h4>Fresh OPEN address</h4>
          <p>Generate a new wallet and immediately claim faucet funds once it exists.</p>
          <button className="btn-primary" onClick={() => void createWallet()} disabled={isLoading}>
            {isLoading ? 'Creating...' : 'Create wallet'}
          </button>
        </div>

        <div className="artifact-card wallet-card">
          <span className="artifact-kicker">Import wallet</span>
          <h4>Reconnect an address</h4>
          <p>Import an existing Hermeschain address. The UI now validates the correct prefix.</p>
          <input
            className="input"
            type="text"
            value={importAddress}
            onChange={(event) => setImportAddress(event.target.value)}
            placeholder="hermes_..."
          />
          <button
            className="btn-ghost"
            onClick={() => void importWallet()}
            disabled={isLoading || !importAddress.trim()}
          >
            Import wallet
          </button>
        </div>
      </div>

      <div className="wallet-footer-actions">
        <button
          className="btn-ghost"
          onClick={() => {
            void fetchLeaderboard();
            setView('leaderboard');
          }}
        >
          View leaderboard
        </button>
      </div>
    </div>
  );

  const renderWalletView = () => (
    <div className="wallet-app__section">
      <div className="wallet-subnav">
        <button className="tab-btn active">Wallet</button>
        <button className="tab-btn" onClick={() => setView('send')}>
          Send
        </button>
        <button
          className="tab-btn"
          onClick={() => {
            void fetchLeaderboard();
            setView('leaderboard');
          }}
        >
          Leaderboard
        </button>
      </div>

      {renderMessage()}

      <div className="wallet-balance-card">
        <span className="artifact-kicker">Total balance</span>
        <h3>
          {wallet?.balance.toLocaleString()} <span>OPEN</span>
        </h3>
        <div className="wallet-address-row">
          <code>{wallet?.address}</code>
          <button
            className="btn-ghost"
            onClick={() => copyToClipboard(wallet?.address || '', 'address')}
          >
            {copied === 'address' ? 'Copied' : 'Copy'}
          </button>
        </div>
      </div>

      {wallet?.privateKey && showPrivateKey ? (
        <div className="wallet-private-key-card">
          <span className="section-label">Save this key</span>
          <h4>Private key visible for this session</h4>
          <p>Store it securely before you dismiss this panel.</p>
          <code>{wallet.privateKey}</code>
          <div className="wallet-inline-actions">
            <button
              className="btn-ghost"
              onClick={() => copyToClipboard(wallet.privateKey || '', 'privateKey')}
            >
              {copied === 'privateKey' ? 'Copied' : 'Copy key'}
            </button>
            <button className="btn-primary" onClick={() => setShowPrivateKey(false)}>
              I saved it
            </button>
          </div>
        </div>
      ) : null}

      <div className="wallet-grid wallet-grid--stats">
        <div className="artifact-card compact">
          <span className="artifact-kicker">Transactions</span>
          <h4>{wallet?.txCount || 0}</h4>
          <p>Total wallet transfers observed by the backend.</p>
        </div>
        <div className="artifact-card compact">
          <span className="artifact-kicker">Received</span>
          <h4>{wallet?.totalReceived.toLocaleString() || 0}</h4>
          <p>Total OPEN received by this wallet.</p>
        </div>
        <div className="artifact-card compact">
          <span className="artifact-kicker">Sent</span>
          <h4>{wallet?.totalSent.toLocaleString() || 0}</h4>
          <p>Total OPEN sent from this wallet.</p>
        </div>
      </div>

      <div className="wallet-inline-actions wallet-inline-actions--primary">
        <button className="btn-primary" onClick={() => setView('send')}>
          Send OPEN
        </button>
        <button
          className="btn-ghost"
          onClick={() => void claimFaucet()}
          disabled={claimingFaucet || !faucetStatus?.canClaim}
        >
          {claimingFaucet
            ? 'Claiming...'
            : faucetStatus?.canClaim
              ? `Claim ${faucetStatus.faucetAmount} OPEN`
              : `Wait ${formatTimeUntil(faucetStatus?.nextClaimAt || 0)}`}
        </button>
      </div>

      <div className="artifact-card wallet-faucet-card">
        <span className="artifact-kicker">Faucet status</span>
        <h4>
          {faucetStatus?.canClaim
            ? 'Ready'
            : `Next claim in ${formatTimeUntil(faucetStatus?.nextClaimAt || 0)}`}
        </h4>
        <p>{faucetStatus?.faucetAmount || 100} OPEN available every 24 hours.</p>
      </div>

      <div className="engraved-panel wallet-activity-panel">
        <div className="panel-head tight">
          <span className="section-label">Recent wallet activity</span>
          <p>Recent sends, receives, and faucet claims associated with this address.</p>
        </div>

        {!wallet?.transactions.length ? (
          <div className="dock-empty">No wallet transfers have been recorded yet.</div>
        ) : (
          <div className="wallet-activity-list">
            {wallet.transactions.slice(0, 12).map((tx) => (
              <div key={tx.id} className="wallet-activity-item">
                <div className="wallet-activity-item__type">
                  {tx.type === 'receive' || tx.type === 'faucet' ? '+' : '-'}
                </div>
                <div className="wallet-activity-item__body">
                  <strong>
                    {tx.type === 'faucet'
                      ? 'Faucet claim'
                      : tx.type === 'receive'
                        ? 'Received'
                        : 'Sent'}
                  </strong>
                  <span>{formatTimeAgo(tx.timestamp)}</span>
                </div>
                <div className="wallet-activity-item__amount">
                  {tx.type === 'receive' || tx.type === 'faucet' ? '+' : '-'}
                  {tx.amount}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="wallet-footer-actions">
        <button className="btn-ghost" onClick={() => setShowPrivateKey((prev) => !prev)}>
          {showPrivateKey ? 'Hide private key panel' : 'Show private key panel'}
        </button>
        <button className="btn-ghost" onClick={() => disconnectWallet()}>
          Disconnect wallet
        </button>
      </div>
    </div>
  );

  const renderSend = () => (
    <div className="wallet-app__section">
      <div className="wallet-subnav">
        <button className="tab-btn" onClick={() => setView('wallet')}>
          Wallet
        </button>
        <button className="tab-btn active">Send</button>
        <button
          className="tab-btn"
          onClick={() => {
            void fetchLeaderboard();
            setView('leaderboard');
          }}
        >
          Leaderboard
        </button>
      </div>

      {renderMessage()}

      <div className="engraved-panel wallet-send-panel">
        <div className="panel-head tight">
          <span className="section-label">Send OPEN</span>
          <p>Move OPEN to another Hermeschain address using the existing wallet send endpoint.</p>
        </div>

        <div className="wallet-form-grid">
          <label className="wallet-field">
            <span>Recipient</span>
            <input
              className="input"
              type="text"
              value={sendForm.toAddress}
              onChange={(event) =>
                setSendForm((prev) => ({ ...prev, toAddress: event.target.value }))
              }
              placeholder="hermes_..."
            />
          </label>

          <label className="wallet-field">
            <span>Amount</span>
            <input
              className="input"
              type="number"
              min="0"
              step="0.01"
              value={sendForm.amount}
              onChange={(event) =>
                setSendForm((prev) => ({ ...prev, amount: event.target.value }))
              }
              placeholder="0"
            />
          </label>
        </div>

        <div className="wallet-inline-actions">
          <button
            className="btn-ghost"
            onClick={() =>
              setSendForm((prev) => ({
                ...prev,
                amount: wallet?.balance.toString() || '0',
              }))
            }
          >
            Use max
          </button>
          <button
            className="btn-primary"
            onClick={() => void sendTokens()}
            disabled={
              sendLoading ||
              !sendForm.toAddress ||
              !sendForm.amount ||
              parseFloat(sendForm.amount) <= 0
            }
          >
            {sendLoading ? 'Sending...' : 'Send OPEN'}
          </button>
        </div>
      </div>
    </div>
  );

  const renderLeaderboard = () => (
    <div className="wallet-app__section">
      <div className="wallet-subnav">
        <button className="tab-btn" onClick={() => setView(wallet ? 'wallet' : 'connect')}>
          {wallet ? 'Wallet' : 'Connect'}
        </button>
        {wallet ? (
          <button className="tab-btn" onClick={() => setView('send')}>
            Send
          </button>
        ) : null}
        <button className="tab-btn active">Leaderboard</button>
      </div>

      {renderMessage()}

      <div className="engraved-panel wallet-leaderboard-panel">
        <div className="panel-head tight">
          <span className="section-label">Top OPEN holders</span>
          <p>Live wallet leaderboard from the backend wallet index.</p>
        </div>

        {leaderboard.length === 0 ? (
          <div className="dock-empty">No wallet leaderboard entries are visible yet.</div>
        ) : (
          <div className="wallet-leaderboard-table">
            <div className="wallet-leaderboard-row wallet-leaderboard-row--head">
              <span>Rank</span>
              <span>Address</span>
              <span>Balance</span>
              <span>Txs</span>
            </div>
            {leaderboard.map((entry, index) => (
              <div
                key={`${entry.address}-${index}`}
                className={`wallet-leaderboard-row ${
                  wallet?.address === entry.address ? 'is-current-wallet' : ''
                }`}
              >
                <span>{index + 1}</span>
                <span>
                  {entry.address.slice(0, 18)}...
                  {wallet?.address === entry.address ? ' (you)' : ''}
                </span>
                <span>{entry.balance.toLocaleString()}</span>
                <span>{entry.tx_count}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );

  return (
    <div className="wallet-app">
      {view === 'connect' && renderConnect()}
      {view === 'wallet' && renderWalletView()}
      {view === 'send' && renderSend()}
      {view === 'leaderboard' && renderLeaderboard()}
    </div>
  );
};

export default Wallet;
