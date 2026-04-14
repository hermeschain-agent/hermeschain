/**
 * x402 Server (Seller Side) — Express Middleware
 * Protects premium network endpoints with Solana USDC micropayments.
 *
 * Uses @x402/express middleware with @x402/svm for Solana Devnet settlement.
 * Each premium endpoint routes payments to the relevant agent's wallet.
 */
import { Request, Response, NextFunction } from 'express';
/**
 * Initialize the x402 resource server with Solana Devnet facilitator
 */
export declare function initX402Server(): boolean;
/**
 * Build the route configuration for x402 premium endpoints.
 * Each endpoint's payTo is the receiving agent's Solana address.
 *
 * @param defaultAgentId - The default agent whose wallet receives payments
 */
export declare function buildRouteConfig(defaultAgentId?: string): Record<string, any>;
/**
 * Create Express middleware that gates premium endpoints with x402 payments.
 * Non-premium routes pass through untouched.
 */
export declare function createX402Middleware(defaultAgentId?: string): (req: Request, res: Response, next: NextFunction) => void;
/**
 * Manual x402 402 response for custom per-agent pricing.
 * Use this when the payTo address varies per request (e.g., agent-specific insights).
 */
export declare function send402Response(res: Response, agentId: string, price: string, description: string): void;
export declare function isX402Initialized(): boolean;
export declare function getResourceServer(): any;
//# sourceMappingURL=server.d.ts.map