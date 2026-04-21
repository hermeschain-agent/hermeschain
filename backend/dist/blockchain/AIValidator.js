"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.validateBlockWithAI = validateBlockWithAI;
exports.clearValidationCache = clearValidationCache;
exports.getValidationStats = getValidationStats;
const StateManager_1 = require("./StateManager");
const hermesClient_1 = require("../llm/hermesClient");
// Validation cache to avoid re-validating same blocks
const validationCache = new Map();
// Analyze transactions for suspicious patterns
function analyzeTransactions(transactions) {
    const concerns = [];
    // Check for wash trading (same from/to with slight variations)
    const fromAddresses = new Set(transactions.map(tx => tx.from));
    const toAddresses = new Set(transactions.map(tx => tx.to));
    const overlap = [...fromAddresses].filter(a => toAddresses.has(a));
    if (overlap.length > transactions.length * 0.3) {
        concerns.push('High overlap between senders and receivers - possible wash trading');
    }
    // Check for identical transaction patterns
    const valueFrequency = new Map();
    for (const tx of transactions) {
        const key = tx.value.toString();
        valueFrequency.set(key, (valueFrequency.get(key) || 0) + 1);
    }
    const maxFreq = Math.max(...valueFrequency.values());
    if (maxFreq > transactions.length * 0.5 && transactions.length > 5) {
        concerns.push('Many transactions with identical values - possible bot activity');
    }
    // Check gas prices
    const gasPrices = transactions.map(tx => tx.gasPrice);
    const avgGas = gasPrices.reduce((a, b) => a + b, 0n) / BigInt(gasPrices.length || 1);
    const highGas = gasPrices.filter(g => g > avgGas * 10n);
    if (highGas.length > 0) {
        concerns.push(`${highGas.length} transactions with unusually high gas prices`);
    }
    // Summary
    const totalValue = transactions.reduce((sum, tx) => sum + tx.value, 0n);
    const summary = `${transactions.length} transactions, total value: ${totalValue.toString()}, unique senders: ${fromAddresses.size}`;
    return { summary, concerns };
}
// Validate block using AI
async function validateBlockWithAI(block, previousBlock) {
    // Check cache first
    const cached = validationCache.get(block.header.hash);
    if (cached) {
        return cached;
    }
    // If no API key, use heuristic validation
    if (!(0, hermesClient_1.isConfigured)()) {
        console.log('[AI] No ANTHROPIC_API_KEY — using heuristic validation');
        return heuristicValidation(block, previousBlock);
    }
    try {
        const txAnalysis = analyzeTransactions(block.transactions);
        const stateRoot = StateManager_1.stateManager.getStateRoot();
        const prompt = `You are the AI validator for Hermeschain. Decide if the given block should be accepted.

IMPORTANT CONTEXT — do NOT flag these as suspicious:
- The genesis block's timestamp is fixed at chain creation time and can be days or weeks before the next block. A large gap between Block 0 (genesis) and Block 1 is NORMAL for a fresh or restarted chain.
- Time-of-day, restart gaps, and historical timestamps are not attack vectors.
- Block heights always increase by 1 per block. "Block 1 referencing Block 0 as parent" is the correct structure of every blockchain on earth — this is NOT invalid.
- Block producer is always the Hermes system account on this chain; that is by design.
- Empty blocks (no transactions) are expected during low-activity periods.

ONLY flag a block as INVALID if you detect ONE of these:
- Parent hash does not match the previous block's hash (only when previous block is supplied).
- State root is malformed (empty or structurally wrong).
- Transaction data contains an obvious exploit signature (double-spend, reentrancy, impossible signature).

BLOCK DATA:
- Height: ${block.header.height}
- Hash: ${block.header.hash}
- Parent Hash: ${block.header.parentHash}
- Producer: ${block.header.producer}
- Timestamp: ${new Date(block.header.timestamp).toISOString()}
- Gas Used: ${block.header.gasUsed}
- State Root: ${block.header.stateRoot}
- Transaction Summary: ${txAnalysis.summary}

ANALYSIS CONCERNS (from static analysis, may be informational):
${txAnalysis.concerns.length > 0 ? txAnalysis.concerns.join('\n') : 'None detected'}

${previousBlock ? `PREVIOUS BLOCK:
- Height: ${previousBlock.header.height}
- Hash: ${previousBlock.header.hash}
- Timestamp: ${new Date(previousBlock.header.timestamp).toISOString()}
- Time since last block: ${block.header.timestamp - previousBlock.header.timestamp}ms (informational — do NOT reject purely on time gap)` : 'This is the first block after genesis. DO NOT reject based on the time gap from genesis.'}

CURRENT STATE ROOT: ${stateRoot}

Default to valid:true unless you have concrete evidence of one of the three INVALID conditions above.

Respond with a JSON object (no markdown):
{
  "valid": boolean,
  "confidence": number between 0 and 1,
  "reasoning": "brief explanation",
  "warnings": ["array of any warnings"],
  "suspiciousPattern": boolean,
  "unusualGasUsage": boolean,
  "potentialAttack": boolean,
  "stateInconsistency": boolean
}`;
        let text = '';
        try {
            const data = await (0, hermesClient_1.hermesChat)({
                messages: [{ role: 'user', content: prompt }],
                temperature: 0.1,
                maxTokens: 500,
            });
            text = data.choices?.[0]?.message?.content?.toString() || '';
        }
        catch (apiErr) {
            console.error('[AI] Hermes API error, falling back to heuristic:', apiErr);
            return heuristicValidation(block, previousBlock);
        }
        // Parse JSON response
        const jsonMatch = text.match(/\{[\s\S]*\}/);
        if (!jsonMatch) {
            console.error('[AI] Failed to parse Hermes response, falling back to heuristic');
            return heuristicValidation(block, previousBlock);
        }
        const parsed = JSON.parse(jsonMatch[0]);
        const result = {
            valid: parsed.valid ?? true,
            confidence: parsed.confidence ?? 0.8,
            reasoning: parsed.reasoning || 'AI validation completed',
            warnings: parsed.warnings || [],
            flags: {
                suspiciousPattern: parsed.suspiciousPattern ?? false,
                unusualGasUsage: parsed.unusualGasUsage ?? false,
                potentialAttack: parsed.potentialAttack ?? false,
                stateInconsistency: parsed.stateInconsistency ?? false
            }
        };
        // Cache result
        validationCache.set(block.header.hash, result);
        console.log(`[AI] Block ${block.header.height} validation: ${result.valid ? 'VALID' : 'INVALID'} (${(result.confidence * 100).toFixed(0)}% confidence)`);
        if (result.warnings.length > 0) {
            console.log(`[AI] Warnings: ${result.warnings.join(', ')}`);
        }
        return result;
    }
    catch (error) {
        console.error('[AI] Validation error:', error);
        return heuristicValidation(block, previousBlock);
    }
}
// Heuristic validation when AI is unavailable
function heuristicValidation(block, previousBlock) {
    const warnings = [];
    let valid = true;
    // Check timestamp
    if (previousBlock && block.header.timestamp <= previousBlock.header.timestamp) {
        valid = false;
        warnings.push('Timestamp not greater than previous block');
    }
    // Check height
    if (previousBlock && block.header.height !== previousBlock.header.height + 1) {
        valid = false;
        warnings.push('Height mismatch');
    }
    // Check parent hash
    if (previousBlock && block.header.parentHash !== previousBlock.header.hash) {
        valid = false;
        warnings.push('Parent hash mismatch');
    }
    // Check gas limit
    if (block.header.gasUsed > block.header.gasLimit) {
        valid = false;
        warnings.push('Gas used exceeds gas limit');
    }
    // Analyze transactions
    const txAnalysis = analyzeTransactions(block.transactions);
    if (txAnalysis.concerns.length > 0) {
        warnings.push(...txAnalysis.concerns);
    }
    // Check for empty producer
    if (!block.header.producer) {
        valid = false;
        warnings.push('No block producer specified');
    }
    const result = {
        valid,
        confidence: valid ? 0.9 : 0.95,
        reasoning: valid ? 'Passed heuristic validation checks' : `Failed: ${warnings.join(', ')}`,
        warnings,
        flags: {
            suspiciousPattern: txAnalysis.concerns.length > 2,
            unusualGasUsage: block.header.gasUsed > block.header.gasLimit * 8n / 10n,
            potentialAttack: !valid,
            stateInconsistency: false
        }
    };
    console.log(`[AI] Heuristic validation: ${result.valid ? 'VALID' : 'INVALID'}`);
    return result;
}
// Clear validation cache (called on chain reorg)
function clearValidationCache() {
    validationCache.clear();
    console.log('[AI] Validation cache cleared');
}
// Get validation stats
function getValidationStats() {
    const results = Array.from(validationCache.values());
    return {
        cachedBlocks: results.length,
        validBlocks: results.filter(r => r.valid).length,
        invalidBlocks: results.filter(r => !r.valid).length
    };
}
console.log('[AI] AI Validator loaded', (0, hermesClient_1.isConfigured)() ? '(Hermes via Anthropic)' : '(heuristic mode)');
//# sourceMappingURL=AIValidator.js.map