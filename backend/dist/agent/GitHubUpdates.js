"use strict";
/**
 * GitHub updates publisher stub. Pulls release/issue/discussion changes
 * from GitHub and surfaces them in the HUD's updates feed. Currently a
 * no-op shell — full implementation lands when the updates feed UI ships.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.githubUpdates = void 0;
class GitHubUpdates {
    async initialize(_repoRoot) {
        /* no-op stub */
    }
    startBackgroundSync() { }
    stopBackgroundSync() { }
    async getRecentUpdates(_limit = 50) { return []; }
}
exports.githubUpdates = new GitHubUpdates();
//# sourceMappingURL=GitHubUpdates.js.map