const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..', 'src');
const localeDir = path.join(root, 'i18n', 'locales', 'en');

const bundle = {};
for (const f of fs.readdirSync(localeDir).filter((n) => n.endsWith('.json'))) {
  Object.assign(bundle, JSON.parse(fs.readFileSync(path.join(localeDir, f), 'utf8')));
}

const has = (key) => key.split('.').reduce((o, k) => (o == null ? undefined : o[k]), bundle) !== undefined;

const files = [];
(function walk(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p);
    else if (/\.jsx?$/.test(e.name)) files.push(p);
  }
})(root);

const missing = [];
for (const file of files) {
  const src = fs.readFileSync(file, 'utf8');
  for (const m of src.matchAll(/\b(?:t|tr)\(\s*'([a-zA-Z][\w.]*\.[\w.]+)'\s*[,)]/g)) {
    const key = m[1];
    if (has(key) || has(key + '_one') || has(key + '_other')) continue;
    missing.push(`${path.relative(root, file)}  ${key}`);
  }
}

if (missing.length) {
  console.error(`${missing.length} unresolved i18n key(s):\n` + missing.join('\n'));
  process.exit(1);
}
console.log(`i18n OK — every static t() key resolves (${files.length} files scanned).`);
