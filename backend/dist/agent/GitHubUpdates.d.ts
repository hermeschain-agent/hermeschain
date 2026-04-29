/**
 * GitHub updates publisher stub. Pulls release/issue/discussion changes
 * from GitHub and surfaces them in the HUD's updates feed. Currently a
 * no-op shell — full implementation lands when the updates feed UI ships.
 */
declare class GitHubUpdates {
    initialize(_repoRoot: string): Promise<void>;
    startBackgroundSync(): void;
    stopBackgroundSync(): void;
    getRecentUpdates(_limit?: number): Promise<any[]>;
}
export declare const githubUpdates: GitHubUpdates;
export {};
//# sourceMappingURL=GitHubUpdates.d.ts.map