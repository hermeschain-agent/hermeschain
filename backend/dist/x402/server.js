"use strict";
/**
 * x402 Server (Seller Side) — Express Middleware
 * Protects premium network endpoints with Solana USDC micropayments.
 *
 * Uses @x402/express middleware with @x402/svm for Solana Devnet settlement.
 * Each premium endpoint routes payments to the relevant agent's wallet.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.initX402Server = initX402Server;
exports.buildRouteConfig = buildRouteConfig;
exports.createX402Middleware = createX402Middleware;
exports.send402Response = send402Response;
exports.isX402Initialized = isX402Initialized;
exports.getResourceServer = getResourceServer;
const types_1 = require("./types");
const wallets_1 = require("./wallets");
// Use require() with subpath exports (supported at runtime by Node.js 20+)
// TypeScript moduleResolution:"node" can't resolve these at compile time, but skipLibCheck handles it
const expressModule = require('@x402/express');
const { paymentMiddleware } = expressModule;
const coreServer = require('@x402/core/server');
const svmServer = require('@x402/svm/exact/server');
let resourceServer = null;
let isInitialized = false;
/**
 * Initialize the x402 resource server with Solana Devnet facilitator
 */
function initX402Server() {
    if (!types_1.X402_CONFIG.enabled) {
        console.log('[x402] Server disabled via X402_ENABLED=false');
        return false;
    }
    try {
        const facilitator = new coreServer.HTTPFacilitatorClient({
            url: types_1.X402_CONFIG.facilitatorUrl,
        });
        resourceServer = new coreServer.x402ResourceServer(facilitator);
        svmServer.registerExactSvmScheme(resourceServer);
        isInitialized = true;
        console.log(`[x402] Server initialized — facilitator: ${types_1.X402_CONFIG.facilitatorUrl}`);
        console.log(`[x402] Network: ${types_1.X402_CONFIG.network}`);
        return true;
    }
    catch (e) {
        console.error('[x402] Failed to initialize server:', e);
        return false;
    }
}
/**
 * Build the route configuration for x402 premium endpoints.
 * Each endpoint's payTo is the receiving agent's Solana address.
 *
 * @param defaultAgentId - The default agent whose wallet receives payments
 */
function buildRouteConfig(defaultAgentId = 'open-main') {
    const routes = {};
    for (const endpoint of types_1.PREMIUM_ENDPOINTS) {
        const routeKey = `${endpoint.method} ${endpoint.path}`;
        const receiverAgentId = endpoint.receiverAgentId || defaultAgentId;
        const receiverWallet = (0, wallets_1.getOrCreateWallet)(receiverAgentId);
        routes[routeKey] = {
            description: endpoint.description,
            resource: {
                scheme: types_1.X402_CONFIG.scheme,
                network: types_1.X402_CONFIG.network,
                payTo: receiverWallet.publicKey,
                price: endpoint.price,
            },
        };
    }
    return routes;
}
/**
 * Create Express middleware that gates premium endpoints with x402 payments.
 * Non-premium routes pass through untouched.
 */
function createX402Middleware(defaultAgentId = 'open-main') {
    if (!isInitialized || !resourceServer) {
        // If x402 is not initialized, return a middleware that responds with 503 for premium routes
        return (req, res, next) => {
            const isPremium = types_1.PREMIUM_ENDPOINTS.some(ep => req.method === ep.method && req.path.startsWith('/premium/'));
            if (isPremium) {
                return res.status(503).json({
                    error: 'x402 payment system not initialized',
                    x402Enabled: false,
                });
            }
            next();
        };
    }
    const routes = buildRouteConfig(defaultAgentId);
    try {
        return paymentMiddleware(routes, resourceServer);
    }
    catch (e) {
        console.error('[x402] Failed to create middleware:', e);
        return (_req, _res, next) => next();
    }
}
/**
 * Manual x402 402 response for custom per-agent pricing.
 * Use this when the payTo address varies per request (e.g., agent-specific insights).
 */
function send402Response(res, agentId, price, description) {
    const wallet = (0, wallets_1.getOrCreateWallet)(agentId);
    const paymentRequired = {
        x402Version: 2,
        accepts: [
            {
                scheme: types_1.X402_CONFIG.scheme,
                network: types_1.X402_CONFIG.network,
                payTo: wallet.publicKey,
                price,
            },
        ],
        description,
    };
    res.status(402)
        .set('X-Payment-Required', Buffer.from(JSON.stringify(paymentRequired)).toString('base64'))
        .json({
        error: 'Payment Required',
        x402: paymentRequired,
    });
}
function isX402Initialized() {
    return isInitialized;
}
function getResourceServer() {
    return resourceServer;
}
//# sourceMappingURL=server.js.map