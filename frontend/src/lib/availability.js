const IST_OFFSET_MS = 330 * 60000;
const ISO = /^\d{4}-\d{2}-\d{2}$/;
const DAY_MS = 86400000;

export const istToday = () => new Date(Date.now() + IST_OFFSET_MS).toISOString().slice(0, 10);

export function addDaysIso(iso, days) {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export const daysUntil = (iso) => Math.round((Date.parse(`${iso}T00:00:00Z`) - Date.parse(`${istToday()}T00:00:00Z`)) / DAY_MS);

export const firstOfNextMonthIso = (iso) => {
  const [year, month] = iso.split('-').map(Number);
  return new Date(Date.UTC(year, month, 1)).toISOString().slice(0, 10);
};

/** Epoch ms where a "last N days" filter starts: IST midnight N-1 days back, so 1 is today, not the last 24h. */
export const istWindowStart = (days) => Date.parse(`${addDaysIso(istToday(), 1 - Number(days))}T00:00:00+05:30`);

export const MAX_AVAILABLE_DAYS = 365;
export const MAX_POSSESSION_DAYS = 5 * 365;

export const shortDate = (iso) => new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', timeZone: 'UTC' });
const BUCKET_KEY = { now: 'availability.now', 15: 'availability.in15', 30: 'availability.in30' };

/** "Available now" / "Available from 27 Oct" for a listing; old cached rows carry only the bucket. */
export function availabilityLabel(t, listing, { detail = false } = {}) {
  const on = listing?.availableOn || listing?.availableDate;
  if (ISO.test(on || '')) {
    const days = daysUntil(on);
    if (days <= 0) return t('availability.now');
    const from = t('availability.from', { date: shortDate(on) });
    return detail ? `${from} · ${t('availability.inDays', { count: days })}` : from;
  }
  const key = BUCKET_KEY[listing?.availableFrom];
  return key ? t(key) : '';
}
