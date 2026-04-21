import { TransactionSigner, MessagePartialSigner, RpcDevnet, SolanaRpcApiDevnet, RpcTestnet, SolanaRpcApiTestnet, RpcMainnet, SolanaRpcApiMainnet, Address } from '@solana/kit';

/**
 * Client-side signer for creating and signing Solana transactions
 * This is a wrapper around TransactionSigner from @solana/kit
 */
type ClientSvmSigner = TransactionSigner;
/**
 * Configuration for client operations
 */
type ClientSvmConfig = {
    /**
     * Optional custom RPC URL for the client to use
     */
    rpcUrl?: string;
};
/**
 * RPC client type from @solana/kit
 * Can be devnet, testnet, or mainnet RPC client
 */
type FacilitatorRpcClient = RpcDevnet<SolanaRpcApiDevnet> | RpcTestnet<SolanaRpcApiTestnet> | RpcMainnet<SolanaRpcApiMainnet>;
/**
 * Minimal facilitator signer interface for SVM operations.
 * Supports multiple signers for load balancing and high availability.
 * All implementation details (RPC clients, key management, signature handling) are hidden.
 */
type FacilitatorSvmSigner = {
    /**
     * Get all addresses this facilitator can use as fee payers
     * Enables dynamic address selection for load balancing and key rotation
     *
     * @returns Array of addresses available for signing
     */
    getAddresses(): readonly Address[];
    /**
     * Sign a partially-signed transaction with the signer matching feePayer
     * Transaction is decoded, signed, and re-encoded internally
     *
     * @param transaction - Base64 encoded partially-signed transaction
     * @param feePayer - Fee payer address (determines which signer to use)
     * @param network - CAIP-2 network identifier
     * @returns Base64 encoded fully-signed transaction
     * @throws Error if no signer exists for feePayer or signing fails
     */
    signTransaction(transaction: string, feePayer: Address, network: string): Promise<string>;
    /**
     * Simulate a signed transaction to verify it would succeed
     * Implementation manages RPC client selection and simulation details
     *
     * @param transaction - Base64 encoded signed transaction
     * @param network - CAIP-2 network identifier
     * @throws Error if simulation fails
     */
    simulateTransaction(transaction: string, network: string): Promise<void>;
    /**
     * Send a signed transaction to the network
     * Implementation manages RPC client selection and sending details
     *
     * @param transaction - Base64 encoded signed transaction
     * @param network - CAIP-2 network identifier
     * @returns Transaction signature
     * @throws Error if send fails
     */
    sendTransaction(transaction: string, network: string): Promise<string>;
    /**
     * Wait for transaction confirmation
     * Allows signer to implement custom retry logic, timeouts, and confirmation strategies
     *
     * @param signature - Transaction signature to confirm
     * @param network - CAIP-2 network identifier
     * @returns Promise that resolves when transaction is confirmed
     * @throws Error if confirmation fails or times out
     */
    confirmTransaction(signature: string, network: string): Promise<void>;
};
/**
 * Convert a signer to ClientSvmSigner (identity function for type safety)
 *
 * @param signer - The signer to convert
 * @returns The signer as ClientSvmSigner
 */
declare function toClientSvmSigner(signer: ClientSvmSigner): ClientSvmSigner;
/**
 * RPC configuration for the facilitator
 * Can be a single RPC (all networks), a network mapping, or config options
 */
type FacilitatorRpcConfig = FacilitatorRpcClient | Record<string, FacilitatorRpcClient> | {
    defaultRpcUrl?: string;
};
/**
 * Create a FacilitatorSvmSigner from a TransactionSigner and optional RPC config
 *
 * @param signer - The TransactionSigner (e.g., from createKeyPairSignerFromBytes)
 * @param rpcConfig - Optional RPC configuration (single RPC, per-network map, or config)
 * @returns A complete FacilitatorSvmSigner
 *
 * @example
 * ```ts
 * import { createKeyPairSignerFromBytes, createSolanaRpc, devnet } from "@solana/kit";
 *
 * // Option 1: No RPC - use defaults (SIMPLEST)
 * const keypair = await createKeyPairSignerFromBytes(privateKeyBytes);
 * const facilitator = toFacilitatorSvmSigner(keypair);
 *
 * // Option 2: Single RPC for all networks
 * const rpc = createSolanaRpc(devnet("https://api.devnet.solana.com"));
 * const facilitator = toFacilitatorSvmSigner(keypair, rpc);
 *
 * // Option 3: Per-network RPC (FLEXIBLE)
 * const facilitator = toFacilitatorSvmSigner(keypair, {
 *   [SOLANA_MAINNET_CAIP2]: myQuickNodeRpc,
 *   // Devnet/testnet use defaults
 * });
 *
 * // Option 4: Custom default RPC URL
 * const facilitator = toFacilitatorSvmSigner(keypair, {
 *   defaultRpcUrl: "https://my-rpc.com"
 * });
 * ```
 */
declare function toFacilitatorSvmSigner(signer: TransactionSigner & MessagePartialSigner, rpcConfig?: FacilitatorRpcConfig): FacilitatorSvmSigner;

export { type ClientSvmSigner as C, type FacilitatorSvmSigner as F, type ClientSvmConfig as a, toFacilitatorSvmSigner as b, type FacilitatorRpcClient as c, type FacilitatorRpcConfig as d, toClientSvmSigner as t };
