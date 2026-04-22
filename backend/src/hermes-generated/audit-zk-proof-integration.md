# Audit: Zero-Knowledge Proof Integration

**Task:** phase-11 / zk-proofs / step-1 (audit)
**Scope:** future `backend/src/zk/`

## Why zk on Hermeschain

Three concrete use cases:

1. **Private transactions** — sender, receiver, and amount hidden from the chain while still verifying conservation of funds.
2. **Compressed state proofs** — succinct proofs that a block header is the correct head given genesis + a bounded chain of state transitions.
3. **Off-chain computation verification** — a contract accepts a zk-proof that an expensive computation was done correctly off-chain.

## Target primitives (step-2+)

- Groth16 verifier (Ethereum pairing-friendly BN254 curve).
- Poseidon hash (zk-SNARK-friendly replacement for keccak in constraint-friendly contexts).
- Precompiled contract slots `0x08` (BN254 pairing) and `0x09` (Poseidon) exposed to the VM.

## Cost model

- Verifying a Groth16 proof is ~200k gas (dominated by the BN254 pairing).
- Poseidon hash per input is ~5k gas vs keccak's 30 base + 6 per word.

## Proof-submission flow

User generates a proof off-chain (using a proving key bundled with their frontend). Submits a tx with the proof as `data`. A verifier contract decodes + calls the precompile.

## Privacy caveat

Hermeschain has no native shielded-pool primitive. Private-tx support needs a circuit + merkle-tree-of-commitments + a nullifier set. This is the Zcash/Tornado pattern. Multi-year workstream.

## Non-goals for v1

- No PLONK / Halo / STARKs — one proving system at a time; Groth16 is the best-understood.
- No recursive proofs — requires a second curve and significant VM work.
- No fully on-chain proving — far too expensive.

## Rollout

1. Audit (this commit).
2. Add BN254 + Poseidon precompiles.
3. Verifier-contract reference implementation.
4. Shielded-pool circuit (long runway).
