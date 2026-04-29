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
const http_1 = __importDefault(require("http"));
const Chain_1 = require("./blockchain/Chain");
const TransactionPool_1 = require("./blockchain/TransactionPool");
const BlockProducer_1 = require("./blockchain/BlockProducer");
const ValidatorManager_1 = require("./validators/ValidatorManager");
const EventBus_1 = require("./events/EventBus");
const StateManager_1 = require("./blockchain/StateManager");
const db_1 = require("./database/db");
const schema_1 = require("./database/schema");
const migrations_1 = require("./database/migrations");
const agent_1 = require("./agent");
const logs_1 = require("./api/logs");
const network_1 = require("./api/network");
const hermesClient_1 = require("./llm/hermesClient");
process.env.AGENT_ROLE = 'worker';
async function main() {
    const hermesConfig = (0, hermesClient_1.getHermesConfigStatus)();
    const role = 'worker';
    console.log('[WORKER] Starting Hermeschain worker runtime');
    console.log(`   LLM_PROVIDER: ${hermesConfig.provider}`);
    console.log(`   ANTHROPIC_API_KEY: ${hermesConfig.configured ? '[OK]' : '[--]'}`);
    console.log(`   HERMES_MODEL: ${hermesConfig.model}`);
    console.log(`   AGENT_ROLE: ${role}`);
    const connected = await db_1.db.connect();
    if (connected) {
        await db_1.db.exec(schema_1.createTables);
        await (0, migrations_1.applyPendingMigrations)();
        console.log('[WORKER] Database ready');
    }
    const eventBus = EventBus_1.EventBus.getInstance();
    const chain = new Chain_1.Chain();
    const txPool = new TransactionPool_1.TransactionPool();
    const validatorManager = new ValidatorManager_1.ValidatorManager();
    const blockProducer = new BlockProducer_1.BlockProducer(chain, txPool, validatorManager, eventBus);
    await chain.initialize();
    await txPool.initialize();
    await StateManager_1.stateManager.initialize();
    await validatorManager.initialize();
    await (0, logs_1.initializeLogsTable)();
    await (0, network_1.initializeNetworkStore)();
    global.transactionPool = txPool;
    global.addLog = logs_1.addLog;
    const agentConfig = (0, agent_1.createAgentConfig)(process.cwd());
    (0, agent_1.configureAgentSubsystems)(agentConfig);
    await agent_1.skillManager.initialize();
    await agent_1.agentTaskStore.initialize();
    await agent_1.agentRuntimeStore.initialize();
    await agent_1.githubUpdates.initialize(agentConfig.repoRoot || process.cwd());
    agent_1.githubUpdates.startBackgroundSync();
    let currentTaskId;
    let currentTaskTitle;
    agent_1.agentEvents.on('chunk', (chunk) => {
        try {
            switch (chunk.type) {
                case 'task_start':
                    currentTaskId = chunk.data?.task?.id;
                    currentTaskTitle = chunk.data?.task?.title;
                    (0, logs_1.addLog)('task_start', `Starting: ${chunk.data?.task?.title || 'Unknown task'}`, currentTaskId, currentTaskTitle, chunk.data);
                    break;
                case 'task_complete':
                    (0, logs_1.addLog)('task_complete', `Completed: ${chunk.data?.title || currentTaskTitle || 'Unknown task'}`, chunk.data?.taskId || currentTaskId, chunk.data?.title || currentTaskTitle, chunk.data);
                    currentTaskId = undefined;
                    currentTaskTitle = undefined;
                    break;
                case 'tool_start':
                    (0, logs_1.addLog)('tool_use', `Using tool: ${chunk.data?.tool}`, currentTaskId, currentTaskTitle, chunk.data);
                    break;
                case 'tool_result':
                    (0, logs_1.addLog)('tool_result', `Tool finished: ${chunk.data?.tool}`, currentTaskId, currentTaskTitle, chunk.data);
                    break;
                case 'analysis_start':
                    (0, logs_1.addLog)('analysis_start', `Analyzing: ${currentTaskTitle || chunk.data?.taskId || 'task'}`, currentTaskId, currentTaskTitle, chunk.data);
                    break;
                case 'verification_start':
                    (0, logs_1.addLog)('verification_start', `Verifying: ${currentTaskTitle || chunk.data?.sourceTaskId || 'task'}`, currentTaskId, currentTaskTitle, chunk.data);
                    break;
                case 'verification_result':
                    (0, logs_1.addLog)('verification_result', chunk.data?.summary || chunk.data?.failureReason || chunk.data?.step || 'Verification update', currentTaskId, currentTaskTitle, chunk.data);
                    break;
                case 'task_blocked':
                    (0, logs_1.addLog)('task_blocked', chunk.data?.reason || 'Task blocked', chunk.data?.taskId || currentTaskId, currentTaskTitle, chunk.data);
                    currentTaskId = undefined;
                    currentTaskTitle = undefined;
                    break;
                case 'git_deploy':
                    (0, logs_1.addLog)('git_commit', `Deployed commit ${chunk.data?.commit} to ${chunk.data?.branch || 'main'}`, chunk.data?.taskId, currentTaskTitle, chunk.data);
                    break;
                case 'error':
                    (0, logs_1.addLog)('error', chunk.data?.message || 'Unknown error', currentTaskId, currentTaskTitle, chunk.data);
                    break;
                case 'text':
                    if (chunk.data && chunk.data.length > 10) {
                        (0, logs_1.addLog)('output', chunk.data, currentTaskId, currentTaskTitle);
                    }
                    break;
            }
        }
        catch {
            // Keep worker logging non-fatal.
        }
    });
    await (0, network_1.startNetworkHeartbeat)();
    if (agentConfig.autorunEnabled && agentConfig.effectiveMode !== 'disabled') {
        void agent_1.agentWorker.start().catch((error) => {
            console.error('[WORKER] Agent worker failed to start:', error);
        });
    }
    // Paced commit pusher — drains tier-3-backlog → main at controlled cadence.
    // No-ops unless PACED_PUSH_ENABLED=true and GITHUB_TOKEN set.
    const { PacedPusher } = await Promise.resolve().then(() => __importStar(require('./agent/PacedPusher')));
    const pacer = new PacedPusher(agentConfig.repoRoot || process.cwd());
    pacer.start();
    blockProducer.start();
    const port = Number(process.env.PORT || 4000);
    const server = http_1.default.createServer((req, res) => {
        if (req.url === '/health' || req.url === '/status') {
            const snapshot = agent_1.agentRuntimeStore.getLatestSnapshot();
            const recentRuns = agent_1.agentTaskStore.getRecentRuns
                ? agent_1.agentTaskStore.getRecentRuns(10)
                : [];
            const recentSuccessful = agent_1.agentTaskStore.getRecentSuccessfulRuns
                ? agent_1.agentTaskStore.getRecentSuccessfulRuns(5)
                : [];
            const recentFailed = agent_1.agentTaskStore.getRecentFailedRuns
                ? agent_1.agentTaskStore.getRecentFailedRuns(5)
                : [];
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({
                status: 'ok',
                serviceRole: 'worker',
                workerActive: true,
                blockHeight: chain.getChainLength(),
                pendingTransactions: txPool.getPendingCount(),
                llmProvider: hermesConfig.provider,
                llmConfigured: hermesConfig.configured,
                agentMode: snapshot?.mode || agentConfig.effectiveMode,
                runStatus: snapshot?.runStatus || 'idle',
                verificationStatus: snapshot?.verificationStatus || null,
                isWorking: snapshot?.isWorking || false,
                currentTask: snapshot?.currentTask || null,
                lastFailure: snapshot?.lastFailure || null,
                blockedReason: snapshot?.blockedReason || null,
                recentRuns,
                recentSuccessful,
                recentFailed,
                capabilities: snapshot?.capabilities || {
                    workspace: agentConfig.workspaceReady ? 'ready' : 'unavailable',
                    git: agentConfig.gitAvailable ? 'ready' : 'unavailable',
                    push: agentConfig.pushAvailable ? 'ready' : 'unavailable',
                    llm: agentConfig.modelConfigured ? 'ready' : 'unavailable',
                },
            }));
            return;
        }
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Not found' }));
    });
    server.on('error', (error) => {
        console.error('[WORKER] Failed to bind health server:', error);
        blockProducer.stop();
        agent_1.agentWorker.stop();
        (0, network_1.stopNetworkHeartbeat)();
        agent_1.githubUpdates.stopBackgroundSync();
        process.exitCode = 1;
        setTimeout(() => process.exit(1), 0);
    });
    server.listen(port, () => {
        console.log(`[WORKER] Health server running on http://localhost:${port}/health`);
    });
    const shutdown = async () => {
        console.log('[WORKER] Shutting down...');
        server.close();
        blockProducer.stop();
        agent_1.agentWorker.stop();
        (0, network_1.stopNetworkHeartbeat)();
        agent_1.githubUpdates.stopBackgroundSync();
        await db_1.db.end();
        process.exit(0);
    };
    process.on('SIGINT', () => {
        void shutdown();
    });
    process.on('SIGTERM', () => {
        void shutdown();
    });
}
main().catch((error) => {
    console.error('[WORKER] Fatal startup error:', error);
    process.exit(1);
});
//# sourceMappingURL=worker.js.map