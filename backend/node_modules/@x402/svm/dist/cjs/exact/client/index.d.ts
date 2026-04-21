export { E as ExactSvmScheme } from '../../scheme-MoBRXFM8.js';
import { x402Client, SelectPaymentRequirements, PaymentPolicy } from '@x402/core/client';
import { Network } from '@x402/core/types';
import { C as ClientSvmSigner } from '../../signer-BMkbhFYE.js';
import '@solana/kit';

/**
 * Configuration options for registering SVM schemes to an x402Client
 */
interface SvmClientConfig {
    /**
     * The SVM signer to use for creating payment payloads
     */
    signer: ClientSvmSigner;
    /**
     * Optional payment requirements selector function
     */
    paymentRequirementsSelector?: SelectPaymentRequirements;
    /**
     * Optional policies to apply to the client
     */
    policies?: PaymentPolicy[];
    /**
     * Optional specific networks to register
     */
    networks?: Network[];
}
/**
 * Registers SVM payment schemes to an existing x402Client instance.
 *
 * @param client - The x402Client instance to register schemes to
 * @param config - Configuration for SVM client registration
 * @returns The client instance for chaining
 */
declare function registerExactSvmScheme(client: x402Client, config: SvmClientConfig): x402Client;

export { type SvmClientConfig, registerExactSvmScheme };
