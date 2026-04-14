import { SchemeNetworkServer, MoneyParser, Price, Network, AssetAmount, PaymentRequirements } from '@x402/core/types';
import { x402ResourceServer } from '@x402/core/server';

/**
 * SVM server implementation for the Exact payment scheme.
 */
declare class ExactSvmScheme implements SchemeNetworkServer {
    readonly scheme = "exact";
    private moneyParsers;
    /**
     * Register a custom money parser in the parser chain.
     * Multiple parsers can be registered - they will be tried in registration order.
     * Each parser receives a decimal amount (e.g., 1.50 for $1.50).
     * If a parser returns null, the next parser in the chain will be tried.
     * The default parser is always the final fallback.
     *
     * @param parser - Custom function to convert amount to AssetAmount (or null to skip)
     * @returns The service instance for chaining
     */
    registerMoneyParser(parser: MoneyParser): ExactSvmScheme;
    /**
     * Parses a price into an asset amount.
     * If price is already an AssetAmount, returns it directly.
     * If price is Money (string | number), parses to decimal and tries custom parsers.
     * Falls back to default conversion if all custom parsers return null.
     *
     * @param price - The price to parse
     * @param network - The network to use
     * @returns Promise that resolves to the parsed asset amount
     */
    parsePrice(price: Price, network: Network): Promise<AssetAmount>;
    /**
     * Build payment requirements for this scheme/network combination
     *
     * @param paymentRequirements - The base payment requirements
     * @param supportedKind - The supported kind configuration
     * @param supportedKind.x402Version - The x402 protocol version
     * @param supportedKind.scheme - The payment scheme
     * @param supportedKind.network - The network identifier
     * @param supportedKind.extra - Extra metadata including feePayer address
     * @param extensionKeys - Extension keys supported by the facilitator
     * @returns Enhanced payment requirements with feePayer in extra
     */
    enhancePaymentRequirements(paymentRequirements: PaymentRequirements, supportedKind: {
        x402Version: number;
        scheme: string;
        network: Network;
        extra?: Record<string, unknown>;
    }, extensionKeys: string[]): Promise<PaymentRequirements>;
    /**
     * Parse Money (string | number) to a decimal number.
     * Handles formats like "$1.50", "1.50", 1.50, etc.
     *
     * @param money - The money value to parse
     * @returns Decimal number
     */
    private parseMoneyToDecimal;
    /**
     * Default money conversion implementation.
     * Converts decimal amount to USDC on the specified network.
     *
     * @param amount - The decimal amount (e.g., 1.50)
     * @param network - The network to use
     * @returns The parsed asset amount in USDC
     */
    private defaultMoneyConversion;
}

/**
 * Configuration options for registering SVM schemes to an x402ResourceServer
 */
interface SvmResourceServerConfig {
    /**
     * Optional specific networks to register
     */
    networks?: Network[];
}
/**
 * Registers SVM payment schemes to an existing x402ResourceServer instance.
 *
 * @param server - The x402ResourceServer instance to register schemes to
 * @param config - Configuration for SVM resource server registration
 * @returns The server instance for chaining
 */
declare function registerExactSvmScheme(server: x402ResourceServer, config?: SvmResourceServerConfig): x402ResourceServer;

export { ExactSvmScheme, type SvmResourceServerConfig, registerExactSvmScheme };
