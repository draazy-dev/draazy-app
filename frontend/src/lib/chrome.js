const SELF_PADDED = ['/', '/listings', '/property', '/signin', '/signup', '/staff-login', '/staff-invite'];

const FULL_BLEED = ['/reels'];

const CHAT = ['/messages'];

const AUTH = ['/signin', '/signup', '/staff-login', '/staff-invite'];

const matches = (path, routes) =>
  routes.some((r) => (r === '/' ? path === '/' : path.startsWith(r)));

export function chromeFor(pathname) {
  const path = (pathname || '/').toLowerCase();

  const fullBleed = matches(path, FULL_BLEED);
  const chatRoute = matches(path, CHAT);
  const authRoute = matches(path, AUTH);

  return {
    selfPadded: matches(path, SELF_PADDED),
    fullBleed,
    chatRoute,
    authRoute,
    showBottomNav: !authRoute,
    showFooter: !fullBleed,
    showAssistant: !fullBleed,
  };
}

export const TOPBAR_SCROLL = { hideAfter: 96, delta: 6 };
