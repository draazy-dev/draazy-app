import { readFileSync } from 'node:fs';

// Google's browser key admits localhost:1122, so run-fast.ps1 serves shard 1 there and pins these specs to it:
// the ones that drive a map, plus the ones that assert a clean console on a page that loads one.
const DRIVES_A_MAP = /gm-style|price-marker|\.map-pin|google\.maps|maps\.googleapis|RefererNotAllowed|Zoom in map|loc-sugg|pickGoogle|pickMarker|data-sf-area|gmp-|Google suggestion/;
const CLEAN_CONSOLE_ON_A_MAP = new Set([
  'tests/consumer/account/dashboard-flatmate-edit.spec.js',
  'tests/consumer/flatmates/form-typography.spec.js',
  'tests/consumer/flatmates/room-wizard-tabs.spec.js',
  'tests/consumer/search/locality-intel.spec.js',
  'tests/managed-properties.spec.js',
  'tests/mobile/pull-to-refresh.spec.js',
  'tests/property-integration.spec.js',
  'tests/property-integration-community.spec.js',
  'tests/rent-receipts.spec.js',
]);

export const needsMaps = (file) => CLEAN_CONSOLE_ON_A_MAP.has(file)
  || DRIVES_A_MAP.test(readFileSync(new URL(`./${file}`, import.meta.url), 'utf8'));
