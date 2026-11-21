import { defineConfig, mergeConfig } from 'vitest/config';
import viteConfig from './vite.config.js';

// JSX screens are covered by the Playwright e2e suite, which reports no coverage; unit tests target the logic modules.
export default defineConfig((env) => mergeConfig(viteConfig(env), {
  test: {
    include: ['test/unit/**/*.test.{js,jsx}'],
    environment: 'jsdom',
    restoreMocks: true,
    coverage: {
      provider: 'v8',
      // Sonar resolves lcov paths from the repo root.
      reporter: [['lcov', { projectRoot: '..' }], 'text-summary'],
      include: ['src/**/*.{js,mjs}', 'functions/**/*.js', 'edge/**/*.mjs'],
      exclude: ['**/*.test.mjs', 'src/data/societies-rera.js'],
    },
  },
}));
