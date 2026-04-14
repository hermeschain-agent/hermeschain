import { SchemeNetworkClient, PaymentRequirements, PaymentPayload } from '@x402/core/types';
import { C as ClientSvmSigner, a as ClientSvmConfig } from './signer-BMkbhFYE.js';

/**
 * SVM client implementation for the Exact payment scheme.
 */
declare class ExactSvmScheme implements SchemeNetworkClient {
    private readonly signer;
    private readonly config?;
    readonly scheme = "exact";
    /**
     * Creates a new ExactSvmClient instance.
     *
     * @param signer - The SVM signer for client operations
     * @param config - Optional configuration with custom RPC URL
     * @returns ExactSvmClient instance
     */
    constructor(signer: ClientSvmSigner, config?: ClientSvmConfig | undefined);
    /**
     * Creates a payment payload for the Exact scheme.
     *
     * @param x402Version - The x402 protocol version
     * @param paymentRequirements - The payment requirements
     * @returns Promise resolving to a payment payload
     */
    createPaymentPayload(x402Version: number, paymentRequirements: PaymentRequirements): Promise<Pick<PaymentPayload, "x402Version" | "payload">>;
}

export { ExactSvmScheme as E };
