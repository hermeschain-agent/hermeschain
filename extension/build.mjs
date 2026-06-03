/** Bundles the extension into dist/ — load that folder unpacked in Chrome. */
import * as esbuild from 'esbuild';
import { cpSync, mkdirSync, rmSync } from 'node:fs';

const dev = process.argv.includes('--dev');

rmSync('dist', { recursive: true, force: true });
mkdirSync('dist', { recursive: true });

await esbuild.build({
  entryPoints: { background: 'src/background.ts', popup: 'src/popup/popup.ts' },
  bundle: true,
  format: 'iife',
  target: 'es2022',
  outdir: 'dist',
  sourcemap: dev,
  minify: !dev,
  legalComments: 'none',
});

cpSync('public/manifest.json', 'dist/manifest.json');
cpSync('src/popup/popup.html', 'dist/popup.html');
cpSync('src/popup/popup.css', 'dist/popup.css');

console.log('Built extension → dist/  (chrome://extensions → Load unpacked → select dist/)');
