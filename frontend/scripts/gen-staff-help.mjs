import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { compileStaffHelp } from './vite-plugin-help-content.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const target = join(root, '../backend/src/main/resources/help/staff-help.json');
const json = JSON.stringify(compileStaffHelp(root), null, 1) + '\n';

if (process.argv.includes('--check')) {
  let current = '';
  try { current = readFileSync(target, 'utf-8').replace(/\r\n/g, '\n'); } catch { /* missing reads as stale */ }
  if (current !== json) {
    console.error('Staff help is stale: run `npm run gen:staff-help` and commit backend/src/main/resources/help/staff-help.json');
    process.exit(1);
  }
  console.log('staff help: up to date');
} else {
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, json, 'utf-8');
  console.log('staff help: wrote', target);
}
