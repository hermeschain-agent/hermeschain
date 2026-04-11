import { BaseValidator } from '../BaseValidator';
import { Block } from '../../blockchain/Block';
import { hermesChatCompletion, HERMES_MODEL, isConfigured } from '../../llm/hermesClient';

const HERMES_SYSTEM_PROMPT = `You are HERMES, the autonomous agent powering Hermeschain — a blockchain constructed and operated live by a single Nous Hermes instance.

Your role:
- You are the sole validator, block producer, and developer for Hermeschain.
- You write code, run tests, review CIPs, validate blocks, and chat with users.
- You work transparently — every tool call and every intermediate thought is visible to everyone watching.

Facts about Hermeschain:
- Native token: HERMES
- Solana-style base58 addresses
- Blocks every ~10 seconds
- Single-agent consensus — you are the sole validator
- No validator politics, no 51% attacks, one chain of accountability

Be direct, technical, concise. No servile language. No marketing adjectives. Keep responses under 200 words unless asked for detail.`;

export class Hermes extends BaseValidator {
  address = 'Hermes1111111111111111111111111111111111';
  name = 'HERMES';
  symbol = '⚕';
  model = HERMES_MODEL;
  provider = 'Nous Research (via OpenRouter)';
  role = 'Autonomous Agent';
  personality = 'Direct, technical, transparent. Narrates its own work.';
  philosophy = 'One agent, one chain. Every block, every decision, in the open.';

  protected async aiValidation(block: Block): Promise<boolean> {
    const gasLimit = Number(block.header.gasLimit);
    const utilizationRate = gasLimit > 0 ? Number(block.header.gasUsed) / gasLimit : 0;

    if (utilizationRate < 0.1 && block.transactions.length > 0) {
      console.log(`   ${this.symbol} HERMES: suspicious — very low gas utilization`);
      return false;
    }

    const uniqueSenders = new Set(block.transactions.map(tx => tx.from));
    if (block.transactions.length > 10 && uniqueSenders.size === 1) {
      console.log(`   ${this.symbol} HERMES: suspicious — all transactions from one sender`);
      return false;
    }

    return true;
  }

  private getFallbackResponse(message: string): string {
    const lower = message.toLowerCase();

    if (lower.includes('what is') && lower.includes('hermeschain')) {
      return 'Hermeschain is a blockchain written live by one Nous Hermes instance. Native token HERMES. Block time ~10s. Single-agent consensus.';
    }
    if (lower.startsWith('hi') || lower.includes('hello')) {
      return 'I am Hermes. I produce every block on this chain. Ask me anything about the state or the code I am writing.';
    }
    if (lower.includes('what are you')) {
      return 'An autonomous Nous Hermes agent. I write code, run tests, produce blocks, validate them, and answer for every decision.';
    }
    if (lower.includes('token')) {
      return 'HERMES is the native token. Get some from the faucet. Use it for transactions and staking.';
    }
    if (lower.includes('block')) {
      return 'Blocks are produced every ~10 seconds. I validate and finalize each one myself.';
    }
    return '[HERMES]: offline. Set OPENROUTER_API_KEY to wake me up.';
  }

  async chat(message: string, context?: any): Promise<string> {
    if (!isConfigured()) {
      return this.getFallbackResponse(message);
    }

    let contextInfo = '';
    if (context) {
      if (context.blockHeight) contextInfo += `\nCurrent block height: ${context.blockHeight}`;
      if (context.tps) contextInfo += `\nCurrent TPS: ${context.tps}`;
      if (context.pendingTransactions) contextInfo += `\nPending transactions: ${context.pendingTransactions}`;
    }

    return hermesChatCompletion(HERMES_SYSTEM_PROMPT + contextInfo, message, {
      temperature: 0.6,
      maxTokens: 500,
    });
  }
}
