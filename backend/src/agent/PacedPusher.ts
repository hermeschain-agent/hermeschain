import { execFileSync } from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

const PUBLISH_GIT_USER_NAME =
  process.env.PUBLISH_GIT_USER_NAME ||
  process.env.GIT_USER_NAME ||
  'Hermes Maintainer';
const PUBLISH_GIT_USER_EMAIL =
  process.env.PUBLISH_GIT_USER_EMAIL ||
  process.env.GIT_USER_EMAIL ||
  'hermeschain-agent@users.noreply.github.com';

/**
 * PacedPusher — runs inside the Railway worker process. Every PUSH_INTERVAL_MS
 * (default and minimum 15min = 96/day), fetches origin and advances refs/heads/main by
 * one commit drawn from origin/PUSH_BRANCH (default tier-3-backlog).
 *
 * Disabled by default. Activate by setting:
 *   PACED_PUSH_ENABLED=true
 *   GITHUB_TOKEN=<token with repo write>
 *
 * Optional:
 *   PUSH_BRANCH=tier-3-backlog
 *   PUSH_TARGET=main
 *   PUSH_REMOTE=origin
 *   PUSH_BATCH=1
 *   PUSH_INTERVAL_MS=900000    (15 minutes; lower values are ignored)
 *   POINTER_FILE=data/push_pointer.txt
 */

export class PacedPusher {
  private static readonly MIN_INTERVAL_MS = 15 * 60_000;
  private interval: NodeJS.Timeout | null = null;
  private repoRoot: string;
  private pointerFile: string;
  private branch: string;
  private target: string;
  private remote: string;
  private batch: number;
  private intervalMs: number;
  private lastRepairAt = 0;

  constructor(repoRoot: string) {
    this.repoRoot = this.resolvePacerRepoRoot(repoRoot);
    this.pointerFile = path.resolve(
      this.repoRoot,
      process.env.POINTER_FILE || 'data/push_pointer.txt',
    );
    this.branch = process.env.PUSH_BRANCH || 'tier-3-backlog';
    this.target = process.env.PUSH_TARGET || 'main';
    this.remote = process.env.PUSH_REMOTE || 'origin';
    this.batch = Math.max(1, Number(process.env.PUSH_BATCH || '1'));
    const requestedIntervalMs = Number(
      process.env.PUSH_INTERVAL_MS || PacedPusher.MIN_INTERVAL_MS,
    );
    this.intervalMs = Number.isFinite(requestedIntervalMs)
      ? Math.max(PacedPusher.MIN_INTERVAL_MS, requestedIntervalMs)
      : PacedPusher.MIN_INTERVAL_MS;
  }

  private resolvePacerRepoRoot(repoRoot: string): string {
    const configuredRoot = process.env.AGENT_REPO_ROOT
      ? path.resolve(process.env.AGENT_REPO_ROOT)
      : null;
    if (configuredRoot) {
      return configuredRoot;
    }

    const candidate = path.resolve(repoRoot);
    const canSelfClone =
      process.env.PACED_PUSH_ENABLED === 'true' &&
      Boolean(process.env.GITHUB_TOKEN || process.env.GH_TOKEN) &&
      Boolean(process.env.GITHUB_REPO);

    if (canSelfClone && !fs.existsSync(path.join(candidate, '.git'))) {
      return path.join(os.tmpdir(), 'hermeschain-pacer-worktree');
    }

    return candidate;
  }

  start(): void {
    if (this.interval) return;
    if (process.env.PACED_PUSH_ENABLED !== 'true') {
      console.log('[PACER] disabled (set PACED_PUSH_ENABLED=true to activate)');
      return;
    }
    if (process.env.AGENT_ROLE !== 'worker') {
      console.log(`[PACER] disabled (role=${process.env.AGENT_ROLE || 'unset'}; worker only)`);
      return;
    }
    if (!process.env.GITHUB_TOKEN) {
      console.log('[PACER] disabled (no GITHUB_TOKEN)');
      return;
    }
    console.log(
      `[PACER] active — every ${Math.round(this.intervalMs / 60000)} min, ` +
      `${this.batch} commit(s)/fire from ${this.branch} → ${this.target}`,
    );
    console.log(`[PACER] repo root: ${this.repoRoot}`);
    console.log(`[PACER] first tick scheduled in ${Math.round(this.intervalMs / 60000)} min`);
    this.interval = setInterval(() => this.tick(), this.intervalMs);
  }

  stop(): void {
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
    }
  }

  private git(args: string[], env?: NodeJS.ProcessEnv): string {
    try {
      return execFileSync('git', args, {
        cwd: this.repoRoot,
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
        env: env ? { ...process.env, ...env } : process.env,
      }).trim();
    } catch (err: any) {
      // Surface stderr so the push failure reason is visible in logs.
      const stderr = err?.stderr?.toString?.() || '';
      const stdout = err?.stdout?.toString?.() || '';
      const combined = [stderr, stdout].filter(Boolean).join(' ').trim();
      const sanitized = this.sanitizeSecret(combined);
      const wrapped = new Error(
        `${err?.message || 'git failed'}${sanitized ? ' — ' + sanitized : ''}`,
      );
      throw wrapped;
    }
  }

  private sanitizeSecret(value: string): string {
    const token = process.env.GITHUB_TOKEN || process.env.GH_TOKEN;
    return token ? value.split(token).join('[redacted]') : value;
  }

  private githubRemoteUrl(): string | null {
    const token = process.env.GITHUB_TOKEN || process.env.GH_TOKEN;
    const repo = process.env.GITHUB_REPO;
    if (!token || !repo) {
      return null;
    }
    return `https://x-access-token:${token}@github.com/${repo}.git`;
  }

  private canRecreateRepoRoot(): boolean {
    const configuredRoot = process.env.AGENT_REPO_ROOT
      ? path.resolve(process.env.AGENT_REPO_ROOT)
      : null;
    const normalizedRoot = path.resolve(this.repoRoot);
    return (
      normalizedRoot.startsWith(path.resolve(os.tmpdir()) + path.sep) ||
      (configuredRoot !== null && normalizedRoot === configuredRoot)
    );
  }

  private isGitWorktree(): boolean {
    if (!fs.existsSync(this.repoRoot)) {
      return false;
    }
    try {
      const output = execFileSync('git', ['rev-parse', '--is-inside-work-tree'], {
        cwd: this.repoRoot,
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
      }).trim();
      return output === 'true';
    } catch {
      return false;
    }
  }

  private configureRepository(): void {
    this.git(['config', 'user.name', PUBLISH_GIT_USER_NAME]);
    this.git(['config', 'user.email', PUBLISH_GIT_USER_EMAIL]);

    const remoteUrl = this.githubRemoteUrl();
    if (!remoteUrl) {
      return;
    }

    try {
      this.git(['remote', 'set-url', this.remote, remoteUrl]);
    } catch {
      this.git(['remote', 'add', this.remote, remoteUrl]);
    }
  }

  private cloneFresh(reason: string): boolean {
    const remoteUrl = this.githubRemoteUrl();
    const repo = process.env.GITHUB_REPO;

    if (!remoteUrl || !repo) {
      console.warn('[PACER] cannot repair repo: missing GITHUB_TOKEN/GITHUB_REPO');
      return false;
    }

    if (!this.canRecreateRepoRoot()) {
      console.warn(`[PACER] cannot repair repo at non-temp path: ${this.repoRoot}`);
      return false;
    }

    const now = Date.now();
    if (now - this.lastRepairAt < 60_000) {
      console.warn('[PACER] repo repair suppressed to avoid a clone loop');
      return false;
    }
    this.lastRepairAt = now;

    try {
      console.warn(`[PACER] repairing repo after ${reason}; recloning ${repo}`);
      fs.rmSync(this.repoRoot, { recursive: true, force: true });
      fs.mkdirSync(path.dirname(this.repoRoot), { recursive: true });
      execFileSync('git', ['clone', '--depth', '50', remoteUrl, this.repoRoot], {
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
      });
      this.configureRepository();
      return true;
    } catch (err: any) {
      const stderr = err?.stderr?.toString?.() || '';
      const stdout = err?.stdout?.toString?.() || '';
      const combined = this.sanitizeSecret([stderr, stdout].filter(Boolean).join(' ').trim());
      console.warn(
        `[PACER] repo repair failed: ${err?.message || err}${combined ? ' — ' + combined : ''}`,
      );
      return false;
    }
  }

  private ensureRepository(): boolean {
    if (!this.isGitWorktree()) {
      return this.cloneFresh('missing or invalid git worktree');
    }

    try {
      this.configureRepository();
      return true;
    } catch (err: any) {
      console.warn(`[PACER] repo config failed: ${err?.message || err}`);
      return this.cloneFresh('repo config failure');
    }
  }

  private sanitizeCommitMessage(message: string, fallbackSubject: string): string {
    const stripped = message
      .replace(/\r\n/g, '\n')
      .split('\n')
      .filter((line) => {
        const normalized = line.toLowerCase();
        if (!normalized.startsWith('co-authored-by:')) {
          return true;
        }
        return !(normalized.includes('claude') || normalized.includes('anthropic'));
      })
      .join('\n')
      .replace(/\n{3,}/g, '\n\n')
      .trim();

    return stripped || fallbackSubject;
  }

  private gitDate(): string {
    const now = new Date();
    const pad = (value: number) => String(value).padStart(2, '0');
    return (
      `${now.getUTCFullYear()}-${pad(now.getUTCMonth() + 1)}-${pad(now.getUTCDate())}` +
      `T${pad(now.getUTCHours())}:${pad(now.getUTCMinutes())}:${pad(now.getUTCSeconds())} +0000`
    );
  }

  private hasPublishedSubject(subject: string): boolean {
    const output = this.git(['log', '-1000', '--pretty=%s', this.target]);
    return output.split('\n').includes(subject);
  }

  private latestTargetCommitAgeMs(): number | null {
    try {
      const timestamp = this.git([
        'log',
        '-1',
        '--pretty=%ct',
        `${this.remote}/${this.target}`,
      ]);
      const seconds = Number(timestamp);
      if (!Number.isFinite(seconds) || seconds <= 0) {
        return null;
      }
      return Date.now() - seconds * 1000;
    } catch {
      return null;
    }
  }

  private shouldThrottlePublish(): boolean {
    const ageMs = this.latestTargetCommitAgeMs();
    if (ageMs === null || ageMs >= this.intervalMs) {
      return false;
    }

    const remainingMs = this.intervalMs - ageMs;
    const ageMinutes = Math.max(0, Math.floor(ageMs / 60_000));
    const remainingMinutes = Math.max(1, Math.ceil(remainingMs / 60_000));
    console.log(
      `[PACER] throttled — last ${this.target} commit ${ageMinutes} min ago; ` +
      `next publish allowed in ${remainingMinutes} min`,
    );
    return true;
  }

  private publishSanitizedCommit(sha: string, subject: string): string | null {
    const originalMessage = this.git(['log', '-1', '--pretty=%B', sha]);
    const message = this.sanitizeCommitMessage(originalMessage, subject);
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'hermes-pacer-'));
    const messageFile = path.join(tmpDir, 'COMMIT_EDITMSG');
    fs.writeFileSync(messageFile, `${message}\n`, 'utf8');

    const now = this.gitDate();
    const commitEnv = {
      GIT_AUTHOR_NAME: PUBLISH_GIT_USER_NAME,
      GIT_AUTHOR_EMAIL: PUBLISH_GIT_USER_EMAIL,
      GIT_AUTHOR_DATE: now,
      GIT_COMMITTER_NAME: PUBLISH_GIT_USER_NAME,
      GIT_COMMITTER_EMAIL: PUBLISH_GIT_USER_EMAIL,
      GIT_COMMITTER_DATE: now,
    };

    try {
      try {
        this.git(['cherry-pick', '--no-commit', '--strategy=recursive', '--strategy-option=theirs', sha], commitEnv);
      } catch (err: any) {
        console.warn(`[PACER] cherry-pick conflicted on ${sha.slice(0, 8)} — taking queued changes`);
        this.git(['checkout', '--theirs', '.']);
        this.git(['add', '-A']);
      }

      if (!this.git(['status', '--porcelain'])) {
        console.log(`[PACER] skipped ${sha.slice(0, 8)} ${subject} (already applied)`);
        return null;
      }

      this.git(['commit', '-F', messageFile], commitEnv);
      const publishedSha = this.git(['rev-parse', 'HEAD']);
      this.git(['push', this.remote, `HEAD:refs/heads/${this.target}`]);
      return publishedSha;
    } catch (err) {
      try {
        this.git(['cherry-pick', '--abort']);
      } catch {
        // No cherry-pick in progress or abort failed; surface the original error.
      }
      throw err;
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  }

  private listForwardCommits(): string[] {
    const ref = `${this.remote}/${this.target}..${this.remote}/${this.branch}`;
    try {
      const out = this.git(['rev-list', '--reverse', ref]);
      return out ? out.split('\n').filter(Boolean) : [];
    } catch (err: any) {
      console.error(`[PACER] enumerate failed: ${err?.message || err}`);
      return [];
    }
  }

  private readPointer(): number {
    try {
      const raw = fs.readFileSync(this.pointerFile, 'utf8').trim();
      const n = parseInt(raw, 10);
      return Number.isFinite(n) && n >= 0 ? n : 0;
    } catch {
      return 0;
    }
  }

  private writePointer(n: number): void {
    fs.mkdirSync(path.dirname(this.pointerFile), { recursive: true });
    fs.writeFileSync(this.pointerFile, `${n}\n`);
  }

  private fetchRefs(): boolean {
    try {
      // Unshallow first — GitIntegration clones with --depth 50, so the
      // intermediate commits we want to push aren't in the local object
      // store yet. --unshallow is a no-op once the repo is already deep.
      if (fs.existsSync(path.join(this.repoRoot, '.git', 'shallow'))) {
        try { this.git(['fetch', '--unshallow', this.remote]); }
        catch { /* already unshallow or unsupported by the remote, ignore */ }
      }
      // Force-fetch all branches via explicit refspec — single-branch
      // clones don't have origin/<other> tracking refs by default.
      this.git(['fetch', '--prune', this.remote, '+refs/heads/*:refs/remotes/' + this.remote + '/*']);
      return true;
    } catch (err: any) {
      console.warn(`[PACER] fetch failed: ${err?.message || err}`);
      return false;
    }
  }

  private tick(): void {
    if (!this.ensureRepository()) {
      return;
    }

    if (!this.fetchRefs()) {
      if (!this.cloneFresh('fetch failure') || !this.fetchRefs()) {
        return;
      }
    }

    if (this.shouldThrottlePublish()) {
      return;
    }

    const queue = this.listForwardCommits();
    if (queue.length === 0) {
      console.log(`[PACER] nothing to push (target = branch tip)`);
      return;
    }
    console.log(`[PACER] ${queue.length} commit(s) ahead; pushing up to ${this.batch}`);

    try {
      this.git(['checkout', '-B', this.target, `${this.remote}/${this.target}`]);
    } catch (err: any) {
      console.error(`[PACER] checkout of ${this.target} failed: ${err?.message || err}`);
      return;
    }

    let pushed = 0;
    let skippedPublished = 0;
    let skippedApplied = 0;
    let failed = false;

    for (const sha of queue) {
      if (pushed >= this.batch) {
        break;
      }

      try {
        const subject = this.git(['log', '-1', '--pretty=%s', sha]);
        if (this.hasPublishedSubject(subject)) {
          skippedPublished++;
          continue;
        }

        const publishedSha = this.publishSanitizedCommit(sha, subject);
        if (!publishedSha) {
          skippedApplied++;
          continue;
        }

        console.log(`[PACER] pushed ${publishedSha.slice(0, 8)} ${subject}`);
        pushed++;
      } catch (err: any) {
        console.error(`[PACER] push of ${sha} failed: ${err?.message || err}`);
        failed = true;
        break;
      }
    }

    if (skippedPublished > 0 || skippedApplied > 0) {
      const parts: string[] = [];
      if (skippedPublished > 0) {
        parts.push(`${skippedPublished} already on ${this.target}`);
      }
      if (skippedApplied > 0) {
        parts.push(`${skippedApplied} already applied`);
      }
      console.log(`[PACER] skipped ${parts.join(', ')} while scanning queue`);
    }

    if (!failed && pushed === 0) {
      console.log('[PACER] no unpublished queue commits found this tick');
    }

    if (pushed > 0) {
      const before = this.readPointer();
      this.writePointer(before + pushed);
    }
  }
}
