export const TIMELINE_LOG_TYPES = [
  'task_start',
  'analysis_start',
  'tool_use',
  'tool_result',
  'verification_start',
  'verification_result',
  'task_complete',
  'task_blocked',
  'git_commit',
  'error',
  'output',
] as const;

export type TimelineLogType = typeof TIMELINE_LOG_TYPES[number];

export interface AgentTimelineRow {
  id: string;
  timestamp: string | Date;
  type: string;
  content: string;
  metadata?: unknown;
  task_id?: string | null;
  taskId?: string | null;
}

export interface TimelinePreview {
  path: string | null;
  language: string | null;
  content: string;
  truncated?: boolean;
}

export interface AgentTimelineEvent {
  id: string;
  kind: string;
  text: string;
  timestamp: string;
  runId?: string;
  commitHash?: string;
  href?: string;
  preview?: TimelinePreview;
}

const MAX_EVENT_CHARS = 4000;
const MAX_LINE_CHARS = 320;
const MALFORMED_TEXT = 'output withheld: malformed stream event';
const CONTROL_CHARS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g;
const COMMIT_HASH_PATTERN = /\b[0-9a-f]{7,40}\b/i;

function parseMetadata(value: unknown): Record<string, any> {
  if (!value) return {};
  if (typeof value === 'object') return value as Record<string, any>;
  if (typeof value !== 'string') return {};
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function isRepeatedTokenLoop(value: string): boolean {
  const tokens = value.trim().split(/\s+/).filter(Boolean);
  if (tokens.length < 24) return false;

  const counts = new Map<string, number>();
  let max = 0;
  for (const token of tokens) {
    const normalized = token.toLowerCase();
    const next = (counts.get(normalized) || 0) + 1;
    counts.set(normalized, next);
    max = Math.max(max, next);
  }

  return max / tokens.length > 0.45;
}

function hasLowPrintableRatio(value: string): boolean {
  if (value.length < 40) return false;
  const printable = value.replace(CONTROL_CHARS, '').length;
  return printable / value.length < 0.85;
}

function capLine(line: string): string {
  if (line.length <= MAX_LINE_CHARS) return line;
  return `${line.slice(0, MAX_LINE_CHARS - 1)}…`;
}

export function sanitizeTimelineText(value: unknown): string {
  if (typeof value !== 'string') return MALFORMED_TEXT;

  const normalized = value
    .replace(/\r\n?/g, '\n')
    .replace(CONTROL_CHARS, '')
    .trim();

  if (!normalized || hasLowPrintableRatio(value) || isRepeatedTokenLoop(normalized)) {
    return MALFORMED_TEXT;
  }

  return normalized
    .slice(0, MAX_EVENT_CHARS)
    .split('\n')
    .map(capLine)
    .join('\n');
}

export function githubCommitHref(commitHash: string): string {
  const repo = process.env.GITHUB_REPOSITORY || 'hermeschain-agent/hermeschain';
  return `https://github.com/${repo}/commit/${commitHash}`;
}

function extractCommitHash(row: AgentTimelineRow, metadata: Record<string, any>): string | undefined {
  const candidates = [
    metadata.commit,
    metadata.commitHash,
    metadata.hash,
    metadata.commit_hash,
    row.content,
  ];

  for (const candidate of candidates) {
    if (typeof candidate !== 'string') continue;
    const match = candidate.match(COMMIT_HASH_PATTERN);
    if (match) return match[0];
  }

  return undefined;
}

function kindForLogType(type: string): string {
  switch (type) {
    case 'task_start':
      return 'task_start';
    case 'analysis_start':
      return 'analysis';
    case 'tool_use':
      return 'tool';
    case 'tool_result':
      return 'tool_result';
    case 'verification_start':
      return 'verification';
    case 'verification_result':
      return 'verification_result';
    case 'task_complete':
      return 'task_complete';
    case 'task_blocked':
      return 'task_blocked';
    case 'git_commit':
      return 'commit';
    case 'error':
      return 'error';
    default:
      return 'text';
  }
}

export function formatLogStreamText(row: Pick<AgentTimelineRow, 'type' | 'content'>): string {
  const content = sanitizeTimelineText(row.content);

  switch (row.type) {
    case 'task_start':
      return `$ begin_task :: ${content}`;
    case 'analysis_start':
      return `> [ANALYSIS] ${content}`;
    case 'tool_use':
      return `> [TOOL] ${content.replace(/^Using tool:\s*/i, '')}`;
    case 'tool_result':
      return `> [RESULT] ${content}`;
    case 'verification_start':
      return `> [VERIFY] ${content}`;
    case 'verification_result':
      return `> [PASS] ${content}`;
    case 'task_complete':
      return `> [DONE] ${content}`;
    case 'task_blocked':
      return `> [BLOCKED] ${content}`;
    case 'git_commit':
      return `> [COMMIT] ${content}`;
    case 'error':
      return `> [ERROR] ${content}`;
    default:
      return content;
  }
}

function normalizePreview(metadata: Record<string, any>): TimelinePreview | undefined {
  const preview = metadata.preview;
  if (!preview || typeof preview !== 'object') return undefined;
  if (typeof preview.content !== 'string') return undefined;

  const content = sanitizeTimelineText(preview.content);
  if (content === MALFORMED_TEXT) return undefined;

  return {
    path: typeof preview.path === 'string' ? preview.path : null,
    language: typeof preview.language === 'string' ? preview.language : null,
    content,
    truncated: Boolean(preview.truncated),
  };
}

export function normalizeAgentTimelineRow(row: AgentTimelineRow): AgentTimelineEvent {
  const metadata = parseMetadata(row.metadata);
  const commitHash = extractCommitHash(row, metadata);
  const runId =
    typeof metadata.taskRunId === 'string'
      ? metadata.taskRunId
      : typeof metadata.runId === 'string'
        ? metadata.runId
        : row.task_id || row.taskId || undefined;

  return {
    id: String(row.id),
    kind: kindForLogType(row.type),
    text: formatLogStreamText(row),
    timestamp: new Date(row.timestamp).toISOString(),
    ...(runId ? { runId } : {}),
    ...(commitHash ? { commitHash, href: githubCommitHref(commitHash) } : {}),
    ...(row.type === 'tool_result' ? { preview: normalizePreview(metadata) } : {}),
  };
}
