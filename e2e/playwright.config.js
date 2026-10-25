import fs from 'node:fs';
import { defineConfig, devices } from '@playwright/test';
import { NO_BACKEND } from './no-backend-specs.js';
import { APP_ENV } from './app-env.js';

// Every spec runs against the live API, so a `live-` prefix carries no meaning and only breeds copies.
const prefixed = fs
  .readdirSync(new URL('./tests', import.meta.url), { recursive: true })
  .filter((f) => /(^|[\\/])live-[^\\/]*\.spec\.js$/.test(f));
if (prefixed.length) throw new Error(`Drop the "live-" prefix from: ${prefixed.join(', ')}`);

// **It resets a database**: prefer the `run-live-*.ps1` lanes, which pin port, database and app URL together.
const BASE_URL = process.env.BASE_URL || 'http://localhost:5173';
if (process.env.CI || !['localhost', '127.0.0.1', '[::1]'].includes(new URL(BASE_URL).hostname)) {
  throw new Error('e2e runs only on developer machines: it refuses CI and any BASE_URL that is not localhost.');
}
const API_PORT = process.env.API_PORT || '8081';
// run-fast.ps1 doubles this for parallel shards, where every backend shares the same CPU.
const TIMEOUT_SCALE = Math.max(1, Number(process.env.E2E_TIMEOUT_SCALE) || 1);
// run-fast.ps1 points this at one shared build (scripts/build-app.mjs) so parallel shards skip per-module dev serving.
const DIST = process.env.E2E_DIST;
const APP_PORT = new URL(BASE_URL).port;

// `tests/mobile/**` is phone-only; the desktop project ignores the same expression.
const MOBILE = /[\\/]tests[\\/]mobile[\\/]/;

// Only suggestive (the backend is started by hand), but a backend that refused to boot reads as a flaky test.
if (!process.env.DRAAZY_DEV_MACHINE) {
  console.warn(
    '[live] DRAAZY_DEV_MACHINE is not set in this shell. If the backend was started without it, ' +
      'it refused to boot under the `dev` profile and every login below will time out. ' +
      'See docs/LOCAL_DEV.md.',
  );
}

export default defineConfig({
  testDir: './tests',
  // At the start rather than in a teardown, so a crashed run leaves its evidence intact.
  globalSetup: './global-setup.live.js',
  timeout: 60_000 * TIMEOUT_SCALE,
  expect: { timeout: 15_000 * TIMEOUT_SCALE },
  retries: 0,
  // The specs share seeded fixtures and a single session cache.
  workers: 1,
  reporter: [['list']],
  use: {
    baseURL: BASE_URL,
    headless: true,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    actionTimeout: 15_000 * TIMEOUT_SCALE,
    navigationTimeout: 20_000 * TIMEOUT_SCALE,
    // PostHog loads for real (VITE_POSTHOG_IN_DEV in app-env.js), but nothing reaches PostHog unless a spec routes it.
    launchOptions: { args: ['--host-resolver-rules=MAP *.posthog.com ~NOTFOUND'] },
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
      // A 48px tap target at 1280px is not evidence about a phone; `NO_BACKEND` belongs to the other config.
      testIgnore: [MOBILE, ...NO_BACKEND],
    },
    {
      /* `mobile-small` already runs all of `tests/mobile/**` at the stricter 360×640, so Pixel 7 only takes
         specs whose assertions change with width or fold height, plus the cross-viewport list. */
      name: 'mobile',
      use: { ...devices['Pixel 7'] },
      testMatch: [
        '**/mobile/home-featured-first.spec.js',
        '**/mobile/home-flatmates-tile.spec.js',
        // Which contact-box copy answers `Request number` is layout; the exhausted upsell is likeliest to break narrow.
        '**/consumer/services/referral-rewards.spec.js',
        '**/platform/help/centre.spec.js',
        '**/platform/help/help-urls.spec.js',
        '**/platform/i18n.spec.js',
      ],
    },
    {
      // Low-end Android baseline, where bottom chrome and tap targets break first; most mobile specs run here.
      name: 'mobile-small',
      use: {
        ...devices['Pixel 7'],
        viewport: { width: 360, height: 640 },
        hasTouch: true,
        isMobile: true,
      },
      testMatch: MOBILE,
    },
  ],
  webServer: {
    command: DIST
      ? `npm --prefix ../frontend run preview -- --outDir "${DIST}" --port ${APP_PORT} --strictPort`
      : `npm --prefix ../frontend run dev -- --port ${APP_PORT} --strictPort`,
    url: BASE_URL,
    timeout: 120_000,
    reuseExistingServer: false,
    stdout: 'ignore',
    stderr: 'pipe',
    env: {
      ...APP_ENV,
      VITE_PROXY_TARGET: `http://localhost:${API_PORT}`,
    },
  },
});
