const KEY = 'dz_did';
const VALID = /^[A-Za-z0-9-]{8,64}$/;
let memory = null;

const mint = () => globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`;

/** First-party, random and device-local; the server compares it across accounts to spot self-referral. */
export function deviceId() {
  try {
    let id = localStorage.getItem(KEY);
    if (!VALID.test(id ?? '')) {
      id = mint();
      localStorage.setItem(KEY, id);
    }
    return id;
  } catch {
    memory ??= mint();
    return memory;
  }
}