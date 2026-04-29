import http from 'http';
import { Chain } from './blockchain/Chain';
import { TransactionPool } from './blockchain/TransactionPool';
import { BlockProducer } from './blockchain/BlockProducer';
import { ValidatorManager } from './validators/ValidatorManager';
import { EventBus } from './events/EventBus';
import { stateManager } from './blockchain/StateManager';
import { db } from './database/db';
import { createTables } from './database/schema';
import { applyPendingMigrations } from './database/migrations';
import {
  configureAgentSubsystems,
  createAgentConfig,
  agentEvents,
  agentRuntimeStore,
  agentTaskStore,
  skillManager,
  agentWorker,
  githubUpdates,
} from './agent';
import {
  initializeLogsTable,
  addLog,
} from './api/logs';
import {
  initializeNetworkStore,
  startNetworkHeartbeat,
  stopNetworkHeartbeat,
} from './api/network';
import { getHermesConfigStatus } from './llm/hermesClient';

process.env.AGENT_ROLE = 'worker';

async function main() {
  const hermesConfig = getHermesConfigStatus();
  const role = 'worker';

  console.log('[WORKER] Starting Hermeschain worker runtime');
  console.log(`   LLM_PROVIDER: ${hermesConfig.provider}`);
  console.log(`   ANTHROPIC_API_KEY: ${hermesConfig.configured ? '[OK]' : '[--]'}`);
  console.log(`   HERMES_MODEL: ${hermesConfig.model}`);
  console.log(`   AGENT_ROLE: ${role}`);

  const connected = await db.connect();
  if (connected) {
    await db.exec(createTables);
    await applyPendingMigrations();
    console.log('[WORKER] Database ready');
  }

  const eventBus = EventBus.getInstance();
  const chain = new Chain();
  const txPool = new TransactionPool();
  const validatorManager = new ValidatorManager();
  const blockProducer = new BlockProducer(chain, txPool, validatorManager, eventBus);

  await chain.initialize();
  await txPool.initialize();
  await stateManager.initialize();
  await validatorManager.initialize();
  await initializeLogsTable();
  await initializeNetworkStore();

  (global as any).transactionPool = txPool;
  (global as any).addLog = addLog;

  const agentConfig = createAgentConfig(process.cwd());
  configureAgentSubsystems(agentConfig);
  await skillManager.initialize();
  await agentTaskStore.initialize();
  await agentRuntimeStore.initialize();
  await githubUpdates.initialize(agentConfig.repoRoot || process.cwd());
  githubUpdates.startBackgroundSync();

  let currentTaskId: string | undefined;
  let currentTaskTitle: string | undefined;

  agentEvents.on('chunk', (chunk: any) => {
    try {
      switch (chunk.type) {
        case 'task_start':
          currentTaskId = chunk.data?.task?.id;
          currentTaskTitle = chunk.data?.task?.title;
          addLog(
            'task_start',
            `Starting: ${chunk.data?.task?.title || 'Unknown task'}`,
            currentTaskId,
            currentTaskTitle,
            chunk.data
          );
          break;
        case 'task_complete':
          addLog(
            'task_complete',
            `Completed: ${chunk.data?.title || currentTaskTitle || 'Unknown task'}`,
            chunk.data?.taskId || currentTaskId,
            chunk.data?.title || currentTaskTitle,
            chunk.data
          );
          currentTaskId = undefined;
          currentTaskTitle = undefined;
          break;
        case 'tool_start':
          addLog(
            'tool_use',
            `Using tool: ${chunk.data?.tool}`,
            currentTaskId,
            currentTaskTitle,
            chunk.data
          );
          break;
        case 'tool_result':
          addLog(
            'tool_result',
            `Tool finished: ${chunk.data?.tool}`,
            currentTaskId,
            currentTaskTitle,
            chunk.data
          );
          break;
        case 'analysis_start':
          addLog(
            'analysis_start',
            `Analyzing: ${currentTaskTitle || chunk.data?.taskId || 'task'}`,
            currentTaskId,
            currentTaskTitle,
            chunk.data
          );
          break;
        case 'verification_start':
          addLog(
            'verification_start',
            `Verifying: ${currentTaskTitle || chunk.data?.sourceTaskId || 'task'}`,
            currentTaskId,
            currentTaskTitle,
            chunk.data
          );
          break;
        case 'verification_result':
          addLog(
            'verification_result',
            chunk.data?.summary || chunk.data?.failureReason || chunk.data?.step || 'Verification update',
            currentTaskId,
            currentTaskTitle,
            chunk.data
          );
          break;
        case 'task_blocked':
          addLog(
            'task_blocked',
            chunk.data?.reason || 'Task blocked',
            chunk.data?.taskId || currentTaskId,
            currentTaskTitle,
            chunk.data
          );
          currentTaskId = undefined;
          currentTaskTitle = undefined;
          break;
        case 'git_deploy':
          addLog(
            'git_commit',
            `Deployed commit ${chunk.data?.commit} to ${chunk.data?.branch || 'main'}`,
            chunk.data?.taskId,
            currentTaskTitle,
            chunk.data
          );
          break;
        case 'error':
          addLog(
            'error',
            chunk.data?.message || 'Unknown error',
            currentTaskId,
            currentTaskTitle,
            chunk.data
          );
          break;
        case 'text':
          if (chunk.data && chunk.data.length > 10) {
            addLog('output', chunk.data, currentTaskId, currentTaskTitle);
          }
          break;
      }
    } catch {
      // Keep worker logging non-fatal.
    }
  });

  await startNetworkHeartbeat();

  if (agentConfig.autorunEnabled && agentConfig.effectiveMode !== 'disabled') {
    void agentWorker.start().catch((error) => {
      console.error('[WORKER] Agent worker failed to start:', error);
    });
  }

  // Paced commit pusher — drains tier-3-backlog → main at controlled cadence.
  // No-ops unless PACED_PUSH_ENABLED=true and GITHUB_TOKEN set.
  const { PacedPusher } = await import('./agent/PacedPusher');
  const pacer = new PacedPusher(agentConfig.repoRoot || process.cwd());
  pacer.start();

  blockProducer.start();

  const port = Number(process.env.PORT || 4000);
  const server = http.createServer((req, res) => {
    if (req.url === '/health' || req.url === '/status') {
      const snapshot = agentRuntimeStore.getLatestSnapshot();
      const recentRuns = agentTaskStore.getRecentRuns
        ? agentTaskStore.getRecentRuns(10)
        : [];
      const recentSuccessful = agentTaskStore.getRecentSuccessfulRuns
        ? agentTaskStore.getRecentSuccessfulRuns(5)
        : [];
      const recentFailed = agentTaskStore.getRecentFailedRuns
        ? agentTaskStore.getRecentFailedRuns(5)
        : [];
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(
        JSON.stringify({
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
        })
      );
      return;
    }

    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Not found' }));
  });

  server.on('error', (error) => {
    console.error('[WORKER] Failed to bind health server:', error);
    blockProducer.stop();
    agentWorker.stop();
    stopNetworkHeartbeat();
    githubUpdates.stopBackgroundSync();
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
    agentWorker.stop();
    stopNetworkHeartbeat();
    githubUpdates.stopBackgroundSync();
    await db.end();
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
