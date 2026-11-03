import { headTags, renderPage } from '../scripts/seo-html.mjs';
import { OG_SIZE, pageOg } from '../src/lib/ogImages.js';
import { NOINDEX, SECURITY_HEADERS, SITE, fetchShell, htmlResponse } from './seo-pages.mjs';

// SPA-only routes people share: link previews read the server HTML, so each gets a card that says what was shared.
export const SHARE_PAGES = {
  'flatmates-room': ['A room to share in Pune | Draazy', 'A room is open in a shared flat in Pune. See the rent, the flatmates and message the host on Draazy.'],
  'flatmates-group': ['Flatmates wanted in Pune | Draazy', 'A group in Pune is looking for flatmates. See the flat and the rent split, and ask to join on Draazy.'],
  'flatmates-post': ['Looking for a flat share in Pune | Draazy', 'Someone is looking for a room or flatmates in Pune. Have a room? Reply to their post on Draazy.'],
  signup: ["You're invited to Draazy", 'Rent or buy homes in Pune straight from owners, with no brokerage. Sign up with this invite.'],
};

export function sharePage(shell, name, { pathname, site = SITE }) {
  const [title, description] = SHARE_PAGES[name];
  const head = headTags({
    title, description, url: `${site}${pathname}`, type: 'website',
    image: `${site}${pageOg(name)}`, imageAlt: title.split(' | ')[0], imageSize: OG_SIZE, extra: [NOINDEX],
  });
  return renderPage(shell, head, '');
}

// _headers rules (incl. the /flatmates/:kind/:id noindex) are not applied to Function responses.
export async function shareRoute({ request, env, name }) {
  const html = sharePage(await fetchShell(env, request), name, { pathname: new URL(request.url).pathname });
  return htmlResponse({ status: 200, html }, { ...SECURITY_HEADERS, 'X-Robots-Tag': 'noindex' });
}
