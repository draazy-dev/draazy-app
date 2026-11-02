import { get, patch, post, put } from '../../http.js';

const base = (id) => `/admin/leads/${encodeURIComponent(id)}`;

const toLead = (dto) => (dto ? {
  ...dto,
  interests: dto.interests ?? [],
  sources: dto.sources ?? [],
  signals: dto.signals ?? [],
  activities: dto.activities ?? [],
  conversions: dto.conversions ?? [],
  profile: { ...dto.profile, propertyTypes: dto.profile?.propertyTypes ?? [], bhk: dto.profile?.bhk ?? [] },
} : null);

export async function listLeads({ view = 'mine', q, stage, type, page = 0, size = 20 } = {}) {
  const query = { view, page, size };
  if (q) query.q = q;
  if (stage) query.stage = stage;
  if (type) query.type = type;
  const res = await get('/admin/leads', query);
  const rows = Array.isArray(res?.content) ? res.content : [];
  return { items: rows.map(toLead), total: res?.totalElements ?? rows.length, counts: res?.counts ?? null };
}

export async function getLead(id) {
  return toLead(await get(base(id)));
}

export async function addLead(body) {
  const { data, status } = await post('/admin/leads', body, { withStatus: true });
  return { lead: toLead(data), existing: status === 200 };
}

export const claimLead = async (id) => toLead(await post(`${base(id)}/claim`));

export const releaseLead = async (id) => toLead(await post(`${base(id)}/release`));

export const assignLead = async (id, staffId) => toLead(await post(`${base(id)}/assign`, { staffId }));

export async function listLeadAssignees() {
  const rows = await get('/admin/leads/assignees');
  return Array.isArray(rows) ? rows : [];
}

export const logLeadContact = async (id, body) => toLead(await post(`${base(id)}/contacts`, body));

export const changeLeadStage = async (id, body) => toLead(await post(`${base(id)}/stage`, body));

export const setLeadInterests = async (id, interests) => toLead(await put(`${base(id)}/interests`, { interests }));

export const setLeadProfile = async (id, profile) => toLead(await put(`${base(id)}/profile`, profile));

export const addLeadNote = async (id, text) => toLead(await post(`${base(id)}/notes`, { body: text }));

export async function listConvertible(id) {
  const rows = await get(`${base(id)}/convertible`);
  return Array.isArray(rows) ? rows : [];
}

export const convertLead = async (id, serviceRequestId) => toLead(await post(`${base(id)}/conversions`, { serviceRequestId }));

export const creditConversion = (conversionId, creditedTo) =>
  patch(`/admin/leads/conversions/${encodeURIComponent(conversionId)}`, { creditedTo });

export async function getLeadPerformance(days = 30) {
  const res = await get('/admin/leads/performance', { days });
  return { days: res?.days ?? days, rows: res?.rows ?? [], totals: res?.totals ?? null };
}
