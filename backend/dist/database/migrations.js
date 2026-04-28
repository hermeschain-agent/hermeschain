"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.loadMigrationsFromDir = loadMigrationsFromDir;
exports.getMigrationsDir = getMigrationsDir;
exports.applyPendingMigrations = applyPendingMigrations;
exports.migrationStatus = migrationStatus;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const db_1 = require("./db");
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
/** Load every .sql file from `dir` sorted lexicographically. */
// Exposed so the migrate:down CLI (TASK-325) and dry-run mode (TASK-326)
// can reuse the same loader the boot path uses.
function loadMigrationsFromDir(dir) {
    return loadMigrationsFrom(dir);
}
function getMigrationsDir() {
    return resolveMigrationsDir();
}
function loadMigrationsFrom(dir) {
    let entries = [];
    try {
        entries = fs.readdirSync(dir);
    }
    catch (err) {
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
async function ensureMigrationsTable() {
    await db_1.db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      name TEXT PRIMARY KEY,
      applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);
}
async function alreadyApplied() {
    try {
        const result = await db_1.db.query(`SELECT name FROM schema_migrations`);
        return new Set(result.rows.map((r) => r.name));
    }
    catch {
        return new Set();
    }
}
/** Try to acquire the cross-replica migration lock. Returns true if got it. */
async function acquireLock() {
    try {
        await db_1.db.query(`SELECT pg_advisory_lock($1)`, [HERMES_MIGRATION_LOCK_ID]);
        return true;
    }
    catch {
        // pg_advisory_lock is Postgres-only; if we're on the in-memory fallback
        // the query is a no-op and we don't need a lock anyway.
        return false;
    }
}
async function releaseLock() {
    try {
        await db_1.db.query(`SELECT pg_advisory_unlock($1)`, [HERMES_MIGRATION_LOCK_ID]);
    }
    catch {
        /* noop */
    }
}
function resolveMigrationsDir() {
    // Prefer the compiled dist path so migrations ship with the built
    // artifact. Fall back to the src path for ts-node-dev.
    const distCandidate = path.join(__dirname, 'migrations');
    if (fs.existsSync(distCandidate))
        return distCandidate;
    const srcCandidate = path.join(__dirname, '..', '..', 'src', 'database', 'migrations');
    return srcCandidate;
}
async function applyPendingMigrations(opts = {}) {
    await ensureMigrationsTable();
    const gotLock = await acquireLock();
    try {
        const applied = await alreadyApplied();
        const migrations = loadMigrationsFrom(resolveMigrationsDir());
        const results = [];
        for (const migration of migrations) {
            if (applied.has(migration.name))
                continue;
            const startedAt = Date.now();
            if (opts.dryRun) {
                console.log(`[DRY-RUN] ${migration.name}\n${migration.up}\n---`);
                results.push({ name: migration.name, success: true, durationMs: 0 });
                continue;
            }
            try {
                await db_1.db.exec(migration.up);
                await db_1.db.query(`INSERT INTO schema_migrations (name) VALUES ($1) ON CONFLICT (name) DO NOTHING`, [migration.name]);
                const durationMs = Date.now() - startedAt;
                console.log(`[MIGRATIONS] ${migration.name} applied in ${durationMs}ms`);
                results.push({ name: migration.name, success: true, durationMs });
            }
            catch (err) {
                const durationMs = Date.now() - startedAt;
                const message = err?.message || String(err);
                console.error(`[MIGRATIONS] ${migration.name} FAILED after ${durationMs}ms: ${message}`);
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
    }
    finally {
        if (gotLock)
            await releaseLock();
    }
}
async function migrationStatus() {
    await ensureMigrationsTable();
    const applied = await alreadyApplied();
    const all = loadMigrationsFrom(resolveMigrationsDir()).map((m) => m.name);
    return {
        applied: [...applied].sort(),
        pending: all.filter((n) => !applied.has(n)),
    };
}
//# sourceMappingURL=migrations.js.map