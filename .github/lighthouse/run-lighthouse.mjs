// Record-only on purpose: one run on a shared runner varies more than a real regression (see lighthouse.yml).
// It prints Lighthouse/Chrome versions and the CPU benchmark so a shift can be blamed on the app or the machine.

import { spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync, readFileSync, appendFileSync } from 'node:fs';
import { resolve } from 'node:path';

// Pinned: Lighthouse re-weights its score between versions, so a bump makes before/after incomparable.
// Requires Node >= 22.19, which the workflow's NODE_VERSION satisfies.
const LIGHTHOUSE_VERSION = '13.4.1';

const ORIGIN = process.env.LH_ORIGIN || 'http://127.0.0.1:4173';
const OUT_DIR = resolve(process.env.LH_OUT_DIR || '.lighthouse');

// Landing, results grid and detail page: the three shapes the product lives on, ~30 s each.
// P5000 is served from bundled mock data (VITE_API_MODE=mock) and is the same id the mobile e2e suite uses.
const ROUTES = [
  { slug: 'home', path: '/' },
  { slug: 'listings', path: '/listings' },
  { slug: 'property-detail', path: '/property/P5000' },
];

// Read by id defensively: Lighthouse renames/removes audits across majors, and a gap must print "n/a", not crash.
const METRICS = [
  { id: 'first-contentful-paint', label: 'FCP' },
  { id: 'largest-contentful-paint', label: 'LCP' },
  { id: 'total-blocking-time', label: 'TBT' },
  { id: 'cumulative-layout-shift', label: 'CLS' },
  { id: 'speed-index', label: 'SI' },
];

function runLighthouse(url, jsonPath) {
  // `npx --yes`, not a devDependency: adding one means regenerating the lockfile every `npm ci` job relies on.
  const args = [
    '--yes',
    `lighthouse@${LIGHTHOUSE_VERSION}`,
    url,
    // Mobile is the default form factor; the one actually used is read back from the report and printed.
    '--only-categories=performance',
    '--output=json',
    `--output-path=${jsonPath}`,
    // chrome-launcher defaults to headful, which fails on a display-less runner.
    // --no-sandbox / --disable-dev-shm-usage let it survive a container-based self-hosted runner.
    '--chrome-flags=--headless --no-sandbox --disable-dev-shm-usage',
  ];

  const res = spawnSync('npx', args, {
    stdio: ['ignore', 'inherit', 'inherit'],
    shell: process.platform === 'win32',
    encoding: 'utf8',
  });

  if (res.status !== 0) return null;

  try {
    return JSON.parse(readFileSync(jsonPath, 'utf8'));
  } catch {
    return null;
  }
}

function chromeVersion() {
  for (const bin of ['google-chrome', 'google-chrome-stable', 'chromium']) {
    const r = spawnSync(bin, ['--version'], { encoding: 'utf8', shell: process.platform === 'win32' });
    if (r.status === 0 && r.stdout) return r.stdout.trim();
  }
  return 'unknown';
}

function fmt(audit) {
  if (!audit || audit.numericValue == null) return 'n/a';
  return audit.displayValue || String(audit.numericValue);
}

mkdirSync(OUT_DIR, { recursive: true });

const rows = [];
const record = {
  lighthouseVersion: LIGHTHOUSE_VERSION,
  chrome: chromeVersion(),
  commit: process.env.GITHUB_SHA || null,
  origin: ORIGIN,
  measuredAt: new Date().toISOString(),
  routes: [],
};

for (const route of ROUTES) {
  const url = `${ORIGIN}${route.path}`;
  const jsonPath = resolve(OUT_DIR, `${route.slug}.json`);
  console.log(`\n=== Lighthouse (mobile): ${url} ===`);

  const lhr = runLighthouse(url, jsonPath);
  if (!lhr) {
    rows.push(`| \`${route.path}\` | — | failed | failed | failed | failed | failed |`);
    record.routes.push({ ...route, ok: false });
    continue;
  }

  const audits = lhr.audits || {};
  const score = lhr.categories?.performance?.score;
  const cells = METRICS.map((m) => fmt(audits[m.id]));

  rows.push(
    `| \`${route.path}\` | ${score == null ? 'n/a' : Math.round(score * 100)} | ${cells.join(' | ')} |`,
  );

  record.routes.push({
    ...route,
    ok: true,
    performanceScore: score == null ? null : Math.round(score * 100),
    formFactor: lhr.configSettings?.formFactor ?? 'unknown',
    metrics: Object.fromEntries(
      METRICS.map((m) => [m.id, audits[m.id]?.numericValue ?? null]),
    ),
  });

  // The CPU benchmark index is the biggest run-to-run drift on shared runners; without it a swing looks like code.
  record.benchmarkIndex = lhr.environment?.benchmarkIndex ?? null;
  record.formFactor = lhr.configSettings?.formFactor ?? 'unknown';
}

writeFileSync(resolve(OUT_DIR, 'summary.json'), `${JSON.stringify(record, null, 2)}\n`);

const summary = [
  '## Lighthouse — mobile, record-only',
  '',
  '> No budgets. These numbers are recorded, never enforced — this job cannot fail a PR',
  '> on a metric. See `.github/workflows/lighthouse.yml` for why, and for what would have',
  '> to be true before it becomes a gate.',
  '',
  `| Route | Perf | ${METRICS.map((m) => m.label).join(' | ')} |`,
  `| --- | --- | ${METRICS.map(() => '---').join(' | ')} |`,
  ...rows,
  '',
  `**Form factor:** ${record.formFactor ?? 'unknown'} · `
    + `**Lighthouse:** ${LIGHTHOUSE_VERSION} · `
    + `**Chrome:** ${record.chrome} · `
    + `**Runner CPU benchmark index:** ${record.benchmarkIndex ?? 'n/a'}`,
  '',
  '_Single run per route. Expect several points of score movement between runs on identical'
    + ' code; compare the benchmark index above before reading a change as a regression._',
  '_Full reports are in the `lighthouse-reports` artifact — drop a `.json` into'
    + ' <https://googlechrome.github.io/lighthouse/viewer/> to read it._',
  '',
].join('\n');

if (process.env.GITHUB_STEP_SUMMARY) {
  appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${summary}\n`);
}
console.log(`\n${summary}`);

// A bad number never fails the job, but no route reporting at all is a broken job, not a slow app.
const anyOk = record.routes.some((r) => r.ok);
if (!anyOk) {
  console.error('\nEvery Lighthouse run failed — the job is broken, not the app.');
  process.exit(1);
}
