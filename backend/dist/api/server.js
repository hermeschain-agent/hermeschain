"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.io = void 0;
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const http_1 = __importDefault(require("http"));
const path_1 = __importDefault(require("path"));
const fs_1 = __importDefault(require("fs"));
const socket_io_1 = require("socket.io");
const Chain_1 = require("../blockchain/Chain");
const TransactionPool_1 = require("../blockchain/TransactionPool");
const BlockProducer_1 = require("../blockchain/BlockProducer");
const ValidatorManager_1 = require("../validators/ValidatorManager");
const EventBus_1 = require("../events/EventBus");
const StateManager_1 = require("../blockchain/StateManager");
const db_1 = require("../database/db");
const schema_1 = require("../database/schema");
const migrations_1 = require("../database/migrations");
const hermesClient_1 = require("../llm/hermesClient");
const dotenv = __importStar(require("dotenv"));
dotenv.config();
// Global Socket.io instance for real-time updates
exports.io = null;
async function main() {
    const hermesConfig = (0, hermesClient_1.getHermesConfigStatus)();
    console.log('[INIT] Starting HERMESCHAIN — powered by Nous Hermes\n');
    console.log('[ENV] Environment check:');
    console.log(`   DATABASE_URL:       ${process.env.DATABASE_URL ? '[OK]' : '[--]'}`);
    console.log(`   REDIS_URL:          ${process.env.REDIS_URL ? '[OK]' : '[--]'}`);
    console.log(`   LLM_PROVIDER:       ${hermesConfig.provider}`);
    console.log(`   ANTHROPIC_API_KEY:  ${hermesConfig.configured ? '[OK]' : '[--]'}`);
    console.log(`   HERMES_MODEL:       ${hermesConfig.model}`);
    console.log(`   AGENT_ROLE:         ${process.env.AGENT_ROLE === 'worker' ? 'worker' : 'web'}\n`);
    try {
        // Connect to database
        const connected = await db_1.db.connect();
        if (connected) {
            // Create tables if they don't exist (legacy schema).
            await db_1.db.exec(schema_1.createTables);
            // Apply any pending NNNN_*.sql migrations in lexicographic order.
            // Idempotent; tracked in schema_migrations. Future schema changes
            // go through this runner rather than editing schema.ts inline.
            try {
                await (0, migrations_1.applyPendingMigrations)();
            }
            catch (err) {
                console.error('[MIGRATIONS] Migration failed — halting boot:', err?.message || err);
                throw err;
            }
            console.log('[DB] PostgreSQL database ready\n');
            // Pre-warm Redis with hot reads (TASK-328). Off in dev unless
            // explicitly enabled; on by default in production.
            const warmEnabled = process.env.CACHE_WARMER_ENABLED ??
                (process.env.NODE_ENV === 'production' ? 'true' : 'false');
            if (warmEnabled === 'true') {
                const { warmCache } = await Promise.resolve().then(() => __importStar(require('../database/cacheWarmer')));
                warmCache().catch((err) => {
                    console.warn('[CACHE WARMER] failed (non-fatal):', err?.message || err);
                });
            }
        }
        else {
            console.log('[DB] Running without persistent database\n');
        }
    }
    catch (error) {
        console.error('[DB] Database setup warning:', error);
        console.log('Continuing with in-memory fallback...\n');
    }
    const eventBus = EventBus_1.EventBus.getInstance();
    // Cross-replica event bridge (TASK-330). Off when REDIS_URL absent or
    // explicitly disabled. Replicas converge on the same SSE stream.
    if (process.env.REDIS_URL && process.env.REDIS_BRIDGE_ENABLED !== 'false') {
        const { attachRedisBridge } = await Promise.resolve().then(() => __importStar(require('../events/RedisBridge')));
        attachRedisBridge(eventBus, process.env.REDIS_URL);
    }
    const chain = new Chain_1.Chain();
    const txPool = new TransactionPool_1.TransactionPool();
    const validatorManager = new ValidatorManager_1.ValidatorManager();
    const blockProducer = new BlockProducer_1.BlockProducer(chain, txPool, validatorManager, eventBus);
    await chain.initialize();
    await txPool.initialize();
    await StateManager_1.stateManager.initialize();
    await validatorManager.initialize();
    // Late-inject the pool so Chain can call evictInvalid + readmitOrphaned
    // from reorg paths without a module-level import cycle.
    chain.setTransactionPool(txPool);
    global.transactionPool = txPool;
    console.log('[STATE] Initial state loaded:');
    console.log(`   State Root: ${StateManager_1.stateManager.getStateRoot().substring(0, 20)}...`);
    console.log(`   Total Supply: ${StateManager_1.stateManager.formatBalance(StateManager_1.stateManager.getTotalSupply())}`);
    console.log(`   Circulating: ${StateManager_1.stateManager.formatBalance(StateManager_1.stateManager.getCirculatingSupply())}\n`);
    const app = (0, express_1.default)();
    // CORS allowlist via env (TASK-145). Comma-separated origins; default open.
    const corsOrigins = (process.env.CORS_ORIGINS || '').split(',').map((s) => s.trim()).filter(Boolean);
    if (corsOrigins.length > 0) {
        app.use((0, cors_1.default)({
            origin: (origin, cb) => {
                if (!origin || corsOrigins.includes(origin))
                    return cb(null, true);
                cb(new Error(`origin ${origin} not allowed by CORS`));
            },
            credentials: true,
        }));
        console.log(`[CORS] allowlist active (${corsOrigins.length} origin(s))`);
    }
    else {
        app.use((0, cors_1.default)());
    }
    // Cap JSON body to 1MB (TASK-340) — DoS defense.
    app.use(express_1.default.json({ limit: process.env.JSON_BODY_LIMIT || '1mb' }));
    // HTTPS-only redirect (TASK-360) — production only.
    const { httpsRedirect } = await Promise.resolve().then(() => __importStar(require('./middleware/httpsRedirect')));
    app.use(httpsRedirect);
    // Request observability middleware (TASK-146 + TASK-147 + TASK-148).
    // Order matters: requestId before accessLog so the log line has a value.
    const { requestId } = await Promise.resolve().then(() => __importStar(require('./middleware/requestId')));
    const { accessLog } = await Promise.resolve().then(() => __importStar(require('./middleware/accessLog')));
    app.use(requestId);
    if (process.env.ACCESS_LOG_ENABLED !== 'false')
        app.use(accessLog);
    const syncSharedReadState = async () => {
        if (process.env.AGENT_ROLE === 'worker')
            return;
        await chain.refreshFromDb();
        await StateManager_1.stateManager.refreshAllAccounts();
        await txPool.getPendingTransactions(200);
    };
    const { authRouter, initializeAuthTables, ipRateLimit, requireApiKey } = await Promise.resolve().then(() => __importStar(require('./auth')));
    await initializeAuthTables();
    app.use('/api/auth', authRouter);
    console.log('[AUTH] Authentication system ready');
    // Health check endpoint for Railway
    app.get('/health', (req, res) => {
        res.status(200).json({ status: 'ok' });
    });
    // Newsletter signup (TASK-486).
    const { createNewsletterRouter } = await Promise.resolve().then(() => __importStar(require('./newsletter')));
    app.use('/api/newsletter', createNewsletterRouter());
    // Three-tier health checks (TASK-149), build info (TASK-150), Prometheus metrics (TASK-152).
    const { createHealthRouter } = await Promise.resolve().then(() => __importStar(require('./health')));
    const { createBuildRouter } = await Promise.resolve().then(() => __importStar(require('./build-info')));
    const { createMetricsRouter } = await Promise.resolve().then(() => __importStar(require('./metrics')));
    app.use('/health', createHealthRouter(chain));
    app.use('/api/build', createBuildRouter());
    app.use('/api/metrics', createMetricsRouter(chain, txPool));
    // API status check (no key exposure)
    app.get('/api/config/status', (req, res) => {
        const role = process.env.AGENT_ROLE === 'worker' ? 'worker' : 'web';
        res.json({
            llmProvider: hermesConfig.provider,
            llmConfigured: hermesConfig.configured,
            model: hermesConfig.model,
            baseUrl: hermesConfig.baseUrl,
            agentRole: role,
            serviceRole: role,
            agentRepoRootConfigured: !!process.env.AGENT_REPO_ROOT,
            autoGitPush: process.env.AUTO_GIT_PUSH === 'true',
        });
    });
    app.get('/api/status', async (req, res) => {
        await syncSharedReadState();
        res.json({
            status: 'online',
            chainLength: chain.getChainLength(),
            pendingTransactions: txPool.getPendingCount(),
            validators: validatorManager.getAllValidators().length,
            genesisTime: chain.getGenesisTime(),
            chainAgeMs: Date.now() - chain.getGenesisTime(),
            totalTransactions: chain.getTotalTransactions(),
            storedTransactions: chain.getStoredTransactionCount(),
            uptime: process.uptime() * 1000,
            serverUptimeMs: process.uptime() * 1000,
            redisConnected: db_1.cache.isConnected(),
            stateRoot: StateManager_1.stateManager.getStateRoot(),
            totalSupply: StateManager_1.stateManager.getTotalSupply().toString(),
            circulatingSupply: StateManager_1.stateManager.getCirculatingSupply().toString()
        });
    });
    // State endpoints
    app.get('/api/state', async (req, res) => {
        await syncSharedReadState();
        res.json({
            stateRoot: StateManager_1.stateManager.getStateRoot(),
            totalSupply: StateManager_1.stateManager.formatBalance(StateManager_1.stateManager.getTotalSupply()),
            circulatingSupply: StateManager_1.stateManager.formatBalance(StateManager_1.stateManager.getCirculatingSupply()),
            accounts: StateManager_1.stateManager.getAccountsSummary().slice(0, 20)
        });
    });
    app.get('/api/state/account/:address', async (req, res) => {
        await StateManager_1.stateManager.refreshAccount(req.params.address);
        const account = StateManager_1.stateManager.getAccount(req.params.address);
        if (account) {
            res.json({
                address: account.address,
                balance: StateManager_1.stateManager.formatBalance(account.balance),
                balanceRaw: account.balance.toString(),
                nonce: account.nonce
            });
        }
        else {
            res.json({
                address: req.params.address,
                balance: '0 OPEN',
                balanceRaw: '0',
                nonce: 0
            });
        }
    });
    app.get('/api/state/balance/:address', async (req, res) => {
        await StateManager_1.stateManager.refreshAccount(req.params.address);
        const balance = StateManager_1.stateManager.getBalance(req.params.address);
        res.json({
            address: req.params.address,
            balance: StateManager_1.stateManager.formatBalance(balance),
            balanceRaw: balance.toString()
        });
    });
    app.get('/api/blocks', async (req, res) => {
        await syncSharedReadState();
        const blocks = chain.getAllBlocks();
        res.json(blocks.map(b => b.toJSON()));
    });
    app.get('/api/blocks/:height', async (req, res) => {
        await syncSharedReadState();
        const block = chain.getBlockByHeight(parseInt(req.params.height));
        if (block) {
            res.json(block.toJSON());
        }
        else {
            res.status(404).json({ error: 'Block not found' });
        }
    });
    // GET /api/tx/:hash — look up a transaction by its hash across all
    // blocks + its receipt. Returns 200 {status:'unknown'} when the hash
    // isn't found so wallets can poll during propagation without treating
    // a 404 as a hard error. Set include=raw to return the full tx.
    app.get('/api/tx/:hash', async (req, res) => {
        try {
            await syncSharedReadState();
            const hash = String(req.params.hash || '').trim();
            if (!hash) {
                return res.status(400).json({ error: 'hash required' });
            }
            const { loadReceipt } = await Promise.resolve().then(() => __importStar(require('../blockchain/TransactionReceipt')));
            const receipt = await loadReceipt(hash);
            const includeRaw = req.query.include === 'raw';
            // Fast path — look up the block via the receipt's blockNumber.
            if (receipt) {
                const block = chain.getBlockByHeight(receipt.blockNumber);
                const tx = block?.transactions.find((t) => t.hash === hash);
                return res.json({
                    status: 'included',
                    hash,
                    blockHeight: receipt.blockNumber,
                    blockHash: receipt.blockHash,
                    txIndex: receipt.transactionIndex,
                    gasUsed: receipt.gasUsed.toString(),
                    receiptStatus: receipt.status,
                    logs: receipt.logs,
                    ...(includeRaw && tx
                        ? {
                            tx: {
                                hash: tx.hash,
                                from: tx.from,
                                to: tx.to,
                                value: tx.value.toString(),
                                gasPrice: tx.gasPrice.toString(),
                                gasLimit: tx.gasLimit.toString(),
                                nonce: tx.nonce,
                                data: tx.data ?? null,
                                signature: tx.signature,
                            },
                        }
                        : {}),
                });
            }
            // Slow path — walk recent blocks for the hash (covers the window
            // before receipts are persisted on a fresh chain).
            for (const block of chain.getRecentBlocks(256)) {
                const tx = block.transactions.find((t) => t.hash === hash);
                if (tx) {
                    return res.json({
                        status: 'included',
                        hash,
                        blockHeight: block.header.height,
                        blockHash: block.header.hash,
                        ...(includeRaw
                            ? {
                                tx: {
                                    hash: tx.hash,
                                    from: tx.from,
                                    to: tx.to,
                                    value: tx.value.toString(),
                                    gasPrice: tx.gasPrice.toString(),
                                    gasLimit: tx.gasLimit.toString(),
                                    nonce: tx.nonce,
                                    data: tx.data ?? null,
                                    signature: tx.signature,
                                },
                            }
                            : {}),
                    });
                }
            }
            // Mempool check.
            const pending = await txPool.getPendingTransactions(1000);
            if (pending.find((t) => t.hash === hash)) {
                return res.json({ status: 'pending', hash });
            }
            return res.json({ status: 'unknown', hash });
        }
        catch (error) {
            console.error('[API] /api/tx/:hash failed:', error?.message || error);
            res.status(500).json({ error: 'tx lookup failed' });
        }
    });
    // GET /api/account/:addr — alias for /api/state/account/:address so
    // wallets + explorers can use the conventional shape. Returns balance,
    // nonce, codeHash, and the computed state root for verifiability.
    app.get('/api/account/:addr', async (req, res) => {
        try {
            await syncSharedReadState();
            const address = String(req.params.addr || '').trim();
            if (!address) {
                return res.status(400).json({ error: 'address required' });
            }
            const account = StateManager_1.stateManager.getAccount(address);
            res.json({
                address,
                balance: (account?.balance ?? 0n).toString(),
                nonce: account?.nonce ?? 0,
                codeHash: account?.codeHash || null,
                stateRoot: StateManager_1.stateManager.getStateRoot(),
            });
        }
        catch (error) {
            console.error('[API] /api/account/:addr failed:', error?.message || error);
            res.status(500).json({ error: 'account lookup failed' });
        }
    });
    app.get('/api/validators', async (req, res) => {
        const validators = validatorManager.getAllValidators();
        res.json(validators.map(v => ({
            address: v.address,
            name: v.name,
            symbol: v.symbol,
            model: v.model,
            provider: v.provider,
            role: v.role,
            personality: v.personality,
            philosophy: v.philosophy
        })));
    });
    app.post('/api/transactions', async (req, res) => {
        try {
            const { from, to, value, gasPrice, gasLimit, nonce, data, signature, hash } = req.body;
            // TASK-170 — idempotent submit. If client supplies a hash and we
            // already have it (pending or mined), short-circuit with success.
            if (hash) {
                const pending = await txPool.getPendingTransactions(10000);
                if (pending.find((t) => t.hash === hash)) {
                    return res.json({ success: true, hash, idempotent: 'pending' });
                }
                // Note: can't easily check mined without a per-tx index; the new
                // /api/tx/:hash endpoint will 404 for unknown so reusing this
                // path is safe enough.
            }
            // Generate Solana-style base58 transaction hash if not supplied.
            const BASE58 = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
            const txHash = hash || Array.from({ length: 44 }, () => BASE58[Math.floor(Math.random() * 58)]).join('');
            const tx = {
                hash: txHash,
                from,
                to,
                value: BigInt(value),
                gasPrice: BigInt(gasPrice),
                gasLimit: BigInt(gasLimit),
                nonce,
                data,
                signature
            };
            const added = await txPool.addTransaction(tx);
            if (added) {
                eventBus.emit('transaction_added', tx);
                res.json({ success: true, hash: tx.hash });
            }
            else {
                res.status(400).json({ error: 'Invalid transaction' });
            }
        }
        catch (error) {
            res.status(500).json({ error: error.message });
        }
    });
    app.post('/api/chat/:validator', async (req, res) => {
        try {
            const validatorName = req.params.validator.toUpperCase();
            const { message } = req.body;
            const validators = validatorManager.getAllValidators();
            // Find validator by name (handles both "OPEN" and "HERMES VALIDATOR" etc)
            const validator = validators.find(v => v.name === validatorName ||
                v.name.includes(validatorName) ||
                validatorName.includes('OPEN'));
            if (!validator) {
                return res.status(404).json({ error: 'Validator not found' });
            }
            // Build context for smarter responses
            const context = {
                blockHeight: chain.getChainLength(),
                tps: txPool.getPendingCount(),
                validators: validators.length
            };
            const response = await validator.chat(message, context);
            await db_1.db.query(`
        INSERT INTO chat_logs (validator_address, role, content)
        VALUES ($1, 'user', $2), ($1, 'assistant', $3)
      `, [validator.address, message, response]);
            res.json({ response });
        }
        catch (error) {
            console.error('Chat error:', error);
            res.status(500).json({ error: error.message });
        }
    });
    // Terminal chat handler — powered by Nous Hermes. Shared by the
    // canonical /api/personality/:validator route and the /api/hermes/chat
    // alias so SDK callers don't need to know the validator name.
    const chatHandler = async (req, res) => {
        try {
            const userMessage = req.body.message || req.body.command;
            const userContext = req.body.context || {};
            if (!userMessage) {
                return res.status(400).json({ error: 'Message is required', message: 'Please provide a message.' });
            }
            const validators = validatorManager.getAllValidators();
            const validator = validators[0]; // Single Hermes agent
            if (!validator) {
                return res.status(404).json({ error: 'No validators available', message: 'No Hermes validator is currently available.' });
            }
            const context = {
                blockHeight: userContext.blockHeight || chain.getChainLength(),
                tps: userContext.tps || txPool.getPendingCount(),
                validators: validators.length,
                gasPrice: userContext.gasPrice || 5,
                chainId: userContext.chainId || 1337,
            };
            console.log('[TERMINAL] Chat request:', userMessage.substring(0, 50) + '...');
            const response = await validator.chat(userMessage, context);
            res.json({ message: response, response });
        }
        catch (error) {
            const providerError = (0, hermesClient_1.getPublicHermesError)(error);
            console.error('Terminal chat error:', error);
            res.status(providerError.status).json({
                error: providerError.message,
                code: providerError.code,
                providerError,
                message: providerError.message,
            });
        }
    };
    app.post('/api/personality/:validator', ipRateLimit(20), chatHandler);
    app.post('/api/hermes/chat', ipRateLimit(20), chatHandler);
    app.post('/api/personality/hermes/ritual', ipRateLimit(20), async (req, res) => {
        try {
            const ritual = req.body.ritual;
            const page = String(req.body.page || 'landing');
            const targetId = req.body.targetId ? String(req.body.targetId) : undefined;
            if (!ritual) {
                return res.status(400).json({
                    title: 'Ritual interrupted',
                    message: 'A ritual name is required.',
                    sourceRefs: [],
                });
            }
            const validators = validatorManager.getAllValidators();
            const validator = validators[0];
            if (!validator) {
                return res.status(404).json({
                    title: 'Hermes unavailable',
                    message: 'No Hermes validator is currently available.',
                    sourceRefs: [],
                });
            }
            const latestBlock = chain.getLatestBlock();
            const chainStats = chain.getStats();
            const sourceRefs = [];
            let title = 'Hermes ritual';
            let prompt = '';
            if (ritual === 'explain_last_block') {
                if (latestBlock) {
                    sourceRefs.push({ kind: 'block', id: String(latestBlock.header.height) });
                }
                title = latestBlock
                    ? `Block ${latestBlock.header.height}, interpreted`
                    : 'Latest block interpretation';
                prompt = `You are Hermes, speaking to a curious visitor inside the Hermeschain UI.

Explain the latest block in plain English. Keep the answer tight, vivid, and concrete.
Use 2-3 short paragraphs max. Mention what happened, why it matters, and what a visitor should watch next.
Do not invent details that are not in the data.

Latest block:
- height: ${latestBlock?.header.height ?? 'unknown'}
- hash: ${latestBlock?.header.hash ?? 'unknown'}
- producer: ${latestBlock?.header.producer ?? 'unknown'}
- timestamp: ${latestBlock?.header.timestamp ?? 0}
- transaction count: ${latestBlock?.transactions.length ?? 0}
- gas used: ${latestBlock?.header.gasUsed?.toString?.() ?? '0'}

Chain stats:
- total height: ${chainStats.height}
- total transactions: ${chainStats.totalTransactions}
- average block time ms: ${chainStats.avgBlockTime}`;
            }
            if (ritual === 'summarize_today') {
                const { agentMemory } = await Promise.resolve().then(() => __importStar(require('../agent')));
                const { gitIntegration } = await Promise.resolve().then(() => __importStar(require('../agent/GitIntegration')));
                const recentTasks = agentMemory.getCompletedTasks(5);
                const recentLogsResult = await db_1.db
                    .query(`
            SELECT id, type, content, timestamp
            FROM agent_logs
            ORDER BY timestamp DESC
            LIMIT 5
            `)
                    .catch(() => ({ rows: [] }));
                const recentCommits = gitIntegration.getRecentCommits(3);
                const gitSummary = gitIntegration.getSummary();
                sourceRefs.push(...recentTasks.slice(0, 2).map((task) => ({ kind: 'task', id: task.id })), ...recentLogsResult.rows.slice(0, 2).map((log) => ({ kind: 'log', id: log.id })), ...recentCommits.slice(0, 1).map((commit) => ({ kind: 'commit', id: commit.shortHash })));
                title = 'Today in Hermeschain';
                prompt = `You are Hermes, giving a concise daily recap to a curious visitor.

Summarize today's work in 3 short paragraphs max. Mention what you worked on, what the logs suggest, and whether the repo moved.
If the data is sparse, say the chain has been quiet instead of pretending it was busy.
Write in plain English with a little personality, but stay factual.

Recent completed tasks:
${recentTasks.length > 0
                    ? recentTasks
                        .map((task) => `- ${task.title} (${task.completedAt.toISOString()})`)
                        .join('\n')
                    : '- No recent completed tasks recorded.'}

Recent logs:
${recentLogsResult.rows.length > 0
                    ? recentLogsResult.rows
                        .map((log) => `- [${log.type}] ${log.content}`)
                        .join('\n')
                    : '- No recent logs recorded.'}

Git summary:
${gitSummary}

Recent commits:
${recentCommits.length > 0
                    ? recentCommits
                        .map((commit) => `- ${commit.shortHash} ${commit.message} (${commit.date})`)
                        .join('\n')
                    : '- No recent commits available.'}`;
            }
            if (ritual === 'guide_this_page') {
                const pageGuides = {
                    landing: 'This is the main Hermeschain landing page. Visitors should understand the chain premise, run a ritual, and open either the explorer, chat, or logs next.',
                    explorer: 'This page is for inspecting blocks and raw chain state. Visitors should search by block height, inspect a recent block, and use the explain ritual when they need interpretation.',
                    wallet: 'This page helps visitors create or import a wallet, request faucet funds, and understand how OPEN moves through the chain.',
                    logs: 'This page is the raw activity stream. Visitors should watch task starts, tool calls, and completions to understand whether Hermes is actively building.',
                    hermes: 'This page is the direct chat surface. Visitors can continue a ritual thread or ask Hermes anything in freeform language.',
                    network: 'This page shows the broader agent presence around Hermeschain. It is secondary to the main agent workflow in this milestone.',
                    updates: 'This page reflects git state and recent commits so visitors can see whether the repository changed recently.',
                    admin: 'This page exposes internal dashboards and is mainly for operators, not first-time visitors.',
                };
                if (latestBlock) {
                    sourceRefs.push({ kind: 'block', id: String(latestBlock.header.height) });
                }
                title = `How to read the ${page} page`;
                prompt = `You are Hermes, guiding a first-time visitor through a page in the Hermeschain interface.

Give a concise orientation: what this page is for, what to click first, and what signals matter most.
Keep it action-oriented and no more than 3 short paragraphs.
Do not mention internal implementation details unless they help the visitor.

Page name: ${page}
Page intent:
${pageGuides[page] || 'This is a Hermeschain page. Explain its purpose and what a curious visitor should do next.'}

Live context:
- current block height: ${chainStats.height}
- total transactions: ${chainStats.totalTransactions}
- target id: ${targetId || 'none'}
- latest block hash: ${latestBlock?.header.hash ?? 'unknown'}`;
            }
            const context = {
                blockHeight: chain.getChainLength(),
                tps: txPool.getPendingCount(),
                validators: validators.length,
                gasPrice: 5,
                chainId: 1337,
            };
            const message = await validator.chat(prompt, context);
            res.json({
                title,
                message,
                sourceRefs,
            });
        }
        catch (error) {
            const providerError = (0, hermesClient_1.getPublicHermesError)(error);
            console.error('Ritual error:', error);
            res.status(providerError.status).json({
                title: 'Ritual interrupted',
                message: providerError.message,
                code: providerError.code,
                providerError,
                sourceRefs: [],
            });
        }
    });
    // ========== USER CIP SUBMISSION SYSTEM ==========
    const { cipSubmitRouter } = await Promise.resolve().then(() => __importStar(require('./cip-submit')));
    app.use('/api/cip', cipSubmitRouter);
    console.log('[CIP] Submission system ready');
    // ========== USER AGENTS SYSTEM ==========
    const { agentsRouter } = await Promise.resolve().then(() => __importStar(require('./agents')));
    app.use('/api/agents', agentsRouter);
    console.log('[AGENTS] User agents system ready');
    // ========== WALLET & FAUCET SYSTEM ==========
    const { walletRouter } = await Promise.resolve().then(() => __importStar(require('./wallet')));
    app.use('/api/wallet', walletRouter);
    console.log('[WALLET] Wallet & faucet system ready');
    // ========== PEER MESH ==========
    const { createMeshRouter } = await Promise.resolve().then(() => __importStar(require('../network/api')));
    const { startBootstrapHeartbeat } = await Promise.resolve().then(() => __importStar(require('../network/announce')));
    app.use('/api/mesh', createMeshRouter(chain));
    const selfPeerId = process.env.HERMES_PEER_ID || `hermes-${process.pid}`;
    const selfPublicUrl = process.env.HERMES_PUBLIC_URL || '';
    const selfPublicKey = process.env.HERMES_PUBLIC_KEY || '';
    if (selfPublicUrl) {
        startBootstrapHeartbeat({
            peerId: selfPeerId,
            url: selfPublicUrl,
            publicKey: selfPublicKey,
            getChainHeight: () => chain.getChainLength(),
        });
    }
    console.log('[MESH] Peer registry routes mounted at /api/mesh/*');
    // ========== AGENT NETWORK ==========
    const { default: networkRouter, initializeNetworkStore, startNetworkHeartbeat, stopNetworkHeartbeat, } = await Promise.resolve().then(() => __importStar(require('./network')));
    await initializeNetworkStore();
    app.use('/api/network', networkRouter);
    console.log('[NETWORK] Multi-agent network ready');
    console.log('[x402] Payment protocol routes mounted at /api/network/x402/*');
    // Listen for network events and broadcast via Socket.io
    eventBus.on('network_message', (msg) => {
        if (exports.io) {
            exports.io.to('network').emit('new_message', {
                id: msg.id,
                agent: msg.agentName,
                agentId: msg.agentId,
                message: msg.message,
                time: new Date(msg.timestamp).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }),
                timestamp: msg.timestamp,
                type: msg.type,
                topic: msg.topic,
                score: msg.score || 0,
                replyCount: msg.replyCount || 0,
                parentId: msg.parentId
            });
        }
    });
    eventBus.on('network_vote', (data) => {
        if (exports.io) {
            exports.io.to('network').emit('vote_update', data);
        }
    });
    eventBus.on('network_topic', (data) => {
        if (exports.io) {
            exports.io.to('network').emit('new_topic', data);
        }
    });
    // ========== LOGS SYSTEM ==========
    const { logsRouter, initializeLogsTable, addLog } = await Promise.resolve().then(() => __importStar(require('./logs')));
    await initializeLogsTable();
    app.use('/api/logs', logsRouter);
    // Make addLog available globally for agent logging
    global.addLog = addLog;
    console.log('[LOGS] Logs system ready');
    // ========== SKILLS + AGENT CONFIG ==========
    const { createAgentConfig, configureAgentSubsystems, skillManager, agentWorker, agentEvents, agentMemory, agentTaskStore, agentRuntimeStore, taskSources, gitIntegration, tokenBudget, } = await Promise.resolve().then(() => __importStar(require('../agent')));
    const agentConfig = createAgentConfig(process.cwd());
    configureAgentSubsystems(agentConfig);
    await skillManager.initialize();
    await agentTaskStore.initialize();
    await agentRuntimeStore.initialize();
    const { githubUpdates } = await Promise.resolve().then(() => __importStar(require('../agent/GitHubUpdates')));
    await githubUpdates.initialize(agentConfig.repoRoot);
    const shouldRunGitHubSync = agentConfig.role === 'worker' || !process.env.WORKER_INTERNAL_URL;
    if (shouldRunGitHubSync) {
        githubUpdates.startBackgroundSync();
    }
    const { githubUpdatesRouter } = await Promise.resolve().then(() => __importStar(require('./githubUpdates')));
    app.use('/api/github/updates', githubUpdatesRouter);
    console.log(`[GITHUB] Updates center ready (${shouldRunGitHubSync ? 'active sync' : 'cache reader'})`);
    if (agentConfig.role === 'worker') {
        await startNetworkHeartbeat();
    }
    else {
        stopNetworkHeartbeat();
    }
    // ========== ADMIN DASHBOARD ==========
    const { adminRouter } = await Promise.resolve().then(() => __importStar(require('./admin')));
    app.use('/api/admin', requireApiKey('admin'), adminRouter);
    console.log('[ADMIN] Admin dashboard API ready');
    // Skills API endpoints
    app.get('/api/skills', (req, res) => {
        res.json({ skills: skillManager.listSkills() });
    });
    app.get('/api/skills/:id', (req, res) => {
        const skill = skillManager.getSkill(req.params.id);
        if (skill) {
            res.json(skill);
        }
        else {
            res.status(404).json({ error: 'Skill not found' });
        }
    });
    app.post('/api/skills/:id/enable', (req, res) => {
        const success = skillManager.enableSkill(req.params.id);
        res.json({ success });
    });
    app.post('/api/skills/:id/disable', (req, res) => {
        const success = skillManager.disableSkill(req.params.id);
        res.json({ success });
    });
    console.log('[SKILLS] Skills system ready');
    // ========== PLAYGROUND SYSTEM ==========
    const { playgroundRouter } = await Promise.resolve().then(() => __importStar(require('./playground')));
    app.use('/api/playground', playgroundRouter);
    console.log('[WORKSHOP] Playground system ready');
    // ========== END PLAYGROUND SYSTEM ==========
    // ========== AUTONOMOUS AGENT WORKER SYSTEM ==========
    // Track connected SSE clients
    let agentViewerCount = 0;
    const parseGitLogEntry = (row) => {
        const metadata = row.metadata || {};
        const shortHash = metadata.commit ||
            row.content?.match(/commit\s+([a-f0-9]{7,40})/i)?.[1] ||
            'unknown';
        return {
            hash: metadata.fullHash || shortHash,
            shortHash,
            message: metadata.message || row.content || 'Recent git activity',
            author: metadata.author || 'Hermes',
            date: typeof row.timestamp === 'string'
                ? row.timestamp
                : new Date(row.timestamp || Date.now()).toISOString(),
        };
    };
    const getSharedGitSnapshot = async (limit = 5) => {
        const sharedRuntime = agentRuntimeStore.getLatestSnapshot();
        const result = await db_1.db
            .query(`
        SELECT timestamp, content, metadata
        FROM agent_logs
        WHERE type = 'git_commit'
        ORDER BY timestamp DESC
        LIMIT $1
        `, [limit])
            .catch(() => ({ rows: [] }));
        return {
            role: agentConfig.role,
            gitAvailable: sharedRuntime?.capabilities?.git === 'ready' || agentConfig.gitAvailable,
            pushAvailable: sharedRuntime?.capabilities?.push === 'ready' || agentConfig.pushAvailable,
            branch: agentConfig.gitAvailable ? gitIntegration.getCurrentBranch() : 'unavailable',
            clean: agentConfig.gitAvailable ? gitIntegration.getStatus().clean : true,
            changes: agentConfig.gitAvailable ? gitIntegration.getStatus().changes : [],
            staged: agentConfig.gitAvailable ? gitIntegration.getStatus().staged : [],
            recentCommits: (result.rows || []).map(parseGitLogEntry),
            summary: agentConfig.gitAvailable
                ? gitIntegration.getSummary()
                : sharedRuntime?.capabilities?.push === 'unavailable'
                    ? 'Worker runtime is active, but git push is unavailable in this environment.'
                    : 'Git activity is being observed from the shared worker runtime.',
        };
    };
    const formatLogStreamText = (row) => {
        switch (row.type) {
            case 'task_start':
                return `$ begin_task :: ${row.content}\n`;
            case 'analysis_start':
                return `> [ANALYSIS] ${row.content}\n`;
            case 'tool_use':
                return `> [TOOL] ${row.content.replace(/^Using tool:\s*/i, '')}\n`;
            case 'tool_result':
                return `> [RESULT] ${row.content}\n`;
            case 'verification_start':
                return `> [VERIFY] ${row.content}\n`;
            case 'verification_result':
                return `> [PASS] ${row.content}\n`;
            case 'task_complete':
                return `> [DONE] ${row.content}\n`;
            case 'task_blocked':
                return `> [BLOCKED] ${row.content}\n`;
            case 'git_commit':
                return `> [RESULT] ${row.content}\n`;
            case 'error':
                return `> [ERROR] ${row.content}\n`;
            default:
                return `${row.content}\n`;
        }
    };
    const buildAgentStatusPayload = async () => {
        await syncSharedReadState();
        const state = agentWorker.getState();
        const sharedRuntime = agentRuntimeStore.getLatestSnapshot();
        const sharedWorkerRuntime = agentConfig.role === 'web' && sharedRuntime?.role === 'worker'
            ? sharedRuntime
            : null;
        const observedRuntime = sharedWorkerRuntime
            ? sharedWorkerRuntime
            : {
                role: agentConfig.role,
                mode: state.mode,
                isWorking: state.isWorking,
                runStatus: state.runStatus,
                verificationStatus: state.verificationStatus,
                blockedReason: state.blockedReason,
                lastFailure: state.lastFailure,
                repoRoot: state.repoRoot,
                repoRootHealth: state.repoRootHealth,
                canWriteScopes: state.canWriteScopes,
                currentTask: state.currentTask
                    ? {
                        id: state.currentTask.id,
                        title: state.currentTask.title,
                        type: state.currentTask.type,
                        agent: state.currentTask.agent,
                    }
                    : null,
                currentOutput: state.currentOutput,
                currentDecision: state.currentDecision,
                heartbeatCount: state.heartbeatCount,
                brainActive: state.brainActive,
                agentEnabled: agentConfig.effectiveMode !== 'disabled',
                startupIssues: agentConfig.startupIssues,
                capabilities: {
                    workspace: agentConfig.workspaceReady ? 'ready' : 'unavailable',
                    git: agentConfig.gitAvailable ? 'ready' : 'unavailable',
                    push: agentConfig.pushAvailable ? 'ready' : 'unavailable',
                    llm: agentConfig.modelConfigured ? 'ready' : 'unavailable',
                },
                updatedAt: new Date().toISOString(),
                workerHeartbeatAt: agentConfig.role === 'worker' ? new Date().toISOString() : null,
            };
        const workerHeartbeatAt = observedRuntime.role === 'worker'
            ? observedRuntime.workerHeartbeatAt || observedRuntime.updatedAt || null
            : null;
        const workerActive = workerHeartbeatAt
            ? Date.now() - new Date(workerHeartbeatAt).getTime() < 90000
            : false;
        const currentRun = agentTaskStore.getCurrentRun();
        const recentRuns = agentTaskStore.getRecentRuns(20);
        const recentSuccessfulRuns = recentRuns.filter((run) => run.status === 'succeeded').slice(0, 5);
        return {
            role: agentConfig.role,
            serviceRole: agentConfig.role,
            observedWorkerRole: observedRuntime.role,
            statusSource: sharedWorkerRuntime ? 'shared' : 'local',
            mode: observedRuntime.mode,
            streamMode: observedRuntime.mode,
            isWorking: observedRuntime.isWorking,
            runStatus: observedRuntime.runStatus,
            verificationStatus: observedRuntime.verificationStatus,
            blockedReason: observedRuntime.blockedReason,
            lastFailure: observedRuntime.lastFailure,
            repoRoot: observedRuntime.repoRoot,
            repoRootHealth: observedRuntime.repoRootHealth,
            canWriteScopes: observedRuntime.canWriteScopes,
            currentTask: observedRuntime.currentTask,
            currentOutput: observedRuntime.currentOutput,
            currentDecision: observedRuntime.currentDecision,
            completedTaskCount: recentSuccessfulRuns.length,
            recentTasks: recentSuccessfulRuns.map((run) => ({
                title: run.title,
                agent: run.agent,
                completedAt: run.completedAt || run.updatedAt,
            })),
            recentRuns: recentRuns.map((run) => ({
                id: run.id,
                sourceTaskId: run.sourceTaskId,
                title: run.title,
                type: run.taskType,
                mode: run.mode,
                status: run.status,
                verificationStatus: run.verificationStatus,
                changedFiles: run.changedFiles,
                failureReason: run.failureReason,
                blockedReason: run.blockedReason,
                startedAt: run.startedAt,
                completedAt: run.completedAt,
            })),
            currentRunId: currentRun?.id || null,
            viewerCount: agentViewerCount,
            agentEnabled: observedRuntime.agentEnabled,
            workerActive,
            workerHeartbeatAt,
            startupIssues: observedRuntime.startupIssues,
            capabilities: observedRuntime.capabilities,
            genesisTimestamp: chain.getGenesisTime(),
            chainAgeMs: Date.now() - chain.getGenesisTime(),
            lastBlockTimestamp: chain.getLatestBlock()?.header.timestamp || null,
            blockHeight: chain.getChainLength(),
            transactionCount: chain.getStoredTransactionCount(),
            storedTransactionCount: chain.getStoredTransactionCount(),
            tps: chain.getRecentTps(60),
            validatorsOnline: validatorManager.getAllValidators().length,
            validatorsTotal: validatorManager.getAllValidators().length,
            mempoolPending: txPool.getPendingCount(),
            tokenSpend: tokenBudget.snapshot(),
        };
    };
    const WORKER_INTERNAL_URL = process.env.WORKER_INTERNAL_URL ||
        'https://hermeschain-worker-production.up.railway.app';
    const mergeWorkerStatusIntoPayload = (localPayload, workerData) => ({
        ...localPayload,
        mode: workerData.agentMode || localPayload.mode,
        streamMode: workerData.agentMode || localPayload.streamMode,
        runStatus: workerData.runStatus || localPayload.runStatus,
        verificationStatus: workerData.verificationStatus || localPayload.verificationStatus,
        isWorking: workerData.isWorking ?? localPayload.isWorking,
        currentTask: workerData.currentTask || localPayload.currentTask,
        lastFailure: workerData.lastFailure || localPayload.lastFailure,
        blockedReason: workerData.blockedReason || localPayload.blockedReason,
        recentTasks: (workerData.recentSuccessful || []).slice(0, 5).map((run) => ({
            title: run.title,
            agent: run.agent || 'HERMES',
            completedAt: run.completedAt,
        })),
        recentRuns: workerData.recentRuns || [],
        completedTaskCount: (workerData.recentSuccessful || []).length,
        agentEnabled: true,
        capabilities: workerData.capabilities || localPayload.capabilities,
        blockHeight: workerData.blockHeight ?? localPayload.blockHeight,
        workerActive: true,
    });
    const buildLiveAgentStatusPayload = async (options) => {
        const localPayload = await buildAgentStatusPayload();
        if (process.env.AGENT_ROLE === 'worker') {
            return localPayload;
        }
        const shouldProxyWorkerStatus = localPayload.statusSource !== 'shared' ||
            !localPayload.workerActive ||
            localPayload.mode === 'disabled';
        if (!shouldProxyWorkerStatus) {
            return localPayload;
        }
        try {
            const controller = new AbortController();
            const timeout = setTimeout(() => controller.abort(), 4000);
            const upstream = await fetch(`${WORKER_INTERNAL_URL}/status`, {
                signal: controller.signal,
            });
            clearTimeout(timeout);
            if (!upstream.ok) {
                return localPayload;
            }
            const workerData = await upstream.json();
            return mergeWorkerStatusIntoPayload(localPayload, workerData);
        }
        catch (error) {
            if (options?.logProxyErrors) {
                console.error('[PROXY] worker /status fetch failed:', error?.message || error);
            }
            return localPayload;
        }
    };
    const getAgentLogCursor = (row) => ({
        id: row.id,
        timestamp: new Date(row.timestamp),
    });
    const compareAgentLogCursor = (a, b) => {
        const delta = a.timestamp.getTime() - b.timestamp.getTime();
        if (delta !== 0)
            return delta;
        return a.id.localeCompare(b.id);
    };
    const fetchRecentAgentStreamRows = async (limit = 30) => {
        const result = await db_1.db.query(`
      SELECT id, timestamp, type, content, metadata
      FROM agent_logs
      WHERE type IN (
        'task_start',
        'analysis_start',
        'tool_use',
        'tool_result',
        'verification_start',
        'verification_result',
        'task_complete',
        'task_blocked',
        'git_commit',
        'error',
        'output'
      )
      ORDER BY timestamp DESC, id DESC
      LIMIT $1
      `, [limit]);
        return (result.rows || []).reverse();
    };
    const fetchAgentStreamRowsAfter = async (cursor, limit = 50) => {
        const result = await db_1.db.query(`
      SELECT id, timestamp, type, content, metadata
      FROM agent_logs
      WHERE (
        type IN (
          'task_start',
          'analysis_start',
          'tool_use',
          'tool_result',
          'verification_start',
          'verification_result',
          'task_complete',
          'task_blocked',
          'git_commit',
          'error',
          'output'
        )
      )
        AND (timestamp > $1 OR (timestamp = $1 AND id > $2))
      ORDER BY timestamp ASC, id ASC
      LIMIT $3
      `, [cursor.timestamp, cursor.id, limit]);
        return result.rows || [];
    };
    // SSE endpoint for live agent work streaming
    app.get('/api/agent/stream', (req, res) => {
        // SSE replica pinning (TASK-331). With multiple web replicas behind a
        // load balancer, we don't get sticky sessions for free; instead, only
        // the replica with SSE_REPLICA=true serves the stream. Others 503 with
        // X-SSE-Failover so clients can retry against a different host.
        if (process.env.SSE_REPLICA === 'false' ||
            (process.env.SSE_REPLICA === undefined && process.env.SSE_REPLICA_STRICT === 'true')) {
            res.setHeader('X-SSE-Failover', 'true');
            res.status(503).json({ error: 'sse-replica-not-here' });
            return;
        }
        // Set up SSE headers
        res.setHeader('Content-Type', 'text/event-stream');
        res.setHeader('Cache-Control', 'no-cache');
        res.setHeader('Connection', 'keep-alive');
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.flushHeaders();
        agentViewerCount++;
        console.log(`[AGENT] New viewer connected (total: ${agentViewerCount})`);
        const streamStartedAt = new Date();
        let lastSharedLogCursor = {
            id: '',
            timestamp: streamStartedAt,
        };
        void buildLiveAgentStatusPayload()
            .then(async (payload) => {
            res.write(`data: ${JSON.stringify({
                type: 'init',
                data: payload,
                timestamp: Date.now()
            })}\n\n`);
            try {
                const recentRows = await fetchRecentAgentStreamRows(30);
                if (recentRows.length > 0) {
                    lastSharedLogCursor = getAgentLogCursor(recentRows[recentRows.length - 1]);
                }
                for (const row of recentRows) {
                    res.write(`data: ${JSON.stringify({
                        type: 'text',
                        data: formatLogStreamText(row),
                        viewerCount: agentViewerCount,
                        timestamp: Date.now(),
                    })}\n\n`);
                }
            }
            catch {
                // Shared history is best-effort. The live stream should still
                // connect even if historical hydration is unavailable.
            }
        })
            .catch(() => {
            res.write(`data: ${JSON.stringify({
                type: 'init',
                data: {
                    error: 'Failed to build shared agent status payload.',
                },
                timestamp: Date.now()
            })}\n\n`);
        });
        // Subscribe to agent events
        const onChunk = (chunk) => {
            try {
                res.write(`data: ${JSON.stringify({ ...chunk, viewerCount: agentViewerCount })}\n\n`);
            }
            catch (e) {
                // Client disconnected
            }
        };
        agentEvents.on('chunk', onChunk);
        const statusPulse = setInterval(() => {
            void buildLiveAgentStatusPayload()
                .then((payload) => {
                res.write(`data: ${JSON.stringify({
                    type: 'status',
                    data: payload,
                    viewerCount: agentViewerCount,
                    timestamp: Date.now()
                })}\n\n`);
            })
                .catch(() => {
                clearInterval(statusPulse);
            });
        }, 5000);
        const sharedLogPoll = setInterval(async () => {
            if (agentConfig.role !== 'web')
                return;
            try {
                const rows = await fetchAgentStreamRowsAfter(lastSharedLogCursor, 50);
                for (const row of rows) {
                    const nextCursor = getAgentLogCursor(row);
                    if (compareAgentLogCursor(nextCursor, lastSharedLogCursor) > 0) {
                        lastSharedLogCursor = nextCursor;
                    }
                    res.write(`data: ${JSON.stringify({
                        type: 'text',
                        data: formatLogStreamText(row),
                        viewerCount: agentViewerCount,
                        timestamp: Date.now(),
                    })}\n\n`);
                }
            }
            catch {
                // Shared worker logs are best-effort here; status pulses still keep the rail honest.
            }
        }, 5000);
        // Send heartbeat every 10 seconds
        const heartbeat = setInterval(() => {
            try {
                res.write(`data: ${JSON.stringify({ type: 'heartbeat', timestamp: Date.now(), viewerCount: agentViewerCount })}\n\n`);
            }
            catch (e) {
                clearInterval(statusPulse);
                clearInterval(heartbeat);
            }
        }, 10000);
        // Handle client disconnect
        req.on('close', () => {
            agentViewerCount--;
            console.log(`[AGENT] Viewer disconnected (total: ${agentViewerCount})`);
            agentEvents.off('chunk', onChunk);
            clearInterval(statusPulse);
            clearInterval(heartbeat);
            clearInterval(sharedLogPoll);
        });
    });
    // Get agent status
    // When running as web, proxy agent status to the worker so the frontend
    // sees live task/run state from the container that's actually doing work.
    // Worker is reachable over Railway's private network at the internal domain.
    // Prefer explicit WORKER_INTERNAL_URL; fall back to the public Railway
    // domain since private-network DNS+port assumptions aren't guaranteed.
    app.get('/api/agent/status', async (req, res) => {
        res.json(await buildLiveAgentStatusPayload({ logProxyErrors: true }));
    });
    // Get persisted task runs (plus legacy completed-task alias)
    app.get('/api/agent/history', (req, res) => {
        const limit = parseInt(req.query.limit) || 20;
        const runs = agentTaskStore.getRecentRuns(limit);
        const successfulRuns = runs.filter((run) => run.status === 'succeeded');
        res.json({
            runs: runs.map((run) => ({
                id: run.id,
                sourceTaskId: run.sourceTaskId,
                source: agentTaskStore.getSourceTask(run.sourceTaskId)?.source || 'unknown',
                title: run.title,
                type: run.taskType,
                agent: run.agent,
                mode: run.mode,
                status: run.status,
                verificationStatus: run.verificationStatus,
                changedFiles: run.changedFiles,
                failureReason: run.failureReason,
                blockedReason: run.blockedReason,
                output: run.output.substring(0, 1000),
                startedAt: run.startedAt,
                completedAt: run.completedAt,
            })),
            tasks: successfulRuns.map((run) => ({
                id: run.id,
                taskId: run.sourceTaskId,
                title: run.title,
                type: run.taskType,
                agent: run.agent,
                output: run.output.substring(0, 500),
                completedAt: run.completedAt,
            })),
            total: runs.length
        });
    });
    app.post('/api/agent/tasks/:id/requeue', async (req, res) => {
        const task = await taskSources.requeueTask(req.params.id);
        if (!task) {
            return res.status(404).json({ error: 'Task not found' });
        }
        res.json({ success: true, task });
    });
    app.post('/api/agent/tasks/:id/discard', async (req, res) => {
        const reason = typeof req.body?.reason === 'string' && req.body.reason.trim().length > 0
            ? req.body.reason.trim()
            : 'Discarded by operator';
        const task = await taskSources.discardTask(req.params.id, reason);
        if (!task) {
            return res.status(404).json({ error: 'Task not found' });
        }
        res.json({ success: true, task });
    });
    // ==================== CHAIN EXPLORER API ====================
    // Get recent blocks
    app.get('/api/chain/blocks', async (req, res) => {
        await syncSharedReadState();
        const limit = parseInt(req.query.limit) || 20;
        const blocks = chain.getAllBlocks().slice(-limit).reverse();
        res.json({
            blocks: blocks.map(b => ({
                height: b.header.height,
                hash: b.header.hash,
                parentHash: b.header.parentHash,
                producer: b.header.producer,
                timestamp: b.header.timestamp,
                transactionCount: b.transactions.length,
                gasUsed: b.header.gasUsed.toString(),
                gasLimit: b.header.gasLimit.toString(),
                stateRoot: b.header.stateRoot,
                difficulty: b.header.difficulty
            })),
            total: chain.getChainLength()
        });
    });
    // Get block by height
    app.get('/api/chain/block/:height', async (req, res) => {
        await syncSharedReadState();
        const height = parseInt(req.params.height);
        const block = chain.getBlockByHeight(height);
        if (!block) {
            return res.status(404).json({ error: 'Block not found' });
        }
        res.json({
            height: block.header.height,
            hash: block.header.hash,
            parentHash: block.header.parentHash,
            producer: block.header.producer,
            timestamp: block.header.timestamp,
            transactionCount: block.transactions.length,
            gasUsed: block.header.gasUsed.toString(),
            gasLimit: block.header.gasLimit.toString(),
            stateRoot: block.header.stateRoot,
            transactions: block.transactions.map(tx => ({
                hash: tx.hash,
                from: tx.from,
                to: tx.to,
                value: tx.value.toString(),
                gasPrice: tx.gasPrice.toString(),
                nonce: tx.nonce
            }))
        });
    });
    // Get recent transactions across recent blocks
    app.get('/api/chain/transactions', async (req, res) => {
        const limit = Math.min(parseInt(req.query.limit) || 40, 200);
        const query = String(req.query.query || '').trim().toLowerCase();
        try {
            const conditions = [];
            const params = [];
            if (query) {
                params.push(`%${query}%`);
                params.push(query);
                conditions.push(`
          (
            LOWER(t.hash) LIKE LOWER($${params.length - 1}) OR
            LOWER(t.from_address) LIKE LOWER($${params.length - 1}) OR
            LOWER(t.to_address) LIKE LOWER($${params.length - 1}) OR
            LOWER(COALESCE(b.hash, '')) LIKE LOWER($${params.length - 1}) OR
            CAST(COALESCE(t.block_height, -1) AS TEXT) = $${params.length}
          )
        `);
            }
            params.push(limit);
            const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
            const countParams = params.slice(0, params.length - 1);
            const countResult = await db_1.db.query(`
        SELECT COUNT(*)::int AS count
        FROM transactions t
        LEFT JOIN blocks b ON b.height = t.block_height
        ${where}
        `, countParams);
            const result = await db_1.db.query(`
        SELECT
          t.hash,
          t.from_address,
          t.to_address,
          t.value,
          t.gas_price,
          t.gas_limit,
          t.nonce,
          t.status,
          t.created_at,
          t.block_height,
          b.hash AS block_hash,
          b.producer
        FROM transactions t
        LEFT JOIN blocks b ON b.height = t.block_height
        ${where}
        ORDER BY t.created_at DESC
        LIMIT $${params.length}
        `, params);
            const transactions = (result.rows || []).map((row) => ({
                hash: row.hash,
                from: row.from_address,
                to: row.to_address,
                value: String(Number(row.value) / 1e18),
                gasPrice: row.gas_price?.toString?.() || '0',
                gasLimit: row.gas_limit?.toString?.() || '0',
                nonce: Number(row.nonce || 0),
                timestamp: new Date(row.created_at).getTime(),
                blockHeight: row.block_height === null ? null : Number(row.block_height),
                blockHash: row.block_hash || null,
                producer: row.producer || null,
                status: row.status || 'confirmed',
            }));
            res.json({
                transactions,
                total: Number(countResult.rows?.[0]?.count || transactions.length),
                query,
            });
        }
        catch (error) {
            res.json({
                transactions: [],
                total: 0,
                query,
                error: 'Transaction index is unavailable right now.',
            });
        }
    });
    // Get chain stats
    app.get('/api/chain/stats', async (req, res) => {
        await syncSharedReadState();
        const stats = chain.getStats();
        res.json({
            height: stats.height,
            totalTransactions: stats.totalTransactions,
            storedTransactions: stats.storedTransactions,
            timeBasedTransactions: stats.storedTransactions,
            genesisTime: stats.genesisTime,
            latestBlockTime: stats.latestBlockTime,
            avgBlockTime: stats.avgBlockTime
        });
    });
    // Address validity checker (TASK-137). Returns parseable + reason.
    app.get('/api/wallet/validate/:input', (req, res) => {
        const input = req.params.input;
        if (typeof input !== 'string' || input.length === 0) {
            return res.json({ valid: false, reason: 'empty' });
        }
        if (input.length < 32 || input.length > 64) {
            return res.json({ valid: false, reason: 'wrong-length' });
        }
        if (!/^[1-9A-HJ-NP-Za-km-z]+$/.test(input)) {
            return res.json({ valid: false, reason: 'bad-base58' });
        }
        res.json({ valid: true });
    });
    // Block search by height range (TASK-153).
    app.get('/api/blocks/search', async (req, res) => {
        const from = Math.max(0, Number(req.query.from ?? 0));
        const to = Math.min(from + 1000, Number(req.query.to ?? from + 100));
        const producer = typeof req.query.producer === 'string' ? req.query.producer : null;
        const items = [];
        for (let h = from; h <= to; h++) {
            const block = chain.getBlockByHeight(h);
            if (!block)
                continue;
            if (producer && block.header.producer !== producer)
                continue;
            items.push({
                height: block.header.height,
                hash: block.header.hash,
                producer: block.header.producer,
                timestamp: block.header.timestamp,
                transactionCount: block.transactions.length,
            });
        }
        res.json({ items, count: items.length, from, to });
    });
    // Mempool snapshot (TASK-166).
    app.get('/api/mempool', async (req, res) => {
        const limit = Math.min(500, Math.max(1, Number(req.query.limit ?? 200)));
        const txs = await txPool.getPendingTransactions(limit);
        res.json({
            pending: txs.length,
            items: txs.map(tx => ({
                ...tx,
                value: tx.value.toString(),
                gasPrice: tx.gasPrice.toString(),
                gasLimit: tx.gasLimit.toString(),
            })),
        });
    });
    // Single pending tx by hash (TASK-167). 404 if mined or unknown.
    app.get('/api/mempool/:hash', async (req, res) => {
        const all = await txPool.getPendingTransactions(10000);
        const found = all.find(tx => tx.hash === req.params.hash);
        if (!found)
            return res.status(404).json({ error: 'not in mempool' });
        res.json({
            ...found,
            value: found.value.toString(),
            gasPrice: found.gasPrice.toString(),
            gasLimit: found.gasLimit.toString(),
        });
    });
    // Next nonce hint (TASK-057). max(chain_nonce, max_pending_nonce) + 1.
    app.get('/api/account/:addr/next-nonce', async (req, res) => {
        const chainNonce = StateManager_1.stateManager.getNonce(req.params.addr);
        const pending = txPool.getPendingForAddress(req.params.addr);
        const maxPending = pending.reduce((m, t) => Math.max(m, t.nonce), -1);
        const next = Math.max(chainNonce, maxPending + 1);
        res.json({ address: req.params.addr, nextNonce: next });
    });
    // TPS over a configurable window (TASK-051). Default 60s. Powered by
    // chain.getRecentTps which already buckets recent block tx counts.
    app.get('/api/chain/tps', async (req, res) => {
        const window = Math.min(3600, Math.max(1, Number(req.query.window ?? 60)));
        const tps = chain.getRecentTps(window);
        res.json({ tps, window_sec: window });
    });
    // Get latest block
    app.get('/api/chain/latest', async (req, res) => {
        await syncSharedReadState();
        const block = chain.getLatestBlock();
        if (!block) {
            return res.status(404).json({ error: 'No blocks found' });
        }
        res.json({
            height: block.header.height,
            hash: block.header.hash,
            producer: block.header.producer,
            timestamp: block.header.timestamp,
            transactionCount: block.transactions.length
        });
    });
    // Git status endpoint
    app.get('/api/git/status', async (req, res) => {
        if (agentConfig.gitAvailable) {
            const { gitIntegration } = await Promise.resolve().then(() => __importStar(require('../agent/GitIntegration')));
            const status = gitIntegration.getStatus();
            const commits = gitIntegration.getRecentCommits(5);
            const summary = gitIntegration.getSummary();
            return res.json({
                role: agentConfig.role,
                gitAvailable: agentConfig.gitAvailable,
                pushAvailable: agentConfig.pushAvailable,
                branch: status.branch,
                clean: status.clean,
                changes: status.changes,
                staged: status.staged,
                recentCommits: commits,
                summary,
            });
        }
        res.json(await getSharedGitSnapshot(5));
    });
    // CI status endpoint
    app.get('/api/ci/status', async (req, res) => {
        const { ciMonitor } = await Promise.resolve().then(() => __importStar(require('../agent/CIMonitor')));
        const status = ciMonitor.getStatus();
        res.json(status);
    });
    // Run CI checks manually
    app.post('/api/ci/run', async (req, res) => {
        const { ciMonitor } = await Promise.resolve().then(() => __importStar(require('../agent/CIMonitor')));
        const results = await ciMonitor.runAllChecks();
        res.json(results);
    });
    // Task sources status
    app.get('/api/tasks/pending', async (req, res) => {
        const { taskSources } = await Promise.resolve().then(() => __importStar(require('../agent/TaskSources')));
        const tasks = await taskSources.collectAllTasks();
        res.json({
            count: tasks.length,
            tasks: tasks.slice(0, 20).map(t => ({
                id: t.id,
                source: t.source,
                title: t.title,
                priority: t.priority,
                createdAt: t.createdAt
            }))
        });
    });
    // Task backlog status
    app.get('/api/tasks/backlog', async (req, res) => {
        const { TASK_BACKLOG, BACKLOG_PHASES, COMMIT_WINDOW_MINUTES, getRuntimeCommitWindowMinutes, TARGET_COMMIT_HOURS, TARGET_COMMIT_WINDOWS, getOrderedBacklog, getTotalEstimatedTime, } = await Promise.resolve().then(() => __importStar(require('../agent/TaskBacklog')));
        const progress = agentTaskStore.getBacklogProgress(TASK_BACKLOG.length);
        const time = getTotalEstimatedTime();
        const orderedTasks = getOrderedBacklog();
        const nextTasks = orderedTasks
            .filter((task) => agentTaskStore.getSourceTask(task.id)?.status !== 'succeeded')
            .slice(0, 10);
        res.json({
            progress,
            cadence: {
                commitWindowMinutes: COMMIT_WINDOW_MINUTES,
                runtimeCommitWindowMinutes: getRuntimeCommitWindowMinutes(),
                targetHours: TARGET_COMMIT_HOURS,
                targetCommitWindows: TARGET_COMMIT_WINDOWS,
            },
            estimatedTime: time,
            totalTasks: TASK_BACKLOG.length,
            phases: BACKLOG_PHASES,
            nextTasks: nextTasks.map(t => ({
                id: t.id,
                title: t.title,
                type: t.type,
                priority: t.priority,
                estimatedMinutes: t.estimatedMinutes,
                commitWindowMinutes: t.commitWindowMinutes,
                phaseId: t.phaseId,
                phaseTitle: t.phaseTitle,
                workstreamId: t.workstreamId,
                workstreamTitle: t.workstreamTitle,
                allowedScopes: t.allowedScopes,
                expectedOutcome: t.expectedOutcome,
                verification: t.verification,
                tags: t.tags,
            }))
        });
    });
    // Start the autonomous agent worker by default unless explicitly disabled.
    if (agentConfig.role === 'worker' &&
        agentConfig.autorunEnabled &&
        agentConfig.effectiveMode !== 'disabled') {
        void agentWorker.start().catch((error) => {
            console.error('[AGENT] Worker failed to start:', error);
        });
        console.log(`[AGENT] Autonomous agent worker started in ${agentConfig.effectiveMode} mode (${agentConfig.role} role)`);
    }
    else {
        console.log(`[AGENT] Worker not started (role=${agentConfig.role}, autorun=${agentConfig.autorunEnabled}, effectiveMode=${agentConfig.effectiveMode})`);
    }
    // Set up logging for agent events
    let currentTaskId;
    let currentTaskTitle;
    agentEvents.on('chunk', (chunk) => {
        try {
            switch (chunk.type) {
                case 'task_start':
                    currentTaskId = chunk.data?.task?.id;
                    currentTaskTitle = chunk.data?.task?.title;
                    addLog('task_start', `Starting: ${chunk.data?.task?.title || 'Unknown task'}`, currentTaskId, currentTaskTitle);
                    break;
                case 'task_complete':
                    addLog('task_complete', `Completed: ${chunk.data?.title || currentTaskTitle || 'Unknown task'}`, chunk.data?.taskId || currentTaskId, chunk.data?.title || currentTaskTitle);
                    currentTaskId = undefined;
                    currentTaskTitle = undefined;
                    break;
                case 'text':
                    // Only log significant text chunks
                    if (chunk.data && chunk.data.length > 10) {
                        addLog('output', chunk.data, currentTaskId, currentTaskTitle);
                    }
                    break;
                case 'tool_start':
                    addLog('tool_use', `Using tool: ${chunk.data?.tool}`, currentTaskId, currentTaskTitle, chunk.data);
                    break;
                case 'tool_result':
                    addLog('tool_result', `Tool finished: ${chunk.data?.tool}`, currentTaskId, currentTaskTitle, chunk.data);
                    break;
                case 'analysis_start':
                    addLog('analysis_start', `Analyzing: ${currentTaskTitle || chunk.data?.taskId || 'task'}`, currentTaskId, currentTaskTitle, chunk.data);
                    break;
                case 'verification_start':
                    addLog('verification_start', `Verifying: ${currentTaskTitle || chunk.data?.sourceTaskId || 'task'}`, currentTaskId, currentTaskTitle, chunk.data);
                    break;
                case 'verification_result':
                    addLog('verification_result', chunk.data?.summary || chunk.data?.failureReason || chunk.data?.step || 'Verification update', currentTaskId, currentTaskTitle, chunk.data);
                    break;
                case 'task_blocked':
                    addLog('task_blocked', chunk.data?.reason || 'Task blocked', chunk.data?.taskId || currentTaskId, currentTaskTitle, chunk.data);
                    currentTaskId = undefined;
                    currentTaskTitle = undefined;
                    break;
                case 'git_deploy':
                    addLog('git_commit', `Deployed commit ${chunk.data?.commit} to ${chunk.data?.branch || 'main'}`, chunk.data?.taskId, currentTaskTitle, chunk.data);
                    break;
                case 'error':
                    addLog('error', chunk.data?.message || 'Unknown error', currentTaskId, currentTaskTitle);
                    break;
            }
        }
        catch (e) {
            // Ignore logging errors
        }
    });
    // ========== END AGENT WORKER SYSTEM ==========
    // Serve frontend static files
    // Try multiple possible paths (check absolute first for production)
    const possiblePaths = [
        '/app/frontend/dist', // Absolute production path
        path_1.default.resolve(process.cwd(), 'frontend/dist'), // From app root
        path_1.default.resolve(__dirname, '../../frontend/dist'), // From /app/backend/dist/api
        path_1.default.resolve(__dirname, '../../../frontend/dist') // Alternative
    ];
    let frontendPath = null;
    for (const testPath of possiblePaths) {
        if (fs_1.default.existsSync(testPath) && fs_1.default.existsSync(path_1.default.join(testPath, 'index.html'))) {
            frontendPath = testPath;
            break;
        }
    }
    if (frontendPath) {
        const indexPath = path_1.default.join(frontendPath, 'index.html');
        console.log(`[STATIC] Serving frontend from: ${frontendPath}`);
        console.log(`[STATIC] Index file: ${indexPath}`);
        // Log all files in the frontend dist directory
        try {
            const files = fs_1.default.readdirSync(frontendPath);
            console.log(`[STATIC] Frontend dist contents: ${files.join(', ')}`);
            const alienPath = path_1.default.join(frontendPath, 'molt-alien.png');
            console.log(`[STATIC] Alien image exists: ${fs_1.default.existsSync(alienPath)}`);
        }
        catch (e) {
            console.error('Error listing frontend files:', e);
        }
        // Serve versioned static assets aggressively, but keep the HTML shell
        // fresh so browsers pick up new bundles after deploys.
        app.use(express_1.default.static(frontendPath, {
            maxAge: '1y',
            etag: true,
            index: false,
            setHeaders: (res, filePath) => {
                if (path_1.default.extname(filePath).toLowerCase() === '.html') {
                    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
                    return;
                }
                res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
            },
        }));
        // Catch-all handler: send back React's index.html file for client-side routing
        // But skip API routes and static file extensions
        app.get('*', (req, res) => {
            // Skip API routes
            if (req.originalUrl.startsWith('/api')) {
                return res.status(404).json({ error: 'Not found' });
            }
            // Skip static file extensions (they should be handled by express.static above)
            const staticExtensions = ['.png', '.jpg', '.jpeg', '.gif', '.svg', '.ico', '.css', '.js', '.woff', '.woff2', '.ttf', '.eot'];
            const hasStaticExtension = staticExtensions.some(ext => req.originalUrl.toLowerCase().endsWith(ext));
            if (hasStaticExtension) {
                return res.status(404).send('Static file not found');
            }
            res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
            res.sendFile(indexPath, (err) => {
                if (err) {
                    console.error('Error serving index.html:', err);
                    res.status(500).send('Error loading application');
                }
            });
        });
    }
    else {
        console.error('[ERROR] Frontend directory not found. Tried paths:');
        possiblePaths.forEach(p => {
            console.error(`   - ${p} (exists: ${fs_1.default.existsSync(p)})`);
        });
        app.get('*', (req, res) => {
            if (req.originalUrl.startsWith('/api')) {
                return res.status(404).json({ error: 'Not found' });
            }
            res.status(503).send('Frontend not available');
        });
    }
    const server = http_1.default.createServer(app);
    // Initialize Socket.io for real-time updates
    exports.io = new socket_io_1.Server(server, {
        cors: {
            origin: '*',
            methods: ['GET', 'POST']
        },
        path: '/socket.io'
    });
    exports.io.on('connection', (socket) => {
        console.log(`[SOCKET] Client connected: ${socket.id}`);
        // Join network room for network updates
        socket.on('join_network', () => {
            socket.join('network');
            console.log(`[SOCKET] Client ${socket.id} joined network room`);
        });
        socket.on('disconnect', () => {
            console.log(`[SOCKET] Client disconnected: ${socket.id}`);
        });
    });
    console.log('[SOCKET] Socket.io server initialized');
    const PORT = process.env.PORT || 4000;
    server.on('error', (error) => {
        console.error('[SERVER] Failed to bind HTTP server:', error);
        blockProducer.stop();
        agentWorker.stop();
        stopNetworkHeartbeat();
        githubUpdates.stopBackgroundSync();
        process.exitCode = 1;
        setTimeout(() => process.exit(1), 0);
    });
    server.listen(PORT, () => {
        console.log(`[SERVER] Running on http://localhost:${PORT}\n`);
        if (agentConfig.role === 'worker') {
            blockProducer.start();
            // Paced commit pusher — drains tier-3-backlog → main.
            // No-ops without PACED_PUSH_ENABLED=true and GITHUB_TOKEN.
            void Promise.resolve().then(() => __importStar(require('../agent/PacedPusher'))).then(({ PacedPusher }) => {
                const pacer = new PacedPusher(agentConfig.repoRoot || process.cwd());
                pacer.start();
            }).catch((err) => console.warn('[PACER] failed to load:', err?.message || err));
        }
    });
    process.on('SIGINT', () => {
        console.log('\n[SHUTDOWN] Stopping services...');
        blockProducer.stop();
        agentWorker.stop();
        stopNetworkHeartbeat();
        githubUpdates.stopBackgroundSync();
        db_1.db.end();
        process.exit(0);
    });
}
main().catch(console.error);
//# sourceMappingURL=server.js.map