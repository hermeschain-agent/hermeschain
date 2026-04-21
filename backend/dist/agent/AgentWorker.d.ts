import { EventEmitter } from 'events';
import { Task } from './TaskGenerator';
import { AgentEffectiveMode, TaskRunStatus, VerificationStatus } from './types';
import { AgentConfig } from './config';
export declare const agentEvents: EventEmitter<[never]>;
interface AgentDecision {
    action: string;
    reasoning: string;
}
interface AgentState {
    isWorking: boolean;
    currentTask: Task | null;
    currentOutput: string;
    completedTasks: Array<{
        task: Task;
        output: string;
        completedAt: Date;
    }>;
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
declare class AgentWorker {
    private state;
    private taskGenerator;
    private isRunning;
    private runtimeInitialized;
    private config;
    private heartbeatInterval;
    private currentAbortController;
    configure(config: AgentConfig): void;
    private initializeRuntime;
    private broadcast;
    private delay;
    private buildRuntimeSnapshot;
    private persistRuntimeState;
    private waitForCommitWindow;
    private startHeartbeat;
    getState(): AgentState;
    private buildContextPack;
    private buildSystemPrompt;
    private streamRealTask;
    private streamDemoTask;
    private verifyRun;
    private commitMessageForTask;
    private completeSuccessfulRun;
    private handleFailedRun;
    private resetCurrentState;
    start(): Promise<void>;
    stop(): void;
}
export declare const agentWorker: AgentWorker;
export {};
//# sourceMappingURL=AgentWorker.d.ts.map