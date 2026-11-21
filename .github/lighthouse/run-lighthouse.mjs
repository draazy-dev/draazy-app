// Performance is record-only (runner variance, see ci.yml); A11y/BP/SEO are CPU-independent, LH_ENFORCE=1 gates them.
// It prints Lighthouse/Chrome versions and the CPU benchmark so a shift can be blamed on the app or the machine.

import { spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync, readFileSync, appendFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { propertyPath } from '../../frontend/src/lib/listingSeo.js';

// Pinned: Lighthouse re-weights its score between versions, so a bump makes before/after incomparable.
// Requires Node >= 22.19, which the workflow's NODE_VERSION satisfies.
const LIGHTHOUSE_VERSION = '13.4.1';

const ORIGIN = process.env.LH_ORIGIN || 'http://127.0.0.1:4173';
const OUT_DIR = resolve(process.env.LH_OUT_DIR || '.lighthouse');
const ENFORCE = process.env.LH_ENFORCE === '1';

async function featuredPropertyPath() {
  try {
    const res = await fetch(`${ORIGIN}/api/properties/featured`, { signal: AbortSignal.timeout(15000) });
    const [p] = res.ok ? await res.json() : [];
    return p?.id ? propertyPath({ id: p.id, slug: p.slug, bhk: p.bhk, type: p.propertyType, deal: p.deal, locality: p.locality }) : null;
  } catch {
    return null;
  }
}

// Without a reachable API there is no listing to open, and home/listings render their empty state.
const detailPath = await featuredPropertyPath();
const hasData = detailPath != null;

// Landing, results grid and detail page: the three shapes the product lives on, ~30 s each.
const ROUTES = [
  { slug: 'home', path: '/' },
  { slug: 'listings', path: '/listings' },
  ...(hasData ? [{ slug: 'property-detail', path: detailPath }] : []),
];

// Read by id defensively: Lighthouse renames/removes audits across majors, and a gap must print "n/a", not crash.
const METRICS = [
  { id: 'first-contentful-paint', label: 'FCP' },
  { id: 'largest-contentful-paint', label: 'LCP' },
  { id: 'total-blocking-time', label: 'TBT' },
  { id: 'cumulative-layout-shift', label: 'CLS' },
  { id: 'speed-index', label: 'SI' },
];

// Floors sit at what main scores today: raise them as pages improve, never lower one to pass a PR.
const GATED = [
  { id: 'accessibility', label: 'A11y', floor: 100 },
  { id: 'best-practices', label: 'BP', floor: 100 },
  { id: 'seo', label: 'SEO', floor: 100 },
];

function runLighthouse(url, jsonPath) {
  // `npx --yes`, not a devDependency: adding one means regenerating the lockfile every `npm ci` job relies on.
  const args = [
    '--yes',
    `lighthouse@${LIGHTHOUSE_VERSION}`,
    url,
    // Mobile is the default form factor; the one actually used is read back from the report and printed.
    `--only-categories=performance,${GATED.map((c) => c.id).join(',')}`,
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
const breaches = [];
const record = {
  lighthouseVersion: LIGHTHOUSE_VERSION,
  chrome: chromeVersion(),
  commit: process.env.GITHUB_SHA || null,
  origin: ORIGIN,
  hasData,
  measuredAt: new Date().toISOString(),
  routes: [],
};

for (const route of ROUTES) {
  const url = `${ORIGIN}${route.path}`;
  const jsonPath = resolve(OUT_DIR, `${route.slug}.json`);
  console.log(`\n=== Lighthouse (mobile): ${url} ===`);

  const lhr = runLighthouse(url, jsonPath);
  if (!lhr) {
    rows.push(`| \`${route.path}\` | — | ${[...METRICS, ...GATED].map(() => 'failed').join(' | ')} |`);
    record.routes.push({ ...route, ok: false });
    continue;
  }

  const audits = lhr.audits || {};
  const pct = (id) => {
    const s = lhr.categories?.[id]?.score;
    return s == null ? null : Math.round(s * 100);
  };
  const score = lhr.categories?.performance?.score;
  const cells = METRICS.map((m) => fmt(audits[m.id]));
  const gated = GATED.map((c) => ({ ...c, score: pct(c.id) }));

  rows.push(
    `| \`${route.path}\` | ${score == null ? 'n/a' : Math.round(score * 100)} | ${cells.join(' | ')} | `
      + `${gated.map((c) => c.score ?? 'n/a').join(' | ')} |`,
  );

  for (const c of gated.filter((g) => g.score == null || g.score < g.floor)) {
    const failing = (lhr.categories[c.id]?.auditRefs || [])
      .filter((ref) => ref.weight > 0 && audits[ref.id]?.score != null && audits[ref.id].score < 1)
      .map((ref) => ref.id);
    breaches.push(`${route.path}: ${c.label} ${c.score ?? 'n/a'} < ${c.floor} (failing: ${failing.join(', ') || 'n/a'})`);
  }

  record.routes.push({
    ...route,
    ok: true,
    performanceScore: score == null ? null : Math.round(score * 100),
    ...Object.fromEntries(gated.map((c) => [c.id, c.score])),
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
  `## Lighthouse — mobile, record-only — ${ORIGIN}`,
  '',
  '> Performance and its timings are recorded, never enforced. '
    + `${GATED.map((c) => `${c.label} ≥ ${c.floor}`).join(', ')} ${ENFORCE ? 'fail this job' : 'are reported only here'}.`,
  '> See the `lighthouse` job in `.github/workflows/ci.yml` for why performance is not a gate.',
  '',
  ...(hasData ? [] : [
    `> **No listing data at ${ORIGIN}.** Home and listings rendered their empty/error state and the`,
    '> detail page was skipped, so read FCP and TBT here; LCP and CLS come from the post-deploy sandbox run.',
    '',
  ]),
  `| Route | Perf | ${[...METRICS, ...GATED].map((m) => m.label).join(' | ')} |`,
  `| --- | --- | ${[...METRICS, ...GATED].map(() => '---').join(' | ')} |`,
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
  ...(breaches.length ? ['', '**Below floor:**', '', ...breaches.map((b) => `- ${b}`), ''] : []),
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

if (ENFORCE && breaches.length) {
  console.error(`\n${breaches.length} category score(s) below floor:\n${breaches.join('\n')}`);
  process.exit(1);
}
