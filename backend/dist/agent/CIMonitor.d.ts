import { AgentConfig } from './config';
export interface TestResult {
    passed: boolean;
    total: number;
    passing: number;
    failing: number;
    duration: number;
    failures: TestFailure[];
}
export interface TestFailure {
    testName: string;
    file: string;
    message: string;
    stack?: string;
}
export interface BuildResult {
    success: boolean;
    duration: number;
    errors: string[];
    warnings: string[];
}
export interface LintResult {
    clean: boolean;
    errorCount: number;
    warningCount: number;
    issues: LintIssue[];
}
export interface LintIssue {
    file: string;
    line: number;
    column: number;
    severity: 'error' | 'warning';
    message: string;
    rule: string;
}
export declare class CIMonitor {
    private projectRoot;
    private config;
    private isRunning;
    private checkInterval;
    private lastCheckAt;
    private watchers;
    private watchDebounce;
    private isCheckInFlight;
    constructor(projectRoot?: string);
    configure(config: AgentConfig): void;
    private getPackageTargets;
    private runPackageScript;
    runAllChecks(): Promise<{
        tests: TestResult;
        build: BuildResult;
        lint: LintResult;
    }>;
    runTests(): Promise<TestResult>;
    runBuild(): Promise<BuildResult>;
    runLint(): Promise<LintResult>;
    start(intervalMs?: number): void;
    /**
     * fs.watch on backend/src and frontend/src. Any change triggers a
     * 5-second-debounced runAllChecks, so bulk saves (a single "git pull"
     * or editor autosave burst) collapse to one CI run. Polling stays on
     * as a safety net for filesystems where recursive watch isn't available.
     */
    startFileWatch(): void;
    private debouncedRun;
    private runChecksOnce;
    stop(): void;
    private handleResults;
    getStatus(): {
        running: boolean;
        lastCheck?: Date;
    };
    quickCheck(): Promise<boolean>;
}
export declare const ciMonitor: CIMonitor;
//# sourceMappingURL=CIMonitor.d.ts.map