export type BacklogTaskType = 'audit' | 'build' | 'feature' | 'fix' | 'test' | 'docs' | 'refactor' | 'analyze';
export interface BacklogVerification {
    label: string;
    command: string;
    cwd: 'repo' | 'backend' | 'frontend';
}
export interface BacklogTask {
    id: string;
    title: string;
    description: string;
    type: BacklogTaskType;
    priority: number;
    estimatedMinutes: number;
    commitWindowMinutes: number;
    phaseId: string;
    phaseTitle: string;
    phaseOrder: number;
    workstreamId: string;
    workstreamTitle: string;
    sequence: number;
    tags: string[];
    objectiveTags: string[];
    allowedScopes: string[];
    verification: BacklogVerification;
    expectedOutcome: string;
}
export interface BacklogPhaseSummary {
    id: string;
    title: string;
    order: number;
    commitCount: number;
    workstreamCount: number;
    description: string;
    tags: string[];
}
export declare const COMMIT_WINDOW_MINUTES = 30;
export declare const TARGET_COMMIT_HOURS = 108;
export declare const TARGET_COMMIT_WINDOWS = 648;
export declare function getRuntimeCommitWindowMinutes(): number;
export declare const TASK_BACKLOG: BacklogTask[];
export declare const BACKLOG_PHASES: BacklogPhaseSummary[];
export declare function getOrderedBacklog(): BacklogTask[];
export declare function getTasksByPriority(): BacklogTask[];
export declare function getTasksByType(type?: BacklogTaskType): BacklogTask[];
export declare function getTasksByPhase(phaseId?: string): BacklogTask[];
export declare function getTotalEstimatedTime(): {
    minutes: number;
    hours: number;
    days: number;
    commitWindows: number;
    commitWindowMinutes: number;
};
export declare function getNextBacklogTask(): BacklogTask | undefined;
export declare function markBacklogTaskComplete(taskId: string): void;
export declare function getBacklogProgress(): {
    completed: number;
    total: number;
    percent: number;
};
//# sourceMappingURL=TaskBacklog.d.ts.map