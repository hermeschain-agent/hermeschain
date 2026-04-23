/**
 * Agent task prioritizer.
 *
 * Phase-agent / prioritizer / step-2. Takes a list of candidate
 * tasks (from backlog + event-driven sources), assigns a score, and
 * returns them sorted high-to-low. Used by the worker to pick what
 * to do next when multiple candidates are available simultaneously.
 */

export interface Candidate {
  readonly id: string;
  readonly kind: 'backlog' | 'event' | 'retry';
  readonly priority: number;           // base score from source
  readonly ageMs: number;              // how long it's been waiting
  readonly failureCount: number;        // from retry scheduler
  readonly blocksCurrentWork: boolean;  // consensus failures, CI blockers
}

export interface ScoredCandidate extends Candidate {
  readonly score: number;
  readonly reason: string;
}

const MAX_FAILURE_PENALTY = 50;
const AGE_BOOST_PER_HOUR = 2;

export function scoreCandidate(c: Candidate): ScoredCandidate {
  let score = c.priority;
  const reasons: string[] = [`base=${c.priority.toFixed(2)}`];

  // Boost older waiting tasks so nothing starves.
  const ageHours = c.ageMs / (60 * 60 * 1000);
  const ageBoost = ageHours * AGE_BOOST_PER_HOUR;
  score += ageBoost;
  reasons.push(`age=+${ageBoost.toFixed(2)}`);

  // Penalize tasks that keep failing.
  const penalty = Math.min(MAX_FAILURE_PENALTY, c.failureCount * 10);
  score -= penalty;
  if (penalty > 0) reasons.push(`failures=-${penalty}`);

  // Huge boost for tasks that unblock current work.
  if (c.blocksCurrentWork) {
    score += 100;
    reasons.push('blocks=+100');
  }

  // Event-driven work beats idle backlog when they're close in score.
  if (c.kind === 'event') {
    score += 5;
    reasons.push('event=+5');
  }

  return {
    ...c,
    score,
    reason: reasons.join(' '),
  };
}

export function prioritize(candidates: readonly Candidate[]): ScoredCandidate[] {
  const scored = candidates.map(scoreCandidate);
  scored.sort((a, b) => b.score - a.score);
  return scored;
}
