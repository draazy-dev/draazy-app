import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join, resolve } from 'node:path';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import helpContentPlugin from './scripts/vite-plugin-help-content.mjs';
import blogPlugin from './scripts/vite-plugin-blog.mjs';
import localityGuidesPlugin from './scripts/vite-plugin-locality-guides.mjs';
import contentIndexPlugin from './scripts/vite-plugin-content-index.mjs';
import spaFallbackPlugin from './scripts/vite-plugin-spa-fallback.mjs';
import routeHeadsPlugin from './scripts/vite-plugin-route-heads.mjs';
import { ROUTE_HEADS } from './src/data/routeHeads.js';

const PROXY_TARGET = process.env.VITE_PROXY_TARGET || 'http://localhost:8080';

function apiBaseHtmlPlugin() {
  let base = '/api';
  return {
    name: 'draazy-api-base-html',
    configResolved(c) { base = c.env.VITE_API_BASE || '/api'; },
    transformIndexHtml: (html) => html.replaceAll('__API_BASE__', base),
  };
}
function devInlineScriptHashesPlugin() {
  return {
    name: 'draazy-dev-inline-script-hashes',
    apply: 'serve',
    transformIndexHtml: {
      order: 'post',
      handler(html) {
        const hashes = [...html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]+?)<\/script>/g)]
          .map((m) => `'sha256-${createHash('sha256').update(m[1]).digest('base64')}'`)
          .filter((h) => !html.includes(h));
        return html.replace("script-src 'self'", `script-src 'self' ${hashes.join(' ')}`);
      },
    },
  };
}
function phosphorWeightsPlugin(keep = ['regular', 'fill']) {
  return {
    name: 'draazy-phosphor-weights',
    apply: 'build',
    transform(code, id) {
      if (!/@phosphor-icons[\\/]react[\\/]dist[\\/]defs[\\/]/.test(id)) return null;
      let list;
      (function walk(node) {
        if (list || !node || typeof node !== 'object') return;
        if (node.type === 'NewExpression' && node.callee.name === 'Map') { list = node.arguments[0]; return; }
        Object.values(node).forEach(walk);
      })(this.parse(code));
      if (list?.type !== 'ArrayExpression') return null;
      const kept = list.elements.filter((el) => keep.includes(el.elements[0].value));
      return code.slice(0, list.start) + '[' + kept.map((el) => code.slice(el.start, el.end)).join(',') + ']' + code.slice(list.end);
    },
  };
}
function noindexOffProductionPlugin() {
  let outDir;
  return {
    name: 'draazy-noindex-off-production',
    apply: 'build',
    configResolved(c) { outDir = resolve(c.root, c.build.outDir); },
    writeBundle() {
      if (new URL(process.env.SITE_URL || 'https://draazy.com').host === 'draazy.com') return;
      writeFileSync(join(outDir, 'robots.txt'), 'User-agent: Googlebot\nUser-agent: Bingbot\nDisallow:\n\nUser-agent: *\nDisallow: /\n');
      const headersPath = join(outDir, '_headers');
      const content = readFileSync(headersPath, 'utf8');
      writeFileSync(headersPath, content.replace(/^(\/\*[\r\n]+)/m, '$1  X-Robots-Tag: noindex\n'));
    },
  };
}
/* Cache shell/static assets only; listing/account data must stay NetworkOnly so stale availability
   or private state never ships from a service worker. */
function pwaPlugin(mode) {
  return VitePWA({
    disable: mode === 'e2e',
    registerType: 'autoUpdate',
    injectRegister: 'auto',
    manifest: false,
    devOptions: { enabled: false },
    workbox: {
      globPatterns: [
        '**/*.{css,html}',
        'assets/index-*.js',
        'assets/vendor-react-*.js',
      ],
      globIgnores: ['**/floorplans/**', 'blog.html', 'blog/**', 'help.html', 'help/**', 'locality.html', 'locality/**', ...Object.keys(ROUTE_HEADS).filter((p) => p !== '/').map((p) => `${p.slice(1)}.html`)],
      importScripts: ['push-sw.js'],
      // Without the denylist a navigation to /api/* would get the SPA shell.
      navigateFallback: '404.html',
      navigateFallbackDenylist: [/^\/api\//],
      cleanupOutdatedCaches: true,
      clientsClaim: true,
      skipWaiting: true,
      runtimeCaching: [
        {
          // First rule wins, so the API exclusion must stay first.
          urlPattern: ({ url }) => url.pathname.startsWith('/api/'),
          handler: 'NetworkOnly',
        },
        {
          urlPattern: ({ url, sameOrigin }) => sameOrigin && /\/assets\/.*-[\w-]{8,}\.(js|css|mjs)$/.test(url.pathname),
          handler: 'CacheFirst',
          options: {
            cacheName: 'dz-assets',
            expiration: { maxEntries: 120, maxAgeSeconds: 60 * 60 * 24 * 30 },
          },
        },
        {
          urlPattern: ({ url, sameOrigin }) => sameOrigin && url.pathname.startsWith('/fonts/'),
          handler: 'CacheFirst',
          options: {
            cacheName: 'dz-fonts',
            expiration: { maxEntries: 24, maxAgeSeconds: 60 * 60 * 24 * 365 },
            cacheableResponse: { statuses: [0, 200] },
          },
        },
        {
          urlPattern: ({ url }) => url.origin === 'https://images.unsplash.com'
            || /\/photos\/[0-9a-f-]{36}\/[0-9a-f-]{36}(?:-[0-9a-f]{16})?\.w\d+\.jpg$/.test(url.pathname),
          handler: 'CacheFirst',
          options: {
            cacheName: 'dz-images',
            expiration: { maxEntries: 80, maxAgeSeconds: 60 * 60 * 24 * 14 },
            cacheableResponse: { statuses: [0, 200] },
          },
        },
      ],
    },
  });
}

export default defineConfig(({ mode }) => ({
  esbuild: mode === 'production' && loadEnv(mode, __dirname, 'VITE_').VITE_DEPLOY_ENV !== 'sandbox'
    ? { drop: ['console', 'debugger'] }
    : {},
  plugins: [react(), phosphorWeightsPlugin(), helpContentPlugin({ root: __dirname }), blogPlugin({ root: __dirname }), localityGuidesPlugin({ root: __dirname }), contentIndexPlugin({ root: __dirname }), routeHeadsPlugin(), spaFallbackPlugin({ root: __dirname }), pwaPlugin(mode), apiBaseHtmlPlugin(), devInlineScriptHashesPlugin(), noindexOffProductionPlugin()],
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          const n = id.replace(/\\/g, '/');
          // Pin the preload helper to the eager chunk, or Rollup drags a whole vendor chunk into the entry.
          if (n.includes('vite/preload-helper')) return 'vendor-react';
          if (!n.includes('node_modules')) return;
          if (n.includes('jspdf')) return 'vendor-jspdf';
          if (n.includes('html2canvas')) return 'vendor-html2canvas';
          if (n.includes('pdfjs-dist')) return 'vendor-pdfjs';
          // Keep this before the react rule so react-chartjs-2 stays with charts.
          if (n.includes('chart.js') || n.includes('react-chartjs-2')) return 'vendor-charts';
          if (/node_modules\/react\//.test(n) || n.includes('react-dom')
            || n.includes('react-router') || n.includes('/scheduler/')) {
            return 'vendor-react';
          }
        },
      },
    },
  },
  server: {
    host: true,
    port: 5173,
    open: false,
    proxy: {
      '/api': {
        target: PROXY_TARGET,
        changeOrigin: true,
        headers: { origin: PROXY_TARGET },
      },
    },
    watch: {
      usePolling: true,
      interval: 300,
      ignored: [
        '**/*.backup',
        '**/*.bak',
        '**/*.orig',
        '**/.rollback/**',
        '**/_rollback/**',
        '**/*.original.jsx',
        '**/e2e/**',
        '**/test-results/**',
        '**/playwright-report/**',
        '**/node_modules/**',
        '**/.git/**',
      ],
    },
  },
}));
