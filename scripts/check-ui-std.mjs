// Counts hand-rolled UI that bypasses the size scale (design-system.md - Compact scale); a count may only fall.
// `--update` rewrites scripts/ui-std-baseline.json after a cleanup.
import fs from 'node:fs';
import path from 'node:path';

const SRC = 'frontend/src';
const BASELINE = 'scripts/ui-std-baseline.json';
const STANDARD = /\bdz-(chip|tag|count|segmented)\b/;
const NOT_A_CHIP = /<(input|textarea|kbd)\b|focus:outline/;
const RULES = {
  pill: (l) => /\brounded-full\b/.test(l) && /\bpx-(1\.5|2|2\.5|3|3\.5)\b/.test(l) && /\bpy-(0|0\.5|1|1\.5)\b/.test(l),
  tag: (l) => /\brounded(-sm|-md|-lg)?\b(?!-)/.test(l) && /\bpx-(1|1\.5|2)\b/.test(l) && /\bpy-(0|0\.5)\b/.test(l),
  overlay: (l) => /\bfixed inset-0\b/.test(l),
  // A padded button grows with its font; h-btn / h-btn-sm / h-btn-lg pin it to the --btn-h* scale.
  cta: (l) => /<(button|Link|a)\b[^>]*className=[^>]*\brounded/.test(l) && /(?<![\w:-])py-(2|2\.5|3|3\.5|4)\b/.test(l)
    && /\bfont-(semibold|bold|medium)\b/.test(l) && !/(?<![\w-])(h-btn|btn|dz-control|text-left|justify-between|flex-col|items-start|gap-[34])\b/.test(l),
  // The OS picker ignores the theme and the floating-card shell; use DateField / TimeField / a month Select.
  nativePicker: (l) => /type=["'{]+(date|time|month|week|datetime-local)\b/.test(l),
};
// Full-screen by design, not popups: the shell itself, the maintenance screen, media lightboxes, navigation drawers.
const OVERLAY_OK = new Set([
  'components/ui/Modal.jsx',
  'components/layout/ConsumerLayout.jsx',
  'components/layout/Navbar.jsx',
  'components/layout/AdminLayout.jsx',
  'pages/consumer/services/InteriorRenovation.jsx',
]);

const walk = (dir) => fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
  const p = path.join(dir, e.name);
  if (e.isDirectory()) return walk(p);
  return e.name.endsWith('.jsx') ? [p] : [];
});

const counts = {};
for (const file of walk(SRC)) {
  const rel = path.relative(SRC, file).replaceAll('\\', '/');
  for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
    const sized = STANDARD.test(line) || NOT_A_CHIP.test(line);
    for (const [rule, hit] of Object.entries(RULES)) {
      if (!hit(line) || (sized && rule !== 'nativePicker') || (rule === 'overlay' && OVERLAY_OK.has(rel))) continue;
      const key = `${rel} ${rule}`;
      counts[key] = (counts[key] || 0) + 1;
    }
  }
}

const sorted = Object.fromEntries(Object.entries(counts).sort(([a], [b]) => a.localeCompare(b)));
const total = Object.values(sorted).reduce((a, b) => a + b, 0);
if (process.argv[2] === '--update') {
  fs.writeFileSync(BASELINE, `${JSON.stringify(sorted, null, 2)}\n`);
  console.log(`ui-std baseline written: ${total} hand-rolled item(s)`);
  process.exit(0);
}

const baseline = fs.existsSync(BASELINE) ? JSON.parse(fs.readFileSync(BASELINE, 'utf8')) : {};
const grew = Object.entries(sorted).filter(([k, n]) => n > (baseline[k] || 0));
for (const [k, n] of grew) console.log(`${k}: ${n} (baseline ${baseline[k] || 0}) - use .dz-chip / .dz-tag / <Modal> / DateField`);
const stale = Object.entries(baseline).some(([k, n]) => (sorted[k] || 0) < n);
console.log(`ui-std: ${total} hand-rolled item(s) left${stale ? ' - run with --update to lock in the drop' : ''}`);
process.exit(grew.length ? 1 : 0);
