/**
 * PacedPusher — runs inside the Railway worker process. Every PUSH_INTERVAL_MS
 * (default 24min = 60/day), fetches origin and advances refs/heads/main by
 * one commit drawn from origin/PUSH_BRANCH (default tier-3-backlog).
 *
 * Disabled by default. Activate by setting:
 *   PACED_PUSH_ENABLED=true
 *   GITHUB_TOKEN=<token with repo write>
 *
 * Optional:
 *   PUSH_BRANCH=tier-3-backlog
 *   PUSH_TARGET=main
 *   PUSH_REMOTE=origin
 *   PUSH_BATCH=1
 *   PUSH_INTERVAL_MS=1440000   (24 minutes)
 *   POINTER_FILE=data/push_pointer.txt
 */
export declare class PacedPusher {
    private interval;
    private repoRoot;
    private pointerFile;
    private branch;
    private target;
    private remote;
    private batch;
    private intervalMs;
    constructor(repoRoot: string);
    start(): void;
    stop(): void;
    private git;
    private listForwardCommits;
    private readPointer;
    private writePointer;
    private tick;
}
//# sourceMappingURL=PacedPusher.d.ts.map