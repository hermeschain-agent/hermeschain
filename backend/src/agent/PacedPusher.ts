import { execFileSync } from 'child_process';
import {
  getNextQueuedSourceCommit,
  getPublishIntervalMs,
  getPublishQueueConfig,
  getPublishQueueStatusSnapshot,
  findPublishedCommitByTree,
  hasPublishedTree,
  markQueuedCommitProcessed,
  refreshPublishQueueStatus,
} from './PublishQueue';
import { assessCommitForSha } from './CommitQuality';

export interface PublishTickResult {
  pushed: boolean;
  skippedDuplicate: boolean;
  sourceCommitSha: string | null;
  publishedCommitSha: string | null;
  subject: string | null;
}

function publisherEnabled(): boolean {
  const raw = (process.env.PACED_PUSH_ENABLED || '').toLowerCase();
  if (raw === 'false' || raw === '0') return false;
  if (raw === 'true' || raw === '1') return true;
  return getPublishQueueConfig().autoPushEnabled;
}

function duplicateSkipBatchSize(): number {
  const raw = Number.parseInt(process.env.AGENT_DUPLICATE_SKIP_BATCH || '', 10);
  return Number.isFinite(raw) && raw > 0 ? raw : 100;
}

function sanitizePublishedCommitMessage(message: string): string {
  const cleaned = message
    .replace(/\r\n/g, '\n')
    .split('\n')
    .filter((line) => {
      const normalized = line.toLowerCase();
      if (!normalized.startsWith('co-authored-by:')) {
        return true;
      }
      return !(normalized.includes('claude') || normalized.includes('anthropic'));
    })
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  return cleaned || message.trim().split('\n')[0] || 'chore(agent): publish queued commit';
}

function addPacerLog(
  type: string,
  content: string,
  metadata?: Record<string, unknown>,
): void {
  const addLog = (global as any).addLog;
  if (typeof addLog === 'function') {
    addLog(type, content, undefined, metadata?.subject as string | undefined, metadata);
  }
}

export class PacedPusher {
  private interval: NodeJS.Timeout | null = null;
  private repoRoot: string;
  private tickInFlight = false;

  constructor(repoRoot: string) {
    this.repoRoot = repoRoot;
  }

  start(): void {
    if (this.interval) return;

    if (!publisherEnabled()) {
      console.log('[PACER] disabled (publishing is not enabled in this environment)');
      return;
    }

    const config = getPublishQueueConfig();
    console.log(
      `[PACER] active — every ${config.intervalMinutes} min, ` +
      `1 commit/fire from ${config.queueBranch} -> ${config.publishBranch}`,
    );

    const runTick = () => {
      this.tickNow().catch((err: any) => {
        console.error('[PACER] tick failed:', err?.message || err);
      });
    };

    setTimeout(runTick, 15_000);
    this.interval = setInterval(runTick, getPublishIntervalMs(config));
  }

  stop(): void {
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
    }
  }

  getStatus() {
    return getPublishQueueStatusSnapshot();
  }

  async tickNow(): Promise<PublishTickResult> {
    if (this.tickInFlight) {
      return {
        pushed: false,
        skippedDuplicate: false,
        sourceCommitSha: null,
        publishedCommitSha: null,
        subject: null,
      };
    }

    this.tickInFlight = true;
    try {
      const config = getPublishQueueConfig();
      const status = await refreshPublishQueueStatus(this.repoRoot, {
        force: true,
        refreshRemote: true,
      });

      if (!status.enabled) {
        console.log(`[PACER] disabled: ${status.publishingPausedReason || 'publishing unavailable'}`);
        return {
          pushed: false,
          skippedDuplicate: false,
          sourceCommitSha: null,
          publishedCommitSha: null,
          subject: null,
        };
      }

      if (!status.publisherLeader) {
        console.log('[PACER] skipping tick — this worker is not the publisher leader');
        return {
          pushed: false,
          skippedDuplicate: false,
          sourceCommitSha: null,
          publishedCommitSha: null,
          subject: null,
        };
      }

      if (status.nextPublishAt && new Date(status.nextPublishAt).getTime() > Date.now()) {
        return {
          pushed: false,
          skippedDuplicate: false,
          sourceCommitSha: null,
          publishedCommitSha: null,
          subject: null,
        };
      }

      let duplicateSkips = 0;
      let qualitySkips = 0;
      const maxSkipsPerTick = duplicateSkipBatchSize();

      while (true) {
        const nextCommit = await getNextQueuedSourceCommit(this.repoRoot, {
          refreshRemote: duplicateSkips === 0,
        });
        if (!nextCommit) {
          await refreshPublishQueueStatus(this.repoRoot, {
            force: true,
            refreshRemote: false,
          });
          console.log('[PACER] queue drained — no unpublished commits remain');
          return {
            pushed: false,
            skippedDuplicate: duplicateSkips > 0,
            sourceCommitSha: null,
            publishedCommitSha: null,
            subject: null,
          };
        }

        const alreadyPublishedCommit =
          findPublishedCommitByTree(this.repoRoot, nextCommit.treeSha, config);
        const treeAlreadyPublished =
          alreadyPublishedCommit !== null ||
          await hasPublishedTree(nextCommit.treeSha, config, this.repoRoot);
        if (treeAlreadyPublished) {
          duplicateSkips++;
          await markQueuedCommitProcessed(config, {
            sourceCommitSha: nextCommit.sourceCommitSha,
            treeSha: nextCommit.treeSha,
            subject: nextCommit.subject,
            publishedCommitSha: alreadyPublishedCommit,
            skippedDuplicate: true,
            advanceSchedule: false,
          });
          console.log(
            `[PACER] skipped duplicate tree for ${nextCommit.sourceCommitSha.slice(0, 8)} ${nextCommit.subject}`
          );

          if (duplicateSkips + qualitySkips >= maxSkipsPerTick) {
            await refreshPublishQueueStatus(this.repoRoot, {
              force: true,
              refreshRemote: false,
            });
            console.log(`[PACER] paused drain after ${duplicateSkips + qualitySkips} skip(s)`);
            return {
              pushed: false,
              skippedDuplicate: true,
              sourceCommitSha: nextCommit.sourceCommitSha,
              publishedCommitSha: null,
              subject: nextCommit.subject,
            };
          }

          continue;
        }

        // Quality gate — never replay stub garbage onto the publish branch.
        // The skipped commit is recorded as processed (reusing the duplicate
        // path's cursor semantics) so the queue advances past it without
        // burning the publish interval.
        const quality = assessCommitForSha(this.repoRoot, nextCommit.sourceCommitSha);
        if (!quality.quality) {
          qualitySkips++;
          await markQueuedCommitProcessed(config, {
            sourceCommitSha: nextCommit.sourceCommitSha,
            treeSha: nextCommit.treeSha,
            subject: nextCommit.subject,
            publishedCommitSha: null,
            skippedDuplicate: true,
            advanceSchedule: false,
          });
          console.log(
            `[PACER] skipped low-quality ${nextCommit.sourceCommitSha.slice(0, 8)}: ` +
            `${quality.reason} — ${nextCommit.subject}`
          );
          addPacerLog(
            'git_skip',
            `Skipped low-quality ${nextCommit.sourceCommitSha.slice(0, 8)}: ${quality.reason}`,
            {
              type: 'skip_low_quality',
              sourceCommitSha: nextCommit.sourceCommitSha,
              subject: nextCommit.subject,
              reason: quality.reason,
            }
          );

          if (duplicateSkips + qualitySkips >= maxSkipsPerTick) {
            await refreshPublishQueueStatus(this.repoRoot, {
              force: true,
              refreshRemote: false,
            });
            console.log(`[PACER] paused drain after ${duplicateSkips + qualitySkips} skip(s)`);
            return {
              pushed: false,
              skippedDuplicate: duplicateSkips > 0,
              sourceCommitSha: nextCommit.sourceCommitSha,
              publishedCommitSha: null,
              subject: nextCommit.subject,
            };
          }

          continue;
        }

        const publishedCommitSha = this.publishCommit(nextCommit);
        await markQueuedCommitProcessed(config, {
          sourceCommitSha: nextCommit.sourceCommitSha,
          treeSha: nextCommit.treeSha,
          subject: nextCommit.subject,
          publishedCommitSha,
          skippedDuplicate: false,
          advanceSchedule: true,
        });
        await refreshPublishQueueStatus(this.repoRoot, {
          force: true,
          refreshRemote: true,
        });

        console.log(
          `[PACER] pushed ${publishedCommitSha.slice(0, 8)} ` +
          `(from ${nextCommit.sourceCommitSha.slice(0, 8)}, skipped ${duplicateSkips + qualitySkips}) ${nextCommit.subject}`
        );
        addPacerLog(
          'git_commit',
          `Published ${publishedCommitSha.slice(0, 8)} to ${config.publishBranch}: ${nextCommit.subject}`,
          {
            type: 'publish_commit',
            commit: publishedCommitSha,
            fullHash: publishedCommitSha,
            sourceCommitSha: nextCommit.sourceCommitSha,
            branch: config.publishBranch,
            queueBranch: config.queueBranch,
            subject: nextCommit.subject,
            skippedDuplicate: false,
          }
        );

        return {
          pushed: true,
          skippedDuplicate: false,
          sourceCommitSha: nextCommit.sourceCommitSha,
          publishedCommitSha,
          subject: nextCommit.subject,
        };
      }
    } finally {
      this.tickInFlight = false;
    }
  }

  private publishCommit(sourceCommit: {
    sourceCommitSha: string;
    treeSha: string;
    message: string;
    authorName: string;
    authorEmail: string;
  }): string {
    const config = getPublishQueueConfig();
    const parent = execFileSync(
      'git',
      ['rev-parse', `${config.remote}/${config.publishBranch}`],
      {
        cwd: this.repoRoot,
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
      }
    ).trim();

    const nowSec = Math.floor(Date.now() / 1000);
    const tz = '+0000';
    const publishedCommitSha = execFileSync(
      'git',
      [
        'commit-tree',
        sourceCommit.treeSha,
        '-p',
        parent,
        '-m',
        sanitizePublishedCommitMessage(sourceCommit.message),
      ],
      {
        cwd: this.repoRoot,
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
        env: {
          ...process.env,
          GIT_AUTHOR_NAME: sourceCommit.authorName,
          GIT_AUTHOR_EMAIL: sourceCommit.authorEmail,
          GIT_AUTHOR_DATE: `${nowSec} ${tz}`,
          GIT_COMMITTER_NAME: 'hermes agent',
          GIT_COMMITTER_EMAIL: 'hermeschain-agent@users.noreply.github.com',
          GIT_COMMITTER_DATE: `${nowSec} ${tz}`,
        },
      }
    ).trim();

    execFileSync(
      'git',
      ['push', config.remote, `${publishedCommitSha}:refs/heads/${config.publishBranch}`],
      {
        cwd: this.repoRoot,
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
      }
    );

    return publishedCommitSha;
  }
}
