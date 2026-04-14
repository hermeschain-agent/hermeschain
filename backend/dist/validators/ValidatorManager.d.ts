import { Block } from '../blockchain/Block';
import { BaseValidator } from './BaseValidator';
/**
 * Hermeschain runs single-agent consensus — one Hermes instance validates,
 * produces, and finalizes every block. This manager keeps the
 * multi-validator method signatures so the rest of the chain code
 * (BlockProducer, consensus events, relationships) doesn't need to change,
 * but internally only ever holds one validator.
 */
export declare class ValidatorManager {
    private validators;
    private validatorOrder;
    initialize(): Promise<void>;
    selectProducer(): Promise<BaseValidator | null>;
    /**
     * Single-agent chain — the producing validator is also the only voter,
     * so consensus is trivially reached unless local validation fails.
     */
    getConsensus(block: Block): Promise<boolean>;
    recordBlockProduced(address: string): Promise<void>;
    getValidator(address: string): BaseValidator | undefined;
    getAllValidators(): BaseValidator[];
}
//# sourceMappingURL=ValidatorManager.d.ts.map