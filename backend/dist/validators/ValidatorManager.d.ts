import { Block } from '../blockchain/Block';
import { BaseValidator } from './BaseValidator';
/**
 * Multi-validator consensus. Producer rotates by `height mod n`.
 * Finalization requires a 2/3 quorum of approvals across registered
 * validators. Single-validator mode (n=1) still works — threshold of
 * ceil(1 * 2/3) = 1, so Hermes-only chains finalize exactly like before.
 */
export declare class ValidatorManager {
    private validators;
    private validatorOrder;
    initialize(): Promise<void>;
    addValidator(personality: BaseValidator): Promise<void>;
    selectProducer(nextHeight?: number): Promise<BaseValidator | null>;
    /**
     * Quorum: each registered validator runs validateBlock; we need
     * ceil(n * 2/3) approvals. n=1 means 1 approval required (self-approve
     * equivalent). n=2 means 2. n=3 means 2. Etc.
     */
    getConsensus(block: Block): Promise<boolean>;
    recordBlockProduced(address: string): Promise<void>;
    getValidator(address: string): BaseValidator | undefined;
    getAllValidators(): BaseValidator[];
}
//# sourceMappingURL=ValidatorManager.d.ts.map