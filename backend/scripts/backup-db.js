#!/usr/bin/env node
/**
 * backup-db — TASK-323
 *
 * Runs pg_dump on DATABASE_URL, gzips, uploads to S3 with date-stamped key:
 *   ${S3_BACKUP_PREFIX}${YYYY-MM-DD}/hermes-${HH:MM:SS}.sql.gz
 *
 * Required env: DATABASE_URL, S3_BACKUP_BUCKET, AWS_REGION,
 * AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY (or instance role).
 * Optional: S3_BACKUP_PREFIX (default 'hermes-backups/').
 *
 * Usage:
 *   npm run backup
 *   npm run backup -- --prune    # also delete keys older than 30d
 */

'use strict';

const { spawn } = require('child_process');
const { S3Client, PutObjectCommand, ListObjectsV2Command, DeleteObjectsCommand } =
  (() => {
    try {
      return require('@aws-sdk/client-s3');
    } catch {
      console.error('Missing @aws-sdk/client-s3. Install with: npm i -w backend @aws-sdk/client-s3');
      process.exit(2);
    }
  })();

const DATABASE_URL = process.env.DATABASE_URL;
const BUCKET = process.env.S3_BACKUP_BUCKET;
const REGION = process.env.AWS_REGION || 'us-east-1';
const PREFIX = (process.env.S3_BACKUP_PREFIX || 'hermes-backups/').replace(/\/?$/, '/');
const RETAIN_DAYS = Number(process.env.BACKUP_RETAIN_DAYS || '30');

if (!DATABASE_URL) { console.error('DATABASE_URL required'); process.exit(2); }
if (!BUCKET) { console.error('S3_BACKUP_BUCKET required'); process.exit(2); }

function nowKey() {
  const d = new Date();
  const ymd = d.toISOString().slice(0, 10);
  const hms = d.toISOString().slice(11, 19).replace(/:/g, '-');
  return `${PREFIX}${ymd}/hermes-${hms}.sql.gz`;
}

async function backup() {
  const key = nowKey();
  const startedAt = Date.now();
  console.log(`[BACKUP] dumping → s3://${BUCKET}/${key}`);

  // pg_dump | gzip — collect into a buffer (simple; for >1GB swap to multipart upload).
  const chunks = [];
  await new Promise((resolve, reject) => {
    const dump = spawn('pg_dump', ['--no-owner', '--no-acl', DATABASE_URL]);
    const gzip = spawn('gzip', ['-c']);
    dump.stdout.pipe(gzip.stdin);
    dump.stderr.on('data', (d) => process.stderr.write(d));
    gzip.stdout.on('data', (c) => chunks.push(c));
    let dumpExit = null, gzipExit = null;
    const done = (err) => {
      if (err) return reject(err);
      if (dumpExit !== null && gzipExit !== null) {
        if (dumpExit !== 0) return reject(new Error(`pg_dump exit ${dumpExit}`));
        if (gzipExit !== 0) return reject(new Error(`gzip exit ${gzipExit}`));
        resolve();
      }
    };
    dump.on('close', (c) => { dumpExit = c; done(); });
    gzip.on('close', (c) => { gzipExit = c; done(); });
    dump.on('error', reject);
    gzip.on('error', reject);
  });

  const body = Buffer.concat(chunks);
  const s3 = new S3Client({ region: REGION });
  await s3.send(new PutObjectCommand({ Bucket: BUCKET, Key: key, Body: body }));
  const durationMs = Date.now() - startedAt;
  console.log(`[BACKUP] uploaded ${body.length} bytes in ${durationMs}ms`);

  if (process.argv.includes('--prune') && RETAIN_DAYS > 0) {
    await prune(s3);
  }
}

async function prune(s3) {
  const cutoff = Date.now() - RETAIN_DAYS * 86400_000;
  const list = await s3.send(new ListObjectsV2Command({ Bucket: BUCKET, Prefix: PREFIX }));
  const stale = (list.Contents || []).filter((o) => o.LastModified && o.LastModified.getTime() < cutoff);
  if (stale.length === 0) {
    console.log(`[BACKUP] no objects older than ${RETAIN_DAYS}d`);
    return;
  }
  await s3.send(new DeleteObjectsCommand({
    Bucket: BUCKET,
    Delete: { Objects: stale.map((o) => ({ Key: o.Key })) },
  }));
  console.log(`[BACKUP] pruned ${stale.length} stale object(s)`);
}

backup().catch((err) => {
  console.error('[BACKUP] failed:', err && err.message ? err.message : err);
  process.exit(1);
});
