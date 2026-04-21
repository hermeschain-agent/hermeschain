import { AgentMode, SourceTaskRecord, SourceTaskStatus, TaskRunRecord, TaskRunStatus, VerificationStatus } from './types';
type SourceTaskInput = Omit<SourceTaskRecord, 'createdAt' | 'updatedAt' | 'runCount'> & {
    createdAt?: Date;
    updatedAt?: Date;
    runCount?: number;
};
export declare class AgentTaskStore {
    private initialized;
    private sourceTasks;
    private taskRuns;
    initialize(): Promise<void>;
    private loadSourceTasks;
    private loadTaskRuns;
    private hydrateSourceTask;
    private hydrateTaskRun;
    upsertSourceTask(task: SourceTaskInput): Promise<SourceTaskRecord>;
    getSourceTask(id: string): SourceTaskRecord | null;
    listSourceTasks(limit?: number): SourceTaskRecord[];
    private statusSortWeight;
    getQueuedTasks(limit?: number): SourceTaskRecord[];
    updateSourceTaskStatus(id: string, status: SourceTaskStatus, extras?: Partial<Pick<SourceTaskRecord, 'lastError' | 'blockedReason'>>): Promise<SourceTaskRecord | null>;
    startRun(task: SourceTaskRecord, mode: AgentMode, contextSummary: string): Promise<TaskRunRecord>;
    private persistRun;
    updateRun(runId: string, updates: Partial<Pick<TaskRunRecord, 'status' | 'verificationStatus' | 'changedFiles' | 'failureReason' | 'blockedReason' | 'output' | 'contextSummary' | 'completedAt'>>): Promise<TaskRunRecord | null>;
    finishRun(runId: string, status: Extract<TaskRunStatus, 'succeeded' | 'failed' | 'blocked' | 'discarded'>, verificationStatus: VerificationStatus, details?: {
        changedFiles?: string[];
        failureReason?: string | null;
        blockedReason?: string | null;
        output?: string;
    }): Promise<TaskRunRecord | null>;
    markSourceTaskInProgress(sourceTaskId: string): Promise<void>;
    getRecentRuns(limit?: number): TaskRunRecord[];
    getRecentSuccessfulRuns(limit?: number): TaskRunRecord[];
    getRecentFailedRuns(limit?: number): TaskRunRecord[];
    getCurrentRun(): TaskRunRecord | null;
    requeueSourceTask(id: string): Promise<SourceTaskRecord | null>;
    discardSourceTask(id: string, reason: string): Promise<SourceTaskRecord | null>;
    getBacklogProgress(totalTasks: number): {
        completed: number;
        total: number;
        percent: number;
    };
}
export declare const agentTaskStore: AgentTaskStore;
export {};
//# sourceMappingURL=AgentTaskStore.d.ts.map