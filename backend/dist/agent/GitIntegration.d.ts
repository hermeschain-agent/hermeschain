import { AgentConfig } from './config';
import { ExecutionScope } from './types';
export interface GitOperationResult {
    success: boolean;
    output: string;
    error?: string;
    branch?: string;
    commit?: string;
    prUrl?: string;
    files?: string[];
}
export interface BranchInfo {
    name: string;
    current: boolean;
    lastCommit: string;
    lastCommitDate: string;
}
export interface PullRequestInfo {
    number: number;
    title: string;
    branch: string;
    status: 'open' | 'merged' | 'closed';
    url: string;
}
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
export declare class GitIntegration {
    private projectRoot;
    private mainBranch;
    private branchPrefix;
    private initialized;
    private config;
    constructor(projectRoot?: string);
    private hasGitRepo;
    private matchesScope;
    private getDefaultCommitScopes;
    private isLikelyGibberish;
    private inspectFilesForGibberish;
    private getScopedStatusEntries;
    configure(config: AgentConfig): void;
    private setupGitConfig;
    private deriveCommitMessage;
    autoCommitAndPush(message: string, taskId?: string, options?: {
        scopes?: ExecutionScope[];
        files?: string[];
    }): Promise<GitOperationResult>;
    getChangedFilesWithinScopes(scopes: ExecutionScope[]): string[];
    probeCapabilities(): GitCapabilityProbe;
    private execGit;
    getCurrentBranch(): string;
    getBranches(): BranchInfo[];
    createTaskBranch(taskId: string, taskTitle: string): Promise<GitOperationResult>;
    switchBranch(branchName: string): Promise<GitOperationResult>;
    getStatus(): {
        branch: string;
        changes: string[];
        staged: string[];
        clean: boolean;
    };
    stageFiles(files?: string[]): Promise<GitOperationResult>;
    commit(message: string, taskId?: string): Promise<GitOperationResult>;
    getRecentCommits(count?: number): CommitInfo[];
    push(branchName?: string): Promise<GitOperationResult>;
    createPullRequest(title: string, body: string, baseBranch?: string): Promise<GitOperationResult>;
    getOpenPullRequests(): Promise<PullRequestInfo[]>;
    mergeToMain(): Promise<GitOperationResult>;
    deleteBranch(branchName: string, force?: boolean): Promise<GitOperationResult>;
    getDiff(staged?: boolean): string;
    stash(message?: string): Promise<GitOperationResult>;
    stashPop(): Promise<GitOperationResult>;
    reset(hard?: boolean): Promise<GitOperationResult>;
    isClean(): boolean;
    getSummary(): string;
}
export declare const gitIntegration: GitIntegration;
//# sourceMappingURL=GitIntegration.d.ts.map