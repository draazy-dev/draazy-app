const KEY = 'draazyKycFunnel';
const MAX = 200;

// Defence-in-depth: the funnel must stay free of PII, so strip anything PII-shaped from `extra`.
const PII_KEYS = /(mobile|phone|aadhaar|otp|name|email|token|address|dob)/i;
function sanitize(extra) {
  const out = {};
  for (const [k, v] of Object.entries(extra || {})) {
    if (!PII_KEYS.test(k)) out[k] = v;
  }
  return out;
}

export function trackKyc(event, source = 'unknown', extra = {}) {
  const safeExtra = sanitize(extra);
  const entry = { event, source, at: Date.now(), ...safeExtra };
  try {
    // eslint-disable-next-line no-console
    console.debug('[kyc-funnel]', event, source, safeExtra);
    const buf = JSON.parse(localStorage.getItem(KEY) || '[]');
    buf.push(entry);
    localStorage.setItem(KEY, JSON.stringify(buf.slice(-MAX)));
  } catch { }
}
