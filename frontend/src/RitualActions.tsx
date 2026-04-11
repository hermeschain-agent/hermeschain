import React from 'react';
import { RitualKind, RitualResponse } from './useHermesDockState';

interface RitualActionsProps {
  title?: string;
  description?: string;
  loading: RitualKind | null;
  result: RitualResponse | null;
  error: string | null;
  onRun: (ritual: RitualKind) => void;
  compact?: boolean;
}

const ACTIONS: Array<{
  kind: RitualKind;
  label: string;
  description: string;
}> = [
  {
    kind: 'explain_last_block',
    label: 'Explain Last Block',
    description: 'Have Hermes translate the latest block into plain English.',
  },
  {
    kind: 'summarize_today',
    label: "Summarize Today's Work",
    description: 'Ask Hermes for a short recap of what the chain has been doing.',
  },
  {
    kind: 'guide_this_page',
    label: 'Guide Me Through This Page',
    description: 'Get a quick orientation for the page you are looking at.',
  },
];

export default function RitualActions({
  title = 'Hermes Rituals',
  description = 'Fixed invocations for curious visitors who want context without typing a full prompt.',
  loading,
  result,
  error,
  onRun,
  compact = false,
}: RitualActionsProps) {
  return (
    <div className={`engraved-panel ritual-panel ${compact ? 'compact' : ''}`}>
      <div className="panel-head">
        <span className="section-label">Invoke Hermes</span>
        <h3>{title}</h3>
        <p>{description}</p>
      </div>

      <div className={`ritual-grid ${compact ? 'compact' : ''}`}>
        {ACTIONS.map((action) => {
          const isRunning = loading === action.kind;

          return (
            <button
              key={action.kind}
              className={`ritual-btn ${isRunning ? 'running' : ''}`}
              onClick={() => onRun(action.kind)}
              disabled={loading !== null}
            >
              <span className="ritual-btn-title">
                {isRunning ? 'Invoking...' : action.label}
              </span>
              <span className="ritual-btn-copy">{action.description}</span>
            </button>
          );
        })}
      </div>

      {(result || error) && (
        <div className="artifact-card ritual-output">
          <div className="artifact-meta">
            <span className="artifact-kicker">Ritual Output</span>
            {result?.sourceRefs?.length ? (
              <span className="artifact-sources">
                {result.sourceRefs.map((ref) => `${ref.kind}:${ref.id}`).join(' • ')}
              </span>
            ) : null}
          </div>
          <h4>{result?.title || 'Ritual interrupted'}</h4>
          <p>{result?.message || error}</p>
        </div>
      )}
    </div>
  );
}
