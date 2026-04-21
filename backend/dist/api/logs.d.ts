declare const logsRouter: import("express-serve-static-core").Router;
export interface LogEntry {
    id: string;
    timestamp: Date;
    type: string;
    taskId?: string;
    taskTitle?: string;
    content: string;
    metadata?: any;
}
export declare function initializeLogsTable(): Promise<void>;
export declare function addLog(type: LogEntry['type'], content: string, taskId?: string, taskTitle?: string, metadata?: any): LogEntry;
export { logsRouter };
//# sourceMappingURL=logs.d.ts.map