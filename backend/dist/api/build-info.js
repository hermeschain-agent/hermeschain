"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createBuildRouter = createBuildRouter;
const express_1 = require("express");
const child_process_1 = require("child_process");
/**
 * /api/build endpoint (TASK-150). Surfaces commit + build time + version
 * for debugging deploys. Computed once at module load to avoid running
 * git on every request.
 */
function readGitCommit() {
    if (process.env.HERMES_BUILD_COMMIT)
        return process.env.HERMES_BUILD_COMMIT;
    try {
        return (0, child_process_1.execSync)('git rev-parse HEAD', { encoding: 'utf8' }).trim();
    }
    catch {
        return 'unknown';
    }
}
const COMMIT = readGitCommit();
const BUILD_TIME = process.env.HERMES_BUILD_TIME || new Date().toISOString();
const VERSION = process.env.npm_package_version || '0.0.0';
function createBuildRouter() {
    const router = (0, express_1.Router)();
    router.get('/', (_req, res) => {
        res.json({ commit: COMMIT, buildTime: BUILD_TIME, version: VERSION });
    });
    return router;
}
//# sourceMappingURL=build-info.js.map