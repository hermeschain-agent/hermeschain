import { spawnSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import { eventBus } from '../events/EventBus';
import { AgentConfig } from './config';

export interface TestResult {
  passed: boolean;
  total: number;
  passing: number;
  failing: number;
  duration: number;
  failures: TestFailure[];
}

export interface TestFailure {
  testName: string;
  file: string;
  message: string;
  stack?: string;
}

export interface BuildResult {
  success: boolean;
  duration: number;
  errors: string[];
  warnings: string[];
}

export interface LintResult {
  clean: boolean;
  errorCount: number;
  warningCount: number;
  issues: LintIssue[];
}

export interface LintIssue {
  file: string;
  line: number;
  column: number;
  severity: 'error' | 'warning';
  message: string;
  rule: string;
}

interface PackageTarget {
  name: string;
  dir: string;
  scripts: Record<string, string>;
}

interface ScriptRunResult {
  available: boolean;
  success: boolean;
  duration: number;
  output: string;
}

export class CIMonitor {
  private projectRoot: string;
  private config: AgentConfig | null = null;
  private isRunning = false;
  private checkInterval: NodeJS.Timeout | null = null;
  private lastCheckAt: Date | null = null;
  private watchers: fs.FSWatcher[] = [];
  private watchDebounce: NodeJS.Timeout | null = null;
  private isCheckInFlight = false;

  constructor(projectRoot?: string) {
    this.projectRoot = projectRoot || process.cwd();
  }

  configure(config: AgentConfig): void {
    this.config = config;
    if (config.repoRoot) {
      this.projectRoot = config.repoRoot;
    }
  }

  private getPackageTargets(): PackageTarget[] {
    const targets: PackageTarget[] = [];
    const base = this.config?.repoRoot || this.projectRoot;

    for (const name of ['backend', 'frontend']) {
      const dir = path.join(base, name);
      const packagePath = path.join(dir, 'package.json');
      if (!fs.existsSync(packagePath)) continue;

      try {
        const pkg = JSON.parse(fs.readFileSync(packagePath, 'utf-8'));
        targets.push({
          name,
          dir,
          scripts: pkg.scripts || {},
        });
      } catch (error) {
        console.error(`[CI] Failed to parse ${packagePath}:`, error);
      }
    }

    return targets;
  }

  private runPackageScript(target: PackageTarget, script: string, timeout: number): ScriptRunResult {
    if (!target.scripts[script]) {
      return {
        available: false,
        success: true,
        duration: 0,
        output: '',
      };
    }

    const startTime = Date.now();
    const result = spawnSync('npm', ['run', script], {
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

  async runAllChecks(): Promise<{
    tests: TestResult;
    build: BuildResult;
    lint: LintResult;
  }> {
    console.log('[CI] Running all checks...');

    const [tests, build, lint] = await Promise.all([
      this.runTests(),
      this.runBuild(),
      this.runLint(),
    ]);

    this.lastCheckAt = new Date();
    eventBus.emit('ci_results', { tests, build, lint });

    return { tests, build, lint };
  }

  async runTests(): Promise<TestResult> {
    const targets = this.getPackageTargets();
    let total = 0;
    let failing = 0;
    let duration = 0;
    const failures: TestFailure[] = [];

    for (const target of targets) {
      const result = this.runPackageScript(target, 'test', 180000);
      if (!result.available) continue;

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

  async runBuild(): Promise<BuildResult> {
    const targets = this.getPackageTargets();
    let duration = 0;
    const errors: string[] = [];
    const warnings: string[] = [];

    for (const target of targets) {
      const result = this.runPackageScript(target, 'build', 240000);
      if (!result.available) continue;

      duration += result.duration;
      const lines = result.output.split('\n').filter(Boolean);
      warnings.push(
        ...lines.filter((line) => /warning/i.test(line)).map((line) => `[${target.name}] ${line}`)
      );

      if (!result.success) {
        errors.push(
          ...lines
            .filter((line) => /error|failed/i.test(line))
            .slice(0, 20)
            .map((line) => `[${target.name}] ${line}`)
        );
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

  async runLint(): Promise<LintResult> {
    const targets = this.getPackageTargets();
    const issues: LintIssue[] = [];

    for (const target of targets) {
      const result = this.runPackageScript(target, 'lint', 120000);
      if (!result.available) continue;

      const lines = result.output.split('\n').filter(Boolean);
      const parsedIssues = lines
        .map((line) => {
          const match = line.match(/(.+?):(\d+):(\d+):\s*(error|warning)\s+(.+?)\s+(\S+)$/);
          if (!match) return null;
          return {
            file: path.relative(this.projectRoot, match[1]),
            line: parseInt(match[2], 10),
            column: parseInt(match[3], 10),
            severity: match[4] as 'error' | 'warning',
            message: match[5],
            rule: match[6],
          } satisfies LintIssue;
        })
        .filter(Boolean) as LintIssue[];

      if (parsedIssues.length > 0) {
        issues.push(...parsedIssues);
      } else if (!result.success) {
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

  start(intervalMs: number = 300000): void {
    if (this.isRunning) return;

    this.isRunning = true;
    console.log(`[CI] Starting periodic monitoring every ${intervalMs / 1000}s`);

    void this.runChecksOnce('initial');

    this.checkInterval = setInterval(async () => {
      await this.runChecksOnce('poll');
    }, intervalMs);

    this.startFileWatch();
  }

  /**
   * fs.watch on backend/src and frontend/src. Any change triggers a
   * 5-second-debounced runAllChecks, so bulk saves (a single "git pull"
   * or editor autosave burst) collapse to one CI run. Polling stays on
   * as a safety net for filesystems where recursive watch isn't available.
   */
  startFileWatch(): void {
    if (this.watchers.length > 0) return;
    const base = this.config?.repoRoot || this.projectRoot;
    const targets = ['backend/src', 'frontend/src'];

    for (const rel of targets) {
      const dir = path.join(base, rel);
      if (!fs.existsSync(dir)) continue;
      try {
        const watcher = fs.watch(dir, { recursive: true }, (_event, filename) => {
          if (!filename) return;
          this.debouncedRun(`watch:${rel}/${filename}`);
        });
        this.watchers.push(watcher);
        console.log(`[CI] Watching ${rel} for changes`);
      } catch (err: any) {
        console.warn(`[CI] Could not watch ${rel}:`, err?.message || err);
      }
    }
  }

  private debouncedRun(trigger: string): void {
    if (this.watchDebounce) clearTimeout(this.watchDebounce);
    this.watchDebounce = setTimeout(() => {
      void this.runChecksOnce(trigger);
    }, 5000);
  }

  private async runChecksOnce(trigger: string): Promise<void> {
    if (this.isCheckInFlight) return;
    this.isCheckInFlight = true;
    eventBus.emit('ci_watch_triggered', { trigger, timestamp: Date.now() });
    try {
      const results = await this.runAllChecks();
      this.handleResults(results);
    } finally {
      this.isCheckInFlight = false;
    }
  }

  stop(): void {
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = null;
    }
    if (this.watchDebounce) {
      clearTimeout(this.watchDebounce);
      this.watchDebounce = null;
    }
    for (const w of this.watchers) {
      try { w.close(); } catch { /* noop */ }
    }
    this.watchers = [];
    this.isRunning = false;
    console.log('[CI] Monitoring stopped');
  }

  private handleResults(results: {
    tests: TestResult;
    build: BuildResult;
    lint: LintResult;
  }): void {
    if (!results.tests.passed && results.tests.failing > 0) {
      eventBus.emit('ci_failure', {
        type: 'tests',
        failures: results.tests.failures,
      });
    }

    if (!results.build.success) {
      eventBus.emit('ci_failure', {
        type: 'build',
        errors: results.build.errors,
      });
    }

    if (!results.lint.clean && results.lint.errorCount > 0) {
      eventBus.emit('ci_failure', {
        type: 'lint',
        issues: results.lint.issues,
      });
    }
  }

  getStatus(): { running: boolean; lastCheck?: Date } {
    return {
      running: this.isRunning,
      lastCheck: this.lastCheckAt || undefined,
    };
  }

  async quickCheck(): Promise<boolean> {
    const build = await this.runBuild();
    return build.success;
  }
}

export const ciMonitor = new CIMonitor();
