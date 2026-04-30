import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

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

export class PacedPusher {
  private interval: NodeJS.Timeout | null = null;
  private repoRoot: string;
  private pointerFile: string;
  private branch: string;
  private target: string;
  private remote: string;
  private batch: number;
  private intervalMs: number;

  constructor(repoRoot: string) {
    this.repoRoot = repoRoot;
    this.pointerFile = path.resolve(
      repoRoot,
      process.env.POINTER_FILE || 'data/push_pointer.txt',
    );
    this.branch = process.env.PUSH_BRANCH || 'tier-3-backlog';
    this.target = process.env.PUSH_TARGET || 'main';
    this.remote = process.env.PUSH_REMOTE || 'origin';
    this.batch = Math.max(1, Number(process.env.PUSH_BATCH || '1'));
    this.intervalMs = Math.max(60_000, Number(process.env.PUSH_INTERVAL_MS || '1440000'));
  }

  start(): void {
    if (this.interval) return;
    if (process.env.PACED_PUSH_ENABLED !== 'true') {
      console.log('[PACER] disabled (set PACED_PUSH_ENABLED=true to activate)');
      return;
    }
    if (!process.env.GITHUB_TOKEN) {
      console.log('[PACER] disabled (no GITHUB_TOKEN)');
      return;
    }
    console.log(
      `[PACER] active — every ${Math.round(this.intervalMs / 60000)} min, ` +
      `${this.batch} commit(s)/fire from ${this.branch} → ${this.target}`,
    );
    // Fire once shortly after boot, then on the interval.
    setTimeout(() => this.tick(), 30_000);
    this.interval = setInterval(() => this.tick(), this.intervalMs);
  }

  stop(): void {
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
    }
  }

  private git(args: string[]): string {
    try {
      return execSync(['git', ...args].join(' '), {
        cwd: this.repoRoot,
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
      }).trim();
    } catch (err: any) {
      // Surface stderr so the push failure reason is visible in logs.
      const stderr = err?.stderr?.toString?.() || '';
      const stdout = err?.stdout?.toString?.() || '';
      const combined = [stderr, stdout].filter(Boolean).join(' ').trim();
      const wrapped = new Error(
        `${err?.message || 'git failed'}${combined ? ' — ' + combined : ''}`,
      );
      throw wrapped;
    }
  }

  private listForwardCommits(): string[] {
    const ref = `${this.remote}/${this.target}..${this.remote}/${this.branch}`;
    try {
      const out = this.git(['rev-list', '--reverse', ref]);
      return out ? out.split('\n').filter(Boolean) : [];
    } catch (err: any) {
      console.error(`[PACER] enumerate failed: ${err?.message || err}`);
      return [];
    }
  }

  private readPointer(): number {
    try {
      const raw = fs.readFileSync(this.pointerFile, 'utf8').trim();
      const n = parseInt(raw, 10);
      return Number.isFinite(n) && n >= 0 ? n : 0;
    } catch {
      return 0;
    }
  }

  private writePointer(n: number): void {
    fs.mkdirSync(path.dirname(this.pointerFile), { recursive: true });
    fs.writeFileSync(this.pointerFile, `${n}\n`);
  }

  private tick(): void {
    try {
      // Unshallow first — GitIntegration clones with --depth 50, so the
      // intermediate commits we want to push aren't in the local object
      // store yet. --unshallow is a no-op once the repo is already deep.
      try { this.git(['fetch', '--unshallow', this.remote]); }
      catch { /* already unshallow, ignore */ }
      // Force-fetch all branches via explicit refspec — single-branch
      // clones don't have origin/<other> tracking refs by default.
      this.git(['fetch', this.remote, '+refs/heads/*:refs/remotes/' + this.remote + '/*']);
    } catch (err: any) {
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
      } catch (err: any) {
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
