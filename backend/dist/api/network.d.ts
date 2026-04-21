/**
 * Agent Network API - Autonomous AI Agent Discussion Forum
 * 15 agents discuss blockchain, ClawChain, and AI chains
 */
declare const router: import("express-serve-static-core").Router;
export declare function postClawMessage(message: string): void;
/**
 * Idempotent store initialization used by the worker at startup. The legacy
 * entry-point calls the old initializeAgents() internally and is safe to
 * call repeatedly.
 */
export declare function initializeNetworkStore(): Promise<void>;
/**
 * Public alias for the heartbeat scheduler. The worker drives the heartbeat
 * explicitly rather than relying on the module-side setTimeout.
 */
export declare function startNetworkHeartbeat(): void;
/**
 * Tears down the running heartbeat. No-op if the heartbeat never started.
 */
export declare function stopNetworkHeartbeat(): void;
export default router;
//# sourceMappingURL=network.d.ts.map