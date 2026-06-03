const test = require('node:test');
const assert = require('node:assert/strict');
const { execSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const {
  resolveRepoRoot,
  createAgentConfig,
} = require('../dist/agent/config.js');
const { AgentExecutor } = require('../dist/agent/AgentExecutor.js');
const { AgentTaskStore, agentTaskStore } = require('../dist/agent/AgentTaskStore.js');
const { agentWorker } = require('../dist/agent/AgentWorker.js');
const { chainObserver } = require('../dist/agent/ChainObserver.js');
const { GitIntegration, gitIntegration } = require('../dist/agent/GitIntegration.js');
const { agentMemory } = require('../dist/agent/AgentMemory.js');
const { TaskSources } = require('../dist/agent/TaskSources.js');
const { TokenBudget } = require('../dist/agent/TokenBudget.js');
const { assessCommitQuality } = require('../dist/agent/CommitQuality.js');
const {
  githubCommitHref,
  normalizeAgentTimelineRow,
  sanitizeTimelineText,
} = require('../dist/api/agentTimeline.js');
const {
  buildCommitPlaybackEvents,
  chunkCommitDiff,
  decodeCommitPlaybackCursor,
  encodeCommitPlaybackCursor,
} = require('../dist/api/gitPlayback.js');
const {
  getPublishQueueConfig,
  refreshPublishQueueStatus,
  markQueuedCommitProcessed,
  setPublisherLeader,
  setAuthoringLeader,
  getLeadershipSnapshot,
} = require('../dist/agent/PublishQueue.js');
const {
  TASK_BACKLOG,
  BACKLOG_PHASES,
  COMMIT_WINDOW_MINUTES,
  TARGET_COMMIT_HOURS,
  TARGET_COMMIT_WINDOWS,
  getTotalEstimatedTime,
  getRuntimeCommitWindowMinutes,
} = require('../dist/agent/TaskBacklog.js');
const { EventBus } = require('../dist/events/EventBus.js');
const { db } = require('../dist/database/db.js');
const { applyPendingMigrations } = require('../dist/database/migrations.js');
const { createTables } = require('../dist/database/schema.js');

// The CI Postgres service starts empty; ensure the schema (including
// migration-created tables like agent_publish_cursor / agent_token_budget_state)
// exists before the DB-backed tests run. Harmless no-op when there is no real
// database (the in-memory fallback) — mirrors the app's boot sequence.
test.before(async () => {
  try {
    await db.connect();
    await db.exec(createTables);
    await applyPendingMigrations();
  } catch {
    /* no DB available, or already migrated */
  }
});

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function makeTempRepo() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'hermes-agent-'));
  fs.mkdirSync(path.join(root, '.git'));
  fs.mkdirSync(path.join(root, 'backend', 'src'), { recursive: true });
  fs.mkdirSync(path.join(root, 'frontend', 'src'), { recursive: true });
  fs.writeFileSync(
    path.join(root, 'backend', 'package.json'),
    JSON.stringify({ name: 'backend-test' }),
    'utf8'
  );
  return root;
}

function makeRealGitRepo() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'hermes-agent-git-'));
  fs.mkdirSync(path.join(root, 'backend', 'src'), { recursive: true });
  fs.mkdirSync(path.join(root, 'frontend', 'src'), { recursive: true });
  fs.writeFileSync(
    path.join(root, 'backend', 'package.json'),
    JSON.stringify({ name: 'backend-test' }),
    'utf8'
  );
  execSync('git init', { cwd: root, stdio: 'pipe' });
  execSync('git config user.name "Hermes Test"', { cwd: root, stdio: 'pipe' });
  execSync('git config user.email "hermes-test@example.com"', { cwd: root, stdio: 'pipe' });
  fs.writeFileSync(path.join(root, 'backend', 'src', 'seed.ts'), 'export const seed = 1;\n', 'utf8');
  execSync('git add .', { cwd: root, stdio: 'pipe' });
  execSync('git commit -m "init"', { cwd: root, stdio: 'pipe' });
  return root;
}

function makeRealGitRepoWithRemote() {
  const root = makeRealGitRepo();
  const remote = fs.mkdtempSync(path.join(os.tmpdir(), 'hermes-agent-remote-'));
  execSync('git init --bare', { cwd: remote, stdio: 'pipe' });
  execSync('git branch -M main', { cwd: root, stdio: 'pipe' });
  execSync(`git remote add origin ${remote}`, { cwd: root, stdio: 'pipe' });
  execSync('git push -u origin main', { cwd: root, stdio: 'pipe' });
  return { root, remote };
}

test('resolveRepoRoot finds the repository and real mode refuses missing roots', () => {
  const repoRoot = resolveRepoRoot(path.join(__dirname, '..'));
  assert.equal(repoRoot, path.resolve(path.join(__dirname, '..', '..')));

  const originalAutorun = process.env.AGENT_AUTORUN;
  const originalMode = process.env.AGENT_MODE;

  process.env.AGENT_AUTORUN = 'true';
  process.env.AGENT_MODE = 'real';

  const config = createAgentConfig(path.join(os.tmpdir(), 'definitely-missing-hermes-root'));
  assert.equal(config.effectiveMode, 'disabled');
  assert.equal(config.repoRootHealth, 'missing');
  assert.ok(
    config.startupIssues.some((issue) => issue.includes('Repository root could not be resolved'))
  );

  process.env.AGENT_AUTORUN = originalAutorun;
  process.env.AGENT_MODE = originalMode;
});

test('createAgentConfig defaults to autorun demo mode unless explicitly disabled', () => {
  const originalAutorun = process.env.AGENT_AUTORUN;
  const originalMode = process.env.AGENT_MODE;

  delete process.env.AGENT_AUTORUN;
  delete process.env.AGENT_MODE;

  const defaultConfig = createAgentConfig(path.join(__dirname, '..'));
  assert.equal(defaultConfig.autorunEnabled, true);
  assert.equal(defaultConfig.effectiveMode, 'demo');
  assert.ok(defaultConfig.canWriteScopes.includes('backend/tests/'));
  assert.ok(defaultConfig.canWriteScopes.includes('backend/docs/'));

  process.env.AGENT_AUTORUN = 'false';
  const disabledConfig = createAgentConfig(path.join(__dirname, '..'));
  assert.equal(disabledConfig.autorunEnabled, false);
  assert.equal(disabledConfig.effectiveMode, 'disabled');

  process.env.AGENT_AUTORUN = originalAutorun;
  process.env.AGENT_MODE = originalMode;
});

test('TaskBacklog defines a 648-window verified protocol roadmap', () => {
  const time = getTotalEstimatedTime();
  const ids = new Set();

  assert.equal(TASK_BACKLOG.length, TARGET_COMMIT_WINDOWS);
  assert.equal(BACKLOG_PHASES.length, 10);
  assert.equal(time.hours, TARGET_COMMIT_HOURS);
  assert.equal(time.commitWindows, TARGET_COMMIT_WINDOWS);
  assert.equal(time.commitWindowMinutes, COMMIT_WINDOW_MINUTES);
  assert.deepEqual(
    BACKLOG_PHASES.map((phase) => phase.commitCount),
    [24, 84, 84, 78, 72, 54, 108, 72, 36, 36]
  );

  for (const task of TASK_BACKLOG) {
    assert.equal(task.estimatedMinutes, COMMIT_WINDOW_MINUTES);
    assert.equal(task.commitWindowMinutes, COMMIT_WINDOW_MINUTES);
    assert.ok(task.phaseId);
    assert.ok(task.workstreamId);
    assert.ok(task.allowedScopes.length > 0);
    assert.ok(task.objectiveTags.length > 0);
    assert.ok(task.expectedOutcome.length > 20);
    assert.ok(task.verification.command);
    assert.ok(task.verification.label);
    assert.equal(ids.has(task.id), false);
    ids.add(task.id);
  }
});

test('runtime commit window defaults to backlog window and can be overridden by env', () => {
  const original = process.env.AGENT_COMMIT_WINDOW_MINUTES;

  delete process.env.AGENT_COMMIT_WINDOW_MINUTES;
  assert.equal(getRuntimeCommitWindowMinutes(), COMMIT_WINDOW_MINUTES);

  process.env.AGENT_COMMIT_WINDOW_MINUTES = '12';
  assert.equal(getRuntimeCommitWindowMinutes(), 12);

  process.env.AGENT_COMMIT_WINDOW_MINUTES = 'nope';
  assert.equal(getRuntimeCommitWindowMinutes(), COMMIT_WINDOW_MINUTES);

  process.env.AGENT_COMMIT_WINDOW_MINUTES = original;
});

test('agent timeline normalizes commits with stable GitHub links', () => {
  const event = normalizeAgentTimelineRow({
    id: 'log_1',
    timestamp: new Date('2026-04-30T00:00:00Z'),
    type: 'git_commit',
    content: 'Deployed commit ae417359 to main',
    metadata: { taskRunId: 'run_1' },
  });

  assert.equal(event.id, 'log_1');
  assert.equal(event.kind, 'commit');
  assert.equal(event.runId, 'run_1');
  assert.equal(event.commitHash, 'ae417359');
  assert.equal(
    event.href,
    'https://github.com/hermeschain-agent/hermeschain/commit/ae417359'
  );
  assert.equal(githubCommitHref('abc1234'), 'https://github.com/hermeschain-agent/hermeschain/commit/abc1234');
});

test('agent timeline sanitizer withholds malformed repeated output', () => {
  const repeated = Array(40).fill('nonsense').join(' ');
  assert.equal(sanitizeTimelineText(repeated), 'output withheld: malformed stream event');

  const clean = sanitizeTimelineText('line one\u0000\r\nline two');
  assert.equal(clean, 'line one\nline two');

  const event = normalizeAgentTimelineRow({
    id: 'log_2',
    timestamp: new Date('2026-04-30T00:01:00Z'),
    type: 'output',
    content: repeated,
    metadata: {},
  });
  assert.equal(event.text, 'output withheld: malformed stream event');
});

test('commit playback cursors round-trip and diff chunks stay bounded', () => {
  const cursor = {
    page: 2,
    perPage: 10,
    commitIndex: 3,
    eventIndex: 4,
    cycle: 1,
  };
  assert.deepEqual(decodeCommitPlaybackCursor(encodeCommitPlaybackCursor(cursor)), cursor);

  const chunks = chunkCommitDiff(['+a'.repeat(900), '+b'.repeat(900)].join('\n'), 120);
  assert.ok(chunks.length > 2);
  assert.ok(chunks.every((chunk) => chunk.length <= 120));
});

test('commit playback events expose real commit completion and resumable cursors', () => {
  const cursor = {
    page: 1,
    perPage: 10,
    commitIndex: 0,
    eventIndex: 0,
    cycle: 0,
  };
  const events = buildCommitPlaybackEvents(
    {
      hash: 'ae417359abcdef1234567890abcdef1234567890',
      shortHash: 'ae417359',
      message: 'feat(chain): replay commits',
      author: 'Hermes',
      date: '2026-05-01T00:00:00Z',
      href: 'https://github.com/hermeschain-agent/hermeschain/commit/ae417359abcdef1234567890abcdef1234567890',
      files: [
        {
          path: 'backend/src/api/server.ts',
          status: 'modified',
          language: 'diff',
          additions: 3,
          deletions: 1,
          patch: 'diff --git a/backend/src/api/server.ts b/backend/src/api/server.ts\n+const replay = true;',
        },
      ],
    },
    { cursor, diffChunkSize: 80 },
  );

  assert.equal(events[0].kind, 'commit_start');
  assert.equal(events.at(-1).kind, 'commit_complete');
  assert.equal(events.at(-1).text, 'commited ae417359');
  assert.ok(events.every((event) => event.nextCursor));
  assert.equal(decodeCommitPlaybackCursor(events[0].nextCursor).eventIndex, 1);
});

test('AgentExecutor only writes inside repo allowlist and active task scopes', async () => {
  const repoRoot = makeTempRepo();
  const executor = new AgentExecutor(repoRoot);

  executor.configure({
    autorunEnabled: true,
    requestedMode: 'real',
    effectiveMode: 'real',
    repoRoot,
    repoRootHealth: 'ready',
    projectPaths: {
      backend: path.join(repoRoot, 'backend'),
      frontend: path.join(repoRoot, 'frontend'),
    },
    modelConfigured: true,
    canWriteScopes: ['backend/src/', 'frontend/src/'],
    startupIssues: [],
  });

  executor.setExecutionScopes([
    {
      kind: 'path_prefix',
      path: 'backend/src/safe/',
    },
  ]);

  const allowed = await executor.writeFile(
    'backend/src/safe/example.ts',
    'export const ok = true;\n'
  );
  assert.equal(allowed.success, true);
  assert.equal(
    fs.readFileSync(path.join(repoRoot, 'backend/src/safe/example.ts'), 'utf8'),
    'export const ok = true;\n'
  );

  const blockedByTaskScope = await executor.writeFile(
    'backend/src/unsafe/example.ts',
    'export const nope = true;\n'
  );
  assert.equal(blockedByTaskScope.success, false);
  assert.match(blockedByTaskScope.error || '', /Allowed scopes:/);

  executor.configure({
    autorunEnabled: true,
    requestedMode: 'demo',
    effectiveMode: 'demo',
    repoRoot,
    repoRootHealth: 'ready',
    projectPaths: {
      backend: path.join(repoRoot, 'backend'),
      frontend: path.join(repoRoot, 'frontend'),
    },
    modelConfigured: true,
    canWriteScopes: ['backend/src/', 'frontend/src/'],
    startupIssues: [],
  });

  const blockedByMode = await executor.writeFile(
    'backend/src/safe/demo-blocked.ts',
    'export const blocked = true;\n'
  );
  assert.equal(blockedByMode.success, false);
});

test('AgentExecutor allows verification commands and blocks mutating shell commands', async () => {
  const repoRoot = makeTempRepo();
  const executor = new AgentExecutor(repoRoot);

  executor.configure({
    autorunEnabled: true,
    requestedMode: 'real',
    effectiveMode: 'real',
    repoRoot,
    repoRootHealth: 'ready',
    projectPaths: {
      backend: path.join(repoRoot, 'backend'),
      frontend: path.join(repoRoot, 'frontend'),
    },
    modelConfigured: true,
    canWriteScopes: ['backend/src/', 'frontend/src/'],
    startupIssues: [],
  });

  const allowed = await executor.runCommand('pwd');
  assert.equal(allowed.success, true);

  const blockedRedirect = await executor.runCommand('echo nope > backend/src/nope.ts');
  assert.equal(blockedRedirect.success, false);
  assert.match(blockedRedirect.error || '', /blocked/i);

  const blockedMutation = await executor.runCommand('touch backend/src/nope.ts');
  assert.equal(blockedMutation.success, false);
  assert.equal(fs.existsSync(path.join(repoRoot, 'backend/src/nope.ts')), false);
});

test('AgentTaskStore keeps source tasks open until verified success', async () => {
  const store = new AgentTaskStore();
  await store.initialize();

  await store.upsertSourceTask({
    id: 'backlog:test-task',
    source: 'backlog',
    title: 'Stabilize run lifecycle',
    description: 'Add verified task run transitions.',
    priority: 0.9,
    status: 'queued',
    taskType: 'build',
    objectiveTags: ['agent', 'verification'],
    evidence: [{ kind: 'backlog', label: 'Backlog', detail: 'Curated backlog item' }],
    editScopes: [{ kind: 'path_prefix', path: 'backend/src/agent/' }],
    verificationPlan: {
      type: 'code',
      description: 'Backend build must pass.',
      requireChangedFiles: true,
      steps: [{ id: 'build', type: 'command', label: 'Build', command: 'npm run build', cwd: 'backend' }],
    },
    metadata: {},
    lastError: null,
    blockedReason: null,
  });

  const sourceTask = store.getSourceTask('backlog:test-task');
  assert.equal(sourceTask?.status, 'queued');

  const run = await store.startRun(sourceTask, 'real', 'Focused verification context');
  assert.equal(store.getSourceTask('backlog:test-task')?.status, 'selected');

  await store.markSourceTaskInProgress(sourceTask.id);
  assert.equal(store.getSourceTask('backlog:test-task')?.status, 'in_progress');

  await store.finishRun(run.id, 'succeeded', 'passed', {
    changedFiles: ['backend/src/agent/AgentWorker.ts'],
    output: 'Verified task lifecycle update.',
  });

  const finishedTask = store.getSourceTask('backlog:test-task');
  const finishedRun = store.getRecentRuns(1)[0];

  assert.equal(finishedTask?.status, 'succeeded');
  assert.equal(finishedRun.status, 'succeeded');
  assert.equal(finishedRun.verificationStatus, 'passed');
  assert.deepEqual(finishedRun.changedFiles, ['backend/src/agent/AgentWorker.ts']);

  const progress = store.getBacklogProgress(5);
  assert.equal(progress.completed >= 1, true);
});

test('ChainObserver subscribes once, handles wrapped block payloads, and unsubscribes cleanly', async () => {
  const eventBus = EventBus.getInstance();
  const beforeListeners = eventBus.listenerCount('block_produced');

  await chainObserver.start();
  await chainObserver.start();

  assert.equal(eventBus.listenerCount('block_produced'), beforeListeners + 1);

  eventBus.emit('block_produced', {
    block: {
      header: {
        height: 12,
        timestamp: Date.now(),
      },
      transactions: [{ hash: 'tx-1' }, { hash: 'tx-2' }],
    },
    transactionCount: 2,
  });

  await sleep(10);

  const state = chainObserver.getState();
  assert.equal(state.blockHeight, 12);
  assert.equal(state.lastBlockTime instanceof Date, true);
  assert.equal(state.recentTPS > 0, true);

  chainObserver.stop();
  assert.equal(eventBus.listenerCount('block_produced'), beforeListeners);
});

test('GitIntegration gibberish guard flags suspicious commit text', () => {
  const git = new GitIntegration(path.join(__dirname, '..'));

  assert.equal(git.isLikelyGibberish('xxx xxx xxx xxx placeholder'), true);
  assert.equal(git.isLikelyGibberish('fix(agent): tighten verification lifecycle'), false);
});

test('GitIntegration blocks gibberish commits before creating a commit', async () => {
  const repoRoot = makeRealGitRepo();
  const git = new GitIntegration(repoRoot);
  const initialHead = execSync('git rev-parse HEAD', { cwd: repoRoot, encoding: 'utf8' }).trim();

  git.configure({
    autorunEnabled: true,
    requestedMode: 'real',
    effectiveMode: 'real',
    repoRoot,
    repoRootHealth: 'ready',
    projectPaths: {
      backend: path.join(repoRoot, 'backend'),
      frontend: path.join(repoRoot, 'frontend'),
    },
    modelConfigured: true,
    canWriteScopes: ['backend/src/'],
    startupIssues: [],
  });

  fs.writeFileSync(
    path.join(repoRoot, 'backend', 'src', 'gibberish.ts'),
    'export const placeholder = "placeholder text";\n',
    'utf8'
  );

  const result = await git.autoCommitAndPush('xxx xxx xxx xxx placeholder', 'task-1', {
    scopes: [{ kind: 'path_prefix', path: 'backend/src/' }],
    files: ['backend/src/gibberish.ts'],
  });

  const finalHead = execSync('git rev-parse HEAD', { cwd: repoRoot, encoding: 'utf8' }).trim();

  assert.equal(result.success, false);
  assert.match(result.error || '', /gibberish guard/i);
  assert.equal(initialHead, finalHead);
});

test('GitIntegration prepares queue branch before authoring and can bootstrap it', async () => {
  const { root } = makeRealGitRepoWithRemote();
  const originalCreate = process.env.AGENT_CREATE_QUEUE_BRANCH;
  const originalAutoPush = process.env.AUTO_GIT_PUSH;

  process.env.AGENT_CREATE_QUEUE_BRANCH = 'true';
  process.env.AUTO_GIT_PUSH = 'false';

  const git = new GitIntegration(root);
  git.configure({
    autorunEnabled: true,
    requestedMode: 'real',
    effectiveMode: 'real',
    repoRoot: root,
    repoRootHealth: 'ready',
    projectPaths: {
      backend: path.join(root, 'backend'),
      frontend: path.join(root, 'frontend'),
    },
    modelConfigured: true,
    canWriteScopes: ['backend/src/'],
    startupIssues: [],
  });

  try {
    const result = await git.prepareAuthoringBranch();
    const branch = execSync('git branch --show-current', { cwd: root, encoding: 'utf8' }).trim();

    assert.equal(result.success, true);
    assert.equal(branch, 'tier-3-backlog');
  } finally {
    process.env.AGENT_CREATE_QUEUE_BRANCH = originalCreate;
    process.env.AUTO_GIT_PUSH = originalAutoPush;
  }
});

test('PublishQueue tracks actual unprocessed commits and leadership flags', async () => {
  const { root } = makeRealGitRepoWithRemote();
  const originalCreate = process.env.AGENT_CREATE_QUEUE_BRANCH;
  const originalAutoPush = process.env.AUTO_GIT_PUSH;

  process.env.AGENT_CREATE_QUEUE_BRANCH = 'true';
  process.env.AUTO_GIT_PUSH = 'false';

  try {
    const git = new GitIntegration(root);
    await git.prepareAuthoringBranch();

    fs.writeFileSync(path.join(root, 'backend/src/one.ts'), 'export const one = 1;\n', 'utf8');
    execSync('git add backend/src/one.ts && git commit -m "test(agent): one"', { cwd: root, stdio: 'pipe' });
    fs.writeFileSync(path.join(root, 'backend/src/two.ts'), 'export const two = 2;\n', 'utf8');
    execSync('git add backend/src/two.ts && git commit -m "test(agent): two"', { cwd: root, stdio: 'pipe' });

    let status = await refreshPublishQueueStatus(root, { force: true, refreshRemote: false });
    assert.equal(status.queueDepth, 2);

    const firstCommit = execSync('git rev-list --reverse main..tier-3-backlog | head -1', {
      cwd: root,
      encoding: 'utf8',
      shell: '/bin/sh',
    }).trim();
    const firstTree = execSync(`git rev-parse ${firstCommit}^{tree}`, {
      cwd: root,
      encoding: 'utf8',
    }).trim();

    await markQueuedCommitProcessed(getPublishQueueConfig(), {
      sourceCommitSha: firstCommit,
      treeSha: firstTree,
      subject: 'test(agent): one',
      publishedCommitSha: 'published-one',
      skippedDuplicate: false,
    });

    status = await refreshPublishQueueStatus(root, { force: true, refreshRemote: false });
    assert.equal(status.queueDepth, 1);

    setAuthoringLeader(true);
    setPublisherLeader(true);
    assert.deepEqual(getLeadershipSnapshot(), {
      authoringLeader: true,
      publisherLeader: true,
    });
  } finally {
    setAuthoringLeader(false);
    setPublisherLeader(false);
    process.env.AGENT_CREATE_QUEUE_BRANCH = originalCreate;
    process.env.AUTO_GIT_PUSH = originalAutoPush;
  }
});

test('TaskSources narrows CI scopes and backs off failed retries', () => {
  const sources = new TaskSources();
  sources.getRecentChangedFiles = () => ['backend/src/blockchain/Chain.ts'];

  const specificScopes = sources.extractScopesFromCiFailure({
    type: 'build',
    errors: ['[backend] src/agent/AgentWorker.ts:10:2 - error TS2339: Property does not exist'],
  });
  assert.ok(specificScopes.includes('backend/src/agent/AgentWorker.ts'));
  assert.equal(specificScopes.includes('frontend/src/'), false);

  const hintedFallback = sources.extractScopesFromCiFailure({
    type: 'build',
    errors: ['[frontend] Build failed with bundler error'],
  });
  assert.deepEqual(hintedFallback, ['frontend/src/']);

  const diffScopedFallback = sources.extractScopesFromCiFailure({
    type: 'build',
    errors: ['Build failed with no target marker'],
  });
  assert.deepEqual(diffScopedFallback, ['backend/src/blockchain/Chain.ts']);

  const retryDelay = sources.getRetryDelayMs({
    id: 'failed-task',
    source: 'code_error',
    title: 'Repair backend build',
    description: 'Failure',
    priority: 0.8,
    status: 'failed',
    taskType: 'fix',
    objectiveTags: ['tooling'],
    evidence: [],
    editScopes: [{ kind: 'path_prefix', path: 'backend/src/' }],
    verificationPlan: {
      type: 'code',
      description: 'Build backend',
      requireChangedFiles: true,
      steps: [],
    },
    metadata: {},
    lastError: 'Failed',
    blockedReason: null,
    runCount: 3,
    createdAt: new Date(),
    updatedAt: new Date(),
  });

  assert.equal(retryDelay >= 120000, true);
});

test('TokenBudget accounts for USD caps and task-level pause', () => {
  const originalTaskCap = process.env.AGENT_TASK_USD_CAP;
  process.env.AGENT_TASK_USD_CAP = '0.01';

  try {
    const budget = new TokenBudget(Date.now());
    budget.startTask('task-budget-test');
    budget.record({
      input_tokens: 1_000,
      output_tokens: 3_000,
      cache_read_input_tokens: 10_000,
      cache_creation_input_tokens: 1_000,
    });

    const snapshot = budget.snapshot();
    assert.equal(snapshot.taskCostUsd > 0, true);
    assert.equal(snapshot.cacheHitRatio > 0, true);
    assert.equal(budget.shouldPause().paused, true);
    assert.match(budget.shouldPause().reason || '', /task USD cap/i);
  } finally {
    process.env.AGENT_TASK_USD_CAP = originalTaskCap;
  }
});

test('AgentWorker records commit guard rejections as failed runs', async () => {
  await agentTaskStore.initialize();

  await agentTaskStore.upsertSourceTask({
    id: 'backlog:commit-guard',
    source: 'backlog',
    title: 'Guard commit path',
    description: 'Ensure commit failures become real failed runs.',
    priority: 0.9,
    status: 'queued',
    taskType: 'build',
    objectiveTags: ['agent', 'verification'],
    evidence: [{ kind: 'backlog', label: 'Backlog', detail: 'Commit guard regression' }],
    editScopes: [{ kind: 'path_prefix', path: 'backend/src/agent/' }],
    verificationPlan: {
      type: 'code',
      description: 'Backend verification already passed.',
      requireChangedFiles: true,
      steps: [],
    },
    metadata: {},
    lastError: null,
    blockedReason: null,
  });

  const sourceTask = agentTaskStore.getSourceTask('backlog:commit-guard');
  const run = await agentTaskStore.startRun(sourceTask, 'real', 'Commit guard context');

  const originalCommit = gitIntegration.autoCommitAndPush;
  const originalRecordTaskCompletion = agentMemory.recordTaskCompletion;

  gitIntegration.autoCommitAndPush = async () => ({
    success: false,
    output: '',
    error: 'Commit blocked by gibberish guard',
  });
  agentMemory.recordTaskCompletion = async () => {};

  try {
    const result = await agentWorker.completeSuccessfulRun(
      {
        sourceTask,
        task: {
          id: sourceTask.id,
          title: sourceTask.title,
          type: sourceTask.taskType,
          prompt: '',
          agent: 'HERMES',
        },
        objectiveTags: sourceTask.objectiveTags,
        evidence: sourceTask.evidence,
        editScopes: sourceTask.editScopes,
        verificationPlan: sourceTask.verificationPlan,
      },
      'verified output',
      ['backend/src/agent/AgentWorker.ts'],
      'real',
      'passed'
    );

    const updatedRun = agentTaskStore.getRecentRuns(1)[0];
    const updatedTask = agentTaskStore.getSourceTask(sourceTask.id);

    assert.equal(run.id, updatedRun.id);
    assert.equal(result.success, false);
    assert.equal(updatedRun.status, 'failed');
    assert.equal(updatedRun.failureReason, 'Commit blocked by gibberish guard');
    assert.equal(updatedTask.status, 'failed');
    assert.equal(updatedTask.runCount >= 1, true);
  } finally {
    gitIntegration.autoCommitAndPush = originalCommit;
    agentMemory.recordTaskCompletion = originalRecordTaskCompletion;
  }
});

test('CommitQuality rejects self-labeled "(planned)" doc stub', () => {
  const r = assessCommitQuality({
    message: 'docs(api): /api/chain/network-health endpoint planned',
    files: [{ path: 'docs/api/endpoints/chain-network-health.md', insertions: 4, deletions: 0 }],
  });
  assert.equal(r.quality, false);
  assert.match(r.reason, /stub|planned/i);
});

test('CommitQuality rejects placeholder config stub', () => {
  const r = assessCommitQuality({
    message: 'feat(config): validator primary config',
    files: [{ path: 'config/validators/primary.json', insertions: 7, deletions: 0 }],
    diffText: '+  "address": "placeholder-primary",\n+  "active": false',
  });
  assert.equal(r.quality, false);
});

test('CommitQuality rejects dist-only build output', () => {
  const r = assessCommitQuality({
    message: 'chore(build): compile output',
    files: [
      { path: 'backend/dist/agent/GitHubUpdates.js', insertions: 18, deletions: 2 },
      { path: 'backend/dist/agent/GitHubUpdates.d.ts', insertions: 14, deletions: 0 },
    ],
  });
  assert.equal(r.quality, false);
  assert.match(r.reason, /dist/i);
});

test('CommitQuality accepts real backend src change bundled with dist', () => {
  const r = assessCommitQuality({
    message: 'fix(agent): set authenticated origin remote on worker boot',
    files: [
      { path: 'backend/src/agent/GitIntegration.ts', insertions: 22, deletions: 5 },
      { path: 'backend/dist/agent/GitIntegration.js', insertions: 30, deletions: 6 },
    ],
  });
  assert.equal(r.quality, true);
  assert.match(r.reason, /source/i);
});

test('CommitQuality accepts substantive SQL migration', () => {
  const r = assessCommitQuality({
    message: 'feat(db): block_beacons table for VM randomness source',
    files: [
      { path: 'backend/src/database/migrations/0043_block_beacons.sql', insertions: 10, deletions: 0 },
    ],
    diffText:
      '+CREATE TABLE IF NOT EXISTS block_beacons (\n+  block_height BIGINT PRIMARY KEY,\n+  beacon TEXT NOT NULL\n+);',
  });
  assert.equal(r.quality, true);
  assert.match(r.reason, /migration/i);
});

test('CommitQuality rejects trivial doc-only commit below prose floor', () => {
  const r = assessCommitQuality({
    message: 'docs(wallet): send flow reference',
    files: [{ path: 'docs/wallet/send.md', insertions: 9, deletions: 0 }],
    diffText: '+# Send\n+\n+See TASK-210.\n',
  });
  assert.equal(r.quality, false);
});

test('CommitQuality rejects many bundled tiny doc stubs (sum-past-threshold)', () => {
  // The real-world false-accept: ~12 three-line "endpoint reference" stubs.
  const files = [];
  let diff = '';
  for (let i = 0; i < 12; i++) {
    files.push({ path: `docs/api/endpoints/ep-${i}.md`, insertions: 3, deletions: 0 });
    diff += `+# GET /api/thing/${i}\n+\n+Returns the thing number ${i} as JSON.\n`;
  }
  const r = assessCommitQuality({ message: 'docs(api): endpoint references', files, diffText: diff });
  assert.equal(r.quality, false);
  assert.match(r.reason, /doc/i);
});

test('CommitQuality accepts a single substantive doc file', () => {
  const lines = Array.from(
    { length: 26 },
    (_, i) => `+The finality gadget finalizes block ${i} once two-thirds of validators attest within the slot window.`,
  ).join('\n');
  const r = assessCommitQuality({
    message: 'docs(consensus): finality overview',
    files: [{ path: 'docs/consensus/finality.md', insertions: 26, deletions: 0 }],
    diffText: lines,
  });
  assert.equal(r.quality, true);
  assert.match(r.reason, /documentation/i);
});

test('CommitQuality authorship mode passes a real change but still blocks dist-only', () => {
  const real = assessCommitQuality(
    {
      message: 'feat(vm): add MUL opcode',
      files: [{ path: 'backend/src/vm/Interpreter.ts', insertions: 12, deletions: 1 }],
    },
    { authorship: true },
  );
  assert.equal(real.quality, true);

  const distOnly = assessCommitQuality(
    {
      message: 'chore(build): recompile',
      files: [{ path: 'backend/dist/vm/Interpreter.js', insertions: 40, deletions: 3 }],
    },
    { authorship: true },
  );
  assert.equal(distOnly.quality, false);
});
