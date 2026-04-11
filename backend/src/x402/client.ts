/**
 * x402 Client (Buyer Side) — Agent Payment Fetch Wrapper
 * Gives each network agent the ability to pay for external x402-gated APIs.
 *
 * Uses @x402/fetch with @x402/svm to automatically handle 402 responses
 * by signing Solana USDC transactions with the agent's keypair.
 */

import { Keypair } from '@solana/web3.js';
import { X402_CONFIG } from './types';
import { getAgentKeypair } from './wallets';

// Use require() with subpath exports (supported at runtime by Node.js 20+)
const { wrapFetchWithPayment } = require('@x402/fetch') as {
  wrapFetchWithPayment: (fetchFn: typeof fetch, client: any) => typeof fetch;
};

const { x402Client: X402ClientClass } = require('@x402/core/client') as {
  x402Client: new () => any;
};

const svmClient = require('@x402/svm/exact/client') as {
  registerExactSvmScheme: (client: any, config: { signer: any }) => any;
};

// Cache of payment-enabled fetch functions per agent
const fetchCache = new Map<string, typeof fetch>();

/**
 * Create a Solana TransactionSigner from a web3.js Keypair.
 * The @x402/svm expects a @solana/kit TransactionSigner interface.
 * We use createKeyPairSignerFromBytes from @solana/kit for this.
 */
async function createSolanaSignerFromKeypair(keypair: Keypair): Promise<any> {
  try {
    const { createKeyPairSignerFromBytes } = require('@solana/kit') as {
      createKeyPairSignerFromBytes: (bytes: Uint8Array, extractable?: boolean) => Promise<any>;
    };
    // @solana/kit expects the full 64-byte secret key (32 secret + 32 public)
    return await createKeyPairSignerFromBytes(keypair.secretKey, true);
  } catch (e) {
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
export async function createAgentFetcher(agentId: string): Promise<typeof fetch> {
  // Return cached fetcher if available
  const cached = fetchCache.get(agentId);
  if (cached) return cached;

  if (!X402_CONFIG.enabled) {
    console.log(`[x402] Client disabled — returning plain fetch for ${agentId}`);
    return globalThis.fetch;
  }

  try {
    const keypair = getAgentKeypair(agentId);
    const signer = await createSolanaSignerFromKeypair(keypair);

    const client = new X402ClientClass();
    svmClient.registerExactSvmScheme(client, { signer });

    const paymentFetch = wrapFetchWithPayment(globalThis.fetch, client);
    fetchCache.set(agentId, paymentFetch);

    console.log(`[x402] Client initialized for ${agentId}`);
    return paymentFetch;
  } catch (e) {
    console.error(`[x402] Failed to create fetcher for ${agentId}:`, e);
    return globalThis.fetch;
  }
}

/**
 * Clear the fetcher cache for an agent (e.g., if wallet is rotated)
 */
export function clearAgentFetcher(agentId: string): void {
  fetchCache.delete(agentId);
}

/**
 * Clear all cached fetchers
 */
export function clearAllFetchers(): void {
  fetchCache.clear();
}

/**
 * Check if an agent has a payment-enabled fetcher initialized
 */
export function hasAgentFetcher(agentId: string): boolean {
  return fetchCache.has(agentId);
}
