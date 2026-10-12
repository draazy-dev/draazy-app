// The app judges availability against the Indian calendar day, so specs must too.
const IST_OFFSET_MS = 330 * 60000;

export const istInDays = (days = 0) => new Date(Date.now() + IST_OFFSET_MS + days * 86400000).toISOString().slice(0, 10);

export const istToday = () => istInDays(0);

export const displayDate = (iso) => iso.split('-').reverse().join('/');

// "27 Oct" — the same formula as the app's availability label.
export const shortLabel = (iso) => new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', timeZone: 'UTC' });