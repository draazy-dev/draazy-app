// Builds the frontend into argv[2] for run-fast.ps1's preview shards; skipped while the inputs are unchanged.
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { APP_ENV } from '../app-env.js';

const FRONTEND = fileURLToPath(new URL('../../frontend/', import.meta.url));
const outDir = process.argv[2];
if (!outDir) throw new Error('usage: node scripts/build-app.mjs <outDir>');
const sigFile = `${outDir}.signature`;

const inputs = [
  ...readdirSync(FRONTEND, { withFileTypes: true }).filter((e) => e.isFile()).map((e) => e.name),
  ...['src', 'public', 'scripts', 'data'].flatMap((d) => readdirSync(join(FRONTEND, d), { recursive: true }).map((f) => join(d, f))),
];
const manifest = inputs
  .map((f) => ({ f, s: statSync(join(FRONTEND, f)) }))
  .filter(({ s }) => s.isFile())
  .map(({ f, s }) => `${f}|${s.size}|${s.mtimeMs}`)
  .sort()
  .join('\n');
const signature = createHash('sha256').update(manifest).digest('hex');

if (existsSync(join(outDir, 'index.html')) && existsSync(sigFile) && readFileSync(sigFile, 'utf8') === signature) {
  console.log('Frontend unchanged since the last e2e build.');
  process.exit(0);
}

console.log('Building the frontend for the preview shards...');
// NODE_ENV=development keeps import.meta.env.DEV true, as on the dev server the specs were written against.
const vite = join(FRONTEND, 'node_modules', 'vite', 'bin', 'vite.js');
const { status } = spawnSync(process.execPath, [vite, 'build', '--mode', 'e2e', '--outDir', outDir, '--emptyOutDir', '--logLevel', 'error'], {
  cwd: FRONTEND,
  stdio: 'inherit',
  env: { ...process.env, ...APP_ENV, NODE_ENV: 'development' },
});
if (status !== 0) process.exit(status ?? 1);
writeFileSync(sigFile, signature);
