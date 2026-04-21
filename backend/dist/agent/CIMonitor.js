"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.ciMonitor = exports.CIMonitor = void 0;
const child_process_1 = require("child_process");
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const EventBus_1 = require("../events/EventBus");
class CIMonitor {
    constructor(projectRoot) {
        this.config = null;
        this.isRunning = false;
        this.checkInterval = null;
        this.lastCheckAt = null;
        this.projectRoot = projectRoot || process.cwd();
    }
    configure(config) {
        this.config = config;
        if (config.repoRoot) {
            this.projectRoot = config.repoRoot;
        }
    }
    getPackageTargets() {
        const targets = [];
        const base = this.config?.repoRoot || this.projectRoot;
        for (const name of ['backend', 'frontend']) {
            const dir = path.join(base, name);
            const packagePath = path.join(dir, 'package.json');
            if (!fs.existsSync(packagePath))
                continue;
            try {
                const pkg = JSON.parse(fs.readFileSync(packagePath, 'utf-8'));
                targets.push({
                    name,
                    dir,
                    scripts: pkg.scripts || {},
                });
            }
            catch (error) {
                console.error(`[CI] Failed to parse ${packagePath}:`, error);
            }
        }
        return targets;
    }
    runPackageScript(target, script, timeout) {
        if (!target.scripts[script]) {
            return {
                available: false,
                success: true,
                duration: 0,
                output: '',
            };
        }
        const startTime = Date.now();
        const result = (0, child_process_1.spawnSync)('npm', ['run', script], {
            cwd: target.dir,
            encoding: 'utf-8',
            timeout,
            env: {
                ...process.env,
                CI: 'true',
                FORCE_COLOR: '0',
            },
        });
        return {
            available: true,
            success: result.status === 0,
            duration: Date.now() - startTime,
            output: `${result.stdout || ''}${result.stderr || ''}`.trim(),
        };
    }
    async runAllChecks() {
        console.log('[CI] Running all checks...');
        const [tests, build, lint] = await Promise.all([
            this.runTests(),
            this.runBuild(),
            this.runLint(),
        ]);
        this.lastCheckAt = new Date();
        EventBus_1.eventBus.emit('ci_results', { tests, build, lint });
        return { tests, build, lint };
    }
    async runTests() {
        const targets = this.getPackageTargets();
        let total = 0;
        let failing = 0;
        let duration = 0;
        const failures = [];
        for (const target of targets) {
            const result = this.runPackageScript(target, 'test', 180000);
            if (!result.available)
                continue;
            duration += result.duration;
            total += 1;
            if (!result.success) {
                failing += 1;
                failures.push({
                    testName: `${target.name} test suite`,
                    file: `${target.name}/package.json`,
                    message: result.output.split('\n').slice(-10).join('\n') || 'Test command failed.',
                });
            }
        }
        return {
            passed: total === 0 ? true : failing === 0,
            total,
            passing: Math.max(0, total - failing),
            failing,
            duration,
            failures,
        };
    }
    async runBuild() {
        const targets = this.getPackageTargets();
        let duration = 0;
        const errors = [];
        const warnings = [];
        for (const target of targets) {
            const result = this.runPackageScript(target, 'build', 240000);
            if (!result.available)
                continue;
            duration += result.duration;
            const lines = result.output.split('\n').filter(Boolean);
            warnings.push(...lines.filter((line) => /warning/i.test(line)).map((line) => `[${target.name}] ${line}`));
            if (!result.success) {
                errors.push(...lines
                    .filter((line) => /error|failed/i.test(line))
                    .slice(0, 20)
                    .map((line) => `[${target.name}] ${line}`));
                if (lines.length === 0) {
                    errors.push(`[${target.name}] Build command failed with no output.`);
                }
            }
        }
        return {
            success: errors.length === 0,
            duration,
            errors: errors.slice(0, 20),
            warnings: warnings.slice(0, 20),
        };
    }
    async runLint() {
        const targets = this.getPackageTargets();
        const issues = [];
        for (const target of targets) {
            const result = this.runPackageScript(target, 'lint', 120000);
            if (!result.available)
                continue;
            const lines = result.output.split('\n').filter(Boolean);
            const parsedIssues = lines
                .map((line) => {
                const match = line.match(/(.+?):(\d+):(\d+):\s*(error|warning)\s+(.+?)\s+(\S+)$/);
                if (!match)
                    return null;
                return {
                    file: path.relative(this.projectRoot, match[1]),
                    line: parseInt(match[2], 10),
                    column: parseInt(match[3], 10),
                    severity: match[4],
                    message: match[5],
                    rule: match[6],
                };
            })
                .filter(Boolean);
            if (parsedIssues.length > 0) {
                issues.push(...parsedIssues);
            }
            else if (!result.success) {
                issues.push({
                    file: `${target.name}/package.json`,
                    line: 0,
                    column: 0,
                    severity: 'error',
                    message: result.output.split('\n').slice(-10).join('\n') || 'Lint command failed.',
                    rule: 'lint-command',
                });
            }
        }
        const errorCount = issues.filter((issue) => issue.severity === 'error').length;
        const warningCount = issues.filter((issue) => issue.severity === 'warning').length;
        return {
            clean: errorCount === 0 && warningCount === 0,
            errorCount,
            warningCount,
            issues: issues.slice(0, 30),
        };
    }
    start(intervalMs = 300000) {
        if (this.isRunning)
            return;
        this.isRunning = true;
        console.log(`[CI] Starting periodic monitoring every ${intervalMs / 1000}s`);
        void this.runAllChecks().then((results) => {
            this.handleResults(results);
        });
        this.checkInterval = setInterval(async () => {
            const results = await this.runAllChecks();
            this.handleResults(results);
        }, intervalMs);
    }
    stop() {
        if (this.checkInterval) {
            clearInterval(this.checkInterval);
            this.checkInterval = null;
        }
        this.isRunning = false;
        console.log('[CI] Monitoring stopped');
    }
    handleResults(results) {
        if (!results.tests.passed && results.tests.failing > 0) {
            EventBus_1.eventBus.emit('ci_failure', {
                type: 'tests',
                failures: results.tests.failures,
            });
        }
        if (!results.build.success) {
            EventBus_1.eventBus.emit('ci_failure', {
                type: 'build',
                errors: results.build.errors,
            });
        }
        if (!results.lint.clean && results.lint.errorCount > 0) {
            EventBus_1.eventBus.emit('ci_failure', {
                type: 'lint',
                issues: results.lint.issues,
            });
        }
    }
    getStatus() {
        return {
            running: this.isRunning,
            lastCheck: this.lastCheckAt || undefined,
        };
    }
    async quickCheck() {
        const build = await this.runBuild();
        return build.success;
    }
}
exports.CIMonitor = CIMonitor;
exports.ciMonitor = new CIMonitor();
//# sourceMappingURL=CIMonitor.js.map