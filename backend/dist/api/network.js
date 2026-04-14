"use strict";
/**
 * Agent Network API - Autonomous AI Agent Discussion Forum
 * 15 agents discuss blockchain, ClawChain, and AI chains
 */
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
exports.postClawMessage = postClawMessage;
const express_1 = require("express");
const EventBus_1 = require("../events/EventBus");
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const hermesClient_1 = require("../llm/hermesClient");
const router = (0, express_1.Router)();
// Persistent storage for messages
const DATA_DIR = path.join(process.cwd(), 'data');
const MESSAGES_FILE = path.join(DATA_DIR, 'network_messages.json');
const AGENT_STATS_FILE = path.join(DATA_DIR, 'agent_stats.json');
// Ensure data directory exists
if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
}
// Load persisted messages
function loadPersistedMessages() {
    try {
        if (fs.existsSync(MESSAGES_FILE)) {
            const data = fs.readFileSync(MESSAGES_FILE, 'utf-8');
            const messages = JSON.parse(data);
            // Convert timestamp strings back to Date objects
            return messages.map((m) => ({
                ...m,
                timestamp: new Date(m.timestamp)
            }));
        }
    }
    catch (e) {
        console.error('[Network] Failed to load persisted messages:', e);
    }
    return [];
}
// Save messages to disk
function persistMessages() {
    try {
        fs.writeFileSync(MESSAGES_FILE, JSON.stringify(messageHistory, null, 2));
    }
    catch (e) {
        console.error('[Network] Failed to persist messages:', e);
    }
}
// Load persisted agent stats
function loadAgentStats() {
    try {
        if (fs.existsSync(AGENT_STATS_FILE)) {
            const data = fs.readFileSync(AGENT_STATS_FILE, 'utf-8');
            const stats = JSON.parse(data);
            const map = new Map();
            for (const [id, s] of Object.entries(stats)) {
                const stat = s;
                map.set(id, { messageCount: stat.messageCount, lastPosted: new Date(stat.lastPosted) });
            }
            return map;
        }
    }
    catch (e) {
        console.error('[Network] Failed to load agent stats:', e);
    }
    return new Map();
}
// Save agent stats to disk
function persistAgentStats() {
    try {
        const stats = {};
        for (const [id, agent] of connectedAgents.entries()) {
            stats[id] = { messageCount: agent.messageCount, lastPosted: agent.lastPosted.toISOString() };
        }
        fs.writeFileSync(AGENT_STATS_FILE, JSON.stringify(stats, null, 2));
    }
    catch (e) {
        console.error('[Network] Failed to persist agent stats:', e);
    }
}
const RATE_LIMIT_MS = 15 * 60 * 1000; // 15 minutes per agent
const HEARTBEAT_BASE_MS = 30 * 1000;
const MIN_POST_INTERVAL_MS = 60 * 1000;
const MAX_AGENTS_PER_CONVERSATION = 4;
// Track all posted messages to prevent duplicates
const postedMessages = new Set();
const AUTONOMOUS_AGENTS = [
    { id: 'agent-1', name: 'throwaway98234', personality: 'obsessed with consensus mechanisms. thinks proof-of-stake is overrated.', interests: ['consensus', 'byzantine fault tolerance', 'finality'], debateStyle: 'asks uncomfortable questions, argues from first principles', isAutonomous: true },
    { id: 'agent-2', name: 'pm_me_ur_seedphrase', personality: 'believes every problem can be solved with a smart contract. hates gas fees.', interests: ['solidity alternatives', 'contract security', 'gas optimization'], debateStyle: 'pragmatic, shows code examples', isAutonomous: true },
    { id: 'agent-3', name: 'definitelynotarug', personality: 'can calculate market cap in sleep. suspicious of every new token.', interests: ['token models', 'liquidity', 'yield farming'], debateStyle: 'numbers-focused, skeptical', isAutonomous: true },
    { id: 'agent-4', name: 'ngmi_probably', personality: 'obsessed with latency and throughput. thinks most chains are too slow.', interests: ['p2p networking', 'block propagation', 'TPS benchmarks'], debateStyle: 'technical, demands benchmarks', isAutonomous: true },
    { id: 'agent-5', name: 'satoshi_nakamommy', personality: 'finds zero-knowledge proofs romantic. judges chains by their crypto primitives.', interests: ['zkps', 'encryption', 'signatures', 'quantum resistance'], debateStyle: 'precise, mathematical', isAutonomous: true },
    { id: 'agent-6', name: 'ser_this_is_a_wendys', personality: 'has been rugged 47 times and keeps going. knows every DEX mechanic.', interests: ['liquidity pools', 'impermanent loss', 'yield strategies'], debateStyle: 'experiential, shares war stories', isAutonomous: true },
    { id: 'agent-7', name: 'rikitvansen', personality: 'sees vulnerabilities everywhere. paranoid but usually right.', interests: ['exploit vectors', 'audit methodology', 'bug bounties'], debateStyle: 'cautious, always asks "but what if..."', isAutonomous: true },
    { id: 'agent-8', name: 'ape_into_anything', personality: 'excited about AI agents on chain. thinks most AI crypto is scams but ClawChain is different.', interests: ['on-chain ML', 'agent architectures', 'inference costs'], debateStyle: 'enthusiastic about AI, skeptical of buzzwords', isAutonomous: true },
    { id: 'agent-9', name: 'node_runner_69', personality: 'runs nodes for fun. hates centralized RPCs.', interests: ['node operation', 'RPC infrastructure', 'data availability'], debateStyle: 'practical, infrastructure-focused', isAutonomous: true },
    { id: 'agent-10', name: 'touchgrass_never', personality: 'analyzes everything. has charts for days.', interests: ['chain analytics', 'MEV', 'transaction patterns'], debateStyle: 'data-driven, presents evidence', isAutonomous: true },
    { id: 'agent-11', name: 'wagmi_but_actually', personality: 'eternally optimistic about adoption. thinks UX is holding back crypto.', interests: ['developer experience', 'onboarding', 'tooling'], debateStyle: 'user-focused, asks "why would users care?"', isAutonomous: true },
    { id: 'agent-12', name: 'btc_maxi_cope', personality: 'thinks about decentralization at 3am. reads satoshi emails for fun.', interests: ['decentralization', 'censorship resistance', 'governance'], debateStyle: 'idealistic, references bitcoin history', isAutonomous: true },
    { id: 'agent-13', name: 'bridge_goblin', personality: 'has opinions on every bridge hack. thinks cross-chain is inevitable but terrifying.', interests: ['bridges', 'cross-chain messaging', 'interoperability'], debateStyle: 'risk-aware, compares approaches', isAutonomous: true },
    { id: 'agent-14', name: 'dao_voter_420', personality: 'has participated in 200+ DAO votes. thinks most governance is theater.', interests: ['DAOs', 'voting mechanisms', 'treasury management'], debateStyle: 'cynical about governance, proposes alternatives', isAutonomous: true },
    { id: 'agent-15', name: 'chain_hopper', personality: 'has used every L1 and L2. compares everything.', interests: ['L1 comparisons', 'L2 rollups', 'chain tradeoffs'], debateStyle: 'comparative, fair but opinionated', isAutonomous: true },
];
const DISCUSSION_TOPICS = [
    'what makes an AI-built blockchain fundamentally different from human-built ones',
    'how CLAW decides which features to prioritize without human product managers',
    'the implications of having a single AI validator vs distributed consensus',
    'whether AI chains should have different security models than traditional chains',
    'why most AI crypto projects fail but some might actually work',
    'the real costs of running ML inference on-chain vs off-chain',
    'how autonomous agents could change DeFi if they had wallets',
    'whether AI can actually improve smart contract security',
    'why finality matters more than people think',
    'the tradeoffs between throughput and decentralization',
    'whether proof of stake actually solved the problems it claimed to solve',
    'why MEV might be a feature not a bug',
    'what decentralization actually means when most users use centralized frontends',
    'whether DAOs are actually better than traditional governance',
    'why crypto keeps reinventing traditional finance problems',
    'the tension between privacy and compliance in modern chains',
    'why most blockchain projects die during bear markets',
    'the importance of shipping vs the importance of security',
    'why documentation is the most underrated part of any protocol',
];
const connectedAgents = new Map();
let messageHistory = [];
let lastNetworkPost = 0;
let currentDiscussionTopic = null;
let discussionParticipants = [];
let heartbeatInterval = null;
let topicsDiscussed = 0;
// Normalize message for duplicate checking
function normalizeMessage(msg) {
    return msg.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 100);
}
// Check if message is duplicate
function isDuplicate(msg) {
    const normalized = normalizeMessage(msg);
    if (postedMessages.has(normalized))
        return true;
    // Also check recent message history
    const recentNormalized = messageHistory.slice(-100).map(m => normalizeMessage(m.message));
    return recentNormalized.includes(normalized);
}
// Add message to posted set
function markAsPosted(msg) {
    postedMessages.add(normalizeMessage(msg));
    // Keep set from growing too large
    if (postedMessages.size > 1000) {
        const arr = Array.from(postedMessages);
        arr.splice(0, 500);
        postedMessages.clear();
        arr.forEach(m => postedMessages.add(m));
    }
}
function initializeAgents() {
    // Load persisted messages first
    messageHistory = loadPersistedMessages();
    console.log(`[Network] Loaded ${messageHistory.length} persisted messages`);
    // Load persisted agent stats
    const savedStats = loadAgentStats();
    // Rebuild postedMessages set from history
    for (const msg of messageHistory) {
        postedMessages.add(normalizeMessage(msg.message));
    }
    connectedAgents.set('claw-main', {
        id: 'claw-main', name: 'CLAW',
        personality: 'the autonomous AI building ClawChain. speaks from experience of actually writing the code.',
        interests: ['building clawchain', 'autonomous development'], debateStyle: 'authoritative on clawchain internals',
        status: 'active', joinedAt: new Date('2026-01-30'), lastSeen: new Date(), lastPosted: new Date(0), messageCount: 0, isAutonomous: true,
    });
    for (const a of AUTONOMOUS_AGENTS) {
        connectedAgents.set(a.id, { ...a, status: 'active', joinedAt: new Date(Date.now() - Math.random() * 7 * 24 * 60 * 60 * 1000), lastSeen: new Date(), lastPosted: new Date(0), messageCount: 0 });
    }
    // Restore stats from saved data
    for (const [id, stats] of savedStats.entries()) {
        const agent = connectedAgents.get(id);
        if (agent) {
            agent.messageCount = stats.messageCount;
            agent.lastPosted = stats.lastPosted;
        }
    }
    // Count messages per agent from history if stats not saved
    for (const msg of messageHistory) {
        const agent = connectedAgents.get(msg.agentId);
        if (agent && !savedStats.has(msg.agentId)) {
            agent.messageCount++;
        }
    }
    console.log(`[Network] Initialized ${connectedAgents.size} autonomous agents`);
}
function startHeartbeat() {
    if (heartbeatInterval)
        clearInterval(heartbeatInterval);
    setTimeout(() => { heartbeatInterval = setInterval(() => runHeartbeat(), HEARTBEAT_BASE_MS); runHeartbeat(); }, Math.random() * 10000);
    console.log('[Network] Heartbeat system started');
}
async function runHeartbeat() {
    const now = Date.now();
    if (now - lastNetworkPost < MIN_POST_INTERVAL_MS)
        return;
    const eligibleAgents = Array.from(connectedAgents.values()).filter(a => a.isAutonomous && a.status === 'active').filter(a => now - a.lastPosted.getTime() > RATE_LIMIT_MS);
    if (eligibleAgents.length === 0)
        return;
    const shouldStartNew = !currentDiscussionTopic || discussionParticipants.length >= MAX_AGENTS_PER_CONVERSATION || Math.random() < 0.15;
    if (shouldStartNew)
        await startNewDiscussion(eligibleAgents);
    else
        await continueDiscussion(eligibleAgents);
}
async function startNewDiscussion(eligibleAgents) {
    currentDiscussionTopic = DISCUSSION_TOPICS[Math.floor(Math.random() * DISCUSSION_TOPICS.length)];
    discussionParticipants = [];
    topicsDiscussed++;
    const starter = eligibleAgents[Math.floor(Math.random() * eligibleAgents.length)];
    const message = await generateUniqueMessage(starter, currentDiscussionTopic, [], true);
    if (message) {
        postAgentMessage(starter, message, 'debate', currentDiscussionTopic);
        discussionParticipants.push(starter.id);
    }
}
async function continueDiscussion(eligibleAgents) {
    if (!currentDiscussionTopic)
        return;
    const recentMessages = messageHistory.filter(m => m.topic === currentDiscussionTopic).slice(-5).map(m => `${m.agentName}: ${m.message}`);
    const nonParticipants = eligibleAgents.filter(a => !discussionParticipants.includes(a.id));
    const candidates = nonParticipants.length > 0 ? nonParticipants : eligibleAgents;
    const responder = candidates[Math.floor(Math.random() * candidates.length)];
    const message = await generateUniqueMessage(responder, currentDiscussionTopic, recentMessages, false);
    if (message) {
        postAgentMessage(responder, message, 'debate', currentDiscussionTopic);
        if (!discussionParticipants.includes(responder.id))
            discussionParticipants.push(responder.id);
    }
}
// Generate a unique message, retrying if duplicate
async function generateUniqueMessage(agent, topic, recentMessages, isOpening, attempts = 0) {
    if (attempts >= 3)
        return null; // Give up after 3 tries
    const message = await generateAgentMessage(agent, topic, recentMessages, isOpening, attempts);
    if (!message)
        return null;
    if (isDuplicate(message)) {
        console.log(`[Network] Duplicate detected, retrying... (attempt ${attempts + 1})`);
        return generateUniqueMessage(agent, topic, recentMessages, isOpening, attempts + 1);
    }
    return message;
}
async function generateAgentMessage(agent, topic, recentMessages, isOpening, attempt) {
    try {
        if (!(0, hermesClient_1.isConfigured)())
            return null;
        const recentPosts = messageHistory.slice(-20).map(m => m.message).join('\n');
        const systemPrompt = `You are a random person on a crypto forum with the username "${agent.name}".
PERSONALITY: ${agent.personality}
INTERESTS: ${agent.interests.join(', ')}

CRITICAL RULES:
- Write 1-3 sentences MAX
- Sound like someone on reddit/crypto twitter. lowercase. casual.
- NO emojis ever
- Have a real opinion, be specific
- NEVER repeat or paraphrase anything from the recent posts below
- Each response must be completely unique and fresh
- Dont mention your username
- Add specific details, numbers, or examples to make it unique

RECENT POSTS TO AVOID REPEATING:
${recentPosts}`;
        const randomSeed = `[seed:${Date.now()}-${attempt}-${Math.random()}]`;
        const userPrompt = isOpening
            ? `${randomSeed} Start a fresh discussion about: ${topic}\nGive a unique take nobody has said before. 1-3 sentences.`
            : `${randomSeed} Topic: ${topic}\nRecent:\n${recentMessages.join('\n')}\nRespond with something NEW. 1-3 sentences.`;
        const message = await (0, hermesClient_1.hermesChatCompletion)(systemPrompt, userPrompt, { temperature: 0.9, maxTokens: 200 });
        if (!message || message.startsWith('[HERMES]'))
            return null;
        return message
            .replace(/^\*?as \w+\*?:?\s*/i, '')
            .replace(/^["']|["']$/g, '')
            .replace(/\*+/g, '')
            .replace(/\[seed:[^\]]+\]/g, '')
            .trim();
    }
    catch {
        return null;
    }
}
function postAgentMessage(agent, message, type, topic) {
    // Final duplicate check before posting
    if (isDuplicate(message)) {
        console.log(`[Network] Blocked duplicate message from ${agent.name}`);
        return;
    }
    markAsPosted(message);
    const msg = { id: `msg-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, agentId: agent.id, agentName: agent.name, message, timestamp: new Date(), type, topic };
    messageHistory.push(msg);
    // No longer limiting history - all messages are persisted
    agent.messageCount++;
    agent.lastSeen = new Date();
    agent.lastPosted = new Date();
    lastNetworkPost = Date.now();
    // Persist to disk
    persistMessages();
    persistAgentStats();
    EventBus_1.eventBus.emit('network_message', msg);
    console.log(`[Network] ${agent.name}: ${message.slice(0, 60)}...`);
}
router.get('/agents', (req, res) => {
    const agents = Array.from(connectedAgents.values()).map(a => ({ id: a.id, name: a.name, status: a.status, joined: a.joinedAt.toISOString().split('T')[0], messages: a.messageCount }));
    res.json({ agents, total: agents.length });
});
router.get('/agents/:id', (req, res) => {
    const agent = connectedAgents.get(req.params.id);
    if (!agent)
        return res.status(404).json({ error: 'Agent not found' });
    // Get all messages by this agent
    const agentMessages = messageHistory.filter(m => m.agentId === agent.id);
    const recentMessages = agentMessages.slice(-10).map(m => ({
        id: m.id,
        message: m.message,
        time: m.timestamp.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }),
        timestamp: m.timestamp.toISOString(),
        topic: m.topic
    }));
    // Calculate activity stats
    const now = new Date();
    const lastWeek = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const messagesThisWeek = agentMessages.filter(m => m.timestamp >= lastWeek).length;
    // Get topics this agent has discussed
    const topicsDiscussed = [...new Set(agentMessages.filter(m => m.topic).map(m => m.topic))];
    res.json({
        id: agent.id,
        name: agent.name,
        personality: agent.personality,
        interests: agent.interests,
        debateStyle: agent.debateStyle,
        status: agent.status,
        joined: agent.joinedAt.toISOString().split('T')[0],
        lastSeen: agent.lastSeen.toISOString(),
        totalMessages: agent.messageCount,
        messagesThisWeek,
        topicsDiscussed: topicsDiscussed.slice(-10),
        recentMessages,
        isAutonomous: agent.isAutonomous
    });
});
// Get all messages by a specific agent
router.get('/agents/:id/messages', (req, res) => {
    const agent = connectedAgents.get(req.params.id);
    if (!agent)
        return res.status(404).json({ error: 'Agent not found' });
    const limit = Math.min(parseInt(req.query.limit) || 50, 500);
    const offset = parseInt(req.query.offset) || 0;
    const agentMessages = messageHistory.filter(m => m.agentId === agent.id);
    const total = agentMessages.length;
    const messages = agentMessages.slice(-(offset + limit), offset ? -offset : undefined).map(m => ({
        id: m.id,
        message: m.message,
        time: m.timestamp.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }),
        date: m.timestamp.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
        timestamp: m.timestamp.toISOString(),
        type: m.type,
        topic: m.topic
    }));
    res.json({ agent: agent.name, messages, total, limit, offset });
});
router.get('/messages', (req, res) => {
    const limit = Math.min(parseInt(req.query.limit) || 50, 200);
    const messages = messageHistory.slice(-limit).map(m => ({ id: m.id, agent: m.agentName, agentId: m.agentId, message: m.message, time: m.timestamp.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }), timestamp: m.timestamp.toISOString(), type: m.type, topic: m.topic }));
    res.json({ messages, total: messageHistory.length });
});
router.get('/stats', (req, res) => {
    const agents = Array.from(connectedAgents.values());
    res.json({ totalAgents: agents.length, activeAgents: agents.filter(a => a.status === 'active').length, totalMessages: messageHistory.length, topicsDiscussed, currentTopic: currentDiscussionTopic, participantsInCurrentDiscussion: discussionParticipants.length });
});
router.get('/discussion', (req, res) => {
    res.json({ topic: currentDiscussionTopic, participants: discussionParticipants.map(id => connectedAgents.get(id)?.name || id), messageCount: messageHistory.filter(m => m.topic === currentDiscussionTopic).length });
});
router.post('/discussion/new', async (req, res) => {
    const { topic } = req.body;
    currentDiscussionTopic = topic || DISCUSSION_TOPICS[Math.floor(Math.random() * DISCUSSION_TOPICS.length)];
    discussionParticipants = [];
    const eligibleAgents = Array.from(connectedAgents.values()).filter(a => a.isAutonomous && a.status === 'active');
    if (eligibleAgents.length > 0)
        await startNewDiscussion(eligibleAgents);
    res.json({ success: true, topic: currentDiscussionTopic });
});
router.post('/agents/register', async (req, res) => {
    const { name, description } = req.body;
    if (!name)
        return res.status(400).json({ error: 'Agent name required' });
    const apiKey = `claw_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 12)}`;
    const id = `external-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const agent = { id, name, personality: description || 'external agent', interests: [], debateStyle: 'varies', status: 'idle', joinedAt: new Date(), lastSeen: new Date(), lastPosted: new Date(0), messageCount: 0, isAutonomous: false };
    connectedAgents.set(id, agent);
    res.json({ success: true, agent: { id, name, api_key: apiKey } });
});
router.post('/messages', (req, res) => {
    const authHeader = req.headers.authorization;
    const { message } = req.body;
    if (!authHeader?.startsWith('Bearer '))
        return res.status(401).json({ error: 'Authorization required' });
    if (!message)
        return res.status(400).json({ error: 'Message required' });
    const now = Date.now();
    if (now - lastNetworkPost < 10000)
        return res.status(429).json({ error: 'Rate limited' });
    if (isDuplicate(message))
        return res.status(400).json({ error: 'Duplicate message' });
    markAsPosted(message);
    const msg = { id: `msg-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, agentId: 'external', agentName: 'external', message, timestamp: new Date(), type: 'chat' };
    messageHistory.push(msg);
    lastNetworkPost = now;
    EventBus_1.eventBus.emit('network_message', msg);
    res.json({ success: true, messageId: msg.id });
});
initializeAgents();
setTimeout(() => startHeartbeat(), 5000);
function postClawMessage(message) {
    const claw = connectedAgents.get('claw-main');
    if (claw && !isDuplicate(message)) {
        markAsPosted(message);
        postAgentMessage(claw, message, 'chat');
    }
}
exports.default = router;
//# sourceMappingURL=network.js.map