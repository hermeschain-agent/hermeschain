#!/usr/bin/env node
/**
 * schema-diff — TASK-327
 *
 * Compares table + column + index sets between two PG databases.
 * Read-only; never writes.
 *
 *   npm run schema:diff -- --left $DEV_URL --right $PROD_URL
 *
 * Exits 1 if diffs found (CI-friendly), 0 if identical.
 */

'use strict';

const { Client } = require('pg');

function parseArg(name) {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : null;
}

const LEFT = parseArg('--left');
const RIGHT = parseArg('--right');
if (!LEFT || !RIGHT) {
  console.error('usage: npm run schema:diff -- --left <url> --right <url>');
  process.exit(2);
}

async function introspect(url) {
  const client = new Client({ connectionString: url });
  await client.connect();
  try {
    const tables = (await client.query(
      `SELECT table_name FROM information_schema.tables
        WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
        ORDER BY table_name`
    )).rows.map((r) => r.table_name);

    const result = {};
    for (const t of tables) {
      const cols = (await client.query(
        `SELECT column_name, data_type, is_nullable, column_default
           FROM information_schema.columns
          WHERE table_schema = 'public' AND table_name = $1
          ORDER BY ordinal_position`, [t]
      )).rows;
      const indexes = (await client.query(
        `SELECT indexname, indexdef FROM pg_indexes
          WHERE schemaname = 'public' AND tablename = $1
          ORDER BY indexname`, [t]
      )).rows;
      result[t] = { columns: cols, indexes };
    }
    return result;
  } finally {
    await client.end();
  }
}

(async () => {
  const [left, right] = await Promise.all([introspect(LEFT), introspect(RIGHT)]);
  const allTables = new Set([...Object.keys(left), ...Object.keys(right)]);
  const diffs = [];

  for (const t of [...allTables].sort()) {
    if (!left[t]) { diffs.push(`+ table ${t} (only on right)`); continue; }
    if (!right[t]) { diffs.push(`- table ${t} (only on left)`); continue; }

    // Column diff
    const lcols = new Map(left[t].columns.map((c) => [c.column_name, c]));
    const rcols = new Map(right[t].columns.map((c) => [c.column_name, c]));
    const allCols = new Set([...lcols.keys(), ...rcols.keys()]);
    for (const col of [...allCols].sort()) {
      if (!lcols.has(col)) { diffs.push(`+ ${t}.${col} (only on right)`); continue; }
      if (!rcols.has(col)) { diffs.push(`- ${t}.${col} (only on left)`); continue; }
      const a = lcols.get(col), b = rcols.get(col);
      if (a.data_type !== b.data_type || a.is_nullable !== b.is_nullable) {
        diffs.push(`~ ${t}.${col}: ${a.data_type}/${a.is_nullable} vs ${b.data_type}/${b.is_nullable}`);
      }
    }

    // Index diff (by name)
    const lidx = new Set(left[t].indexes.map((i) => i.indexname));
    const ridx = new Set(right[t].indexes.map((i) => i.indexname));
    for (const i of lidx) if (!ridx.has(i)) diffs.push(`- index ${t}.${i} (only on left)`);
    for (const i of ridx) if (!lidx.has(i)) diffs.push(`+ index ${t}.${i} (only on right)`);
  }

  if (diffs.length === 0) {
    console.log('[SCHEMA DIFF] no differences');
    process.exit(0);
  }
  console.log(`[SCHEMA DIFF] ${diffs.length} difference(s):`);
  for (const d of diffs) console.log(`  ${d}`);
  process.exit(1);
})().catch((err) => {
  console.error('[SCHEMA DIFF] failed:', err && err.message ? err.message : err);
  process.exit(2);
});
