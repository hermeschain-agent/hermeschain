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
exports.agentExecutor = exports.AgentExecutor = exports.AGENT_TOOLS_OAI = exports.AGENT_TOOLS = void 0;
const child_process_1 = require("child_process");
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const EventBus_1 = require("../events/EventBus");
const GitIntegration_1 = require("./GitIntegration");
const BrowserAutomation_1 = require("./BrowserAutomation");
const config_1 = require("./config");
// Tool definitions for Claude
exports.AGENT_TOOLS = [
    {
        name: 'read_file',
        description: 'Read the contents of a file in the Hermeschain codebase',
        input_schema: {
            type: 'object',
            properties: {
                path: {
                    type: 'string',
                    description: 'Relative path to the file from project root'
                }
            },
            required: ['path']
        }
    },
    {
        name: 'write_file',
        description: 'Write content to a file. Creates the file if it doesn\'t exist.',
        input_schema: {
            type: 'object',
            properties: {
                path: {
                    type: 'string',
                    description: 'Relative path to the file from project root'
                },
                content: {
                    type: 'string',
                    description: 'Content to write to the file'
                }
            },
            required: ['path', 'content']
        }
    },
    {
        name: 'run_command',
        description: 'Run a shell command in the project directory. Use for npm, git, or other CLI tools.',
        input_schema: {
            type: 'object',
            properties: {
                command: {
                    type: 'string',
                    description: 'The command to run'
                },
                timeout: {
                    type: 'number',
                    description: 'Timeout in milliseconds (default: 30000)'
                },
                cwd: {
                    type: 'string',
                    description: 'Optional working directory: repo, backend, frontend, or relative path'
                }
            },
            required: ['command']
        }
    },
    {
        name: 'list_files',
        description: 'List files in a directory',
        input_schema: {
            type: 'object',
            properties: {
                path: {
                    type: 'string',
                    description: 'Relative path to directory (default: project root)'
                },
                recursive: {
                    type: 'boolean',
                    description: 'List files recursively (default: false)'
                }
            },
            required: []
        }
    },
    {
        name: 'search_code',
        description: 'Search for a pattern in the codebase',
        input_schema: {
            type: 'object',
            properties: {
                pattern: {
                    type: 'string',
                    description: 'Text pattern to search for'
                },
                file_pattern: {
                    type: 'string',
                    description: 'File glob pattern (e.g., "*.ts")'
                }
            },
            required: ['pattern']
        }
    },
    {
        name: 'git_status',
        description: 'Get current git status (branch, changes, etc.)',
        input_schema: {
            type: 'object',
            properties: {},
            required: []
        }
    },
    {
        name: 'git_commit',
        description: 'Stage changes and create a git commit',
        input_schema: {
            type: 'object',
            properties: {
                message: {
                    type: 'string',
                    description: 'Commit message'
                },
                files: {
                    type: 'array',
                    items: { type: 'string' },
                    description: 'Files to stage (default: all changed files)'
                }
            },
            required: ['message']
        }
    },
    {
        name: 'explain',
        description: 'Explain what you\'re thinking or about to do. This is streamed to the frontend terminal.',
        input_schema: {
            type: 'object',
            properties: {
                thought: {
                    type: 'string',
                    description: 'Your explanation or thought process'
                }
            },
            required: ['thought']
        }
    },
    // Browser tools
    ...BrowserAutomation_1.BROWSER_TOOLS
];
// Convert the Anthropic-shaped tool definitions above to OpenAI /
// OpenRouter chat-completions shape. Computed once at module load.
exports.AGENT_TOOLS_OAI = exports.AGENT_TOOLS.map((t) => ({
    type: 'function',
    function: {
        name: t.name,
        description: t.description,
        parameters: t.input_schema || { type: 'object', properties: {} },
    },
}));
// Blocked commands for safety
const BLOCKED_COMMANDS = [
    'rm -rf /',
    'rm -rf /*',
    'sudo rm',
    'mkfs',
    'dd if=',
    ':(){:|:&};:',
    'chmod -R 777 /',
    '> /dev/sda',
    'mv /* ',
    'wget .* \\|.*sh',
    'curl .* \\|.*sh'
];
// Blocked file paths
const BLOCKED_PATHS = [
    '/etc',
    '/usr',
    '/bin',
    '/sbin',
    '/var',
    '/root',
    '/home',
    '~',
    '..',
    '.env',
    'node_modules',
    '.git/objects',
    '.git/hooks'
];
class AgentExecutor {
    constructor(projectRoot) {
        this.maxOutputLength = 10000;
        this.commandTimeout = 30000;
        this.config = null;
        this.currentWriteScopes = [];
        this.projectRoot = projectRoot || process.cwd();
        console.log(`[EXECUTOR] Initialized with project root: ${this.projectRoot}`);
    }
    configure(config) {
        this.config = config;
        if (config.repoRoot) {
            this.projectRoot = config.repoRoot;
        }
    }
    setExecutionScopes(scopes) {
        this.currentWriteScopes = scopes;
    }
    clearExecutionScopes() {
        this.currentWriteScopes = [];
    }
    // Validate path is safe for reading
    isPathSafe(filePath) {
        const normalizedPath = path.normalize(filePath);
        // Block absolute paths outside project
        if (path.isAbsolute(normalizedPath)) {
            if (!normalizedPath.startsWith(this.projectRoot)) {
                return false;
            }
        }
        // Block dangerous paths
        for (const blocked of BLOCKED_PATHS) {
            if (normalizedPath.includes(blocked)) {
                return false;
            }
        }
        return true;
    }
    normalizeToRelative(filePath) {
        const absolute = path.isAbsolute(filePath) ? filePath : path.join(this.projectRoot, filePath);
        return path.relative(this.projectRoot, absolute).replace(/\\/g, '/');
    }
    isWithinScope(relativePath, scope) {
        if (scope.kind === 'file') {
            return relativePath === scope.path.replace(/\\/g, '/');
        }
        return relativePath.startsWith(scope.path.replace(/\\/g, '/'));
    }
    // Validate path is safe for WRITING - scoped per task
    isWritePathSafe(filePath) {
        if (!this.isPathSafe(filePath)) {
            return false;
        }
        if (!this.config || this.config.effectiveMode !== 'real') {
            console.log(`[EXECUTOR] BLOCKED write outside real mode: ${filePath}`);
            return false;
        }
        const relativePath = this.normalizeToRelative(filePath);
        const repoWriteScopes = (0, config_1.getWriteScopes)(this.config);
        const withinRepoAllowlist = repoWriteScopes.some((scopePrefix) => relativePath.startsWith(scopePrefix.replace(/\\/g, '/')));
        if (!withinRepoAllowlist) {
            console.log(`[EXECUTOR] BLOCKED write outside repo allowlist: ${relativePath}`);
            return false;
        }
        const isScoped = this.currentWriteScopes.some((scope) => this.isWithinScope(relativePath, scope));
        if (!isScoped) {
            console.log(`[EXECUTOR] BLOCKED write outside task scope: ${relativePath}`);
            return false;
        }
        return true;
    }
    // Validate command is safe
    isCommandSafe(command) {
        const lowerCommand = command.toLowerCase();
        for (const blocked of BLOCKED_COMMANDS) {
            if (lowerCommand.includes(blocked.toLowerCase())) {
                return false;
            }
        }
        // Block sudo
        if (lowerCommand.startsWith('sudo ')) {
            return false;
        }
        // Block file deletion commands
        if (lowerCommand.includes('rm ') || lowerCommand.includes('rm\t')) {
            console.log('[EXECUTOR] BLOCKED rm command');
            return false;
        }
        // Block git commands that could affect deployment files
        if (lowerCommand.includes('git rm') || lowerCommand.includes('git mv')) {
            console.log('[EXECUTOR] BLOCKED git rm/mv command');
            return false;
        }
        // Block commands that write outside hermes-generated
        if ((lowerCommand.includes('echo ') || lowerCommand.includes('cat ')) &&
            lowerCommand.includes('>') &&
            !lowerCommand.includes('hermes-generated')) {
            console.log('[EXECUTOR] BLOCKED write redirect outside hermes-generated');
            return false;
        }
        return true;
    }
    // Get full path from relative path
    getFullPath(relativePath) {
        if (path.isAbsolute(relativePath)) {
            return relativePath;
        }
        return path.join(this.projectRoot, relativePath);
    }
    // Read a file
    async readFile(filePath) {
        const fullPath = this.getFullPath(filePath);
        if (!this.isPathSafe(filePath)) {
            return {
                success: false,
                path: filePath,
                error: 'Path not allowed for security reasons'
            };
        }
        try {
            const content = fs.readFileSync(fullPath, 'utf-8');
            EventBus_1.eventBus.emit('agent_action', {
                type: 'read_file',
                path: filePath,
                size: content.length
            });
            return {
                success: true,
                path: filePath,
                content: content.substring(0, this.maxOutputLength)
            };
        }
        catch (error) {
            return {
                success: false,
                path: filePath,
                error: error.message
            };
        }
    }
    // Write to a file - RESTRICTED to approved directories only
    async writeFile(filePath, content) {
        const fullPath = this.getFullPath(filePath);
        // Use strict write path validation
        if (!this.isWritePathSafe(filePath)) {
            const allowedScopes = this.currentWriteScopes.length > 0
                ? this.currentWriteScopes.map((scope) => scope.path)
                : (0, config_1.getWriteScopes)(this.config);
            return {
                success: false,
                path: filePath,
                error: `Write not allowed. Allowed scopes: ${allowedScopes.join(', ') || 'none'}`
            };
        }
        try {
            // Create directory if it doesn't exist
            const dir = path.dirname(fullPath);
            if (!fs.existsSync(dir)) {
                fs.mkdirSync(dir, { recursive: true });
            }
            fs.writeFileSync(fullPath, content, 'utf-8');
            EventBus_1.eventBus.emit('agent_action', {
                type: 'write_file',
                path: filePath,
                size: content.length
            });
            return {
                success: true,
                path: filePath
            };
        }
        catch (error) {
            return {
                success: false,
                path: filePath,
                error: error.message
            };
        }
    }
    // Run a shell command
    resolveCommandCwd(cwd) {
        if (!cwd || cwd === 'repo')
            return this.projectRoot;
        if (cwd === 'backend' && this.config?.projectPaths.backend) {
            return this.config.projectPaths.backend;
        }
        if (cwd === 'frontend' && this.config?.projectPaths.frontend) {
            return this.config.projectPaths.frontend;
        }
        return path.isAbsolute(cwd) ? cwd : path.join(this.projectRoot, cwd);
    }
    async runCommand(command, timeout, cwd) {
        if (!this.isCommandSafe(command)) {
            return {
                success: false,
                output: '',
                error: 'Command blocked for security reasons',
                duration: 0
            };
        }
        const startTime = Date.now();
        const execTimeout = timeout || this.commandTimeout;
        return new Promise((resolve) => {
            const child = (0, child_process_1.spawn)('sh', ['-c', command], {
                cwd: this.resolveCommandCwd(cwd),
                timeout: execTimeout,
                env: {
                    ...process.env,
                    CI: 'true', // Prevent interactive prompts
                    FORCE_COLOR: '0' // Disable color codes
                }
            });
            let stdout = '';
            let stderr = '';
            child.stdout.on('data', (data) => {
                const chunk = data.toString();
                stdout += chunk;
                // Stream to frontend
                EventBus_1.eventBus.emit('agent_output', {
                    type: 'stdout',
                    content: chunk
                });
            });
            child.stderr.on('data', (data) => {
                const chunk = data.toString();
                stderr += chunk;
                EventBus_1.eventBus.emit('agent_output', {
                    type: 'stderr',
                    content: chunk
                });
            });
            child.on('close', (code) => {
                const duration = Date.now() - startTime;
                EventBus_1.eventBus.emit('agent_action', {
                    type: 'run_command',
                    command,
                    exitCode: code,
                    duration
                });
                resolve({
                    success: code === 0,
                    output: (stdout + stderr).substring(0, this.maxOutputLength),
                    exitCode: code || 0,
                    duration
                });
            });
            child.on('error', (error) => {
                const duration = Date.now() - startTime;
                resolve({
                    success: false,
                    output: '',
                    error: error.message,
                    duration
                });
            });
            // Handle timeout
            setTimeout(() => {
                child.kill('SIGTERM');
            }, execTimeout);
        });
    }
    // List files in directory
    async listFiles(dirPath = '', recursive = false) {
        const fullPath = this.getFullPath(dirPath || '.');
        if (!this.isPathSafe(dirPath)) {
            return [];
        }
        try {
            if (recursive) {
                return this.listFilesRecursive(fullPath, dirPath || '.');
            }
            else {
                const entries = fs.readdirSync(fullPath, { withFileTypes: true });
                return entries.map(entry => {
                    const prefix = entry.isDirectory() ? '[DIR] ' : '';
                    return prefix + path.join(dirPath || '.', entry.name);
                });
            }
        }
        catch (error) {
            return [];
        }
    }
    listFilesRecursive(fullPath, relativePath) {
        const results = [];
        try {
            const entries = fs.readdirSync(fullPath, { withFileTypes: true });
            for (const entry of entries) {
                // Skip node_modules and .git
                if (entry.name === 'node_modules' || entry.name === '.git')
                    continue;
                const entryPath = path.join(relativePath, entry.name);
                if (entry.isDirectory()) {
                    results.push('[DIR] ' + entryPath);
                    results.push(...this.listFilesRecursive(path.join(fullPath, entry.name), entryPath));
                }
                else {
                    results.push(entryPath);
                }
            }
        }
        catch (error) {
            // Ignore errors for individual directories
        }
        return results;
    }
    // Search for pattern in code
    async searchCode(pattern, filePattern) {
        const results = [];
        try {
            const grepCommand = filePattern
                ? `grep -rn "${pattern}" --include="${filePattern}" . 2>/dev/null | head -50`
                : `grep -rn "${pattern}" --include="*.ts" --include="*.tsx" --include="*.js" . 2>/dev/null | head -50`;
            const output = (0, child_process_1.execSync)(grepCommand, {
                cwd: this.projectRoot,
                encoding: 'utf-8',
                timeout: 10000
            });
            const lines = output.split('\n').filter(Boolean);
            for (const line of lines) {
                const match = line.match(/^\.\/(.+?):(\d+):(.*)$/);
                if (match) {
                    results.push({
                        file: match[1],
                        line: parseInt(match[2], 10),
                        content: match[3].trim()
                    });
                }
            }
        }
        catch (error) {
            // grep returns non-zero if no matches
        }
        return results;
    }
    // Get git status
    async gitStatus() {
        try {
            const branch = (0, child_process_1.execSync)('git branch --show-current', {
                cwd: this.projectRoot,
                encoding: 'utf-8',
                maxBuffer: 16 * 1024 * 1024,
            }).trim();
            // Limit to first 200 lines so node_modules / large untracked sets
            // can't blow the default 1MB buffer (ENOBUFS).
            const status = (0, child_process_1.execSync)('git status --porcelain | head -n 200', {
                cwd: this.projectRoot,
                encoding: 'utf-8',
                maxBuffer: 16 * 1024 * 1024,
                shell: '/bin/sh',
            });
            const lastCommit = (0, child_process_1.execSync)('git log -1 --oneline', {
                cwd: this.projectRoot,
                encoding: 'utf-8',
                maxBuffer: 16 * 1024 * 1024,
            }).trim();
            return {
                success: true,
                output: status || 'Working tree clean',
                branch,
                commit: lastCommit
            };
        }
        catch (error) {
            return {
                success: false,
                output: '',
                error: error.message
            };
        }
    }
    // Create git commit - DISABLED to prevent file deletions
    async gitCommit(message, files) {
        return GitIntegration_1.gitIntegration.autoCommitAndPush(message, undefined, {
            scopes: this.currentWriteScopes,
            files,
        });
    }
    // Execute a tool call from Claude
    async executeTool(toolName, args) {
        console.log(`[EXECUTOR] Running tool: ${toolName}`, args);
        EventBus_1.eventBus.emit('agent_tool_start', { tool: toolName, args });
        let result;
        switch (toolName) {
            case 'read_file':
                result = await this.readFile(args.path);
                break;
            case 'write_file':
                result = await this.writeFile(args.path, args.content);
                break;
            case 'run_command':
                result = await this.runCommand(args.command, args.timeout, args.cwd);
                break;
            case 'list_files':
                result = { files: await this.listFiles(args.path, args.recursive) };
                break;
            case 'search_code':
                result = { matches: await this.searchCode(args.pattern, args.file_pattern) };
                break;
            case 'git_status':
                result = await this.gitStatus();
                break;
            case 'git_commit':
                result = await this.gitCommit(args.message, args.files);
                break;
            case 'explain':
                // Just emit the explanation for streaming
                EventBus_1.eventBus.emit('agent_thought', { thought: args.thought });
                result = { acknowledged: true };
                break;
            // Browser tools
            case 'browse_url':
            case 'screenshot_url':
            case 'check_deployment':
            case 'search_web':
            case 'extract_links':
                result = await BrowserAutomation_1.browserAutomation.executeTool(toolName, args);
                break;
            default:
                result = { error: `Unknown tool: ${toolName}` };
        }
        EventBus_1.eventBus.emit('agent_tool_complete', { tool: toolName, result });
        return result;
    }
}
exports.AgentExecutor = AgentExecutor;
// Export singleton instance
exports.agentExecutor = new AgentExecutor();
//# sourceMappingURL=AgentExecutor.js.map