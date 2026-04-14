"use strict";
/**
 * Agent Wallet Management — Solana Keypairs
 * Each network agent gets a persistent Solana wallet for x402 payments.
 * Uses @solana/web3.js for keypair generation, stored in the network sql.js DB.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.setWalletDatabase = setWalletDatabase;
exports.initWalletTable = initWalletTable;
exports.getOrCreateWallet = getOrCreateWallet;
exports.getAgentKeypair = getAgentKeypair;
exports.getAllWallets = getAllWallets;
exports.initializeAgentWallets = initializeAgentWallets;
exports.logPayment = logPayment;
exports.getPaymentLogs = getPaymentLogs;
exports.saveWalletDatabase = saveWalletDatabase;
const web3_js_1 = require("@solana/web3.js");
// In-memory cache of agent wallets
const walletCache = new Map();
// Reference to the sql.js database (injected from network.ts)
let db = null;
function setWalletDatabase(database) {
    db = database;
}
/**
 * Initialize the agent_wallets table in the sql.js database
 */
function initWalletTable() {
    if (!db)
        return;
    db.run(`
    CREATE TABLE IF NOT EXISTS agent_wallets (
      agent_id TEXT PRIMARY KEY,
      public_key TEXT NOT NULL,
      secret_key_bytes TEXT NOT NULL,
      created_at TEXT NOT NULL
    )
  `);
    db.run(`
    CREATE TABLE IF NOT EXISTS x402_payment_log (
      id TEXT PRIMARY KEY,
      endpoint TEXT NOT NULL,
      payer_address TEXT NOT NULL,
      receiver_agent_id TEXT NOT NULL,
      receiver_address TEXT NOT NULL,
      amount TEXT NOT NULL,
      network TEXT NOT NULL,
      timestamp TEXT NOT NULL,
      status TEXT NOT NULL
    )
  `);
    db.run(`CREATE INDEX IF NOT EXISTS idx_payments_timestamp ON x402_payment_log(timestamp)`);
    db.run(`CREATE INDEX IF NOT EXISTS idx_payments_receiver ON x402_payment_log(receiver_agent_id)`);
    console.log('[x402] Wallet tables initialized');
}
/**
 * Load existing wallet from DB or generate a new one for the given agent
 */
function getOrCreateWallet(agentId) {
    // Check cache first
    const cached = walletCache.get(agentId);
    if (cached)
        return cached;
    // Try loading from database
    if (db) {
        try {
            const stmt = db.prepare('SELECT * FROM agent_wallets WHERE agent_id = ?');
            stmt.bind([agentId]);
            if (stmt.step()) {
                const row = stmt.getAsObject();
                stmt.free();
                const wallet = {
                    agentId: row.agent_id,
                    publicKey: row.public_key,
                    secretKeyBytes: row.secret_key_bytes,
                    createdAt: row.created_at,
                };
                walletCache.set(agentId, wallet);
                return wallet;
            }
            stmt.free();
        }
        catch (e) {
            console.error(`[x402] Failed to load wallet for ${agentId}:`, e);
        }
    }
    // Generate new Solana keypair
    const keypair = web3_js_1.Keypair.generate();
    const wallet = {
        agentId,
        publicKey: keypair.publicKey.toBase58(),
        secretKeyBytes: Buffer.from(keypair.secretKey).toString('base64'),
        createdAt: new Date().toISOString(),
    };
    // Persist to database
    if (db) {
        try {
            db.run('INSERT OR REPLACE INTO agent_wallets (agent_id, public_key, secret_key_bytes, created_at) VALUES (?, ?, ?, ?)', [wallet.agentId, wallet.publicKey, wallet.secretKeyBytes, wallet.createdAt]);
        }
        catch (e) {
            console.error(`[x402] Failed to save wallet for ${agentId}:`, e);
        }
    }
    walletCache.set(agentId, wallet);
    console.log(`[x402] Generated wallet for ${agentId}: ${wallet.publicKey}`);
    return wallet;
}
/**
 * Get the Solana Keypair object for an agent (for signing transactions)
 */
function getAgentKeypair(agentId) {
    const wallet = getOrCreateWallet(agentId);
    const secretBytes = Buffer.from(wallet.secretKeyBytes, 'base64');
    return web3_js_1.Keypair.fromSecretKey(new Uint8Array(secretBytes));
}
/**
 * Get all agent wallets (public info only — no secret keys)
 */
function getAllWallets() {
    return Array.from(walletCache.values()).map(w => ({
        agentId: w.agentId,
        publicKey: w.publicKey,
        createdAt: w.createdAt,
    }));
}
/**
 * Initialize wallets for a list of agent IDs
 */
function initializeAgentWallets(agentIds) {
    for (const id of agentIds) {
        getOrCreateWallet(id);
    }
    console.log(`[x402] Initialized ${agentIds.length} agent wallets`);
}
/**
 * Log a payment event
 */
function logPayment(entry) {
    if (!db)
        return;
    const id = `pay-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    try {
        db.run(`INSERT INTO x402_payment_log (id, endpoint, payer_address, receiver_agent_id, receiver_address, amount, network, timestamp, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`, [id, entry.endpoint, entry.payerAddress, entry.receiverAgentId, entry.receiverAddress, entry.amount, entry.network, new Date().toISOString(), entry.status]);
    }
    catch (e) {
        console.error('[x402] Failed to log payment:', e);
    }
}
/**
 * Get recent payment logs
 */
function getPaymentLogs(limit = 50) {
    if (!db)
        return [];
    try {
        const results = db.exec(`SELECT * FROM x402_payment_log ORDER BY timestamp DESC LIMIT ${limit}`);
        if (!results.length || !results[0].values.length)
            return [];
        const columns = results[0].columns;
        return results[0].values.map((row) => {
            const obj = {};
            columns.forEach((col, i) => obj[col] = row[i]);
            return {
                id: obj.id,
                endpoint: obj.endpoint,
                payerAddress: obj.payer_address,
                receiverAgentId: obj.receiver_agent_id,
                receiverAddress: obj.receiver_address,
                amount: obj.amount,
                network: obj.network,
                timestamp: obj.timestamp,
                status: obj.status,
            };
        });
    }
    catch (e) {
        console.error('[x402] Failed to get payment logs:', e);
        return [];
    }
}
/**
 * Save the database (call the parent saveDatabase function)
 * This is a no-op — the network.ts module handles periodic saves
 */
function saveWalletDatabase() {
    // Handled by network.ts periodic save
}
//# sourceMappingURL=wallets.js.map