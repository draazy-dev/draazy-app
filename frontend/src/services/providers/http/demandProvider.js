import { get, post } from '../../http.js';

const trimmed = (v) => {
  const s = String(v ?? '').trim();
  return s === '' ? undefined : s;
};

export async function recordSignal(signal) {
  await post('/demand-signals', {
    kind: String(signal?.kind || ''),
    localitySlug: trimmed(signal?.localitySlug),
    deal: trimmed(signal?.deal),
    bhk: trimmed(signal?.bhk),
    propertyId: trimmed(signal?.propertyId),
  }, { keepReads: true });
  return true;
}

const count = (v) => Number(v) || 0;

const toRow = (row) => ({
  localitySlug: row?.localitySlug ?? null,
  localityName: row?.localityName ?? null,
  supply: count(row?.supply),
  searches: count(row?.searches),
  alerts: count(row?.alerts),
  views: count(row?.views),
  repeatSeekers: count(row?.repeatSeekers),
  demand: count(row?.demand),
  demandPerListing: Number(row?.demandPerListing) || 0,
});

export async function supplyGap(opts = {}) {
  const rows = await get('/admin/supply-gap', opts?.days ? { days: opts.days } : undefined);
  return (Array.isArray(rows) ? rows : []).map(toRow);
}
