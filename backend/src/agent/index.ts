export { agentWorker, agentEvents } from './AgentWorker';
export { TaskGenerator } from './TaskGenerator';
export type { Task } from './TaskGenerator';
export { createAgentConfig, resolveRepoRoot } from './config';
export { agentTaskStore } from './AgentTaskStore';
export { agentRuntimeStore } from './AgentRuntimeStore';

// Brain components
export { agentMemory } from './AgentMemory';
export { chainObserver } from './ChainObserver';
export { agentGoals } from './AgentGoals';
export { agentExecutor, AGENT_TOOLS } from './AgentExecutor';
export { gitIntegration } from './GitIntegration';
export { taskSources } from './TaskSources';
export { ciMonitor } from './CIMonitor';
export { browserAutomation, BROWSER_TOOLS } from './BrowserAutomation';
export { skillManager } from './SkillManager';
export { tokenBudget, TokenBudget } from './TokenBudget';
export type { TokenBudgetSnapshot } from './TokenBudget';

import type { AgentConfig } from './config';
import { agentWorker } from './AgentWorker';
import { agentExecutor } from './AgentExecutor';
import { gitIntegration } from './GitIntegration';
import { taskSources } from './TaskSources';
import { ciMonitor } from './CIMonitor';
import { browserAutomation } from './BrowserAutomation';
import { skillManager } from './SkillManager';

export function configureAgentSubsystems(config: AgentConfig): void {
  agentExecutor.configure(config);
  gitIntegration.configure(config);
  taskSources.configure(config);
  ciMonitor.configure(config);
  browserAutomation.configure(config);
  skillManager.configure(config);
  agentWorker.configure(config);
}

// Types
export type { Memory, WorkingContext, CompletedTaskRecord } from './AgentMemory';
export type { ChainState, ChainIssue, ChainOpportunity } from './ChainObserver';
export type { Goal } from './AgentGoals';
export type { ExecutionResult, FileResult, GitResult } from './AgentExecutor';
export type { GitOperationResult, BranchInfo, PullRequestInfo, CommitInfo } from './GitIntegration';
export type { SourceTask, TaskSourceType, TaskPriority } from './TaskSources';
export type { TestResult, TestFailure, BuildResult, LintResult, LintIssue } from './CIMonitor';
export type { BrowserResult, PageInfo, ElementInfo } from './BrowserAutomation';
export type { Skill, SkillTool, SkillScript, SkillTrigger, SkillResult } from './SkillManager';
export type {
  AgentConfig,
  AgentMode,
  AgentEffectiveMode,
  SourceTaskRecord,
  TaskRunRecord,
  ExecutionScope,
  VerificationPlan,
  VerificationStep,
  VerificationStatus,
  TaskRunStatus,
  SourceTaskStatus,
} from './types';
