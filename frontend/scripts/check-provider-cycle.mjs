import { readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from 'espree';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const PROVIDER_ROOT = join(ROOT, 'src', 'services', 'providers');
const HTTP_MODULE = join(ROOT, 'src', 'services', 'http.js');
const CONFIG_MODULE = join(ROOT, 'src', 'services', 'config.js');

function collect(dir, out = []) {
  for (const entry of readdirSync(dir).sort()) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) collect(full, out);
    else if (entry.endsWith('.js')) out.push(full);
  }
  return out;
}

const isHttpImport = (spec, file) =>
  spec.startsWith('.') && resolve(dirname(file), spec) === HTTP_MODULE;

const DEFERRED = new Set(['FunctionDeclaration', 'FunctionExpression', 'ArrowFunctionExpression']);

const isDeferred = (node, parent, key) =>
  DEFERRED.has(node.type)
  && !((parent?.type === 'CallExpression' || parent?.type === 'NewExpression') && key === 'callee');

function walkModuleScope(node, onIdentifier, parent = null, key = null) {
  if (!node || typeof node.type !== 'string') return;
  if (isDeferred(node, parent, key)) return;
  if (node.type === 'ImportDeclaration' || node.type === 'ExportAllDeclaration') return;
  if (node.type === 'ExportNamedDeclaration' && node.source) return;

  if (node.type === 'MethodDefinition' || node.type === 'PropertyDefinition') {
    walkModuleScope(node.key, onIdentifier, node, 'key');
    if (node.type === 'PropertyDefinition' && node.static) {
      walkModuleScope(node.value, onIdentifier, node, 'value');
    }
    return;
  }

  if (node.type === 'Identifier') {
    const isMemberProperty = parent?.type === 'MemberExpression' && key === 'property' && !parent.computed;
    const isPropertyKey =
      (parent?.type === 'Property' || parent?.type === 'PropertyDefinition' || parent?.type === 'MethodDefinition')
      && key === 'key'
      && !parent.computed;
    const isDeclaredName =
      (parent?.type === 'VariableDeclarator' && key === 'id')
      || ((parent?.type === 'ClassDeclaration' || parent?.type === 'ClassExpression') && key === 'id')
      || (parent?.type === 'ExportSpecifier')
      || (parent?.type === 'ImportSpecifier')
      || (parent?.type === 'LabeledStatement');
    if (!isMemberProperty && !isPropertyKey && !isDeclaredName) onIdentifier(node);
    return;
  }

  for (const [childKey, child] of Object.entries(node)) {
    if (childKey === 'parent' || childKey === 'loc' || childKey === 'range') continue;
    if (Array.isArray(child)) child.forEach((c) => walkModuleScope(c, onIdentifier, node, childKey));
    else if (child && typeof child === 'object') walkModuleScope(child, onIdentifier, node, childKey);
  }
}

const failures = [];
let scanned = 0;

const configSource = readFileSync(CONFIG_MODULE, 'utf8');
const globCalls = [...configSource.matchAll(/import\.meta\.glob\((.*?)\)/gs)];
if (globCalls.length === 0) {
  failures.push('src/services/config.js: no `import.meta.glob(...)` found — this gate cannot vouch for it.');
}
for (const call of globCalls) {
  if (!/\beager\s*:\s*true\b/.test(call[1])) continue;
  const line = configSource.slice(0, call.index).split('\n').length;
  failures.push(
    `src/services/config.js:${line} globs the providers with \`eager: true\`, which reinstates the `
      + 'http.js -> config.js -> providers -> http.js import cycle.',
  );
}

for (const file of collect(PROVIDER_ROOT)) {
  const source = readFileSync(file, 'utf8');
  let ast;
  try {
    ast = parse(source, {
      ecmaVersion: 'latest',
      sourceType: 'module',
      loc: true,
      ecmaFeatures: { jsx: true },
    });
  } catch (err) {
    failures.push(`${relative(ROOT, file)}: could not be parsed (${err.message})`);
    continue;
  }
  scanned += 1;

  const imported = new Map();
  for (const stmt of ast.body) {
    if (stmt.type !== 'ImportDeclaration') continue;
    if (!isHttpImport(stmt.source.value, file)) continue;
    for (const spec of stmt.specifiers) {
      const source_ = spec.imported?.name ?? (spec.type === 'ImportDefaultSpecifier' ? 'default' : '*');
      imported.set(spec.local.name, source_);
    }
  }
  if (imported.size === 0) continue;

  walkModuleScope(ast, (id) => {
    if (!imported.has(id.name)) return;
    failures.push(
      `${relative(ROOT, file)}:${id.loc.start.line}:${id.loc.start.column + 1} reads `
        + `\`${id.name}\` (imported from services/http.js) at module scope.`,
    );
  });
}

if (failures.length) {
  console.error('\nProvider/http.js import-cycle check FAILED\n');
  for (const failure of failures) console.error(`  ✗ ${failure}`);
  console.error(
    '\n  Why this is fatal: with an eager glob, `http.js` imports `config.js`, `config.js` imports\n'
      + '  every provider, and every provider imports `http.js`. A provider is therefore sometimes\n'
      + "  evaluated *inside* `http.js`, while its exports are still in their temporal dead zone. A\n"
      + '  module-scope read throws during bootstrap and blanks the entire app on every route — with\n'
      + '  lint, build and bundle-size all green, because only a browser executes the cycle.\n'
      + '\n  Fix, in order of preference:\n'
      + '    0. Keep the glob in `config.js` lazy. That is what removes the cycle; the rest are\n'
      + '       mitigations for a cycle that should not exist.\n'
      + '    1. If it is a constant, move it to `src/services/apiLimits.js` (which imports nothing,\n'
      + '       so it is always evaluated first) and import it from there.\n'
      + '    2. Otherwise defer the read to call time — `const paged = () => ({ size: MAX_PAGE_SIZE })`\n'
      + '       rather than `const paged = { size: MAX_PAGE_SIZE }`.\n'
      + '\n  See tech-debt D208.\n',
  );
  process.exit(1);
}

console.log(
  `✓ provider/http.js cycle check: config.js globs lazily; ${scanned} provider modules, `
    + 'no module-scope reads.',
);
