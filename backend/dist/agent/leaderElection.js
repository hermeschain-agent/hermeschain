"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.startLeaderElection = startLeaderElection;
/**
 * Worker leader election (TASK-332).
 *
 * Two worker replicas would otherwise both run AgentWorker and produce
 * duplicate commits. We hold a Redis lease keyed by 'hermes:worker:leader'
 * with TTL; the leader renews periodically (atomically, only if it still
 * owns the lease). A follower keeps polling and takes over within ~30s
 * if the leader vanishes.
 */
const LEASE_KEY = 'hermes:worker:leader';
const LEASE_TTL_MS = 30000;
const RENEW_INTERVAL_MS = 10000;
// Atomic compare-and-renew: only EXPIRE if the value still matches.
const RENEW_SCRIPT = `
if redis.call('get', KEYS[1]) == ARGV[1] then
  return redis.call('pexpire', KEYS[1], ARGV[2])
else
  return 0
end
`;
const RELEASE_SCRIPT = `
if redis.call('get', KEYS[1]) == ARGV[1] then
  return redis.call('del', KEYS[1])
else
  return 0
end
`;
async function startLeaderElection(redis, leaseId, onAcquire, onLose) {
    let owner = false;
    let renewTimer = null;
    let pollTimer = null;
    async function tryAcquire() {
        const ok = await redis.set(LEASE_KEY, leaseId, 'PX', LEASE_TTL_MS, 'NX');
        return ok === 'OK';
    }
    async function renew() {
        const result = await redis.eval(RENEW_SCRIPT, 1, LEASE_KEY, leaseId, String(LEASE_TTL_MS));
        return result === 1;
    }
    async function loop() {
        if (!owner) {
            const got = await tryAcquire();
            if (got) {
                owner = true;
                console.log(`[LEADER] acquired lease as ${leaseId}`);
                onAcquire();
                renewTimer = setInterval(async () => {
                    try {
                        const renewed = await renew();
                        if (!renewed) {
                            owner = false;
                            if (renewTimer)
                                clearInterval(renewTimer);
                            renewTimer = null;
                            console.log(`[LEADER] lost lease ${leaseId}`);
                            onLose();
                        }
                    }
                    catch (err) {
                        console.warn(`[LEADER] renew error: ${err?.message || err}`);
                    }
                }, RENEW_INTERVAL_MS);
            }
        }
    }
    // First attempt + repeat for follower mode.
    await loop();
    pollTimer = setInterval(loop, LEASE_TTL_MS);
    if (!owner) {
        console.log(`[LEADER] follower mode (${leaseId})`);
    }
    return {
        isLeader: () => owner,
        async release() {
            if (renewTimer)
                clearInterval(renewTimer);
            if (pollTimer)
                clearInterval(pollTimer);
            if (owner) {
                try {
                    await redis.eval(RELEASE_SCRIPT, 1, LEASE_KEY, leaseId);
                    owner = false;
                    console.log(`[LEADER] released lease ${leaseId}`);
                }
                catch (err) {
                    console.warn(`[LEADER] release error: ${err?.message || err}`);
                }
            }
        },
    };
}
//# sourceMappingURL=leaderElection.js.map