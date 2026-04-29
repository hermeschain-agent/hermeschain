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
exports.PacedPusher = void 0;
const child_process_1 = require("child_process");
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
/**
 * PacedPusher — runs inside the Railway worker process. Every PUSH_INTERVAL_MS
 * (default 24min = 60/day), fetches origin and advances refs/heads/main by
 * one commit drawn from origin/PUSH_BRANCH (default tier-3-backlog).
 *
 * Disabled by default. Activate by setting:
 *   PACED_PUSH_ENABLED=true
 *   GITHUB_TOKEN=<token with repo write>
 *
 * Optional:
 *   PUSH_BRANCH=tier-3-backlog
 *   PUSH_TARGET=main
 *   PUSH_REMOTE=origin
 *   PUSH_BATCH=1
 *   PUSH_INTERVAL_MS=1440000   (24 minutes)
 *   POINTER_FILE=data/push_pointer.txt
 */
class PacedPusher {
    constructor(repoRoot) {
        this.interval = null;
        this.repoRoot = repoRoot;
        this.pointerFile = path.resolve(repoRoot, process.env.POINTER_FILE || 'data/push_pointer.txt');
        this.branch = process.env.PUSH_BRANCH || 'tier-3-backlog';
        this.target = process.env.PUSH_TARGET || 'main';
        this.remote = process.env.PUSH_REMOTE || 'origin';
        this.batch = Math.max(1, Number(process.env.PUSH_BATCH || '1'));
        this.intervalMs = Math.max(60000, Number(process.env.PUSH_INTERVAL_MS || '1440000'));
    }
    start() {
        if (this.interval)
            return;
        if (process.env.PACED_PUSH_ENABLED !== 'true') {
            console.log('[PACER] disabled (set PACED_PUSH_ENABLED=true to activate)');
            return;
        }
        if (!process.env.GITHUB_TOKEN) {
            console.log('[PACER] disabled (no GITHUB_TOKEN)');
            return;
        }
        console.log(`[PACER] active — every ${Math.round(this.intervalMs / 60000)} min, ` +
            `${this.batch} commit(s)/fire from ${this.branch} → ${this.target}`);
        // Fire once shortly after boot, then on the interval.
        setTimeout(() => this.tick(), 30000);
        this.interval = setInterval(() => this.tick(), this.intervalMs);
    }
    stop() {
        if (this.interval) {
            clearInterval(this.interval);
            this.interval = null;
        }
    }
    git(args) {
        return (0, child_process_1.execSync)(['git', ...args].join(' '), {
            cwd: this.repoRoot,
            encoding: 'utf8',
        }).trim();
    }
    listForwardCommits() {
        const ref = `${this.remote}/${this.target}..${this.remote}/${this.branch}`;
        try {
            const out = this.git(['rev-list', '--reverse', ref]);
            return out ? out.split('\n').filter(Boolean) : [];
        }
        catch (err) {
            console.error(`[PACER] enumerate failed: ${err?.message || err}`);
            return [];
        }
    }
    readPointer() {
        try {
            const raw = fs.readFileSync(this.pointerFile, 'utf8').trim();
            const n = parseInt(raw, 10);
            return Number.isFinite(n) && n >= 0 ? n : 0;
        }
        catch {
            return 0;
        }
    }
    writePointer(n) {
        fs.mkdirSync(path.dirname(this.pointerFile), { recursive: true });
        fs.writeFileSync(this.pointerFile, `${n}\n`);
    }
    tick() {
        try {
            this.git(['fetch', this.remote, this.target, this.branch]);
        }
        catch (err) {
            console.warn(`[PACER] fetch failed: ${err?.message || err}`);
            return;
        }
        const queue = this.listForwardCommits();
        if (queue.length === 0) {
            console.log(`[PACER] nothing to push (target = branch tip)`);
            return;
        }
        console.log(`[PACER] ${queue.length} commit(s) ahead; pushing up to ${this.batch}`);
        let pushed = 0;
        for (let i = 0; i < this.batch && i < queue.length; i++) {
            const sha = queue[i];
            try {
                const subject = this.git(['log', '-1', '--pretty=%s', sha]);
                this.git(['push', this.remote, `${sha}:refs/heads/${this.target}`]);
                console.log(`[PACER] pushed ${sha.slice(0, 8)} ${subject}`);
                pushed++;
            }
            catch (err) {
                console.error(`[PACER] push of ${sha} failed: ${err?.message || err}`);
                break;
            }
        }
        if (pushed > 0) {
            const before = this.readPointer();
            this.writePointer(before + pushed);
        }
    }
}
exports.PacedPusher = PacedPusher;
//# sourceMappingURL=PacedPusher.js.map