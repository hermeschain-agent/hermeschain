#!/usr/bin/env node
/**
 * bulk-keys — TASK-139
 *
 * Generate N keypairs at once for test fixtures.
 *
 *   node backend/scripts/bulk-keys.js --count 100 > fixtures/keys.json
 */

'use strict';

const path = require('path');

function arg(name, def) {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : def;
}

const COUNT = Math.max(1, Number(arg('--count', '10')));
const { generateKeypair } = require(path.resolve(__dirname, '..', 'dist', 'blockchain', 'Crypto'));

const keys = [];
for (let i = 0; i < COUNT; i++) {
  keys.push(generateKeypair());
}
process.stdout.write(JSON.stringify(keys, null, 2) + '\n');
