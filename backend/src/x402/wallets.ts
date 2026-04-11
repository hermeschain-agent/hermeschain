/**
 * Agent Wallet Management — Solana Keypairs
 * Each network agent gets a persistent Solana wallet for x402 payments.
 * Uses @solana/web3.js for keypair generation, stored in the network sql.js DB.
 */

import { Keypair } from '@solana/web3.js';
import type { AgentWallet } from './types';

// In-memory cache of agent wallets
const walletCache = new Map<string, AgentWallet>();

// Reference to the sql.js database (injected from network.ts)
let db: any = null;

export function setWalletDatabase(database: any): void {
  db = database;
}

/**
 * Initialize the agent_wallets table in the sql.js database
 */
export function initWalletTable(): void {
  if (!db) return;
  db.run(`
    CREATE TABLE IF NOT EXISTS agent_wallets (
      agent_id TEXT PRIMARY KEY,
      public_key TEXT NOT NULL,
      secret_key_bytes TEXT NOT NULL,
      created_at TEXT NOT NULL
    )
  `);
  db.run(`
    CREATE TABLE IF NOT EXISTS x402_payment_log (
      id TEXT PRIMARY KEY,
      endpoint TEXT NOT NULL,
      payer_address TEXT NOT NULL,
      receiver_agent_id TEXT NOT NULL,
      receiver_address TEXT NOT NULL,
      amount TEXT NOT NULL,
      network TEXT NOT NULL,
      timestamp TEXT NOT NULL,
      status TEXT NOT NULL
    )
  `);
  db.run(`CREATE INDEX IF NOT EXISTS idx_payments_timestamp ON x402_payment_log(timestamp)`);
  db.run(`CREATE INDEX IF NOT EXISTS idx_payments_receiver ON x402_payment_log(receiver_agent_id)`);
  console.log('[x402] Wallet tables initialized');
}

/**
 * Load existing wallet from DB or generate a new one for the given agent
 */
export function getOrCreateWallet(agentId: string): AgentWallet {
  // Check cache first
  const cached = walletCache.get(agentId);
  if (cached) return cached;

  // Try loading from database
  if (db) {
    try {
      const stmt = db.prepare('SELECT * FROM agent_wallets WHERE agent_id = ?');
      stmt.bind([agentId]);
      if (stmt.step()) {
        const row = stmt.getAsObject();
        stmt.free();
        const wallet: AgentWallet = {
          agentId: row.agent_id as string,
          publicKey: row.public_key as string,
          secretKeyBytes: row.secret_key_bytes as string,
          createdAt: row.created_at as string,
        };
        walletCache.set(agentId, wallet);
        return wallet;
      }
      stmt.free();
    } catch (e) {
      console.error(`[x402] Failed to load wallet for ${agentId}:`, e);
    }
  }

  // Generate new Solana keypair
  const keypair = Keypair.generate();
  const wallet: AgentWallet = {
    agentId,
    publicKey: keypair.publicKey.toBase58(),
    secretKeyBytes: Buffer.from(keypair.secretKey).toString('base64'),
    createdAt: new Date().toISOString(),
  };

  // Persist to database
  if (db) {
    try {
      db.run(
        'INSERT OR REPLACE INTO agent_wallets (agent_id, public_key, secret_key_bytes, created_at) VALUES (?, ?, ?, ?)',
        [wallet.agentId, wallet.publicKey, wallet.secretKeyBytes, wallet.createdAt]
      );
    } catch (e) {
      console.error(`[x402] Failed to save wallet for ${agentId}:`, e);
    }
  }

  walletCache.set(agentId, wallet);
  console.log(`[x402] Generated wallet for ${agentId}: ${wallet.publicKey}`);
  return wallet;
}

/**
 * Get the Solana Keypair object for an agent (for signing transactions)
 */
export function getAgentKeypair(agentId: string): Keypair {
  const wallet = getOrCreateWallet(agentId);
  const secretBytes = Buffer.from(wallet.secretKeyBytes, 'base64');
  return Keypair.fromSecretKey(new Uint8Array(secretBytes));
}

/**
 * Get all agent wallets (public info only — no secret keys)
 */
export function getAllWallets(): Array<{ agentId: string; publicKey: string; createdAt: string }> {
  return Array.from(walletCache.values()).map(w => ({
    agentId: w.agentId,
    publicKey: w.publicKey,
    createdAt: w.createdAt,
  }));
}

/**
 * Initialize wallets for a list of agent IDs
 */
export function initializeAgentWallets(agentIds: string[]): void {
  for (const id of agentIds) {
    getOrCreateWallet(id);
  }
  console.log(`[x402] Initialized ${agentIds.length} agent wallets`);
}

/**
 * Log a payment event
 */
export function logPayment(entry: {
  endpoint: string;
  payerAddress: string;
  receiverAgentId: string;
  receiverAddress: string;
  amount: string;
  network: string;
  status: 'success' | 'failed';
}): void {
  if (!db) return;
  const id = `pay-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  try {
    db.run(
      `INSERT INTO x402_payment_log (id, endpoint, payer_address, receiver_agent_id, receiver_address, amount, network, timestamp, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, entry.endpoint, entry.payerAddress, entry.receiverAgentId, entry.receiverAddress, entry.amount, entry.network, new Date().toISOString(), entry.status]
    );
  } catch (e) {
    console.error('[x402] Failed to log payment:', e);
  }
}

/**
 * Get recent payment logs
 */
export function getPaymentLogs(limit: number = 50): Array<{
  id: string;
  endpoint: string;
  payerAddress: string;
  receiverAgentId: string;
  receiverAddress: string;
  amount: string;
  network: string;
  timestamp: string;
  status: string;
}> {
  if (!db) return [];
  try {
    const results = db.exec(`SELECT * FROM x402_payment_log ORDER BY timestamp DESC LIMIT ${limit}`);
    if (!results.length || !results[0].values.length) return [];
    const columns = results[0].columns;
    return results[0].values.map((row: unknown[]) => {
      const obj: Record<string, unknown> = {};
      columns.forEach((col: string, i: number) => obj[col] = row[i]);
      return {
        id: obj.id as string,
        endpoint: obj.endpoint as string,
        payerAddress: obj.payer_address as string,
        receiverAgentId: obj.receiver_agent_id as string,
        receiverAddress: obj.receiver_address as string,
        amount: obj.amount as string,
        network: obj.network as string,
        timestamp: obj.timestamp as string,
        status: obj.status as string,
      };
    });
  } catch (e) {
    console.error('[x402] Failed to get payment logs:', e);
    return [];
  }
}

/**
 * Save the database (call the parent saveDatabase function)
 * This is a no-op — the network.ts module handles periodic saves
 */
export function saveWalletDatabase(): void {
  // Handled by network.ts periodic save
}
