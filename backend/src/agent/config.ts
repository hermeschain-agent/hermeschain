import * as fs from 'fs';
import * as path from 'path';
import { isConfigured } from '../llm/hermesClient';
import { AgentConfig, AgentEffectiveMode, AgentMode } from './types';
import { getPublishQueueConfig } from './PublishQueue';

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
  const role: 'web' | 'worker' =
    process.env.AGENT_ROLE === 'worker' ? 'worker' : 'web';
  const publishConfig = getPublishQueueConfig();
  const configuredRepoRoot = process.env.AGENT_REPO_ROOT
    ? path.resolve(process.env.AGENT_REPO_ROOT)
    : null;
  const repoRoot = configuredRepoRoot || resolveRepoRoot(startDir);
  const canBootstrapConfiguredRoot = Boolean(
    configuredRepoRoot &&
    role === 'worker' &&
    publishConfig.autoPushEnabled &&
    process.env.GITHUB_TOKEN &&
    process.env.GITHUB_REPO
  );
  const repoRootLooksReady = repoRoot ? isRepoRoot(repoRoot) : false;
  const workspaceReady = !!repoRoot && (repoRootLooksReady || canBootstrapConfiguredRoot);
  const repoRootHealth = workspaceReady ? 'ready' : 'missing';
  const projectPaths = {
    backend: workspaceReady && repoRoot ? path.join(repoRoot, 'backend') : null,
    frontend: workspaceReady && repoRoot ? path.join(repoRoot, 'frontend') : null,
  };
  const modelConfigured = isConfigured();
  const gitAvailable = repoRoot
    ? fs.existsSync(path.join(repoRoot, '.git'))
    : false;
  const pushAvailable = publishConfig.autoPushEnabled && (gitAvailable || canBootstrapConfiguredRoot);
  const requestedMode: AgentMode =
    process.env.AGENT_MODE === 'demo'
      ? 'demo'
      : process.env.AGENT_MODE === 'real'
        ? 'real'
        : modelConfigured
          ? 'real'
          : 'demo';
  const startupIssues: string[] = [];

  if (!repoRoot || !workspaceReady) {
    startupIssues.push('Repository root could not be resolved.');
  }

  if (requestedMode === 'real' && !modelConfigured) {
    startupIssues.push('ANTHROPIC_API_KEY is missing, so real mode cannot call the model.');
  }

  if (workspaceReady && !gitAvailable && !canBootstrapConfiguredRoot) {
    startupIssues.push(
      'Git metadata is unavailable. Hermes can still reason, but commit/push will be skipped.'
    );
  }

  const canWriteScopes = workspaceReady ? getDefaultWriteScopes() : [];

  let effectiveMode: AgentEffectiveMode = 'disabled';

  if (autorunEnabled) {
    if (requestedMode === 'real') {
      effectiveMode =
        workspaceReady && repoRoot && modelConfigured && canWriteScopes.length > 0 ? 'real' : 'disabled';
    } else {
      effectiveMode = 'demo';
    }
  }

  return {
    role,
    workspaceReady,
    gitAvailable,
    pushAvailable,
    autorunEnabled,
    requestedMode,
    effectiveMode,
    repoRoot,
    repoRootHealth,
    projectPaths,
    modelConfigured,
    canWriteScopes,
    startupIssues,
    queueBranch: publishConfig.queueBranch,
    publishBranch: publishConfig.publishBranch,
    publishIntervalMinutes: publishConfig.intervalMinutes,
    queueResumeThreshold: publishConfig.queueResumeThreshold,
  };
}
