# Consensus Failure Investigation - Block Height Sequence Invalid

## Summary
Block 1 failed consensus validation due to an unreasonable timestamp gap from its parent block. The block references parent hash `GkX5bJxSD3FspdqPMfBkwm9wNAt4Scv8WtZwQuNiWwW8` (height 0, timestamp 2026-04-14) but has timestamp 2026-04-17, creating a 259+ million millisecond gap (~3 days). This violates the expected consensus timing for a Solana-like blockchain operating at ~400ms block times (configured target: 10 seconds). The heuristic validation in `AIValidator.ts` correctly identified the height sequence and parent hash match, but failed to detect the anomalous timestamp gap as a consensus violation.

## Root Cause
The `heuristicValidation()` function in `backend/src/blockchain/AIValidator.ts` (lines 220-252) performs basic checks for timestamp ordering, height sequence, and parent hash matching, but **lacks validation for unreasonable inter-block timing**. The function only verifies that `block.header.timestamp > previousBlock.header.timestamp`, but does not check whether the gap is within acceptable bounds for the network's consensus parameters. A 3-day gap between blocks is physically impossible for a blockchain with 10-second target block times and indicates either:
1. Clock skew or manipulation in block production
2. Corrupted block data
3. A fork/reorg that wasn't properly handled

## Concrete Next Steps

### 1. Add Timestamp Gap Validation to Heuristic Validator
**File:** `backend/src/blockchain/AIValidator.ts`
**Change:** Add a check in the `heuristicValidation()` function to validate that the timestamp gap between consecutive blocks is within acceptable bounds (e.g., 1-60 seconds for normal operation, with a maximum threshold of 5 minutes for network delays).

**Implementation:**
- Define `MAX_BLOCK_TIME_GAP` constant (e.g., 300000ms = 5 minutes)
- Add validation: `if (block.header.timestamp - previousBlock.header.timestamp > MAX_BLOCK_TIME_GAP)`
- Mark as invalid and add warning: "Timestamp gap exceeds maximum allowed block time"

### 2. Add Timestamp Gap Validation to AI Validator Prompt
**File:** `backend/src/blockchain/AIValidator.ts`
**Change:** Include timestamp gap analysis in the AI validation prompt to ensure the LLM-based validator also flags unreasonable gaps.

### 3. Update Consensus Configuration
**File:** `backend/src/blockchain/Consensus.ts`
**Change:** Export the `TARGET_BLOCK_TIME` and add a `MAX_BLOCK_TIME_GAP` constant to the CONFIG object for use by validators.

## Risk Assessment
- **Low Risk:** These changes are defensive validations that prevent invalid blocks from entering consensus
- **Verification:** Build backend with `npm run build` and run consensus tests to ensure blocks with reasonable timestamps pass and blocks with 3+ day gaps are rejected
