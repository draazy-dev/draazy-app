import { del, get, patch, post } from '../../http.js';

function toViewModel(row) {
  const filters = row?.filters && typeof row.filters === 'object' ? row.filters : {};
  return {
    ...filters,
    id: row.id,
    kind: row.kind || 'listings',
    name: row.name ?? undefined,
    query: row.query ?? '',
    criteria: row.criteria ?? undefined,
    label: row.label || row.name || '',
    alertFrequency: row.alertFrequency || 'daily',
    alerts: (row.alertFrequency || 'daily') !== 'off',
    channel: row.channel || 'whatsapp',
    newCount: row.newCount ?? undefined,
    matchCount: row.matchCount ?? 0,
    at: row.createdAt ? Date.parse(row.createdAt) : Date.now(),
  };
}

const TOP_LEVEL = new Set([
  'id', 'kind', 'name', 'query', 'criteria', 'label', 'mobile',
  'alertFrequency', 'alerts', 'channel', 'newCount', 'matchCount', 'at',
]);

function toCreateRequest(record = {}) {
  const filters = {};
  for (const [key, value] of Object.entries(record)) {
    if (!TOP_LEVEL.has(key) && value !== undefined) filters[key] = value;
  }
  const kind = record.kind || 'listings';
  return {
    kind,
    name: record.name || record.label,
    query: kind === 'flatmates' ? undefined : (record.query || record.label || ''),
    filters,
    criteria: record.criteria ?? (kind === 'flatmates' ? filters : undefined),
    alertFrequency: record.alertFrequency || (record.alerts === false ? 'off' : 'daily'),
    channel: record.channel || 'whatsapp',
  };
}

export async function listSavedSearches() {
  const rows = await get('/me/saved-searches');
  return (Array.isArray(rows) ? rows : []).map(toViewModel);
}

export async function createSavedSearch(record = {}) {
  if (record.mobile) {
    throw new Error(
      '[savedSearch] Anonymous lead capture is not supported by the API: POST /me/saved-searches is '
        + 'caller-scoped and takes no mobile. Needs a public demand-capture endpoint (D85).',
    );
  }
  return toViewModel(await post('/me/saved-searches', toCreateRequest(record)));
}

export async function updateSavedSearch(id, changes = {}) {
  return toViewModel(await patch(`/me/saved-searches/${encodeURIComponent(id)}`, changes));
}

export async function editSavedSearch(id, record = {}) {
  const { name, query, filters, alertFrequency } = toCreateRequest(record);
  return updateSavedSearch(id, { name, query, filters, alertFrequency });
}

export async function deleteSavedSearch(id) {
  await del(`/me/saved-searches/${encodeURIComponent(id)}`);
}
