/**
 * Commitlint config — enforces conventional-commits.
 *
 * Examples that pass:
 *   feat: add new wallet endpoint
 *   feat(api): TASK-152 — Prometheus metrics
 *   fix(chain): off-by-one in finality calc
 *   docs(backlog): expand section 04 specs
 *
 * Examples that fail:
 *   "WIP"
 *   "added some stuff"
 *   "Fix bug"   (uppercase F + no scope/colon)
 */

module.exports = {
  extends: ['@commitlint/config-conventional'],
  rules: {
    'type-enum': [2, 'always', [
      'feat', 'fix', 'docs', 'style', 'refactor', 'perf', 'test',
      'build', 'ci', 'chore', 'revert',
    ]],
    'subject-case': [0],          // allow proper nouns / TASK-IDs
    'header-max-length': [2, 'always', 200],
    'body-max-line-length': [0],  // allow long body lines (URL refs, etc.)
  },
};
