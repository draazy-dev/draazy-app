const KEY = 'draazyUser';

function stores() {
  const out = [];
  try { if (typeof localStorage !== 'undefined') out.push(localStorage); } catch { }
  try { if (typeof sessionStorage !== 'undefined') out.push(sessionStorage); } catch { }
  return out;
}

export function readUser() {
  return readKeyed(KEY);
}

export function writeUser(user, remember = true) {
  writeKeyed(KEY, user, remember);
}

const TOKENS_KEY = 'draazyTokens';

// Memory only, so an XSS payload cannot lift the bearer token from storage;
// a reload re-mints it from the HttpOnly refresh cookie.
let tokens;
let remembered = false;

// Adopts, then deletes, a token stored by builds that persisted it (the e2e harness still seeds one this way).
function adoptStoredTokens() {
  tokens = null;
  for (const s of stores()) {
    try {
      const v = s.getItem(TOKENS_KEY);
      if (v && !tokens) {
        tokens = JSON.parse(v);
        remembered = s === localStorage;
      }
      s.removeItem(TOKENS_KEY);
    } catch { }
  }
}

export function readTokens() {
  if (tokens === undefined) adoptStoredTokens();
  return tokens;
}

export function writeTokens(next, remember = true) {
  readTokens();
  tokens = next || null;
  remembered = Boolean(next) && remember;
}

export const readAccessToken = () => readTokens()?.accessToken || null;

function tokensRemembered() {
  readTokens();
  return remembered;
}

// Sign-out in another tab clears the shared stored user; drop this tab's in-memory token with it.
globalThis.addEventListener?.('storage', (e) => {
  if (e.key === KEY && e.newValue == null && !readUser()) tokens = null;
});

const HINT_COOKIE = '__Host-draazy_session';
const HINT_COOKIE_INSECURE = 'draazy_session';
const HINT_REMEMBERED = '1';
const HINT_SESSION = '0';

function readHint() {
  try {
    const jar = document.cookie.split(';').map((c) => c.trim());
    for (const name of [HINT_COOKIE, HINT_COOKIE_INSECURE]) {
      const hits = jar.filter((c) => c.startsWith(`${name}=`));
      if (hits.length > 1) return null;
      if (hits.length === 0) continue;
      const value = hits[0].slice(name.length + 1);
      return value === HINT_REMEMBERED || value === HINT_SESSION ? value : null;
    }
    return null;
  } catch {
    return null;
  }
}

export function sessionHinted() {
  return readHint() !== null;
}

export function sessionRemembered() {
  const hint = readHint();
  if (hint !== null) return hint === HINT_REMEMBERED;
  return tokensRemembered();
}

let localWriteOk = false;

export function localStorageWritable() {
  if (localWriteOk) return true;
  const probe = `${TOKENS_KEY}__probe`;
  try {
    localStorage.setItem(probe, '1');
    localStorage.removeItem(probe);
    localWriteOk = true;
    return true;
  } catch {
    return false;
  }
}

function readKeyed(key) {
  for (const s of stores()) {
    try {
      const v = s.getItem(key);
      if (v) return JSON.parse(v);
    } catch { }
  }
  return null;
}

function writeKeyed(key, value, remember) {
  const primary = remember ? localStorage : sessionStorage;
  if (value) {
    try { primary.setItem(key, JSON.stringify(value)); } catch { }
    stores().forEach((s) => { if (s !== primary) { try { s.removeItem(key); } catch { } } });
  } else {
    stores().forEach((s) => { try { s.removeItem(key); } catch { } });
  }
}

export function logoutUser() {
  writeUser(null);
  writeTokens(null);
  clearSessionHint();
}

function clearSessionHint() {
  try {
    const secure = window.location.protocol === 'https:' ? '; Secure' : '';
    for (const name of [HINT_COOKIE, HINT_COOKIE_INSECURE]) {
      document.cookie = `${name}=; Max-Age=0; Path=/; SameSite=Lax${secure}`;
    }
  } catch { }
}

export const roleLabel = (r) => (r === 'owner' ? 'Owner' : r === 'admin' ? 'Admin' : r === 'manager' ? 'Manager' : r === 'staff' ? 'Staff' : 'Member');
export const isValidName = (name) => name.length >= 2 && name.length <= 80 && /^\p{L}[\p{L}\p{M} .'-]*$/u.test(name);
export const firstName = (u) => ((u && u.name) || '').trim().split(/\s+/)[0] || 'Account';
export const initial = (u) => (firstName(u)[0] || 'A').toUpperCase();
export const isInternal = (u) => !!u && (u.role === 'admin' || u.role === 'manager' || u.role === 'staff');
