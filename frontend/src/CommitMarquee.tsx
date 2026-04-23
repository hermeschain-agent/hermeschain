import React, { useMemo } from 'react';

interface GitCommit {
  hash: string;
  shortHash: string;
  message: string;
  author: string;
  date: string;
}

interface CommitMarqueeProps {
  commits: GitCommit[];
  loading: boolean;
}

function parseType(message: string): { type: string; title: string } {
  const match = message.match(/^(\w+)(?:\(([^)]+)\))?\s*:\s*(.+)$/);
  if (!match) return { type: 'chore', title: message };
  const [, type, , title] = match;
  return { type: (type || 'chore').toLowerCase(), title: (title || message).trim() };
}

function relativeTime(iso: string): string {
  const now = Date.now();
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return '';
  const diff = Math.max(0, Math.floor((now - then) / 1000));
  if (diff < 60) return `${diff}s`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h`;
  return `${Math.floor(diff / 86400)}d`;
}

const CommitMarquee: React.FC<CommitMarqueeProps> = ({ commits, loading }) => {
  // Duplicate the list so the scroll loops seamlessly.
  const cards = useMemo(() => {
    const slice = (commits || []).slice(0, 20);
    return [...slice, ...slice];
  }, [commits]);

  if (loading) {
    return (
      <div className="commit-marquee commit-marquee--loading" aria-hidden="true">
        <div className="commit-marquee__label">$ tail -f commits.log</div>
        <div className="commit-marquee__dim">...hooking in...</div>
      </div>
    );
  }

  if (cards.length === 0) {
    return (
      <div className="commit-marquee commit-marquee--empty" aria-hidden="true">
        <div className="commit-marquee__label">$ tail -f commits.log</div>
        <div className="commit-marquee__dim">waiting for first commit</div>
      </div>
    );
  }

  return (
    <div className="commit-marquee" aria-label="Recent autonomous commits">
      <div className="commit-marquee__label">$ tail -f commits.log</div>
      <div className="commit-marquee__viewport">
        <div className="commit-marquee__track">
          {cards.map((commit, index) => {
            const { type, title } = parseType(commit.message);
            return (
              <a
                key={`${commit.hash}-${index}`}
                className={`commit-marquee__card commit-marquee__card--${type}`}
                href={`https://github.com/hermeschain-agent/hermeschain/commit/${commit.hash}`}
                target="_blank"
                rel="noopener noreferrer"
              >
                <span className="commit-marquee__sha">{commit.shortHash}</span>
                <span className={`commit-marquee__type commit-marquee__type--${type}`}>
                  {type}
                </span>
                <span className="commit-marquee__title">{title}</span>
                {commit.author ? (
                  <span className="commit-marquee__author">
                    by {commit.author}
                  </span>
                ) : null}
                <span className="commit-marquee__age">{relativeTime(commit.date)} ago</span>
              </a>
            );
          })}
        </div>
      </div>
    </div>
  );
};

export default CommitMarquee;
