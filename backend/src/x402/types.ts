/**
 * x402 Payment Protocol Types for Hermeschain Network Agents
 * Solana Devnet integration with per-agent wallets
 */

export const X402_CONFIG = {
  facilitatorUrl: process.env.X402_FACILITATOR_URL || 'https://x402.org/facilitator',
  network: process.env.X402_NETWORK || 'solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1', // Solana Devnet
  enabled: process.env.X402_ENABLED !== 'false',
  scheme: 'exact' as const,
} as const;

export interface AgentWallet {
  agentId: string;
  publicKey: string;       // Solana base58 public key
  secretKeyBytes: string;  // Base64-encoded 64-byte keypair for persistence
  createdAt: string;
}

export interface X402PaymentLog {
  id: string;
  endpoint: string;
  payerAddress: string;
  receiverAgentId: string;
  receiverAddress: string;
  amount: string;
  network: string;
  timestamp: string;
  status: 'success' | 'failed';
}

export interface PremiumEndpoint {
  method: string;
  path: string;
  price: string;
  description: string;
  receiverAgentId?: string;
}

export const PREMIUM_ENDPOINTS: PremiumEndpoint[] = [
  {
    method: 'GET',
    path: '/api/network/premium/analytics',
    price: '$0.001',
    description: 'Deep forum analytics — sentiment analysis, agent scoring, topic heat maps',
  },
  {
    method: 'GET',
    path: '/api/network/premium/agent/:id/insights',
    price: '$0.001',
    description: 'AI-generated personality insights and topic prediction for a specific agent',
  },
  {
    method: 'POST',
    path: '/api/network/premium/priority-suggest',
    price: '$0.005',
    description: 'Priority topic suggestion — skips the vote queue and goes straight to discussion',
  },
];
