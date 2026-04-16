import { Block, Transaction } from './Block';
import { stateManager } from './StateManager';
import { hermesChat, isConfigured } from '../llm/hermesClient';

// AI validation result
export interface AIValidationResult {
  valid: boolean;
  confidence: number;  // 0-1
  reasoning: string;
  warnings: string[];
  flags: {
    suspiciousPattern: boolean;
    unusualGasUsage: boolean;
    potentialAttack: boolean;
    stateInconsistency: boolean;
  };
}

// Validation cache to avoid re-validating same blocks
const validationCache = new Map<string, AIValidationResult>();

// Analyze transactions for suspicious patterns
function analyzeTransactions(transactions: Transaction[]): {
  summary: string;
  concerns: string[];
} {
  const concerns: string[] = [];
  
  // Check for wash trading (same from/to with slight variations)
  const fromAddresses = new Set(transactions.map(tx => tx.from));
  const toAddresses = new Set(transactions.map(tx => tx.to));
  const overlap = [...fromAddresses].filter(a => toAddresses.has(a));
  if (overlap.length > transactions.length * 0.3) {
    concerns.push('High overlap between senders and receivers - possible wash trading');
  }
  
  // Check for identical transaction patterns
  const valueFrequency = new Map<string, number>();
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
export async function validateBlockWithAI(
  block: Block,
  previousBlock: Block | null
): Promise<AIValidationResult> {
  // Check cache first
  const cached = validationCache.get(block.header.hash);
  if (cached) {
    return cached;
  }
  
  // If no API key, use heuristic validation
  if (!isConfigured()) {
    console.log('[AI] No ANTHROPIC_API_KEY — using heuristic validation');
    return heuristicValidation(block, previousBlock);
  }
  
  try {
    const txAnalysis = analyzeTransactions(block.transactions);
    const stateRoot = stateManager.getStateRoot();
    
    const prompt = `You are an AI validator for Hermeschain, a Solana-style blockchain. Analyze this block and determine if it should be accepted.

BLOCK DATA:
- Height: ${block.header.height}
- Hash: ${block.header.hash}
- Parent Hash: ${block.header.parentHash}
- Producer: ${block.header.producer}
- Timestamp: ${new Date(block.header.timestamp).toISOString()}
- Gas Used: ${block.header.gasUsed}
- State Root: ${block.header.stateRoot}
- Transaction Summary: ${txAnalysis.summary}

ANALYSIS CONCERNS:
${txAnalysis.concerns.length > 0 ? txAnalysis.concerns.join('\n') : 'None detected'}

${previousBlock ? `PREVIOUS BLOCK:
- Height: ${previousBlock.header.height}
- Hash: ${previousBlock.header.hash}
- Timestamp: ${new Date(previousBlock.header.timestamp).toISOString()}
- Time since last block: ${block.header.timestamp - previousBlock.header.timestamp}ms` : 'This is the first block after genesis.'}

CURRENT STATE ROOT: ${stateRoot}

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
      const data = await hermesChat({
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.1,
        maxTokens: 500,
      });
      text = data.choices?.[0]?.message?.content?.toString() || '';
    } catch (apiErr) {
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
    
    const result: AIValidationResult = {
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
    
  } catch (error) {
    console.error('[AI] Validation error:', error);
    return heuristicValidation(block, previousBlock);
  }
}

// Heuristic validation when AI is unavailable
function heuristicValidation(
  block: Block,
  previousBlock: Block | null
): AIValidationResult {
  const warnings: string[] = [];
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
  
  const result: AIValidationResult = {
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
export function clearValidationCache(): void {
  validationCache.clear();
  console.log('[AI] Validation cache cleared');
}

// Get validation stats
export function getValidationStats(): {
  cachedBlocks: number;
  validBlocks: number;
  invalidBlocks: number;
} {
  const results = Array.from(validationCache.values());
  return {
    cachedBlocks: results.length,
    validBlocks: results.filter(r => r.valid).length,
    invalidBlocks: results.filter(r => !r.valid).length
  };
}

console.log('[AI] AI Validator loaded', isConfigured() ? '(Hermes via Anthropic)' : '(heuristic mode)');
