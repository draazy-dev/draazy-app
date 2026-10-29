// `checkout()` resolving means the modal closed, not that money moved: only the verified webhook
// activates a subscription, so callers must re-read `/me/subscription`.
const MODE = import.meta.env.VITE_CASHFREE_MODE || 'sandbox';

let sdkPromise = null;

function loadSdk() {
  if (!sdkPromise) {
    sdkPromise = import('@cashfreepayments/cashfree-js')
      .then(({ load }) => load({ mode: MODE }))
      .catch((err) => { sdkPromise = null; throw err; });
  }
  return sdkPromise;
}

export async function openCashfreeCheckout(paymentSessionId) {
  if (String(paymentSessionId ?? '').startsWith('mock_session_')) return { mock: true };
  const cashfree = await loadSdk();
  return cashfree.checkout({ paymentSessionId, redirectTarget: '_modal' });
}
