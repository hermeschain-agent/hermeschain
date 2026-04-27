#!/usr/bin/env node
/**
 * migrate:status — TASK-326
 *
 *   npm run migrate:status              # list applied + pending
 *   npm run migrate:status -- --dry-run # log SQL each pending would run, no writes
 */

'use strict';

const path = require('path');
const { migrationStatus, applyPendingMigrations } = require(path.resolve(__dirname, '..', 'dist', 'database', 'migrations'));
const { db } = require(path.resolve(__dirname, '..', 'dist', 'database', 'db'));

async function main() {
  await db.connect();

  if (process.argv.includes('--dry-run')) {
    console.log('[MIGRATE:STATUS] dry-run — printing pending SQL without applying\n');
    await applyPendingMigrations({ dryRun: true });
    return;
  }

  const status = await migrationStatus();
  console.log(`Applied (${status.applied.length}):`);
  for (const name of status.applied) console.log(`  + ${name}`);
  console.log(`\nPending (${status.pending.length}):`);
  for (const name of status.pending) console.log(`  - ${name}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
