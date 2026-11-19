// Cashfree sends its bank/OTP popup to our return_url too, so a return page must tell that popup apart
// from the paying tab itself being redirected: only the paying tab unloads mid-checkout (pagehide marker).
const OPEN_KEY = 'dz_pay_open';
const REDIRECTED_KEY = 'dz_pay_redirected';
const OPEN_TTL_MS = 30 * 60_000;

const quietly = (fn) => { try { return fn(); } catch { return null; } };

export function trackCheckout() {
  quietly(() => sessionStorage.removeItem(REDIRECTED_KEY));
  quietly(() => localStorage.setItem(OPEN_KEY, String(Date.now())));
  const markRedirect = () => quietly(() => sessionStorage.setItem(REDIRECTED_KEY, '1'));
  window.addEventListener('pagehide', markRedirect);
  return () => window.removeEventListener('pagehide', markRedirect);
}

export function isGatewayPopupReturn() {
  if (!new URLSearchParams(window.location.search).has('order_id')) return false;
  if (quietly(() => sessionStorage.getItem(REDIRECTED_KEY)) === '1') {
    quietly(() => sessionStorage.removeItem(REDIRECTED_KEY));
    quietly(() => localStorage.removeItem(OPEN_KEY));
    return false;
  }
  const openedAt = Number(quietly(() => localStorage.getItem(OPEN_KEY)));
  return openedAt > 0 && Date.now() - openedAt < OPEN_TTL_MS;
}

export function continueInThisWindow() {
  quietly(() => sessionStorage.setItem(REDIRECTED_KEY, '1'));
  window.location.reload();
}
