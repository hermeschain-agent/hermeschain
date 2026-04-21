import { AgentConfig } from './config';
import { SourceTaskRecord, TaskSelection } from './types';
export type TaskSourceType = 'backlog' | 'chain_event' | 'code_error' | 'github_issue' | 'cip_proposal' | 'todo_comment' | 'dependency' | 'runtime_error';
export type TaskPriority = 'critical' | 'high' | 'medium' | 'low';
export interface SourceTask {
    id: string;
    source: TaskSourceType;
    title: string;
    description: string;
    priority: TaskPriority;
    context: Record<string, any>;
    createdAt: Date;
}
export declare class TaskSources {
    private config;
    private projectRoot;
    private initialized;
    private backlogSynced;
    private listenerDisposers;
    configure(config: AgentConfig): void;
    initialize(): Promise<void>;
    dispose(): void;
    private on;
    private eventCooldowns;
    private readonly EVENT_COOLDOWN_MS;
    private isEventOnCooldown;
    private setupEventListeners;
    private extractScopesFromCiFailure;
    private getRecentChangedFiles;
    private getRetryDelayMs;
    private buildVerificationPlan;
    private backlogCreatedAt;
    private buildBacklogVerificationPlan;
    private syncBacklogTasks;
    private enqueueSourceTask;
    private mapTaskType;
    scanTodoComments(): Promise<void>;
    scanDependencies(): Promise<void>;
    scanGitHubIssues(): Promise<void>;
    scanCipProposals(): Promise<void>;
    collectAllTasks(): Promise<SourceTaskRecord[]>;
    getNextTask(): Promise<TaskSelection | null>;
    requeueTask(taskId: string): Promise<SourceTaskRecord | null>;
    discardTask(taskId: string, reason: string): Promise<SourceTaskRecord | null>;
    getPendingCount(): number;
}
export declare const taskSources: TaskSources;
//# sourceMappingURL=TaskSources.d.ts.map