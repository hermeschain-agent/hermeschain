export type AgentMode = 'demo' | 'real';
export type AgentEffectiveMode = AgentMode | 'disabled';

export type SourceTaskStatus =
  | 'queued'
  | 'selected'
  | 'in_progress'
  | 'succeeded'
  | 'failed'
  | 'blocked'
  | 'discarded';

export type TaskRunStatus =
  | 'queued'
  | 'selected'
  | 'analyzing'
  | 'executing'
  | 'verifying'
  | 'succeeded'
  | 'failed'
  | 'blocked'
  | 'discarded';

export type VerificationStatus =
  | 'pending'
  | 'running'
  | 'passed'
  | 'failed'
  | 'not_applicable';

export interface ExecutionScope {
  kind: 'path_prefix' | 'file';
  path: string;
  label?: string;
}

export interface EvidenceItem {
  kind: 'event' | 'log' | 'file' | 'metric' | 'backlog' | 'ci';
  label: string;
  detail: string;
  filePath?: string;
  line?: number;
}

export interface VerificationStep {
  id: string;
  type: 'command' | 'artifact';
  label: string;
  command?: string;
  cwd?: 'repo' | 'backend' | 'frontend';
  required?: boolean;
}

export interface VerificationPlan {
  type: 'code' | 'artifact';
  description: string;
  requireChangedFiles: boolean;
  steps: VerificationStep[];
}

export interface SourceTaskRecord {
  id: string;
  source: string;
  title: string;
  description: string;
  priority: number;
  status: SourceTaskStatus;
  taskType: string;
  objectiveTags: string[];
  evidence: EvidenceItem[];
  editScopes: ExecutionScope[];
  verificationPlan: VerificationPlan;
  metadata: Record<string, unknown>;
  lastError: string | null;
  blockedReason: string | null;
  runCount: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface TaskRunRecord {
  id: string;
  sourceTaskId: string;
  mode: AgentMode;
  status: TaskRunStatus;
  verificationStatus: VerificationStatus;
  title: string;
  taskType: string;
  agent: string;
  changedFiles: string[];
  failureReason: string | null;
  blockedReason: string | null;
  output: string;
  contextSummary: string;
  startedAt: Date;
  updatedAt: Date;
  completedAt?: Date | null;
}

export interface TaskSelection {
  sourceTask: SourceTaskRecord;
  task: {
    id: string;
    title: string;
    type: string;
    prompt: string;
    agent: string;
    priority?: number;
    context?: Record<string, unknown>;
  };
  objectiveTags: string[];
  evidence: EvidenceItem[];
  editScopes: ExecutionScope[];
  verificationPlan: VerificationPlan;
}

export interface AgentConfig {
  autorunEnabled: boolean;
  requestedMode: AgentMode;
  effectiveMode: AgentEffectiveMode;
  repoRoot: string | null;
  repoRootHealth: 'ready' | 'missing';
  projectPaths: {
    backend: string | null;
    frontend: string | null;
  };
  modelConfigured: boolean;
  canWriteScopes: string[];
  startupIssues: string[];
}
