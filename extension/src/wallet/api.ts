/**
 * Thin client for the Hermeschain wallet API. The extension is non-custodial,
 * so the backend only ever sees public addresses + signed payloads.
 */
import type { SignedSend } from '../crypto/keyring.ts';

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
  balance: number;
  /** next nonce to use = sender tx_count */
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

/** Register an address so the backend tracks it (watch-only until first credit). */
export async function importAddress(address: string): Promise<void> {
  await json(
    await fetch(`${apiBase}/api/wallet/import`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ address }),
    }),
  );
}

export async function fetchSnapshot(address: string): Promise<WalletSnapshot> {
  const res = await fetch(`${apiBase}/api/wallet/address/${encodeURIComponent(address)}`);
  const d = await json(res);
  const txCount = Number(d.txCount ?? d.tx_count ?? 0);
  return { address, balance: Number(d.balance ?? 0), nonce: txCount, txCount };
}

export async function submitSend(signed: SignedSend): Promise<{ txHash?: string }> {
  return json(
    await fetch(`${apiBase}/api/wallet/send`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(signed),
    }),
  );
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
