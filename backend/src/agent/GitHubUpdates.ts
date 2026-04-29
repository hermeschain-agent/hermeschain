/**
 * GitHub updates publisher stub. Pulls release/issue/discussion changes
 * from GitHub and surfaces them in the HUD's updates feed. Currently a
 * no-op shell — full implementation lands when the updates feed UI ships.
 */

class GitHubUpdates {
  async initialize(_repoRoot: string): Promise<void> {
    /* no-op stub */
  }
  startBackgroundSync(): void { /* no-op */ }
  stopBackgroundSync(): void { /* no-op */ }
  async getRecentUpdates(_limit = 50): Promise<any[]> { return []; }
}

export const githubUpdates = new GitHubUpdates();
