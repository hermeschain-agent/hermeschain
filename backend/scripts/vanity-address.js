#!/usr/bin/env node
/**
 * vanity-address — TASK-138
 *
 * Brute-force keypair generation until address starts with prefix.
 *
 *   node backend/scripts/vanity-address.js --prefix Hermes --max 1000000
 *
 * NOTE: long prefixes are exponentially slow. 4 chars ~ instant.
 *       6 chars ~ minutes. 8 chars ~ hours. base58 = 58 chars in alphabet.
 */

'use strict';

const path = require('path');

function arg(name, def) {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : def;
}

const PREFIX = arg('--prefix', 'a');
const MAX = Number(arg('--max', '1000000'));
const STARTS_WITH = arg('--starts-with', 'true') !== 'false';

const { generateKeypair } = require(path.resolve(__dirname, '..', 'dist', 'blockchain', 'Crypto'));

const startedAt = Date.now();
let attempts = 0;
let found = null;

while (attempts < MAX) {
  attempts++;
  const kp = generateKeypair();
  if (STARTS_WITH) {
    if (kp.publicKey.startsWith(PREFIX)) { found = kp; break; }
  } else {
    if (kp.publicKey.includes(PREFIX)) { found = kp; break; }
  }
  if (attempts % 50000 === 0) {
    console.error(`[VANITY] ${attempts.toLocaleString()} attempts, no match yet`);
  }
}

const elapsedMs = Date.now() - startedAt;
if (!found) {
  console.error(`[VANITY] no match after ${attempts.toLocaleString()} attempts in ${elapsedMs}ms`);
  process.exit(1);
}

console.log(JSON.stringify({
  attempts,
  elapsedMs,
  publicKey: found.publicKey,
  privateKey: found.privateKey,
}, null, 2));
