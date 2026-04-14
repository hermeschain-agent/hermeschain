import { db } from '../database/db';
import {
  AgentMode,
  SourceTaskRecord,
  SourceTaskStatus,
  TaskRunRecord,
  TaskRunStatus,
  VerificationStatus,
} from './types';

const CREATE_TASK_TABLES = `
CREATE TABLE IF NOT EXISTS agent_source_tasks (
  id VARCHAR(128) PRIMARY KEY,
  source VARCHAR(64) NOT NULL,
  title VARCHAR(512) NOT NULL,
  description TEXT NOT NULL,
  priority FLOAT DEFAULT 0.5,
  status VARCHAR(32) DEFAULT 'queued',
  task_type VARCHAR(64) NOT NULL,
  objective_tags JSONB DEFAULT '[]',
  evidence JSONB DEFAULT '[]',
  edit_scopes JSONB DEFAULT '[]',
  verification_plan JSONB DEFAULT '{}',
  metadata JSONB DEFAULT '{}',
  last_error TEXT,
  blocked_reason TEXT,
  run_count INT DEFAULT 0,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS agent_task_runs (
  id VARCHAR(128) PRIMARY KEY,
  source_task_id VARCHAR(128) NOT NULL,
  mode VARCHAR(16) NOT NULL,
  status VARCHAR(32) NOT NULL,
  verification_status VARCHAR(32) DEFAULT 'pending',
  title VARCHAR(512) NOT NULL,
  task_type VARCHAR(64) NOT NULL,
  agent VARCHAR(64) NOT NULL,
  changed_files JSONB DEFAULT '[]',
  failure_reason TEXT,
  blocked_reason TEXT,
  output TEXT DEFAULT '',
  context_summary TEXT DEFAULT '',
  started_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  completed_at TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_agent_source_tasks_status ON agent_source_tasks(status);
CREATE INDEX IF NOT EXISTS idx_agent_source_tasks_priority ON agent_source_tasks(priority DESC);
CREATE INDEX IF NOT EXISTS idx_agent_task_runs_status ON agent_task_runs(status);
CREATE INDEX IF NOT EXISTS idx_agent_task_runs_started_at ON agent_task_runs(started_at DESC);
`;

type SourceTaskInput = Omit<SourceTaskRecord, 'createdAt' | 'updatedAt' | 'runCount'> & {
  createdAt?: Date;
  updatedAt?: Date;
  runCount?: number;
};

export class AgentTaskStore {
  private initialized = false;
  private sourceTasks = new Map<string, SourceTaskRecord>();
  private taskRuns: TaskRunRecord[] = [];

  async initialize(): Promise<void> {
    if (this.initialized) return;

    try {
      await db.exec(CREATE_TASK_TABLES);
      await this.loadSourceTasks();
      await this.loadTaskRuns();
    } catch (error) {
      console.error('[AGENT_TASKS] Failed to initialize persistent task store:', error);
    }

    this.initialized = true;
  }

  private async loadSourceTasks(): Promise<void> {
    try {
      const result = await db.query(`
        SELECT * FROM agent_source_tasks
        ORDER BY updated_at DESC
        LIMIT 500
      `);

      for (const row of result.rows || []) {
        const record = this.hydrateSourceTask(row);
        this.sourceTasks.set(record.id, record);
      }
    } catch (error) {
      console.error('[AGENT_TASKS] Failed to load source tasks:', error);
    }
  }

  private async loadTaskRuns(): Promise<void> {
    try {
      const result = await db.query(`
        SELECT * FROM agent_task_runs
        ORDER BY started_at DESC
        LIMIT 200
      `);

      this.taskRuns = (result.rows || []).map((row) => this.hydrateTaskRun(row));
    } catch (error) {
      console.error('[AGENT_TASKS] Failed to load task runs:', error);
    }
  }

  private hydrateSourceTask(row: any): SourceTaskRecord {
    return {
      id: row.id,
      source: row.source,
      title: row.title,
      description: row.description,
      priority: Number(row.priority || 0.5),
      status: row.status,
      taskType: row.task_type,
      objectiveTags: row.objective_tags || [],
      evidence: row.evidence || [],
      editScopes: row.edit_scopes || [],
      verificationPlan: row.verification_plan || {
        type: 'artifact',
        description: 'No verification plan recorded.',
        requireChangedFiles: false,
        steps: [],
      },
      metadata: row.metadata || {},
      lastError: row.last_error || null,
      blockedReason: row.blocked_reason || null,
      runCount: Number(row.run_count || 0),
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at),
    };
  }

  private hydrateTaskRun(row: any): TaskRunRecord {
    return {
      id: row.id,
      sourceTaskId: row.source_task_id,
      mode: row.mode,
      status: row.status,
      verificationStatus: row.verification_status,
      title: row.title,
      taskType: row.task_type,
      agent: row.agent,
      changedFiles: row.changed_files || [],
      failureReason: row.failure_reason || null,
      blockedReason: row.blocked_reason || null,
      output: row.output || '',
      contextSummary: row.context_summary || '',
      startedAt: new Date(row.started_at),
      updatedAt: new Date(row.updated_at),
      completedAt: row.completed_at ? new Date(row.completed_at) : null,
    };
  }

  async upsertSourceTask(task: SourceTaskInput): Promise<SourceTaskRecord> {
    await this.initialize();

    const existing = this.sourceTasks.get(task.id);
    const now = new Date();
    const record: SourceTaskRecord = {
      ...existing,
      ...task,
      runCount: existing?.runCount ?? task.runCount ?? 0,
      createdAt: existing?.createdAt ?? task.createdAt ?? now,
      updatedAt: task.updatedAt ?? now,
    };

    this.sourceTasks.set(record.id, record);

    try {
      await db.query(
        `
          INSERT INTO agent_source_tasks (
            id, source, title, description, priority, status, task_type,
            objective_tags, evidence, edit_scopes, verification_plan, metadata,
            last_error, blocked_reason, run_count, created_at, updated_at
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)
          ON CONFLICT (id) DO UPDATE SET
            source = EXCLUDED.source,
            title = EXCLUDED.title,
            description = EXCLUDED.description,
            priority = EXCLUDED.priority,
            status = EXCLUDED.status,
            task_type = EXCLUDED.task_type,
            objective_tags = EXCLUDED.objective_tags,
            evidence = EXCLUDED.evidence,
            edit_scopes = EXCLUDED.edit_scopes,
            verification_plan = EXCLUDED.verification_plan,
            metadata = EXCLUDED.metadata,
            last_error = EXCLUDED.last_error,
            blocked_reason = EXCLUDED.blocked_reason,
            run_count = EXCLUDED.run_count,
            updated_at = EXCLUDED.updated_at
        `,
        [
          record.id,
          record.source,
          record.title,
          record.description,
          record.priority,
          record.status,
          record.taskType,
          JSON.stringify(record.objectiveTags),
          JSON.stringify(record.evidence),
          JSON.stringify(record.editScopes),
          JSON.stringify(record.verificationPlan),
          JSON.stringify(record.metadata),
          record.lastError,
          record.blockedReason,
          record.runCount,
          record.createdAt,
          record.updatedAt,
        ]
      );
    } catch (error) {
      console.error('[AGENT_TASKS] Failed to upsert source task:', error);
    }

    return record;
  }

  getSourceTask(id: string): SourceTaskRecord | null {
    return this.sourceTasks.get(id) || null;
  }

  listSourceTasks(limit: number = 50): SourceTaskRecord[] {
    return Array.from(this.sourceTasks.values())
      .sort((a, b) => {
        if (a.status !== b.status) {
          return this.statusSortWeight(a.status) - this.statusSortWeight(b.status);
        }
        return b.priority - a.priority || b.updatedAt.getTime() - a.updatedAt.getTime();
      })
      .slice(0, limit);
  }

  private statusSortWeight(status: SourceTaskStatus): number {
    const order: Record<SourceTaskStatus, number> = {
      queued: 0,
      selected: 1,
      in_progress: 2,
      failed: 3,
      blocked: 4,
      succeeded: 5,
      discarded: 6,
    };

    return order[status] ?? 99;
  }

  getQueuedTasks(limit: number = 50): SourceTaskRecord[] {
    return this.listSourceTasks(500)
      .filter((task) => task.status === 'queued' || task.status === 'failed')
      .slice(0, limit);
  }

  async updateSourceTaskStatus(
    id: string,
    status: SourceTaskStatus,
    extras: Partial<Pick<SourceTaskRecord, 'lastError' | 'blockedReason'>> = {}
  ): Promise<SourceTaskRecord | null> {
    const task = this.sourceTasks.get(id);
    if (!task) return null;

    const updated: SourceTaskRecord = {
      ...task,
      status,
      lastError: extras.lastError ?? task.lastError,
      blockedReason: extras.blockedReason ?? task.blockedReason,
      updatedAt: new Date(),
    };

    return this.upsertSourceTask(updated);
  }

  async startRun(task: SourceTaskRecord, mode: AgentMode, contextSummary: string): Promise<TaskRunRecord> {
    await this.initialize();

    const run: TaskRunRecord = {
      id: `run_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      sourceTaskId: task.id,
      mode,
      status: 'selected',
      verificationStatus: 'pending',
      title: task.title,
      taskType: task.taskType,
      agent: 'HERMES',
      changedFiles: [],
      failureReason: null,
      blockedReason: null,
      output: '',
      contextSummary,
      startedAt: new Date(),
      updatedAt: new Date(),
      completedAt: null,
    };

    this.taskRuns.unshift(run);
    this.taskRuns = this.taskRuns.slice(0, 200);

    await this.updateSourceTaskStatus(task.id, 'selected');
    await this.persistRun(run);

    const currentTask = this.sourceTasks.get(task.id);
    if (currentTask) {
      currentTask.runCount += 1;
      currentTask.updatedAt = new Date();
      await this.upsertSourceTask(currentTask);
    }

    return run;
  }

  private async persistRun(run: TaskRunRecord): Promise<void> {
    try {
      await db.query(
        `
          INSERT INTO agent_task_runs (
            id, source_task_id, mode, status, verification_status, title, task_type, agent,
            changed_files, failure_reason, blocked_reason, output, context_summary,
            started_at, updated_at, completed_at
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
          ON CONFLICT (id) DO UPDATE SET
            status = EXCLUDED.status,
            verification_status = EXCLUDED.verification_status,
            changed_files = EXCLUDED.changed_files,
            failure_reason = EXCLUDED.failure_reason,
            blocked_reason = EXCLUDED.blocked_reason,
            output = EXCLUDED.output,
            context_summary = EXCLUDED.context_summary,
            updated_at = EXCLUDED.updated_at,
            completed_at = EXCLUDED.completed_at
        `,
        [
          run.id,
          run.sourceTaskId,
          run.mode,
          run.status,
          run.verificationStatus,
          run.title,
          run.taskType,
          run.agent,
          JSON.stringify(run.changedFiles),
          run.failureReason,
          run.blockedReason,
          run.output,
          run.contextSummary,
          run.startedAt,
          run.updatedAt,
          run.completedAt || null,
        ]
      );
    } catch (error) {
      console.error('[AGENT_TASKS] Failed to persist task run:', error);
    }
  }

  async updateRun(
    runId: string,
    updates: Partial<
      Pick<
        TaskRunRecord,
        | 'status'
        | 'verificationStatus'
        | 'changedFiles'
        | 'failureReason'
        | 'blockedReason'
        | 'output'
        | 'contextSummary'
        | 'completedAt'
      >
    >
  ): Promise<TaskRunRecord | null> {
    const index = this.taskRuns.findIndex((run) => run.id === runId);
    if (index === -1) return null;

    const updated: TaskRunRecord = {
      ...this.taskRuns[index],
      ...updates,
      updatedAt: new Date(),
    };

    this.taskRuns[index] = updated;
    await this.persistRun(updated);
    return updated;
  }

  async finishRun(
    runId: string,
    status: Extract<TaskRunStatus, 'succeeded' | 'failed' | 'blocked' | 'discarded'>,
    verificationStatus: VerificationStatus,
    details: {
      changedFiles?: string[];
      failureReason?: string | null;
      blockedReason?: string | null;
      output?: string;
    } = {}
  ): Promise<TaskRunRecord | null> {
    const updated = await this.updateRun(runId, {
      status,
      verificationStatus,
      changedFiles: details.changedFiles,
      failureReason: details.failureReason ?? null,
      blockedReason: details.blockedReason ?? null,
      output: details.output,
      completedAt: new Date(),
    });

    if (!updated) return null;

    const sourceStatus: SourceTaskStatus =
      status === 'succeeded'
        ? 'succeeded'
        : status === 'discarded'
          ? 'discarded'
          : status === 'blocked'
            ? 'blocked'
            : 'failed';

    await this.updateSourceTaskStatus(updated.sourceTaskId, sourceStatus, {
      lastError: updated.failureReason,
      blockedReason: updated.blockedReason,
    });

    return updated;
  }

  async markSourceTaskInProgress(sourceTaskId: string): Promise<void> {
    await this.updateSourceTaskStatus(sourceTaskId, 'in_progress');
  }

  getRecentRuns(limit: number = 20): TaskRunRecord[] {
    return [...this.taskRuns]
      .sort((a, b) => b.startedAt.getTime() - a.startedAt.getTime())
      .slice(0, limit);
  }

  getRecentSuccessfulRuns(limit: number = 10): TaskRunRecord[] {
    return this.getRecentRuns(200)
      .filter((run) => run.status === 'succeeded')
      .slice(0, limit);
  }

  getRecentFailedRuns(limit: number = 10): TaskRunRecord[] {
    return this.getRecentRuns(200)
      .filter((run) => run.status === 'failed' || run.status === 'blocked')
      .slice(0, limit);
  }

  getCurrentRun(): TaskRunRecord | null {
    return (
      this.taskRuns.find(
        (run) =>
          run.status === 'selected' ||
          run.status === 'analyzing' ||
          run.status === 'executing' ||
          run.status === 'verifying'
      ) || null
    );
  }

  async requeueSourceTask(id: string): Promise<SourceTaskRecord | null> {
    return this.updateSourceTaskStatus(id, 'queued', {
      lastError: null,
      blockedReason: null,
    });
  }

  async discardSourceTask(id: string, reason: string): Promise<SourceTaskRecord | null> {
    return this.updateSourceTaskStatus(id, 'discarded', {
      blockedReason: reason,
    });
  }

  getBacklogProgress(totalTasks: number): { completed: number; total: number; percent: number } {
    const completed = Array.from(this.sourceTasks.values()).filter(
      (task) => task.source === 'backlog' && task.status === 'succeeded'
    ).length;
    return {
      completed,
      total: totalTasks,
      percent: totalTasks > 0 ? Math.round((completed / totalTasks) * 100) : 0,
    };
  }
}

export const agentTaskStore = new AgentTaskStore();
