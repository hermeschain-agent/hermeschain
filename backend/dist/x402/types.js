"use strict";
/**
 * x402 Payment Protocol Types for Hermeschain Network Agents
 * Solana Devnet integration with per-agent wallets
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.PREMIUM_ENDPOINTS = exports.X402_CONFIG = void 0;
exports.X402_CONFIG = {
    facilitatorUrl: process.env.X402_FACILITATOR_URL || 'https://x402.org/facilitator',
    network: process.env.X402_NETWORK || 'solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1', // Solana Devnet
    enabled: process.env.X402_ENABLED !== 'false',
    scheme: 'exact',
};
exports.PREMIUM_ENDPOINTS = [
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
//# sourceMappingURL=types.js.map