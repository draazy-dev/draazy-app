import assert from 'node:assert/strict';
import { onRequestGet as flatmateDetail } from '../functions/flatmates/[kind]/[id].js';
import { onRequestGet as signup } from '../functions/signup.js';
import { SHARE_PAGES, sharePage } from './share-pages.mjs';
import { NOINDEX } from './seo-pages.mjs';

const SHELL = `<!doctype html><html><head><title>Draazy</title>
  <meta name="description" content="shell" />
  <meta property="og:image" content="https://draazy.com/og-image.jpg" />
  </head><body><div id="root"></div></body></html>`;
const env = { ASSETS: { fetch: async () => new Response(SHELL) } };
const get = (fn, path, params = {}) => fn({ request: new Request(`https://draazy.com${path}`), env, params, next: () => 'next' });

for (const name of Object.keys(SHARE_PAGES)) {
  const html = sharePage(SHELL, name, { pathname: '/x' });
  assert.equal(html.match(/og:image" /g).length, 1, `${name}: shell card replaced, not duplicated`);
  assert.ok(html.includes(NOINDEX));
  assert.ok(html.includes(`<meta property="og:image" content="https://draazy.com/og/page/${name}.jpg" />`));
}

const room = await get(flatmateDetail, '/flatmates/room/r1', { kind: 'room', id: 'r1' });
assert.equal(room.status, 200);
assert.equal(room.headers.get('X-Robots-Tag'), 'noindex', 'replaces the _headers rule Functions bypass');
assert.ok(room.headers.get('Content-Security-Policy'));
const roomHtml = await room.text();
assert.ok(roomHtml.includes('<title data-shell="Draazy">A room to share in Pune | Draazy</title>'));
assert.ok(roomHtml.includes('<link data-shell="" rel="canonical" href="https://draazy.com/flatmates/room/r1" />'));
assert.ok(roomHtml.includes('content="https://draazy.com/og/page/flatmates-room.jpg"'));
assert.ok((await (await get(flatmateDetail, '/flatmates/post/p1', { kind: 'post', id: 'p1' })).text()).includes('/og/page/flatmates-post.jpg'));
assert.equal(get(flatmateDetail, '/flatmates/zzz/1', { kind: 'zzz', id: '1' }), 'next', 'unknown kinds fall through to the SPA');

const invite = await (await get(signup, '/signup?ref=ABC123')).text();
assert.ok(invite.includes('content="https://draazy.com/og/page/signup.jpg"'));
assert.ok(invite.includes('href="https://draazy.com/signup"'), 'the referral code stays out of the canonical');

console.log('share-pages ok');
