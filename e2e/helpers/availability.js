// The app judges availability against the Indian calendar day, so specs must too.
const IST_OFFSET_MS = 330 * 60000;

export const istInDays = (days = 0) => new Date(Date.now() + IST_OFFSET_MS + days * 86400000).toISOString().slice(0, 10);

export const istToday = () => istInDays(0);

export const istFirstOfNextMonth = () => {
  const [year, month] = istToday().split('-').map(Number);
  return new Date(Date.UTC(year, month, 1)).toISOString().slice(0, 10);
};

// Mirrors the server's AvailableOn.bucketOf, so a chip whose distance varies by day still has a fixed expectation.
export const bucketOf = (iso) => (iso <= istToday() ? 'now' : iso <= istInDays(15) ? '15' : iso <= istInDays(30) ? '30' : null);

export const displayDate = (iso) => iso.split('-').reverse().join('/');

// "27 Oct" — the same formula as the app's availability label.
export const shortLabel = (iso) => new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', timeZone: 'UTC' });