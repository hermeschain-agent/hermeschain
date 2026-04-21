"use strict";
/**
 * AgentRuntimeStore — shared, in-process cache of the agent's latest
 * runtime snapshot.
 *
 * The worker writes snapshots as the agent loop advances so the web API
 * can read the most recent state without needing a websocket round-trip.
 * Lives in-memory for now; later this should be backed by Redis/Postgres
 * for multi-node coherence.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.agentRuntimeStore = void 0;
class AgentRuntimeStore {
    constructor() {
        this.latest = null;
    }
    async initialize() {
        // No-op today; placeholder for future persistent backing (Redis / Postgres).
        return;
    }
    saveSnapshot(snapshot) {
        this.latest = snapshot;
    }
    getLatestSnapshot() {
        return this.latest;
    }
}
exports.agentRuntimeStore = new AgentRuntimeStore();
//# sourceMappingURL=AgentRuntimeStore.js.map