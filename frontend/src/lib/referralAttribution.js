const KEY = 'dz_ref';
const TTL_MS = 30 * 86400000;
const CODE = /^[A-Za-z0-9_-]{3,32}$/;

export const isReferralCode = (code) => CODE.test(code ?? '');

const read = () => {
  try {
    const row = JSON.parse(localStorage.getItem(KEY));
    return row && CODE.test(row.code) && Date.now() - row.at < TTL_MS ? row : null;
  } catch {
    return null;
  }
};

/** First touch wins: a stored, unexpired code is never replaced by a later link. */
export function captureReferral(search) {
  const code = new URLSearchParams(search).get('ref')?.trim();
  if (!isReferralCode(code) || read()) return;
  try {
    localStorage.setItem(KEY, JSON.stringify({ code, at: Date.now() }));
  } catch { /* storage unavailable: signup still reads ?ref */ }
}

export const storedReferral = () => read()?.code || '';

export function clearReferral() {
  try {
    localStorage.removeItem(KEY);
  } catch { /* nothing to clear */ }
}