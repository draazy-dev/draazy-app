import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { DETAIL_KEYS } from '../src/lib/listingFormDetails.js';

const here = dirname(fileURLToPath(import.meta.url));
const repo = join(here, '..', '..');

const SPEC = join(repo, 'backend/src/main/resources/static/openapi/draazy-api.yaml');
const FORM_DETAILS_JAVA = join(repo, 'backend/src/main/java/com/draazy/api/catalog/listing/ListingFormDetails.java');

const failures = [];
let checks = 0;

const ok = (cond, msg) => {
  checks += 1;
  if (!cond) failures.push(msg);
};

const sameSet = (actual, expected, what) => {
  checks += 1;
  const missing = [...expected].filter((v) => !actual.has(v));
  const extra = [...actual].filter((v) => !expected.has(v));
  if (missing.length || extra.length) {
    failures.push(
      `${what}: ${missing.length ? `contract has ${missing.map((v) => `'${v}'`).join(', ')} and the client does not` : ''}`
      + `${missing.length && extra.length ? '; ' : ''}`
      + `${extra.length ? `client has ${extra.map((v) => `'${v}'`).join(', ')} and the contract does not` : ''}`,
    );
  }
};

const specText = readFileSync(SPEC, 'utf8');
const specLines = specText.split(/\r?\n/);

function readEnums() {
  const bySchema = new Map();
  let schema = null;
  for (let i = 0; i < specLines.length; i += 1) {
    const line = specLines[i];
    const named = /^ {4}([A-Za-z0-9_]+):\s*$/.exec(line);
    if (named) schema = named[1];
    if (!/\benum:/.test(line)) continue;

    const inline = /\benum:\s*\[([^\]]*)\]/.exec(line);
    let values;
    if (inline) {
      values = inline[1].split(',').map((v) => v.trim().replace(/^['"]|['"]$/g, '')).filter(Boolean);
    } else {
      values = [];
      for (let j = i + 1; j < specLines.length; j += 1) {
        const item = /^\s*-\s*(.+?)\s*$/.exec(specLines[j]);
        if (!item) break;
        values.push(item[1].replace(/^['"]|['"]$/g, ''));
      }
    }
    if (!values.length) continue;
    const STRUCTURAL = new Set(['items', 'properties', 'additionalProperties']);
    let inlineField = (/^\s{6,}([A-Za-z0-9_]+):\s*\{/.exec(line) || [])[1] || null;
    if (inlineField && STRUCTURAL.has(inlineField)) inlineField = null;
    let field = inlineField;
    for (let j = i; j >= 0 && !field; j -= 1) {
      const f = /^\s{6,}([A-Za-z0-9_]+):\s*$/.exec(specLines[j]);
      if (f && !STRUCTURAL.has(f[1])) field = f[1];
    }
    const key = schema || '(root)';
    if (!bySchema.has(key)) bySchema.set(key, []);
    bySchema.get(key).push({ field, values, line: i + 1 });
  }
  return bySchema;
}

const enums = readEnums();

const declared = [...enums.values()].reduce((n, list) => n + list.length, 0);
ok(
  declared >= 150,
  `only ${declared} enum declarations were found in the contract, which is far below the ~210 that`
  + ' are there. The scanner has stopped understanding the file, so every comparison below is'
  + ' vacuous. Fix readEnums(), do not lower this floor.',
);

function topLevelEnum(name) {
  const found = enums.get(name);
  if (!found || !found.length) {
    ok(false, `the contract no longer declares a '${name}' schema with an enum. If it was renamed, `
      + 'this checker needs the new name — deleting the bridge is how the drift comes back.');
    return null;
  }
  checks += 1;
  return new Set(found[0].values);
}

function fieldEnum(schema, field) {
  const found = (enums.get(schema) || []).find((e) => e.field === field);
  if (!found) {
    ok(false, `the contract no longer declares an enum on ${schema}.${field}. If it moved, this `
      + 'checker needs the new location — deleting the bridge is how the drift comes back.');
    return null;
  }
  checks += 1;
  return new Set(found.values);
}

const { FURN, CONSTR_STATUS, TENANTS, ROOM_TYPES } = await import('../src/pages/consumer/listings/constants.js');
const { LAND_USE } = await import('../src/data/propertyTypes.js');
const { VOCAB } = await import('../src/services/providers/http/flatmateMapper.js');
const { landUseFor, plotZoneOptions } = await import('../src/pages/consumer/list-property/constants.js');
const { toViewModel, toListingCreate } = await import('../src/services/providers/http/propertyMapper.js');
const { toFacetQuery } = await import('../src/lib/listings/facetQuery.js');

const keysOf = (catalogue) => catalogue.map((e) => (Array.isArray(e) ? e[0] : e.value ?? e)).filter((k) => k !== '');

const filterState = (axis, value) => ({
  deal: axis === 'constr' ? 'buy' : 'rent',
  types: new Set(['flat']),
  [axis]: new Set([value]),
});

console.log('  1. Furnishing');
const furnishingWire = topLevelEnum('Furnishing');
if (furnishingWire) {
  for (const ui of keysOf(FURN)) {
    const written = toListingCreate({ furnishing: ui }).furnishing;
    ok(
      furnishingWire.has(written),
      `posting a listing with furnishing '${ui}' puts '${written}' on the wire, which is not one of`
      + ` ${[...furnishingWire].join(', ')}. The server rejects it 422 and the owner cannot act on it.`,
    );

    const facet = toFacetQuery(filterState('furnishing', ui)).furnishings || [];
    ok(
      facet.length > 0 && facet.every((v) => furnishingWire.has(v)),
      `filtering by furnishing '${ui}' sends ${facet.length ? facet.map((v) => `'${v}'`).join(', ') : 'nothing'},`
      + ` which the contract does not accept. The filter matches no row and the page reads as an`
      + ' empty catalogue rather than as a broken control.',
    );
  }

  const uiFurnishing = new Set(keysOf(FURN));
  for (const wire of furnishingWire) {
    const read = toViewModel({ id: 'x', furnishing: wire }).furnishing;
    ok(
      uiFurnishing.has(read),
      `a listing the server returns as '${wire}' reads back as '${read}', which is not a catalogue`
      + ' key. The label lookup only knows the catalogue, so the detail page renders an em-dash.',
    );
  }
}

console.log('  2. PropertyPossession');
const possessionWire = topLevelEnum('PropertyPossession');
if (possessionWire) {
  for (const ui of keysOf(CONSTR_STATUS)) {
    const written = toListingCreate({ construction: ui }).possession;
    ok(
      possessionWire.has(written),
      `posting a listing with construction status '${ui}' puts '${written}' on the wire, which is`
      + ` not one of ${[...possessionWire].join(', ')}.`,
    );
    const facet = toFacetQuery(filterState('constr', ui)).construction || [];
    ok(
      facet.length > 0 && facet.every((v) => possessionWire.has(v)),
      `filtering by construction status '${ui}' sends ${facet.length ? facet.map((v) => `'${v}'`).join(', ') : 'nothing'},`
      + ' which the contract does not accept.',
    );
  }
  const uiConstruction = new Set(keysOf(CONSTR_STATUS));
  for (const wire of possessionWire) {
    const read = toViewModel({ id: 'x', possession: wire }).construction;
    ok(
      uiConstruction.has(read),
      `a listing the server returns with possession '${wire}' reads back as '${read}', which is not`
      + ' a catalogue key.',
    );
  }
}

console.log('  4. identical vocabularies (no table, nothing to protect them)');
const identical = [
  ['LAND_USE', keysOf(LAND_USE), fieldEnum('PropertySummary', 'landUse')],
  ['ROOM_TYPES', keysOf(ROOM_TYPES), fieldEnum('PropertySummary', 'room')],
  ['TENANTS', keysOf(TENANTS), fieldEnum('PropertySummary', 'tenants')],
];
for (const [name, uiKeys, wire] of identical) {
  if (wire) sameSet(new Set(uiKeys), wire, `${name} vs the contract`);
}

console.log('  5. the flatmate furnishing fork');
const flatmateFurnishing = fieldEnum('FlatmateRoom', 'furnishing');
if (flatmateFurnishing) {
  sameSet(new Set(VOCAB.furnishing), flatmateFurnishing, 'VOCAB.furnishing vs FlatmateRoom.furnishing');
  ok(
    !flatmateFurnishing.has('semi-furnished') && flatmateFurnishing.has('semi'),
    'FlatmateRoom.furnishing has moved onto the `semi-furnished` spelling used by `Furnishing`.'
    + ' If the two vocabularies really have merged, flatmateMapper needs a translation table and'
    + ' this assertion should be deleted — but silently mirroring the new spelling in VOCAB while'
    + ' the flatmate tables still hold `semi` breaks every existing room.',
  );
}

console.log('  6. plot zoning translated into land use');
const landUseWire = fieldEnum('ListingFields', 'landUse');
const plotZoneWire = fieldEnum('ListingFormDetails', 'plotZone');
if (plotZoneWire) {
  const absent = plotZoneOptions.filter((v) => !plotZoneWire.has(v));
  ok(
    absent.length === 0,
    `the Zone picker offers ${absent.map((v) => `'${v}'`).join(', ')}, which the contract does not accept.`,
  );
}
if (landUseWire) {
  const translated = new Set();
  for (const zone of [...(plotZoneWire || plotZoneOptions)].filter(Boolean)) {
    const written = landUseFor('openplot', zone);
    translated.add(written);
    ok(
      landUseWire.has(written),
      `posting an open plot zoned '${zone}' puts '${written}' on the wire, which is not one of`
      + ` ${[...landUseWire].join(', ')}.`,
    );
  }
  const farm = landUseFor('farmland', '');
  ok(
    landUseWire.has(farm),
    `farm land is never asked its zone and defaults to '${farm}', which the contract does not accept.`,
  );
  translated.add(farm);
  ok(
    landUseFor('flat', 'Residential') === undefined,
    'a flat is being given a land use. A building has none of its own, and stating one files it'
    + ' under a filter that exists to find bare land.',
  );
  for (const key of keysOf(LAND_USE)) {
    ok(
      translated.has(key),
      `the Land-use filter offers '${key}', which no zone the wizard offers translates into — so no`
      + ' wizard-posted plot can ever answer it.',
    );
  }
}

const javaText = readFileSync(FORM_DETAILS_JAVA, 'utf8');

const javaKeys = new Set();
for (const table of ['TEXT', 'FLAGS', 'ARRAYS']) {
  const block = new RegExp(`Set<String> ${table} = Set\\.of\\(([\\s\\S]*?)\\);`).exec(javaText);
  ok(Boolean(block), `ListingFormDetails.java no longer declares a \`Set<String> ${table} = Set.of(...)\` this scanner can read.`);
  if (block) for (const [, key] of block[1].matchAll(/"([^"]+)"/g)) javaKeys.add(key);
}
ok(javaKeys.size > 40, `Only ${javaKeys.size} formDetails keys read from Java — the scanner has gone blind.`);
sameSet(DETAIL_KEYS, javaKeys, 'listingFormDetails.js DETAIL_KEYS vs ListingFormDetails.java TEXT+FLAGS+ARRAYS');

const REPORT_REASONS_JAVA = join(repo, 'backend/src/main/java/com/draazy/api/moderation/report/ReportReasons.java');
const reportText = readFileSync(REPORT_REASONS_JAVA, 'utf8');

const javaReasonSet = (name) => {
  const block = new RegExp(`Set<String> ${name} =\\s*Set\\.of\\(([^;]*?)\\);`).exec(reportText);
  ok(Boolean(block), `ReportReasons.java no longer declares a \`Set<String> ${name} = Set.of(...)\` this scanner can read.`);
  if (!block) return new Set();
  const body = block[1].replace(/\bOTHER\b/g, '"other"');
  return new Set([...body.matchAll(/"([^"]+)"/g)].map(([, v]) => v));
};

const { LISTING_REPORT_REASONS, SHARE_REPORT_REASONS, OWNER_REPORT_REASONS, REVIEW_REPORT_REASONS } =
  await import('../src/lib/reportReasons.js');

for (const [js, java, what] of [
  [LISTING_REPORT_REASONS, 'FOR_PROPERTY', 'LISTING_REPORT_REASONS vs FOR_PROPERTY'],
  [SHARE_REPORT_REASONS, 'FOR_POST', 'SHARE_REPORT_REASONS vs FOR_POST'],
  [OWNER_REPORT_REASONS, 'FOR_USER', 'OWNER_REPORT_REASONS vs FOR_USER'],
  [REVIEW_REPORT_REASONS, 'FOR_REVIEW', 'REVIEW_REPORT_REASONS vs FOR_REVIEW'],
]) {
  sameSet(new Set(keysOf(js)), javaReasonSet(java), `reportReasons.js ${what}`);
}

if (failures.length) {
  console.error(`\n  x ${failures.length} of ${checks} checks failed\n`);
  failures.forEach((f) => console.error(`    - ${f}\n`));
  console.error('  A word the browser sends is not a word the server accepts. Whatever the owner');
  console.error('  types into that control is being thrown away, or matched against nothing.');
  console.error('  Add the translation to the mapper — do not relax this check to make it pass.\n');
  process.exit(1);
}
console.log(`\n  check-enum-vocabulary: ok (${checks} checks)`);
console.log('');
