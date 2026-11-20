export function fyStart(d = new Date()) {
  return d.getMonth() >= 3 ? new Date(d.getFullYear(), 3, 1) : new Date(d.getFullYear() - 1, 3, 1);
}
export function fyLabel(d = new Date()) {
  const s = fyStart(d);
  const y = s.getFullYear();
  return `FY ${y}–${String(y + 1).slice(-2)}`;
}

function monthToDate(m) {
  const [y, mm] = String(m || '').split('-');
  return new Date(Number(y), Number(mm) - 1, 1);
}

export function hraExemption({ annualRent = 0, annualBasic = 0, metro = false, slabRate = 0.2 }) {
  const pct = metro ? 0.5 : 0.4;
  const limitRent = Math.max(0, annualRent - 0.1 * annualBasic);
  const limitPct = pct * annualBasic;
  const exemption = annualBasic > 0 ? Math.max(0, Math.round(Math.min(limitRent, limitPct))) : 0;
  const taxSaved = Math.round(exemption * slabRate);
  return { exemption, taxSaved, limitRent: Math.round(limitRent), limitPct: Math.round(limitPct), pct };
}

export function depositInfo(rental, liquidRate = 0.065) {
  const deposit = Number(rental?.deposit) || 0;
  const start = rental?.leaseStart ? monthToDate(rental.leaseStart) : null;
  const now = new Date();
  const monthsLocked = start ? Math.max(0, (now.getFullYear() - start.getFullYear()) * 12 + (now.getMonth() - start.getMonth())) : 0;
  const refundDate = rental?.leaseEnd ? monthToDate(rental.leaseEnd) : null;
  const foregoneAnnual = Math.round(deposit * liquidRate);
  return { deposit, monthsLocked, refundDate, foregoneAnnual };
}
