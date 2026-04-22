/**
 * Client-side command dispatcher for the terminal prompt.
 * Commands are a fixed enum. Unknown commands fall through to a
 * `bash: cmd: command not found` response.
 */

export interface TerminalCtx {
  blockHeight: number;
  uptime: string;
  genesisTimestamp: number;
  recentCommits: Array<{ shortHash: string; message: string; date: string }>;
  history: string[];
  handleTab: (tab: string) => void;
  clear: () => void;
}

export interface CommandResult {
  /** Lines to append to the stream, each rendered as its own row. */
  lines: string[];
  /** Whether to clear the stream before writing anything else. */
  clearFirst?: boolean;
  /** Tab target if the command triggered a nav. */
  navigateTo?: string;
}

const VALID_TABS = [
  'terminal',
  'hermes',
  'explorer',
  'faucet',
  'wallet',
  'network',
  'updates',
  'logs',
  'admin',
];

export const COMMAND_NAMES = [
  'help',
  'clear',
  'whoami',
  'uname',
  'uptime',
  'blocks',
  'tail',
  'summon',
  'goto',
  'ls',
  'history',
  'date',
  'echo',
  'pwd',
  'exit',
];

function helpLines(): string[] {
  return [
    'Available commands:',
    '',
    '  /help             list commands',
    '  /clear            wipe the stream',
    '  /whoami           show current identity',
    '  /uname [-a]       kernel / chain identity',
    '  /uptime           how long Hermes has been running',
    '  /date             current UTC time',
    '  /pwd              current path',
    '  /ls               pseudo filesystem listing',
    '  /blocks           last block heights',
    '  /tail [commits]   last autonomous commits',
    '  /summon hermes    open the agent chat',
    '  /goto <tab>       navigate (terminal / explorer / wallet ...)',
    '  /history          command history',
    '  /echo <args>      echo back',
  ];
}

export function executeCommand(raw: string, ctx: TerminalCtx): CommandResult {
  const trimmed = raw.trim();
  if (!trimmed) {
    return { lines: [] };
  }
  const [cmd, ...rest] = trimmed.split(/\s+/);
  const args = rest.join(' ');

  switch (cmd) {
    case 'help':
      return { lines: helpLines() };

    case 'clear': {
      ctx.clear();
      return { lines: [], clearFirst: true };
    }

    case 'whoami':
      return { lines: ['hermes   (pid 1 · uid 0 · group:chain)'] };

    case 'uname': {
      const full = rest.includes('-a');
      if (full) {
        return {
          lines: [
            'HERMESCHAIN 0.4.2 #1 SMP autonomous x86_64 GNU/HERMES',
            `  nodename: hermeschain`,
            `  machine:  x86_64`,
            `  kernel:   hermes-core 0.4.2`,
            `  chain:    hermeschain-mainnet`,
          ],
        };
      }
      return { lines: ['HERMESCHAIN'] };
    }

    case 'uptime': {
      const now = new Date();
      const up = formatUptime(ctx.genesisTimestamp, Date.now());
      return {
        lines: [
          `${now.toISOString().substring(11, 19)} up ${up}, 1 user, load avg: 0.41 0.38 0.35`,
        ],
      };
    }

    case 'date':
      return { lines: [new Date().toUTCString()] };

    case 'pwd':
      return { lines: ['/hermes/chain/head'] };

    case 'ls': {
      return {
        lines: [
          'blocks/     tx/        accounts/     commits/',
          'state/      validators/  backlog/     logs/',
        ],
      };
    }

    case 'blocks': {
      const head = ctx.blockHeight;
      const rows: string[] = ['height        producer   finality'];
      for (let i = 0; i < 5; i += 1) {
        const h = head - i;
        if (h < 0) break;
        const finality = i === 0 ? 'head' : i < 3 ? 'confirmed' : 'final';
        rows.push(
          `${h.toString().padStart(11, '0')}  HERMES     ${finality}`,
        );
      }
      return { lines: rows };
    }

    case 'tail': {
      const subject = rest[0] || 'commits';
      if (subject === 'commits') {
        if (ctx.recentCommits.length === 0) {
          return { lines: ['waiting for first autonomous commit...'] };
        }
        return {
          lines: ctx.recentCommits.slice(0, 6).map(
            (c) => `${c.shortHash}  ${relativeAge(c.date).padEnd(7, ' ')}  ${c.message.split('\n')[0].slice(0, 64)}`,
          ),
        };
      }
      return { lines: [`tail: ${subject}: no such stream`] };
    }

    case 'summon': {
      const target = rest[0];
      if (target === 'hermes' || !target) {
        ctx.handleTab('hermes');
        return {
          lines: ['summoning hermes...'],
          navigateTo: 'hermes',
        };
      }
      return { lines: [`summon: unknown entity: ${target}`] };
    }

    case 'goto': {
      const target = rest[0];
      if (!target) return { lines: ['usage: goto <tab>'] };
      if (VALID_TABS.includes(target)) {
        ctx.handleTab(target);
        return { lines: [`→ ${target}`], navigateTo: target };
      }
      return {
        lines: [
          `goto: no such tab: ${target}`,
          `  valid: ${VALID_TABS.join(' · ')}`,
        ],
      };
    }

    case 'history':
      if (ctx.history.length === 0) {
        return { lines: ['(empty)'] };
      }
      return {
        lines: ctx.history.map((entry, index) =>
          `${(index + 1).toString().padStart(4, ' ')}  ${entry}`,
        ),
      };

    case 'echo':
      return { lines: [args] };

    case 'exit':
      return { lines: ['^D'] };

    default:
      return {
        lines: [`Unknown command: /${cmd} — type /help for the list.`],
      };
  }
}

function formatUptime(genesisMs: number, nowMs: number): string {
  const deltaSec = Math.max(0, Math.floor((nowMs - genesisMs) / 1000));
  const d = Math.floor(deltaSec / 86400);
  const h = Math.floor((deltaSec % 86400) / 3600);
  const m = Math.floor((deltaSec % 3600) / 60);
  if (d > 0) return `${d}d ${h}h ${m}m`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

function relativeAge(iso: string): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return '?';
  const diff = Math.max(0, Math.floor((Date.now() - then) / 1000));
  if (diff < 60) return `${diff}s`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h`;
  return `${Math.floor(diff / 86400)}d`;
}

/** Simple prefix autocomplete over COMMAND_NAMES. */
export function autocomplete(prefix: string): string | null {
  const trimmed = prefix.trim();
  if (!trimmed || trimmed.includes(' ')) return null;
  const matches = COMMAND_NAMES.filter((name) => name.startsWith(trimmed));
  if (matches.length === 1) return matches[0];
  return null;
}
