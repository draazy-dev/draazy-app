import { get, post, unwrapPage } from '../../http.js';

// Only set filters are sent: an empty `q` or `source` would be a filter on the server, not "any".
const query = ({ source, status, q, days } = {}) => {
  const params = {};
  if (source) params.source = source;
  if (status) params.status = status;
  if (q) params.q = q;
  if (days) params.days = days;
  return params;
};

const toRow = (r) => ({
  id: r?.id ?? '',
  source: r?.source ?? '',
  errorType: r?.errorType ?? '',
  message: r?.message ?? '',
  path: r?.path ?? '',
  occurrences: r?.occurrences ?? 1,
  firstSeen: r?.firstSeen ?? null,
  lastSeen: r?.lastSeen ?? null,
  lastTraceId: r?.lastTraceId ?? null,
  resolvedAt: r?.resolvedAt ?? null,
});

export async function listErrorLog({ page = 0, size = 20, ...filter } = {}) {
  const res = await get('/admin/error-log', { ...query(filter), page, size });
  const unwrapped = unwrapPage(res, { page, size });
  return { ...unwrapped, items: (unwrapped.items || []).map(toRow) };
}

export async function getErrorLogEntry(id) {
  const r = await get(`/admin/error-log/${encodeURIComponent(id)}`);
  return {
    ...toRow(r),
    stack: r?.stack ?? '',
    httpMethod: r?.httpMethod ?? null,
    httpStatus: r?.httpStatus ?? null,
    build: r?.build ?? null,
    userRole: r?.userRole ?? null,
    lastUserId: r?.lastUserId ?? null,
    context: r?.context && typeof r.context === 'object' ? r.context : {},
    resolvedBy: r?.resolvedBy ?? null,
    level: r?.level ?? null,
    fingerprint: r?.fingerprint ?? null,
  };
}

export async function resolveErrorLogEntry(id) {
  await post(`/admin/error-log/${encodeURIComponent(id)}/resolve`);
}
