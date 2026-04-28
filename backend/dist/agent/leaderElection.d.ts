import Redis from 'ioredis';
export interface LeaderHandle {
    isLeader(): boolean;
    release(): Promise<void>;
}
export declare function startLeaderElection(redis: Redis, leaseId: string, onAcquire: () => void, onLose: () => void): Promise<LeaderHandle>;
//# sourceMappingURL=leaderElection.d.ts.map