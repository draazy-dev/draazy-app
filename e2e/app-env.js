// Shared by the dev server in playwright.config.js and the build in scripts/build-app.mjs, so both serve the same app.
export const APP_ENV = {
  VITE_API_BASE: '/api',
  VITE_POSTHOG_KEY: 'phc_e2e',
  VITE_POSTHOG_IN_DEV: 'on',
};
