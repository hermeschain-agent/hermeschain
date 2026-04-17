import express from 'express';
import cors from 'cors';
import http from 'http';
import path from 'path';
import fs from 'fs';
import { Server as SocketIOServer } from 'socket.io';
import { Chain } from '../blockchain/Chain';
import { TransactionPool } from '../blockchain/TransactionPool';
import { BlockProducer } from '../blockchain/BlockProducer';
import { ValidatorManager } from '../validators/ValidatorManager';
import { EventBus } from '../events/EventBus';
import { stateManager } from '../blockchain/StateManager';
import { db, cache } from '../database/db';
import { createTables } from '../database/schema';
import { getHermesConfigStatus, getPublicHermesError } from '../llm/hermesClient';
import * as dotenv from 'dotenv';

dotenv.config();

// Global Socket.io instance for real-time updates
export let io: SocketIOServer | null = null;

async function main() {
  const hermesConfig = getHermesConfigStatus();
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
    const connected = await db.connect();
    if (connected) {
      // Create tables if they don't exist
      await db.exec(createTables);
      console.log('[DB] PostgreSQL database ready\n');
    } else {
      console.log('[DB] Running without persistent database\n');
    }
  } catch (error) {
    console.error('[DB] Database setup warning:', error);
    console.log('Continuing with in-memory fallback...\n');
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
  (global as any).transactionPool = txPool;
  
  console.log('[STATE] Initial state loaded:');
  console.log(`   State Root: ${stateManager.getStateRoot().substring(0, 20)}...`);
  console.log(`   Total Supply: ${stateManager.formatBalance(stateManager.getTotalSupply())}`);
  console.log(`   Circulating: ${stateManager.formatBalance(stateManager.getCirculatingSupply())}\n`);

  const app = express();
  app.use(cors());
  app.use(express.json());

  const syncSharedReadState = async () => {
    if (process.env.AGENT_ROLE === 'worker') return;
    await chain.refreshFromDb();
    await stateManager.refreshAllAccounts();
    await txPool.getPendingTransactions(200);
  };

  const { authRouter, initializeAuthTables, ipRateLimit, requireApiKey } =
    await import('./auth');
  await initializeAuthTables();
  app.use('/api/auth', authRouter);
  console.log('[AUTH] Authentication system ready');

  // Health check endpoint for Railway
  app.get('/health', (req, res) => {
    res.status(200).json({ status: 'ok' });
  });

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
      redisConnected: cache.isConnected(),
      stateRoot: stateManager.getStateRoot(),
      totalSupply: stateManager.getTotalSupply().toString(),
      circulatingSupply: stateManager.getCirculatingSupply().toString()
    });
  });

  // State endpoints
  app.get('/api/state', async (req, res) => {
    await syncSharedReadState();
    res.json({
      stateRoot: stateManager.getStateRoot(),
      totalSupply: stateManager.formatBalance(stateManager.getTotalSupply()),
      circulatingSupply: stateManager.formatBalance(stateManager.getCirculatingSupply()),
      accounts: stateManager.getAccountsSummary().slice(0, 20)
    });
  });

  app.get('/api/state/account/:address', async (req, res) => {
    await stateManager.refreshAccount(req.params.address);
    const account = stateManager.getAccount(req.params.address);
    if (account) {
      res.json({
        address: account.address,
        balance: stateManager.formatBalance(account.balance),
        balanceRaw: account.balance.toString(),
        nonce: account.nonce
      });
    } else {
      res.json({
        address: req.params.address,
        balance: '0 OPEN',
        balanceRaw: '0',
        nonce: 0
      });
    }
  });

  app.get('/api/state/balance/:address', async (req, res) => {
    await stateManager.refreshAccount(req.params.address);
    const balance = stateManager.getBalance(req.params.address);
    res.json({
      address: req.params.address,
      balance: stateManager.formatBalance(balance),
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
    } else {
      res.status(404).json({ error: 'Block not found' });
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
      const { from, to, value, gasPrice, gasLimit, nonce, data, signature } = req.body;
      
      // Generate Solana-style base58 transaction hash
      const BASE58 = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
      const txHash = Array.from({length: 44}, () => BASE58[Math.floor(Math.random() * 58)]).join('');
      
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
      } else {
        res.status(400).json({ error: 'Invalid transaction' });
      }
    } catch (error) {
      res.status(500).json({ error: (error as Error).message });
    }
  });

  app.post('/api/chat/:validator', async (req, res) => {
    try {
      const validatorName = req.params.validator.toUpperCase();
      const { message } = req.body;
      
      const validators = validatorManager.getAllValidators();
      // Find validator by name (handles both "OPEN" and "HERMES VALIDATOR" etc)
      const validator = validators.find(v => 
        v.name === validatorName || 
        v.name.includes(validatorName) ||
        validatorName.includes('OPEN')
      );
      
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
      
      await db.query(`
        INSERT INTO chat_logs (validator_address, role, content)
        VALUES ($1, 'user', $2), ($1, 'assistant', $3)
      `, [validator.address, message, response]);
      
      res.json({ response });
    } catch (error) {
      console.error('Chat error:', error);
      res.status(500).json({ error: (error as Error).message });
    }
  });

  // Terminal chat endpoint — powered by Nous Hermes
  app.post('/api/personality/:validator', ipRateLimit(20), async (req, res) => {
    try {
      // Accept both 'message' and 'command' for flexibility
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
      
      // Merge context from request with chain state
      const context = {
        blockHeight: userContext.blockHeight || chain.getChainLength(),
        tps: userContext.tps || txPool.getPendingCount(),
        validators: validators.length,
        gasPrice: userContext.gasPrice || 5,
        chainId: userContext.chainId || 1337
      };
      
      console.log('[TERMINAL] Chat request:', userMessage.substring(0, 50) + '...');
      const response = await validator.chat(userMessage, context);
      
      // Return in format frontend expects
      res.json({ message: response, response });
    } catch (error) {
      const providerError = getPublicHermesError(error);
      console.error('Terminal chat error:', error);
      res.status(providerError.status).json({
        error: providerError.message,
        code: providerError.code,
        providerError,
        message: providerError.message,
      });
    }
  });

  app.post('/api/personality/hermes/ritual', ipRateLimit(20), async (req, res) => {
    try {
      const ritual = req.body.ritual as
        | 'explain_last_block'
        | 'summarize_today'
        | 'guide_this_page'
        | undefined;
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
      const sourceRefs: Array<{ kind: 'block' | 'task' | 'log' | 'commit'; id: string }> = [];
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
        const { agentMemory } = await import('../agent');
        const { gitIntegration } = await import('../agent/GitIntegration');

        const recentTasks = agentMemory.getCompletedTasks(5);
        const recentLogsResult = await db
          .query(
            `
            SELECT id, type, content, timestamp
            FROM agent_logs
            ORDER BY timestamp DESC
            LIMIT 5
            `
          )
          .catch(() => ({ rows: [] as Array<{ id: string; type: string; content: string; timestamp: string }> }));

        const recentCommits = gitIntegration.getRecentCommits(3);
        const gitSummary = gitIntegration.getSummary();

        sourceRefs.push(
          ...recentTasks.slice(0, 2).map((task) => ({ kind: 'task' as const, id: task.id })),
          ...recentLogsResult.rows.slice(0, 2).map((log) => ({ kind: 'log' as const, id: log.id })),
          ...recentCommits.slice(0, 1).map((commit) => ({ kind: 'commit' as const, id: commit.shortHash }))
        );

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
        const pageGuides: Record<string, string> = {
          landing:
            'This is the main Hermeschain landing page. Visitors should understand the chain premise, run a ritual, and open either the explorer, chat, or logs next.',
          explorer:
            'This page is for inspecting blocks and raw chain state. Visitors should search by block height, inspect a recent block, and use the explain ritual when they need interpretation.',
          wallet:
            'This page helps visitors create or import a wallet, request faucet funds, and understand how OPEN moves through the chain.',
          logs:
            'This page is the raw activity stream. Visitors should watch task starts, tool calls, and completions to understand whether Hermes is actively building.',
          hermes:
            'This page is the direct chat surface. Visitors can continue a ritual thread or ask Hermes anything in freeform language.',
          network:
            'This page shows the broader agent presence around Hermeschain. It is secondary to the main agent workflow in this milestone.',
          updates:
            'This page reflects git state and recent commits so visitors can see whether the repository changed recently.',
          admin:
            'This page exposes internal dashboards and is mainly for operators, not first-time visitors.',
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
    } catch (error) {
      const providerError = getPublicHermesError(error);
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
  const { cipSubmitRouter } = await import('./cip-submit');
  app.use('/api/cip', cipSubmitRouter);
  console.log('[CIP] Submission system ready');

  // ========== USER AGENTS SYSTEM ==========
  const { agentsRouter } = await import('./agents');
  app.use('/api/agents', agentsRouter);
  console.log('[AGENTS] User agents system ready');

  // ========== WALLET & FAUCET SYSTEM ==========
  const { walletRouter } = await import('./wallet');
  app.use('/api/wallet', walletRouter);
  console.log('[WALLET] Wallet & faucet system ready');

  // ========== AGENT NETWORK ==========
  const {
    default: networkRouter,
    initializeNetworkStore,
    startNetworkHeartbeat,
    stopNetworkHeartbeat,
  } = await import('./network');
  await initializeNetworkStore();
  app.use('/api/network', networkRouter);
  console.log('[NETWORK] Multi-agent network ready');
  console.log('[x402] Payment protocol routes mounted at /api/network/x402/*');

  // Listen for network events and broadcast via Socket.io
  eventBus.on('network_message', (msg: any) => {
    if (io) {
      io.to('network').emit('new_message', {
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

  eventBus.on('network_vote', (data: any) => {
    if (io) {
      io.to('network').emit('vote_update', data);
    }
  });

  eventBus.on('network_topic', (data: any) => {
    if (io) {
      io.to('network').emit('new_topic', data);
    }
  });

  // ========== LOGS SYSTEM ==========
  const { logsRouter, initializeLogsTable, addLog } = await import('./logs');
  await initializeLogsTable();
  app.use('/api/logs', logsRouter);
  
  // Make addLog available globally for agent logging
  (global as any).addLog = addLog;
  console.log('[LOGS] Logs system ready');

  // ========== SKILLS + AGENT CONFIG ==========
  const {
    createAgentConfig,
    configureAgentSubsystems,
    skillManager,
    agentWorker,
    agentEvents,
    agentMemory,
    agentTaskStore,
    agentRuntimeStore,
    taskSources,
    gitIntegration,
  } = await import('../agent');
  const agentConfig = createAgentConfig(process.cwd());
  configureAgentSubsystems(agentConfig);
  await skillManager.initialize();
  await agentTaskStore.initialize();
  await agentRuntimeStore.initialize();

  if (agentConfig.role === 'worker') {
    await startNetworkHeartbeat();
  } else {
    stopNetworkHeartbeat();
  }

  // ========== ADMIN DASHBOARD ==========
  const { adminRouter } = await import('./admin');
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
    } else {
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
  const { playgroundRouter } = await import('./playground');
  app.use('/api/playground', playgroundRouter);
  console.log('[WORKSHOP] Playground system ready');
  // ========== END PLAYGROUND SYSTEM ==========

  // ========== AUTONOMOUS AGENT WORKER SYSTEM ==========
  // Track connected SSE clients
  let agentViewerCount = 0;

  const parseGitLogEntry = (row: any) => {
    const metadata = row.metadata || {};
    const shortHash =
      metadata.commit ||
      row.content?.match(/commit\s+([a-f0-9]{7,40})/i)?.[1] ||
      'unknown';

    return {
      hash: metadata.fullHash || shortHash,
      shortHash,
      message: metadata.message || row.content || 'Recent git activity',
      author: metadata.author || 'Hermes',
      date:
        typeof row.timestamp === 'string'
          ? row.timestamp
          : new Date(row.timestamp || Date.now()).toISOString(),
    };
  };

  const getSharedGitSnapshot = async (limit: number = 5) => {
    const sharedRuntime = agentRuntimeStore.getLatestSnapshot();
    const result = await db
      .query(
        `
        SELECT timestamp, content, metadata
        FROM agent_logs
        WHERE type = 'git_commit'
        ORDER BY timestamp DESC
        LIMIT $1
        `,
        [limit]
      )
      .catch(() => ({ rows: [] as any[] }));

    return {
      role: agentConfig.role,
      gitAvailable:
        sharedRuntime?.capabilities?.git === 'ready' || agentConfig.gitAvailable,
      pushAvailable:
        sharedRuntime?.capabilities?.push === 'ready' || agentConfig.pushAvailable,
      branch: agentConfig.gitAvailable ? gitIntegration.getCurrentBranch() : 'unavailable',
      clean: agentConfig.gitAvailable ? gitIntegration.getStatus().clean : true,
      changes: agentConfig.gitAvailable ? gitIntegration.getStatus().changes : [],
      staged: agentConfig.gitAvailable ? gitIntegration.getStatus().staged : [],
      recentCommits: (result.rows || []).map(parseGitLogEntry),
      summary:
        agentConfig.gitAvailable
          ? gitIntegration.getSummary()
          : sharedRuntime?.capabilities?.push === 'unavailable'
            ? 'Worker runtime is active, but git push is unavailable in this environment.'
            : 'Git activity is being observed from the shared worker runtime.',
    };
  };

  const formatLogStreamText = (row: any): string => {
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
    const observedRuntime =
      agentConfig.role === 'web' && sharedRuntime
        ? sharedRuntime
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
            workerHeartbeatAt:
              agentConfig.role === 'worker' ? new Date().toISOString() : null,
          };
    const workerHeartbeatAt =
      observedRuntime.workerHeartbeatAt || observedRuntime.updatedAt || null;
    const workerActive = workerHeartbeatAt
      ? Date.now() - new Date(workerHeartbeatAt).getTime() < 90_000
      : false;
    const currentRun = agentTaskStore.getCurrentRun();
    const recentRuns = agentTaskStore.getRecentRuns(20);
    const recentSuccessfulRuns = recentRuns.filter((run) => run.status === 'succeeded').slice(0, 5);

    return {
      role: agentConfig.role,
      serviceRole: agentConfig.role,
      observedWorkerRole: observedRuntime.role,
      statusSource: agentConfig.role === 'web' && sharedRuntime ? 'shared' : 'local',
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
    };
  };
  
  // SSE endpoint for live agent work streaming
  app.get('/api/agent/stream', (req, res) => {
    // Set up SSE headers
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.flushHeaders();
    
    agentViewerCount++;
    console.log(`[AGENT] New viewer connected (total: ${agentViewerCount})`);
    
    void buildAgentStatusPayload().then((payload) => {
      res.write(`data: ${JSON.stringify({
        type: 'init',
        data: payload,
        timestamp: Date.now()
      })}\n\n`);
    }).catch(() => {
      res.write(`data: ${JSON.stringify({
        type: 'init',
        data: {
          error: 'Failed to build shared agent status payload.',
        },
        timestamp: Date.now()
      })}\n\n`);
    });
    
    // Subscribe to agent events
    const onChunk = (chunk: any) => {
      try {
        res.write(`data: ${JSON.stringify({ ...chunk, viewerCount: agentViewerCount })}\n\n`);
      } catch (e) {
        // Client disconnected
      }
    };
    
    agentEvents.on('chunk', onChunk);
    let lastLogSeenAt = new Date(Date.now() - 60 * 1000);

    const statusPulse = setInterval(() => {
      void buildAgentStatusPayload()
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
      if (agentConfig.role !== 'web') return;

      try {
        const result = await db.query(
          `
          SELECT id, timestamp, type, content, metadata
          FROM agent_logs
          WHERE timestamp > $1
          ORDER BY timestamp ASC
          LIMIT 50
          `,
          [lastLogSeenAt]
        );

        for (const row of result.rows || []) {
          lastLogSeenAt = new Date(row.timestamp);
          res.write(
            `data: ${JSON.stringify({
              type: 'text',
              data: formatLogStreamText(row),
              viewerCount: agentViewerCount,
              timestamp: Date.now(),
            })}\n\n`
          );
        }
      } catch {
        // Shared worker logs are best-effort here; status pulses still keep the rail honest.
      }
    }, 5000);
    
    // Send heartbeat every 10 seconds
    const heartbeat = setInterval(() => {
      try {
        res.write(`data: ${JSON.stringify({ type: 'heartbeat', timestamp: Date.now(), viewerCount: agentViewerCount })}\n\n`);
      } catch (e) {
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
  const WORKER_INTERNAL_URL =
    process.env.WORKER_INTERNAL_URL ||
    'http://hermeschain-worker.railway.internal:4000';

  app.get('/api/agent/status', async (req, res) => {
    if (process.env.AGENT_ROLE !== 'worker') {
      try {
        const controller = new AbortController();
        const t = setTimeout(() => controller.abort(), 4000);
        const upstream = await fetch(`${WORKER_INTERNAL_URL}/status`, {
          signal: controller.signal,
        });
        clearTimeout(t);
        if (upstream.ok) {
          const workerData: any = await upstream.json();
          // Merge worker runtime state into the web's own payload shape so
          // frontend components keep working without changes.
          const localPayload = await buildAgentStatusPayload();
          res.json({
            ...localPayload,
            mode: workerData.agentMode || localPayload.mode,
            streamMode: workerData.agentMode || localPayload.streamMode,
            runStatus: workerData.runStatus || localPayload.runStatus,
            verificationStatus:
              workerData.verificationStatus || localPayload.verificationStatus,
            isWorking: workerData.isWorking ?? localPayload.isWorking,
            currentTask: workerData.currentTask || localPayload.currentTask,
            lastFailure: workerData.lastFailure || localPayload.lastFailure,
            blockedReason:
              workerData.blockedReason || localPayload.blockedReason,
            recentTasks: (workerData.recentSuccessful || []).slice(0, 5).map(
              (r: any) => ({
                title: r.title,
                agent: r.agent || 'HERMES',
                completedAt: r.completedAt,
              })
            ),
            recentRuns: workerData.recentRuns || [],
            completedTaskCount: (workerData.recentSuccessful || []).length,
            agentEnabled: true,
            capabilities: workerData.capabilities || localPayload.capabilities,
            blockHeight: workerData.blockHeight ?? localPayload.blockHeight,
          });
          return;
        }
      } catch {
        // Fall through to local payload when the worker is unreachable.
      }
    }
    res.json(await buildAgentStatusPayload());
  });

  // Get persisted task runs (plus legacy completed-task alias)
  app.get('/api/agent/history', (req, res) => {
    const limit = parseInt(req.query.limit as string) || 20;
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
    const limit = parseInt(req.query.limit as string) || 20;
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
    const limit = Math.min(parseInt(req.query.limit as string) || 40, 200);
    const query = String(req.query.query || '').trim().toLowerCase();
    try {
      const conditions: string[] = [];
      const params: any[] = [];

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
      const countResult = await db.query(
        `
        SELECT COUNT(*)::int AS count
        FROM transactions t
        LEFT JOIN blocks b ON b.height = t.block_height
        ${where}
        `,
        countParams
      );
      const result = await db.query(
        `
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
        `,
        params
      );

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
    } catch (error) {
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
      const { gitIntegration } = await import('../agent/GitIntegration');
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
    const { ciMonitor } = await import('../agent/CIMonitor');
    const status = ciMonitor.getStatus();
    res.json(status);
  });

  // Run CI checks manually
  app.post('/api/ci/run', async (req, res) => {
    const { ciMonitor } = await import('../agent/CIMonitor');
    const results = await ciMonitor.runAllChecks();
    res.json(results);
  });

  // Task sources status
  app.get('/api/tasks/pending', async (req, res) => {
    const { taskSources } = await import('../agent/TaskSources');
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
    const {
      TASK_BACKLOG,
      BACKLOG_PHASES,
      COMMIT_WINDOW_MINUTES,
      getRuntimeCommitWindowMinutes,
      TARGET_COMMIT_HOURS,
      TARGET_COMMIT_WINDOWS,
      getOrderedBacklog,
      getTotalEstimatedTime,
    } = await import('../agent/TaskBacklog');
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
  if (
    agentConfig.role === 'worker' &&
    agentConfig.autorunEnabled &&
    agentConfig.effectiveMode !== 'disabled'
  ) {
    void agentWorker.start().catch((error) => {
      console.error('[AGENT] Worker failed to start:', error);
    });
    console.log(
      `[AGENT] Autonomous agent worker started in ${agentConfig.effectiveMode} mode (${agentConfig.role} role)`
    );
  } else {
    console.log(
      `[AGENT] Worker not started (role=${agentConfig.role}, autorun=${agentConfig.autorunEnabled}, effectiveMode=${agentConfig.effectiveMode})`
    );
  }
  
  // Set up logging for agent events
  let currentTaskId: string | undefined;
  let currentTaskTitle: string | undefined;
  
  agentEvents.on('chunk', (chunk: any) => {
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
          addLog(
            'verification_result',
            chunk.data?.summary || chunk.data?.failureReason || chunk.data?.step || 'Verification update',
            currentTaskId,
            currentTaskTitle,
            chunk.data
          );
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
    } catch (e) {
      // Ignore logging errors
    }
  });
  
  // ========== END AGENT WORKER SYSTEM ==========

  // Serve frontend static files
  // Try multiple possible paths (check absolute first for production)
  const possiblePaths = [
    '/app/frontend/dist',                              // Absolute production path
    path.resolve(process.cwd(), 'frontend/dist'),     // From app root
    path.resolve(__dirname, '../../frontend/dist'),    // From /app/backend/dist/api
    path.resolve(__dirname, '../../../frontend/dist')  // Alternative
  ];
  
  let frontendPath: string | null = null;
  for (const testPath of possiblePaths) {
    if (fs.existsSync(testPath) && fs.existsSync(path.join(testPath, 'index.html'))) {
      frontendPath = testPath;
      break;
    }
  }
  
  if (frontendPath) {
    const indexPath = path.join(frontendPath, 'index.html');
    console.log(`[STATIC] Serving frontend from: ${frontendPath}`);
    console.log(`[STATIC] Index file: ${indexPath}`);
    
    // Log all files in the frontend dist directory
    try {
      const files = fs.readdirSync(frontendPath);
      console.log(`[STATIC] Frontend dist contents: ${files.join(', ')}`);
      const alienPath = path.join(frontendPath, 'molt-alien.png');
      console.log(`[STATIC] Alien image exists: ${fs.existsSync(alienPath)}`);
    } catch (e) {
      console.error('Error listing frontend files:', e);
    }
    
    // Serve static files first (images, CSS, JS, etc.)
    app.use(express.static(frontendPath, {
      maxAge: '1y',
      etag: true
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
      
      res.sendFile(indexPath, (err) => {
        if (err) {
          console.error('Error serving index.html:', err);
          res.status(500).send('Error loading application');
        }
      });
    });
  } else {
    console.error('[ERROR] Frontend directory not found. Tried paths:');
    possiblePaths.forEach(p => {
      console.error(`   - ${p} (exists: ${fs.existsSync(p)})`);
    });
    app.get('*', (req, res) => {
      if (req.originalUrl.startsWith('/api')) {
        return res.status(404).json({ error: 'Not found' });
      }
      res.status(503).send('Frontend not available');
    });
  }

  const server = http.createServer(app);

  // Initialize Socket.io for real-time updates
  io = new SocketIOServer(server, {
    cors: {
      origin: '*',
      methods: ['GET', 'POST']
    },
    path: '/socket.io'
  });

  io.on('connection', (socket) => {
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
    process.exitCode = 1;
    setTimeout(() => process.exit(1), 0);
  });

  server.listen(PORT, () => {
    console.log(`[SERVER] Running on http://localhost:${PORT}\n`);
    if (agentConfig.role === 'worker') {
      blockProducer.start();
    }
  });

  process.on('SIGINT', () => {
    console.log('\n[SHUTDOWN] Stopping services...');
    blockProducer.stop();
    agentWorker.stop();
    stopNetworkHeartbeat();
    db.end();
    process.exit(0);
  });
}

main().catch(console.error);
