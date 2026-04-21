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
exports.taskSources = exports.TaskSources = void 0;
const child_process_1 = require("child_process");
const path = __importStar(require("path"));
const EventBus_1 = require("../events/EventBus");
const db_1 = require("../database/db");
const TaskBacklog_1 = require("./TaskBacklog");
const AgentTaskStore_1 = require("./AgentTaskStore");
const TERMINAL_STATUSES = new Set(['succeeded', 'discarded']);
function priorityValue(priority) {
    return {
        critical: 1,
        high: 0.85,
        medium: 0.6,
        low: 0.3,
    }[priority];
}
function normalizeScope(pathValue) {
    return {
        kind: pathValue.endsWith('/') ? 'path_prefix' : 'file',
        path: pathValue,
    };
}
function dedupeScopes(scopes) {
    const seen = new Set();
    return scopes.filter((scope) => {
        const key = `${scope.kind}:${scope.path}`;
        if (seen.has(key))
            return false;
        seen.add(key);
        return true;
    });
}
function dedupeTags(tags) {
    return Array.from(new Set(tags.map((tag) => tag.trim().toLowerCase()).filter(Boolean)));
}
class TaskSources {
    constructor() {
        this.config = null;
        this.projectRoot = process.cwd();
        this.initialized = false;
        this.backlogSynced = false;
        this.listenerDisposers = [];
        // Per-event-type cooldown — avoid enqueuing 50 "investigate consensus
        // failure" tasks when the underlying problem fires the same event every
        // 10 seconds. One investigation per cooldown window is plenty.
        this.eventCooldowns = new Map();
        this.EVENT_COOLDOWN_MS = Number(process.env.EVENT_COOLDOWN_MS) || 30 * 60 * 1000;
    }
    configure(config) {
        this.config = config;
        if (config.repoRoot) {
            this.projectRoot = config.repoRoot;
        }
    }
    async initialize() {
        if (this.initialized)
            return;
        await AgentTaskStore_1.agentTaskStore.initialize();
        this.setupEventListeners();
        this.initialized = true;
    }
    dispose() {
        for (const dispose of this.listenerDisposers) {
            dispose();
        }
        this.listenerDisposers = [];
        this.initialized = false;
    }
    on(event, listener) {
        EventBus_1.eventBus.on(event, listener);
        this.listenerDisposers.push(() => EventBus_1.eventBus.off(event, listener));
    }
    isEventOnCooldown(eventKey) {
        const now = Date.now();
        const until = this.eventCooldowns.get(eventKey) || 0;
        if (until > now)
            return true;
        this.eventCooldowns.set(eventKey, now + this.EVENT_COOLDOWN_MS);
        return false;
    }
    setupEventListeners() {
        this.on('consensus_failed', (data) => {
            if (this.isEventOnCooldown('consensus_failed'))
                return;
            const height = data?.block?.header?.height || data?.timestamp || Date.now();
            void this.enqueueSourceTask({
                id: `consensus-${height}`,
                source: 'chain_event',
                title: 'Investigate consensus failure',
                description: [
                    'Consensus failed while producing a block.',
                    '',
                    `## Required Output`,
                    `Write your investigation findings as a new file at:`,
                    `  backend/src/hermes-generated/consensus-investigation-${height}.md`,
                    '',
                    `The file MUST include:`,
                    `- A one-paragraph summary of the failure mode`,
                    `- Likely root cause based on the event payload below`,
                    `- At least one concrete next step (file path + what to change)`,
                    '',
                    '## Event Payload',
                    '```json',
                    JSON.stringify(data, null, 2).slice(0, 3000),
                    '```',
                ].join('\n'),
                priority: 'critical',
                context: {
                    event: data,
                    evidence: [
                        {
                            kind: 'event',
                            label: 'consensus_failed',
                            detail: data?.reason || 'Consensus failure emitted by block production.',
                        },
                    ],
                    scopes: ['backend/src/blockchain/', 'backend/src/hermes-generated/'],
                    objectiveTags: ['consensus', 'chain', 'security'],
                },
                createdAt: new Date(),
            });
        });
        this.on('ci_failure', (data) => {
            if (this.isEventOnCooldown('ci_failure'))
                return;
            const scopes = this.extractScopesFromCiFailure(data);
            const evidence = [
                {
                    kind: 'ci',
                    label: `ci_failure:${data?.type || 'unknown'}`,
                    detail: JSON.stringify(data).slice(0, 600),
                },
            ];
            void this.enqueueSourceTask({
                id: `ci-${data?.type || 'unknown'}`,
                source: 'code_error',
                title: `Repair ${data?.type || 'build'} failure`,
                description: `Automated checks failed and need attention.\n\n${JSON.stringify(data, null, 2)}`,
                priority: data?.type === 'build' ? 'critical' : 'high',
                context: {
                    event: data,
                    scopes,
                    objectiveTags: ['tooling', 'quality'],
                    evidence,
                },
                createdAt: new Date(),
            });
        });
        this.on('new_log', (entry) => {
            if (entry?.type !== 'error')
                return;
            if (this.isEventOnCooldown('runtime_error'))
                return;
            void this.enqueueSourceTask({
                id: `runtime-${entry.id}`,
                source: 'runtime_error',
                title: `Investigate runtime error${entry.taskTitle ? ` in ${entry.taskTitle}` : ''}`,
                description: [
                    'A runtime error was logged by the agent.',
                    '',
                    '## Required Output',
                    `Write your findings to backend/src/hermes-generated/runtime-error-${entry.id}.md`,
                    'with: summary, likely cause, one concrete fix candidate.',
                    '',
                    '## Error Content',
                    entry.content || 'Runtime error emitted to agent logs.',
                ].join('\n'),
                priority: 'high',
                context: {
                    scopes: ['backend/src/', 'backend/src/hermes-generated/'],
                    objectiveTags: ['runtime', 'quality'],
                    evidence: [
                        {
                            kind: 'log',
                            label: 'runtime_error',
                            detail: entry.content || 'Runtime error from logs.',
                        },
                    ],
                },
                createdAt: new Date(entry.timestamp || Date.now()),
            });
        });
        this.on('block_produced', (payload) => {
            const blockTime = Number(payload?.blockTime || 0);
            if (!Number.isFinite(blockTime) || blockTime <= 15000)
                return;
            if (this.isEventOnCooldown('slow_block'))
                return;
            const height = payload?.block?.header?.height || Date.now();
            void this.enqueueSourceTask({
                id: `block-time-${height}`,
                source: 'chain_event',
                title: 'Investigate slow block production',
                description: [
                    'Block production exceeded the expected target.',
                    `Observed block time: ${blockTime}ms`,
                    '',
                    '## Required Output',
                    `Write your findings to backend/src/hermes-generated/slow-block-${height}.md`,
                    'with: profile of the slow path, suspect file + line, one fix candidate.',
                ].join('\n'),
                priority: blockTime > 30000 ? 'high' : 'medium',
                context: {
                    scopes: ['backend/src/blockchain/', 'backend/src/hermes-generated/'],
                    objectiveTags: ['performance', 'chain'],
                    evidence: [
                        {
                            kind: 'metric',
                            label: 'block_time',
                            detail: `${blockTime}ms observed during block production`,
                        },
                    ],
                },
                createdAt: new Date(),
            });
        });
    }
    extractScopesFromCiFailure(data) {
        const scopes = new Set();
        const hintedTargets = new Set();
        const addFile = (value) => {
            if (!value || typeof value !== 'string')
                return;
            const normalized = value.replace(/^\.\//, '');
            if (!normalized)
                return;
            scopes.add(normalized);
        };
        const scanTextForPaths = (value) => {
            if (!value || typeof value !== 'string')
                return;
            if (/\[backend\]/i.test(value))
                hintedTargets.add('backend');
            if (/\[frontend\]/i.test(value))
                hintedTargets.add('frontend');
            const explicitPaths = value.match(/\b(?:backend|frontend)\/(?:src|tests?)\/[A-Za-z0-9_./-]+\.[A-Za-z0-9]+\b/g);
            for (const match of explicitPaths || []) {
                addFile(match);
            }
            const scopedSrcPaths = value.match(/\bsrc\/[A-Za-z0-9_./-]+\.[A-Za-z0-9]+\b/g);
            for (const match of scopedSrcPaths || []) {
                if (/\[backend\]/i.test(value))
                    addFile(`backend/${match}`);
                if (/\[frontend\]/i.test(value))
                    addFile(`frontend/${match}`);
            }
        };
        for (const failure of data?.failures || []) {
            addFile(failure?.file);
            scanTextForPaths(failure?.message);
            scanTextForPaths(failure?.stack);
        }
        for (const issue of data?.issues || []) {
            addFile(issue?.file);
            scanTextForPaths(issue?.message);
        }
        for (const error of data?.errors || []) {
            scanTextForPaths(error);
        }
        if (scopes.size === 0 && (data?.type === 'build' || data?.type === 'lint')) {
            if (hintedTargets.has('backend') && !hintedTargets.has('frontend')) {
                scopes.add('backend/src/');
            }
            else if (hintedTargets.has('frontend') && !hintedTargets.has('backend')) {
                scopes.add('frontend/src/');
            }
            else {
                for (const changedFile of this.getRecentChangedFiles()) {
                    if (changedFile.startsWith('backend/') ||
                        changedFile.startsWith('frontend/')) {
                        scopes.add(changedFile);
                    }
                }
                if (scopes.size === 0) {
                    scopes.add('backend/src/');
                }
            }
        }
        return Array.from(scopes);
    }
    getRecentChangedFiles() {
        const commands = [
            'git diff --name-only HEAD~1 HEAD 2>/dev/null || true',
            'git diff --name-only HEAD 2>/dev/null || true',
        ];
        for (const command of commands) {
            try {
                const output = (0, child_process_1.execSync)(command, {
                    cwd: this.projectRoot,
                    encoding: 'utf-8',
                    timeout: 10000,
                });
                const files = output
                    .split('\n')
                    .map((line) => line.trim())
                    .filter(Boolean);
                if (files.length > 0) {
                    return files;
                }
            }
            catch {
                // Ignore git-diff failures and fall through to the conservative fallback.
            }
        }
        return [];
    }
    getRetryDelayMs(task) {
        if (task.status !== 'failed')
            return 0;
        const failureCount = Math.max(1, task.runCount);
        const baseDelayMs = 30000;
        const cappedExponent = Math.min(failureCount - 1, 5);
        return Math.min(15 * 60 * 1000, baseDelayMs * 2 ** cappedExponent);
    }
    buildVerificationPlan(taskType, editScopes) {
        const touchesBackend = editScopes.some((scope) => scope.path.startsWith('backend/'));
        const touchesFrontend = editScopes.some((scope) => scope.path.startsWith('frontend/'));
        const steps = [];
        if (touchesBackend) {
            steps.push({
                id: 'backend-build',
                type: 'command',
                label: 'Build backend',
                command: 'npm run build',
                cwd: 'backend',
                required: true,
            });
        }
        if (touchesFrontend) {
            steps.push({
                id: 'frontend-build',
                type: 'command',
                label: 'Build frontend',
                command: 'npm run build',
                cwd: 'frontend',
                required: true,
            });
        }
        if (taskType === 'audit' || taskType === 'analyze' || taskType === 'docs') {
            return {
                type: 'artifact',
                description: 'Produce a documented artifact inside the approved scope.',
                requireChangedFiles: true,
                steps,
            };
        }
        return {
            type: 'code',
            description: 'Make a scoped code change and pass the targeted verification steps.',
            requireChangedFiles: true,
            steps,
        };
    }
    backlogCreatedAt(backlog) {
        return new Date(Date.UTC(2026, 0, 1, 0, 0, backlog.sequence));
    }
    buildBacklogVerificationPlan(backlog) {
        return {
            type: backlog.type === 'docs' || backlog.type === 'audit' || backlog.type === 'analyze'
                ? 'artifact'
                : 'code',
            description: backlog.expectedOutcome,
            requireChangedFiles: true,
            steps: [
                {
                    id: `${backlog.id}:verify`,
                    type: 'command',
                    label: backlog.verification.label,
                    command: backlog.verification.command,
                    cwd: backlog.verification.cwd,
                    required: true,
                },
            ],
        };
    }
    async syncBacklogTasks() {
        if (this.backlogSynced)
            return;
        for (const backlog of TaskBacklog_1.TASK_BACKLOG) {
            const existing = AgentTaskStore_1.agentTaskStore.getSourceTask(backlog.id);
            if (existing && TERMINAL_STATUSES.has(existing.status)) {
                continue;
            }
            await this.enqueueSourceTask({
                id: backlog.id,
                source: 'backlog',
                title: backlog.title,
                description: backlog.description,
                priority: backlog.priority >= 9
                    ? 'high'
                    : backlog.priority >= 7
                        ? 'medium'
                        : 'low',
                context: {
                    phaseId: backlog.phaseId,
                    phaseTitle: backlog.phaseTitle,
                    phaseOrder: backlog.phaseOrder,
                    workstreamId: backlog.workstreamId,
                    workstreamTitle: backlog.workstreamTitle,
                    backlogSequence: backlog.sequence,
                    tags: backlog.tags,
                    taskType: backlog.type,
                    estimatedMinutes: backlog.estimatedMinutes,
                    commitWindowMinutes: backlog.commitWindowMinutes,
                    scopes: backlog.allowedScopes,
                    objectiveTags: backlog.objectiveTags,
                    expectedOutcome: backlog.expectedOutcome,
                    verificationPlan: this.buildBacklogVerificationPlan(backlog),
                    evidence: [
                        {
                            kind: 'backlog',
                            label: `${backlog.phaseTitle} / ${backlog.workstreamTitle}`,
                            detail: `Backlog item ${backlog.sequence}/${TaskBacklog_1.TASK_BACKLOG.length} with tags: ${backlog.tags.join(', ')}`,
                        },
                        {
                            kind: 'backlog',
                            label: 'expected_outcome',
                            detail: backlog.expectedOutcome,
                        },
                    ],
                },
                createdAt: existing?.createdAt || this.backlogCreatedAt(backlog),
            });
        }
        this.backlogSynced = true;
    }
    async enqueueSourceTask(task) {
        await AgentTaskStore_1.agentTaskStore.initialize();
        const existing = AgentTaskStore_1.agentTaskStore.getSourceTask(task.id);
        const status = existing && TERMINAL_STATUSES.has(existing.status) ? existing.status : existing?.status || 'queued';
        const rawScopes = task.context.scopes || [];
        const editScopes = dedupeScopes(rawScopes.map(normalizeScope));
        const objectiveTags = dedupeTags(task.context.objectiveTags || []);
        const evidence = task.context.evidence || [];
        const verificationPlan = task.context.verificationPlan || this.buildVerificationPlan(task.context.taskType || task.source, editScopes);
        return AgentTaskStore_1.agentTaskStore.upsertSourceTask({
            id: task.id,
            source: task.source,
            title: task.title,
            description: task.description,
            priority: priorityValue(task.priority),
            status,
            taskType: task.context.taskType || this.mapTaskType(task),
            objectiveTags,
            evidence,
            editScopes,
            verificationPlan,
            metadata: task.context,
            lastError: existing?.lastError || null,
            blockedReason: editScopes.length === 0
                ? existing?.blockedReason || 'No safe edit scopes are defined for this task.'
                : existing?.blockedReason || null,
            runCount: existing?.runCount || 0,
            createdAt: existing?.createdAt || task.createdAt,
        });
    }
    mapTaskType(task) {
        if (task.source === 'code_error')
            return 'fix';
        if (task.source === 'dependency')
            return 'build';
        if (task.source === 'todo_comment')
            return 'build';
        if (task.source === 'cip_proposal')
            return 'feature';
        if (task.source === 'github_issue')
            return 'feature';
        if (task.source === 'runtime_error')
            return 'fix';
        if (task.source === 'backlog')
            return 'build';
        return 'audit';
    }
    async scanTodoComments() {
        try {
            const output = (0, child_process_1.execSync)('rg -n "TODO|FIXME" backend/src frontend/src README.md ' +
                "-g '*.ts' -g '*.tsx' -g '*.js' -g '*.jsx' -g '*.md' " +
                "-g '!backend/src/hermes-generated/**' " +
                "-g '!**/node_modules/**' " +
                "-g '!**/dist/**' 2>/dev/null | head -20", { cwd: this.projectRoot, encoding: 'utf-8', timeout: 10000 });
            const lines = output.split('\n').filter(Boolean);
            for (const line of lines) {
                const match = line.match(/^(.+?):(\d+):(.*)$/);
                if (!match)
                    continue;
                const [, file, lineNum, content] = match;
                const todoMatch = content.match(/(TODO|FIXME):?\s*(.+)/i);
                if (!todoMatch)
                    continue;
                const [, marker, message] = todoMatch;
                if (message.trim().length < 10)
                    continue;
                await this.enqueueSourceTask({
                    id: `todo-${file}-${lineNum}`,
                    source: 'todo_comment',
                    title: `${marker.toUpperCase()}: ${message.slice(0, 80)}`,
                    description: `Open ${marker.toUpperCase()} in ${file}:${lineNum}\n\n${content.trim()}`,
                    priority: marker.toUpperCase() === 'FIXME' ? 'high' : 'low',
                    context: {
                        file,
                        line: Number(lineNum),
                        scopes: [file],
                        objectiveTags: ['tooling'],
                        evidence: [
                            {
                                kind: 'file',
                                label: `${marker.toUpperCase()} comment`,
                                detail: content.trim(),
                                filePath: file,
                                line: Number(lineNum),
                            },
                        ],
                    },
                    createdAt: new Date(),
                });
            }
        }
        catch {
            // No TODOs found or ripgrep unavailable.
        }
    }
    async scanDependencies() {
        const packageRoots = [
            this.config?.projectPaths.backend,
            this.config?.projectPaths.frontend,
        ].filter(Boolean);
        for (const packageRoot of packageRoots) {
            const scopeLabel = path.relative(this.projectRoot, packageRoot) || '.';
            try {
                const output = (0, child_process_1.execSync)('npm outdated --json 2>/dev/null || echo "{}"', { cwd: packageRoot, encoding: 'utf-8', timeout: 10000 });
                const outdated = JSON.parse(output || '{}');
                const packages = Object.keys(outdated || {});
                if (packages.length === 0)
                    continue;
                await this.enqueueSourceTask({
                    id: `deps-${scopeLabel.replace(/[\\/]/g, '-')}`,
                    source: 'dependency',
                    title: `Review outdated dependencies in ${scopeLabel}`,
                    description: packages
                        .slice(0, 10)
                        .map((pkg) => `${pkg}: ${outdated[pkg].current} -> ${outdated[pkg].latest}`)
                        .join('\n'),
                    priority: 'low',
                    context: {
                        scopes: [path.join(scopeLabel, 'package.json')],
                        objectiveTags: ['tooling', 'maintenance'],
                        evidence: [
                            {
                                kind: 'metric',
                                label: 'npm_outdated',
                                detail: `${packages.length} outdated packages detected in ${scopeLabel}`,
                            },
                        ],
                    },
                    createdAt: new Date(),
                });
            }
            catch {
                // npm outdated may fail if scripts or lockfiles are missing.
            }
        }
    }
    async scanGitHubIssues() {
        try {
            const output = (0, child_process_1.execSync)('gh issue list --state open --limit 10 --json number,title,body,labels 2>/dev/null || echo "[]"', { cwd: this.projectRoot, encoding: 'utf-8', timeout: 30000 });
            const issues = JSON.parse(output);
            for (const issue of issues) {
                const labels = issue.labels?.map((label) => String(label.name).toLowerCase()) || [];
                const priority = labels.includes('critical') || labels.includes('urgent')
                    ? 'critical'
                    : labels.includes('bug') || labels.includes('high')
                        ? 'high'
                        : 'medium';
                await this.enqueueSourceTask({
                    id: `issue-${issue.number}`,
                    source: 'github_issue',
                    title: `GitHub issue #${issue.number}: ${issue.title}`,
                    description: issue.body || 'No issue description provided.',
                    priority,
                    context: {
                        issueNumber: issue.number,
                        labels,
                        scopes: [],
                        objectiveTags: ['feature'],
                        evidence: [
                            {
                                kind: 'event',
                                label: 'github_issue',
                                detail: `Open issue #${issue.number} with labels: ${labels.join(', ') || 'none'}`,
                            },
                        ],
                    },
                    createdAt: new Date(),
                });
            }
        }
        catch {
            // gh CLI not available.
        }
    }
    async scanCipProposals() {
        try {
            const result = await db_1.db.query(`
        SELECT * FROM cips
        WHERE status = 'pending' OR status = 'approved'
        ORDER BY created_at DESC
        LIMIT 10
      `);
            for (const cip of result.rows || []) {
                await this.enqueueSourceTask({
                    id: `cip-${cip.id}`,
                    source: 'cip_proposal',
                    title: `Implement CIP-${cip.id}: ${cip.title}`,
                    description: cip.description || 'No CIP description provided.',
                    priority: cip.status === 'approved' ? 'high' : 'medium',
                    context: {
                        cipId: cip.id,
                        status: cip.status,
                        scopes: [],
                        objectiveTags: ['governance', 'feature'],
                        evidence: [
                            {
                                kind: 'event',
                                label: 'cip_proposal',
                                detail: `CIP-${cip.id} is ${cip.status}.`,
                            },
                        ],
                    },
                    createdAt: new Date(cip.created_at),
                });
            }
        }
        catch {
            // Database may not have CIPs table.
        }
    }
    async collectAllTasks() {
        await this.initialize();
        await Promise.all([
            this.syncBacklogTasks(),
            this.scanTodoComments(),
            this.scanDependencies(),
            this.scanGitHubIssues(),
            this.scanCipProposals(),
        ]);
        return AgentTaskStore_1.agentTaskStore
            .listSourceTasks(300)
            .filter((task) => !TERMINAL_STATUSES.has(task.status));
    }
    async getNextTask() {
        const tasks = await this.collectAllTasks();
        const now = Date.now();
        const backlogSequence = (task) => {
            const sequence = task.metadata?.backlogSequence;
            return typeof sequence === 'number' ? sequence : Number.MAX_SAFE_INTEGER;
        };
        const candidates = tasks
            .filter((task) => {
            if (task.status === 'queued')
                return true;
            if (task.status !== 'failed')
                return false;
            const retryDelayMs = this.getRetryDelayMs(task);
            return now - task.updatedAt.getTime() >= retryDelayMs;
        })
            .sort((a, b) => b.priority - a.priority ||
            backlogSequence(a) - backlogSequence(b) ||
            a.createdAt.getTime() - b.createdAt.getTime());
        for (const sourceTask of candidates) {
            if (sourceTask.editScopes.length === 0) {
                await AgentTaskStore_1.agentTaskStore.updateSourceTaskStatus(sourceTask.id, 'blocked', {
                    blockedReason: 'No safe edit scopes are defined for this task.',
                });
                continue;
            }
            return {
                sourceTask,
                task: {
                    id: sourceTask.id,
                    title: sourceTask.title,
                    type: sourceTask.taskType,
                    agent: 'HERMES',
                    priority: sourceTask.priority,
                    prompt: '',
                    context: {
                        source: sourceTask.source,
                        metadata: sourceTask.metadata,
                    },
                },
                objectiveTags: sourceTask.objectiveTags,
                evidence: sourceTask.evidence,
                editScopes: sourceTask.editScopes,
                verificationPlan: sourceTask.verificationPlan,
            };
        }
        return null;
    }
    async requeueTask(taskId) {
        return AgentTaskStore_1.agentTaskStore.requeueSourceTask(taskId);
    }
    async discardTask(taskId, reason) {
        return AgentTaskStore_1.agentTaskStore.discardSourceTask(taskId, reason);
    }
    getPendingCount() {
        return AgentTaskStore_1.agentTaskStore.getQueuedTasks(500).length;
    }
}
exports.TaskSources = TaskSources;
exports.taskSources = new TaskSources();
//# sourceMappingURL=TaskSources.js.map