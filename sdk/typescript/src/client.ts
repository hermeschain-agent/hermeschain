import type { ChainStatus, Receipt } from './types';

export interface ClientOpts {
  baseUrl?: string;
  apiKey?: string;
}

/**
 * HermesClient — thin wrapper over the REST API.
 */
export class HermesClient {
  readonly baseUrl: string;
  private readonly apiKey?: string;

  constructor(opts: ClientOpts = {}) {
    this.baseUrl = (opts.baseUrl || 'https://hermeschain.io').replace(/\/$/, '');
    this.apiKey = opts.apiKey;
  }

  private headers(): Record<string, string> {
    const h: Record<string, string> = { 'content-type': 'application/json' };
    if (this.apiKey) h['x-api-key'] = this.apiKey;
    return h;
  }

  async status(): Promise<ChainStatus> {
    return this.get<ChainStatus>('/api/status');
  }

  async getBalance(addr: string): Promise<string> {
    const r = await this.get<{ balanceRaw: string }>(`/api/account/${addr}`);
    return r.balanceRaw ?? '0';
  }

  async getNextNonce(addr: string): Promise<number> {
    const r = await this.get<{ nextNonce: number }>(`/api/account/${addr}/next-nonce`);
    return r.nextNonce;
  }

  async getReceipt(txHash: string): Promise<Receipt | null> {
    try {
      return await this.get<Receipt>(`/api/tx/${txHash}`);
    } catch {
      return null;
    }
  }

  async submitTx(tx: Record<string, any>): Promise<{ success: boolean; hash: string }> {
    return this.post('/api/transactions', tx);
  }

  private async get<T>(path: string): Promise<T> {
    const res = await fetch(this.baseUrl + path, { headers: this.headers() });
    if (!res.ok) throw new Error(`GET ${path}: ${res.status}`);
    return res.json() as Promise<T>;
  }

  private async post<T>(path: string, body: any): Promise<T> {
    const res = await fetch(this.baseUrl + path, {
      method: 'POST',
      headers: this.headers(),
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error(`POST ${path}: ${res.status}`);
    return res.json() as Promise<T>;
  }
}
