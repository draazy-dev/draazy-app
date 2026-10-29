export const AUTH_REASONS = [
  'save', 'contact', 'alerts', 'schedule', 'checkout', 'services', 'invite',
  'saved', 'notifications', 'messages', 'community', 'society', 'listproperty', 'dashboard',
  'review', 'offer', 'docs', 'photos', 'verify', 'default',
];

// Map a `next` path to a reason key. Order matters (most specific first).
function inferReason(next) {
  if (!next) return null;
  const p = String(next).toLowerCase();
  if (p.includes('deal=') && p.startsWith('/listings')) return 'alerts';
  if (p.startsWith('/checkout')) return 'checkout';
  if (p.startsWith('/services') || p.startsWith('/home-loans')) return 'services';
  if (p.startsWith('/schedule-visit')) return 'schedule';
  if (p.startsWith('/saved')) return 'saved';
  if (p.startsWith('/notifications')) return 'notifications';
  if (p.startsWith('/messages')) return 'messages';
  if (p.startsWith('/society')) return 'society';
  if (p.startsWith('/list-property')) return 'listproperty';
  if (p.startsWith('/dashboard')) return 'dashboard';
  return null;
}

export function resolveAuthIntent(params) {
  const explicit = params.get('reason');
  const key = (explicit && AUTH_REASONS.includes(explicit) && explicit) || inferReason(params.get('next')) || 'default';
  return {
    key,
    headingKey: `auth.intent.${key}Heading`,
    subKey: `auth.intent.${key}Sub`,
    isDefault: key === 'default',
  };
}

const AUTH_SCREENS = ['/signin', '/signup', '/staff-login', '/staff-invite'];
const SENTINEL_ORIGIN = 'https://draazy.invalid';
const isSingleSafePath = (path) =>
  path.startsWith('/')
  && !path.startsWith('//')
  && !path.includes('\\')
  && !/[\u0000-\u001F\u007F]/.test(path);

export function safeInAppPath(raw) {
  const next = raw || '';
  if (!isSingleSafePath(next)) return null;
  let path = next.split(/[?#]/)[0];
  try {
    while (path.includes('%')) {
      const decoded = decodeURIComponent(path);
      if (decoded === path) break;
      path = decoded;
    }
    const parsed = new URL(path, SENTINEL_ORIGIN);
    if (parsed.origin !== SENTINEL_ORIGIN) return null;
    path = parsed.pathname;
  } catch {
    return null;
  }
  if (!isSingleSafePath(path)) return null;
  path = path.replace(/\/+$/, '').toLowerCase() || '/';
  if (AUTH_SCREENS.includes(path)) return null;
  return next;
}

export function postAuthDest(params, fallback = '/dashboard') {
  return safeInAppPath(params.get('next')) || safeInAppPath(fallback) || '/dashboard';
}

export const gateReason = (reason) => (AUTH_REASONS.includes(reason) ? reason : 'default');
