
import { get, unwrapPage } from '../../http.js';

const query = ({ actor, entity, entityId, from, to } = {}) => {
  const params = {};
  if (actor) params.actor = actor;
  if (entity) params.entity = entity;
  if (entityId) params.entityId = entityId;
  if (from) params.from = from;
  if (to) params.to = to;
  return params;
};

const toEntry = (r) => ({
  id: r?.id ?? '',
  actor: r?.actor ?? '',
  actorName: r?.actorName || r?.actor || '',
  actorRole: r?.actorRole ?? '',
  action: r?.action ?? '',
  entity: r?.entity ?? '',
  entityId: r?.entityId ?? null,
  checker: r?.checker ?? null,
  at: r?.at ?? null,
  metadata: r?.metadata && typeof r.metadata === 'object' ? r.metadata : {},
});

export async function listAuditLog({ page = 0, size = 50, ...filter } = {}) {
  const res = await get('/admin/audit-log', { ...query(filter), page, size });
  const unwrapped = unwrapPage(res, { page, size });
  return { ...unwrapped, items: (unwrapped.items || []).map(toEntry) };
}
