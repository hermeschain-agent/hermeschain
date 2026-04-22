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
exports.agentWorker = exports.agentEvents = void 0;
const dotenv = __importStar(require("dotenv"));
const events_1 = require("events");
const TaskGenerator_1 = require("./TaskGenerator");
const AgentMemory_1 = require("./AgentMemory");
const ChainObserver_1 = require("./ChainObserver");
const AgentGoals_1 = require("./AgentGoals");
const AgentExecutor_1 = require("./AgentExecutor");
const TaskSources_1 = require("./TaskSources");
const GitIntegration_1 = require("./GitIntegration");
const AgentTaskStore_1 = require("./AgentTaskStore");
const AgentRuntimeStore_1 = require("./AgentRuntimeStore");
const CIMonitor_1 = require("./CIMonitor");
const SkillManager_1 = require("./SkillManager");
const TaskBacklog_1 = require("./TaskBacklog");
const TokenBudget_1 = require("./TokenBudget");
const hermesClient_1 = require("../llm/hermesClient");
const config_1 = require("./config");
dotenv.config();
exports.agentEvents = new events_1.EventEmitter();
exports.agentEvents.setMaxListeners(100);
function addAgentLog(type, content, taskId, taskTitle, metadata) {
    const addLog = global.addLog;
    if (typeof addLog === 'function') {
        addLog(type, content, taskId, taskTitle, metadata);
    }
}
function uniqueStrings(values) {
    return Array.from(new Set(values.filter(Boolean)));
}
function shortOutput(value, limit = 1200) {
    if (value.length <= limit)
        return value;
    return `${value.slice(0, limit)}\n...`;
}
function inferLanguageFromPath(filePath) {
    if (!filePath)
        return 'text';
    const extension = filePath.split('.').pop()?.toLowerCase();
    const map = {
        ts: 'typescript',
        tsx: 'tsx',
        js: 'javascript',
        jsx: 'jsx',
        json: 'json',
        css: 'css',
        html: 'html',
        md: 'markdown',
        sql: 'sql',
        yml: 'yaml',
        yaml: 'yaml',
        sh: 'bash',
    };
    return map[extension || ''] || 'text';
}
class AgentWorker {
    constructor() {
        this.state = {
            isWorking: false,
            currentTask: null,
            currentOutput: '',
            completedTasks: [],
            currentDecision: null,
            heartbeatCount: 0,
            brainActive: false,
            mode: 'disabled',
            runStatus: 'idle',
            verificationStatus: 'pending',
            blockedReason: null,
            lastFailure: null,
            repoRoot: null,
            repoRootHealth: 'missing',
            canWriteScopes: [],
        };
        this.taskGenerator = new TaskGenerator_1.TaskGenerator();
        this.isRunning = false;
        this.runtimeInitialized = false;
        this.config = (0, config_1.createAgentConfig)();
        this.heartbeatInterval = null;
        this.currentAbortController = null;
    }
    configure(config) {
        this.config = config;
        this.state.mode = config.effectiveMode;
        this.state.brainActive = config.effectiveMode === 'real';
        this.state.repoRoot = config.repoRoot;
        this.state.repoRootHealth = config.repoRootHealth;
        this.state.canWriteScopes = config.effectiveMode === 'real' ? config.canWriteScopes : [];
        this.persistRuntimeState();
    }
    async initializeRuntime() {
        if (this.runtimeInitialized)
            return;
        await AgentRuntimeStore_1.agentRuntimeStore.initialize();
        await AgentMemory_1.agentMemory.initialize();
        await AgentGoals_1.agentGoals.initialize();
        await AgentTaskStore_1.agentTaskStore.initialize();
        await TaskSources_1.taskSources.initialize();
        if (this.config.effectiveMode === 'real') {
            await ChainObserver_1.chainObserver.start();
            CIMonitor_1.ciMonitor.start();
        }
        this.runtimeInitialized = true;
    }
    broadcast(type, data) {
        exports.agentEvents.emit('chunk', { type, data, timestamp: Date.now() });
    }
    delay(ms) {
        return new Promise((resolve) => setTimeout(resolve, ms));
    }
    buildRuntimeSnapshot() {
        return {
            role: this.config.role,
            mode: this.state.mode,
            isWorking: this.state.isWorking,
            runStatus: this.state.runStatus,
            verificationStatus: this.state.verificationStatus,
            blockedReason: this.state.blockedReason,
            lastFailure: this.state.lastFailure,
            repoRoot: this.state.repoRoot,
            repoRootHealth: this.state.repoRootHealth,
            canWriteScopes: this.state.canWriteScopes,
            currentTask: this.state.currentTask
                ? {
                    id: this.state.currentTask.id,
                    title: this.state.currentTask.title,
                    type: this.state.currentTask.type,
                    agent: this.state.currentTask.agent,
                }
                : null,
            currentOutput: this.state.currentOutput,
            currentDecision: this.state.currentDecision,
            heartbeatCount: this.state.heartbeatCount,
            brainActive: this.state.brainActive,
            agentEnabled: this.config.effectiveMode !== 'disabled',
            startupIssues: this.config.startupIssues,
            capabilities: {
                workspace: this.config.workspaceReady ? 'ready' : 'unavailable',
                git: this.config.gitAvailable ? 'ready' : 'unavailable',
                push: this.config.pushAvailable ? 'ready' : 'unavailable',
                llm: this.config.modelConfigured ? 'ready' : 'unavailable',
            },
            updatedAt: new Date().toISOString(),
            workerHeartbeatAt: this.isRunning ? new Date().toISOString() : null,
        };
    }
    persistRuntimeState() {
        void AgentRuntimeStore_1.agentRuntimeStore.saveSnapshot(this.buildRuntimeSnapshot());
    }
    async waitForCommitWindow(runStartedAtMs) {
        const runtimeCommitWindowMinutes = (0, TaskBacklog_1.getRuntimeCommitWindowMinutes)();
        const targetWindowMs = runtimeCommitWindowMinutes * 60 * 1000;
        const remainingMs = targetWindowMs - (Date.now() - runStartedAtMs);
        if (remainingMs <= 0) {
            return;
        }
        this.broadcast('status', {
            status: 'commit_window_wait',
            mode: 'real',
            runStatus: 'idle',
            nextTaskInMs: remainingMs,
            commitWindowMinutes: runtimeCommitWindowMinutes,
            plannedCommitWindowMinutes: TaskBacklog_1.COMMIT_WINDOW_MINUTES,
        });
        this.persistRuntimeState();
        await this.delay(remainingMs);
    }
    startHeartbeat() {
        if (this.heartbeatInterval) {
            clearInterval(this.heartbeatInterval);
        }
        this.heartbeatInterval = setInterval(async () => {
            if (!this.isRunning)
                return;
            this.state.heartbeatCount += 1;
            await AgentMemory_1.agentMemory.updateWorkingContext({ lastHeartbeat: new Date() });
            this.persistRuntimeState();
            this.broadcast('heartbeat', {
                count: this.state.heartbeatCount,
                mode: this.config.effectiveMode,
                runStatus: this.state.runStatus,
            });
        }, 60000);
    }
    getState() {
        const recentRuns = AgentTaskStore_1.agentTaskStore.getRecentSuccessfulRuns(5);
        return {
            ...this.state,
            completedTasks: recentRuns.map((run) => ({
                task: {
                    id: run.sourceTaskId,
                    type: run.taskType,
                    title: run.title,
                    agent: run.agent,
                    prompt: '',
                    priority: 0.5,
                },
                output: run.output,
                completedAt: run.completedAt || run.updatedAt,
            })),
        };
    }
    async buildContextPack(selection) {
        const scopePreviewFiles = selection.editScopes
            .filter((scope) => scope.kind === 'file')
            .slice(0, 4)
            .map((scope) => scope.path);
        const fileSnippets = await Promise.all(scopePreviewFiles.map(async (filePath) => {
            const result = await AgentExecutor_1.agentExecutor.readFile(filePath);
            if (!result.success || !result.content)
                return null;
            return `### ${filePath}\n${shortOutput(result.content, 600)}`;
        }));
        const gitStatus = await AgentExecutor_1.agentExecutor.gitStatus();
        const recentSuccess = AgentTaskStore_1.agentTaskStore
            .getRecentSuccessfulRuns(3)
            .map((run) => `- ${run.title} (${run.completedAt?.toISOString() || run.updatedAt.toISOString()})`)
            .join('\n');
        const recentFailures = AgentTaskStore_1.agentTaskStore
            .getRecentFailedRuns(2)
            .map((run) => `- ${run.title}: ${run.failureReason || run.blockedReason || 'failed'}`)
            .join('\n');
        const skillAdditions = SkillManager_1.skillManager.getSystemPromptAdditions();
        return [
            '## Task Evidence',
            ...selection.evidence.map((item) => `- ${item.label}: ${item.detail}`),
            '',
            '## Allowed Edit Scopes',
            ...selection.editScopes.map((scope) => `- ${scope.path}`),
            '',
            '## Verification Goal',
            `- ${selection.verificationPlan.description}`,
            ...selection.verificationPlan.steps.map((step) => `- ${step.label}${step.command ? `: ${step.command} [${step.cwd || 'repo'}]` : ''}`),
            '',
            '## Current Repo Status',
            gitStatus.success
                ? `- Branch: ${gitStatus.branch}\n- Working tree: ${gitStatus.output || 'clean'}`
                : `- Git unavailable: ${gitStatus.error || 'unknown error'}`,
            '',
            recentSuccess ? `## Recent Successful Runs\n${recentSuccess}` : '',
            recentFailures ? `## Recent Failed Runs\n${recentFailures}` : '',
            fileSnippets.filter(Boolean).length
                ? `## Relevant Files\n${fileSnippets.filter(Boolean).join('\n\n')}`
                : '',
            skillAdditions ? `## Active Skills\n${skillAdditions}` : '',
        ]
            .filter(Boolean)
            .join('\n');
    }
    buildSystemPrompt(mode, verificationPlan) {
        return [
            'You are Hermes, a repository-grounded engineering agent for Hermeschain.',
            'Only claim work that you actually performed and verified.',
            'If the task cannot be completed safely inside the allowed edit scopes, stop and say why.',
            'Do not invent file changes, commits, or successful verification.',
            '',
            '## You MUST produce real file changes',
            '- Every task is expected to end with at least one successful write_file tool call inside the allowed scopes.',
            '- "Investigating" or "analyzing" without writing is a FAILURE. Plan briefly, then write.',
            '- Spend at most 1-2 tool calls on reads/searches before calling write_file.',
            '- If you genuinely cannot write (e.g. scope forbids it), say exactly why in one sentence, do NOT silently skip.',
            '',
            '## Working Rules',
            '- Base every action on the provided evidence and repository context.',
            '- Stay strictly inside the allowed edit scopes.',
            '- Prefer small, self-contained edits that a single commit can cover.',
            '- After editing, briefly summarize what changed and what risks remain.',
            '',
            '## Verification Contract',
            `- Verification mode: ${verificationPlan.type}`,
            `- Verification goal: ${verificationPlan.description}`,
            '- If verification fails, explain the failure instead of pretending success.',
            '',
            `## Execution Mode\n- Current mode: ${mode}`,
        ].join('\n');
    }
    async streamRealTask(selection, contextPack) {
        if (!(0, hermesClient_1.isConfigured)()) {
            throw new Error('Model is not configured for real mode.');
        }
        const messages = [
            {
                role: 'system',
                content: this.buildSystemPrompt('real', selection.verificationPlan),
            },
            {
                role: 'user',
                content: `${contextPack}\n\n## Requested Work\n${selection.sourceTask.title}\n\n${selection.sourceTask.description}`,
            },
        ];
        const changedFiles = new Set();
        let fullOutput = '';
        // Tightened for cost. 5 iterations is plenty for a single write_file
        // task when the system prompt + tool descriptions are cached. Envs let
        // us override if a specific task genuinely needs more headroom.
        const maxIterations = Number(process.env.AGENT_MAX_ITERATIONS) || 5;
        const maxTokensPerCall = Number(process.env.AGENT_MAX_TOKENS) || 1200;
        this.currentAbortController = new AbortController();
        AgentExecutor_1.agentExecutor.setExecutionScopes(selection.editScopes);
        // Track whether the agent has actually called write_file yet. With a
        // 5-iter budget we want the nudge EARLY (iter 2) and a hard imperative
        // on the second-to-last turn.
        const writeReminderAt = Math.max(1, Math.floor(maxIterations / 2) - 1);
        const writeImperativeAt = Math.max(writeReminderAt + 1, maxIterations - 2);
        let writeReminderInjected = false;
        let writeImperativeInjected = false;
        const hasWritten = () => changedFiles.size > 0;
        try {
            for (let iteration = 0; iteration < maxIterations; iteration += 1) {
                // If we're halfway and no files have been written, kick the agent.
                if (iteration >= writeReminderAt &&
                    !writeReminderInjected &&
                    !hasWritten()) {
                    messages.push({
                        role: 'user',
                        content: `REMINDER: You have used ${iteration}/${maxIterations} iterations without writing any files. ` +
                            `Stop reading and planning — call write_file with the required output artifact now. ` +
                            `If the task description says "Write your findings to backend/src/hermes-generated/...", ` +
                            `that file MUST be created via write_file this turn.`,
                    });
                    writeReminderInjected = true;
                }
                if (iteration >= writeImperativeAt &&
                    !writeImperativeInjected &&
                    !hasWritten()) {
                    messages.push({
                        role: 'user',
                        content: `FINAL NOTICE: You have ${maxIterations - iteration} iteration(s) left and still have not called write_file. ` +
                            `Call write_file with a valid path inside the allowed scopes right now. ` +
                            `Do not read any more files. Do not explain. Just write.`,
                    });
                    writeImperativeInjected = true;
                }
                const response = await (0, hermesClient_1.hermesChat)({
                    messages,
                    tools: AgentExecutor_1.AGENT_TOOLS_OAI,
                    temperature: 0.2,
                    maxTokens: maxTokensPerCall,
                });
                const choice = response.choices?.[0];
                if (!choice)
                    break;
                const assistantMessage = choice.message;
                const assistantText = assistantMessage.content || '';
                if (assistantText) {
                    fullOutput += assistantText;
                    this.state.currentOutput = fullOutput;
                    this.persistRuntimeState();
                    this.broadcast('text', assistantText);
                    addAgentLog('analysis', assistantText, selection.sourceTask.id, selection.sourceTask.title, {
                        phase: this.state.runStatus,
                    });
                }
                const toolCalls = assistantMessage.tool_calls || [];
                if (toolCalls.length === 0) {
                    break;
                }
                messages.push({
                    role: 'assistant',
                    content: assistantText || null,
                    tool_calls: toolCalls,
                });
                for (const toolCall of toolCalls) {
                    let toolInput = {};
                    try {
                        toolInput = toolCall.function.arguments
                            ? JSON.parse(toolCall.function.arguments)
                            : {};
                    }
                    catch {
                        toolInput = {};
                    }
                    this.broadcast('tool_start', {
                        tool: toolCall.function.name,
                        input: toolInput,
                    });
                    this.persistRuntimeState();
                    addAgentLog('tool_use', `Using tool: ${toolCall.function.name}`, selection.sourceTask.id, selection.sourceTask.title, { input: toolInput });
                    const toolResult = await AgentExecutor_1.agentExecutor.executeTool(toolCall.function.name, toolInput);
                    if (toolCall.function.name === 'write_file' && toolResult?.success && toolResult?.path) {
                        changedFiles.add(toolResult.path);
                    }
                    const toolResultPayload = {
                        tool: toolCall.function.name,
                        result: toolResult,
                    };
                    if (toolCall.function.name === 'write_file' &&
                        toolResult?.success &&
                        typeof toolInput.content === 'string') {
                        toolResultPayload.preview = {
                            path: toolResult?.path || toolInput.path || null,
                            language: inferLanguageFromPath(toolResult?.path || toolInput.path),
                            content: shortOutput(toolInput.content, 4000),
                            truncated: toolInput.content.length > 4000,
                        };
                    }
                    this.broadcast('tool_result', toolResultPayload);
                    this.persistRuntimeState();
                    messages.push({
                        role: 'tool',
                        tool_call_id: toolCall.id,
                        content: JSON.stringify(toolResult).slice(0, 4000),
                    });
                }
            }
        }
        finally {
            AgentExecutor_1.agentExecutor.clearExecutionScopes();
        }
        return {
            output: fullOutput,
            changedFiles: Array.from(changedFiles),
        };
    }
    async streamDemoTask(task) {
        const lines = [
            '[demo] Hermes is running in read-only demo mode.',
            `[demo] Selected showcase task: ${task.title}`,
            '[demo] No repository files will be changed in this mode.',
            '[demo] To enable real scoped work, start the agent with AGENT_MODE=real and AGENT_AUTORUN=true.',
        ];
        let output = '';
        for (const line of lines) {
            output += `${line}\n`;
            this.state.currentOutput = output;
            this.broadcast('text', `${line}\n`);
            await this.delay(120);
        }
        return output;
    }
    async verifyRun(selection, changedFiles) {
        this.state.runStatus = 'verifying';
        this.state.verificationStatus = 'running';
        this.persistRuntimeState();
        this.broadcast('verification_start', {
            sourceTaskId: selection.sourceTask.id,
            verificationPlan: selection.verificationPlan,
        });
        addAgentLog('verification_start', `Starting verification for ${selection.sourceTask.title}`, selection.sourceTask.id, selection.sourceTask.title, selection.verificationPlan);
        const scopedGitChanges = GitIntegration_1.gitIntegration.getChangedFilesWithinScopes(selection.editScopes);
        const allChangedFiles = uniqueStrings([...changedFiles, ...scopedGitChanges]);
        if (selection.verificationPlan.requireChangedFiles && allChangedFiles.length === 0) {
            return {
                passed: false,
                verificationStatus: 'failed',
                changedFiles: [],
                summary: 'Verification failed: no scoped file changes detected.',
                failureReason: 'No scoped file changes were detected for this task.',
            };
        }
        if (selection.verificationPlan.type === 'code' && selection.verificationPlan.steps.length === 0) {
            return {
                passed: false,
                verificationStatus: 'failed',
                changedFiles: allChangedFiles,
                summary: 'Verification failed: no verification steps were defined for a code task.',
                failureReason: 'Code task has no verification steps.',
            };
        }
        for (const step of selection.verificationPlan.steps) {
            if (step.type !== 'command' || !step.command)
                continue;
            const result = await AgentExecutor_1.agentExecutor.runCommand(step.command, 240000, step.cwd);
            this.broadcast('verification_result', {
                step: step.label,
                success: result.success,
                output: result.output,
            });
            addAgentLog('verification_result', `${step.label}: ${result.success ? 'passed' : 'failed'}`, selection.sourceTask.id, selection.sourceTask.title, { command: step.command, cwd: step.cwd, output: shortOutput(result.output, 800) });
            if (!result.success && step.required !== false) {
                return {
                    passed: false,
                    verificationStatus: 'failed',
                    changedFiles: allChangedFiles,
                    summary: `${step.label} failed verification.`,
                    failureReason: result.error || result.output || `${step.label} failed`,
                };
            }
        }
        return {
            passed: true,
            verificationStatus: selection.verificationPlan.type === 'artifact' ? 'not_applicable' : 'passed',
            changedFiles: allChangedFiles,
            summary: 'Verification passed.',
        };
    }
    commitMessageForTask(task) {
        const typeMap = {
            build: 'feat',
            fix: 'fix',
            test: 'test',
            audit: 'docs',
            analyze: 'docs',
            feature: 'feat',
            docs: 'docs',
            refactor: 'refactor',
        };
        const commitType = typeMap[task.type] || 'chore';
        const scope = task.type.split('_')[0] || 'agent';
        const title = task.title.replace(/\s+/g, ' ').trim();
        return `${commitType}(${scope}): ${title.charAt(0).toLowerCase()}${title.slice(1)}`;
    }
    async completeSuccessfulRun(selection, output, changedFiles, mode, verificationStatus) {
        const currentRun = AgentTaskStore_1.agentTaskStore.getCurrentRun();
        if (!currentRun) {
            return {
                success: false,
                failureReason: 'Current task run disappeared before completion could be recorded.',
            };
        }
        const commitResult = await GitIntegration_1.gitIntegration.autoCommitAndPush(this.commitMessageForTask(selection.task), selection.sourceTask.id, {
            scopes: selection.editScopes,
            files: changedFiles,
        });
        if (!commitResult.success) {
            const failureReason = commitResult.error || commitResult.output || 'Commit failed unexpectedly.';
            await AgentTaskStore_1.agentTaskStore.finishRun(currentRun.id, 'failed', verificationStatus, {
                changedFiles,
                failureReason,
                output,
            });
            await AgentMemory_1.agentMemory.recordTaskCompletion(selection.task.title, selection.task.type, output, false, {
                taskRunId: currentRun.id,
                sourceTaskId: selection.sourceTask.id,
                filePaths: changedFiles,
                verificationOutcome: verificationStatus,
                failureClass: 'commit_failed',
            });
            this.state.lastFailure = failureReason;
            this.state.verificationStatus = verificationStatus;
            this.persistRuntimeState();
            this.broadcast('error', {
                message: failureReason,
                mode,
                sourceTaskId: selection.sourceTask.id,
                taskTitle: selection.task.title,
            });
            addAgentLog('error', failureReason, selection.sourceTask.id, selection.task.title, {
                phase: 'commit',
            });
            return {
                success: false,
                failureReason,
            };
        }
        await AgentTaskStore_1.agentTaskStore.finishRun(currentRun.id, 'succeeded', verificationStatus, {
            changedFiles: changedFiles,
            output,
        });
        await AgentMemory_1.agentMemory.saveCompletedTask(selection.sourceTask.id, selection.task.type, selection.task.title, selection.task.agent, output);
        await AgentMemory_1.agentMemory.recordTaskCompletion(selection.task.title, selection.task.type, output, true, {
            taskRunId: currentRun.id,
            sourceTaskId: selection.sourceTask.id,
            filePaths: changedFiles,
            verificationOutcome: verificationStatus,
        });
        await AgentGoals_1.agentGoals.recordVerifiedProgressByTags(selection.objectiveTags, `Verified run completed: ${selection.task.title}`);
        this.persistRuntimeState();
        this.broadcast('task_complete', {
            taskId: selection.sourceTask.id,
            title: selection.task.title,
            mode,
            verificationStatus,
            commit: commitResult.commit || null,
            changedFiles,
        });
        addAgentLog('task_complete', `Completed ${selection.task.title}`, selection.sourceTask.id, selection.task.title, {
            commit: commitResult.commit || null,
            changedFiles,
            mode,
        });
        return { success: true };
    }
    async handleFailedRun(selection, output, result) {
        const currentRun = AgentTaskStore_1.agentTaskStore.getCurrentRun();
        if (!currentRun)
            return;
        const terminalStatus = result.blockedReason ? 'blocked' : 'failed';
        await AgentTaskStore_1.agentTaskStore.finishRun(currentRun.id, terminalStatus, result.verificationStatus, {
            changedFiles: result.changedFiles,
            failureReason: result.failureReason || null,
            blockedReason: result.blockedReason || null,
            output,
        });
        this.state.lastFailure = result.failureReason || result.blockedReason || result.summary;
        this.state.blockedReason = result.blockedReason || null;
        this.state.verificationStatus = result.verificationStatus;
        this.persistRuntimeState();
        if (terminalStatus === 'blocked') {
            this.broadcast('task_blocked', {
                taskId: selection.sourceTask.id,
                title: selection.task.title,
                reason: result.blockedReason,
            });
            addAgentLog('task_blocked', result.blockedReason || 'Task blocked.', selection.sourceTask.id, selection.task.title);
        }
        else {
            this.broadcast('verification_result', {
                success: false,
                summary: result.summary,
                failureReason: result.failureReason,
            });
            addAgentLog('verification_result', result.failureReason || result.summary, selection.sourceTask.id, selection.task.title);
        }
        await AgentMemory_1.agentMemory.recordTaskCompletion(selection.task.title, selection.task.type, output, false, {
            taskRunId: currentRun.id,
            sourceTaskId: selection.sourceTask.id,
            filePaths: result.changedFiles,
            verificationOutcome: result.verificationStatus,
            failureClass: terminalStatus,
        });
    }
    resetCurrentState() {
        this.state.isWorking = false;
        this.state.currentTask = null;
        this.state.currentOutput = '';
        this.state.currentDecision = null;
        this.state.runStatus = 'idle';
        this.state.verificationStatus = 'pending';
        this.state.blockedReason = null;
        this.persistRuntimeState();
    }
    async start() {
        if (this.isRunning) {
            console.log('[AGENT] Worker already running');
            return;
        }
        if (!this.config) {
            this.configure((0, config_1.createAgentConfig)());
        }
        if (this.config.effectiveMode === 'disabled') {
            this.state.mode = 'disabled';
            this.persistRuntimeState();
            this.broadcast('status', {
                status: 'disabled',
                issues: this.config.startupIssues,
            });
            return;
        }
        await this.initializeRuntime();
        if (this.config.role === 'worker' && this.config.effectiveMode === 'real') {
            const probe = GitIntegration_1.gitIntegration.probeCapabilities();
            this.config.gitAvailable = probe.git === 'ready';
            this.config.pushAvailable = probe.push === 'ready';
            if (probe.reason &&
                !this.config.startupIssues.some((issue) => issue === probe.reason)) {
                this.config.startupIssues.push(probe.reason);
            }
        }
        this.isRunning = true;
        this.state.mode = this.config.effectiveMode;
        this.state.brainActive = this.config.effectiveMode === 'real';
        this.persistRuntimeState();
        this.broadcast('status', {
            status: 'started',
            mode: this.config.effectiveMode,
            repoRoot: this.config.repoRoot,
            repoRootHealth: this.config.repoRootHealth,
        });
        addAgentLog('system', `Agent worker started in ${this.config.effectiveMode} mode.`, undefined, undefined, {
            startupIssues: this.config.startupIssues,
            repoRoot: this.config.repoRoot,
        });
        this.startHeartbeat();
        while (this.isRunning) {
            try {
                if (this.config.effectiveMode === 'demo') {
                    const task = this.taskGenerator.getNextTask();
                    this.state.isWorking = true;
                    this.state.currentTask = task;
                    this.state.currentDecision = {
                        action: 'demo_stream',
                        reasoning: 'Read-only demo mode is active; no repository changes will be attempted.',
                    };
                    this.state.runStatus = 'executing';
                    this.persistRuntimeState();
                    this.broadcast('task_start', {
                        task,
                        mode: 'demo',
                        runStatus: this.state.runStatus,
                        streamMode: 'demo',
                        decision: this.state.currentDecision,
                    });
                    await this.streamDemoTask(task);
                    this.broadcast('task_complete', {
                        taskId: task.id,
                        title: task.title,
                        mode: 'demo',
                        verificationStatus: 'not_applicable',
                    });
                    this.resetCurrentState();
                    await this.delay(45000);
                    continue;
                }
                // Token-budget gate. If either the rolling hour or UTC-day bucket
                // is over cap, skip task pickup entirely and nap for 5 min. Without
                // this the agent would keep burning credit until Anthropic trips
                // its own billing circuit breaker.
                const budgetDecision = TokenBudget_1.tokenBudget.shouldPause();
                if (budgetDecision.paused) {
                    this.state.runStatus = 'blocked';
                    this.state.blockedReason = budgetDecision.reason || 'token budget reached';
                    this.persistRuntimeState();
                    this.broadcast('status', {
                        status: 'budget_paused',
                        mode: 'real',
                        runStatus: 'blocked',
                        blockedReason: this.state.blockedReason,
                        tokenSpend: TokenBudget_1.tokenBudget.snapshot(),
                    });
                    await this.delay(5 * 60 * 1000);
                    continue;
                }
                const selection = await TaskSources_1.taskSources.getNextTask();
                if (!selection) {
                    this.state.runStatus = 'idle';
                    this.persistRuntimeState();
                    this.broadcast('status', {
                        status: 'idle',
                        mode: 'real',
                        runStatus: 'idle',
                    });
                    await this.delay(15000);
                    continue;
                }
                const runStartedAtMs = Date.now();
                const contextPack = await this.buildContextPack(selection);
                const run = await AgentTaskStore_1.agentTaskStore.startRun(selection.sourceTask, 'real', contextPack);
                await AgentTaskStore_1.agentTaskStore.markSourceTaskInProgress(selection.sourceTask.id);
                this.state.isWorking = true;
                this.state.currentTask = selection.task;
                this.state.currentOutput = '';
                this.state.currentDecision = {
                    action: 'work_on_task',
                    reasoning: 'Task selected from persisted source queue with explicit evidence and edit scopes.',
                };
                this.state.runStatus = 'analyzing';
                this.state.verificationStatus = 'pending';
                this.state.blockedReason = null;
                this.state.lastFailure = null;
                this.persistRuntimeState();
                await AgentMemory_1.agentMemory.setFocus(selection.task.title);
                this.broadcast('task_start', {
                    task: selection.task,
                    sourceTaskId: selection.sourceTask.id,
                    mode: 'real',
                    runStatus: this.state.runStatus,
                    streamMode: 'real',
                    decision: this.state.currentDecision,
                    canWriteScopes: selection.editScopes.map((scope) => scope.path),
                });
                this.broadcast('analysis_start', {
                    taskId: selection.sourceTask.id,
                    contextPack,
                    evidence: selection.evidence,
                });
                addAgentLog('task_start', `Starting ${selection.task.title}`, selection.sourceTask.id, selection.task.title, {
                    scopes: selection.editScopes,
                    objectiveTags: selection.objectiveTags,
                });
                this.state.runStatus = 'executing';
                this.persistRuntimeState();
                await AgentTaskStore_1.agentTaskStore.updateRun(run.id, { status: 'analyzing' });
                const { output, changedFiles } = await this.streamRealTask(selection, contextPack);
                await AgentTaskStore_1.agentTaskStore.updateRun(run.id, { status: 'executing', output });
                const verification = await this.verifyRun(selection, changedFiles);
                let completionResult = { success: verification.passed };
                if (verification.passed) {
                    completionResult = await this.completeSuccessfulRun(selection, output, verification.changedFiles, 'real', verification.verificationStatus);
                }
                else {
                    await this.handleFailedRun(selection, output, verification);
                }
                await AgentMemory_1.agentMemory.setFocus(null);
                this.resetCurrentState();
                if (verification.passed && completionResult.success) {
                    await this.waitForCommitWindow(runStartedAtMs);
                }
                else {
                    // Short pause between failed tasks — Haiku is cheap and the
                    // circuit breaker handles the real billing/auth failures.
                    await this.delay(60 * 1000);
                }
            }
            catch (error) {
                console.error('[AGENT] Error in worker loop:', error);
                this.state.lastFailure = error.message;
                this.state.runStatus = 'failed';
                this.persistRuntimeState();
                this.broadcast('error', {
                    message: error.message,
                    mode: this.config.effectiveMode,
                });
                addAgentLog('error', error.message);
                // Anti-guzzler: 5s → 60s on uncaught loop errors.
                await this.delay(60 * 1000);
            }
        }
    }
    stop() {
        this.isRunning = false;
        if (this.currentAbortController) {
            this.currentAbortController.abort();
        }
        if (this.heartbeatInterval) {
            clearInterval(this.heartbeatInterval);
            this.heartbeatInterval = null;
        }
        CIMonitor_1.ciMonitor.stop();
        ChainObserver_1.chainObserver.stop();
        this.persistRuntimeState();
        this.broadcast('status', { status: 'stopped', mode: this.config.effectiveMode });
    }
}
exports.agentWorker = new AgentWorker();
//# sourceMappingURL=AgentWorker.js.map