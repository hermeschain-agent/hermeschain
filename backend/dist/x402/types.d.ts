/**
 * x402 Payment Protocol Types for Hermeschain Network Agents
 * Solana Devnet integration with per-agent wallets
 */
export declare const X402_CONFIG: {
    readonly facilitatorUrl: string;
    readonly network: string;
    readonly enabled: boolean;
    readonly scheme: "exact";
};
export interface AgentWallet {
    agentId: string;
    publicKey: string;
    secretKeyBytes: string;
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
export declare const PREMIUM_ENDPOINTS: PremiumEndpoint[];
//# sourceMappingURL=types.d.ts.map