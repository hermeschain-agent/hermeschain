import { execFileSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import { db } from '../database/db';

export interface PublishQueueConfig {
  queueBranch: string;
  publishBranch: string;
  intervalMinutes: number;
  queueResumeThreshold: number;
  remote: string;
  autoPushEnabled: boolean;
}

export interface PublishQueueStatus {
  enabled: boolean;
  queueBranch: string;
  publishBranch: string;
  remote: string;
  intervalMinutes: number;
  queueResumeThreshold: number;
  queueDepth: number;
  publishMode: 'disabled' | 'idle' | 'draining' | 'paused';
  nextPublishAt: string | null;
  authoringLeader: boolean;
  publisherLeader: boolean;
  publishingPausedReason: string | null;
  lastSourceCommitSha: string | null;
  lastPublishedCommitSha: string | null;
  updatedAt: string;
}

interface PublishCursorRow {
  sourceBranch: string;
  targetBranch: string;
  lastSourceCommitSha: string | null;
  lastPublishedCommitSha: string | null;
  nextPublishAt: Date | null;
  updatedAt: Date;
}

interface PublishHistoryRow {
  sourceBranch: string;
  targetBranch: string;
  sourceCommitSha: string;
  publishedCommitSha: string | null;
  treeSha: string;
  subject: string;
  skippedDuplicate: boolean;
  publishedAt: Date;
}

export interface QueuedSourceCommit {
  sourceCommitSha: string;
  treeSha: string;
  subject: string;
  message: string;
  authorName: string;
  authorEmail: string;
}

const DEFAULT_REMOTE = process.env.PUSH_REMOTE || 'origin';
const STATUS_CACHE_MS = 30_000;

const memoryHistory = new Map<string, PublishHistoryRow[]>();
const memoryCursors = new Map<string, PublishCursorRow>();

let publisherLeader = false;
let authoringLeader = false;
let cachedStatus: PublishQueueStatus | null = null;
let cachedStatusAt = 0;
let cachedRepoRoot: string | null = null;

function cursorKey(sourceBranch: string, targetBranch: string): string {
  return `${sourceBranch}::${targetBranch}`;
}

function envNumber(name: string, fallback: number): number {
  const raw = Number.parseInt(process.env[name] || '', 10);
  return Number.isFinite(raw) && raw >= 0 ? raw : fallback;
}

export function resolveAutoPushSetting(): boolean {
  const raw = (process.env.AUTO_GIT_PUSH || '').toLowerCase();
  if (raw === 'true' || raw === '1') return true;
  if (raw === 'false' || raw === '0') return false;
  return Boolean(process.env.GITHUB_TOKEN || process.env.GH_TOKEN);
}

export function getPublishQueueConfig(): PublishQueueConfig {
  return {
    queueBranch: process.env.AGENT_QUEUE_BRANCH || process.env.PUSH_BRANCH || 'tier-3-backlog',
    publishBranch: process.env.AGENT_PUBLISH_BRANCH || process.env.PUSH_TARGET || 'main',
    intervalMinutes: Math.max(1, envNumber('AGENT_PUBLISH_INTERVAL_MINUTES', 15)),
    queueResumeThreshold: Math.max(0, envNumber('AGENT_QUEUE_RESUME_THRESHOLD', 0)),
    remote: process.env.PUSH_REMOTE || DEFAULT_REMOTE,
    autoPushEnabled: resolveAutoPushSetting(),
  };
}

function defaultStatus(config: PublishQueueConfig = getPublishQueueConfig()): PublishQueueStatus {
  return {
    enabled: config.autoPushEnabled,
    queueBranch: config.queueBranch,
    publishBranch: config.publishBranch,
    remote: config.remote,
    intervalMinutes: config.intervalMinutes,
    queueResumeThreshold: config.queueResumeThreshold,
    queueDepth: 0,
    publishMode: config.autoPushEnabled ? 'idle' : 'disabled',
    nextPublishAt: null,
    authoringLeader,
    publisherLeader,
    publishingPausedReason: config.autoPushEnabled ? null : 'AUTO_GIT_PUSH is disabled.',
    lastSourceCommitSha: null,
    lastPublishedCommitSha: null,
    updatedAt: new Date().toISOString(),
  };
}

function updateCachedStatus(status: PublishQueueStatus, repoRoot?: string): PublishQueueStatus {
  cachedStatus = status;
  cachedStatusAt = Date.now();
  if (repoRoot) {
    cachedRepoRoot = repoRoot;
  }
  return status;
}

function git(repoRoot: string, args: string[], env?: NodeJS.ProcessEnv): string {
  return execFileSync('git', args, {
    cwd: repoRoot,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    env: env ? { ...process.env, ...env } : process.env,
  }).trim();
}

function repoHasGit(repoRoot: string): boolean {
  return fs.existsSync(path.join(repoRoot, '.git'));
}

function refExists(repoRoot: string, ref: string): boolean {
  try {
    git(repoRoot, ['show-ref', '--verify', '--quiet', ref]);
    return true;
  } catch {
    return false;
  }
}

function tryGit(repoRoot: string, args: string[], env?: NodeJS.ProcessEnv): string | null {
  try {
    return git(repoRoot, args, env);
  } catch {
    return null;
  }
}

async function fetchRemoteBranches(repoRoot: string, config: PublishQueueConfig): Promise<void> {
  // Worker clones may be shallow. Unshallowing is best-effort because Git
  // exits non-zero once the repository is already complete.
  tryGit(repoRoot, ['fetch', '--unshallow', config.remote]);

  const publishFetch = tryGit(repoRoot, [
    'fetch',
    config.remote,
    `+refs/heads/${config.publishBranch}:refs/remotes/${config.remote}/${config.publishBranch}`,
  ]);

  if (publishFetch === null) {
    throw new Error(`Publish branch ${config.publishBranch} is missing on ${config.remote}.`);
  }

  // The queue branch may not exist on first boot; callers decide whether to
  // create it. Do not make ordinary status inspection fail just because the
  // queue has not been bootstrapped yet.
  tryGit(repoRoot, [
    'fetch',
    config.remote,
    `+refs/heads/${config.queueBranch}:refs/remotes/${config.remote}/${config.queueBranch}`,
  ]);
}

function getCurrentBranch(repoRoot: string): string {
  try {
    return git(repoRoot, ['branch', '--show-current']);
  } catch {
    return 'unknown';
  }
}

function getAheadCount(repoRoot: string, config: PublishQueueConfig): number {
  const ref = `${config.remote}/${config.publishBranch}..${config.remote}/${config.queueBranch}`;
  return Number(git(repoRoot, ['rev-list', '--count', ref]) || '0');
}

function resolveBranchRef(repoRoot: string, config: PublishQueueConfig, branch: string): string | null {
  const remoteRef = `refs/remotes/${config.remote}/${branch}`;
  if (refExists(repoRoot, remoteRef)) {
    return `${config.remote}/${branch}`;
  }

  const localRef = `refs/heads/${branch}`;
  if (refExists(repoRoot, localRef)) {
    return branch;
  }

  return null;
}

function getFullCommitMessage(repoRoot: string, sha: string): string {
  return git(repoRoot, ['log', '-1', '--pretty=%B', sha]);
}

function getCommitSubject(repoRoot: string, sha: string): string {
  return git(repoRoot, ['log', '-1', '--pretty=%s', sha]);
}

function getCommitAuthor(repoRoot: string, sha: string): { authorName: string; authorEmail: string } {
  const raw = git(repoRoot, ['log', '-1', '--pretty=%an|%ae', sha]);
  const [authorName, authorEmail] = raw.split('|');
  return {
    authorName: authorName || 'hermes agent',
    authorEmail: authorEmail || 'hermeschain-agent@users.noreply.github.com',
  };
}

function getCommitTree(repoRoot: string, sha: string): string {
  return git(repoRoot, ['rev-parse', `${sha}^{tree}`]);
}

function getQueueCommitList(repoRoot: string, config: PublishQueueConfig): string[] {
  const publishRef = resolveBranchRef(repoRoot, config, config.publishBranch);
  const queueRef = resolveBranchRef(repoRoot, config, config.queueBranch);
  if (!publishRef || !queueRef) return [];

  const ref = `${publishRef}..${queueRef}`;
  const args = ['rev-list', '--reverse'];
  // Baseline: only ever publish commits authored at/after AGENT_PUBLISH_MIN_DATE.
  // This permanently excludes the pre-built backlog (all dated before the
  // baseline) so the pacer only publishes genuine FRESH agent work, while the
  // quality gate still filters whatever does pass.
  const minDate = (process.env.AGENT_PUBLISH_MIN_DATE || '').trim();
  if (minDate) {
    args.push(`--since=${minDate}`);
  }
  args.push(ref);
  const raw = git(repoRoot, args);
  return raw ? raw.split('\n').filter(Boolean) : [];
}

async function loadCursor(config: PublishQueueConfig): Promise<PublishCursorRow | null> {
  const key = cursorKey(config.queueBranch, config.publishBranch);
  if (!db.isPersistent()) {
    return memoryCursors.get(key) || null;
  }

  const result = await db.query(
    `
      SELECT source_branch, target_branch, last_source_commit_sha, last_published_commit_sha,
             next_publish_at, updated_at
      FROM agent_publish_cursor
      WHERE source_branch = $1 AND target_branch = $2
      LIMIT 1
    `,
    [config.queueBranch, config.publishBranch]
  );

  const row = result.rows?.[0];
  if (!row) return null;

  return {
    sourceBranch: row.source_branch,
    targetBranch: row.target_branch,
    lastSourceCommitSha: row.last_source_commit_sha || null,
    lastPublishedCommitSha: row.last_published_commit_sha || null,
    nextPublishAt: row.next_publish_at ? new Date(row.next_publish_at) : null,
    updatedAt: row.updated_at ? new Date(row.updated_at) : new Date(),
  };
}

async function saveCursor(config: PublishQueueConfig, cursor: PublishCursorRow): Promise<void> {
  const key = cursorKey(config.queueBranch, config.publishBranch);
  if (!db.isPersistent()) {
    memoryCursors.set(key, cursor);
    return;
  }

  await db.query(
    `
      INSERT INTO agent_publish_cursor (
        source_branch,
        target_branch,
        last_source_commit_sha,
        last_published_commit_sha,
        next_publish_at,
        updated_at
      )
      VALUES ($1, $2, $3, $4, $5, $6)
      ON CONFLICT (source_branch, target_branch) DO UPDATE SET
        last_source_commit_sha = EXCLUDED.last_source_commit_sha,
        last_published_commit_sha = EXCLUDED.last_published_commit_sha,
        next_publish_at = EXCLUDED.next_publish_at,
        updated_at = EXCLUDED.updated_at
    `,
    [
      config.queueBranch,
      config.publishBranch,
      cursor.lastSourceCommitSha,
      cursor.lastPublishedCommitSha,
      cursor.nextPublishAt,
      cursor.updatedAt,
    ]
  );
}

async function loadHistory(config: PublishQueueConfig): Promise<PublishHistoryRow[]> {
  const key = cursorKey(config.queueBranch, config.publishBranch);
  if (!db.isPersistent()) {
    return memoryHistory.get(key) || [];
  }

  const result = await db.query(
    `
      SELECT source_branch, target_branch, source_commit_sha, published_commit_sha,
             tree_sha, subject, skipped_duplicate, published_at
      FROM agent_publish_history
      WHERE source_branch = $1 AND target_branch = $2
      ORDER BY published_at ASC, id ASC
    `,
    [config.queueBranch, config.publishBranch]
  );

  return (result.rows || []).map((row) => ({
    sourceBranch: row.source_branch,
    targetBranch: row.target_branch,
    sourceCommitSha: row.source_commit_sha,
    publishedCommitSha: row.published_commit_sha || null,
    treeSha: row.tree_sha,
    subject: row.subject || '',
    skippedDuplicate: row.skipped_duplicate === true,
    publishedAt: row.published_at ? new Date(row.published_at) : new Date(),
  }));
}

async function countProcessedHistory(config: PublishQueueConfig): Promise<number> {
  const key = cursorKey(config.queueBranch, config.publishBranch);
  if (!db.isPersistent()) {
    return (memoryHistory.get(key) || []).length;
  }

  const result = await db.query(
    `
      SELECT COUNT(*)::int AS count
      FROM agent_publish_history
      WHERE source_branch = $1 AND target_branch = $2
    `,
    [config.queueBranch, config.publishBranch]
  );

  return Number(result.rows?.[0]?.count || 0);
}

async function hasProcessedTree(config: PublishQueueConfig, treeSha: string): Promise<boolean> {
  const key = cursorKey(config.queueBranch, config.publishBranch);
  if (!db.isPersistent()) {
    return (memoryHistory.get(key) || []).some((row) => row.treeSha === treeSha);
  }

  const result = await db.query(
    `
      SELECT 1
      FROM agent_publish_history
      WHERE source_branch = $1 AND target_branch = $2 AND tree_sha = $3
      LIMIT 1
    `,
    [config.queueBranch, config.publishBranch, treeSha]
  );

  return (result.rows || []).length > 0;
}

function findPublishedCommitByTreeInGit(
  repoRoot: string,
  treeSha: string,
  config: PublishQueueConfig,
): string | null {
  const publishRef = resolveBranchRef(repoRoot, config, config.publishBranch);
  if (!publishRef) return null;

  const output = tryGit(repoRoot, ['log', '--format=%H %T', publishRef]);
  if (!output) return null;

  for (const line of output.split('\n')) {
    const [commitSha, commitTreeSha] = line.trim().split(/\s+/);
    if (commitTreeSha === treeSha) {
      return commitSha || null;
    }
  }

  return null;
}

async function processedSourceCommitSet(config: PublishQueueConfig): Promise<Set<string>> {
  const rows = await loadHistory(config);
  return new Set(rows.map((row) => row.sourceCommitSha));
}

async function processedTreeSet(config: PublishQueueConfig): Promise<Set<string>> {
  const rows = await loadHistory(config);
  return new Set(rows.map((row) => row.treeSha));
}

async function getUnprocessedQueueCommitList(
  repoRoot: string,
  config: PublishQueueConfig,
): Promise<string[]> {
  const queue = getQueueCommitList(repoRoot, config);
  if (queue.length === 0) return [];

  const processedSources = await processedSourceCommitSet(config);
  const processedTrees = await processedTreeSet(config);

  return queue.filter((sha) => {
    if (processedSources.has(sha)) return false;
    const tree = getCommitTree(repoRoot, sha);
    return !processedTrees.has(tree);
  });
}

function computeNextPublishAt(config: PublishQueueConfig, now: Date = new Date()): Date {
  return new Date(now.getTime() + config.intervalMinutes * 60 * 1000);
}

export function setPublisherLeader(isLeader: boolean): void {
  publisherLeader = isLeader;
  if (cachedStatus) {
    cachedStatus.publisherLeader = isLeader;
    cachedStatus.updatedAt = new Date().toISOString();
    cachedStatusAt = Date.now();
  }
}

export function setAuthoringLeader(isLeader: boolean): void {
  authoringLeader = isLeader;
  if (cachedStatus) {
    cachedStatus.authoringLeader = isLeader;
    cachedStatus.updatedAt = new Date().toISOString();
    cachedStatusAt = Date.now();
  }
}

export function getLeadershipSnapshot(): {
  authoringLeader: boolean;
  publisherLeader: boolean;
} {
  return {
    authoringLeader,
    publisherLeader,
  };
}

export function getPublishQueueStatusSnapshot(): PublishQueueStatus {
  if (cachedStatus) {
    return {
      ...cachedStatus,
      authoringLeader,
      publisherLeader,
    };
  }
  return defaultStatus();
}

export function getAuthoringPauseReason(
  status: Pick<PublishQueueStatus, 'queueDepth' | 'queueResumeThreshold'>,
): string | null {
  if (status.queueDepth <= status.queueResumeThreshold) {
    return null;
  }

  return (
    `Publish backlog has ${status.queueDepth} queued commit(s). ` +
    `Agent authoring is paused until queue depth is at or below ${status.queueResumeThreshold}.`
  );
}

export async function ensurePublishQueueBranch(
  repoRoot: string,
  options: { checkout?: boolean; refreshRemote?: boolean } = {},
): Promise<void> {
  const config = getPublishQueueConfig();

  if (!repoHasGit(repoRoot)) {
    throw new Error('Git repository is unavailable for queue publishing.');
  }

  if (options.refreshRemote !== false) {
    fetchRemoteBranches(repoRoot, config);
  }

  const localRef = `refs/heads/${config.queueBranch}`;
  const remoteRef = `refs/remotes/${config.remote}/${config.queueBranch}`;
  const publishRemoteRef = `refs/remotes/${config.remote}/${config.publishBranch}`;
  const publishLocalRef = `refs/heads/${config.publishBranch}`;
  const hasLocal = refExists(repoRoot, localRef);
  const hasRemote = refExists(repoRoot, remoteRef);

  if (!hasLocal && !hasRemote) {
    const shouldCreate = process.env.AGENT_CREATE_QUEUE_BRANCH === 'true';
    const baseRef = refExists(repoRoot, publishRemoteRef)
      ? `${config.remote}/${config.publishBranch}`
      : refExists(repoRoot, publishLocalRef)
        ? config.publishBranch
        : null;

    if (shouldCreate && baseRef && options.checkout) {
      git(repoRoot, ['checkout', '-b', config.queueBranch, baseRef]);
      if (config.autoPushEnabled) {
        git(repoRoot, ['push', '-u', config.remote, config.queueBranch]);
      }
      return;
    }

    throw new Error(
      `Queue branch ${config.queueBranch} is missing locally and on ${config.remote}. ` +
      `Set AGENT_CREATE_QUEUE_BRANCH=true to bootstrap it from ${config.publishBranch}.`
    );
  }

  if (!options.checkout) {
    return;
  }

  if (!hasLocal && hasRemote) {
    // -B (create-or-reset) instead of -b so this is idempotent: it succeeds
    // whether or not a local branch already exists from a prior partial run.
    // Using the remote ref as the start-point auto-configures tracking.
    git(repoRoot, [
      'checkout',
      '-B',
      config.queueBranch,
      `${config.remote}/${config.queueBranch}`,
    ]);
    return;
  }

  if (getCurrentBranch(repoRoot) !== config.queueBranch) {
    git(repoRoot, ['checkout', config.queueBranch]);
  }

  if (hasRemote) {
    try {
      git(repoRoot, [
        'branch',
        '--set-upstream-to',
        `${config.remote}/${config.queueBranch}`,
        config.queueBranch,
      ]);
    } catch {
      // Local-only branches can still function in dev.
    }
  }
}

export async function getNextQueuedSourceCommit(
  repoRoot: string,
  options: { refreshRemote?: boolean } = {},
): Promise<QueuedSourceCommit | null> {
  const config = getPublishQueueConfig();

  if (options.refreshRemote !== false) {
    fetchRemoteBranches(repoRoot, config);
  }

  const queue = await getUnprocessedQueueCommitList(repoRoot, config);
  if (queue.length === 0) {
    return null;
  }

  const nextSha = queue[0];
  if (!nextSha) {
    return null;
  }

  const { authorName, authorEmail } = getCommitAuthor(repoRoot, nextSha);
  return {
    sourceCommitSha: nextSha,
    treeSha: getCommitTree(repoRoot, nextSha),
    subject: getCommitSubject(repoRoot, nextSha),
    message: getFullCommitMessage(repoRoot, nextSha),
    authorName,
    authorEmail,
  };
}

export async function markQueuedCommitProcessed(
  config: PublishQueueConfig,
  entry: {
    sourceCommitSha: string;
    treeSha: string;
    subject: string;
    publishedCommitSha: string | null;
    skippedDuplicate: boolean;
    publishedAt?: Date;
    advanceSchedule?: boolean;
  }
): Promise<void> {
  const now = entry.publishedAt || new Date();
  const currentCursor = await loadCursor(config);
  const nextPublishAt = entry.advanceSchedule === false
    ? currentCursor?.nextPublishAt || now
    : computeNextPublishAt(config, now);
  const cursor: PublishCursorRow = {
    sourceBranch: config.queueBranch,
    targetBranch: config.publishBranch,
    lastSourceCommitSha: entry.sourceCommitSha,
    lastPublishedCommitSha: entry.publishedCommitSha,
    nextPublishAt,
    updatedAt: now,
  };
  const historyRow: PublishHistoryRow = {
    sourceBranch: config.queueBranch,
    targetBranch: config.publishBranch,
    sourceCommitSha: entry.sourceCommitSha,
    publishedCommitSha: entry.publishedCommitSha,
    treeSha: entry.treeSha,
    subject: entry.subject,
    skippedDuplicate: entry.skippedDuplicate,
    publishedAt: now,
  };

  const key = cursorKey(config.queueBranch, config.publishBranch);
  if (!db.isPersistent()) {
    const history = memoryHistory.get(key) || [];
    if (!history.some((row) => row.sourceCommitSha === historyRow.sourceCommitSha)) {
      history.push(historyRow);
      memoryHistory.set(key, history);
    }
    memoryCursors.set(key, cursor);
    return;
  }

  await db.transaction(async (client) => {
    await client.query(
      `
        INSERT INTO agent_publish_history (
          source_branch,
          target_branch,
          source_commit_sha,
          published_commit_sha,
          tree_sha,
          subject,
          skipped_duplicate,
          published_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        ON CONFLICT (source_branch, target_branch, source_commit_sha) DO NOTHING
      `,
      [
        historyRow.sourceBranch,
        historyRow.targetBranch,
        historyRow.sourceCommitSha,
        historyRow.publishedCommitSha,
        historyRow.treeSha,
        historyRow.subject,
        historyRow.skippedDuplicate,
        historyRow.publishedAt,
      ]
    );

    await client.query(
      `
        INSERT INTO agent_publish_cursor (
          source_branch,
          target_branch,
          last_source_commit_sha,
          last_published_commit_sha,
          next_publish_at,
          updated_at
        )
        VALUES ($1, $2, $3, $4, $5, $6)
        ON CONFLICT (source_branch, target_branch) DO UPDATE SET
          last_source_commit_sha = EXCLUDED.last_source_commit_sha,
          last_published_commit_sha = EXCLUDED.last_published_commit_sha,
          next_publish_at = EXCLUDED.next_publish_at,
          updated_at = EXCLUDED.updated_at
      `,
      [
        cursor.sourceBranch,
        cursor.targetBranch,
        cursor.lastSourceCommitSha,
        cursor.lastPublishedCommitSha,
        cursor.nextPublishAt,
        cursor.updatedAt,
      ]
    );
  });
}

export async function notePublishTick(
  config: PublishQueueConfig,
  now: Date = new Date()
): Promise<void> {
  const currentCursor = await loadCursor(config);
  const cursor: PublishCursorRow = {
    sourceBranch: config.queueBranch,
    targetBranch: config.publishBranch,
    lastSourceCommitSha: currentCursor?.lastSourceCommitSha || null,
    lastPublishedCommitSha: currentCursor?.lastPublishedCommitSha || null,
    nextPublishAt: computeNextPublishAt(config, now),
    updatedAt: now,
  };
  await saveCursor(config, cursor);
}

export async function refreshPublishQueueStatus(
  repoRoot: string,
  options: {
    force?: boolean;
    refreshRemote?: boolean;
    maxAgeMs?: number;
  } = {}
): Promise<PublishQueueStatus> {
  const config = getPublishQueueConfig();
  const maxAgeMs = options.maxAgeMs ?? STATUS_CACHE_MS;
  const now = Date.now();

  if (
    !options.force &&
    cachedStatus &&
    cachedRepoRoot === repoRoot &&
    now - cachedStatusAt < maxAgeMs
  ) {
    return {
      ...cachedStatus,
      publisherLeader,
    };
  }

  if (!repoHasGit(repoRoot)) {
    return updateCachedStatus(
      {
        ...defaultStatus(config),
        enabled: false,
        publishMode: 'disabled',
        publishingPausedReason: 'Git repository is unavailable.',
        updatedAt: new Date().toISOString(),
      },
      repoRoot
    );
  }

  try {
    if (options.refreshRemote !== false) {
      fetchRemoteBranches(repoRoot, config);
    }
    await ensurePublishQueueBranch(repoRoot, { checkout: false, refreshRemote: false });

    const cursor = await loadCursor(config);
    const queueDepth = (await getUnprocessedQueueCommitList(repoRoot, config)).length;

    let publishMode: PublishQueueStatus['publishMode'] = 'idle';
    let publishingPausedReason: string | null = null;
    if (!config.autoPushEnabled) {
      publishMode = 'disabled';
      publishingPausedReason = 'AUTO_GIT_PUSH is disabled.';
    } else if (queueDepth > 0 && !publisherLeader) {
      publishMode = 'paused';
      publishingPausedReason = 'Worker is not the active publisher leader.';
    } else if (queueDepth > 0) {
      publishMode = 'draining';
    }

    return updateCachedStatus(
      {
        enabled: config.autoPushEnabled,
        queueBranch: config.queueBranch,
        publishBranch: config.publishBranch,
        remote: config.remote,
        intervalMinutes: config.intervalMinutes,
        queueResumeThreshold: config.queueResumeThreshold,
        queueDepth,
        publishMode,
        nextPublishAt: cursor?.nextPublishAt?.toISOString() || null,
        authoringLeader,
        publisherLeader,
        publishingPausedReason,
        lastSourceCommitSha: cursor?.lastSourceCommitSha || null,
        lastPublishedCommitSha: cursor?.lastPublishedCommitSha || null,
        updatedAt: new Date().toISOString(),
      },
      repoRoot
    );
  } catch (error: any) {
    return updateCachedStatus(
      {
        ...defaultStatus(config),
        publishMode: config.autoPushEnabled ? 'paused' : 'disabled',
        authoringLeader,
        publisherLeader,
        publishingPausedReason: error?.message || 'Publish queue inspection failed.',
        updatedAt: new Date().toISOString(),
      },
      repoRoot
    );
  }
}

export async function hasPublishedTree(
  treeSha: string,
  config: PublishQueueConfig = getPublishQueueConfig(),
  repoRoot?: string,
): Promise<boolean> {
  if (await hasProcessedTree(config, treeSha)) {
    return true;
  }

  return repoRoot ? findPublishedCommitByTreeInGit(repoRoot, treeSha, config) !== null : false;
}

export function findPublishedCommitByTree(
  repoRoot: string,
  treeSha: string,
  config: PublishQueueConfig = getPublishQueueConfig(),
): string | null {
  return findPublishedCommitByTreeInGit(repoRoot, treeSha, config);
}

export function getPublishIntervalMs(config: PublishQueueConfig = getPublishQueueConfig()): number {
  return config.intervalMinutes * 60 * 1000;
}
