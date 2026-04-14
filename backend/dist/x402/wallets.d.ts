/**
 * Agent Wallet Management — Solana Keypairs
 * Each network agent gets a persistent Solana wallet for x402 payments.
 * Uses @solana/web3.js for keypair generation, stored in the network sql.js DB.
 */
import { Keypair } from '@solana/web3.js';
import type { AgentWallet } from './types';
export declare function setWalletDatabase(database: any): void;
/**
 * Initialize the agent_wallets table in the sql.js database
 */
export declare function initWalletTable(): void;
/**
 * Load existing wallet from DB or generate a new one for the given agent
 */
export declare function getOrCreateWallet(agentId: string): AgentWallet;
/**
 * Get the Solana Keypair object for an agent (for signing transactions)
 */
export declare function getAgentKeypair(agentId: string): Keypair;
/**
 * Get all agent wallets (public info only — no secret keys)
 */
export declare function getAllWallets(): Array<{
    agentId: string;
    publicKey: string;
    createdAt: string;
}>;
/**
 * Initialize wallets for a list of agent IDs
 */
export declare function initializeAgentWallets(agentIds: string[]): void;
/**
 * Log a payment event
 */
export declare function logPayment(entry: {
    endpoint: string;
    payerAddress: string;
    receiverAgentId: string;
    receiverAddress: string;
    amount: string;
    network: string;
    status: 'success' | 'failed';
}): void;
/**
 * Get recent payment logs
 */
export declare function getPaymentLogs(limit?: number): Array<{
    id: string;
    endpoint: string;
    payerAddress: string;
    receiverAgentId: string;
    receiverAddress: string;
    amount: string;
    network: string;
    timestamp: string;
    status: string;
}>;
/**
 * Save the database (call the parent saveDatabase function)
 * This is a no-op — the network.ts module handles periodic saves
 */
export declare function saveWalletDatabase(): void;
//# sourceMappingURL=wallets.d.ts.map