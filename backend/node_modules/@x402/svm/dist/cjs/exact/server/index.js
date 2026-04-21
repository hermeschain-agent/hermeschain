"use strict";
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/exact/server/index.ts
var server_exports = {};
__export(server_exports, {
  ExactSvmScheme: () => ExactSvmScheme,
  registerExactSvmScheme: () => registerExactSvmScheme
});
module.exports = __toCommonJS(server_exports);

// src/utils.ts
var import_kit = require("@solana/kit");
var import_token = require("@solana-program/token");
var import_token_2022 = require("@solana-program/token-2022");

// src/constants.ts
var USDC_MAINNET_ADDRESS = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
var USDC_DEVNET_ADDRESS = "4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU";
var USDC_TESTNET_ADDRESS = "4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU";
var SOLANA_MAINNET_CAIP2 = "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp";
var SOLANA_DEVNET_CAIP2 = "solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1";
var SOLANA_TESTNET_CAIP2 = "solana:4uhcVJyU9pJkvQyS88uRDiswHXSCkY3z";
var V1_TO_V2_NETWORK_MAP = {
  solana: SOLANA_MAINNET_CAIP2,
  "solana-devnet": SOLANA_DEVNET_CAIP2,
  "solana-testnet": SOLANA_TESTNET_CAIP2
};

// src/utils.ts
function normalizeNetwork(network) {
  if (network.includes(":")) {
    const supported = [SOLANA_MAINNET_CAIP2, SOLANA_DEVNET_CAIP2, SOLANA_TESTNET_CAIP2];
    if (!supported.includes(network)) {
      throw new Error(`Unsupported SVM network: ${network}`);
    }
    return network;
  }
  const caip2Network = V1_TO_V2_NETWORK_MAP[network];
  if (!caip2Network) {
    throw new Error(`Unsupported SVM network: ${network}`);
  }
  return caip2Network;
}
function getUsdcAddress(network) {
  const caip2Network = normalizeNetwork(network);
  switch (caip2Network) {
    case SOLANA_MAINNET_CAIP2:
      return USDC_MAINNET_ADDRESS;
    case SOLANA_DEVNET_CAIP2:
      return USDC_DEVNET_ADDRESS;
    case SOLANA_TESTNET_CAIP2:
      return USDC_TESTNET_ADDRESS;
    default:
      throw new Error(`No USDC address configured for network: ${network}`);
  }
}
function convertToTokenAmount(decimalAmount, decimals) {
  const amount = parseFloat(decimalAmount);
  if (isNaN(amount)) {
    throw new Error(`Invalid amount: ${decimalAmount}`);
  }
  const [intPart, decPart = ""] = String(amount).split(".");
  const paddedDec = decPart.padEnd(decimals, "0").slice(0, decimals);
  const tokenAmount = (intPart + paddedDec).replace(/^0+/, "") || "0";
  return tokenAmount;
}

// src/exact/server/scheme.ts
var ExactSvmScheme = class {
  constructor() {
    this.scheme = "exact";
    this.moneyParsers = [];
  }
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
  registerMoneyParser(parser) {
    this.moneyParsers.push(parser);
    return this;
  }
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
  async parsePrice(price, network) {
    if (typeof price === "object" && price !== null && "amount" in price) {
      if (!price.asset) {
        throw new Error(`Asset address must be specified for AssetAmount on network ${network}`);
      }
      return {
        amount: price.amount,
        asset: price.asset,
        extra: price.extra || {}
      };
    }
    const amount = this.parseMoneyToDecimal(price);
    for (const parser of this.moneyParsers) {
      const result = await parser(amount, network);
      if (result !== null) {
        return result;
      }
    }
    return this.defaultMoneyConversion(amount, network);
  }
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
  enhancePaymentRequirements(paymentRequirements, supportedKind, extensionKeys) {
    void extensionKeys;
    return Promise.resolve({
      ...paymentRequirements,
      extra: {
        ...paymentRequirements.extra,
        feePayer: supportedKind.extra?.feePayer
      }
    });
  }
  /**
   * Parse Money (string | number) to a decimal number.
   * Handles formats like "$1.50", "1.50", 1.50, etc.
   *
   * @param money - The money value to parse
   * @returns Decimal number
   */
  parseMoneyToDecimal(money) {
    if (typeof money === "number") {
      return money;
    }
    const cleanMoney = money.replace(/^\$/, "").trim();
    const amount = parseFloat(cleanMoney);
    if (isNaN(amount)) {
      throw new Error(`Invalid money format: ${money}`);
    }
    return amount;
  }
  /**
   * Default money conversion implementation.
   * Converts decimal amount to USDC on the specified network.
   *
   * @param amount - The decimal amount (e.g., 1.50)
   * @param network - The network to use
   * @returns The parsed asset amount in USDC
   */
  defaultMoneyConversion(amount, network) {
    const tokenAmount = convertToTokenAmount(amount.toString(), 6);
    return {
      amount: tokenAmount,
      asset: getUsdcAddress(network),
      extra: {}
    };
  }
};

// src/exact/server/register.ts
function registerExactSvmScheme(server, config = {}) {
  if (config.networks && config.networks.length > 0) {
    config.networks.forEach((network) => {
      server.register(network, new ExactSvmScheme());
    });
  } else {
    server.register("solana:*", new ExactSvmScheme());
  }
  return server;
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  ExactSvmScheme,
  registerExactSvmScheme
});
//# sourceMappingURL=index.js.map