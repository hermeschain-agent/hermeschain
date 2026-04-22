/**
 * Canonical OperatorHealth shape.
 *
 * Step-2 of foundation/operator-health. Groups ten operator-facing
 * fields into four sub-objects so a status payload consumer can
 * traverse one logical tree instead of flat fields.
 */

export interface ChainHealth {
  readonly height: number;
  readonly lastBlockTimestampMs: number | null;
  readonly secondsSinceLastBlock: number | null;
  readonly finalityDepth: number;
}

export interface MempoolHealth {
  readonly pending: number;
  readonly oldestAgeMs: number | null;
}

export interface ValidatorHealth {
  readonly address: string;
  readonly online: boolean;
  readonly lastSeenMs: number | null;
}

export interface AgentHealth {
  readonly heartbeatAgeMs: number | null;
  readonly tokenSpendHour: number;
  readonly tokenSpendDay: number;
  readonly blockedReason: string | null;
  readonly lastFailure: string | null;
}

export interface OperatorHealth {
  readonly chain: ChainHealth;
  readonly mempool: MempoolHealth;
  readonly validators: readonly ValidatorHealth[];
  readonly agent: AgentHealth;
}

export function makeOperatorHealth(input: {
  chain: ChainHealth;
  mempool: MempoolHealth;
  validators: ValidatorHealth[];
  agent: AgentHealth;
}): OperatorHealth {
  return Object.freeze({
    chain: Object.freeze({ ...input.chain }),
    mempool: Object.freeze({ ...input.mempool }),
    validators: Object.freeze(
      input.validators.map((v) => Object.freeze({ ...v })),
    ),
    agent: Object.freeze({ ...input.agent }),
  });
}

/** Is any validator offline? Surfaced in the status chip. */
export function anyValidatorOffline(health: OperatorHealth): boolean {
  return health.validators.some((v) => !v.online);
}

/** Is the chain stale (no new block for >60s)? */
export function chainStale(health: OperatorHealth, thresholdSec = 60): boolean {
  const s = health.chain.secondsSinceLastBlock;
  return s !== null && s > thresholdSec;
}
