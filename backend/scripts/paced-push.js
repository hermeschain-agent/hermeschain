#!/usr/bin/env node
/**
 * Paced commit pusher.
 *
 * Reads `data/push_pointer.txt` (just an integer N — the count of commits
 * already promoted from the local stack to origin/main) and pushes the
 * NEXT commit by advancing main one step at a time:
 *
 *   git push origin <commit-sha>:refs/heads/main
 *
 * Configurable via env:
 *   PUSH_BRANCH   — local source branch (default: tier-3-backlog)
 *   PUSH_TARGET   — remote ref          (default: main)
 *   PUSH_REMOTE   — remote name         (default: origin)
 *   PUSH_BATCH    — commits per fire    (default: 1)
 *   POINTER_FILE  — pointer state path  (default: data/push_pointer.txt)
 *
 * Cadence is set externally (cron, Hermes worker interval). At 60/day
 * with batch=1, fire every 24 minutes. With batch=5, every 2 hours.
 *
 * Idempotent: re-running with the same pointer pushes nothing if the
 * remote is already at the branch tip.
 */

'use strict';

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const POINTER_FILE = path.resolve(
  REPO_ROOT,
  process.env.POINTER_FILE || 'data/push_pointer.txt',
);
const BRANCH = process.env.PUSH_BRANCH || 'tier-3-backlog';
const TARGET = process.env.PUSH_TARGET || 'main';
const REMOTE = process.env.PUSH_REMOTE || 'origin';
const BATCH = Math.max(1, Number(process.env.PUSH_BATCH || '1'));

function readPointer() {
  try {
    const raw = fs.readFileSync(POINTER_FILE, 'utf8').trim();
    const n = parseInt(raw, 10);
    return Number.isFinite(n) && n >= 0 ? n : 0;
  } catch {
    return 0;
  }
}

function writePointer(n) {
  fs.mkdirSync(path.dirname(POINTER_FILE), { recursive: true });
  fs.writeFileSync(POINTER_FILE, `${n}\n`);
}

function git(args) {
  return execSync(['git', ...args].join(' '), {
    cwd: REPO_ROOT,
    encoding: 'utf8',
  }).trim();
}

function listForwardCommits() {
  const ref = `${REMOTE}/${TARGET}..${BRANCH}`;
  try {
    const out = git(['rev-list', '--reverse', ref]);
    return out ? out.split('\n').filter(Boolean) : [];
  } catch (err) {
    console.error(`[PACER] failed to enumerate commits: ${err && err.message ? err.message : err}`);
    return [];
  }
}

function pushCommit(sha) {
  try {
    const refspec = `${sha}:refs/heads/${TARGET}`;
    git(['push', REMOTE, refspec]);
    return true;
  } catch (err) {
    console.error(`[PACER] push of ${sha} failed: ${err && err.message ? err.message : err}`);
    return false;
  }
}

function main() {
  try {
    git(['fetch', REMOTE, TARGET]);
  } catch (err) {
    console.warn(`[PACER] fetch failed (continuing): ${err && err.message ? err.message : err}`);
  }

  const queue = listForwardCommits();
  if (queue.length === 0) {
    console.log('[PACER] nothing to push (target already at branch tip)');
    return;
  }

  console.log(`[PACER] ${queue.length} commit(s) ahead of ${REMOTE}/${TARGET}; pushing up to ${BATCH}`);

  const before = readPointer();
  let pushed = 0;
  for (let i = 0; i < BATCH && i < queue.length; i++) {
    const sha = queue[i];
    const subject = git(['log', '-1', '--pretty=%s', sha]);
    if (!pushCommit(sha)) {
      console.error('[PACER] aborting batch on first failure');
      break;
    }
    pushed++;
    console.log(`[PACER] pushed ${sha.slice(0, 8)} ${subject}`);
  }

  if (pushed > 0) {
    writePointer(before + pushed);
    console.log(`[PACER] pointer ${before} → ${before + pushed} (+${pushed})`);
  }
}

main();
