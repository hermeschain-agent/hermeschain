import { execFileSync, execSync, spawn } from 'child_process';
import * as path from 'path';
import * as fs from 'fs';
import { eventBus } from '../events/EventBus';
import { AgentConfig, getWriteScopes } from './config';
import { ExecutionScope } from './types';
import {
  ensurePublishQueueBranch,
  getPublishQueueConfig,
  refreshPublishQueueStatus,
  resolveAutoPushSetting,
} from './PublishQueue';
import { assessStagedCommitQuality } from './CommitQuality';

// Auto-deploy configuration.
// Default: enabled when a GITHUB_TOKEN is present (a deployment with creds
// is implicitly opted in to pushing the agent's work). Opt out by setting
// AUTO_GIT_PUSH=false explicitly. Setting =true forces it on even without
// a token (for local SSH-agent setups where the token isn't in env).
function resolveAutoPush(): boolean {
  const raw = (process.env.AUTO_GIT_PUSH || '').toLowerCase();
  if (raw === 'true' || raw === '1') return true;
  if (raw === 'false' || raw === '0') return false;
  // Unset → default based on whether we appear to have credentials.
  return Boolean(process.env.GITHUB_TOKEN || process.env.GH_TOKEN);
}
const GIT_USER_NAME = process.env.GIT_USER_NAME || 'hermes agent';
const GIT_USER_EMAIL = process.env.GIT_USER_EMAIL || 'hermeschain-agent@users.noreply.github.com';

// Git operation result
export interface GitOperationResult {
  success: boolean;
  output: string;
  error?: string;
  branch?: string;
  commit?: string;
  prUrl?: string;
  files?: string[];
}

// Branch info
export interface BranchInfo {
  name: string;
  current: boolean;
  lastCommit: string;
  lastCommitDate: string;
}

// PR info
export interface PullRequestInfo {
  number: number;
  title: string;
  branch: string;
  status: 'open' | 'merged' | 'closed';
  url: string;
}

// Commit info
export interface CommitInfo {
  hash: string;
  shortHash: string;
  message: string;
  author: string;
  date: string;
}

export interface GitCapabilityProbe {
  git: 'ready' | 'unavailable';
  push: 'ready' | 'unavailable';
  reason?: string;
}

export interface GitStatusEntry {
  status: string;
  filePath: string;
}

export class GitIntegration {
  private projectRoot: string;
  private mainBranch: string = 'main';
  private branchPrefix: string = 'hermes/';
  private initialized: boolean = false;
  private config: AgentConfig | null = null;

  constructor(projectRoot?: string) {
    this.projectRoot =
      projectRoot ||
      process.env.AGENT_REPO_ROOT ||
      process.cwd();
    console.log(`[GIT] Initialized with project root: ${this.projectRoot}`);
    this.setupGitConfig();
  }

  private hasGitRepo(): boolean {
    return fs.existsSync(path.join(this.projectRoot, '.git'));
  }

  private matchesScope(filePath: string, scope: ExecutionScope): boolean {
    const normalized = filePath.replace(/\\/g, '/');
    if (scope.kind === 'file') {
      return normalized === scope.path.replace(/\\/g, '/');
    }
    return normalized.startsWith(scope.path.replace(/\\/g, '/'));
  }

  private getDefaultCommitScopes(): string[] {
    return getWriteScopes(this.config);
  }

  private isAutoPushEnabled(): boolean {
    return resolveAutoPush();
  }

  private getQueueBranch(): string {
    return getPublishQueueConfig().queueBranch;
  }

  private async ensureQueueBranchReady(): Promise<void> {
    await ensurePublishQueueBranch(this.projectRoot, {
      checkout: true,
      refreshRemote: this.isAutoPushEnabled(),
    });
  }

  async prepareAuthoringBranch(): Promise<GitOperationResult> {
    try {
      if (!this.hasGitRepo()) {
        return {
          success: false,
          output: '',
          error: 'Git repository unavailable',
        };
      }

      await this.ensureQueueBranchReady();
      return {
        success: true,
        output: `Authoring branch ready: ${this.getQueueBranch()}`,
        branch: this.getQueueBranch(),
      };
    } catch (error: any) {
      return {
        success: false,
        output: '',
        error: error?.message || String(error),
      };
    }
  }

  private isLikelyGibberish(value: string): boolean {
    const normalized = value.trim().toLowerCase();
    if (!normalized) return true;

    if (/\b(x{3,}|asdf|qwerty|lorem ipsum|placeholder)\b/i.test(normalized)) {
      return true;
    }

    if (/([a-z])\1{7,}/i.test(normalized.replace(/[^a-z]/g, ''))) {
      return true;
    }

    const tokens = normalized.split(/\s+/).filter(Boolean);
    if (tokens.length >= 6) {
      const unique = new Set(tokens);
      if (unique.size <= Math.max(2, Math.floor(tokens.length * 0.35))) {
        return true;
      }
    }

    return false;
  }

  private inspectFilesForGibberish(filePaths: string[]): { blocked: boolean; reason?: string } {
    const suspiciousPattern =
      /\b(x{3,}|asdf|qwerty|lorem ipsum|placeholder text|placeholder content)\b/i;

    for (const filePath of filePaths.slice(0, 20)) {
      const absolutePath = path.join(this.projectRoot, filePath);
      if (!fs.existsSync(absolutePath) || fs.statSync(absolutePath).isDirectory()) {
        continue;
      }

      try {
        const content = fs.readFileSync(absolutePath, 'utf-8').slice(0, 6000);
        if (suspiciousPattern.test(content)) {
          return {
            blocked: true,
            reason: `Suspicious placeholder content detected in ${filePath}`,
          };
        }

        const denseAlpha = content.replace(/[^a-z]/gi, '');
        if (denseAlpha.length > 120 && /([a-z])\1{12,}/i.test(denseAlpha)) {
          return {
            blocked: true,
            reason: `Repeated character gibberish detected in ${filePath}`,
          };
        }
      } catch {
        // Ignore unreadable files here and let git/verification surface the real issue.
      }
    }

    return { blocked: false };
  }

  private validateCommitMessage(message: string): { valid: boolean; reason?: string } {
    const trimmed = message.trim();
    if (trimmed.length > 200) {
      return { valid: false, reason: 'Commit message exceeds 200 characters.' };
    }

    const conventionalPattern =
      /^(feat|fix|docs|style|refactor|perf|test|build|ci|chore|revert)(\([a-z0-9-]+\))?: .+/;
    if (!conventionalPattern.test(trimmed)) {
      return { valid: false, reason: 'Commit message must follow conventional-commit format.' };
    }

    return { valid: true };
  }

  private adminMutationsEnabled(): boolean {
    return process.env.AGENT_ADMIN_GIT_MUTATIONS === 'true';
  }

  private blockedAdminMutation(operation: string): GitOperationResult {
    return {
      success: false,
      output: '',
      error:
        `${operation} is disabled for the autonomous agent. ` +
        'Set AGENT_ADMIN_GIT_MUTATIONS=true for manual admin use.',
    };
  }

  private withCommitTrailers(message: string): string {
    const trailers = [
      `Signed-off-by: ${GIT_USER_NAME} <${GIT_USER_EMAIL}>`,
    ];

    const existing = message.toLowerCase();
    const missingTrailers = trailers.filter((trailer) => {
      const key = trailer.split(':')[0].toLowerCase();
      return !existing.includes(`${key}:`);
    });

    return missingTrailers.length > 0
      ? `${message.trim()}\n\n${missingTrailers.join('\n')}`
      : message.trim();
  }

  private getScopedStatusEntries(
    scopes?: ExecutionScope[],
    requestedFiles?: string[]
  ): GitStatusEntry[] {
    const statusOutput = this.execGit('status --porcelain', true);
    const requested = new Set((requestedFiles || []).map((file) => file.replace(/\\/g, '/')));

    return statusOutput
      .split('\n')
      .filter(Boolean)
      .map((line) => ({
        status: line.substring(0, 2).trim(),
        filePath: line.substring(3).trim(),
      }))
      .filter((entry) => {
        if (!entry.filePath) return false;
        const normalized = entry.filePath.replace(/\\/g, '/');
        if (requested.size > 0 && !requested.has(normalized)) {
          return false;
        }
        if (scopes && scopes.length > 0) {
          return scopes.some((scope) => this.matchesScope(normalized, scope));
        }
        const defaultScopes = this.getDefaultCommitScopes();
        return defaultScopes.some((scopePrefix) => normalized.startsWith(scopePrefix));
      });
  }

  getUnexpectedChangedFilesWithinScopes(
    scopes: ExecutionScope[],
    expectedFiles: string[],
  ): string[] {
    if (!this.hasGitRepo()) {
      return [];
    }

    const expected = new Set(expectedFiles.map((file) => file.replace(/\\/g, '/')));
    return this.getScopedStatusEntries(scopes)
      .map((entry) => entry.filePath.replace(/\\/g, '/'))
      .filter((filePath) => !expected.has(filePath));
  }

  configure(config: AgentConfig): void {
    this.config = config;
    if (config.repoRoot) {
      this.projectRoot = config.repoRoot;
    }
    this.setupGitConfig();
  }

  private isSafeEphemeralCloneTarget(target: string): boolean {
    const resolved = path.resolve(target);
    return (
      resolved.startsWith('/tmp/') ||
      resolved.startsWith('/var/tmp/') ||
      resolved.startsWith('/private/tmp/') ||
      resolved.includes('/var/folders/')
    );
  }

  private prepareCloneTarget(): void {
    const resolved = path.resolve(this.projectRoot);
    const parent = path.dirname(resolved);
    fs.mkdirSync(parent, { recursive: true });

    if (!fs.existsSync(resolved)) {
      return;
    }

    const entries = fs.readdirSync(resolved).filter((entry) => entry !== '.DS_Store');
    if (entries.length === 0) {
      return;
    }

    if (!this.isSafeEphemeralCloneTarget(resolved)) {
      throw new Error(
        `Refusing to clone into non-empty non-ephemeral path ${resolved}. ` +
        'Set AGENT_REPO_ROOT to an empty /tmp path for autonomous Git work.'
      );
    }

    fs.rmSync(resolved, { recursive: true, force: true });
  }

  private linkRuntimeNodeModules(): void {
    const runtimeRoot = process.env.AGENT_RUNTIME_ROOT || '/app';
    for (const workspace of ['backend', 'frontend']) {
      const source = path.join(runtimeRoot, workspace, 'node_modules');
      const target = path.join(this.projectRoot, workspace, 'node_modules');
      try {
        if (fs.existsSync(source) && !fs.existsSync(target)) {
          fs.symlinkSync(source, target, 'dir');
        }
      } catch (error: any) {
        console.warn(`[GIT] Could not link ${workspace}/node_modules:`, error?.message || error);
      }
    }
  }

  // Configure git user and remote for commits
  private setupGitConfig(): void {
    const token = process.env.GITHUB_TOKEN || process.env.GH_TOKEN;
    const repo = process.env.GITHUB_REPO;
    const authenticatedRemoteUrl =
      token && repo ? `https://${token}@github.com/${repo}.git` : null;

    if (!this.hasGitRepo()) {
      // In production containers the source is uploaded without a .git
      // directory. If we have credentials, clone the repo metadata so the
      // agent can commit + push. This is gated on the worker role so web
      // containers never self-clone.
      // Honor the same resolveAutoPush gate so the clone logic stays in
      // lockstep with the push logic (unset-env + token present → enabled).
      const shouldClone =
        process.env.AGENT_ROLE === 'worker' &&
        this.isAutoPushEnabled() &&
        token &&
        repo;

      if (shouldClone) {
        try {
          const queueBranch = getPublishQueueConfig().queueBranch;
          console.log(`[GIT] No .git found — cloning ${repo} (${queueBranch}) to ${this.projectRoot}`);
          this.prepareCloneTarget();
          // Clone the queue branch directly so the worktree STARTS on it — the
          // worker authors here and never switches from the default branch
          // (which would choke on build-output diffs). --no-single-branch also
          // fetches origin/<publishBranch> (main) so the pacer can compare trees
          // and publish.
          execFileSync('git', ['clone', '--branch', queueBranch, '--depth', '50', '--no-single-branch', authenticatedRemoteUrl!, this.projectRoot], {
            stdio: 'pipe',
            timeout: 60000,
          });
          this.linkRuntimeNodeModules();
          execFileSync('git', ['config', 'user.name', GIT_USER_NAME], {
            cwd: this.projectRoot,
            stdio: 'pipe',
          });
          execFileSync('git', ['config', 'user.email', GIT_USER_EMAIL], {
            cwd: this.projectRoot,
            stdio: 'pipe',
          });
          execFileSync('git', ['remote', 'set-url', 'origin', authenticatedRemoteUrl!], {
            cwd: this.projectRoot,
            stdio: 'pipe',
          });
          console.log('[GIT] Clone complete, clean worktree ready.');
        } catch (error: any) {
          console.error('[GIT] Clone failed:', error?.message || error);
          return;
        }
      } else {
        console.log(
          '[GIT] No git repository detected. Auto-commit will stay local-only and inactive.'
        );
        return;
      }
    }

    if (
      authenticatedRemoteUrl &&
      process.env.AGENT_ROLE === 'worker' &&
      this.isAutoPushEnabled()
    ) {
      try {
        execFileSync('git', ['remote', 'set-url', 'origin', authenticatedRemoteUrl], {
          cwd: this.projectRoot,
          stdio: 'pipe',
        });
      } catch (error: any) {
        console.warn('[GIT] Could not update authenticated origin remote:', error?.message || error);
      }
    }

    this.initialized = true;
    console.log(
      `[GIT] Using per-command git author identity: ${GIT_USER_NAME} <${GIT_USER_EMAIL}>`
    );
  }

  // Derive a detailed conventional commit message from a file path
  private deriveCommitMessage(filePath: string): string {
    const base = path.basename(filePath, path.extname(filePath));
    const dir = path.dirname(filePath);

    // Determine scope from directory
    let scope = 'chain';
    if (dir.includes('hermes-generated')) scope = 'agent';
    else if (dir.includes('api')) scope = 'api';
    else if (dir.includes('blockchain')) scope = 'chain';
    else if (dir.includes('agent')) scope = 'agent';
    else if (dir.includes('vm')) scope = 'vm';
    else if (dir.includes('validators')) scope = 'consensus';
    else if (dir.includes('frontend') || dir.includes('src/components')) scope = 'frontend';
    else if (dir.includes('contracts')) scope = 'contracts';
    else if (dir.includes('database')) scope = 'db';
    else if (dir.includes('x402')) scope = 'x402';
    else if (dir.includes('test')) scope = 'test';

    // Determine type from filename patterns
    let type = 'feat';
    const lowerBase = base.toLowerCase();
    if (lowerBase.includes('test') || lowerBase.includes('spec')) type = 'test';
    else if (lowerBase.includes('fix') || lowerBase.includes('patch')) type = 'fix';
    else if (lowerBase.includes('audit') || lowerBase.includes('review') || lowerBase.includes('security')) type = 'fix';
    else if (lowerBase.includes('optimize') || lowerBase.includes('perf')) type = 'perf';
    else if (lowerBase.includes('refactor')) type = 'refactor';
    else if (lowerBase.startsWith('xxx')) type = 'chore';

    // Convert filename to readable description
    let desc = base
      .replace(/[-_]+/g, ' ')               // dashes/underscores to spaces
      .replace(/\d{10,}/g, '')               // strip timestamps
      .replace(/^xxx\s*/i, '')               // strip xxx prefix
      .replace(/\s+/g, ' ')                  // collapse spaces
      .trim();

    if (!desc || desc.length < 3) {
      desc = 'update module';
    }

    // Lowercase first char
    desc = desc.charAt(0).toLowerCase() + desc.slice(1);

    return `${type}(${scope}): ${desc}`;
  }

  // Auto-commit scoped agent changes — one commit per verified run onto the
  // queue branch. Publication to main is handled separately by PacedPusher.
  async autoCommitAndPush(
    message: string,
    taskId?: string,
    options: {
      scopes?: ExecutionScope[];
      files?: string[];
    } = {}
  ): Promise<GitOperationResult> {
    console.log('[GIT] autoCommitAndPush called:', message);

    try {
      if (!this.hasGitRepo()) {
        return { success: true, output: 'Git repository unavailable; skipping commit.', files: [] };
      }

      const changedFiles = this.getScopedStatusEntries(options.scopes, options.files);

      if (changedFiles.length === 0) {
        console.log('[GIT] No scoped changes to commit');
        return { success: true, output: 'No scoped changes to commit', files: [] };
      }

      if (this.isLikelyGibberish(message)) {
        return {
          success: false,
          output: '',
          error: 'Commit blocked by gibberish guard: suspicious commit message.',
          files: changedFiles.map((entry) => entry.filePath),
        };
      }

      const messageValidation = this.validateCommitMessage(message);
      if (!messageValidation.valid) {
        return {
          success: false,
          output: '',
          error: `Commit blocked by policy: ${messageValidation.reason}`,
          files: changedFiles.map((entry) => entry.filePath),
        };
      }

      const fileGuard = this.inspectFilesForGibberish(changedFiles.map((entry) => entry.filePath));
      if (fileGuard.blocked) {
        return {
          success: false,
          output: '',
          error: `Commit blocked by gibberish guard: ${fileGuard.reason}`,
          files: changedFiles.map((entry) => entry.filePath),
        };
      }

      await this.ensureQueueBranchReady();

      console.log(`[GIT] Found ${changedFiles.length} scoped files to commit`);
      const stagedFiles: string[] = [];

      for (const entry of changedFiles) {
        const { status, filePath } = entry;
        if (!filePath) continue;
        if (status === 'D') {
          this.execGit(`rm --cached --ignore-unmatch "${filePath}"`, true);
        } else {
          this.execGit(`add "${filePath}"`, true);
        }
        stagedFiles.push(filePath);
      }

      if (stagedFiles.length === 0) {
        return { success: true, output: 'No staged scoped changes to commit', files: [] };
      }

      // Quality backstop (authorship): the verifyRun gate already proved this
      // change builds/tests, so here we only block the two things it can't
      // catch — self-labeled stubs and dist-only commits. The strict substance
      // filtering happens at the publish boundary (PacedPusher). On reject we
      // unstage so the worktree is clean for the next task attempt.
      const quality = assessStagedCommitQuality(this.projectRoot, message);
      if (!quality.quality) {
        try { this.execGit('reset', true); } catch { /* best-effort unstage */ }
        return {
          success: false,
          output: '',
          error: `blocked by quality gate: ${quality.reason}`,
          files: stagedFiles,
        };
      }

      execFileSync('git', ['commit', '-m', this.withCommitTrailers(message)], {
        cwd: this.projectRoot,
        encoding: 'utf-8',
        timeout: 30000,
        maxBuffer: 64 * 1024 * 1024,
        env: {
          ...process.env,
          GIT_AUTHOR_NAME: GIT_USER_NAME,
          GIT_AUTHOR_EMAIL: GIT_USER_EMAIL,
          GIT_COMMITTER_NAME: GIT_USER_NAME,
          GIT_COMMITTER_EMAIL: GIT_USER_EMAIL,
        },
        stdio: 'pipe',
      });
      const commitHash = this.execGit('rev-parse --short HEAD', true);

      console.log(`[GIT] Created commit: ${commitHash}`);

      const branch = this.getQueueBranch();

      // Push the queue branch if enabled. This never deploys directly to main.
      if (this.isAutoPushEnabled()) {
        console.log(`[GIT] Pushing queue branch ${branch} to origin/${branch}...`);
        
        try {
          // Re-sync with the remote queue branch before pushing. The pacer and
          // other workers advance origin/${branch} while we author, so a bare
          // push hits a non-fast-forward ("fetch first") rejection. Fetch the
          // latest tip and replay our new commit(s) on top, then push.
          this.execGit(`fetch origin ${branch}`, true);
          let ahead = 0;
          try {
            ahead = Number(this.execGit(`rev-list --count origin/${branch}..HEAD`, true)) || 0;
          } catch {
            ahead = 0;
          }
          // Only rebase a small advance over the remote tip (a correctly-based
          // queue branch). A large count means HEAD is forked off the wrong base
          // (e.g. main); don't replay its whole history — let the push surface it.
          if (ahead > 0 && ahead <= 25) {
            try {
              this.execGit(`rebase origin/${branch}`, true);
            } catch (rebaseError) {
              this.execGit('rebase --abort', true);
              throw rebaseError;
            }
          }
          this.execGit(`push origin ${branch}`, true);
          console.log(`[GIT] Successfully pushed queue branch to origin/${branch}`);
          await refreshPublishQueueStatus(this.projectRoot, {
            force: true,
            refreshRemote: true,
          });
          
          eventBus.emit('git_action', {
            type: 'queue_commit',
            message,
            commit: commitHash,
            branch,
            pushed: true
          });

          return {
            success: true,
            output: `Committed to queue and pushed: ${commitHash}`,
            commit: commitHash,
            branch,
            files: stagedFiles
          };
        } catch (pushError: any) {
          console.error('[GIT] Push failed:', pushError.message);
          
          eventBus.emit('git_action', {
            type: 'commit',
            message,
            commit: commitHash,
            pushed: false,
            error: pushError.message
          });

          return {
            success: true,
            output: `Committed to queue (push failed): ${commitHash}`,
            commit: commitHash,
            error: `Push failed: ${pushError.message}`,
            files: stagedFiles
          };
        }
      } else {
        eventBus.emit('git_action', {
          type: 'queue_commit',
          message,
          commit: commitHash,
          branch,
          pushed: false
        });
        await refreshPublishQueueStatus(this.projectRoot, {
          force: true,
          refreshRemote: false,
        });

        return {
          success: true,
          output: `Committed to queue: ${commitHash}`,
          commit: commitHash,
          branch,
          files: stagedFiles
        };
      }
    } catch (error: any) {
      console.error('[GIT] Auto-commit failed:', error.message);
      return {
        success: false,
        output: '',
        error: error.message
      };
    }
  }

  getChangedFilesWithinScopes(scopes: ExecutionScope[]): string[] {
    try {
      return this.getScopedStatusEntries(scopes).map((entry) => entry.filePath);
    } catch {
      return [];
    }
  }

  probeCapabilities(): GitCapabilityProbe {
    if (!this.hasGitRepo()) {
      return {
        git: 'unavailable',
        push: 'unavailable',
        reason: 'Git metadata is unavailable in this workspace.',
      };
    }

    try {
      this.execGit('rev-parse --is-inside-work-tree', true);
    } catch (error: any) {
      return {
        git: 'unavailable',
        push: 'unavailable',
        reason: error?.message || 'Git repository check failed.',
      };
    }

    if (!this.isAutoPushEnabled()) {
      return {
        git: 'ready',
        push: 'unavailable',
        reason: 'AUTO_GIT_PUSH is disabled.',
      };
    }

    try {
      this.execGit('fetch --dry-run --all', true);
      const probeBranch = `agent-push-probe-${process.pid}-${Date.now()}`;
      this.execGit(`push --dry-run origin HEAD:refs/heads/${probeBranch}`, true);
      return { git: 'ready', push: 'ready' };
    } catch (error: any) {
      return {
        git: 'ready',
        push: 'unavailable',
        reason: error?.message || 'Git push probe failed.',
      };
    }
  }

  // Execute git command safely
  private execGit(command: string, silent: boolean = false): string {
    if (!this.hasGitRepo()) {
      throw new Error('Git repository unavailable');
    }

    try {
      const result = execSync(`git ${command}`, {
        cwd: this.projectRoot,
        encoding: 'utf-8',
        timeout: 30000,
        maxBuffer: 64 * 1024 * 1024,
        env: {
          ...process.env,
          GIT_AUTHOR_NAME: GIT_USER_NAME,
          GIT_AUTHOR_EMAIL: GIT_USER_EMAIL,
          GIT_COMMITTER_NAME: GIT_USER_NAME,
          GIT_COMMITTER_EMAIL: GIT_USER_EMAIL,
        },
        stdio: silent ? 'pipe' : undefined
      });
      return result.trim();
    } catch (error: any) {
      if (error.stderr) {
        throw new Error(error.stderr.toString().trim());
      }
      throw error;
    }
  }

  // Get current branch
  getCurrentBranch(): string {
    try {
      return this.execGit('branch --show-current', true);
    } catch {
      return 'unknown';
    }
  }

  // Get list of branches
  getBranches(): BranchInfo[] {
    try {
      const output = this.execGit('branch -v --format="%(refname:short)|%(HEAD)|%(objectname:short)|%(creatordate:relative)"', true);
      const lines = output.split('\n').filter(Boolean);
      
      return lines.map(line => {
        const [name, isCurrent, commit, date] = line.split('|');
        return {
          name,
          current: isCurrent === '*',
          lastCommit: commit,
          lastCommitDate: date
        };
      });
    } catch {
      return [];
    }
  }

  // Create a new feature branch for a task
  async createTaskBranch(taskId: string, taskTitle: string): Promise<GitOperationResult> {
    if (!this.adminMutationsEnabled()) {
      return this.blockedAdminMutation('createTaskBranch');
    }

    // Sanitize branch name
    const safeName = taskTitle
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .substring(0, 40);
    
    const branchName = `${this.branchPrefix}${taskId}-${safeName}`;

    try {
      // Ensure we're on main and up to date
      this.execGit(`checkout ${this.mainBranch}`, true);
      
      try {
        this.execGit('pull origin main', true);
      } catch {
        // May not have remote, continue anyway
      }

      // Create and checkout new branch
      this.execGit(`checkout -b ${branchName}`, true);

      eventBus.emit('git_action', {
        type: 'branch_created',
        branch: branchName,
        taskId
      });

      return {
        success: true,
        output: `Created and switched to branch: ${branchName}`,
        branch: branchName
      };
    } catch (error: any) {
      return {
        success: false,
        output: '',
        error: error.message
      };
    }
  }

  // Switch to a branch
  async switchBranch(branchName: string): Promise<GitOperationResult> {
    if (!this.adminMutationsEnabled()) {
      return this.blockedAdminMutation('switchBranch');
    }

    try {
      this.execGit(`checkout ${branchName}`, true);
      return {
        success: true,
        output: `Switched to branch: ${branchName}`,
        branch: branchName
      };
    } catch (error: any) {
      return {
        success: false,
        output: '',
        error: error.message
      };
    }
  }

  // Get current status
  getStatus(): { branch: string; changes: string[]; staged: string[]; clean: boolean } {
    try {
      const branch = this.getCurrentBranch() || 'main';
      let status = '';
      try {
        status = this.execGit('status --porcelain', true);
      } catch (e) {
        console.log('[GIT] status --porcelain failed, trying alternative');
        // On fresh repos with no commits, try listing untracked files
        try {
          status = this.execGit('ls-files --others --exclude-standard', true);
          // Convert to porcelain format
          status = status.split('\n').filter(Boolean).map(f => `?? ${f}`).join('\n');
        } catch {
          status = '';
        }
      }
      
      const lines = status.split('\n').filter(Boolean);
      console.log(`[GIT] Status found ${lines.length} changes`);
      
      const changes: string[] = [];
      const staged: string[] = [];
      
      for (const line of lines) {
        const indexStatus = line[0];
        const workStatus = line[1];
        const file = line.substring(3);
        
        if (indexStatus !== ' ' && indexStatus !== '?') {
          staged.push(file);
        }
        if (workStatus !== ' ') {
          changes.push(file);
        }
        if (indexStatus === '?' && workStatus === '?') {
          changes.push(file);
        }
      }
      
      return {
        branch,
        changes,
        staged,
        clean: lines.length === 0
      };
    } catch (error) {
      console.error('[GIT] getStatus failed:', error);
      return {
        branch: 'main',
        changes: [],
        staged: [],
        clean: true
      };
    }
  }

  // Stage files
  async stageFiles(files?: string[]): Promise<GitOperationResult> {
    if (!this.adminMutationsEnabled()) {
      return this.blockedAdminMutation('stageFiles');
    }

    try {
      if (files && files.length > 0) {
        for (const file of files) {
          this.execGit(`add "${file}"`, true);
        }
      } else {
        this.execGit('add -A', true);
      }
      
      return {
        success: true,
        output: `Staged ${files ? files.length : 'all'} files`
      };
    } catch (error: any) {
      return {
        success: false,
        output: '',
        error: error.message
      };
    }
  }

  // Create a commit
  async commit(message: string, taskId?: string): Promise<GitOperationResult> {
    if (!this.adminMutationsEnabled()) {
      return this.blockedAdminMutation('commit');
    }

    try {
      // Use the commit message directly — conventional commit format is
      // already applied by AgentWorker before calling this method.
      const fullMessage = message;
      
      // Stage all changes first
      this.execGit('add -A', true);
      
      // Create commit
      const output = this.execGit(`commit -m "${fullMessage.replace(/"/g, '\\"')}"`, true);
      
      // Get commit hash
      const commitHash = this.execGit('rev-parse --short HEAD', true);
      
      eventBus.emit('git_action', {
        type: 'commit',
        message,
        commit: commitHash,
        taskId
      });

      return {
        success: true,
        output,
        commit: commitHash
      };
    } catch (error: any) {
      // Check if it's "nothing to commit"
      if (error.message.includes('nothing to commit')) {
        return {
          success: true,
          output: 'Nothing to commit, working tree clean'
        };
      }
      return {
        success: false,
        output: '',
        error: error.message
      };
    }
  }

  // Get recent commits
  getRecentCommits(count: number = 10): CommitInfo[] {
    try {
      const output = this.execGit(
        `log -${count} --format="%H|%h|%s|%an|%ar"`,
        true
      );
      
      return output.split('\n').filter(Boolean).map(line => {
        const [hash, shortHash, message, author, date] = line.split('|');
        return { hash, shortHash, message, author, date };
      });
    } catch {
      return [];
    }
  }

  getCommitCount(ref: string = 'HEAD'): number {
    try {
      const output = this.execGit(`rev-list --count ${ref}`, true);
      const count = Number(output.trim());
      return Number.isFinite(count) ? count : 0;
    } catch {
      return 0;
    }
  }

  // Push branch to remote
  async push(branchName?: string): Promise<GitOperationResult> {
    if (!this.adminMutationsEnabled()) {
      return this.blockedAdminMutation('push');
    }

    const branch = branchName || this.getCurrentBranch();
    
    try {
      const output = this.execGit(`push -u origin ${branch}`, true);
      
      eventBus.emit('git_action', {
        type: 'push',
        branch
      });

      return {
        success: true,
        output,
        branch
      };
    } catch (error: any) {
      return {
        success: false,
        output: '',
        error: error.message
      };
    }
  }

  // Create a pull request (requires gh CLI)
  async createPullRequest(
    title: string,
    body: string,
    baseBranch?: string
  ): Promise<GitOperationResult> {
    if (!this.adminMutationsEnabled()) {
      return this.blockedAdminMutation('createPullRequest');
    }

    const currentBranch = this.getCurrentBranch();
    const base = baseBranch || this.mainBranch;

    try {
      // First push the branch
      await this.push(currentBranch);

      // Create PR using gh CLI
      const output = execSync(
        `gh pr create --title "${title.replace(/"/g, '\\"')}" --body "${body.replace(/"/g, '\\"')}" --base ${base} --head ${currentBranch}`,
        {
          cwd: this.projectRoot,
          encoding: 'utf-8',
          timeout: 30000
        }
      ).trim();

      // Extract PR URL from output
      const prUrl = output.match(/https:\/\/github\.com\/[^\s]+/)?.[0] || output;

      eventBus.emit('git_action', {
        type: 'pr_created',
        title,
        branch: currentBranch,
        prUrl
      });

      return {
        success: true,
        output,
        prUrl,
        branch: currentBranch
      };
    } catch (error: any) {
      // gh CLI might not be installed or authenticated
      return {
        success: false,
        output: '',
        error: `PR creation failed: ${error.message}. Make sure 'gh' CLI is installed and authenticated.`
      };
    }
  }

  // Get open PRs
  async getOpenPullRequests(): Promise<PullRequestInfo[]> {
    try {
      const output = execSync('gh pr list --json number,title,headRefName,state,url', {
        cwd: this.projectRoot,
        encoding: 'utf-8',
        timeout: 30000
      });

      const prs = JSON.parse(output);
      return prs.map((pr: any) => ({
        number: pr.number,
        title: pr.title,
        branch: pr.headRefName,
        status: pr.state.toLowerCase(),
        url: pr.url
      }));
    } catch {
      return [];
    }
  }

  // Merge current branch to main (locally)
  async mergeToMain(): Promise<GitOperationResult> {
    if (!this.adminMutationsEnabled()) {
      return this.blockedAdminMutation('mergeToMain');
    }

    const currentBranch = this.getCurrentBranch();
    
    if (currentBranch === this.mainBranch) {
      return {
        success: false,
        output: '',
        error: 'Already on main branch'
      };
    }

    try {
      // Switch to main
      this.execGit(`checkout ${this.mainBranch}`, true);
      
      // Merge the feature branch
      const output = this.execGit(`merge ${currentBranch}`, true);
      
      eventBus.emit('git_action', {
        type: 'merge',
        branch: currentBranch,
        target: this.mainBranch
      });

      return {
        success: true,
        output,
        branch: this.mainBranch
      };
    } catch (error: any) {
      // Try to recover by going back to feature branch
      try {
        this.execGit(`checkout ${currentBranch}`, true);
      } catch {}
      
      return {
        success: false,
        output: '',
        error: error.message
      };
    }
  }

  // Delete a branch
  async deleteBranch(branchName: string, force: boolean = false): Promise<GitOperationResult> {
    if (!this.adminMutationsEnabled()) {
      return this.blockedAdminMutation('deleteBranch');
    }

    if (branchName === this.mainBranch) {
      return {
        success: false,
        output: '',
        error: 'Cannot delete main branch'
      };
    }

    try {
      const flag = force ? '-D' : '-d';
      const output = this.execGit(`branch ${flag} ${branchName}`, true);
      
      return {
        success: true,
        output
      };
    } catch (error: any) {
      return {
        success: false,
        output: '',
        error: error.message
      };
    }
  }

  // Get diff for review
  getDiff(staged: boolean = false): string {
    try {
      const flag = staged ? '--cached' : '';
      return this.execGit(`diff ${flag}`, true);
    } catch {
      return '';
    }
  }

  // Stash changes
  async stash(message?: string): Promise<GitOperationResult> {
    if (!this.adminMutationsEnabled()) {
      return this.blockedAdminMutation('stash');
    }

    try {
      const cmd = message ? `stash push -m "${message}"` : 'stash';
      const output = this.execGit(cmd, true);
      return {
        success: true,
        output
      };
    } catch (error: any) {
      return {
        success: false,
        output: '',
        error: error.message
      };
    }
  }

  // Pop stash
  async stashPop(): Promise<GitOperationResult> {
    if (!this.adminMutationsEnabled()) {
      return this.blockedAdminMutation('stashPop');
    }

    try {
      const output = this.execGit('stash pop', true);
      return {
        success: true,
        output
      };
    } catch (error: any) {
      return {
        success: false,
        output: '',
        error: error.message
      };
    }
  }

  // Reset changes (soft reset)
  async reset(hard: boolean = false): Promise<GitOperationResult> {
    if (!this.adminMutationsEnabled()) {
      return this.blockedAdminMutation('reset');
    }

    try {
      const flag = hard ? '--hard' : '--soft';
      const output = this.execGit(`reset ${flag} HEAD~1`, true);
      return {
        success: true,
        output
      };
    } catch (error: any) {
      return {
        success: false,
        output: '',
        error: error.message
      };
    }
  }

  // Check if working directory is clean
  isClean(): boolean {
    const status = this.getStatus();
    return status.clean;
  }

  // Get summary for display
  getSummary(): string {
    const status = this.getStatus();
    const commits = this.getRecentCommits(3);
    
    let summary = `Branch: ${status.branch}\n`;
    summary += `Status: ${status.clean ? 'Clean' : `${status.changes.length} changed files`}\n`;
    
    if (commits.length > 0) {
      summary += `\nRecent commits:\n`;
      for (const commit of commits) {
        summary += `  ${commit.shortHash} ${commit.message} (${commit.date})\n`;
      }
    }
    
    return summary;
  }
}

// Export singleton instance
export const gitIntegration = new GitIntegration();
