import { Block } from '../blockchain/Block';
import { BaseValidator } from './BaseValidator';
import { Hermes } from './personalities/Hermes';
import { db } from '../database/db';
import { eventBus } from '../events/EventBus';

/**
 * Multi-validator consensus. Producer rotates by `height mod n`.
 * Finalization requires a 2/3 quorum of approvals across registered
 * validators. Single-validator mode (n=1) still works — threshold of
 * ceil(1 * 2/3) = 1, so Hermes-only chains finalize exactly like before.
 */
export class ValidatorManager {
  private validators: Map<string, BaseValidator> = new Map();
  private validatorOrder: string[] = [];

  async initialize() {
    console.log('[VALIDATORS] Initializing Hermes agent...');

    const hermes = new Hermes();
    await hermes.initialize();
    await this.addValidator(hermes);

    console.log(`[VALIDATORS] ${hermes.symbol} ${hermes.name} online — ${this.validatorOrder.length}-validator consensus`);
  }

  async addValidator(personality: BaseValidator): Promise<void> {
    if (this.validators.has(personality.address)) return;
    this.validators.set(personality.address, personality);
    this.validatorOrder.push(personality.address);

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
        personality.address,
        personality.name,
        personality.symbol,
        personality.model,
        personality.provider,
        personality.role,
        personality.personality,
        personality.philosophy,
      ],
    );
  }

  async selectProducer(nextHeight?: number): Promise<BaseValidator | null> {
    if (this.validatorOrder.length === 0) return null;
    const idx = typeof nextHeight === 'number'
      ? ((nextHeight % this.validatorOrder.length) + this.validatorOrder.length) % this.validatorOrder.length
      : 0;
    const address = this.validatorOrder[idx];
    return this.validators.get(address) || null;
  }

  /**
   * Quorum: each registered validator runs validateBlock; we need
   * ceil(n * 2/3) approvals. n=1 means 1 approval required (self-approve
   * equivalent). n=2 means 2. n=3 means 2. Etc.
   */
  async getConsensus(block: Block): Promise<boolean> {
    const producer = this.validators.get(block.header.producer);
    if (!producer) {
      console.log('   [CONSENSUS] rejected — unknown producer');
      return false;
    }

    const total = this.validatorOrder.length;
    const required = Math.ceil((total * 2) / 3);

    const votes = await Promise.all(
      this.validatorOrder.map(async (addr) => {
        const v = this.validators.get(addr)!;
        try {
          const ok = await v.validateBlock(block);
          return { addr, name: v.name, ok };
        } catch (err: any) {
          console.log(`   [CONSENSUS] validator ${v.name} threw: ${err?.message || err}`);
          return { addr, name: v.name, ok: false };
        }
      }),
    );

    const approvals = votes.filter((v) => v.ok).length;
    const finalized = approvals >= required;

    for (const vote of votes) {
      console.log(`   [CONSENSUS] ${vote.name}: ${vote.ok ? 'APPROVE' : 'REJECT'}`);
    }

    await db.query(
      `
      INSERT INTO consensus_events (event_type, block_height, description, metadata)
      VALUES ($1, $2, $3, $4)
      `,
      [
        finalized ? 'quorum-approve' : 'quorum-reject',
        block.header.height,
        `Block #${block.header.height} ${finalized ? 'finalized' : 'rejected'} (${approvals}/${total}, required ${required})`,
        JSON.stringify({
          producer: producer.name,
          approvals,
          required,
          total,
          votes: votes.map((v) => ({ name: v.name, ok: v.ok })),
        }),
      ],
    );

    eventBus.emit('consensus_quorum', {
      blockHeight: block.header.height,
      approvals,
      required,
      total,
      finalized,
    });

    console.log(
      `   [CONSENSUS] ${finalized ? 'FINALIZED' : 'REJECTED'} block #${block.header.height} (${approvals}/${total}, req ${required})`,
    );
    return finalized;
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
