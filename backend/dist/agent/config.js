"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.getDefaultWriteScopes = getDefaultWriteScopes;
exports.getWriteScopes = getWriteScopes;
exports.resolveRepoRoot = resolveRepoRoot;
exports.createAgentConfig = createAgentConfig;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const hermesClient_1 = require("../llm/hermesClient");
const DEFAULT_REAL_WRITE_ALLOWLIST = [
    'backend/src/',
    'backend/tests/',
    'backend/docs/',
    'backend/package.json',
    'backend/tsconfig.json',
    'frontend/src/',
];
function getDefaultWriteScopes() {
    return DEFAULT_REAL_WRITE_ALLOWLIST.slice();
}
function getWriteScopes(config) {
    return (config?.canWriteScopes || []).map((scope) => scope.replace(/\\/g, '/'));
}
function isRepoRoot(candidate) {
    return (fs.existsSync(path.join(candidate, '.git')) &&
        fs.existsSync(path.join(candidate, 'backend', 'package.json')) &&
        fs.existsSync(path.join(candidate, 'frontend')));
}
function resolveRepoRoot(startDir = process.cwd()) {
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
function createAgentConfig(startDir = process.cwd()) {
    const autorunEnabled = process.env.AGENT_AUTORUN !== 'false';
    const role = process.env.AGENT_ROLE === 'worker' ? 'worker' : 'web';
    const repoRoot = resolveRepoRoot(startDir);
    const workspaceReady = !!repoRoot;
    const repoRootHealth = repoRoot ? 'ready' : 'missing';
    const projectPaths = {
        backend: repoRoot ? path.join(repoRoot, 'backend') : null,
        frontend: repoRoot ? path.join(repoRoot, 'frontend') : null,
    };
    const modelConfigured = (0, hermesClient_1.isConfigured)();
    const gitAvailable = repoRoot
        ? fs.existsSync(path.join(repoRoot, '.git'))
        : false;
    const pushAvailable = gitAvailable && process.env.AUTO_GIT_PUSH === 'true';
    const requestedMode = process.env.AGENT_MODE === 'demo'
        ? 'demo'
        : process.env.AGENT_MODE === 'real'
            ? 'real'
            : modelConfigured
                ? 'real'
                : 'demo';
    const startupIssues = [];
    if (!repoRoot) {
        startupIssues.push('Repository root could not be resolved.');
    }
    if (requestedMode === 'real' && !modelConfigured) {
        startupIssues.push('OPENROUTER_API_KEY is missing, so real mode cannot call the model.');
    }
    if (workspaceReady && !gitAvailable) {
        startupIssues.push('Git metadata is unavailable. Hermes can still reason, but commit/push will be skipped.');
    }
    const canWriteScopes = repoRoot ? getDefaultWriteScopes() : [];
    let effectiveMode = 'disabled';
    if (autorunEnabled) {
        if (requestedMode === 'real') {
            effectiveMode =
                repoRoot && modelConfigured && canWriteScopes.length > 0 ? 'real' : 'disabled';
        }
        else {
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
    };
}
//# sourceMappingURL=config.js.map