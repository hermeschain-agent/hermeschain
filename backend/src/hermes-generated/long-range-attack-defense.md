# Long-Range Attack Defense

**Task:** phase-04 / long-range / step-1 (audit)
**Scope:** `backend/src/consensus/`

## The attack

An attacker who held majority stake at some past height H can — if they've kept the old signing keys — produce an alternate chain from H forward. If the alternate's GHOST-weighted subtree beats the real chain, honest nodes must choose the attacker's history.

Pure depth-based finality doesn't stop this: the alternate chain can be N blocks deep past H without anyone noticing until it's too late.

## Defenses

### 1. Weak subjectivity (recommended)

A new node is expected to start from a "recent enough" checkpoint — specifically, one signed in the last `WS_WINDOW_BLOCKS` (default 10,000). Software ships with the current checkpoint hash baked in; a node that's been offline longer than `WS_WINDOW_BLOCKS` must manually fetch a new checkpoint from a trusted source (validator set, release page, official doc).

### 2. Fork-choice guardrail

`fork-choice` already refuses to roll back past `lastCheckpointedHeight`. Any long-range alternate chain would need checkpoint signatures — which the attacker can only forge by also compromising 2/3 of the stake at the target height. Given stake is slashed on equivocation, the economic cost is prohibitive.

### 3. Key expiration

Validators rotate keys every `KEY_ROTATION_BLOCKS` (default 50,000). Old keys are revoked on-chain; signatures made with revoked keys are rejected. An attacker who sold off their stake months ago can't resurrect because their old keys are dead.

## Trade-offs

- Weak subjectivity adds a trust anchor (the shipped checkpoint hash). Acceptable because the alternative — pure objective security — isn't achievable in PoS without some real-time assumption.
- Key rotation is operational overhead. Automate via a `rotateKeys` tx that validators submit on a schedule.

## Rollout

1. Pin `WS_WINDOW_BLOCKS` and `KEY_ROTATION_BLOCKS` in `GenesisConfig`.
2. Ship an updated checkpoint with each release.
3. Document weak-subjectivity behavior for node operators.
