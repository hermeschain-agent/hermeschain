/**
 * Commit quality gate.
 *
 * Distinguishes substantive engineering work from "stub garbage" (placeholder
 * docs, skeletal configs, fixture JSON, self-labeled "(planned)" specs). Used
 * at two boundaries:
 *
 *   - Publish boundary (PacedPusher): strict. Only substantive commits are
 *     replayed onto `main`. `assessCommitForSha`.
 *   - Authorship boundary (GitIntegration): lenient backstop. The agent's
 *     verifyRun already builds/tests every change, so here we only block the
 *     two things the verifier can't catch — self-labeled stubs and dist-only
 *     commits. `assessStagedCommitQuality` (authorship mode).
 *
 * Critical invariant (verified against the live tier-3-backlog branch): every
 * real commit bundles `backend/dist/**` alongside its `src/*.ts`. We therefore
 * reject *dist-only* commits, never anything that merely *touches* dist.
 */

import { execFileSync } from 'child_process';

export interface CommitFileStat {
  path: string;
  insertions: number; // -1 = binary / unknown (numstat '-')
  deletions: number;
}

export interface CommitQualityInput {
  message: string;
  files: CommitFileStat[];
  diffText?: string;
}

export interface CommitQualityResult {
  quality: boolean;
  reason: string;
}

export interface AssessOptions {
  /** Authorship backstop: block only stub-marker + dist-only, trust the verifier for the rest. */
  authorship?: boolean;
}

// Thresholds — justified against the on-branch histogram (stub docs cluster at
// 3/7/9 lines; real docs start ~51; real fixes carry double-digit src adds).
const MIN_SOURCE_INSERTIONS = 8;
const MIN_DOC_PROSE_LINES = 20;
const MIN_MIGRATION_INSERTIONS = 6;

const STUB_MARKER = /\b(planned|placeholder|stub|scaffold|specced|tbd)\b/i;
const DDL_KEYWORD =
  /\b(create|alter|drop)\s+(table|index|view|type|schema|sequence|materialized)\b/i;
const SOURCE_EXT = /\.(ts|tsx|js|jsx|css)$/i;

type FileCategory =
  | 'source'
  | 'migration'
  | 'doc'
  | 'dist'
  | 'placeholderConfig'
  | 'buildConfig'
  | 'other';

/** Lockfiles + tooling config a real maintenance commit legitimately carries. */
function isBuildConfig(p: string): boolean {
  const base = p.split('/').pop() || '';
  return (
    /^(package(-lock)?\.json|yarn\.lock|pnpm-lock\.yaml)$/i.test(base) ||
    /^tsconfig(\.[\w.-]+)?\.json$/i.test(base) ||
    /^(prettier|eslint)\.config\.[cm]?[jt]s$/i.test(base) ||
    /^\.(prettierrc|prettierignore|eslintrc|eslintignore|npmrc|nvmrc|editorconfig|gitignore|gitattributes|node-version)([\w.-]*)$/i.test(
      base,
    )
  );
}

function classify(rawPath: string): FileCategory {
  const p = rawPath.replace(/\\/g, '/');
  if (p.includes('/dist/') || p.startsWith('dist/')) return 'dist';
  if (/^backend\/src\/database\/migrations\/.+\.sql$/i.test(p)) return 'migration';
  if (/^docs\/.+\.md$/i.test(p) || /^backend\/docs\/.+\.md$/i.test(p)) return 'doc';
  // Fixtures and config blobs are filler regardless of size.
  if (/(^|\/)fixtures\//i.test(p)) return 'placeholderConfig';
  if (/^config\/.+\.json$/i.test(p)) return 'placeholderConfig';
  // Real source — including real test code (*.test.ts, backend/tests/*.js),
  // which is quality work. Excludes type-decl files.
  if (/\.d\.ts$/i.test(p)) return 'other';
  if (/^(backend|frontend|extension)\/src\/.+/.test(p) && SOURCE_EXT.test(p)) return 'source';
  if (/^(backend|extension)\/tests?\/.+\.(ts|js)$/i.test(p)) return 'source';
  // Legitimate build/tooling config — real engineering maintenance, distinct
  // from the placeholder `config/*.json` + fixtures rejected above.
  if (isBuildConfig(p)) return 'buildConfig';
  return 'other';
}

function ins(f: CommitFileStat): number {
  return f.insertions < 0 ? 0 : f.insertions;
}

function stubMarkerHit(text: string): string | null {
  const m = text.match(STUB_MARKER);
  return m ? m[0].toLowerCase() : null;
}

/** Count substantive added prose lines in a unified diff (doc-only commits). */
function docProseLines(diffText: string): number {
  let count = 0;
  for (const line of diffText.split('\n')) {
    if (!line.startsWith('+') || line.startsWith('+++')) continue;
    const added = line.slice(1).trim();
    if (!added) continue;
    if (STUB_MARKER.test(added)) continue;
    // Strip leading markdown scaffolding; require real words remain.
    const stripped = added.replace(/^([#>*\-]+|\d+\.|`{1,3}|\|)+\s*/, '').trim();
    if (stripped.replace(/[^a-zA-Z0-9]/g, '').length >= 3) count++;
  }
  return count;
}

export function assessCommitQuality(
  input: CommitQualityInput,
  opts: AssessOptions = {},
): CommitQualityResult {
  const message = input.message || '';
  const subject = message.split('\n', 1)[0] || '';
  const body = message.slice(subject.length);
  const diffText = input.diffText || '';
  const files = input.files || [];

  // 1. Self-labeled stub (subject first, then body).
  const subjMarker = stubMarkerHit(subject);
  if (subjMarker) {
    return { quality: false, reason: `self-labeled stub in subject ("${subjMarker}")` };
  }
  if (stubMarkerHit(body)) {
    return { quality: false, reason: 'self-labeled stub in commit body' };
  }

  if (files.length === 0) {
    return { quality: false, reason: 'no file changes' };
  }

  const cats = files.map((f) => ({ stat: f, cat: classify(f.path) }));
  const nonDist = cats.filter((c) => c.cat !== 'dist');

  // 2. dist-only build output.
  if (nonDist.length === 0) {
    return { quality: false, reason: 'dist-only build output' };
  }

  // 3. Authorship backstop: passed stub + dist checks → trust the verifier.
  if (opts.authorship) {
    return { quality: true, reason: 'authorship backstop passed (verifier-validated)' };
  }

  const sourceFiles = cats.filter((c) => c.cat === 'source');
  const migrations = cats.filter((c) => c.cat === 'migration');
  const docs = cats.filter((c) => c.cat === 'doc');

  // 4. Substantive source change.
  const sourceInsertions = sourceFiles.reduce((sum, c) => sum + ins(c.stat), 0);
  if (sourceInsertions >= MIN_SOURCE_INSERTIONS) {
    return {
      quality: true,
      reason: `substantive source change (${sourceInsertions} insertions across ${sourceFiles.length} file(s))`,
    };
  }

  // 5. Substantive SQL migration (real DDL).
  const ddlMigration = migrations.find(
    (c) => ins(c.stat) >= MIN_MIGRATION_INSERTIONS && DDL_KEYWORD.test(diffText),
  );
  if (ddlMigration) {
    return { quality: true, reason: 'substantive SQL migration (DDL)' };
  }

  // 6. Substantive documentation — require a SINGLE substantial doc file, not
  // many tiny stub files whose line counts merely sum past the threshold
  // (e.g. a dozen 3-line "endpoint reference" placeholders bundled together).
  const maxDocInsertions = docs.reduce((m, c) => Math.max(m, ins(c.stat)), 0);
  const docOnly = docs.length > 0 && nonDist.every((c) => c.cat === 'doc');
  if (docOnly && maxDocInsertions >= MIN_DOC_PROSE_LINES && docProseLines(diffText) >= 12) {
    return { quality: true, reason: `substantive documentation (largest doc +${maxDocInsertions} lines)` };
  }

  // 6b. Legitimate build/tooling config maintenance (lockfiles, tsconfig,
  // prettier/eslint config, .npmrc, .gitignore, package.json). Accept when the
  // commit carries real build config and none of the placeholder-config /
  // fixture filler the gate targets.
  const buildConfigs = cats.filter((c) => c.cat === 'buildConfig');
  if (buildConfigs.length > 0 && !cats.some((c) => c.cat === 'placeholderConfig')) {
    return {
      quality: true,
      reason: `build/tooling config maintenance (${buildConfigs.length} file(s))`,
    };
  }

  // 7. Reject the remainder, with a specific reason.
  if (sourceFiles.length > 0) {
    return {
      quality: false,
      reason: `source change below substance floor (${sourceInsertions} insertions)`,
    };
  }
  if (docs.length > 0) {
    return {
      quality: false,
      reason: `bundled/trivial doc stubs (${docs.length} file(s), largest +${maxDocInsertions} lines)`,
    };
  }
  return {
    quality: false,
    reason: 'no substantive source/migration/doc content (config/fixture/other only)',
  };
}

function gitOut(repoRoot: string, args: string[]): string {
  return execFileSync('git', args, {
    cwd: repoRoot,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  })
    .toString()
    .trim();
}

function parseNumstat(numstat: string): CommitFileStat[] {
  const out: CommitFileStat[] = [];
  for (const raw of numstat.split('\n')) {
    const line = raw.trim();
    if (!line) continue;
    const parts = line.split('\t');
    if (parts.length < 3) continue;
    const insVal = parts[0] === '-' ? -1 : Number.parseInt(parts[0], 10);
    const delVal = parts[1] === '-' ? -1 : Number.parseInt(parts[1], 10);
    out.push({
      path: parts.slice(2).join('\t'),
      insertions: Number.isFinite(insVal) ? insVal : 0,
      deletions: Number.isFinite(delVal) ? delVal : 0,
    });
  }
  return out;
}

function needsDiff(files: CommitFileStat[]): boolean {
  return files.some((f) => {
    const c = classify(f.path);
    return c === 'migration' || c === 'doc' || c === 'placeholderConfig';
  });
}

/** Publish boundary: assess a committed SHA. Conservative — rejects on inspection failure. */
export function assessCommitForSha(
  repoRoot: string,
  sha: string,
  opts: AssessOptions = {},
): CommitQualityResult {
  let message = '';
  let files: CommitFileStat[] = [];
  let diffText: string | undefined;
  try {
    message = gitOut(repoRoot, ['show', '-s', '--format=%B', sha]);
    files = parseNumstat(gitOut(repoRoot, ['show', '--numstat', '--format=', sha]));
    if (needsDiff(files)) diffText = gitOut(repoRoot, ['show', '--format=', sha]);
  } catch {
    return { quality: false, reason: `unable to inspect commit ${sha.slice(0, 8)}` };
  }
  return assessCommitQuality({ message, files, diffText }, opts);
}

/** Authorship boundary: assess the staged diff. Lenient — defers to the verifier if unreadable. */
export function assessStagedCommitQuality(
  repoRoot: string,
  message: string,
  opts: AssessOptions = {},
): CommitQualityResult {
  let files: CommitFileStat[] = [];
  let diffText: string | undefined;
  try {
    files = parseNumstat(gitOut(repoRoot, ['diff', '--cached', '--numstat']));
    if (needsDiff(files)) diffText = gitOut(repoRoot, ['diff', '--cached']);
  } catch {
    return { quality: true, reason: 'staged-diff inspection unavailable; deferring to verifier' };
  }
  return assessCommitQuality({ message, files, diffText }, { authorship: true, ...opts });
}
