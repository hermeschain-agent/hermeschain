"use strict";
/**
 * x402 Client (Buyer Side) — Agent Payment Fetch Wrapper
 * Gives each network agent the ability to pay for external x402-gated APIs.
 *
 * Uses @x402/fetch with @x402/svm to automatically handle 402 responses
 * by signing Solana USDC transactions with the agent's keypair.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.createAgentFetcher = createAgentFetcher;
exports.clearAgentFetcher = clearAgentFetcher;
exports.clearAllFetchers = clearAllFetchers;
exports.hasAgentFetcher = hasAgentFetcher;
const types_1 = require("./types");
const wallets_1 = require("./wallets");
// Use require() with subpath exports (supported at runtime by Node.js 20+)
const { wrapFetchWithPayment } = require('@x402/fetch');
const { x402Client: X402ClientClass } = require('@x402/core/client');
const svmClient = require('@x402/svm/exact/client');
// Cache of payment-enabled fetch functions per agent
const fetchCache = new Map();
/**
 * Create a Solana TransactionSigner from a web3.js Keypair.
 * The @x402/svm expects a @solana/kit TransactionSigner interface.
 * We use createKeyPairSignerFromBytes from @solana/kit for this.
 */
async function createSolanaSignerFromKeypair(keypair) {
    try {
        const { createKeyPairSignerFromBytes } = require('@solana/kit');
        // @solana/kit expects the full 64-byte secret key (32 secret + 32 public)
        return await createKeyPairSignerFromBytes(keypair.secretKey, true);
    }
    catch (e) {
        console.error('[x402] Failed to create Solana signer:', e);
        throw e;
    }
}
/**
 * Get a payment-enabled fetch function for a specific agent.
 * The returned fetch automatically handles x402 402 responses by
 * signing Solana transactions with the agent's wallet.
 *
 * @param agentId - The network agent ID
 * @returns A fetch function that handles x402 payments
 */
async function createAgentFetcher(agentId) {
    // Return cached fetcher if available
    const cached = fetchCache.get(agentId);
    if (cached)
        return cached;
    if (!types_1.X402_CONFIG.enabled) {
        console.log(`[x402] Client disabled — returning plain fetch for ${agentId}`);
        return globalThis.fetch;
    }
    try {
        const keypair = (0, wallets_1.getAgentKeypair)(agentId);
        const signer = await createSolanaSignerFromKeypair(keypair);
        const client = new X402ClientClass();
        svmClient.registerExactSvmScheme(client, { signer });
        const paymentFetch = wrapFetchWithPayment(globalThis.fetch, client);
        fetchCache.set(agentId, paymentFetch);
        console.log(`[x402] Client initialized for ${agentId}`);
        return paymentFetch;
    }
    catch (e) {
        console.error(`[x402] Failed to create fetcher for ${agentId}:`, e);
        return globalThis.fetch;
    }
}
/**
 * Clear the fetcher cache for an agent (e.g., if wallet is rotated)
 */
function clearAgentFetcher(agentId) {
    fetchCache.delete(agentId);
}
/**
 * Clear all cached fetchers
 */
function clearAllFetchers() {
    fetchCache.clear();
}
/**
 * Check if an agent has a payment-enabled fetcher initialized
 */
function hasAgentFetcher(agentId) {
    return fetchCache.has(agentId);
}
//# sourceMappingURL=client.js.map