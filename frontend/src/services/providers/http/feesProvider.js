// `GET /fees` (public): a bare JSON array of the contract's `Fees` schema, one row per deal intent.
import { get } from '../../http.js';

// A money field arriving as a string would turn the sidebar's addition into concatenation.
const money = (v) => Number(v) || 0;

// stampDuty and registration stay null when unpublished: 0 would quote ₹0 for a line the server still charges.
const toFeeBreakdown = (row) => ({
  deal: String(row?.deal || ''),
  brokerage: money(row?.brokerage),
  platformFee: money(row?.platformFee),
  stampDuty: row?.stampDuty == null ? null : money(row.stampDuty),
  registration: row?.registration == null ? null : money(row.registration),
  notes: row?.notes || null,
});

/** Every published fee breakdown. Public — no token, no session short-circuit. */
export async function listFees() {
  const rows = await get('/fees');
  return (Array.isArray(rows) ? rows : []).map(toFeeBreakdown);
}
