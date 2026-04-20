import React, { useEffect, useMemo, useRef, useState } from 'react';

export interface PaletteAction {
  id: string;
  label: string;
  hint?: string;
  keywords?: string[];
  run: () => void;
}

interface CommandPaletteProps {
  actions: PaletteAction[];
}

function scoreAction(action: PaletteAction, query: string): number {
  const q = query.trim().toLowerCase();
  if (!q) return 1;
  const haystack = [action.label, action.id, ...(action.keywords || [])]
    .join(' ')
    .toLowerCase();
  if (haystack.includes(q)) return 100 - Math.abs(haystack.indexOf(q));
  // crude fuzzy: every char of q must appear in order
  let qi = 0;
  for (const ch of haystack) {
    if (ch === q[qi]) qi += 1;
    if (qi >= q.length) return 40;
  }
  return 0;
}

const CommandPalette: React.FC<CommandPaletteProps> = ({ actions }) => {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [cursor, setCursor] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const results = useMemo(() => {
    const scored = actions
      .map((action) => ({ action, score: scoreAction(action, query) }))
      .filter((entry) => entry.score > 0)
      .sort((a, b) => b.score - a.score);
    return scored.map((entry) => entry.action);
  }, [actions, query]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setOpen((prev) => !prev);
      } else if (event.key === 'Escape' && open) {
        event.preventDefault();
        setOpen(false);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open]);

  useEffect(() => {
    if (open) {
      setQuery('');
      setCursor(0);
      setTimeout(() => inputRef.current?.focus(), 30);
    }
  }, [open]);

  useEffect(() => {
    setCursor(0);
  }, [query]);

  if (!open) return null;

  const onKey = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setCursor((prev) => Math.min(prev + 1, Math.max(0, results.length - 1)));
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setCursor((prev) => Math.max(prev - 1, 0));
    } else if (event.key === 'Enter') {
      event.preventDefault();
      const pick = results[cursor];
      if (pick) {
        pick.run();
        setOpen(false);
      }
    }
  };

  return (
    <div
      className="cmd-palette"
      role="dialog"
      aria-modal="true"
      aria-label="Command palette"
      onClick={() => setOpen(false)}
    >
      <div
        className="cmd-palette__panel"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="cmd-palette__header">
          <span className="cmd-palette__prompt">$</span>
          <input
            ref={inputRef}
            className="cmd-palette__input"
            type="text"
            value={query}
            placeholder="type a command..."
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={onKey}
            autoFocus
            spellCheck={false}
          />
          <span className="cmd-palette__hint">esc to close</span>
        </div>

        <div className="cmd-palette__list">
          {results.length === 0 ? (
            <div className="cmd-palette__empty">no commands match</div>
          ) : (
            results.slice(0, 8).map((action, index) => (
              <button
                key={action.id}
                type="button"
                className={`cmd-palette__item ${
                  index === cursor ? 'cmd-palette__item--active' : ''
                }`}
                onMouseEnter={() => setCursor(index)}
                onClick={() => {
                  action.run();
                  setOpen(false);
                }}
              >
                <span className="cmd-palette__item-label">{action.label}</span>
                {action.hint ? (
                  <span className="cmd-palette__item-hint">{action.hint}</span>
                ) : null}
              </button>
            ))
          )}
        </div>

        <div className="cmd-palette__footer">
          <span>↑↓ navigate</span>
          <span>↵ run</span>
          <span>⌘K toggle</span>
        </div>
      </div>
    </div>
  );
};

export default CommandPalette;
