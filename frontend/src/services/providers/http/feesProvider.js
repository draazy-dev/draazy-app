import { PUBLIC_READ_TTL, get } from '../../http.js';

const money = (v) => Number(v) || 0;

const toFeeBreakdown = (row) => ({
  deal: String(row?.deal || ''),
  brokerage: money(row?.brokerage),
  platformFee: money(row?.platformFee),
  stampDuty: row?.stampDuty == null ? null : money(row.stampDuty),
  registration: row?.registration == null ? null : money(row.registration),
  notes: row?.notes || null,
});

export async function listFees() {
  const rows = await get('/fees', null, { auth: false, ttl: PUBLIC_READ_TTL });
  return (Array.isArray(rows) ? rows : []).map(toFeeBreakdown);
}
