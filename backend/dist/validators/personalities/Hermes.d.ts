import { BaseValidator } from '../BaseValidator';
import { Block } from '../../blockchain/Block';
export declare class Hermes extends BaseValidator {
    address: string;
    name: string;
    symbol: string;
    model: string;
    provider: string;
    role: string;
    personality: string;
    philosophy: string;
    protected aiValidation(block: Block): Promise<boolean>;
    private getFallbackResponse;
    chat(message: string, context?: any): Promise<string>;
}
//# sourceMappingURL=Hermes.d.ts.map