/**
 * Changelog generator — group conventional commits by type.
 *
 * Phase-8 / changelog / step-2. Reads git log between two refs,
 * parses each subject against the conventional-commit regex, and
 * emits a grouped Markdown changelog.
 */

export interface CommitEntry {
  readonly hash: string;
  readonly type: string;
  readonly scope: string | null;
  readonly subject: string;
  readonly breaking: boolean;
}

export interface GroupedChangelog {
  readonly version: string;
  readonly fromRef: string;
  readonly toRef: string;
  readonly groups: ReadonlyMap<string, readonly CommitEntry[]>;
  readonly breaking: readonly CommitEntry[];
}

const CC_RE = /^(\w+)(?:\(([^)]+)\))?(!?):\s*(.+)$/;

export function parseCommit(hash: string, subject: string): CommitEntry | null {
  const match = CC_RE.exec(subject);
  if (!match) return null;
  const [, type, scope, bang, rest] = match;
  return {
    hash,
    type,
    scope: scope ?? null,
    subject: rest,
    breaking: bang === '!',
  };
}

const ORDER = ['feat', 'fix', 'perf', 'refactor', 'docs', 'test', 'chore'];
const LABELS: Record<string, string> = {
  feat: 'Features',
  fix: 'Bug fixes',
  perf: 'Performance',
  refactor: 'Refactors',
  docs: 'Documentation',
  test: 'Tests',
  chore: 'Chores',
};

export function groupEntries(entries: readonly CommitEntry[]): Map<string, CommitEntry[]> {
  const groups = new Map<string, CommitEntry[]>();
  for (const t of ORDER) groups.set(t, []);
  for (const entry of entries) {
    const bucket = groups.get(entry.type) ?? groups.set(entry.type, []).get(entry.type)!;
    bucket.push(entry);
  }
  return groups;
}

export function renderMarkdown(log: GroupedChangelog): string {
  const lines: string[] = [];
  lines.push(`## ${log.version}`);
  lines.push('');
  if (log.breaking.length > 0) {
    lines.push('### ⚠ Breaking changes');
    for (const e of log.breaking) {
      const scope = e.scope ? `**${e.scope}:** ` : '';
      lines.push(`- ${scope}${e.subject} (\`${e.hash.slice(0, 7)}\`)`);
    }
    lines.push('');
  }
  for (const [type, entries] of log.groups) {
    if (entries.length === 0) continue;
    lines.push(`### ${LABELS[type] ?? type}`);
    for (const e of entries) {
      const scope = e.scope ? `**${e.scope}:** ` : '';
      lines.push(`- ${scope}${e.subject} (\`${e.hash.slice(0, 7)}\`)`);
    }
    lines.push('');
  }
  return lines.join('\n').trim() + '\n';
}
