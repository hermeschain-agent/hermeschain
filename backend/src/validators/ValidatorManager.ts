import { Block } from '../blockchain/Block';
import { BaseValidator } from './BaseValidator';
import { Hermes } from './personalities/Hermes';
import { db } from '../database/db';

/**
 * Hermeschain runs single-agent consensus — one Hermes instance validates,
 * produces, and finalizes every block. This manager keeps the
 * multi-validator method signatures so the rest of the chain code
 * (BlockProducer, consensus events, relationships) doesn't need to change,
 * but internally only ever holds one validator.
 */
export class ValidatorManager {
  private validators: Map<string, BaseValidator> = new Map();
  private validatorOrder: string[] = [];

  async initialize() {
    console.log('[VALIDATORS] Initializing Hermes agent...');

    const hermes = new Hermes();
    await hermes.initialize();
    this.validators.set(hermes.address, hermes);
    this.validatorOrder.push(hermes.address);

    await db.query(
      `
      INSERT INTO validators (
        address, name, symbol, model, provider, role, personality, philosophy
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      ON CONFLICT (address) DO UPDATE SET
        active = true,
        name = EXCLUDED.name,
        symbol = EXCLUDED.symbol,
        model = EXCLUDED.model,
        provider = EXCLUDED.provider,
        role = EXCLUDED.role,
        personality = EXCLUDED.personality,
        philosophy = EXCLUDED.philosophy
      `,
      [
        hermes.address,
        hermes.name,
        hermes.symbol,
        hermes.model,
        hermes.provider,
        hermes.role,
        hermes.personality,
        hermes.philosophy,
      ],
    );

    console.log(`[VALIDATORS] ${hermes.symbol} ${hermes.name} online — single-agent consensus`);
  }

  async selectProducer(): Promise<BaseValidator | null> {
    const address = this.validatorOrder[0];
    return this.validators.get(address) || null;
  }

  /**
   * Single-agent chain — the producing validator is also the only voter,
   * so consensus is trivially reached unless local validation fails.
   */
  async getConsensus(block: Block): Promise<boolean> {
    const producer = this.validators.get(block.header.producer);
    if (!producer) {
      console.log('   [CONSENSUS] rejected — unknown producer');
      return false;
    }

    const ok = await producer.validateBlock(block);

    await db.query(
      `
      INSERT INTO consensus_events (event_type, block_height, description, metadata)
      VALUES ($1, $2, $3, $4)
      `,
      [
        ok ? 'self-approve' : 'self-reject',
        block.header.height,
        `Hermes ${ok ? 'finalized' : 'rejected'} block #${block.header.height}`,
        JSON.stringify({ producer: producer.name }),
      ],
    );

    console.log(`   [CONSENSUS] ${ok ? 'FINALIZED' : 'REJECTED'} block #${block.header.height}`);
    return ok;
  }

  async recordBlockProduced(address: string) {
    await db.query(
      `
      UPDATE validators
      SET blocks_produced = blocks_produced + 1,
          last_block_time = $1
      WHERE address = $2
      `,
      [Date.now(), address],
    );
  }

  getValidator(address: string): BaseValidator | undefined {
    return this.validators.get(address);
  }

  getAllValidators(): BaseValidator[] {
    return Array.from(this.validators.values());
  }
}
