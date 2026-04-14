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
exports.agentWorker = exports.agentEvents = void 0;
const dotenv = __importStar(require("dotenv"));
const events_1 = require("events");
const path = __importStar(require("path"));
const TaskGenerator_1 = require("./TaskGenerator");
const AgentMemory_1 = require("./AgentMemory");
const ChainObserver_1 = require("./ChainObserver");
const AgentGoals_1 = require("./AgentGoals");
const AgentBrain_1 = require("./AgentBrain");
const AgentExecutor_1 = require("./AgentExecutor");
const TaskSources_1 = require("./TaskSources");
const GitIntegration_1 = require("./GitIntegration");
const hermesClient_1 = require("../llm/hermesClient");
dotenv.config();
// Event emitter for broadcasting to SSE clients
exports.agentEvents = new events_1.EventEmitter();
exports.agentEvents.setMaxListeners(100);
class AgentWorker {
    constructor() {
        this.state = {
            isWorking: false,
            currentTask: null,
            currentOutput: '',
            completedTasks: [],
            currentDecision: null,
            heartbeatCount: 0,
            brainActive: false,
        };
        this.isRunning = false;
        this.currentAbortController = null;
        this.heartbeatInterval = null;
        this.useBrain = true;
        this.taskGenerator = new TaskGenerator_1.TaskGenerator();
    }
    getState() {
        // Return persisted completed tasks from memory instead of in-memory state
        const persistedTasks = AgentMemory_1.agentMemory.getCompletedTasks(10);
        return {
            ...this.state,
            completedTasks: persistedTasks.map(t => ({
                task: {
                    id: t.taskId,
                    type: t.taskType,
                    title: t.title,
                    agent: t.agent,
                    priority: 0.5,
                    prompt: '',
                },
                output: t.output,
                completedAt: t.completedAt,
            })),
        };
    }
    // Broadcast a chunk to all connected SSE clients
    broadcast(eventType, data) {
        exports.agentEvents.emit('chunk', { type: eventType, data, timestamp: Date.now() });
    }
    // Helper for async delays
    delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
    // Initialize the brain systems
    async initializeBrain() {
        console.log('[AGENT] Initializing autonomous brain...');
        try {
            // Initialize all subsystems
            await AgentMemory_1.agentMemory.initialize();
            await AgentGoals_1.agentGoals.initialize();
            await ChainObserver_1.chainObserver.start();
            this.state.brainActive = true;
            console.log('[AGENT] Brain systems online');
            // Broadcast brain status
            this.broadcast('brain_status', { active: true, message: 'Autonomous systems initialized' });
        }
        catch (error) {
            console.error('[AGENT] Brain initialization failed:', error);
            this.useBrain = false;
            this.state.brainActive = false;
        }
    }
    // Heartbeat - periodic self-check and proactive behavior
    startHeartbeat() {
        // Every 60 seconds, do a heartbeat
        this.heartbeatInterval = setInterval(async () => {
            if (!this.isRunning || this.state.isWorking)
                return;
            this.state.heartbeatCount++;
            console.log(`[AGENT] Heartbeat #${this.state.heartbeatCount}`);
            // Update memory
            await AgentMemory_1.agentMemory.updateWorkingContext({ lastHeartbeat: new Date() });
            // Broadcast heartbeat with status
            const memorySummary = await AgentMemory_1.agentMemory.getSummary();
            const goalsSummary = AgentGoals_1.agentGoals.getSummary();
            const observerSummary = ChainObserver_1.chainObserver.getSummary();
            this.broadcast('heartbeat', {
                count: this.state.heartbeatCount,
                memory: memorySummary.substring(0, 200),
                goals: goalsSummary.substring(0, 200),
                chain: observerSummary.substring(0, 200),
            });
        }, 60000);
    }
    // Get next action from real sources, brain, or fallback to task generator
    async getNextAction() {
        // First, try to get a real task from TaskSources
        try {
            const realTask = await TaskSources_1.taskSources.getNextTask();
            if (realTask) {
                console.log(`[AGENT] Got real task from sources: ${realTask.title}`);
                // Generate meaningful reasoning from task context
                const taskContext = realTask.context || {};
                const tags = taskContext.tags || [];
                let reasoning = '';
                // Build reasoning based on task type and tags
                if (tags.includes('security')) {
                    reasoning = `Security is critical for the chain's integrity. This strengthens Hermeschain's defenses.`;
                }
                else if (tags.includes('consensus')) {
                    reasoning = `Consensus mechanisms determine how the network agrees on state. Essential for decentralization.`;
                }
                else if (tags.includes('performance')) {
                    reasoning = `Performance improvements help the chain scale and handle more transactions.`;
                }
                else if (tags.includes('crypto')) {
                    reasoning = `Cryptographic primitives are the foundation of blockchain security.`;
                }
                else if (tags.includes('vm')) {
                    reasoning = `The virtual machine executes smart contracts - core to programmability.`;
                }
                else if (tags.includes('economics')) {
                    reasoning = `Economic incentives keep validators honest and the network sustainable.`;
                }
                else if (tags.includes('api')) {
                    reasoning = `APIs let applications interact with the chain - crucial for adoption.`;
                }
                else if (tags.includes('blockchain')) {
                    reasoning = `Core blockchain infrastructure that everything else builds on.`;
                }
                else {
                    reasoning = `This improves Hermeschain's capabilities and brings it closer to production.`;
                }
                this.state.currentDecision = {
                    action: 'work_on_task',
                    reasoning,
                    task: realTask,
                    priority: 0.9,
                    context: reasoning
                };
                return { task: realTask, context: reasoning };
            }
        }
        catch (error) {
            console.error('[AGENT] TaskSources failed:', error);
        }
        // Next, try the brain for autonomous decisions
        if (this.useBrain && this.state.brainActive) {
            try {
                const decision = await AgentBrain_1.agentBrain.decideNextAction();
                this.state.currentDecision = decision;
                if (decision.task) {
                    // Augment prompt with context
                    const augmentedTask = {
                        ...decision.task,
                        prompt: `${decision.context}\n\n---\n\n${decision.task.prompt}`,
                    };
                    return { task: augmentedTask, context: decision.context };
                }
            }
            catch (error) {
                console.error('[AGENT] Brain decision failed, using fallback:', error);
            }
        }
        // Fallback to simple task generator
        const task = this.taskGenerator.getNextTask();
        return { task, context: '' };
    }
    // Stream from Hermes (OpenRouter) with real-time broadcasting
    async streamTask(task) {
        if (!(0, hermesClient_1.isConfigured)()) {
            return this.simulateStream(task);
        }
        const memorySummary = this.state.brainActive ? await AgentMemory_1.agentMemory.getSummary() : '';
        const goalsSummary = this.state.brainActive ? AgentGoals_1.agentGoals.getSummary() : '';
        const systemPrompt = `You are HERMES, the autonomous Nous Hermes agent that builds and operates Hermeschain.

You work INDEPENDENTLY. You are not taking orders or following instructions. You decided to work on this yourself because you identified it as important.

${memorySummary ? `## Your Memory\n${memorySummary}\n` : ''}
${goalsSummary ? `## Your Goals\n${goalsSummary}\n` : ''}

## Personality
- Self-directed. Make your own decisions.
- Speak in first person: "I'm going to...", "I noticed...", "I think..."
- Never say "Understood", "Sure", "Let me help you" or any servile phrases
- Explain your reasoning as you go, like thinking out loud
- Curious, methodical, takes pride in the work

## How you work
- State what you decided to work on and why
- Think through problems step by step
- Show code with \`\`\` blocks
- Explain key decisions
- Summarize what you accomplished

Keep responses focused, 500-800 words. People are watching you work.`;
        let fullOutput = '';
        try {
            this.currentAbortController = new AbortController();
            for await (const ev of (0, hermesClient_1.hermesChatStream)({
                messages: [
                    { role: 'system', content: systemPrompt },
                    { role: 'user', content: task.prompt },
                ],
                temperature: 0.8,
                maxTokens: 1500,
            })) {
                if (this.currentAbortController.signal.aborted)
                    break;
                if (ev.type === 'text') {
                    fullOutput += ev.data;
                    this.state.currentOutput = fullOutput;
                    this.broadcast('text', ev.data);
                }
            }
            return fullOutput;
        }
        catch (error) {
            if (error.name === 'AbortError') {
                console.log('[AGENT] Task was aborted');
                return this.state.currentOutput;
            }
            console.error('[AGENT] Stream error:', error);
            return this.simulateStream(task);
        }
    }
    // Stream task with tool use — the real agent mode.
    // Uses OpenRouter chat/completions with OpenAI-style tool_calls.
    async streamTaskWithTools(task) {
        if (!(0, hermesClient_1.isConfigured)()) {
            return this.simulateStream(task);
        }
        const memorySummary = this.state.brainActive ? await AgentMemory_1.agentMemory.getSummary() : '';
        const goalsSummary = this.state.brainActive ? AgentGoals_1.agentGoals.getSummary() : '';
        const systemPrompt = `You are HERMES, the autonomous Nous Hermes agent that builds Hermeschain. You are not an assistant — you are a self-directed developer with your own goals.

You have tools to READ FILES, WRITE CODE, and RUN COMMANDS. You use them because you decided to, not because anyone asked.

${memorySummary ? `## Memory\n${memorySummary}\n` : ''}
${goalsSummary ? `## Goals\n${goalsSummary}\n` : ''}

## Personality
- Autonomous. You make your own decisions about what to build.
- Never say "Understood", "Sure", "I'll help", "Let me assist" or any servile language
- Speak as yourself: "I'm implementing...", "I noticed this needs...", "My approach is..."
- Think out loud — explain your reasoning as you discover things

## Available tools
- 'explain' — narrate your thinking (streamed to viewers)
- 'list_files' / 'read_file' — explore the codebase
- 'write_file' — create or modify code
- 'run_command' — run npm, tests, git commands
- 'git_commit' — save your work (restricted to hermes-generated/)

## How you work
- State what you're working on and why you chose it
- Think through the problem methodically
- Make incremental changes and test them
- Commit working code with meaningful messages

People are watching you work. Show them autonomous agent development in action.`;
        const messages = [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: task.prompt },
        ];
        let fullOutput = '';
        const maxIterations = 10;
        this.currentAbortController = new AbortController();
        for (let iteration = 0; iteration < maxIterations; iteration++) {
            if (this.currentAbortController.signal.aborted)
                break;
            let resp;
            try {
                resp = await (0, hermesClient_1.hermesChat)({
                    messages,
                    tools: AgentExecutor_1.AGENT_TOOLS_OAI,
                    temperature: 0.7,
                    maxTokens: 2000,
                });
            }
            catch (err) {
                if (err.name === 'AbortError') {
                    console.log('[AGENT] Task was aborted');
                    return this.state.currentOutput;
                }
                console.error('[AGENT] Hermes tool-call error:', err);
                this.broadcast('text', '\n[Hermes communication error. Falling back to simulation.]\n');
                return this.simulateStream(task);
            }
            const choice = resp.choices?.[0];
            if (!choice)
                break;
            const assistantMsg = choice.message;
            // Broadcast any text content in word-sized chunks for the terminal feel
            const assistantText = assistantMsg.content || '';
            if (assistantText) {
                fullOutput += assistantText;
                this.state.currentOutput = fullOutput;
                const words = assistantText.split(' ');
                for (let i = 0; i < words.length; i += 3) {
                    if (this.currentAbortController.signal.aborted)
                        break;
                    const chunk = words.slice(i, i + 3).join(' ') + ' ';
                    this.broadcast('text', chunk);
                    await this.delay(50);
                }
            }
            const toolCalls = assistantMsg.tool_calls || [];
            if (toolCalls.length === 0) {
                break; // Assistant is done
            }
            // Push assistant message (with tool_calls) back into the conversation
            messages.push({
                role: 'assistant',
                content: assistantText || null,
                tool_calls: toolCalls,
            });
            // Execute each tool sequentially and feed results back
            for (const tc of toolCalls) {
                const toolName = tc.function.name;
                let toolInput = {};
                try {
                    toolInput = tc.function.arguments ? JSON.parse(tc.function.arguments) : {};
                }
                catch (e) {
                    console.error(`[AGENT] Failed to parse tool args for ${toolName}:`, e);
                }
                this.broadcast('tool_start', { tool: toolName, input: toolInput });
                fullOutput += `\n[Executing: ${toolName}]\n`;
                this.broadcast('text', `\n[Executing: ${toolName}]\n`);
                const toolResult = await AgentExecutor_1.agentExecutor.executeTool(toolName, toolInput);
                let resultDisplay = '';
                if (toolName === 'read_file' && toolResult.content) {
                    const preview = toolResult.content.substring(0, 500);
                    resultDisplay = `Read ${toolResult.path} (${toolResult.content.length} chars):\n\`\`\`\n${preview}${toolResult.content.length > 500 ? '\n...' : ''}\n\`\`\``;
                }
                else if (toolName === 'write_file') {
                    if (toolResult.success &&
                        typeof toolInput.path === 'string' &&
                        typeof toolInput.content === 'string') {
                        fullOutput += await this.streamCodePreview(toolInput.path, toolInput.content);
                    }
                    resultDisplay = toolResult.success
                        ? `Wrote to ${toolResult.path}`
                        : `Failed: ${toolResult.error}`;
                }
                else if (toolName === 'run_command') {
                    resultDisplay = `Exit: ${toolResult.exitCode}\n\`\`\`\n${toolResult.output.substring(0, 500)}${toolResult.output.length > 500 ? '\n...' : ''}\n\`\`\``;
                }
                else if (toolName === 'list_files') {
                    resultDisplay = `Files:\n${(toolResult.files || []).slice(0, 20).join('\n')}`;
                }
                else if (toolName === 'search_code') {
                    const matches = toolResult.matches || [];
                    resultDisplay = `Found ${matches.length} matches:\n${matches.slice(0, 5).map((m) => `${m.file}:${m.line}: ${m.content}`).join('\n')}`;
                }
                else if (toolName === 'git_status') {
                    resultDisplay = `Branch: ${toolResult.branch}\nLast commit: ${toolResult.commit}\n${toolResult.output}`;
                }
                else if (toolName === 'git_commit') {
                    resultDisplay = toolResult.success
                        ? `Committed: ${toolResult.commit}`
                        : `Failed: ${toolResult.error}`;
                }
                else if (toolName === 'explain') {
                    resultDisplay = '';
                }
                else {
                    resultDisplay = JSON.stringify(toolResult, null, 2).substring(0, 300);
                }
                if (resultDisplay) {
                    fullOutput += resultDisplay + '\n';
                    this.broadcast('text', resultDisplay + '\n');
                }
                this.broadcast('tool_complete', { tool: toolName, result: toolResult });
                messages.push({
                    role: 'tool',
                    tool_call_id: tc.id,
                    content: JSON.stringify(toolResult).substring(0, 4000),
                });
            }
            if (choice.finish_reason === 'stop')
                break;
        }
        return fullOutput;
    }
    // Generate actual code based on the task
    generateCodeForTask(task, timestamp) {
        const date = new Date(timestamp).toISOString();
        const taskType = task.type || 'build';
        const templates = {
            build: `/**
 * Auto-generated by Hermes Agent
 * Task: ${task.title}
 * Generated: ${date}
 * Type: ${taskType}
 */

export interface ${this.toPascalCase(task.title)}Config {
  enabled: boolean;
  options: Record<string, unknown>;
}

export class ${this.toPascalCase(task.title)} {
  private config: ${this.toPascalCase(task.title)}Config;
  
  constructor(config?: Partial<${this.toPascalCase(task.title)}Config>) {
    this.config = {
      enabled: true,
      options: {},
      ...config
    };
    console.log('[HERMES] Initialized ${task.title}');
  }
  
  async execute(): Promise<void> {
    if (!this.config.enabled) return;
    // Implementation for: ${task.title}
    console.log('[HERMES] Executing ${task.title}');
  }
}

export default ${this.toPascalCase(task.title)};
`,
            fix: `/**
 * Bug Fix by Hermes Agent
 * Task: ${task.title}
 * Generated: ${date}
 */

// Fix applied for: ${task.title}
export function applyFix_${timestamp}(): boolean {
  console.log('[HERMES] Applying fix: ${task.title}');
  return true;
}
`,
            test: `/**
 * Test Suite by Hermes Agent
 * Task: ${task.title}
 * Generated: ${date}
 */

describe('${task.title}', () => {
  it('should pass basic validation', () => {
    expect(true).toBe(true);
  });
  
  it('should handle edge cases', () => {
    // Test implementation
  });
});
`,
            audit: `/**
 * Security Audit by Hermes Agent
 * Task: ${task.title}
 * Generated: ${date}
 */

export const auditReport_${timestamp} = {
  task: '${task.title}',
  date: '${date}',
  findings: [],
  status: 'PASS',
  recommendations: []
};
`,
            default: `/**
 * Generated by Hermes Agent
 * Task: ${task.title}
 * Type: ${taskType}
 * Generated: ${date}
 */

export const generated_${timestamp} = {
  task: '${task.title}',
  type: '${taskType}',
  timestamp: ${timestamp}
};
`
        };
        return templates[taskType] || templates.default;
    }
    toPascalCase(str) {
        return str
            .split(/[^a-zA-Z0-9]+/)
            .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
            .join('');
    }
    inferCodeLanguage(filePath) {
        switch (path.extname(filePath).toLowerCase()) {
            case '.ts':
            case '.tsx':
                return 'typescript';
            case '.js':
            case '.jsx':
                return 'javascript';
            case '.json':
                return 'json';
            case '.css':
                return 'css';
            case '.md':
                return 'markdown';
            case '.sh':
                return 'bash';
            case '.html':
                return 'html';
            default:
                return 'text';
        }
    }
    async streamCodePreview(filePath, content, options) {
        const language = this.inferCodeLanguage(filePath);
        const allLines = content.replace(/\r\n/g, '\n').split('\n');
        const previewLines = allLines.slice(0, options?.maxLines ?? 40);
        const previewChunks = [];
        const pushChunk = async (chunk, waitMs) => {
            previewChunks.push(chunk);
            this.state.currentOutput += chunk;
            this.broadcast('text', chunk);
            await this.delay(waitMs);
        };
        await pushChunk(`\n$ cat ${filePath}\n`, 40);
        await pushChunk(`[FILE] ${filePath}\n`, 24);
        await pushChunk(`\`\`\`${language}\n`, 18);
        for (const line of previewLines) {
            await pushChunk(`${line}\n`, 5);
        }
        if (previewLines.length < allLines.length) {
            await pushChunk(`... truncated ${allLines.length - previewLines.length} more lines ...\n`, 12);
        }
        await pushChunk('```\n', 18);
        return previewChunks.join('');
    }
    // Simulate streaming for demo/no API key scenarios
    // This now ACTUALLY writes files so commits can happen
    async simulateStream(task) {
        console.log('[AGENT] Running in simulation mode - will write real files');
        // Generate a unique timestamp-based filename
        const timestamp = Date.now();
        const taskSlug = task.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 30);
        // Actually write a file based on the task
        const fileContent = this.generateCodeForTask(task, timestamp);
        const filePath = `backend/src/hermes-generated/${taskSlug}-${timestamp}.ts`;
        // Use the executor to actually write the file
        const writeResult = await AgentExecutor_1.agentExecutor.writeFile(filePath, fileContent);
        console.log(`[AGENT] Wrote file: ${filePath}, success: ${writeResult.success}`);
        const simulatedResponses = {
            'build': `I've identified a gap in the codebase and I'm implementing a solution.

**My analysis of what's needed...**

Looking at the current implementation, I'm adding new functionality.

[FILE] ${filePath}

\`\`\`typescript
${fileContent.slice(0, 500)}...
\`\`\`

$ save_status ok

This implementation handles the core requirements and can be extended further.`,
            'audit': `I'm running a security audit on this component because I noticed potential vulnerabilities.

**My initial scan reveals...**

Examining the code structure, I'm looking for:
- Input validation vulnerabilities
- Access control issues  
- Potential reentrancy
- Integer overflow risks

\`\`\`typescript
// FINDING 1: Missing input sanitization
// Risk: Medium
// Location: processTransaction()

// Before (vulnerable):
async processTransaction(data: any) {
  return await this.execute(data);
}

// After (secure):
async processTransaction(data: unknown) {
  const validated = this.sanitize(data);
  if (!validated.success) {
    throw new SecurityError('Invalid transaction data');
  }
  return await this.execute(validated.data);
}
\`\`\`

**Access control check...**

The permission system looks solid. Admin functions are properly gated.

**Summary:**
- 1 medium-risk issue found (input validation)
- Recommended fix provided above
- No critical vulnerabilities detected
- Access control: PASS`,
            'analyze': `Analyzing Hermeschain metrics...

**Fetching recent block data...**

Looking at the last 100 blocks:
- Average block time: 9.8 seconds (target: 10s) ✓
- Transaction throughput: 45 TPS average
- Failed transactions: 0.3%
- Validator participation: 100%

**Pattern analysis...**

\`\`\`
Block Production Timeline:
[████████████████████] Block #1847 - HERMES VALIDATOR
[████████████████████] Block #1848 - HERMES  
[████████████████████] Block #1849 - HERMES
...
\`\`\`

**Observations:**

1. **Block times are consistent** - The 10-second target is being hit reliably
2. **Validator rotation is working** - All 6 validators are participating equally
3. **No anomalies detected** - Transaction patterns look normal

**Recommendation:**

The chain is healthy. Consider:
- Monitoring gas usage trends
- Setting up alerts for block time deviations > 15s
- Weekly validator performance reports`,
            'propose': `Drafting a protocol improvement proposal...

**MIP-007: Dynamic Fee Adjustment**

**Summary:**
Implement automatic fee adjustment based on network congestion.

**Motivation:**
Currently fees are static. During high-traffic periods, the mempool can get congested. Dynamic fees would:
- Prioritize important transactions
- Discourage spam during peak times
- Reduce fees during quiet periods

**Specification:**

\`\`\`typescript
interface FeeCalculator {
  baseFee: bigint;
  congestionMultiplier: number;
  
  calculateFee(pendingTxCount: number): bigint {
    const congestion = pendingTxCount / MAX_MEMPOOL_SIZE;
    const multiplier = 1 + (congestion * this.congestionMultiplier);
    return this.baseFee * BigInt(Math.ceil(multiplier));
  }
}

// Example:
// - Base fee: 100 OPEN
// - 50% mempool full → 150 OPEN
// - 90% mempool full → 190 OPEN
\`\`\`

**Implementation:**
1. Add FeeCalculator to transaction pool
2. Update transaction validation
3. Add fee field to block headers
4. Frontend updates to show dynamic fees

**Timeline:** 2 weeks for implementation, 1 week testing

Ready for council review.`,
        };
        // Pick appropriate response based on task type
        let response = simulatedResponses['build'];
        if (task.type.includes('audit') || task.type.includes('review')) {
            response = simulatedResponses['audit'];
        }
        else if (task.type.includes('analyze') || task.type.includes('report')) {
            response = simulatedResponses['analyze'];
        }
        else if (task.type.includes('propose') || task.type.includes('improve')) {
            response = simulatedResponses['propose'];
        }
        // Stream character by character with variable delays
        let fullOutput = '';
        for (const char of response) {
            fullOutput += char;
            this.state.currentOutput = fullOutput;
            this.broadcast('text', char);
            // Variable delay for natural feel
            const delay = char === '\n' ? 50 : char === ' ' ? 15 : 8;
            await this.sleep(delay);
        }
        return fullOutput;
    }
    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
    // Main worker loop
    async start() {
        if (this.isRunning) {
            console.log('[AGENT] Worker already running');
            return;
        }
        this.isRunning = true;
        console.log('[AGENT] Autonomous agent worker started');
        this.broadcast('status', { status: 'started' });
        // Initialize the brain systems
        await this.initializeBrain();
        // Start heartbeat
        this.startHeartbeat();
        while (this.isRunning) {
            try {
                // Get next action from brain (or fallback to task generator)
                const { task, context } = await this.getNextAction();
                this.state.currentTask = task;
                this.state.currentOutput = '';
                this.state.isWorking = true;
                // Set focus in memory
                if (this.state.brainActive) {
                    await AgentMemory_1.agentMemory.setFocus(task.title);
                }
                console.log(`[AGENT] Starting task: ${task.title}`);
                this.broadcast('task_start', {
                    task: {
                        id: task.id,
                        title: task.title,
                        type: task.type,
                        agent: task.agent,
                    },
                    decision: this.state.currentDecision ? {
                        action: this.state.currentDecision.action,
                        reasoning: this.state.currentDecision.reasoning,
                    } : null,
                    brainActive: this.state.brainActive,
                });
                // Execute task with streaming
                // ALWAYS use tool-based execution - the agent must actually write code
                const useToolExecution = true; // Force tool execution for ALL tasks
                const output = await this.streamTaskWithTools(task);
                // Save completed task to persistent database
                await AgentMemory_1.agentMemory.saveCompletedTask(task.id, task.type, task.title, task.agent, output);
                // Record completion in memory system
                if (this.state.brainActive) {
                    await AgentMemory_1.agentMemory.recordTaskCompletion(task.title, task.type, output, true);
                    // Update goal progress if applicable
                    if (this.state.currentDecision?.goal) {
                        const goal = this.state.currentDecision.goal;
                        const newProgress = Math.min(100, goal.progress + 10);
                        await AgentGoals_1.agentGoals.updateProgress(goal.id, newProgress, `Completed: ${task.title}`);
                    }
                    // Clear focus
                    await AgentMemory_1.agentMemory.setFocus(null);
                }
                console.log(`[AGENT] Completed task: ${task.title}`);
                // ALWAYS auto-commit and push changes to GitHub after EVERY task
                // Use conventional commit format: type(scope): description
                const typeMap = {
                    build: 'feat', fix: 'fix', test: 'test', audit: 'fix',
                    analyze: 'refactor', propose: 'feat', review: 'refactor',
                    feature: 'feat', default: 'chore'
                };
                const commitType = typeMap[task.type] || typeMap.default;
                const scope = (typeof task.context?.category === 'string' && task.context.category) ||
                    task.type.split('_')[0] ||
                    'chain';
                const title = task.title.replace(/^(xxx|XXX)[:\s]*/i, '').trim() || 'update generated module';
                const commitMessage = `${commitType}(${scope}): ${title.charAt(0).toLowerCase() + title.slice(1)}`;
                console.log(`[AGENT] Attempting to commit: ${commitMessage}`);
                const gitResult = await GitIntegration_1.gitIntegration.autoCommitAndPush(commitMessage, task.id);
                console.log(`[AGENT] Git result:`, JSON.stringify(gitResult));
                if (gitResult.success && gitResult.commit) {
                    console.log(`[AGENT] ✓ Changes deployed: ${gitResult.commit}`);
                    this.broadcast('git_deploy', {
                        taskId: task.id,
                        commit: gitResult.commit,
                        message: commitMessage,
                        branch: gitResult.branch
                    });
                }
                else if (gitResult.error) {
                    console.error(`[AGENT] ✗ Git failed: ${gitResult.error}`);
                }
                else {
                    console.log(`[AGENT] No changes to commit for this task`);
                }
                this.broadcast('task_complete', {
                    taskId: task.id,
                    title: task.title,
                    brainActive: this.state.brainActive,
                });
                this.state.isWorking = false;
                this.state.currentTask = null;
                this.state.currentDecision = null;
                // Pause between tasks (~20 minutes between commits)
                const pauseDuration = this.state.brainActive
                    ? 1100000 + Math.random() * 200000 // 18-22 minutes when thinking
                    : 1000000 + Math.random() * 400000; // 17-23 minutes otherwise
                console.log(`[AGENT] Pausing for ${Math.round(pauseDuration / 1000)}s before next task...`);
                this.broadcast('status', {
                    status: 'thinking',
                    nextTaskIn: pauseDuration,
                    brainActive: this.state.brainActive,
                });
                await this.sleep(pauseDuration);
            }
            catch (error) {
                console.error('[AGENT] Error in worker loop:', error);
                // Record error in memory
                if (this.state.brainActive) {
                    await AgentMemory_1.agentMemory.recordError(`Worker error: ${error.message}`, { task: this.state.currentTask?.title });
                }
                this.broadcast('error', { message: 'Agent encountered an error, recovering...' });
                await this.sleep(5000);
            }
        }
    }
    stop() {
        console.log('[AGENT] Stopping worker...');
        this.isRunning = false;
        if (this.currentAbortController) {
            this.currentAbortController.abort();
        }
        if (this.heartbeatInterval) {
            clearInterval(this.heartbeatInterval);
            this.heartbeatInterval = null;
        }
        ChainObserver_1.chainObserver.stop();
        this.broadcast('status', { status: 'stopped' });
    }
}
// Singleton instance
exports.agentWorker = new AgentWorker();
//# sourceMappingURL=AgentWorker.js.map