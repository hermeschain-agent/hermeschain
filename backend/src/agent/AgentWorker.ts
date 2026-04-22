import * as dotenv from 'dotenv';
import { EventEmitter } from 'events';
import { TaskGenerator, Task } from './TaskGenerator';
import { agentMemory } from './AgentMemory';
import { chainObserver } from './ChainObserver';
import { agentGoals } from './AgentGoals';
import { agentExecutor, AGENT_TOOLS_OAI } from './AgentExecutor';
import { taskSources } from './TaskSources';
import { gitIntegration } from './GitIntegration';
import { agentTaskStore } from './AgentTaskStore';
import { agentRuntimeStore } from './AgentRuntimeStore';
import { ciMonitor } from './CIMonitor';
import { skillManager } from './SkillManager';
import { COMMIT_WINDOW_MINUTES, getRuntimeCommitWindowMinutes } from './TaskBacklog';
import { tokenBudget } from './TokenBudget';
import {
  hermesChat,
  isConfigured,
  HermesMessage,
  HermesToolCall,
} from '../llm/hermesClient';
import {
  AgentMode,
  AgentEffectiveMode,
  AgentRuntimeSnapshot,
  TaskRunStatus,
  TaskSelection,
  VerificationPlan,
  VerificationStatus,
} from './types';
import { AgentConfig, createAgentConfig } from './config';

dotenv.config();

export const agentEvents = new EventEmitter();
agentEvents.setMaxListeners(100);

interface AgentDecision {
  action: string;
  reasoning: string;
}

interface AgentState {
  isWorking: boolean;
  currentTask: Task | null;
  currentOutput: string;
  completedTasks: Array<{ task: Task; output: string; completedAt: Date }>;
  currentDecision: AgentDecision | null;
  heartbeatCount: number;
  brainActive: boolean;
  mode: AgentEffectiveMode;
  runStatus: TaskRunStatus | 'idle';
  verificationStatus: VerificationStatus;
  blockedReason: string | null;
  lastFailure: string | null;
  repoRoot: string | null;
  repoRootHealth: 'ready' | 'missing';
  canWriteScopes: string[];
}

interface VerificationResult {
  passed: boolean;
  verificationStatus: VerificationStatus;
  changedFiles: string[];
  summary: string;
  failureReason?: string;
  blockedReason?: string;
}

interface CompletionResult {
  success: boolean;
  failureReason?: string;
}

function addAgentLog(
  type: string,
  content: string,
  taskId?: string,
  taskTitle?: string,
  metadata?: any
): void {
  const addLog = (global as any).addLog;
  if (typeof addLog === 'function') {
    addLog(type, content, taskId, taskTitle, metadata);
  }
}

function uniqueStrings(values: string[]): string[] {
  return Array.from(new Set(values.filter(Boolean)));
}

function shortOutput(value: string, limit: number = 1200): string {
  if (value.length <= limit) return value;
  return `${value.slice(0, limit)}\n...`;
}

function inferLanguageFromPath(filePath: string | null | undefined): string {
  if (!filePath) return 'text';

  const extension = filePath.split('.').pop()?.toLowerCase();
  const map: Record<string, string> = {
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
  private state: AgentState = {
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

  private taskGenerator = new TaskGenerator();
  private isRunning = false;
  private runtimeInitialized = false;
  private config: AgentConfig = createAgentConfig();
  private heartbeatInterval: NodeJS.Timeout | null = null;
  private currentAbortController: AbortController | null = null;

  configure(config: AgentConfig): void {
    this.config = config;
    this.state.mode = config.effectiveMode;
    this.state.brainActive = config.effectiveMode === 'real';
    this.state.repoRoot = config.repoRoot;
    this.state.repoRootHealth = config.repoRootHealth;
    this.state.canWriteScopes = config.effectiveMode === 'real' ? config.canWriteScopes : [];
    this.persistRuntimeState();
  }

  private async initializeRuntime(): Promise<void> {
    if (this.runtimeInitialized) return;

    await agentRuntimeStore.initialize();
    await agentMemory.initialize();
    await agentGoals.initialize();
    await agentTaskStore.initialize();
    await taskSources.initialize();

    if (this.config.effectiveMode === 'real') {
      await chainObserver.start();
      ciMonitor.start();
    }

    this.runtimeInitialized = true;
  }

  private broadcast(type: string, data: any): void {
    agentEvents.emit('chunk', { type, data, timestamp: Date.now() });
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  private buildRuntimeSnapshot(): AgentRuntimeSnapshot {
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

  private persistRuntimeState(): void {
    void agentRuntimeStore.saveSnapshot(this.buildRuntimeSnapshot());
  }

  private async waitForCommitWindow(runStartedAtMs: number): Promise<void> {
    const runtimeCommitWindowMinutes = getRuntimeCommitWindowMinutes();
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
      plannedCommitWindowMinutes: COMMIT_WINDOW_MINUTES,
    });
    this.persistRuntimeState();

    await this.delay(remainingMs);
  }

  private startHeartbeat(): void {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
    }

    this.heartbeatInterval = setInterval(async () => {
      if (!this.isRunning) return;
      this.state.heartbeatCount += 1;
      await agentMemory.updateWorkingContext({ lastHeartbeat: new Date() });
      this.persistRuntimeState();
      this.broadcast('heartbeat', {
        count: this.state.heartbeatCount,
        mode: this.config.effectiveMode,
        runStatus: this.state.runStatus,
      });
    }, 60000);
  }

  getState(): AgentState {
    const recentRuns = agentTaskStore.getRecentSuccessfulRuns(5);
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

  private async buildContextPack(selection: TaskSelection): Promise<string> {
    const scopePreviewFiles = selection.editScopes
      .filter((scope) => scope.kind === 'file')
      .slice(0, 4)
      .map((scope) => scope.path);

    const fileSnippets = await Promise.all(
      scopePreviewFiles.map(async (filePath) => {
        const result = await agentExecutor.readFile(filePath);
        if (!result.success || !result.content) return null;
        return `### ${filePath}\n${shortOutput(result.content, 600)}`;
      })
    );

    const gitStatus = await agentExecutor.gitStatus();
    const recentSuccess = agentTaskStore
      .getRecentSuccessfulRuns(3)
      .map((run) => `- ${run.title} (${run.completedAt?.toISOString() || run.updatedAt.toISOString()})`)
      .join('\n');
    const recentFailures = agentTaskStore
      .getRecentFailedRuns(2)
      .map((run) => `- ${run.title}: ${run.failureReason || run.blockedReason || 'failed'}`)
      .join('\n');
    const skillAdditions = skillManager.getSystemPromptAdditions();

    return [
      '## Task Evidence',
      ...selection.evidence.map((item) => `- ${item.label}: ${item.detail}`),
      '',
      '## Allowed Edit Scopes',
      ...selection.editScopes.map((scope) => `- ${scope.path}`),
      '',
      '## Verification Goal',
      `- ${selection.verificationPlan.description}`,
      ...selection.verificationPlan.steps.map((step) =>
        `- ${step.label}${step.command ? `: ${step.command} [${step.cwd || 'repo'}]` : ''}`
      ),
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

  private buildSystemPrompt(mode: AgentMode, verificationPlan: VerificationPlan): string {
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

  private async streamRealTask(
    selection: TaskSelection,
    contextPack: string
  ): Promise<{ output: string; changedFiles: string[] }> {
    if (!isConfigured()) {
      throw new Error('Model is not configured for real mode.');
    }

    const messages: HermesMessage[] = [
      {
        role: 'system',
        content: this.buildSystemPrompt('real', selection.verificationPlan),
      },
      {
        role: 'user',
        content: `${contextPack}\n\n## Requested Work\n${selection.sourceTask.title}\n\n${selection.sourceTask.description}`,
      },
    ];

    const changedFiles = new Set<string>();
    let fullOutput = '';
    // Tightened for cost. 5 iterations is plenty for a single write_file
    // task when the system prompt + tool descriptions are cached. Envs let
    // us override if a specific task genuinely needs more headroom.
    const maxIterations = Number(process.env.AGENT_MAX_ITERATIONS) || 5;
    const maxTokensPerCall = Number(process.env.AGENT_MAX_TOKENS) || 1200;

    this.currentAbortController = new AbortController();
    agentExecutor.setExecutionScopes(selection.editScopes);

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
        if (
          iteration >= writeReminderAt &&
          !writeReminderInjected &&
          !hasWritten()
        ) {
          messages.push({
            role: 'user',
            content:
              `REMINDER: You have used ${iteration}/${maxIterations} iterations without writing any files. ` +
              `Stop reading and planning — call write_file with the required output artifact now. ` +
              `If the task description says "Write your findings to backend/src/hermes-generated/...", ` +
              `that file MUST be created via write_file this turn.`,
          });
          writeReminderInjected = true;
        }
        if (
          iteration >= writeImperativeAt &&
          !writeImperativeInjected &&
          !hasWritten()
        ) {
          messages.push({
            role: 'user',
            content:
              `FINAL NOTICE: You have ${maxIterations - iteration} iteration(s) left and still have not called write_file. ` +
              `Call write_file with a valid path inside the allowed scopes right now. ` +
              `Do not read any more files. Do not explain. Just write.`,
          });
          writeImperativeInjected = true;
        }

        const response = await hermesChat({
          messages,
          tools: AGENT_TOOLS_OAI,
          temperature: 0.2,
          maxTokens: maxTokensPerCall,
        });

        const choice = response.choices?.[0];
        if (!choice) break;
        const assistantMessage = choice.message;
        const assistantText = (assistantMessage.content as string | null | undefined) || '';

        if (assistantText) {
          fullOutput += assistantText;
          this.state.currentOutput = fullOutput;
          this.persistRuntimeState();
          this.broadcast('text', assistantText);
          addAgentLog('analysis', assistantText, selection.sourceTask.id, selection.sourceTask.title, {
            phase: this.state.runStatus,
          });
        }

        const toolCalls: HermesToolCall[] = assistantMessage.tool_calls || [];
        if (toolCalls.length === 0) {
          break;
        }

        messages.push({
          role: 'assistant',
          content: assistantText || null,
          tool_calls: toolCalls,
        });

        for (const toolCall of toolCalls) {
          let toolInput: any = {};
          try {
            toolInput = toolCall.function.arguments
              ? JSON.parse(toolCall.function.arguments)
              : {};
          } catch {
            toolInput = {};
          }

          this.broadcast('tool_start', {
            tool: toolCall.function.name,
            input: toolInput,
          });
          this.persistRuntimeState();
          addAgentLog(
            'tool_use',
            `Using tool: ${toolCall.function.name}`,
            selection.sourceTask.id,
            selection.sourceTask.title,
            { input: toolInput }
          );

          const toolResult = await agentExecutor.executeTool(toolCall.function.name, toolInput);

          if (toolCall.function.name === 'write_file' && toolResult?.success && toolResult?.path) {
            changedFiles.add(toolResult.path);
          }

          const toolResultPayload: Record<string, unknown> = {
            tool: toolCall.function.name,
            result: toolResult,
          };

          if (
            toolCall.function.name === 'write_file' &&
            toolResult?.success &&
            typeof toolInput.content === 'string'
          ) {
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
    } finally {
      agentExecutor.clearExecutionScopes();
    }

    return {
      output: fullOutput,
      changedFiles: Array.from(changedFiles),
    };
  }

  private async streamDemoTask(task: Task): Promise<string> {
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

  private async verifyRun(selection: TaskSelection, changedFiles: string[]): Promise<VerificationResult> {
    this.state.runStatus = 'verifying';
    this.state.verificationStatus = 'running';
    this.persistRuntimeState();
    this.broadcast('verification_start', {
      sourceTaskId: selection.sourceTask.id,
      verificationPlan: selection.verificationPlan,
    });
    addAgentLog(
      'verification_start',
      `Starting verification for ${selection.sourceTask.title}`,
      selection.sourceTask.id,
      selection.sourceTask.title,
      selection.verificationPlan
    );

    const scopedGitChanges = gitIntegration.getChangedFilesWithinScopes(selection.editScopes);
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
      if (step.type !== 'command' || !step.command) continue;
      const result = await agentExecutor.runCommand(step.command, 240000, step.cwd);
      this.broadcast('verification_result', {
        step: step.label,
        success: result.success,
        output: result.output,
      });
      addAgentLog(
        'verification_result',
        `${step.label}: ${result.success ? 'passed' : 'failed'}`,
        selection.sourceTask.id,
        selection.sourceTask.title,
        { command: step.command, cwd: step.cwd, output: shortOutput(result.output, 800) }
      );

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

  private commitMessageForTask(task: Task): string {
    const typeMap: Record<string, string> = {
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

  private async completeSuccessfulRun(
    selection: TaskSelection,
    output: string,
    changedFiles: string[],
    mode: AgentMode,
    verificationStatus: VerificationStatus
  ): Promise<CompletionResult> {
    const currentRun = agentTaskStore.getCurrentRun();
    if (!currentRun) {
      return {
        success: false,
        failureReason: 'Current task run disappeared before completion could be recorded.',
      };
    }

    const commitResult = await gitIntegration.autoCommitAndPush(
      this.commitMessageForTask(selection.task),
      selection.sourceTask.id,
      {
        scopes: selection.editScopes,
        files: changedFiles,
      }
    );

    if (!commitResult.success) {
      const failureReason = commitResult.error || commitResult.output || 'Commit failed unexpectedly.';

      await agentTaskStore.finishRun(currentRun.id, 'failed', verificationStatus, {
        changedFiles,
        failureReason,
        output,
      });

      await agentMemory.recordTaskCompletion(selection.task.title, selection.task.type, output, false, {
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

    await agentTaskStore.finishRun(currentRun.id, 'succeeded', verificationStatus, {
      changedFiles: changedFiles,
      output,
    });

    await agentMemory.saveCompletedTask(
      selection.sourceTask.id,
      selection.task.type,
      selection.task.title,
      selection.task.agent,
      output
    );

    await agentMemory.recordTaskCompletion(selection.task.title, selection.task.type, output, true, {
      taskRunId: currentRun.id,
      sourceTaskId: selection.sourceTask.id,
      filePaths: changedFiles,
      verificationOutcome: verificationStatus,
    });

    await agentGoals.recordVerifiedProgressByTags(
      selection.objectiveTags,
      `Verified run completed: ${selection.task.title}`
    );
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

  private async handleFailedRun(
    selection: TaskSelection,
    output: string,
    result: VerificationResult
  ): Promise<void> {
    const currentRun = agentTaskStore.getCurrentRun();
    if (!currentRun) return;

    const terminalStatus = result.blockedReason ? 'blocked' : 'failed';
    await agentTaskStore.finishRun(currentRun.id, terminalStatus, result.verificationStatus, {
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
      addAgentLog(
        'task_blocked',
        result.blockedReason || 'Task blocked.',
        selection.sourceTask.id,
        selection.task.title
      );
    } else {
      this.broadcast('verification_result', {
        success: false,
        summary: result.summary,
        failureReason: result.failureReason,
      });
      addAgentLog(
        'verification_result',
        result.failureReason || result.summary,
        selection.sourceTask.id,
        selection.task.title
      );
    }

    await agentMemory.recordTaskCompletion(selection.task.title, selection.task.type, output, false, {
      taskRunId: currentRun.id,
      sourceTaskId: selection.sourceTask.id,
      filePaths: result.changedFiles,
      verificationOutcome: result.verificationStatus,
      failureClass: terminalStatus,
    });
  }

  private resetCurrentState(): void {
    this.state.isWorking = false;
    this.state.currentTask = null;
    this.state.currentOutput = '';
    this.state.currentDecision = null;
    this.state.runStatus = 'idle';
    this.state.verificationStatus = 'pending';
    this.state.blockedReason = null;
    this.persistRuntimeState();
  }

  async start(): Promise<void> {
    if (this.isRunning) {
      console.log('[AGENT] Worker already running');
      return;
    }

    if (!this.config) {
      this.configure(createAgentConfig());
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
      const probe = gitIntegration.probeCapabilities();
      this.config.gitAvailable = probe.git === 'ready';
      this.config.pushAvailable = probe.push === 'ready';

      if (
        probe.reason &&
        !this.config.startupIssues.some((issue) => issue === probe.reason)
      ) {
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
    addAgentLog(
      'system',
      `Agent worker started in ${this.config.effectiveMode} mode.`,
      undefined,
      undefined,
      {
        startupIssues: this.config.startupIssues,
        repoRoot: this.config.repoRoot,
      }
    );

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
        const budgetDecision = tokenBudget.shouldPause();
        if (budgetDecision.paused) {
          this.state.runStatus = 'blocked';
          this.state.blockedReason = budgetDecision.reason || 'token budget reached';
          this.persistRuntimeState();
          this.broadcast('status', {
            status: 'budget_paused',
            mode: 'real',
            runStatus: 'blocked',
            blockedReason: this.state.blockedReason,
            tokenSpend: tokenBudget.snapshot(),
          });
          await this.delay(5 * 60 * 1000);
          continue;
        }

        const selection = await taskSources.getNextTask();
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
        const run = await agentTaskStore.startRun(selection.sourceTask, 'real', contextPack);
        await agentTaskStore.markSourceTaskInProgress(selection.sourceTask.id);

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

        await agentMemory.setFocus(selection.task.title);

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
        addAgentLog(
          'task_start',
          `Starting ${selection.task.title}`,
          selection.sourceTask.id,
          selection.task.title,
          {
            scopes: selection.editScopes,
            objectiveTags: selection.objectiveTags,
          }
        );

        this.state.runStatus = 'executing';
        this.persistRuntimeState();
        await agentTaskStore.updateRun(run.id, { status: 'analyzing' });
        const { output, changedFiles } = await this.streamRealTask(selection, contextPack);

        await agentTaskStore.updateRun(run.id, { status: 'executing', output });

        const verification = await this.verifyRun(selection, changedFiles);

        let completionResult: CompletionResult = { success: verification.passed };

        if (verification.passed) {
          completionResult = await this.completeSuccessfulRun(
            selection,
            output,
            verification.changedFiles,
            'real',
            verification.verificationStatus
          );
        } else {
          await this.handleFailedRun(selection, output, verification);
        }

        await agentMemory.setFocus(null);
        this.resetCurrentState();
        if (verification.passed && completionResult.success) {
          await this.waitForCommitWindow(runStartedAtMs);
        } else {
          // Short pause between failed tasks — Haiku is cheap and the
          // circuit breaker handles the real billing/auth failures.
          await this.delay(60 * 1000);
        }
      } catch (error: any) {
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

  stop(): void {
    this.isRunning = false;
    if (this.currentAbortController) {
      this.currentAbortController.abort();
    }
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
    ciMonitor.stop();
    chainObserver.stop();
    this.persistRuntimeState();
    this.broadcast('status', { status: 'stopped', mode: this.config.effectiveMode });
  }
}

export const agentWorker = new AgentWorker();
