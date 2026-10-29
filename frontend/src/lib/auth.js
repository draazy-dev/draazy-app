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

export function readTokens() {
  return readKeyed(TOKENS_KEY);
}

export function writeTokens(tokens, remember = true) {
  writeKeyed(TOKENS_KEY, tokens, remember);
}

export const readAccessToken = () => readTokens()?.accessToken || null;

function tokensRemembered() {
  try {
    return localStorage.getItem(TOKENS_KEY) != null;
  } catch {
    return false;
  }
}

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
