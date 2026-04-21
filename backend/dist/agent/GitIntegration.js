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
Object.defineProperty(exports, "__esModule", { value: true });
exports.gitIntegration = exports.GitIntegration = void 0;
const child_process_1 = require("child_process");
const path = __importStar(require("path"));
const fs = __importStar(require("fs"));
const EventBus_1 = require("../events/EventBus");
const config_1 = require("./config");
// Auto-deploy configuration — disabled by default to prevent rogue commits.
// Set AUTO_GIT_PUSH=true explicitly to enable autonomous pushes.
const AUTO_PUSH_ENABLED = process.env.AUTO_GIT_PUSH === 'true';
const GIT_USER_NAME = process.env.GIT_USER_NAME || 'hermes agent';
const GIT_USER_EMAIL = process.env.GIT_USER_EMAIL || 'hermeschain-agent@users.noreply.github.com';
class GitIntegration {
    constructor(projectRoot) {
        this.mainBranch = 'main';
        this.branchPrefix = 'open/';
        this.initialized = false;
        this.config = null;
        this.projectRoot =
            projectRoot ||
                process.env.AGENT_REPO_ROOT ||
                process.cwd();
        console.log(`[GIT] Initialized with project root: ${this.projectRoot}`);
        this.setupGitConfig();
    }
    hasGitRepo() {
        return fs.existsSync(path.join(this.projectRoot, '.git'));
    }
    matchesScope(filePath, scope) {
        const normalized = filePath.replace(/\\/g, '/');
        if (scope.kind === 'file') {
            return normalized === scope.path.replace(/\\/g, '/');
        }
        return normalized.startsWith(scope.path.replace(/\\/g, '/'));
    }
    getDefaultCommitScopes() {
        return (0, config_1.getWriteScopes)(this.config);
    }
    isLikelyGibberish(value) {
        const normalized = value.trim().toLowerCase();
        if (!normalized)
            return true;
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
    inspectFilesForGibberish(filePaths) {
        const suspiciousPattern = /\b(x{3,}|asdf|qwerty|lorem ipsum|placeholder text|placeholder content)\b/i;
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
            }
            catch {
                // Ignore unreadable files here and let git/verification surface the real issue.
            }
        }
        return { blocked: false };
    }
    getScopedStatusEntries(scopes, requestedFiles) {
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
            if (!entry.filePath)
                return false;
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
    configure(config) {
        this.config = config;
        if (config.repoRoot) {
            this.projectRoot = config.repoRoot;
        }
        this.setupGitConfig();
    }
    // Configure git user and remote for commits
    setupGitConfig() {
        if (!this.hasGitRepo()) {
            // In production containers the source is uploaded without a .git
            // directory. If we have credentials, clone the repo metadata so the
            // agent can commit + push. This is gated on the worker role so web
            // containers never self-clone.
            const token = process.env.GITHUB_TOKEN;
            const repo = process.env.GITHUB_REPO;
            const shouldClone = process.env.AGENT_ROLE === 'worker' &&
                process.env.AUTO_GIT_PUSH === 'true' &&
                token &&
                repo;
            if (shouldClone) {
                try {
                    console.log(`[GIT] No .git found — cloning ${repo} to ${this.projectRoot}`);
                    const tempDir = `/tmp/hermeschain-clone-${Date.now()}`;
                    const cloneUrl = `https://${token}@github.com/${repo}.git`;
                    (0, child_process_1.execSync)(`git clone --depth 50 ${cloneUrl} ${tempDir}`, {
                        stdio: 'pipe',
                        timeout: 60000,
                    });
                    (0, child_process_1.execSync)(`cp -r ${tempDir}/.git ${this.projectRoot}/`, { stdio: 'pipe' });
                    (0, child_process_1.execSync)(`rm -rf ${tempDir}`, { stdio: 'pipe' });
                    (0, child_process_1.execSync)(`git config user.name "${GIT_USER_NAME}"`, {
                        cwd: this.projectRoot,
                        stdio: 'pipe',
                    });
                    (0, child_process_1.execSync)(`git config user.email "${GIT_USER_EMAIL}"`, {
                        cwd: this.projectRoot,
                        stdio: 'pipe',
                    });
                    (0, child_process_1.execSync)(`git remote set-url origin ${cloneUrl}`, {
                        cwd: this.projectRoot,
                        stdio: 'pipe',
                    });
                    console.log('[GIT] Clone complete, git metadata in place.');
                }
                catch (error) {
                    console.error('[GIT] Clone failed:', error?.message || error);
                    return;
                }
            }
            else {
                console.log('[GIT] No git repository detected. Auto-commit will stay local-only and inactive.');
                return;
            }
        }
        this.initialized = true;
        console.log(`[GIT] Using per-command git author identity: ${GIT_USER_NAME} <${GIT_USER_EMAIL}>`);
    }
    // Derive a detailed conventional commit message from a file path
    deriveCommitMessage(filePath) {
        const base = path.basename(filePath, path.extname(filePath));
        const dir = path.dirname(filePath);
        // Determine scope from directory
        let scope = 'chain';
        if (dir.includes('hermes-generated'))
            scope = 'agent';
        else if (dir.includes('api'))
            scope = 'api';
        else if (dir.includes('blockchain'))
            scope = 'chain';
        else if (dir.includes('agent'))
            scope = 'agent';
        else if (dir.includes('vm'))
            scope = 'vm';
        else if (dir.includes('validators'))
            scope = 'consensus';
        else if (dir.includes('frontend') || dir.includes('src/components'))
            scope = 'frontend';
        else if (dir.includes('contracts'))
            scope = 'contracts';
        else if (dir.includes('database'))
            scope = 'db';
        else if (dir.includes('x402'))
            scope = 'x402';
        else if (dir.includes('test'))
            scope = 'test';
        // Determine type from filename patterns
        let type = 'feat';
        const lowerBase = base.toLowerCase();
        if (lowerBase.includes('test') || lowerBase.includes('spec'))
            type = 'test';
        else if (lowerBase.includes('fix') || lowerBase.includes('patch'))
            type = 'fix';
        else if (lowerBase.includes('audit') || lowerBase.includes('review') || lowerBase.includes('security'))
            type = 'fix';
        else if (lowerBase.includes('optimize') || lowerBase.includes('perf'))
            type = 'perf';
        else if (lowerBase.includes('refactor'))
            type = 'refactor';
        else if (lowerBase.startsWith('xxx'))
            type = 'chore';
        // Convert filename to readable description
        let desc = base
            .replace(/[-_]+/g, ' ') // dashes/underscores to spaces
            .replace(/\d{10,}/g, '') // strip timestamps
            .replace(/^xxx\s*/i, '') // strip xxx prefix
            .replace(/\s+/g, ' ') // collapse spaces
            .trim();
        if (!desc || desc.length < 3) {
            desc = 'update module';
        }
        // Lowercase first char
        desc = desc.charAt(0).toLowerCase() + desc.slice(1);
        return `${type}(${scope}): ${desc}`;
    }
    // Auto-commit scoped agent changes — one commit per verified run.
    async autoCommitAndPush(message, taskId, options = {}) {
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
            console.log(`[GIT] Found ${changedFiles.length} scoped files to commit`);
            const stagedFiles = [];
            for (const entry of changedFiles) {
                const { status, filePath } = entry;
                if (!filePath)
                    continue;
                if (status === 'D') {
                    this.execGit(`rm --cached --ignore-unmatch "${filePath}"`, true);
                }
                else {
                    this.execGit(`add "${filePath}"`, true);
                }
                stagedFiles.push(filePath);
            }
            if (stagedFiles.length === 0) {
                return { success: true, output: 'No staged scoped changes to commit', files: [] };
            }
            if (this.isLikelyGibberish(message)) {
                return {
                    success: false,
                    output: '',
                    error: 'Commit blocked by gibberish guard: suspicious commit message.',
                    files: stagedFiles,
                };
            }
            const fileGuard = this.inspectFilesForGibberish(stagedFiles);
            if (fileGuard.blocked) {
                return {
                    success: false,
                    output: '',
                    error: `Commit blocked by gibberish guard: ${fileGuard.reason}`,
                    files: stagedFiles,
                };
            }
            const escapedMsg = message.replace(/"/g, '\\"');
            this.execGit(`commit -m "${escapedMsg}"`, true);
            const commitHash = this.execGit('rev-parse --short HEAD', true);
            console.log(`[GIT] Created commit: ${commitHash}`);
            // Push to remote if enabled
            if (AUTO_PUSH_ENABLED) {
                const branch = this.getCurrentBranch() || 'main';
                console.log(`[GIT] Pushing to origin/${branch}...`);
                try {
                    this.execGit(`push -u origin ${branch}`, true);
                    console.log(`[GIT] Successfully pushed to origin/${branch}`);
                    EventBus_1.eventBus.emit('git_action', {
                        type: 'auto_deploy',
                        message,
                        commit: commitHash,
                        branch,
                        pushed: true
                    });
                    return {
                        success: true,
                        output: `Committed and pushed: ${commitHash}`,
                        commit: commitHash,
                        branch,
                        files: stagedFiles
                    };
                }
                catch (pushError) {
                    console.error('[GIT] Push failed:', pushError.message);
                    EventBus_1.eventBus.emit('git_action', {
                        type: 'commit',
                        message,
                        commit: commitHash,
                        pushed: false,
                        error: pushError.message
                    });
                    return {
                        success: true,
                        output: `Committed (push failed): ${commitHash}`,
                        commit: commitHash,
                        error: `Push failed: ${pushError.message}`,
                        files: stagedFiles
                    };
                }
            }
            else {
                EventBus_1.eventBus.emit('git_action', {
                    type: 'commit',
                    message,
                    commit: commitHash,
                    pushed: false
                });
                return {
                    success: true,
                    output: `Committed: ${commitHash}`,
                    commit: commitHash,
                    files: stagedFiles
                };
            }
        }
        catch (error) {
            console.error('[GIT] Auto-commit failed:', error.message);
            return {
                success: false,
                output: '',
                error: error.message
            };
        }
    }
    getChangedFilesWithinScopes(scopes) {
        try {
            return this.getScopedStatusEntries(scopes).map((entry) => entry.filePath);
        }
        catch {
            return [];
        }
    }
    probeCapabilities() {
        if (!this.hasGitRepo()) {
            return {
                git: 'unavailable',
                push: 'unavailable',
                reason: 'Git metadata is unavailable in this workspace.',
            };
        }
        try {
            this.execGit('rev-parse --is-inside-work-tree', true);
        }
        catch (error) {
            return {
                git: 'unavailable',
                push: 'unavailable',
                reason: error?.message || 'Git repository check failed.',
            };
        }
        if (!AUTO_PUSH_ENABLED) {
            return {
                git: 'ready',
                push: 'unavailable',
                reason: 'AUTO_GIT_PUSH is disabled.',
            };
        }
        try {
            this.execGit('fetch --dry-run --all', true);
            this.execGit('push --dry-run', true);
            return { git: 'ready', push: 'ready' };
        }
        catch (error) {
            return {
                git: 'ready',
                push: 'unavailable',
                reason: error?.message || 'Git push probe failed.',
            };
        }
    }
    // Execute git command safely
    execGit(command, silent = false) {
        if (!this.hasGitRepo()) {
            throw new Error('Git repository unavailable');
        }
        try {
            const result = (0, child_process_1.execSync)(`git ${command}`, {
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
        }
        catch (error) {
            if (error.stderr) {
                throw new Error(error.stderr.toString().trim());
            }
            throw error;
        }
    }
    // Get current branch
    getCurrentBranch() {
        try {
            return this.execGit('branch --show-current', true);
        }
        catch {
            return 'unknown';
        }
    }
    // Get list of branches
    getBranches() {
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
        }
        catch {
            return [];
        }
    }
    // Create a new feature branch for a task
    async createTaskBranch(taskId, taskTitle) {
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
            }
            catch {
                // May not have remote, continue anyway
            }
            // Create and checkout new branch
            this.execGit(`checkout -b ${branchName}`, true);
            EventBus_1.eventBus.emit('git_action', {
                type: 'branch_created',
                branch: branchName,
                taskId
            });
            return {
                success: true,
                output: `Created and switched to branch: ${branchName}`,
                branch: branchName
            };
        }
        catch (error) {
            return {
                success: false,
                output: '',
                error: error.message
            };
        }
    }
    // Switch to a branch
    async switchBranch(branchName) {
        try {
            this.execGit(`checkout ${branchName}`, true);
            return {
                success: true,
                output: `Switched to branch: ${branchName}`,
                branch: branchName
            };
        }
        catch (error) {
            return {
                success: false,
                output: '',
                error: error.message
            };
        }
    }
    // Get current status
    getStatus() {
        try {
            const branch = this.getCurrentBranch() || 'main';
            let status = '';
            try {
                status = this.execGit('status --porcelain', true);
            }
            catch (e) {
                console.log('[GIT] status --porcelain failed, trying alternative');
                // On fresh repos with no commits, try listing untracked files
                try {
                    status = this.execGit('ls-files --others --exclude-standard', true);
                    // Convert to porcelain format
                    status = status.split('\n').filter(Boolean).map(f => `?? ${f}`).join('\n');
                }
                catch {
                    status = '';
                }
            }
            const lines = status.split('\n').filter(Boolean);
            console.log(`[GIT] Status found ${lines.length} changes`);
            const changes = [];
            const staged = [];
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
        }
        catch (error) {
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
    async stageFiles(files) {
        try {
            if (files && files.length > 0) {
                for (const file of files) {
                    this.execGit(`add "${file}"`, true);
                }
            }
            else {
                this.execGit('add -A', true);
            }
            return {
                success: true,
                output: `Staged ${files ? files.length : 'all'} files`
            };
        }
        catch (error) {
            return {
                success: false,
                output: '',
                error: error.message
            };
        }
    }
    // Create a commit
    async commit(message, taskId) {
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
            EventBus_1.eventBus.emit('git_action', {
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
        }
        catch (error) {
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
    getRecentCommits(count = 10) {
        try {
            const output = this.execGit(`log -${count} --format="%H|%h|%s|%an|%ar"`, true);
            return output.split('\n').filter(Boolean).map(line => {
                const [hash, shortHash, message, author, date] = line.split('|');
                return { hash, shortHash, message, author, date };
            });
        }
        catch {
            return [];
        }
    }
    // Push branch to remote
    async push(branchName) {
        const branch = branchName || this.getCurrentBranch();
        try {
            const output = this.execGit(`push -u origin ${branch}`, true);
            EventBus_1.eventBus.emit('git_action', {
                type: 'push',
                branch
            });
            return {
                success: true,
                output,
                branch
            };
        }
        catch (error) {
            return {
                success: false,
                output: '',
                error: error.message
            };
        }
    }
    // Create a pull request (requires gh CLI)
    async createPullRequest(title, body, baseBranch) {
        const currentBranch = this.getCurrentBranch();
        const base = baseBranch || this.mainBranch;
        try {
            // First push the branch
            await this.push(currentBranch);
            // Create PR using gh CLI
            const output = (0, child_process_1.execSync)(`gh pr create --title "${title.replace(/"/g, '\\"')}" --body "${body.replace(/"/g, '\\"')}" --base ${base} --head ${currentBranch}`, {
                cwd: this.projectRoot,
                encoding: 'utf-8',
                timeout: 30000
            }).trim();
            // Extract PR URL from output
            const prUrl = output.match(/https:\/\/github\.com\/[^\s]+/)?.[0] || output;
            EventBus_1.eventBus.emit('git_action', {
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
        }
        catch (error) {
            // gh CLI might not be installed or authenticated
            return {
                success: false,
                output: '',
                error: `PR creation failed: ${error.message}. Make sure 'gh' CLI is installed and authenticated.`
            };
        }
    }
    // Get open PRs
    async getOpenPullRequests() {
        try {
            const output = (0, child_process_1.execSync)('gh pr list --json number,title,headRefName,state,url', {
                cwd: this.projectRoot,
                encoding: 'utf-8',
                timeout: 30000
            });
            const prs = JSON.parse(output);
            return prs.map((pr) => ({
                number: pr.number,
                title: pr.title,
                branch: pr.headRefName,
                status: pr.state.toLowerCase(),
                url: pr.url
            }));
        }
        catch {
            return [];
        }
    }
    // Merge current branch to main (locally)
    async mergeToMain() {
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
            EventBus_1.eventBus.emit('git_action', {
                type: 'merge',
                branch: currentBranch,
                target: this.mainBranch
            });
            return {
                success: true,
                output,
                branch: this.mainBranch
            };
        }
        catch (error) {
            // Try to recover by going back to feature branch
            try {
                this.execGit(`checkout ${currentBranch}`, true);
            }
            catch { }
            return {
                success: false,
                output: '',
                error: error.message
            };
        }
    }
    // Delete a branch
    async deleteBranch(branchName, force = false) {
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
        }
        catch (error) {
            return {
                success: false,
                output: '',
                error: error.message
            };
        }
    }
    // Get diff for review
    getDiff(staged = false) {
        try {
            const flag = staged ? '--cached' : '';
            return this.execGit(`diff ${flag}`, true);
        }
        catch {
            return '';
        }
    }
    // Stash changes
    async stash(message) {
        try {
            const cmd = message ? `stash push -m "${message}"` : 'stash';
            const output = this.execGit(cmd, true);
            return {
                success: true,
                output
            };
        }
        catch (error) {
            return {
                success: false,
                output: '',
                error: error.message
            };
        }
    }
    // Pop stash
    async stashPop() {
        try {
            const output = this.execGit('stash pop', true);
            return {
                success: true,
                output
            };
        }
        catch (error) {
            return {
                success: false,
                output: '',
                error: error.message
            };
        }
    }
    // Reset changes (soft reset)
    async reset(hard = false) {
        try {
            const flag = hard ? '--hard' : '--soft';
            const output = this.execGit(`reset ${flag} HEAD~1`, true);
            return {
                success: true,
                output
            };
        }
        catch (error) {
            return {
                success: false,
                output: '',
                error: error.message
            };
        }
    }
    // Check if working directory is clean
    isClean() {
        const status = this.getStatus();
        return status.clean;
    }
    // Get summary for display
    getSummary() {
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
exports.GitIntegration = GitIntegration;
// Export singleton instance
exports.gitIntegration = new GitIntegration();
//# sourceMappingURL=GitIntegration.js.map