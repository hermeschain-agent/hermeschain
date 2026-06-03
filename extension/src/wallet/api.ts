/**
 * Thin client for the Hermeschain wallet API. The extension is non-custodial,
 * so the backend only ever sees public addresses + signed transactions. Balance
 * and nonce come from the REAL on-chain account state (not the legacy custodial
 * wallet ledger), and sends are real signed transactions submitted to the pool.
 */
import { type ChainTx, fromWei } from '../crypto/keyring.ts';

const DEFAULT_BASE = 'https://hermeschain.xyz';

let apiBase = DEFAULT_BASE;
export function setApiBase(url: string): void {
  apiBase = url.replace(/\/$/, '');
}
export function getApiBase(): string {
  return apiBase;
}

export interface WalletSnapshot {
  address: string;
  /** on-chain balance in whole tokens (converted from wei) */
  balance: number;
  /** next nonce to use = on-chain account nonce */
  nonce: number;
  txCount: number;
}

async function json(res: Response): Promise<any> {
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data?.success === false) {
    throw new Error(data?.error || `request failed (${res.status})`);
  }
  return data;
}

/**
 * Read the on-chain account: balance (wei→tokens) + nonce. Returns zeros for an
 * address the chain hasn't seen yet (never 404s), so a fresh wallet shows 0.
 */
export async function fetchSnapshot(address: string): Promise<WalletSnapshot> {
  const res = await fetch(`${apiBase}/api/account/${encodeURIComponent(address)}`);
  const d = await json(res);
  const nonce = Number(d.nonce ?? 0);
  return { address, balance: fromWei(d.balance ?? '0'), nonce, txCount: nonce };
}

/** Submit a signed on-chain transaction. Returns the tx hash once pooled. */
export async function submitTransaction(tx: ChainTx): Promise<{ hash?: string }> {
  const d = await json(
    await fetch(`${apiBase}/api/transactions`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(tx),
    }),
  );
  return { hash: d.hash };
}

export async function claimFaucet(address: string): Promise<unknown> {
  return json(
    await fetch(`${apiBase}/api/wallet/faucet/claim`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ address }),
    }),
  );
}
