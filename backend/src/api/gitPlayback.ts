export type CommitPlaybackKind =
  | 'commit_start'
  | 'file_start'
  | 'diff_chunk'
  | 'commit_complete';

export interface CommitPlaybackCursor {
  page: number;
  perPage: number;
  commitIndex: number;
  eventIndex: number;
  cycle: number;
}

export interface CommitPlaybackFile {
  path: string;
  status: string;
  language: string;
  additions: number;
  deletions: number;
  patch: string;
  truncated?: boolean;
}

export interface CommitPlaybackCommit {
  hash: string;
  shortHash: string;
  message: string;
  author: string;
  date: string;
  href: string;
  files: CommitPlaybackFile[];
}

export interface CommitPlaybackEvent {
  id: string;
  kind: CommitPlaybackKind;
  text: string;
  timestamp: string;
  commitHash: string;
  shortHash: string;
  href: string;
  message: string;
  path?: string;
  language?: string;
  fileIndex?: number;
  chunkIndex?: number;
  nextCursor?: string;
}

export interface CommitPlaybackEventBuildOptions {
  cursor: CommitPlaybackCursor;
  diffChunkSize?: number;
}

const DEFAULT_CURSOR: CommitPlaybackCursor = {
  page: 1,
  perPage: 10,
  commitIndex: 0,
  eventIndex: 0,
  cycle: 0,
};

function asPositiveInt(value: unknown, fallback: number, max: number): number {
  const numberValue = Math.floor(Number(value));
  if (!Number.isFinite(numberValue) || numberValue < 1) return fallback;
  return Math.min(numberValue, max);
}

function asNonNegativeInt(value: unknown, fallback: number): number {
  const numberValue = Math.floor(Number(value));
  if (!Number.isFinite(numberValue) || numberValue < 0) return fallback;
  return numberValue;
}

function toBase64Url(value: string): string {
  return Buffer.from(value, 'utf8')
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
}

function fromBase64Url(value: string): string {
  const padded = value.replace(/-/g, '+').replace(/_/g, '/');
  const padding = padded.length % 4 === 0 ? '' : '='.repeat(4 - (padded.length % 4));
  return Buffer.from(`${padded}${padding}`, 'base64').toString('utf8');
}

export function normalizeCommitPlaybackCursor(
  value?: Partial<CommitPlaybackCursor> | null,
): CommitPlaybackCursor {
  return {
    page: asPositiveInt(value?.page, DEFAULT_CURSOR.page, 10_000),
    perPage: asPositiveInt(value?.perPage, DEFAULT_CURSOR.perPage, 30),
    commitIndex: asNonNegativeInt(value?.commitIndex, DEFAULT_CURSOR.commitIndex),
    eventIndex: asNonNegativeInt(value?.eventIndex, DEFAULT_CURSOR.eventIndex),
    cycle: asNonNegativeInt(value?.cycle, DEFAULT_CURSOR.cycle),
  };
}

export function encodeCommitPlaybackCursor(cursor: CommitPlaybackCursor): string {
  return toBase64Url(JSON.stringify(normalizeCommitPlaybackCursor(cursor)));
}

export function decodeCommitPlaybackCursor(
  encoded?: string | null,
): CommitPlaybackCursor {
  if (!encoded || typeof encoded !== 'string') {
    return normalizeCommitPlaybackCursor(null);
  }

  try {
    return normalizeCommitPlaybackCursor(JSON.parse(fromBase64Url(encoded)));
  } catch {
    return normalizeCommitPlaybackCursor(null);
  }
}

export function advanceCommitPlaybackCursor(
  cursor: CommitPlaybackCursor,
  eventIndex: number,
): CommitPlaybackCursor {
  return normalizeCommitPlaybackCursor({
    ...cursor,
    eventIndex,
  });
}

export function nextCommitCursor(
  cursor: CommitPlaybackCursor,
): CommitPlaybackCursor {
  return normalizeCommitPlaybackCursor({
    ...cursor,
    commitIndex: cursor.commitIndex + 1,
    eventIndex: 0,
  });
}

export function nextPageCursor(
  cursor: CommitPlaybackCursor,
): CommitPlaybackCursor {
  return normalizeCommitPlaybackCursor({
    ...cursor,
    page: cursor.page + 1,
    commitIndex: 0,
    eventIndex: 0,
  });
}

export function restartCommitPlaybackCursor(
  cursor: CommitPlaybackCursor,
): CommitPlaybackCursor {
  return normalizeCommitPlaybackCursor({
    ...cursor,
    page: 1,
    commitIndex: 0,
    eventIndex: 0,
    cycle: cursor.cycle + 1,
  });
}

export function chunkCommitDiff(value: string, maxChars: number = 1800): string[] {
  const normalized = value.replace(/\r\n?/g, '\n').trim();
  if (!normalized) return [];

  const chunks: string[] = [];
  let current = '';
  for (const line of normalized.split('\n')) {
    const nextLine = current ? `\n${line}` : line;
    if (current.length + nextLine.length <= maxChars) {
      current += nextLine;
      continue;
    }

    if (current) {
      chunks.push(current);
      current = '';
    }

    if (line.length <= maxChars) {
      current = line;
      continue;
    }

    for (let i = 0; i < line.length; i += maxChars) {
      chunks.push(line.slice(i, i + maxChars));
    }
  }

  if (current) chunks.push(current);
  return chunks;
}

function commitTitle(message: string): string {
  return (message || 'GitHub commit').split('\n')[0].trim() || 'GitHub commit';
}

function eventId(
  cursor: CommitPlaybackCursor,
  commit: CommitPlaybackCommit,
  suffix: string,
): string {
  return `github:${cursor.cycle}:${cursor.page}:${cursor.commitIndex}:${commit.shortHash}:${suffix}`;
}

function withNextCursor(
  event: Omit<CommitPlaybackEvent, 'nextCursor'>,
  cursor: CommitPlaybackCursor,
  nextEventIndex: number,
): CommitPlaybackEvent {
  return {
    ...event,
    nextCursor: encodeCommitPlaybackCursor(
      advanceCommitPlaybackCursor(cursor, nextEventIndex),
    ),
  };
}

export function buildCommitPlaybackEvents(
  commit: CommitPlaybackCommit,
  options: CommitPlaybackEventBuildOptions,
): CommitPlaybackEvent[] {
  const cursor = normalizeCommitPlaybackCursor(options.cursor);
  const title = commitTitle(commit.message);
  const events: CommitPlaybackEvent[] = [];
  const base = {
    timestamp: commit.date,
    commitHash: commit.hash,
    shortHash: commit.shortHash,
    href: commit.href,
    message: commit.message,
  };

  events.push(
    withNextCursor(
      {
        ...base,
        id: eventId(cursor, commit, 'start'),
        kind: 'commit_start',
        text: `git show ${commit.shortHash}  # ${title}`,
      },
      cursor,
      1,
    ),
  );

  commit.files.forEach((file, fileIndex) => {
    const fileEventIndex = events.length;
    events.push(
      withNextCursor(
        {
          ...base,
          id: eventId(cursor, commit, `file:${fileIndex}`),
          kind: 'file_start',
          text: `Writing ${file.path} from ${commit.shortHash} (${file.status}, +${file.additions}/-${file.deletions})`,
          path: file.path,
          language: file.language,
          fileIndex,
        },
        cursor,
        fileEventIndex + 1,
      ),
    );

    const chunks = chunkCommitDiff(
      file.patch || `diff --git a/${file.path} b/${file.path}\n# patch unavailable for terminal replay`,
      options.diffChunkSize,
    );

    chunks.forEach((chunk, chunkIndex) => {
      const chunkEventIndex = events.length;
      events.push(
        withNextCursor(
          {
            ...base,
            id: eventId(cursor, commit, `file:${fileIndex}:chunk:${chunkIndex}`),
            kind: 'diff_chunk',
            text: chunk,
            path: file.path,
            language: file.language || 'diff',
            fileIndex,
            chunkIndex,
          },
          cursor,
          chunkEventIndex + 1,
        ),
      );
    });
  });

  const completeIndex = events.length;
  events.push(
    withNextCursor(
      {
        ...base,
        id: eventId(cursor, commit, 'complete'),
        kind: 'commit_complete',
        text: `commited ${commit.shortHash}`,
      },
      cursor,
      completeIndex + 1,
    ),
  );

  return events;
}
