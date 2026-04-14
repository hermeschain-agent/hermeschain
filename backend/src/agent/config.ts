import * as fs from 'fs';
import * as path from 'path';
import { isConfigured } from '../llm/hermesClient';
import { AgentConfig, AgentEffectiveMode, AgentMode } from './types';

export type { AgentConfig } from './types';

const DEFAULT_REAL_WRITE_ALLOWLIST = [
  'backend/src/',
  'backend/tests/',
  'backend/docs/',
  'backend/package.json',
  'backend/tsconfig.json',
  'frontend/src/',
];

export function getDefaultWriteScopes(): string[] {
  return DEFAULT_REAL_WRITE_ALLOWLIST.slice();
}

export function getWriteScopes(
  config?: Pick<AgentConfig, 'canWriteScopes'> | null
): string[] {
  return (config?.canWriteScopes || []).map((scope) => scope.replace(/\\/g, '/'));
}

function isRepoRoot(candidate: string): boolean {
  return (
    fs.existsSync(path.join(candidate, '.git')) &&
    fs.existsSync(path.join(candidate, 'backend', 'package.json')) &&
    fs.existsSync(path.join(candidate, 'frontend'))
  );
}

export function resolveRepoRoot(startDir: string = process.cwd()): string | null {
  let current = path.resolve(startDir);

  while (true) {
    if (isRepoRoot(current)) {
      return current;
    }

    const parent = path.dirname(current);
    if (parent === current) {
      return null;
    }
    current = parent;
  }
}

export function createAgentConfig(startDir: string = process.cwd()): AgentConfig {
  const autorunEnabled = process.env.AGENT_AUTORUN !== 'false';
  const repoRoot = resolveRepoRoot(startDir);
  const repoRootHealth = repoRoot ? 'ready' : 'missing';
  const projectPaths = {
    backend: repoRoot ? path.join(repoRoot, 'backend') : null,
    frontend: repoRoot ? path.join(repoRoot, 'frontend') : null,
  };
  const modelConfigured = isConfigured();
  const requestedMode: AgentMode =
    process.env.AGENT_MODE === 'demo'
      ? 'demo'
      : process.env.AGENT_MODE === 'real'
        ? 'real'
        : modelConfigured
          ? 'real'
          : 'demo';
  const startupIssues: string[] = [];

  if (!repoRoot) {
    startupIssues.push('Repository root could not be resolved.');
  }

  if (requestedMode === 'real' && !modelConfigured) {
    startupIssues.push('OPENROUTER_API_KEY is missing, so real mode cannot call the model.');
  }

  const canWriteScopes = repoRoot ? getDefaultWriteScopes() : [];

  let effectiveMode: AgentEffectiveMode = 'disabled';

  if (autorunEnabled) {
    if (requestedMode === 'real') {
      effectiveMode =
        repoRoot && modelConfigured && canWriteScopes.length > 0 ? 'real' : 'disabled';
    } else {
      effectiveMode = 'demo';
    }
  }

  return {
    autorunEnabled,
    requestedMode,
    effectiveMode,
    repoRoot,
    repoRootHealth,
    projectPaths,
    modelConfigured,
    canWriteScopes,
    startupIssues,
  };
}
