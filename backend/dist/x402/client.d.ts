/**
 * x402 Client (Buyer Side) — Agent Payment Fetch Wrapper
 * Gives each network agent the ability to pay for external x402-gated APIs.
 *
 * Uses @x402/fetch with @x402/svm to automatically handle 402 responses
 * by signing Solana USDC transactions with the agent's keypair.
 */
/**
 * Get a payment-enabled fetch function for a specific agent.
 * The returned fetch automatically handles x402 402 responses by
 * signing Solana transactions with the agent's wallet.
 *
 * @param agentId - The network agent ID
 * @returns A fetch function that handles x402 payments
 */
export declare function createAgentFetcher(agentId: string): Promise<typeof fetch>;
/**
 * Clear the fetcher cache for an agent (e.g., if wallet is rotated)
 */
export declare function clearAgentFetcher(agentId: string): void;
/**
 * Clear all cached fetchers
 */
export declare function clearAllFetchers(): void;
/**
 * Check if an agent has a payment-enabled fetcher initialized
 */
export declare function hasAgentFetcher(agentId: string): boolean;
//# sourceMappingURL=client.d.ts.map