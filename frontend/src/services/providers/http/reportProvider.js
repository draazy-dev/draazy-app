import { ApiError, get, patch, post } from '../../http.js';
import { toReportCreate, toReportTriage, toViewModel, toViewModelPage } from './reportMapper.js';

const PAGE_SIZE = 10;

export async function createReport(report) {
  try {
    return toViewModel(await post('/reports', toReportCreate(report)));
  } catch (err) {
    if (err instanceof ApiError && err.status === 409) return 'duplicate';
    throw err;
  }
}

export async function listReports({
  status, reason, targetType, q, sinceDays, page = 0, size = PAGE_SIZE, counts = false,
} = {}) {
  const query = { page, size };
  if (status) query.status = status;
  if (reason) query.reason = reason;
  if (targetType) query.targetType = targetType;
  if (q) query.q = q;
  if (sinceDays) query.sinceDays = sinceDays;
  if (counts) query.counts = true;
  return toViewModelPage(await get('/reports', query), { page, size });
}

export async function triageReport(id, decision) {
  return toViewModel(await patch(`/reports/${encodeURIComponent(id)}`, toReportTriage(decision)));
}
