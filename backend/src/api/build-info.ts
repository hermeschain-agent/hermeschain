import { Router } from 'express';
import { execSync } from 'child_process';

/**
 * /api/build endpoint (TASK-150). Surfaces commit + build time + version
 * for debugging deploys. Computed once at module load to avoid running
 * git on every request.
 */

function readGitCommit(): string {
  if (process.env.HERMES_BUILD_COMMIT) return process.env.HERMES_BUILD_COMMIT;
  try {
    return execSync('git rev-parse HEAD', { encoding: 'utf8' }).trim();
  } catch {
    return 'unknown';
  }
}

const COMMIT = readGitCommit();
const BUILD_TIME = process.env.HERMES_BUILD_TIME || new Date().toISOString();
const VERSION = process.env.npm_package_version || '0.0.0';

export function createBuildRouter(): Router {
  const router = Router();
  router.get('/', (_req, res) => {
    res.json({ commit: COMMIT, buildTime: BUILD_TIME, version: VERSION });
  });
  return router;
}
