import * as fs from 'fs';
import * as path from 'path';
import { db } from './db';

/**
 * Sequential DB migration runner.
 *
 * Migration files live under backend/src/database/migrations/ (or the
 * dist/ mirror at runtime). Each file is named NNNN_slug.sql and has
 * two optional sections separated by the literal marker `-- down:`:
 *
 *   -- up:
 *   CREATE TABLE foo ...;
 *
 *   -- down:
 *   DROP TABLE foo;
 *
 * Only the `up` half runs in production. The `down` half is recorded
 * for local-dev rollback tooling but never executed by applyPending.
 *
 * Applied migrations are tracked in `schema_migrations(name, applied_at)`
 * so re-boots are idempotent. Concurrent replicas coordinate via
 * pg_advisory_lock keyed on HERMES_MIGRATION_LOCK_ID.
 */

const HERMES_MIGRATION_LOCK_ID = 0x4845524d; // 'HERM' hex-ish

export interface MigrationFile {
  readonly name: string;
  readonly up: string;
  readonly down: string;
}

export interface MigrationResult {
  readonly name: string;
  readonly success: boolean;
  readonly durationMs: number;
  readonly error?: string;
}

/** Load every .sql file from `dir` sorted lexicographically. */
function loadMigrationsFrom(dir: string): MigrationFile[] {
  let entries: string[] = [];
  try {
    entries = fs.readdirSync(dir);
  } catch (err: any) {
    console.warn(`[MIGRATIONS] dir not found (${dir}):`, err?.message || err);
    return [];
  }
  const files = entries
    .filter((f) => f.endsWith('.sql'))
    .sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));

  return files.map((file) => {
    const raw = fs.readFileSync(path.join(dir, file), 'utf8');
    const parts = raw.split(/^-- down:\s*$/m);
    const up = (parts[0] || '').replace(/^--\s*up:\s*$/m, '').trim();
    const down = (parts[1] || '').trim();
    return { name: file.replace(/\.sql$/, ''), up, down };
  });
}

async function ensureMigrationsTable(): Promise<void> {
  await db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      name TEXT PRIMARY KEY,
      applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);
}

async function alreadyApplied(): Promise<Set<string>> {
  try {
    const result = await db.query(`SELECT name FROM schema_migrations`);
    return new Set(result.rows.map((r: any) => r.name));
  } catch {
    return new Set();
  }
}

/** Try to acquire the cross-replica migration lock. Returns true if got it. */
async function acquireLock(): Promise<boolean> {
  try {
    await db.query(`SELECT pg_advisory_lock($1)`, [HERMES_MIGRATION_LOCK_ID]);
    return true;
  } catch {
    // pg_advisory_lock is Postgres-only; if we're on the in-memory fallback
    // the query is a no-op and we don't need a lock anyway.
    return false;
  }
}

async function releaseLock(): Promise<void> {
  try {
    await db.query(`SELECT pg_advisory_unlock($1)`, [HERMES_MIGRATION_LOCK_ID]);
  } catch {
    /* noop */
  }
}

function resolveMigrationsDir(): string {
  // Prefer the compiled dist path so migrations ship with the built
  // artifact. Fall back to the src path for ts-node-dev.
  const distCandidate = path.join(__dirname, 'migrations');
  if (fs.existsSync(distCandidate)) return distCandidate;
  const srcCandidate = path.join(__dirname, '..', '..', 'src', 'database', 'migrations');
  return srcCandidate;
}

export async function applyPendingMigrations(): Promise<MigrationResult[]> {
  await ensureMigrationsTable();
  const gotLock = await acquireLock();
  try {
    const applied = await alreadyApplied();
    const migrations = loadMigrationsFrom(resolveMigrationsDir());
    const results: MigrationResult[] = [];

    for (const migration of migrations) {
      if (applied.has(migration.name)) continue;
      const startedAt = Date.now();
      try {
        await db.exec(migration.up);
        await db.query(
          `INSERT INTO schema_migrations (name) VALUES ($1) ON CONFLICT (name) DO NOTHING`,
          [migration.name]
        );
        const durationMs = Date.now() - startedAt;
        console.log(`[MIGRATIONS] ${migration.name} applied in ${durationMs}ms`);
        results.push({ name: migration.name, success: true, durationMs });
      } catch (err: any) {
        const durationMs = Date.now() - startedAt;
        const message = err?.message || String(err);
        console.error(
          `[MIGRATIONS] ${migration.name} FAILED after ${durationMs}ms: ${message}`
        );
        results.push({
          name: migration.name,
          success: false,
          durationMs,
          error: message,
        });
        // Halt on first error — never partially-apply. Operator must fix.
        throw err;
      }
    }

    if (results.length === 0 && migrations.length > 0) {
      console.log(`[MIGRATIONS] All ${migrations.length} migration(s) already applied`);
    }
    return results;
  } finally {
    if (gotLock) await releaseLock();
  }
}

export async function migrationStatus(): Promise<{
  applied: string[];
  pending: string[];
}> {
  await ensureMigrationsTable();
  const applied = await alreadyApplied();
  const all = loadMigrationsFrom(resolveMigrationsDir()).map((m) => m.name);
  return {
    applied: [...applied].sort(),
    pending: all.filter((n) => !applied.has(n)),
  };
}
