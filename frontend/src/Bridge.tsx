import React, { useEffect, useMemo, useState } from 'react';
import { API_BASE } from './api';

interface DestChain {
  id: string;
  name: string;
  short: string;
  wrapped: string;
}
interface BridgeConfig {
  sourceChain: { id: string; name: string; short: string };
  destinationChains: DestChain[];
  asset: string;
  relayers: number;
  threshold: number;
  feeBps: number;
  etaSeconds: number;
  confirmationsRequired: number;
}
interface TransferStatus {
  phase: 'locking' | 'attesting' | 'minting' | 'completed';
  label: string;
  confirmations: number;
  confirmationsRequired: number;
  signatures: number;
  threshold: number;
  relayers: number;
  progress: number;
}
interface Transfer {
  id: string;
  sourceChain: string;
  destinationChain: string;
  asset: string;
  amount: string;
  sender: string;
  recipient: string;
  nonce: number;
  lockHeight: number;
  lockTxHash: string;
  destinationTxHash: string | null;
  createdAt: string;
  status: TransferStatus;
}

const short = (s: string, n = 6) =>
  s && s.length > n + 4 ? `${s.slice(0, n)}…${s.slice(-4)}` : s;

function chainName(config: BridgeConfig | null, id: string): string {
  return config?.destinationChains.find((c) => c.id === id)?.name ?? id;
}

export default function Bridge() {
  const [config, setConfig] = useState<BridgeConfig | null>(null);
  const [toChain, setToChain] = useState('ethereum');
  const [amount, setAmount] = useState('');
  const [sender, setSender] = useState('');
  const [recipient, setRecipient] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [feedback, setFeedback] = useState<{
    type: 'success' | 'error';
    text: string;
  } | null>(null);
  const [transfers, setTransfers] = useState<Transfer[]>([]);

  useEffect(() => {
    fetch(`${API_BASE}/api/bridge/config`)
      .then((r) => r.json())
      .then((c: BridgeConfig) => {
        setConfig(c);
        if (c?.destinationChains?.[0]) setToChain(c.destinationChains[0].id);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    const load = () =>
      fetch(`${API_BASE}/api/bridge/transfers?limit=12`)
        .then((r) => r.json())
        .then((d) => setTransfers(Array.isArray(d?.transfers) ? d.transfers : []))
        .catch(() => {});
    load();
    const t = window.setInterval(load, 4000);
    return () => window.clearInterval(t);
  }, []);

  const dest = useMemo(
    () => config?.destinationChains.find((c) => c.id === toChain),
    [config, toChain],
  );
  const fee = useMemo(() => {
    const a = Number(amount);
    if (!config || !a || a <= 0) return null;
    return (a * config.feeBps) / 10000;
  }, [amount, config]);
  const receiveAmount = useMemo(() => {
    const a = Number(amount);
    if (!a || fee == null) return null;
    return Math.max(0, a - fee);
  }, [amount, fee]);

  const reloadTransfers = () =>
    fetch(`${API_BASE}/api/bridge/transfers?limit=12`)
      .then((r) => r.json())
      .then((d) => setTransfers(Array.isArray(d?.transfers) ? d.transfers : []))
      .catch(() => {});

  const submit = async () => {
    setFeedback(null);
    if (!sender.trim())
      return setFeedback({ type: 'error', text: 'Enter your Hermeschain (sender) address.' });
    if (!recipient.trim())
      return setFeedback({
        type: 'error',
        text: `Enter your ${dest?.name ?? 'destination'} recipient address.`,
      });
    const a = Number(amount);
    if (!a || a <= 0)
      return setFeedback({ type: 'error', text: 'Enter an amount greater than zero.' });
    setSubmitting(true);
    try {
      const res = await fetch(`${API_BASE}/api/bridge/lock`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fromChain: config?.sourceChain.id,
          toChain,
          amount: amount.trim(),
          sender: sender.trim(),
          recipient: recipient.trim(),
          asset: 'HERMES',
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || 'Bridge request failed');
      setFeedback({
        type: 'success',
        text: `Locked ${amount} HERMES — relayers are attesting the transfer to ${dest?.name}.`,
      });
      setAmount('');
      reloadTransfers();
    } catch (e: any) {
      setFeedback({ type: 'error', text: e?.message || 'Bridge request failed' });
    } finally {
      setSubmitting(false);
    }
  };

  const relayers = config?.relayers ?? 7;
  const threshold = config?.threshold ?? 5;

  return (
    <div className="page-wide route-frame">
      <div className="section-head">
        <span className="kicker">Cross-chain</span>
        <h2>Bridge</h2>
        <p>
          Lock HERMES on Hermeschain and mint a wrapped representation on another
          chain. Every transfer is secured by an {threshold}-of-{relayers} relayer
          attestation set.
        </p>
      </div>

      <div className="bridge-grid">
        <div className="center-card bridge-card">
          <div className="bridge-route">
            <div className="bridge-chain">
              <span className="bridge-chain-name">Hermeschain</span>
              <span className="bridge-chain-sub">source</span>
            </div>
            <div className="bridge-arrow">→</div>
            <div className="bridge-chain">
              <select
                className="input bridge-select"
                value={toChain}
                onChange={(e) => setToChain(e.target.value)}
              >
                {config?.destinationChains.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
              <span className="bridge-chain-sub">destination</span>
            </div>
          </div>

          <label className="bridge-label">Amount</label>
          <div className="bridge-amount">
            <input
              className="input"
              type="number"
              min="0"
              step="any"
              placeholder="0.0"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
            />
            <span className="bridge-asset">HERMES</span>
          </div>

          <label className="bridge-label">From — your Hermeschain address</label>
          <input
            className="input"
            type="text"
            placeholder="J824… or hermes_…"
            value={sender}
            onChange={(e) => setSender(e.target.value)}
          />

          <label className="bridge-label">
            To — recipient on {dest?.name ?? '…'}
          </label>
          <input
            className="input"
            type="text"
            placeholder={dest ? `${dest.name} address` : 'recipient address'}
            value={recipient}
            onChange={(e) => setRecipient(e.target.value)}
          />

          <div className="bridge-quote">
            <div>
              <span>Bridge fee</span>
              <span>
                {config ? `${(config.feeBps / 100).toFixed(2)}%` : '—'}
                {fee != null
                  ? ` · ${fee.toLocaleString(undefined, { maximumFractionDigits: 6 })} HERMES`
                  : ''}
              </span>
            </div>
            <div>
              <span>You receive</span>
              <span>
                {receiveAmount != null
                  ? `${receiveAmount.toLocaleString(undefined, { maximumFractionDigits: 6 })} ${dest?.wrapped ?? 'hHERMES'}`
                  : '—'}
              </span>
            </div>
            <div>
              <span>Est. time</span>
              <span>
                ~{config?.etaSeconds ?? 30}s · {threshold}/{relayers} relayers
              </span>
            </div>
          </div>

          <button
            className="btn-primary"
            style={{ width: '100%' }}
            onClick={() => void submit()}
            disabled={submitting}
          >
            {submitting ? 'Locking…' : `Bridge to ${dest?.name ?? '…'}`}
          </button>

          {feedback ? (
            <div
              className={`shell-banner shell-banner--${feedback.type}`}
              style={{ marginTop: 16 }}
            >
              <strong>{feedback.text}</strong>
            </div>
          ) : null}
        </div>

        <div className="artifact-card bridge-mechanics">
          <span className="artifact-kicker">How it works</span>
          <ol className="bridge-steps">
            <li>
              <strong>Lock</strong> — your HERMES is locked on Hermeschain and a{' '}
              <code>BridgeLockEvent</code> is emitted with the lock height and tx
              hash.
            </li>
            <li>
              <strong>Attest</strong> — {relayers} independent relayers watch the
              lock; once {threshold} of them sign the same event the attestation
              is valid.
            </li>
            <li>
              <strong>Mint</strong> — the {threshold}-of-{relayers} signature set
              authorizes minting wrapped HERMES to your recipient on the
              destination chain.
            </li>
          </ol>
          <p className="bridge-note">
            Burning the wrapped asset on the destination chain releases the locked
            HERMES back on Hermeschain, 1:1.
          </p>
        </div>
      </div>

      <div className="bridge-xfers">
        <div className="section-head" style={{ marginTop: 8 }}>
          <span className="kicker">Activity</span>
          <h3>Recent transfers</h3>
        </div>
        {transfers.length === 0 ? (
          <p className="hint">
            No bridge transfers yet. Lock some HERMES above to start one.
          </p>
        ) : (
          <div className="bridge-xfer-list">
            {transfers.map((t) => (
              <div key={t.id} className="bridge-xfer">
                <div className="bridge-xfer-top">
                  <span className="bridge-xfer-amount">
                    {t.amount} {t.asset}
                  </span>
                  <span className="bridge-xfer-route">
                    Hermeschain → {chainName(config, t.destinationChain)}
                  </span>
                  <span className={`bridge-status bridge-status--${t.status.phase}`}>
                    {t.status.label}
                  </span>
                </div>
                <div className="bridge-sig-row">
                  <div className="bridge-sig-bar">
                    <span style={{ width: `${Math.round(t.status.progress * 100)}%` }} />
                  </div>
                  <span className="bridge-sig-count">
                    {t.status.phase === 'locking'
                      ? `${t.status.confirmations}/${t.status.confirmationsRequired} conf`
                      : `${t.status.signatures}/${t.status.threshold} sigs`}
                  </span>
                </div>
                <div className="bridge-xfer-meta">
                  <span>height #{t.lockHeight.toLocaleString()}</span>
                  <span>lock {short(t.lockTxHash)}</span>
                  {t.destinationTxHash ? (
                    <span>mint {short(t.destinationTxHash)}</span>
                  ) : (
                    <span className="bridge-pending">mint pending</span>
                  )}
                  <span>→ {short(t.recipient)}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
