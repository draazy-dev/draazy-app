#!/usr/bin/env node
// Lives in e2e/ for Playwright's Chromium. Paths and colours must match LogoMark.jsx and the favicon in index.html.
// Usage:  cd e2e && node scripts/gen-app-icons.mjs
import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const OUT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'frontend', 'public');

// evenodd knocks the counter out of PROFILE so the tile shows through; DOOR's round-join stroke rounds its corners.
const PROFILE =
  'M17 8 H32 A24 24 0 0 1 32 56 H17 A5 5 0 0 1 12 51 V13 A5 5 0 0 1 17 8 Z '
  + 'M17.5 12.5 H32 A19.5 19.5 0 0 1 32 51.5 H17.5 A1 1 0 0 1 16.5 50.5 V13.5 A1 1 0 0 1 17.5 12.5 Z';
const DOOR = 'M23.2 19.45 L30.7 23.17 V40.83 L23.2 44.55 Z';
const DOOR_ROUND = 4;
// Centre on the art's 44x48 box, not the 0..64 grid, or the mark sits off-centre.
const ART = { x0: 12, y0: 8, x1: 56, y1: 56 };
// The light palette, matching the default theme and the favicon's data-light variant in index.html.
const INK = '#f3f7f6';
const TEAL = '#0d9488';

// `scale` is art height / tile. Maskable is smaller: Android only guarantees the centre 80% circle survives.
// iOS fills transparent pixels with black and rounds the corners itself, so its icon must be a full square.
const ICONS = [
  { file: 'apple-touch-icon.png', size: 180, radius: 0, scale: 0.62 },
  { file: 'icon-192.png', size: 192, radius: 0.22, scale: 0.62 },
  { file: 'icon-512.png', size: 512, radius: 0.22, scale: 0.62 },
  { file: 'icon-maskable-512.png', size: 512, radius: 0, scale: 0.46 },
];

const svg = ({ size, radius, scale }) => {
  // Fit the art's HEIGHT to `scale` of the tile, then centre both axes on the
  // art's midpoint so the optical padding is even.
  const k = (scale * 64) / (ART.y1 - ART.y0);
  const tx = 32 - (k * (ART.x0 + ART.x1)) / 2;
  const ty = 32 - (k * (ART.y0 + ART.y1)) / 2;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 64 64">
    <rect width="64" height="64" rx="${64 * radius}" fill="${INK}"/>
    <g transform="translate(${tx} ${ty}) scale(${k})">
      <path fill="${TEAL}" fill-rule="evenodd" d="${PROFILE}"/>
      <path fill="${TEAL}" stroke="${TEAL}" stroke-width="${DOOR_ROUND}" stroke-linejoin="round" d="${DOOR}"/>
    </g>
  </svg>`;
};

mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch();
const page = await browser.newPage();

for (const icon of ICONS) {
  await page.setViewportSize({ width: icon.size, height: icon.size });
  await page.setContent(
    `<style>html,body{margin:0;padding:0}svg{display:block}</style>${svg(icon)}`,
  );
  await page.locator('svg').screenshot({ path: join(OUT, icon.file), omitBackground: true });
  console.log(`✔ ${icon.file}  ${icon.size}x${icon.size}`);
}

await browser.close();
