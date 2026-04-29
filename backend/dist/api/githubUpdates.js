"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.githubUpdatesRouter = void 0;
const express_1 = require("express");
const GitHubUpdates_1 = require("../agent/GitHubUpdates");
/**
 * /api/github/updates router stub. Returns recent GitHub updates
 * (releases, issues, discussions) once the publisher is wired up.
 */
exports.githubUpdatesRouter = (0, express_1.Router)();
exports.githubUpdatesRouter.get('/', async (_req, res) => {
    const items = await GitHubUpdates_1.githubUpdates.getRecentUpdates(50);
    res.json({ items });
});
//# sourceMappingURL=githubUpdates.js.map