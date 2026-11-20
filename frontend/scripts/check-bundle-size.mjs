import { gzipSync } from 'node:zlib';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const BUDGET_KB = 385;
const TARGET_KB = 180;

const DIST = join(process.cwd(), 'dist');
const HTML = join(DIST, 'index.html');

if (!existsSync(HTML)) {
  console.error('✗ dist/index.html not found — run `npm run build` first.');
  process.exit(1);
}

const html = readFileSync(HTML, 'utf8');

const local = (re) => [...html.matchAll(re)].map((m) => m[1]).filter((h) => h.startsWith('/'));

const assets = [
  ...local(/<script[^>]+type="module"[^>]+src="([^"]+)"/g),
  ...local(/<link[^>]+rel="modulepreload"[^>]+href="([^"]+)"/g),
  ...local(/<link[^>]+rel="stylesheet"[^>]+href="([^"]+)"/g),
];

if (assets.length === 0) {
  console.error('✗ No local entry assets found in dist/index.html — the build output shape changed.');
  process.exit(1);
}

let total = 0;
console.log('Critical path (gzip), read from dist/index.html:');
for (const href of assets) {
  const file = join(DIST, href.replace(/^\//, ''));
  if (!existsSync(file)) {
    console.error(`✗ index.html references ${href}, which is missing from dist.`);
    process.exit(1);
  }
  const kb = gzipSync(readFileSync(file)).length / 1024;
  total += kb;
  console.log(`  ${href.padEnd(46)} ${kb.toFixed(1).padStart(7)} KB`);
}

console.log(`  ${'TOTAL'.padEnd(46)} ${total.toFixed(1).padStart(7)} KB   (budget ${BUDGET_KB}, target ${TARGET_KB})`);

if (total > BUDGET_KB) {
  console.error(
    `\n✗ Critical path is ${(total - BUDGET_KB).toFixed(1)} KB over budget.\n` +
    '  Move the new weight into a lazy route chunk, or raise BUDGET_KB in this file\n' +
    '  deliberately — in a commit message someone can find later.',
  );
  process.exit(1);
}

console.log('\n✓ Within budget.');
