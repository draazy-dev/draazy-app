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
// Matches the favicon's data-light variant in index.html. The mark is a shade deeper than the tile's
// teal so it still reads against the mint bottom at 48px.
const TILE = ['#f8faf6', '#cfe7e3', '#a9d4cf'];
const MARK = ['#388f87', '#43a095'];

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
    <defs>
      <linearGradient id="tile" x2="0" y2="1">
        <stop offset="0" stop-color="${TILE[0]}"/><stop offset=".5" stop-color="${TILE[1]}"/><stop offset="1" stop-color="${TILE[2]}"/>
      </linearGradient>
      <linearGradient id="mark" gradientUnits="userSpaceOnUse" x1="0" y1="${ART.y0}" x2="0" y2="${ART.y1}">
        <stop offset="0" stop-color="${MARK[0]}"/><stop offset="1" stop-color="${MARK[1]}"/>
      </linearGradient>
      <filter id="emboss" x="-20%" y="-20%" width="140%" height="140%">
        <feDropShadow dx="0" dy="0.7" stdDeviation="0.7" flood-color="#0b5e57" flood-opacity="0.25"/>
      </filter>
    </defs>
    <rect width="64" height="64" rx="${64 * radius}" fill="url(#tile)"/>
    <g transform="translate(${tx} ${ty}) scale(${k})" filter="url(#emboss)">
      <path fill="url(#mark)" fill-rule="evenodd" d="${PROFILE}"/>
      <path fill="url(#mark)" stroke="url(#mark)" stroke-width="${DOOR_ROUND}" stroke-linejoin="round" d="${DOOR}"/>
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
