import { Router } from 'express';
import { githubUpdates } from '../agent/GitHubUpdates';

/**
 * /api/github/updates router stub. Returns recent GitHub updates
 * (releases, issues, discussions) once the publisher is wired up.
 */
export const githubUpdatesRouter = Router();

githubUpdatesRouter.get('/', async (_req, res) => {
  const items = await githubUpdates.getRecentUpdates(50);
  res.json({ items });
});
