import { SchemeNetworkClient, PaymentRequirements, PaymentPayload, Network } from '@x402/core/types';
import { C as ClientSvmSigner, a as ClientSvmConfig } from '../../../signer-BMkbhFYE.mjs';
import '@solana/kit';

/**
 * SVM client implementation for the Exact payment scheme (V1).
 */
declare class ExactSvmSchemeV1 implements SchemeNetworkClient {
    private readonly signer;
    private readonly config?;
    readonly scheme = "exact";
    /**
     * Creates a new ExactSvmClientV1 instance.
     *
     * @param signer - The SVM signer for client operations
     * @param config - Optional configuration with custom RPC URL
     * @returns ExactSvmClientV1 instance
     */
    constructor(signer: ClientSvmSigner, config?: ClientSvmConfig | undefined);
    /**
     * Creates a payment payload for the Exact scheme (V1).
     *
     * @param x402Version - The x402 protocol version
     * @param paymentRequirements - The payment requirements
     * @returns Promise resolving to a payment payload
     */
    createPaymentPayload(x402Version: number, paymentRequirements: PaymentRequirements): Promise<Pick<PaymentPayload, "x402Version" | "payload"> & {
        scheme: string;
        network: Network;
    }>;
}

export { ExactSvmSchemeV1 };
