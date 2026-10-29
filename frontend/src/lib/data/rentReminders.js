const IST = 'Asia/Kolkata';

function istParts(d = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: IST, year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(d);
  const at = (type) => Number(parts.find((p) => p.type === type)?.value);
  return { year: at('year'), month: at('month'), day: at('day') };
}

export function ymKey(d = new Date()) {
  const { year, month } = istParts(d);
  return year + '-' + ('0' + month).slice(-2);
}
export function ymLabel(ym, locale = 'en') {
  const [y, m] = ym.split('-');
  const month = new Intl.DateTimeFormat(locale, { month: 'short' }).format(new Date(Number(y), (Number(m) || 1) - 1, 1));
  return `${month} ${y}`;
}

export function currentDueStatus(prop, locale = 'en') {
  const { year, month, day } = istParts();
  const ym = year + '-' + ('0' + month).slice(-2);
  const dueDay = Math.min(28, Math.max(1, Number(prop.dueDay) || 5));
  return {
    ym,
    label: ymLabel(ym, locale),
    overdue: day > dueDay,
    dueDay,
  };
}

export function recentMonths(n = 6, locale = 'en') {
  const { year, month } = istParts();
  const out = [];
  for (let i = 0; i < n; i++) {
    const d = new Date(year, month - 1 - i, 1);
    const ym = d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2);
    out.push({ ym, label: ymLabel(ym, locale) });
  }
  return out;
}
