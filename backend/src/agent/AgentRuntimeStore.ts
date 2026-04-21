/**
 * AgentRuntimeStore — shared, in-process cache of the agent's latest
 * runtime snapshot.
 *
 * The worker writes snapshots as the agent loop advances so the web API
 * can read the most recent state without needing a websocket round-trip.
 * Lives in-memory for now; later this should be backed by Redis/Postgres
 * for multi-node coherence.
 */

export interface AgentRuntimeSnapshot {
  mode?: string;
  streamMode?: string;
  runStatus?: string;
  verificationStatus?: string;
  isWorking?: boolean;
  currentTask?: unknown;
  currentOutput?: string;
  lastFailure?: string | null;
  blockedReason?: string | null;
  capabilities?: Record<string, unknown>;
  [key: string]: unknown;
}

class AgentRuntimeStore {
  private latest: AgentRuntimeSnapshot | null = null;

  async initialize(): Promise<void> {
    // No-op today; placeholder for future persistent backing (Redis / Postgres).
    return;
  }

  saveSnapshot(snapshot: AgentRuntimeSnapshot): void {
    this.latest = snapshot;
  }

  getLatestSnapshot(): AgentRuntimeSnapshot | null {
    return this.latest;
  }
}

export const agentRuntimeStore = new AgentRuntimeStore();
