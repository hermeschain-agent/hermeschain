/**
 * Text-frame helpers for the ASCII terminal screen.
 *
 * Every visible row inside the terminal pane is a single line of
 * characters with side walls. These helpers render the frame, walls,
 * statusline, and MOTD without any HTML chrome.
 */

const H = '─';
const V = '│';
const TL = '┌';
const TR = '┐';
const BL = '└';
const BR = '┘';
const ML = '├';
const MR = '┤';

/** Pad a string to exactly `width` visible chars (truncates if too long). */
export function padRight(text: string, width: number): string {
  if (text.length >= width) return text.slice(0, width);
  return text + ' '.repeat(width - text.length);
}

/**
 * Wrap a content string with `│ ` + content + padding + `│`. Pads to
 * the interior width (cols - 2 for the two wall chars).
 */
export function wall(content: string, cols: number): string {
  const interior = Math.max(0, cols - 2);
  return V + padRight(content, interior) + V;
}

/**
 * ┌─[label]──────[chip]──[chip]─┐
 * Tags placed on the right, label on the left.
 */
export function frameTop(
  label: string,
  chips: string[],
  cols: number,
): string {
  const labelPart = label ? `[${label}]` : '';
  const chipsPart = chips.length > 0 ? chips.map((c) => `[${c}]`).join('──') : '';
  // compose: TL H [label] H*fill H chip1──chip2 H TR
  const left = `${TL}${H}${labelPart}`;
  const right = chipsPart ? `${chipsPart}${H}${TR}` : `${TR}`;
  const fillCount = Math.max(3, cols - left.length - right.length);
  return left + H.repeat(fillCount) + right;
}

/**
 * ├─────[label]────[chip]─┤   or  ├────┤
 * Use `kind: 'mid'` for middle dividers, `'bottom'` for the closer.
 */
export function frameDivider(
  cols: number,
  options: { label?: string; chips?: string[]; kind?: 'mid' | 'bottom' } = {},
): string {
  const { label, chips = [], kind = 'mid' } = options;
  const leftCorner = kind === 'bottom' ? BL : ML;
  const rightCorner = kind === 'bottom' ? BR : MR;
  const labelPart = label ? `[${label}]` : '';
  const chipsPart = chips.length > 0 ? chips.map((c) => `[${c}]`).join('──') : '';
  const left = `${leftCorner}${H}${labelPart}`;
  const right = chipsPart ? `${chipsPart}${H}${rightCorner}` : `${rightCorner}`;
  const fillCount = Math.max(3, cols - left.length - right.length);
  return left + H.repeat(fillCount) + right;
}

/** A single empty row with side walls — used for vertical spacing. */
export function spacerRow(cols: number): string {
  return wall('', cols);
}

/**
 * Render the MOTD block that shows on first session load. Constant-width,
 * fits inside the frame interior (cols - 2).
 */
export function motdBlock(info: {
  blockHeight: number;
  uptime: string;
  lastCommitSha?: string;
  lastCommitMessage?: string;
  version: string;
}, cols: number): string[] {
  const interior = cols - 2;
  const line = (s: string) => wall('  ' + s, cols);
  const blank = spacerRow(cols);

  const logo = [
    '██╗  ██╗███████╗██████╗ ███╗   ███╗███████╗███████╗',
    '██║  ██║██╔════╝██╔══██╗████╗ ████║██╔════╝██╔════╝',
    '███████║█████╗  ██████╔╝██╔████╔██║█████╗  ███████╗',
    '██╔══██║██╔══╝  ██╔══██╗██║╚██╔╝██║██╔══╝  ╚════██║',
    '██║  ██║███████╗██║  ██║██║ ╚═╝ ██║███████╗███████║',
    '╚═╝  ╚═╝╚══════╝╚═╝  ╚═╝╚═╝     ╚═╝╚══════╝╚══════╝  ' + info.version,
  ];

  const blockHeightStr = info.blockHeight.toLocaleString().padStart(11, '0');
  const login = new Date().toISOString().replace('T', ' ').slice(0, 16);
  const shortSha = (info.lastCommitSha || 'pending').slice(0, 7);
  const commitMsg = (info.lastCommitMessage || 'awaiting first autonomous commit').slice(0, interior - 24);

  const rows: string[] = [blank];
  for (const logoLine of logo) {
    rows.push(line(logoLine));
  }
  rows.push(blank);
  rows.push(line(`Last login: ${login} UTC  from hermeschain.xyz`));
  rows.push(line(`Block height:  ${blockHeightStr}`));
  rows.push(line(`Agent uptime:  ${info.uptime}`));
  rows.push(line(`Last commit:   ${shortSha} ${commitMsg}`));
  rows.push(blank);
  rows.push(line(`type  \`help\`  to list commands`));
  rows.push(blank);
  return rows;
}

/**
 * Render the 10-cell progress bar with block-drawing chars.
 */
export function progressBar(stage: string, phase: number): string {
  const stageToCells: Record<string, number> = {
    IDLE: 0,
    ANALYZE: 3,
    EXEC: 6,
    VERIFY: 9,
    RUN: 4,
    HALTED: 0,
    OFFLINE: 0,
  };
  const base = stageToCells[stage] ?? 0;
  if (base === 0) return '▱'.repeat(10);
  const bob = phase % 2;
  const filled = Math.max(1, Math.min(10, base + bob));
  return '▰'.repeat(filled) + '▱'.repeat(10 - filled);
}

/**
 * The bottom statusline, drawn with chips laid out between the left
 * and right corners. Example:
 *   ├─[RUN]──hermes@hermeschain──[▰▰▰▰▱▱▱▱▱▱]──18:42:13 UTC──idle 0s──♥─┤
 */
export function statusLine(
  state: {
    stage: string;
    host: string;
    progress: string;
    clock: string;
    idleText: string;
    heartbeat: string;
  },
  cols: number,
): string {
  const left = `${ML}${H}[${state.stage}]${H}${H}${state.host}${H}${H}[${state.progress}]`;
  const right = `${state.clock}${H}${H}${state.idleText}${H}${H}${state.heartbeat}${H}${MR}`;
  const fillCount = Math.max(3, cols - left.length - right.length);
  return left + H.repeat(fillCount) + right;
}

/**
 * Default interior width. Keep a bit below typical 80-col so the
 * frame fits on mobile with some margin. Tunable at runtime.
 */
export const DEFAULT_COLS = 80;
