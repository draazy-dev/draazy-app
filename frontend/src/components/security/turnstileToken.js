export const BOT_CHECK_FAILED = 'bot_check_failed';
// Cloudflare honours a token for 300s; the margin covers clock drift and the request's own transit.
const TOKEN_TTL_MS = 270_000;
const TOKEN_WAIT_MS = 15_000;

export function createTokenSlot({ now = Date.now, ttlMs = TOKEN_TTL_MS, waitMs = TOKEN_WAIT_MS } = {}) {
  let token = null;
  let issuedAt = 0;
  let pendingSince = now();
  let waiter = null;

  const fresh = () => (token && now() - issuedAt < ttlMs ? token : null);

  return {
    put(tok) {
      pendingSince = null;
      token = null;
      if (!tok) return;
      if (waiter) {
        waiter(tok);
        return;
      }
      token = tok;
      issuedAt = now();
    },

    restarted() {
      token = null;
      pendingSince = now();
    },

    // A widget mid-challenge is left alone: remounting it would throw away a solve that is nearly done.
    needsRestart() {
      if (fresh()) return false;
      return pendingSince === null || now() - pendingSince >= waitMs;
    },

    take() {
      const tok = fresh();
      token = null;
      if (tok) return Promise.resolve(tok);
      waiter?.(null);
      return new Promise((resolve) => {
        const settle = (value) => {
          clearTimeout(timer);
          if (waiter === settle) waiter = null;
          resolve(value);
        };
        const timer = setTimeout(() => settle(null), waitMs);
        waiter = settle;
      });
    },
  };
}

export async function sendWithToken(spend, request) {
  const token = await spend();
  try {
    return await request(token);
  } catch (err) {
    if (!token || err?.code !== BOT_CHECK_FAILED) throw err;
    const again = await spend();
    if (!again) throw err;
    return request(again);
  }
}
