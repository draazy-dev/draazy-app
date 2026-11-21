// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import { onRequestGet as flatmateDetail } from '../../../functions/flatmates/[kind]/[id].js';
import { onRequestGet as signup } from '../../../functions/signup.js';
import { SHARE_PAGES, sharePage, shareRoute } from '../../../edge/share-pages.mjs';
import { NOINDEX, SECURITY_HEADERS } from '../../../edge/seo-pages.mjs';

const SHELL = `<!doctype html><html><head><title>Draazy</title>
  <meta name="description" content="shell" />
  <meta property="og:image" content="https://draazy.com/og-image.jpg" />
  </head><body><div id="root"></div></body></html>`;
const env = { ASSETS: { fetch: async () => new Response(SHELL) } };
const get = (fn, path, params = {}, next = () => 'next') => fn({ request: new Request(`https://draazy.com${path}`), env, params, next });

describe('sharePage', () => {
  it.each(Object.keys(SHARE_PAGES))('%s replaces the shell card instead of duplicating it', (name) => {
    const html = sharePage(SHELL, name, { pathname: '/x' });
    expect(html.match(/og:image" /g)).toHaveLength(1);
    expect(html).toContain(NOINDEX);
    expect(html).toContain(`<meta property="og:image" content="https://draazy.com/og/page/${name}.jpg" />`);
    expect(html).toContain('<link data-shell="" rel="canonical" href="https://draazy.com/x" />');
  });

  it('uses the first half of the title as the image alt', () => {
    expect(sharePage(SHELL, 'signup', { pathname: '/signup' })).toContain('<meta property="og:image:alt" content="You\'re invited to Draazy" />');
  });

  it('honours a custom site', () => {
    expect(sharePage(SHELL, 'flatmates-room', { pathname: '/p', site: 'https://x.test' })).toContain('href="https://x.test/p"');
  });
});

describe('shareRoute', () => {
  it('returns noindex html with security headers', async () => {
    const res = await shareRoute({ request: new Request('https://draazy.com/signup?ref=1'), env, name: 'signup' });
    expect(res.status).toBe(200);
    expect(res.headers.get('X-Robots-Tag')).toBe('noindex');
    expect(res.headers.get('Content-Security-Policy')).toBe(SECURITY_HEADERS['Content-Security-Policy']);
  });

  it('throws for an unknown share page name', async () => {
    await expect(shareRoute({ request: new Request('https://draazy.com/x'), env, name: 'nope' })).rejects.toThrow();
  });
});

describe('share route handlers', () => {
  it('flatmates detail pages carry the room card and noindex', async () => {
    const room = await get(flatmateDetail, '/flatmates/room/r1', { kind: 'room', id: 'r1' });
    expect(room.status).toBe(200);
    expect(room.headers.get('X-Robots-Tag')).toBe('noindex');
    const html = await room.text();
    expect(html).toContain('<title data-shell="Draazy">A room to share in Pune | Draazy</title>');
    expect(html).toContain('<link data-shell="" rel="canonical" href="https://draazy.com/flatmates/room/r1" />');
    expect(html).toContain('content="https://draazy.com/og/page/flatmates-room.jpg"');
  });

  it('serves the post and group cards', async () => {
    expect(await (await get(flatmateDetail, '/flatmates/post/p1', { kind: 'post', id: 'p1' })).text()).toContain('/og/page/flatmates-post.jpg');
    expect(await (await get(flatmateDetail, '/flatmates/group/g1', { kind: 'group', id: 'g1' })).text()).toContain('/og/page/flatmates-group.jpg');
  });

  it('unknown kinds fall through to the SPA', () => {
    const next = vi.fn(() => 'next');
    expect(get(flatmateDetail, '/flatmates/zzz/1', { kind: 'zzz', id: '1' }, next)).toBe('next');
    expect(next).toHaveBeenCalledTimes(1);
  });

  it('the signup invite keeps the referral code out of the canonical', async () => {
    const invite = await (await get(signup, '/signup?ref=ABC123')).text();
    expect(invite).toContain('content="https://draazy.com/og/page/signup.jpg"');
    expect(invite).toContain('href="https://draazy.com/signup"');
    expect(invite).not.toContain('ABC123');
  });
});
