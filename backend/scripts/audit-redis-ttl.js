#!/usr/bin/env node
/**
 * audit-redis-ttl — TASK-329
 *
 * Walks backend/src for cache.set / cache.setJSON / cache.hset callsites
 * and flags any without an explicit TTL. Prints leaks one-per-line and
 * exits non-zero on findings (CI-friendly).
 *
 *   npm run audit:redis-ttl
 */

'use strict';

const fs = require('fs');
const path = require('path');

const SRC_ROOT = path.resolve(__dirname, '..', 'src');
const PATTERN = /\bcache\.(set|setJSON|hset)\s*\(/g;

let leaks = [];

function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(full);
    } else if (entry.name.endsWith('.ts')) {
      auditFile(full);
    }
  }
}

function auditFile(file) {
  const text = fs.readFileSync(file, 'utf8');
  const lines = text.split('\n');
  for (let i = 0; i < lines.length; i++) {
    PATTERN.lastIndex = 0;
    const match = PATTERN.exec(lines[i]);
    if (!match) continue;

    // Heuristic: count commas before line-ending or close-paren on this line
    // and the next 2 lines. cache.set('k', v)        → 1 comma → no TTL
    //                       cache.set('k', v, 60)    → 2 commas → TTL set
    const slice = lines.slice(i, Math.min(i + 3, lines.length)).join('\n');
    const fnCall = slice.slice(slice.indexOf(match[0]));
    const closeIdx = fnCall.indexOf(')');
    if (closeIdx < 0) continue;
    const argsBlock = fnCall.slice(0, closeIdx);
    const commaCount = (argsBlock.match(/,/g) || []).length;
    const requiredCommas = match[1] === 'hset' ? 2 : 1; // hset(key, field, value) vs set(key, value)
    if (commaCount <= requiredCommas) {
      const rel = path.relative(process.cwd(), file);
      leaks.push(`${rel}:${i + 1} — ${match[0]}…) [no TTL]`);
    }
  }
}

walk(SRC_ROOT);

if (leaks.length === 0) {
  console.log('[AUDIT] no missing-TTL cache writes found');
  process.exit(0);
}
console.log(`[AUDIT] ${leaks.length} cache write(s) without TTL:`);
for (const leak of leaks) console.log(`  ${leak}`);
process.exit(1);
