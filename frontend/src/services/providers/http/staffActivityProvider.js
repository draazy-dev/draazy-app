import { get, unwrapPage } from '../../http.js';

const query = ({ actor, entity, action, from, to, q } = {}) => {
  const params = {};
  if (actor) params.actor = actor;
  if (entity) params.entity = entity;
  if (action) params.action = action;
  if (from) params.from = from;
  if (to) params.to = to;
  if (q && q.trim()) params.q = q.trim();
  return params;
};

export async function listStaffActivity({ page = 0, size = 50, ...filter } = {}) {
  const res = await get('/admin/staff-activity', { ...query(filter), page, size });
  return unwrapPage(res, { page, size });
}

export async function getStaffActivitySummary(filter = {}) {
  const res = await get('/admin/staff-activity/summary', query(filter));
  return {
    total: res?.total ?? 0,
    staffCount: res?.staffCount ?? 0,
    byEntity: Array.isArray(res?.byEntity) ? res.byEntity : [],
    actions: Array.isArray(res?.actions) ? res.actions : [],
    leaderboard: Array.isArray(res?.leaderboard) ? res.leaderboard : [],
  };
}

const performancePage = (res, days) => ({
  windowDays: res?.windowDays ?? days,
  staff: Array.isArray(res?.staff) ? res.staff : [],
  queues: Array.isArray(res?.queues) ? res.queues : [],
});

export async function getTeamPerformance(days = 7) {
  return performancePage(await get('/admin/team-performance', { days }), days);
}

export async function getMyWork(days = 7) {
  return performancePage(await get('/admin/my-work', { days }), days);
}
