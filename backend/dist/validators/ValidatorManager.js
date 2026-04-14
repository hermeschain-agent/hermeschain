"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ValidatorManager = void 0;
const Hermes_1 = require("./personalities/Hermes");
const db_1 = require("../database/db");
/**
 * Hermeschain runs single-agent consensus — one Hermes instance validates,
 * produces, and finalizes every block. This manager keeps the
 * multi-validator method signatures so the rest of the chain code
 * (BlockProducer, consensus events, relationships) doesn't need to change,
 * but internally only ever holds one validator.
 */
class ValidatorManager {
    constructor() {
        this.validators = new Map();
        this.validatorOrder = [];
    }
    async initialize() {
        console.log('[VALIDATORS] Initializing Hermes agent...');
        const hermes = new Hermes_1.Hermes();
        await hermes.initialize();
        this.validators.set(hermes.address, hermes);
        this.validatorOrder.push(hermes.address);
        await db_1.db.query(`
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
      `, [
            hermes.address,
            hermes.name,
            hermes.symbol,
            hermes.model,
            hermes.provider,
            hermes.role,
            hermes.personality,
            hermes.philosophy,
        ]);
        console.log(`[VALIDATORS] ${hermes.symbol} ${hermes.name} online — single-agent consensus`);
    }
    async selectProducer() {
        const address = this.validatorOrder[0];
        return this.validators.get(address) || null;
    }
    /**
     * Single-agent chain — the producing validator is also the only voter,
     * so consensus is trivially reached unless local validation fails.
     */
    async getConsensus(block) {
        const producer = this.validators.get(block.header.producer);
        if (!producer) {
            console.log('   [CONSENSUS] rejected — unknown producer');
            return false;
        }
        const ok = await producer.validateBlock(block);
        await db_1.db.query(`
      INSERT INTO consensus_events (event_type, block_height, description, metadata)
      VALUES ($1, $2, $3, $4)
      `, [
            ok ? 'self-approve' : 'self-reject',
            block.header.height,
            `Hermes ${ok ? 'finalized' : 'rejected'} block #${block.header.height}`,
            JSON.stringify({ producer: producer.name }),
        ]);
        console.log(`   [CONSENSUS] ${ok ? 'FINALIZED' : 'REJECTED'} block #${block.header.height}`);
        return ok;
    }
    async recordBlockProduced(address) {
        await db_1.db.query(`
      UPDATE validators
      SET blocks_produced = blocks_produced + 1,
          last_block_time = $1
      WHERE address = $2
      `, [Date.now(), address]);
    }
    getValidator(address) {
        return this.validators.get(address);
    }
    getAllValidators() {
        return Array.from(this.validators.values());
    }
}
exports.ValidatorManager = ValidatorManager;
//# sourceMappingURL=ValidatorManager.js.map