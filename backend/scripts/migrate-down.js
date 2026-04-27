#!/usr/bin/env node
/**
 * migrate:down — TASK-325
 *
 * Roll back a single applied migration by running its `-- down:` half
 * and removing its row from schema_migrations.
 *
 *   npm run migrate:down -- 0007
 *
 * Refuses to run in production unless FORCE_PROD_DOWN=1.
 */

'use strict';

const path = require('path');
const { loadMigrationsFromDir, getMigrationsDir } = require(path.resolve(__dirname, '..', 'dist', 'database', 'migrations'));
const { db } = require(path.resolve(__dirname, '..', 'dist', 'database', 'db'));

async function main() {
  const arg = process.argv[2];
  if (!arg) {
    console.error('usage: npm run migrate:down -- <NNNN>');
    process.exit(2);
  }

  if (process.env.NODE_ENV === 'production' && process.env.FORCE_PROD_DOWN !== '1') {
    console.error('refusing to run in production without FORCE_PROD_DOWN=1');
    process.exit(2);
  }

  await db.connect();
  const migrations = loadMigrationsFromDir(getMigrationsDir());
  const target = migrations.find((m) => m.name.startsWith(arg));
  if (!target) {
    console.error(`no migration matches ${arg}`);
    process.exit(1);
  }
  if (!target.down || target.down.trim().length === 0) {
    console.error(`migration ${target.name} has no -- down: block`);
    process.exit(1);
  }

  console.log(`[MIGRATE:DOWN] ${target.name}`);
  console.log(target.down);
  console.log('---');

  await db.exec(target.down);
  await db.query(`DELETE FROM schema_migrations WHERE name = $1`, [target.name]);
  console.log(`[MIGRATE:DOWN] ${target.name} reverted; row removed from schema_migrations`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
