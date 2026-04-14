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

test('runtime commit window defaults to 10 and can be overridden by env', () => {
  const original = process.env.AGENT_COMMIT_WINDOW_MINUTES;

  delete process.env.AGENT_COMMIT_WINDOW_MINUTES;
  assert.equal(getRuntimeCommitWindowMinutes(), COMMIT_WINDOW_MINUTES);

  process.env.AGENT_COMMIT_WINDOW_MINUTES = '12';
  assert.equal(getRuntimeCommitWindowMinutes(), 12);

  process.env.AGENT_COMMIT_WINDOW_MINUTES = 'nope';
  assert.equal(getRuntimeCommitWindowMinutes(), COMMIT_WINDOW_MINUTES);

  process.env.AGENT_COMMIT_WINDOW_MINUTES = original;
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
