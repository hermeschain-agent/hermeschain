#!/usr/bin/env node
/**
 * restore-db — TASK-324
 *
 * Downloads a backup from S3 and restores into RESTORE_DATABASE_URL.
 * Refuses to restore into a target equal to DATABASE_URL unless --force.
 *
 *   npm run restore -- --latest
 *   npm run restore -- --key hermes-backups/2026-04-27/hermes-12-00-00.sql.gz
 */

'use strict';

const { spawn } = require('child_process');
const { Readable } = require('stream');
const zlib = require('zlib');
const { S3Client, GetObjectCommand, ListObjectsV2Command } =
  (() => {
    try { return require('@aws-sdk/client-s3'); }
    catch { console.error('Missing @aws-sdk/client-s3. Install with: npm i -w backend @aws-sdk/client-s3'); process.exit(2); }
  })();

const TARGET = process.env.RESTORE_DATABASE_URL;
const SOURCE = process.env.DATABASE_URL;
const BUCKET = process.env.S3_BACKUP_BUCKET;
const REGION = process.env.AWS_REGION || 'us-east-1';
const PREFIX = (process.env.S3_BACKUP_PREFIX || 'hermes-backups/').replace(/\/?$/, '/');

if (!TARGET) { console.error('RESTORE_DATABASE_URL required'); process.exit(2); }
if (!BUCKET) { console.error('S3_BACKUP_BUCKET required'); process.exit(2); }
if (TARGET === SOURCE && !process.argv.includes('--force')) {
  console.error('refusing to restore into DATABASE_URL (production source). Re-run with --force to override.');
  process.exit(2);
}

async function pickKey(s3) {
  const idx = process.argv.indexOf('--key');
  if (idx >= 0 && process.argv[idx + 1]) return process.argv[idx + 1];
  if (!process.argv.includes('--latest')) {
    console.error('specify --latest or --key <s3 key>');
    process.exit(2);
  }
  const list = await s3.send(new ListObjectsV2Command({ Bucket: BUCKET, Prefix: PREFIX }));
  const objs = (list.Contents || []).filter((o) => o.Key.endsWith('.sql.gz'));
  objs.sort((a, b) => b.LastModified - a.LastModified);
  if (objs.length === 0) { console.error('no backups found'); process.exit(1); }
  return objs[0].Key;
}

async function restore() {
  const s3 = new S3Client({ region: REGION });
  const key = await pickKey(s3);
  console.log(`[RESTORE] downloading s3://${BUCKET}/${key}`);
  const obj = await s3.send(new GetObjectCommand({ Bucket: BUCKET, Key: key }));
  const stream = obj.Body;

  await new Promise((resolve, reject) => {
    const psql = spawn('psql', ['--dbname=' + TARGET, '--quiet']);
    psql.stderr.on('data', (d) => process.stderr.write(d));
    stream.pipe(zlib.createGunzip()).pipe(psql.stdin);
    psql.on('close', (c) => c === 0 ? resolve() : reject(new Error(`psql exit ${c}`)));
    psql.on('error', reject);
  });

  // Smoke check
  const smoke = spawn('psql', ['--dbname=' + TARGET, '-A', '-t', '-c',
    `SELECT 'blocks=' || COUNT(*) FROM blocks; SELECT 'transactions=' || COUNT(*) FROM transactions;`]);
  smoke.stdout.on('data', (d) => process.stdout.write(d));
  smoke.on('close', (c) => process.exit(c));
}

restore().catch((err) => {
  console.error('[RESTORE] failed:', err && err.message ? err.message : err);
  process.exit(1);
});
