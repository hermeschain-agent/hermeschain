import React, { useEffect, useState } from 'react';

interface DossierStats {
  blockHeight: number;
  uptimeMs: number;
  commitsShipped: number;
  lastFile: string | null;
  lastTaskTitle: string | null;
  mode: string;
}

interface HermesDossierProps {
  blockHeight: number;
  uptime: string;
  commitsShipped: number;
  lastFile: string | null;
  lastTaskTitle: string | null;
  mode: string;
}

const EPIGRAPHS = [
  '"I do not rest. I run." — Hermes',
  '"Credit and blame are mine." — Hermes',
  '"Every commit is a receipt." — Hermes',
  '"The chain is what I leave behind." — Hermes',
];

const HermesDossier: React.FC<HermesDossierProps> = ({
  blockHeight,
  uptime,
  commitsShipped,
  lastFile,
  lastTaskTitle,
  mode,
}) => {
  const [epigraphIndex, setEpigraphIndex] = useState(0);
  useEffect(() => {
    const interval = setInterval(() => {
      setEpigraphIndex((prev) => (prev + 1) % EPIGRAPHS.length);
    }, 9000);
    return () => clearInterval(interval);
  }, []);

  const modeBadge =
    mode === 'real' ? 'ONLINE' : mode === 'demo' ? 'DEMO' : 'OFFLINE';

  return (
    <aside className="dossier" aria-label="Hermes agent dossier">
      <div className="dossier__stone">
        <div className="dossier__frame">
          <div className="dossier__head">
            <div className="dossier__portrait">
              <img
                src="/hermes-logo.png"
                alt=""
                className="hermes-mark"
              />
            </div>
            <div className="dossier__id">
              <div className="dossier__name">HERMES</div>
              <div className="dossier__handle">single-agent · class agent</div>
              <div className={`dossier__badge dossier__badge--${mode}`}>
                <span className="dossier__led" />
                {modeBadge}
              </div>
            </div>
          </div>

          <div className="dossier__stats">
            <div className="dossier__stat">
              <div className="dossier__stat-label">blocks produced</div>
              <div className="dossier__stat-value">
                {blockHeight.toString().padStart(7, '0')}
              </div>
            </div>
            <div className="dossier__stat">
              <div className="dossier__stat-label">uptime</div>
              <div className="dossier__stat-value">{uptime}</div>
            </div>
            <div className="dossier__stat">
              <div className="dossier__stat-label">commits shipped</div>
              <div className="dossier__stat-value">
                {commitsShipped.toString().padStart(4, '0')}
              </div>
            </div>
          </div>

          <div className="dossier__footer">
            <div className="dossier__row">
              <span className="dossier__row-key">$ last_touched</span>
              <span className="dossier__row-value">
                {lastFile || '—'}
              </span>
            </div>
            <div className="dossier__row">
              <span className="dossier__row-key">$ current_focus</span>
              <span className="dossier__row-value">
                {lastTaskTitle || 'awaiting next scoped task'}
              </span>
            </div>
            <div className="dossier__epigraph">{EPIGRAPHS[epigraphIndex]}</div>
          </div>
        </div>
      </div>
    </aside>
  );
};

export default HermesDossier;
export type { DossierStats };
