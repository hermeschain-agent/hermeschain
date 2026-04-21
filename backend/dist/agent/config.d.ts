import { AgentConfig } from './types';
export type { AgentConfig } from './types';
export declare function getDefaultWriteScopes(): string[];
export declare function getWriteScopes(config?: Pick<AgentConfig, 'canWriteScopes'> | null): string[];
export declare function resolveRepoRoot(startDir?: string): string | null;
export declare function createAgentConfig(startDir?: string): AgentConfig;
//# sourceMappingURL=config.d.ts.map